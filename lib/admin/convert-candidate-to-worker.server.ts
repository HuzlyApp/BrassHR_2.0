import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildEmploymentWorkerRow,
  isCandidateAlreadyConverted,
  isCandidateEligibleForConversion,
  normalizeCandidateStatus,
  type CandidateConversionSnapshot,
  type ConvertWorkerType,
} from "@/lib/admin/convert-candidate-to-worker";
import { collectEmploymentWorkerTransferSnapshot } from "@/lib/admin/employment-worker-transfer";
import { changeApplicationStatusBySystemKey } from "@/lib/jobs/application-statuses/service";
import { activatePostHire } from "@/lib/onboarding/activate-post-hire";

export type ConvertCandidateResult =
  | {
      ok: true;
      workerRecordId: string;
      candidateId: string;
      workerType: ConvertWorkerType;
      created: boolean;
      profilePath: string;
      sourceJobApplicationId: string | null;
      postHire: {
        attempted: boolean;
        activated: boolean;
        warning: string | null;
        applicationId: string | null;
      };
    }
  | { ok: false; error: string; status: number; code?: string };

type RpcPayload = {
  ok?: boolean;
  created?: boolean;
  workerRecordId?: string;
  candidateId?: string;
  workerType?: string;
  sourceJobApplicationId?: string | null;
  convertedAt?: string;
  error?: string;
  code?: string;
  status?: string;
};

async function loadCandidate(
  supabase: SupabaseClient,
  candidateId: string
): Promise<CandidateConversionSnapshot | null> {
  const { data, error } = await supabase
    .from("worker")
    .select(
      "id, tenant_id, first_name, last_name, email, phone, job_role, city, state, profile_photo, status, converted_worker_type, converted_at"
    )
    .eq("id", candidateId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id || !data.tenant_id) return null;

  return {
    id: String(data.id),
    tenant_id: String(data.tenant_id),
    first_name: data.first_name ?? null,
    last_name: data.last_name ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    job_role: data.job_role ?? null,
    city: data.city ?? null,
    state: data.state ?? null,
    profile_photo: data.profile_photo ?? null,
    status: data.status ?? null,
    converted_worker_type: data.converted_worker_type ?? null,
    converted_at: data.converted_at ?? null,
  };
}

async function resolveSourceApplicationId(
  supabase: SupabaseClient,
  tenantId: string,
  candidateId: string,
  preferredId?: string | null
): Promise<string | null> {
  if (preferredId) return preferredId;
  const { data, error } = await supabase
    .from("job_applications")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("worker_id", candidateId)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && !/column|does not exist/i.test(error.message)) throw error;
  return data?.id ? String(data.id) : null;
}

async function activatePostHireForConversion(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    candidateId: string;
    applicationId: string | null;
    actorUserId: string | null;
    origin?: string | null;
  }
): Promise<{
  attempted: boolean;
  activated: boolean;
  warning: string | null;
  applicationId: string | null;
}> {
  if (!input.applicationId) {
    return {
      attempted: false,
      activated: false,
      warning: "No linked job application found for Post-Hire activation.",
      applicationId: null,
    };
  }

  try {
    await changeApplicationStatusBySystemKey(supabase, {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      systemKey: "hired",
      changedByUserId: input.actorUserId,
      note: "Candidate approved as worker",
      origin: input.origin ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not mark application hired";
    // Still attempt activate_post_hire in case status was already hired / mapping differs.
    console.warn("[convert-candidate] hired status update", message);
  }

  try {
    const postHire = await activatePostHire(supabase, {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      actorUserId: input.actorUserId,
      origin: input.origin ?? null,
      sendEmail: Boolean(input.origin),
    });
    if (postHire.skipped && postHire.skipReason && postHire.skipReason !== "NOT_ACCEPTED") {
      return {
        attempted: true,
        activated: postHire.activated || postHire.alreadyActive,
        warning:
          postHire.activated || postHire.alreadyActive
            ? null
            : `Post-Hire was not activated (${postHire.skipReason}). Worker was still created.`,
        applicationId: input.applicationId,
      };
    }
    return {
      attempted: true,
      activated: postHire.activated || postHire.alreadyActive,
      warning:
        postHire.activated || postHire.alreadyActive
          ? null
          : postHire.skipReason
            ? `Post-Hire was not activated (${postHire.skipReason}). Worker was still created.`
            : null,
      applicationId: input.applicationId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Post-Hire activation failed";
    return {
      attempted: true,
      activated: false,
      warning: `${message}. Worker was still created.`,
      applicationId: input.applicationId,
    };
  }
}

async function convertViaFallback(
  supabase: SupabaseClient,
  candidate: CandidateConversionSnapshot,
  workerType: ConvertWorkerType,
  sourceJobApplicationId: string | null
): Promise<ConvertCandidateResult> {
  const { data: existing, error: existingErr } = await supabase
    .from("workers")
    .select("id, worker_type, source_job_application_id")
    .eq("candidate_id", candidate.id)
    .maybeSingle();
  if (existingErr) throw existingErr;

  if (existing?.id) {
    const convertedAt = new Date().toISOString();
    const linkedAppId =
      (existing.source_job_application_id as string | null) ?? sourceJobApplicationId;
    const transfer = await collectEmploymentWorkerTransferSnapshot(supabase, {
      tenantId: candidate.tenant_id,
      candidateId: candidate.id,
      sourceJobApplicationId: linkedAppId,
      profilePhoto: candidate.profile_photo,
    });
    await supabase
      .from("worker")
      .update({
        status: "converted",
        converted_worker_type: existing.worker_type ?? workerType,
        converted_at: candidate.converted_at ?? convertedAt,
        updated_at: convertedAt,
      })
      .eq("id", candidate.id)
      .eq("tenant_id", candidate.tenant_id);

    await supabase
      .from("workers")
      .update({
        profile_photo: transfer.profilePhoto,
        source_job_application_id: linkedAppId,
        application_snapshot: transfer.applicationSnapshot,
        documents_manifest: transfer.documentsManifest,
        updated_at: convertedAt,
      })
      .eq("id", existing.id);

    return {
      ok: true,
      workerRecordId: String(existing.id),
      candidateId: candidate.id,
      workerType: (existing.worker_type as ConvertWorkerType) || workerType,
      created: false,
      profilePath: `/admin_recruiter/workers/${candidate.id}/profile`,
      sourceJobApplicationId: linkedAppId,
      postHire: {
        attempted: false,
        activated: false,
        warning: null,
        applicationId: null,
      },
    };
  }

  if (isCandidateAlreadyConverted(candidate)) {
    return {
      ok: false,
      error: "This candidate has already been converted.",
      status: 409,
      code: "ALREADY_CONVERTED",
    };
  }

  if (!isCandidateEligibleForConversion(candidate)) {
    return {
      ok: false,
      error: "Only for-approval or approved candidates can be converted to workers.",
      status: 400,
      code: "INELIGIBLE_STATUS",
    };
  }

  const convertedAt = new Date().toISOString();
  const transfer = await collectEmploymentWorkerTransferSnapshot(supabase, {
    tenantId: candidate.tenant_id,
    candidateId: candidate.id,
    sourceJobApplicationId,
    profilePhoto: candidate.profile_photo,
  });
  const employmentRow = buildEmploymentWorkerRow(candidate, workerType, convertedAt, {
    sourceJobApplicationId,
    applicationSnapshot: transfer.applicationSnapshot as Record<string, unknown>,
    documentsManifest: transfer.documentsManifest,
  });

  const { data: inserted, error: insertErr } = await supabase
    .from("workers")
    .insert(employmentRow)
    .select("id")
    .maybeSingle();

  if (insertErr) throw insertErr;
  if (!inserted?.id) {
    return { ok: false, error: "Failed to create worker record", status: 500 };
  }

  const { error: candidateUpdateErr } = await supabase
    .from("worker")
    .update({
      status: "converted",
      converted_worker_type: workerType,
      converted_at: convertedAt,
      updated_at: convertedAt,
    })
    .eq("id", candidate.id)
    .eq("tenant_id", candidate.tenant_id);

  if (candidateUpdateErr) {
    // Best-effort rollback so we do not leave Approved without a linked convertible path.
    await supabase.from("workers").delete().eq("id", inserted.id);
    throw candidateUpdateErr;
  }

  return {
    ok: true,
    workerRecordId: String(inserted.id),
    candidateId: candidate.id,
    workerType,
    created: true,
    profilePath: `/admin_recruiter/workers/${candidate.id}/profile`,
    sourceJobApplicationId,
    postHire: {
      attempted: false,
      activated: false,
      warning: null,
      applicationId: null,
    },
  };
}

/**
 * Authoritative candidate → employment worker conversion.
 * Prefer DB RPC for atomicity; falls back to conditional insert/update.
 */
export async function convertCandidateToWorker(
  supabase: SupabaseClient,
  input: {
    candidateId: string;
    workerType: ConvertWorkerType;
    actorUserId?: string | null;
    origin?: string | null;
    sourceJobApplicationId?: string | null;
  }
): Promise<ConvertCandidateResult> {
  const candidate = await loadCandidate(supabase, input.candidateId);
  if (!candidate) {
    return { ok: false, error: "Candidate not found", status: 404, code: "NOT_FOUND" };
  }

  const sourceJobApplicationId = await resolveSourceApplicationId(
    supabase,
    candidate.tenant_id,
    candidate.id,
    input.sourceJobApplicationId
  );

  const { data, error } = await supabase.rpc("convert_candidate_to_employment_worker", {
    p_tenant_id: candidate.tenant_id,
    p_candidate_id: candidate.id,
    p_worker_type: input.workerType,
    p_source_job_application_id: sourceJobApplicationId,
    p_actor_user_id: input.actorUserId ?? null,
  });

  let base: ConvertCandidateResult;

  if (error) {
    console.warn("[convert-candidate] RPC unavailable, using fallback:", error.message);
    base = await convertViaFallback(
      supabase,
      candidate,
      input.workerType,
      sourceJobApplicationId
    );
  } else {
    const payload = (data ?? {}) as RpcPayload;
    if (!payload.ok) {
      const code = String(payload.code ?? "FAILED");
      const status =
        code === "NOT_FOUND" ? 404 : code === "ALREADY_CONVERTED" ? 409 : 400;
      return {
        ok: false,
        error: payload.error || "Conversion failed",
        status,
        code,
      };
    }

    base = {
      ok: true,
      workerRecordId: String(payload.workerRecordId),
      candidateId: String(payload.candidateId ?? candidate.id),
      workerType: (payload.workerType as ConvertWorkerType) || input.workerType,
      created: Boolean(payload.created),
      profilePath: `/admin_recruiter/workers/${candidate.id}/profile`,
      sourceJobApplicationId: payload.sourceJobApplicationId
        ? String(payload.sourceJobApplicationId)
        : sourceJobApplicationId,
      postHire: {
        attempted: false,
        activated: false,
        warning: null,
        applicationId: null,
      },
    };
  }

  if (!base.ok) return base;

  const postHire = await activatePostHireForConversion(supabase, {
    tenantId: candidate.tenant_id,
    candidateId: candidate.id,
    applicationId: base.sourceJobApplicationId,
    actorUserId: input.actorUserId ?? null,
    origin: input.origin,
  });

  return {
    ...base,
    postHire,
  };
}

export function assertConversionTenantAccess(candidateTenantId: string, sessionTenantId: string | null) {
  if (!sessionTenantId || sessionTenantId !== candidateTenantId) {
    return false;
  }
  return true;
}

export { normalizeCandidateStatus };
