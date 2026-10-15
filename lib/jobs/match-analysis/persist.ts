import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateCandidateKpiCache } from "@/lib/workers/candidate-kpi-cache";
import type { MatchAnalysisResponse, RequirementItem } from "./schema";
import type { RequirementOutcomeCountRow } from "./workspace";

export type ExistingRequirementRow = {
  id: string;
  requirement_text: string;
  requirement_type: string;
  recruiter_verified: boolean;
  recruiter_note: string | null;
  recruiter_verified_at: string | null;
  recruiter_verified_by: string | null;
};

function normalizeRequirementKey(type: string, text: string): string {
  return `${type}::${text.trim().toLowerCase()}`;
}

function requirementRowsFromAnalysis(
  analysis: MatchAnalysisResponse
): Array<RequirementItem & { sort_order: number }> {
  const rows: Array<RequirementItem & { sort_order: number }> = [];
  let order = 0;
  for (const item of analysis.mandatory_requirements) {
    rows.push({ ...item, sort_order: order++ });
  }
  for (const item of analysis.preferred_requirements) {
    rows.push({ ...item, sort_order: order++ });
  }
  return rows;
}

/**
 * Upsert requirement rows. Preserve recruiter verifications when requirement text still matches.
 */
export async function persistMatchRequirements(args: {
  supabase: SupabaseClient;
  tenantId: string;
  jobApplicationId: string;
  analysis: MatchAnalysisResponse;
}): Promise<RequirementOutcomeCountRow[]> {
  const { supabase, tenantId, jobApplicationId, analysis } = args;

  const { data: existing, error: existingError } = await supabase
    .from("job_application_match_requirements")
    .select(
      "id, requirement_text, requirement_type, recruiter_verified, recruiter_note, recruiter_verified_at, recruiter_verified_by"
    )
    .eq("job_application_id", jobApplicationId)
    .eq("tenant_id", tenantId);

  if (existingError) throw existingError;

  const existingByKey = new Map<string, ExistingRequirementRow>();
  for (const row of (existing ?? []) as ExistingRequirementRow[]) {
    existingByKey.set(
      normalizeRequirementKey(row.requirement_type, row.requirement_text),
      row
    );
  }

  const nextRows = requirementRowsFromAnalysis(analysis);
  const nextKeys = new Set(
    nextRows.map((r) => normalizeRequirementKey(r.requirement_type, r.requirement))
  );

  // Delete requirements that no longer appear — but never hard-delete rows that
  // carry recruiter verification or notes (CASCADE would wipe note history).
  const unmatched = (existing ?? []).filter((row) => {
    const key = normalizeRequirementKey(row.requirement_type, row.requirement_text);
    return !nextKeys.has(key);
  });
  const protectedIds = new Set(
    unmatched
      .filter(
        (row) =>
          row.recruiter_verified ||
          Boolean(String(row.recruiter_note ?? "").trim())
      )
      .map((row) => row.id)
  );
  if (unmatched.length) {
    const candidateIds = unmatched.map((row) => row.id).filter((id) => !protectedIds.has(id));
    if (candidateIds.length) {
      const { data: notedRows } = await supabase
        .from("job_application_match_requirement_notes")
        .select("requirement_id")
        .eq("tenant_id", tenantId)
        .eq("job_application_id", jobApplicationId)
        .in("requirement_id", candidateIds);
      for (const note of notedRows ?? []) {
        const reqId = String(note.requirement_id ?? "");
        if (reqId) protectedIds.add(reqId);
      }
    }
  }
  const toDelete = unmatched.map((row) => row.id).filter((id) => !protectedIds.has(id));

  if (toDelete.length) {
    const { error: delError } = await supabase
      .from("job_application_match_requirements")
      .delete()
      .in("id", toDelete);
    if (delError) throw delError;
  }

  const written: RequirementOutcomeCountRow[] = [];
  for (const item of nextRows) {
    const key = normalizeRequirementKey(item.requirement_type, item.requirement);
    const prev = existingByKey.get(key);
    const recruiterVerified = prev?.recruiter_verified ?? false;
    const payload = {
      tenant_id: tenantId,
      job_application_id: jobApplicationId,
      requirement_text: item.requirement,
      requirement_type: item.requirement_type,
      status: item.status,
      requirement_outcome: item.requirement_outcome,
      candidate_evidence: item.candidate_evidence ?? "",
      evidence_source: item.evidence_source ?? "NONE",
      impact: item.impact ?? "",
      verification_required: Boolean(item.verification_required),
      confidence: item.confidence ?? 0,
      sort_order: item.sort_order,
      // Preserve recruiter verification fields when text matches
      recruiter_verified: recruiterVerified,
      recruiter_note: prev?.recruiter_note ?? null,
      recruiter_verified_at: prev?.recruiter_verified_at ?? null,
      recruiter_verified_by: prev?.recruiter_verified_by ?? null,
      updated_at: new Date().toISOString(),
    };

    if (prev?.id) {
      const { error } = await supabase
        .from("job_application_match_requirements")
        .update(payload)
        .eq("id", prev.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("job_application_match_requirements")
        .insert(payload);
      if (error) throw error;
    }
    written.push({
      requirement_type: item.requirement_type,
      status: item.status,
      requirement_outcome: item.requirement_outcome,
      verification_required: Boolean(item.verification_required),
      recruiter_verified: recruiterVerified,
    });
  }

  return written;
}

export async function updateApplicationMatchFields(args: {
  supabase: SupabaseClient;
  tenantId: string;
  jobApplicationId: string;
  patch: Record<string, unknown>;
}): Promise<void> {
  const { error } = await args.supabase
    .from("job_applications")
    .update({
      ...args.patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.jobApplicationId)
    .eq("tenant_id", args.tenantId);
  if (error) throw error;
  await invalidateCandidateKpiCache(args.tenantId);
}

export async function cacheStructuredRequirements(args: {
  supabase: SupabaseClient;
  tenantId: string;
  jobRequisitionId: string;
  structured: unknown;
}): Promise<void> {
  const { error } = await args.supabase
    .from("job_requisitions")
    .update({
      structured_requirements: args.structured,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.jobRequisitionId)
    .eq("tenant_id", args.tenantId);
  if (error) {
    // Non-fatal: cache miss shouldn't fail analysis
    console.warn("[match-analysis] failed to cache structured_requirements", error.message);
  }
}
