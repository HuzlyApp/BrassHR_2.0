import { NextRequest, NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseUrl } from "@/lib/supabase-env"
import { isDraftPreviewApplicantId } from "@/lib/onboarding/is-draft-preview"
import { resolveOrEnsureWorkerForApplicant } from "@/lib/onboarding/resolve-worker-context"
import { resolveOnboardingTenantId } from "@/lib/tenant/resolve-onboarding-tenant-id"
import {
  isReferenceComplete,
  MIN_COMPLETE_REFERENCES,
  parseYearsKnown,
  YEARS_KNOWN_ERROR,
  type ReferenceRow,
} from "@/lib/referencesValidation"
import { markTenantStepCompletedByType } from "@/lib/onboarding/mark-tenant-step-completed"
import { isPersonNameTooLong, personNameTooLongMessage } from "@/lib/person-name"
import { findApplicantByUserId } from "@/lib/applicant-portal"
import { APPLICANT_CONTINUATION_SESSION_COOKIE } from "@/lib/tenant/constants"

export const runtime = "nodejs"

type ReferenceInput = Partial<ReferenceRow>

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization")?.trim() ?? ""
  if (!header.toLowerCase().startsWith("bearer ")) return null
  const token = header.slice(7).trim()
  return token || null
}

/** Worker opened through an emailed continuation link, which sets a cookie instead of signing in. */
async function continuationWorkerId(
  supabase: SupabaseClient,
  req: NextRequest,
  tenantId: string,
): Promise<string | null> {
  const linkId = req.cookies.get(APPLICANT_CONTINUATION_SESSION_COOKIE)?.value?.trim()
  if (!linkId) return null
  const { data } = await supabase
    .from("applicant_continuation_links")
    .select("worker_id, tenant_id, expires_at, revoked_at, completed_at")
    .eq("id", linkId)
    .maybeSingle()
  const link = data as {
    worker_id: string
    tenant_id: string
    expires_at: string
    revoked_at: string | null
    completed_at: string | null
  } | null
  if (!link || link.tenant_id !== tenantId || link.revoked_at || link.completed_at) return null
  if (new Date(link.expires_at).getTime() <= Date.now()) return null
  return link.worker_id
}

/** The applicant's saved references, so the form can show what they already submitted. */
export async function GET(req: NextRequest) {
  try {
    const url = getSupabaseUrl()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })
    const supabase = createClient(url, key)

    const tenantSlug = req.nextUrl.searchParams.get("tenant")?.trim().toLowerCase() || ""
    if (!tenantSlug) return NextResponse.json({ error: "Missing tenant" }, { status: 400 })
    const tenantRes = await resolveOnboardingTenantId(supabase, tenantSlug)
    if (!tenantRes.ok) return NextResponse.json({ error: tenantRes.error }, { status: 404 })

    let workerId: string | null = null
    const token = bearerToken(req)
    if (token) {
      const { data: auth } = await supabase.auth.getUser(token)
      if (auth.user?.id) {
        workerId = (await findApplicantByUserId(supabase, auth.user.id, tenantRes.tenantId))?.id ?? null
      }
    }
    workerId ??= await continuationWorkerId(supabase, req, tenantRes.tenantId)
    if (!workerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data, error } = await supabase
      .from("worker_references")
      .select(
        "reference_first_name, reference_last_name, reference_phone, reference_email, relationship, company, job_title, years_known, notes, created_at"
      )
      .eq("tenant_id", tenantRes.tenantId)
      .eq("worker_id", workerId)
      .order("created_at", { ascending: true })
    if (error) throw error

    const references: ReferenceRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      first: String(row.reference_first_name ?? ""),
      last: String(row.reference_last_name ?? ""),
      phone: String(row.reference_phone ?? ""),
      email: String(row.reference_email ?? ""),
      relationship: String(row.relationship ?? ""),
      company: String(row.company ?? ""),
      jobTitle: String(row.job_title ?? ""),
      yearsKnown: row.years_known == null ? "" : String(row.years_known),
      notes: String(row.notes ?? ""),
    }))
    return NextResponse.json({ references })
  } catch (err: unknown) {
    console.error("[onboarding/worker-references] GET", err)
    const msg = err instanceof Error ? err.message : "Unexpected error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      applicantId?: string
      tenantSlug?: string
      minCount?: number
      references?: ReferenceInput[]
    }
    const applicantId = typeof body.applicantId === "string" ? body.applicantId.trim() : ""
    const references = Array.isArray(body.references) ? body.references : []
    const minCountRaw = Number(body.minCount)
    const minCount =
      Number.isFinite(minCountRaw) && minCountRaw > 0
        ? Math.floor(minCountRaw)
        : MIN_COMPLETE_REFERENCES

    if (!applicantId) {
      return NextResponse.json({ error: "Missing applicantId" }, { status: 400 })
    }
    if (isDraftPreviewApplicantId(applicantId)) {
      return NextResponse.json({ ok: true, preview: true, count: references.length })
    }
    const rowsInput = references as ReferenceRow[]
    const completeOnly = rowsInput.filter(isReferenceComplete)
    if (completeOnly.length < minCount) {
      return NextResponse.json(
        {
          error: `At least ${minCount} complete reference${minCount === 1 ? " is" : "s are"} required.`,
        },
        { status: 400 },
      )
    }
    const hasTooLongName = completeOnly.some(
      (r) => isPersonNameTooLong(String(r.first ?? "")) || isPersonNameTooLong(String(r.last ?? "")),
    )
    if (hasTooLongName) {
      return NextResponse.json({ error: personNameTooLongMessage("Reference name") }, { status: 400 })
    }

    const url = getSupabaseUrl()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json(
        {
          error: "MISSING_SERVICE_ROLE_KEY",
          hint: "Set SUPABASE_SERVICE_ROLE_KEY in .env.local to save references to the database.",
        },
        { status: 503 },
      )
    }

    const supabase = createClient(url, key)

    const tenantSlug =
      typeof body.tenantSlug === "string" ? body.tenantSlug.trim().toLowerCase() : ""
    if (!tenantSlug) {
      return NextResponse.json(
        { error: "Missing tenant context. Re-open your application link and try again." },
        { status: 400 },
      )
    }

    const tenantRes = await resolveOnboardingTenantId(supabase, tenantSlug)
    if (!tenantRes.ok) {
      return NextResponse.json(
        { error: tenantRes.error, code: "MISSING_TENANT" },
        { status: 503 },
      )
    }

    const worker = await resolveOrEnsureWorkerForApplicant(supabase, applicantId, tenantSlug)

    if (!worker?.workerId || !worker.tenantId) {
      return NextResponse.json(
        {
          error:
            "Worker profile not found for this session. Complete an earlier onboarding step first, then try again.",
        },
        { status: 404 },
      )
    }

    if (worker.tenantId !== tenantRes.tenantId) {
      return NextResponse.json({ error: "Tenant mismatch." }, { status: 403 })
    }

    const workerId = worker.workerId
    const tenantId = worker.tenantId

    const { error: delErr } = await supabase
      .from("worker_references")
      .delete()
      .eq("worker_id", workerId)
      .eq("tenant_id", tenantId)
    if (delErr) {
      // Older schemas may lack tenant_id — fall back to worker-scoped delete.
      const { error: delFallback } = await supabase
        .from("worker_references")
        .delete()
        .eq("worker_id", workerId)
      if (delFallback) {
        console.error("[onboarding/worker-references] delete existing", delErr, delFallback)
        throw delFallback
      }
    }

    const rows = []
    for (const r of completeOnly) {
      const parsedYears = parseYearsKnown(r.yearsKnown)
      if (parsedYears.error) {
        return NextResponse.json({ error: parsedYears.error }, { status: 400 })
      }
      rows.push({
        tenant_id: tenantId,
        worker_id: workerId,
        reference_first_name: String(r.first ?? "").trim(),
        reference_last_name: String(r.last ?? "").trim(),
        reference_phone: String(r.phone ?? "").trim() || null,
        reference_email: String(r.email ?? "").trim(),
        relationship: String(r.relationship ?? "").trim() || null,
        company: String(r.company ?? "").trim() || null,
        job_title: String(r.jobTitle ?? "").trim() || null,
        years_known: parsedYears.value,
        notes: String(r.notes ?? "").trim() || null,
      })
    }

    for (const row of rows) {
      if (!row.reference_first_name || !row.reference_last_name || !row.reference_email) {
        return NextResponse.json(
          { error: "Each reference must include first name, last name, and email." },
          { status: 400 },
        )
      }
    }

    const { error: insErr } = await supabase.from("worker_references").insert(rows)
    if (insErr) {
      console.error("[onboarding/worker-references] insert", insErr)
      const msg = [insErr.message, insErr.details].filter(Boolean).join(" — ")
      if (/numeric field overflow/i.test(msg)) {
        return NextResponse.json({ error: YEARS_KNOWN_ERROR }, { status: 400 })
      }
      return NextResponse.json({ error: msg || "Failed to save references" }, { status: 500 })
    }

    try {
      await markTenantStepCompletedByType(supabase, {
        workerId,
        tenantId,
        stepType: "references",
        stepKey: "references",
      })
    } catch (markErr) {
      console.error("[onboarding/worker-references] mark step completed", markErr)
    }

    return NextResponse.json({ ok: true, count: rows.length })
  } catch (err: unknown) {
    console.error("[onboarding/worker-references]", err)
    const msg = err instanceof Error ? err.message : "Unexpected error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
