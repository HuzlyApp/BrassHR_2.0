import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseUrl } from "@/lib/supabase-env"
import { validateStep1Form } from "@/lib/onboardingStep1Validation"
import { resolveOnboardingTenantId } from "@/lib/tenant/resolve-onboarding-tenant-id"
import { persistWorkerRow } from "@/lib/onboarding/persist-worker-row"
import { isDraftPreviewApplicantId } from "@/lib/onboarding/is-draft-preview"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const applicantId = typeof body.applicantId === "string" ? body.applicantId.trim() : ""
    if (!applicantId) {
      return NextResponse.json({ error: "Missing applicantId" }, { status: 400 })
    }

    const step1Fields = {
      firstName: String(body.firstName ?? ""),
      lastName: String(body.lastName ?? ""),
      address1: String(body.address1 ?? ""),
      address2: String(body.address2 ?? ""),
      city: String(body.city ?? ""),
      state: String(body.state ?? ""),
      zipCode: String(body.zipCode ?? ""),
      phone: String(body.phone ?? ""),
      email: String(body.email ?? ""),
      jobRole: String(body.jobRole ?? ""),
    }
    const step1Err = validateStep1Form(step1Fields)
    if (step1Err) {
      return NextResponse.json(
        { error: step1Err.message, code: "VALIDATION_ERROR", field: step1Err.code },
        { status: 400 },
      )
    }

    /**
     * Test workflow / draft preview uses a synthetic applicant id that is not a UUID.
     * Validate the form, but never persist a production worker.
     */
    if (isDraftPreviewApplicantId(applicantId)) {
      return NextResponse.json({ ok: true, preview: true })
    }

    const url = getSupabaseUrl()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url) {
      return NextResponse.json(
        {
          error: "MISSING_SUPABASE_URL",
          hint: "Set NEXT_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL in .env.local",
        },
        { status: 503 }
      )
    }
    if (!key) {
      return NextResponse.json(
        {
          error: "MISSING_SERVICE_ROLE_KEY",
          hint: "Set SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase → Project Settings → API → service_role). This is a secret key, not a job title or the worker table.",
        },
        { status: 503 }
      )
    }

    const supabase = createClient(url, key)

    const tenantSlug =
      typeof body.tenantSlug === "string" ? body.tenantSlug.trim().toLowerCase() : ""
    let tenantRes = await resolveOnboardingTenantId(supabase, tenantSlug || null)
    if (!tenantRes.ok) {
      return NextResponse.json(
        { error: tenantRes.error, code: "MISSING_TENANT" },
        { status: 503 },
      )
    }

    // When slug is missing, prefer an existing worker tenant for this applicant over the
    // platform default (first active tenant). Wrong default caused false DUPLICATE_EMAIL 409s.
    if (!tenantSlug) {
      const { data: existingWorkers } = await supabase
        .from("worker")
        .select("tenant_id")
        .eq("user_id", applicantId)
        .order("updated_at", { ascending: false })
        .limit(1)
      const existingTenantId = existingWorkers?.[0]?.tenant_id
        ? String(existingWorkers[0].tenant_id).toLowerCase()
        : ""
      if (existingTenantId) {
        tenantRes = { ok: true, tenantId: existingTenantId }
      }
    }
    const tenantId = tenantRes.tenantId

    const addressLat = Number(body.addressLat)
    const addressLng = Number(body.addressLng)
    const addressNormalized =
      typeof body.addressNormalized === "string" ? body.addressNormalized : undefined

    const saved = await persistWorkerRow(supabase, {
      applicantId,
      tenantId,
      fields: step1Fields,
      status: typeof body.status === "string" ? body.status : undefined,
      addressLat: Number.isFinite(addressLat) ? addressLat : undefined,
      addressLng: Number.isFinite(addressLng) ? addressLng : undefined,
      addressNormalized,
    })

    if (!saved.ok) {
      return NextResponse.json(
        { error: saved.error, code: saved.code },
        { status: saved.status ?? 500 }
      )
    }

    console.info("[onboarding/save-worker] profile saved", {
      workerId: saved.workerId,
      tenantId,
      applicantId,
      email: step1Fields.email.trim().toLowerCase(),
    })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error("[onboarding/save-worker]", err)
    const msg = err instanceof Error ? err.message : "Unexpected error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
