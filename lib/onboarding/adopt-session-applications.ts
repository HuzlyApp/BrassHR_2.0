import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/** Tables that carry both the worker and the job application they belong to. */
const APPLICATION_SCOPED_WORKER_TABLES: ReadonlyArray<{ table: string; applicationColumn: string }> = [
  { table: "worker_resumes", applicationColumn: "job_application_id" },
  { table: "job_application_match_requirement_notes", applicationColumn: "job_application_id" },
  { table: "applicant_workflow_instances", applicationColumn: "application_id" },
  { table: "worker_onboarding_progress", applicationColumn: "application_id" },
  { table: "worker_onboarding_step_progress", applicationColumn: "application_id" },
  { table: "applicant_continuation_links", applicationColumn: "application_id" },
  { table: "candidate_communications", applicationColumn: "application_id" },
  { table: "worker_submitted_documents", applicationColumn: "application_id" },
  { table: "worker_documents", applicationColumn: "application_id" },
  { table: "worker_portal_documents", applicationColumn: "application_id" },
  { table: "worker_legacy_document_reviews", applicationColumn: "application_id" },
  { table: "worker_requirements", applicationColumn: "application_id" },
  { table: "worker_skill_assessment_answers", applicationColumn: "application_id" },
  { table: "skill_assessments", applicationColumn: "application_id" },
  { table: "worker_firma_signing_sessions", applicationColumn: "application_id" },
  { table: "worker_pipeline_checklist_items", applicationColumn: "application_id" },
  { table: "worker_notes", applicationColumn: "application_id" },
  { table: "worker_call_logs", applicationColumn: "application_id" },
  { table: "applicant_appointments", applicationColumn: "application_id" },
  { table: "interview_schedules", applicationColumn: "application_id" },
  { table: "compliance_checks", applicationColumn: "application_id" },
  { table: "facility_approvals", applicationColumn: "application_id" },
  { table: "applicants", applicationColumn: "application_id" },
]

const INACTIVE_APPLICATION_STATUSES = new Set(["rejected", "withdrawn"])

export type AdoptSessionApplicationsResult = {
  moved: string[]
  skipped: Array<{ applicationId: string; reason: "TARGET_ALREADY_APPLIED" | "UPDATE_FAILED" }>
}

async function resolveTargetApplicantProfileId(
  supabase: SupabaseClient,
  tenantId: string,
  targetWorkerId: string,
  currentProfileId: string | null
): Promise<string | null> {
  const { data: targetProfile } = await supabase
    .from("applicant_profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("worker_id", targetWorkerId)
    .maybeSingle()
  if (targetProfile?.id) return String(targetProfile.id)
  if (!currentProfileId) return null

  const { error } = await supabase
    .from("applicant_profiles")
    .update({ worker_id: targetWorkerId })
    .eq("id", currentProfileId)
    .eq("tenant_id", tenantId)
  if (error) {
    console.warn("[adopt-session-applications] applicant profile relink failed", {
      profileId: currentProfileId,
      targetWorkerId,
      error: error.message,
    })
  }
  return currentProfileId
}

/**
 * When a profile save resolves the applicant session to an existing worker (matched by
 * email), move the applications this session created on its placeholder worker onto that
 * worker so the job shows the real candidate instead of an orphan "Applicant User" row.
 */
export async function adoptSessionApplications(
  supabase: SupabaseClient,
  params: {
    tenantId: string
    applicantAuthUserId: string
    fromWorkerId: string
    toWorkerId: string
  }
): Promise<AdoptSessionApplicationsResult> {
  const result: AdoptSessionApplicationsResult = { moved: [], skipped: [] }
  const { tenantId, applicantAuthUserId, fromWorkerId, toWorkerId } = params
  if (!fromWorkerId || !toWorkerId || fromWorkerId === toWorkerId) return result

  const { data: apps, error } = await supabase
    .from("job_applications")
    .select("id, job_requisition_id, applicant_profile_id, status")
    .eq("tenant_id", tenantId)
    .eq("worker_id", fromWorkerId)
    .eq("applicant_auth_user_id", applicantAuthUserId)
  if (error) throw error
  if (!apps?.length) return result

  const { data: targetApps, error: targetErr } = await supabase
    .from("job_applications")
    .select("job_requisition_id, status")
    .eq("tenant_id", tenantId)
    .eq("worker_id", toWorkerId)
  if (targetErr) throw targetErr
  const targetActiveJobIds = new Set(
    (targetApps ?? [])
      .filter((row) => !INACTIVE_APPLICATION_STATUSES.has(String(row.status ?? "")))
      .map((row) => String(row.job_requisition_id))
  )

  for (const app of apps) {
    const applicationId = String(app.id)
    const active = !INACTIVE_APPLICATION_STATUSES.has(String(app.status ?? ""))
    if (active && targetActiveJobIds.has(String(app.job_requisition_id))) {
      result.skipped.push({ applicationId, reason: "TARGET_ALREADY_APPLIED" })
      continue
    }

    const profileId = await resolveTargetApplicantProfileId(
      supabase,
      tenantId,
      toWorkerId,
      app.applicant_profile_id ? String(app.applicant_profile_id) : null
    )

    const { error: moveErr } = await supabase
      .from("job_applications")
      .update({
        worker_id: toWorkerId,
        ...(profileId ? { applicant_profile_id: profileId } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", applicationId)
      .eq("tenant_id", tenantId)
    if (moveErr) {
      console.error("[adopt-session-applications] application move failed", {
        applicationId,
        fromWorkerId,
        toWorkerId,
        error: moveErr.message,
      })
      result.skipped.push({ applicationId, reason: "UPDATE_FAILED" })
      continue
    }
    if (active) targetActiveJobIds.add(String(app.job_requisition_id))

    for (const { table, applicationColumn } of APPLICATION_SCOPED_WORKER_TABLES) {
      const { error: childErr } = await supabase
        .from(table)
        .update({ worker_id: toWorkerId })
        .eq("worker_id", fromWorkerId)
        .eq(applicationColumn, applicationId)
      if (childErr) {
        console.warn("[adopt-session-applications] child rows not moved", {
          table,
          applicationId,
          error: childErr.message,
        })
      }
    }
    result.moved.push(applicationId)
  }

  return result
}
