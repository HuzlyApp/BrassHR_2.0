import type { SupabaseClient } from "@supabase/supabase-js";

export const OFFER_ACCEPTANCE_STEP_TYPE = "offer-acceptance";

export function isOfferAcceptanceStepType(stepType: string | null | undefined): boolean {
  const value = String(stepType ?? "").trim().toLowerCase().replace(/_/g, "-");
  return (
    value === OFFER_ACCEPTANCE_STEP_TYPE ||
    value === "offer-accepted" ||
    value === "pay-rate-accepted"
  );
}

export function isOfferAcceptanceStep(
  step:
    | {
        snapshotStepId?: string | null;
        stepKey?: string | null;
        stepType?: string | null;
        title?: string | null;
        metadata?: Record<string, unknown> | null;
      }
    | null
    | undefined
): boolean {
  if (!step) return false;
  if (isOfferAcceptanceStepType(step.stepType)) return true;
  if (isOfferAcceptanceStepType(step.stepKey)) return true;
  if (isOfferAcceptanceStepType(step.snapshotStepId)) return true;

  const metaWorkflowId = step.metadata?.workflow_step_id;
  if (typeof metaWorkflowId === "string" && isOfferAcceptanceStepType(metaWorkflowId)) return true;
  const metaStepId = step.metadata?.stepId;
  if (typeof metaStepId === "string" && isOfferAcceptanceStepType(metaStepId)) return true;

  const title = String(step.title ?? "").trim().toLowerCase();
  if (
    title.includes("pay rate accepted") ||
    title.includes("pay rate accept") ||
    title.includes("offer acceptance") ||
    title.includes("offer accepted")
  ) {
    return true;
  }

  const key = String(step.stepKey ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (key.includes("pay-rate-accept") || key.includes("offer-accept")) {
    return true;
  }

  const snapshotId = String(step.snapshotStepId ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (snapshotId.includes("pay-rate-accept") || snapshotId.includes("offer-accept")) {
    return true;
  }

  return false;
}

export type OfferDetails = {
  position: string | null;
  jobNumber: string | null;
  client: string | null;
  location: string | null;
  employmentType: string | null;
  schedule: string | null;
  compensation: string | null;
  /** YYYY-MM-DD */
  startDate: string | null;
};

export type OfferDecision = {
  decision: "accepted" | "declined";
  decidedAt: string | null;
  reason: string | null;
};

type JobRow = Record<string, unknown>;

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function asAmount(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function money(amount: number): string {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** "$56.00 – $58.00 / hour" from the requisition pay columns; null when no pay is set. */
export function formatOfferCompensation(job: JobRow): string | null {
  const min = asAmount(job.pay_rate_min);
  const max = asAmount(job.pay_rate_max);
  const single = asAmount(job.pay_rate);
  const unit = (asText(job.rate_unit) ?? asText(job.pay_rate_period) ?? asText(job.compensation_type))
    ?.toLowerCase()
    .replace(/^hourly$/, "hour")
    .replace(/^weekly$/, "week")
    .replace(/^monthly$/, "month")
    .replace(/^(annual|annually|yearly|salary)$/, "year");
  let amount: string | null = null;
  if (min && max && min !== max) amount = `${money(min)} – ${money(max)}`;
  else if (min ?? max ?? single) amount = money((min ?? max ?? single) as number);
  if (!amount) return null;
  return unit ? `${amount} / ${unit}` : amount;
}

function offerLocation(job: JobRow): string | null {
  const facility = asText(job.facility_name) ?? asText(job.facility);
  const cityState = [asText(job.worksite_city) ?? asText(job.city), asText(job.worksite_state) ?? asText(job.state_province)]
    .filter(Boolean)
    .join(", ");
  return facility ?? asText(job.location) ?? (cityState || null);
}

export function offerDetailsFromJob(job: JobRow): OfferDetails {
  const startDate = asText(job.target_start_date);
  return {
    position: asText(job.public_title) ?? asText(job.title) ?? asText(job.source_job_title),
    jobNumber: asText(job.job_number),
    client: asText(job.msp_client_name) ?? asText(job.msp_client),
    location: offerLocation(job),
    employmentType: asText(job.employment_type),
    schedule: asText(job.shift_type),
    compensation: formatOfferCompensation(job),
    startDate: startDate ? startDate.slice(0, 10) : null,
  };
}

const OFFER_JOB_COLUMNS =
  "id, title, public_title, source_job_title, job_number, msp_client, msp_client_name, facility, facility_name, location, city, state_province, worksite_city, worksite_state, employment_type, shift_type, pay_rate, pay_rate_min, pay_rate_max, pay_rate_period, rate_unit, compensation_type, target_start_date";

/** Offer for an application, scoped to the worker when given; null when the application has no job. */
export async function loadOfferDetailsForApplication(
  supabase: SupabaseClient,
  params: { tenantId: string; applicationId: string; workerId?: string | null }
): Promise<OfferDetails | null> {
  let query = supabase
    .from("job_applications")
    .select("job_requisition_id")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.applicationId);
  if (params.workerId) query = query.eq("worker_id", params.workerId);
  const { data: application, error } = await query.maybeSingle();
  if (error) throw error;
  const jobId = asText((application as { job_requisition_id?: string } | null)?.job_requisition_id);
  if (!jobId) return null;

  const { data: job, error: jobError } = await supabase
    .from("job_requisitions")
    .select(OFFER_JOB_COLUMNS)
    .eq("tenant_id", params.tenantId)
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw jobError;
  return job ? offerDetailsFromJob(job as JobRow) : null;
}

/** The candidate's Accept / Decline, read from the step progress data. */
export function readOfferDecision(
  data: Record<string, unknown> | null | undefined,
  status?: string | null
): OfferDecision | null {
  const raw = asText(data?.offer_decision)?.toLowerCase();
  const decision =
    raw === "accepted" || raw === "declined"
      ? raw
      : status === "completed"
        ? "accepted"
        : null;
  if (!decision) return null;
  return {
    decision,
    decidedAt: asText(data?.offer_decided_at),
    reason: decision === "declined" ? asText(data?.failure_reason) ?? asText(data?.reason) : null,
  };
}
