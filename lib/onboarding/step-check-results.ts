import type { SupabaseClient } from "@supabase/supabase-js";
import type { StepPillTone } from "@/lib/onboarding/interview-step";

export type StepCheckKind = "compliance" | "facility";

/** Result stored in `compliance_checks` / `facility_approvals` for one candidate workflow step. */
export type StepCheckResult = {
  kind: StepCheckKind;
  typeLabel: string;
  status: string;
  statusLabel: string;
  tone: StepPillTone;
  facilityName: string | null;
  vendorName: string | null;
  externalRef: string | null;
  resultSummary: string | null;
  notes: string | null;
  completedAt: string | null;
  completedByName: string | null;
  updatedAt: string | null;
};

const CHECK_TYPE_LABELS: Record<string, string> = {
  background: "Background check",
  drug: "Drug test / screening",
  oig: "OIG / exclusion check",
  other: "Compliance check",
};

const COMPLIANCE_STATUS: Record<string, { label: string; tone: StepPillTone }> = {
  not_started: { label: "Not Started", tone: "neutral" },
  pending: { label: "Pending", tone: "warning" },
  in_progress: { label: "In Progress", tone: "info" },
  passed: { label: "Passed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  not_required: { label: "Not Required", tone: "neutral" },
  waived: { label: "Waived", tone: "neutral" },
};

const FACILITY_STATUS: Record<string, { label: string; tone: StepPillTone }> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  not_required: { label: "Not Required", tone: "neutral" },
};

const COMPLIANCE_STEP_TYPES: Record<string, string> = {
  "background-check": "background",
  "drug-test-screening": "drug",
  "oig-exclusion-check": "oig",
};

function normalizeLibraryId(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase().replaceAll("_", "-");
}

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export function stepCheckKind(stepType: string | null | undefined): StepCheckKind | null {
  const key = normalizeLibraryId(stepType);
  if (COMPLIANCE_STEP_TYPES[key]) return "compliance";
  if (key === "manager-facility-approval") return "facility";
  return null;
}

export function toStepCheckResult(kind: StepCheckKind, row: Record<string, unknown>): StepCheckResult {
  const status = asText(row.status) ?? (kind === "facility" ? "pending" : "not_started");
  const statusMeta =
    (kind === "facility" ? FACILITY_STATUS : COMPLIANCE_STATUS)[status] ?? { label: status, tone: "neutral" as const };
  return {
    kind,
    typeLabel:
      kind === "facility"
        ? "Facility approval"
        : CHECK_TYPE_LABELS[asText(row.check_type) ?? "other"] ?? CHECK_TYPE_LABELS.other,
    status,
    statusLabel: statusMeta.label,
    tone: statusMeta.tone,
    facilityName: asText(row.facility_name),
    vendorName: asText(row.vendor_name),
    externalRef: asText(row.external_ref),
    resultSummary: asText(row.result_summary),
    notes: asText(row.notes),
    completedAt: asText(row.completed_at),
    completedByName: asText(row.completed_by_name),
    updatedAt: asText(row.updated_at),
  };
}

export async function loadStepCheckResult(
  supabase: SupabaseClient,
  params: { tenantId: string; stepRecordId: string; stepType: string | null | undefined }
): Promise<StepCheckResult | null> {
  const kind = stepCheckKind(params.stepType);
  if (!kind) return null;
  const { data, error } =
    kind === "facility"
      ? await supabase
          .from("facility_approvals")
          .select("status, facility_name, notes, completed_at, completed_by_name, updated_at")
          .eq("tenant_id", params.tenantId)
          .eq("step_record_id", params.stepRecordId)
          .maybeSingle()
      : await supabase
          .from("compliance_checks")
          .select(
            "check_type, status, vendor_name, external_ref, result_summary, notes, completed_at, completed_by_name, updated_at"
          )
          .eq("tenant_id", params.tenantId)
          .eq("step_record_id", params.stepRecordId)
          .maybeSingle();
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null;
    throw error;
  }
  return data ? toStepCheckResult(kind, data as Record<string, unknown>) : null;
}
