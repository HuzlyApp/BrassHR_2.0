import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Step1FormFields } from "@/lib/onboardingStep1Validation"
import { ensureWorkerOnboardingProgress } from "@/lib/onboarding/ensure-worker-progress"
import { adoptSessionApplications } from "@/lib/onboarding/adopt-session-applications"
import {
  invalidateResourceCache,
  invalidateTableCache,
  invalidateTenantCache,
  invalidateUserCache,
} from "@/lib/cache"
import {
  isWorkerTenantEmailUniqueViolation,
  normalizeTenantEmail,
  tenantEmailTakenResult,
} from "@/lib/tenant/tenant-email-uniqueness"
import { isDraftPreviewApplicantId } from "@/lib/onboarding/is-draft-preview"
import { findWorkerByPhoneAndName } from "@/lib/workers/candidate-identity"
import { invalidateCandidateKpiCache } from "@/lib/workers/candidate-kpi-cache"

function isMissingColumnErr(e: unknown) {
  const err = e as { code?: string; message?: string } | null
  if (!err) return false
  if (err.code === "42703") return true
  return typeof err.message === "string" && err.message.includes(" does not exist")
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === "23505") return true
  return typeof e.message === "string" && /duplicate key|unique constraint/i.test(e.message)
}

function describeDbErr(err: unknown, fallback = "Database error"): string {
  const e = err as { message?: string; details?: string; hint?: string } | null
  if (!e) return fallback
  return [e.message, e.details, e.hint].filter(Boolean).join(" — ") || fallback
}

export type PersistWorkerRowInput = {
  applicantId: string
  tenantId: string
  fields: Step1FormFields
  status?: string
  addressLat?: number
  addressLng?: number
  addressNormalized?: string
  /** Skip slow onboarding progress bootstrap (e.g. resume upload ensure path). */
  skipOnboardingProgressInit?: boolean
}

export type PersistWorkerRowResult =
  | { ok: true; workerId: string }
  | { ok: false; error: string; code?: string; status?: number }

function normalizePipelineStatus(value: string | undefined): string | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const lower = raw.toLowerCase()
  if (lower === "active") return "new"
  if (
    lower === "new" ||
    lower === "pending" ||
    lower === "under_review" ||
    lower === "for_approval" ||
    lower === "approved" ||
    lower === "disapproved"
  ) {
    return lower
  }
  return lower
}

type WorkerMatch = {
  id: string
  user_id: string | null
  email: string | null
  status?: string | null
}

function isReclaimableWorkerStatus(status: string | null | undefined): boolean {
  const s = String(status ?? "")
    .trim()
    .toLowerCase()
  return (
    !s ||
    s === "new" ||
    s === "pending" ||
    s === "active" ||
    s === "under_review" ||
    s === "for_approval"
  )
}

async function findWorkerByUser(
  supabase: SupabaseClient,
  tenantId: string,
  applicantId: string
): Promise<WorkerMatch | null> {
  const { data, error } = await supabase
    .from("worker")
    .select("id, user_id, email, status")
    .eq("user_id", applicantId)
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(1)
  if (error) throw error
  const row = data?.[0]
  return row?.id
    ? {
        id: String(row.id),
        user_id: row.user_id,
        email: row.email,
        status: row.status,
      }
    : null
}

/** Match tenant email uniqueness: lower(trim(email)). */
async function findWorkerByEmail(
  supabase: SupabaseClient,
  tenantId: string,
  emailNorm: string
): Promise<WorkerMatch | null> {
  if (!emailNorm) return null

  const { data, error } = await supabase
    .from("worker")
    .select("id, user_id, email, status")
    .eq("tenant_id", tenantId)
    .ilike("email", emailNorm)
    .order("updated_at", { ascending: false })
    .limit(10)
  if (error) throw error

  const exact = (data ?? []).find(
    (row) => normalizeTenantEmail(String(row.email ?? "")) === emailNorm
  )
  if (exact?.id) {
    return {
      id: String(exact.id),
      user_id: exact.user_id,
      email: exact.email,
      status: exact.status,
    }
  }

  // Unique index uses lower(trim(email)); ilike can miss padded values.
  const { data: recent, error: recentErr } = await supabase
    .from("worker")
    .select("id, user_id, email, status")
    .eq("tenant_id", tenantId)
    .not("email", "is", null)
    .neq("email", "")
    .order("updated_at", { ascending: false })
    .limit(100)
  if (recentErr) throw recentErr

  const padded = (recent ?? []).find(
    (row) => normalizeTenantEmail(String(row.email ?? "")) === emailNorm
  )
  return padded?.id
    ? {
        id: String(padded.id),
        user_id: padded.user_id,
        email: padded.email,
        status: padded.status,
      }
    : null
}

/** Free email on a row so another worker in the same tenant can claim it. */
async function releaseWorkerEmail(
  supabase: SupabaseClient,
  workerId: string
): Promise<void> {
  const { error } = await supabase
    .from("worker")
    .update({ email: null, updated_at: new Date().toISOString() })
    .eq("id", workerId)
  if (error) {
    const { error: emptyErr } = await supabase
      .from("worker")
      .update({ email: "", updated_at: new Date().toISOString() })
      .eq("id", workerId)
    if (emptyErr) throw emptyErr
  }
}

/** Free user_id on a shell row so the email-bearing row can be reclaimed. */
async function releaseWorkerUserId(
  supabase: SupabaseClient,
  workerId: string
): Promise<void> {
  const { error } = await supabase
    .from("worker")
    .update({ user_id: null, updated_at: new Date().toISOString() })
    .eq("id", workerId)
  if (error) throw error
}

async function updateWorkerWithFallback(
  supabase: SupabaseClient,
  workerId: string,
  attempts: Record<string, unknown>[]
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  let lastErr: unknown = null
  for (const attempt of attempts) {
    const { error } = await supabase.from("worker").update(attempt).eq("id", workerId)
    if (!error) return { ok: true }
    lastErr = error
    if (!isMissingColumnErr(error)) break
  }

  if (lastErr && isUniqueViolation(lastErr)) {
    for (const attempt of attempts) {
      const payload = { ...attempt }
      delete payload.user_id
      const { error } = await supabase.from("worker").update(payload).eq("id", workerId)
      if (!error) return { ok: true }
      lastErr = error
      if (!isMissingColumnErr(error)) break
    }
  }

  return { ok: false, error: lastErr }
}

async function insertWorkerWithFallback(
  supabase: SupabaseClient,
  attempts: Record<string, unknown>[]
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  let lastErr: unknown = null
  for (const attempt of attempts) {
    const { error } = await supabase.from("worker").insert(attempt)
    if (!error) return { ok: true }
    lastErr = error
    if (!isMissingColumnErr(error)) break
  }
  return { ok: false, error: lastErr }
}

type ResolveTargetResult =
  | { ok: true; targetId: string | null }
  | { ok: false; conflict: true }

/**
 * Pick the worker row to update for this applicant+email in a tenant.
 * Handles prior-session email rows and ensure-worker shells without false 409s.
 */
async function resolvePersistTarget(
  supabase: SupabaseClient,
  tenantId: string,
  applicantId: string,
  emailNorm: string
): Promise<ResolveTargetResult> {
  const byUser = await findWorkerByUser(supabase, tenantId, applicantId)
  const byEmail = await findWorkerByEmail(supabase, tenantId, emailNorm)

  if (byUser && byEmail && byUser.id !== byEmail.id) {
    const emailOwner = byEmail.user_id ? String(byEmail.user_id) : ""
    if (!emailOwner || emailOwner === applicantId) {
      await releaseWorkerEmail(supabase, byEmail.id)
      return { ok: true, targetId: byUser.id }
    }
    if (!isReclaimableWorkerStatus(byEmail.status)) {
      return { ok: false, conflict: true }
    }
    // Prior applicant session owns this email — keep that row, free the shell user_id.
    await releaseWorkerUserId(supabase, byUser.id)
    return { ok: true, targetId: byEmail.id }
  }

  if (byUser) return { ok: true, targetId: byUser.id }
  if (byEmail) {
    const emailOwner = byEmail.user_id ? String(byEmail.user_id) : ""
    if (
      emailOwner &&
      emailOwner !== applicantId &&
      !isReclaimableWorkerStatus(byEmail.status)
    ) {
      return { ok: false, conflict: true }
    }
    return { ok: true, targetId: byEmail.id }
  }
  return { ok: true, targetId: null }
}

/** Insert or update `worker` by `user_id` (service-role onboarding APIs). */
export async function persistWorkerRow(
  supabase: SupabaseClient,
  input: PersistWorkerRowInput
): Promise<PersistWorkerRowResult> {
  if (isDraftPreviewApplicantId(input.applicantId)) {
    return {
      ok: false,
      error: "Draft preview cannot persist a worker",
      code: "DRAFT_PREVIEW",
      status: 400,
    }
  }

  const { applicantId, tenantId, fields } = input
  const emailNorm = normalizeTenantEmail(fields.email)

  const baseRow: Record<string, unknown> = {
    tenant_id: tenantId,
    user_id: applicantId,
    first_name: fields.firstName.trim(),
    last_name: fields.lastName.trim(),
    address1: fields.address1.trim(),
    address2: fields.address2.trim(),
    city: fields.city.trim(),
    state: fields.state.trim(),
    zip: fields.zipCode.trim(),
    phone: fields.phone.trim(),
    email: emailNorm,
    job_role: fields.jobRole.trim(),
    updated_at: new Date().toISOString(),
  }

  const hasGeo =
    Number.isFinite(input.addressLat) &&
    Number.isFinite(input.addressLng) &&
    typeof input.addressNormalized === "string" &&
    input.addressNormalized.trim().length > 0

  if (hasGeo) {
    baseRow.lat = input.addressLat
    baseRow.lng = input.addressLng
  }

  const pipelineStatus = normalizePipelineStatus(input.status) ?? "new"
  const rowAttempts: Record<string, unknown>[] = [
    { ...baseRow, status: pipelineStatus },
    { ...baseRow },
  ]

  const sessionWorkerBefore = await findWorkerByUser(supabase, tenantId, applicantId)
  const resolved = await resolvePersistTarget(supabase, tenantId, applicantId, emailNorm)
  if (!resolved.ok) {
    const taken = tenantEmailTakenResult()
    return { ok: false, error: taken.error, code: taken.code, status: taken.status }
  }
  let targetId = resolved.targetId

  // Prefer an existing blank-email duplicate matched by phone + name over inserting a new worker.
  if (!targetId) {
    try {
      const phoneMatch = await findWorkerByPhoneAndName(supabase, {
        tenantId,
        phone: fields.phone,
        firstName: fields.firstName,
        lastName: fields.lastName,
      })
      if (phoneMatch?.id) targetId = phoneMatch.id
    } catch (phoneMatchErr) {
      console.warn("[persist-worker-row] phone+name reuse lookup failed", phoneMatchErr)
    }
  }

  if (targetId) {
    let updated = await updateWorkerWithFallback(supabase, targetId, rowAttempts)

    if (!updated.ok && isWorkerTenantEmailUniqueViolation(updated.error) && emailNorm) {
      // Race: another row claimed the email after our resolve — free it and retry once.
      const emailOwner = await findWorkerByEmail(supabase, tenantId, emailNorm)
      if (emailOwner && emailOwner.id !== targetId) {
        if (
          emailOwner.user_id &&
          String(emailOwner.user_id) !== applicantId &&
          !isReclaimableWorkerStatus(emailOwner.status)
        ) {
          const taken = tenantEmailTakenResult()
          return { ok: false, error: taken.error, code: taken.code, status: taken.status }
        }
        await releaseWorkerEmail(supabase, emailOwner.id)
        updated = await updateWorkerWithFallback(supabase, targetId, rowAttempts)
      } else if (emailOwner) {
        targetId = emailOwner.id
        updated = await updateWorkerWithFallback(supabase, targetId, rowAttempts)
      }
    }

    if (!updated.ok) {
      if (isWorkerTenantEmailUniqueViolation(updated.error)) {
        const taken = tenantEmailTakenResult()
        return { ok: false, error: taken.error, code: taken.code, status: taken.status }
      }
      return { ok: false, error: describeDbErr(updated.error), status: 500 }
    }
  } else {
    let inserted = await insertWorkerWithFallback(supabase, rowAttempts)

    if (!inserted.ok && isWorkerTenantEmailUniqueViolation(inserted.error) && emailNorm) {
      const emailOwner = await findWorkerByEmail(supabase, tenantId, emailNorm)
      if (emailOwner) {
        if (
          emailOwner.user_id &&
          String(emailOwner.user_id) !== applicantId &&
          !isReclaimableWorkerStatus(emailOwner.status)
        ) {
          const taken = tenantEmailTakenResult()
          return { ok: false, error: taken.error, code: taken.code, status: taken.status }
        }
        targetId = emailOwner.id
        inserted = await updateWorkerWithFallback(supabase, targetId, rowAttempts)
        if (
          !inserted.ok &&
          isWorkerTenantEmailUniqueViolation(inserted.error) &&
          emailOwner.id
        ) {
          const byUser = await findWorkerByUser(supabase, tenantId, applicantId)
          if (byUser && byUser.id !== emailOwner.id) {
            await releaseWorkerUserId(supabase, byUser.id)
            targetId = emailOwner.id
            inserted = await updateWorkerWithFallback(supabase, targetId, rowAttempts)
          }
        }
      }
    }

    if (!inserted.ok) {
      if (isWorkerTenantEmailUniqueViolation(inserted.error)) {
        const taken = tenantEmailTakenResult()
        return { ok: false, error: taken.error, code: taken.code, status: taken.status }
      }
      return { ok: false, error: describeDbErr(inserted.error), status: 500 }
    }
  }

  const byUserAfter = await findWorkerByUser(supabase, tenantId, applicantId)
  const byEmailAfter = emailNorm
    ? await findWorkerByEmail(supabase, tenantId, emailNorm)
    : null
  const workerId = byUserAfter?.id ?? byEmailAfter?.id ?? targetId
  if (!workerId) {
    return { ok: false, error: "Worker row missing after save", status: 500 }
  }

  if (sessionWorkerBefore && sessionWorkerBefore.id !== workerId) {
    try {
      const adopted = await adoptSessionApplications(supabase, {
        tenantId,
        applicantAuthUserId: applicantId,
        fromWorkerId: sessionWorkerBefore.id,
        toWorkerId: workerId,
      })
      if (adopted.moved.length || adopted.skipped.length) {
        console.info("[persist-worker-row] session applications moved to resolved worker", {
          fromWorkerId: sessionWorkerBefore.id,
          toWorkerId: workerId,
          ...adopted,
        })
      }
    } catch (adoptErr) {
      console.error("[persist-worker-row] session application move failed", adoptErr)
    }
  }

  if (!input.skipOnboardingProgressInit) {
    try {
      await ensureWorkerOnboardingProgress(supabase, workerId, tenantId)
    } catch (e) {
      console.error("[persist-worker-row] progress init", e)
    }
  }

  await Promise.all([
    invalidateResourceCache("worker", workerId),
    invalidateTenantCache("worker_search", tenantId),
    invalidateTenantCache("worker", tenantId),
    invalidateUserCache("worker", applicantId),
    invalidateTableCache("worker_search"),
    invalidateCandidateKpiCache(tenantId),
  ])

  return { ok: true, workerId }
}
