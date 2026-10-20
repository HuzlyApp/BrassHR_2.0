import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase-env";
import {
  readOnboardingTenantSlugFromRequest,
  resolveOnboardingWorker,
} from "@/lib/onboarding/resolve-onboarding-worker";
import { loadTenantOnboardingConfig, type OnboardingDbClient } from "@/lib/onboarding/load-tenant-config";
import { loadApplicantConfigForJobToken } from "@/lib/onboarding/load-config-for-job-workflow";
import { normalizeJobToken } from "@/lib/jobs/public-application-routing";
import { resolveOnboardingProgressStep } from "@/lib/onboarding/resolve-onboarding-progress-step";
import { resolveApplicationWorkflowPhase } from "@/lib/onboarding/resolve-application-workflow-phase";
import { isPreviewOnboardingStepId } from "@/lib/onboarding/load-applicant-draft-config";
import {
  applicantMayActOnStep,
  isPlacementAcceptedStatus,
  readStepLifecyclePhase,
} from "@/lib/onboarding/workflow-phase";
import {
  maskAccountNumber,
  postHireScreenKindForStep,
  validateDirectDepositInput,
} from "@/lib/onboarding/post-hire-step-screens";
import { encryptField, FieldEncryptionUnavailableError } from "@/lib/security/field-encryption";
import { enforceRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { formatApiError } from "@/lib/api/format-api-error";
import type { TenantOnboardingConfig, TenantOnboardingStep } from "@/lib/onboarding/types";

export const runtime = "nodejs";

type Body = {
  applicantId?: unknown;
  tenantSlug?: unknown;
  jobToken?: unknown;
  applicationId?: unknown;
  stepKey?: unknown;
  accountHolderName?: unknown;
  bankName?: unknown;
  accountType?: unknown;
  routingNumber?: unknown;
  accountNumber?: unknown;
};

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function findStep(
  supabase: OnboardingDbClient,
  tenantId: string,
  tenantSlug: string,
  jobToken: string | null,
  stepKey: string
): Promise<TenantOnboardingStep | null> {
  let config: TenantOnboardingConfig | null = await loadTenantOnboardingConfig(supabase, tenantId, {
    workerFacing: true,
  });
  let step = resolveOnboardingProgressStep(config, { stepKey });
  if (!step && jobToken) {
    try {
      config = (await loadApplicantConfigForJobToken(supabase, tenantSlug || null, jobToken)).config;
      step = resolveOnboardingProgressStep(config, { stepKey });
    } catch {
      // Stale job token: fall through to the uncached tenant config.
    }
  }
  if (!step) {
    config = await loadTenantOnboardingConfig(supabase, tenantId, { workerFacing: true, bypassCache: true });
    step = resolveOnboardingProgressStep(config, { stepKey });
  }
  return step;
}

export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, {
      namespace: "onboarding-direct-deposit",
      key: getClientIp(req),
      limit: Number(process.env.RATE_LIMIT_DIRECT_DEPOSIT_PER_HOUR ?? 10),
      windowMs: 60 * 60 * 1000,
      failClosed: false,
    });
    if (limited) return limited;

    const body = (await req.json().catch(() => ({}))) as Body;
    const applicantId = str(body.applicantId);
    const stepKey = str(body.stepKey);
    if (!applicantId || !stepKey) {
      return NextResponse.json({ error: "Missing applicant or step" }, { status: 400 });
    }

    const validation = validateDirectDepositInput(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const url = getSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
    }
    const supabase = createClient(url, key);

    const tenantSlug = str(body.tenantSlug).toLowerCase() || readOnboardingTenantSlugFromRequest(req) || "";
    const ctx = await resolveOnboardingWorker(supabase, applicantId, tenantSlug);
    if (!ctx) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    const jobToken = normalizeJobToken(str(body.jobToken) || null);
    const phaseRecord = await resolveApplicationWorkflowPhase(supabase, {
      tenantId: ctx.tenantId,
      workerId: ctx.workerId,
      applicationId: str(body.applicationId) || null,
      jobToken,
    });

    const step = await findStep(supabase, ctx.tenantId, tenantSlug, jobToken, stepKey);
    if (!step || postHireScreenKindForStep(step) !== "direct_deposit") {
      return NextResponse.json({ error: "Direct deposit step not found" }, { status: 404 });
    }
    if (
      !applicantMayActOnStep({
        activePhase: phaseRecord?.phase ?? "pre_hire",
        stepPhase: readStepLifecyclePhase(step),
        isHired: isPlacementAcceptedStatus(phaseRecord?.status),
        postHireSuspended: Boolean(phaseRecord?.postHireSuspendedAt),
      })
    ) {
      return NextResponse.json(
        { error: "This step is not part of your current application phase.", code: "PHASE_FORBIDDEN" },
        { status: 403 }
      );
    }

    const input = validation.value;
    let accountNumberEncrypted: string;
    try {
      accountNumberEncrypted = encryptField(input.accountNumber);
    } catch (err) {
      if (err instanceof FieldEncryptionUnavailableError) {
        console.error("[onboarding/direct-deposit]", err.message);
        return NextResponse.json(
          { error: "Direct deposit can't be saved right now. Please contact HR.", code: "ENCRYPTION_UNAVAILABLE" },
          { status: 503 }
        );
      }
      throw err;
    }

    const accountLast4 = input.accountNumber.slice(-4);
    const { error } = await supabase.from("worker_direct_deposit_accounts").upsert(
      {
        tenant_id: ctx.tenantId,
        worker_id: ctx.workerId,
        application_id: phaseRecord?.applicationId ?? null,
        onboarding_step_id: isPreviewOnboardingStepId(step.id) ? null : step.id,
        account_holder_name: input.accountHolderName,
        bank_name: input.bankName,
        account_type: input.accountType,
        routing_number: input.routingNumber,
        account_number_encrypted: accountNumberEncrypted,
        account_last4: accountLast4,
      },
      { onConflict: "tenant_id,worker_id" }
    );
    if (error) throw error;

    return NextResponse.json({
      summary: {
        accountHolderName: input.accountHolderName,
        bankName: input.bankName,
        accountType: input.accountType,
        routingNumberMasked: maskAccountNumber(input.routingNumber),
        accountNumberMasked: maskAccountNumber(input.accountNumber),
      },
    });
  } catch (err: unknown) {
    console.error("[onboarding/direct-deposit]", err);
    return NextResponse.json({ error: formatApiError(err) }, { status: 500 });
  }
}
