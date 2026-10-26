import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  buildWorkerUpdatePayload,
  isWorkerProfileFieldKey,
  normalizeLicenseExpiresValue,
  normalizeLicenseTypeValue,
  normalizeReferenceFieldValue,
  normalizeWorkerFieldValue,
  type ReferenceFieldValue,
  type WorkerProfileFieldKey,
} from "@/lib/admin/worker-profile-field-update"
import { syncApplicantProfileFromWorkerField } from "@/lib/admin/sync-applicant-profile-from-worker"
import { licenseTypeDisplayLabel } from "@/lib/applicant-portal/documents"
import { writeActivityLog } from "@/lib/audit/activity-log"
import {
  invalidateResourceCache,
  invalidateTableCache,
  invalidateTenantCache,
} from "@/lib/cache"
import { mapAdminOnboardingProgress } from "@/lib/admin-onboarding-progress"
import { loadAdminAttachmentRequirements } from "@/lib/onboarding/load-admin-attachment-requirements"
import { loadOnboardingApplicationSubmission } from "@/lib/onboarding/load-onboarding-application-submission"
import { requireApiSession, requireStaffApiSession } from "@/lib/auth/api-session"
import { isStaffRole } from "@/lib/auth/app-role"
import { canAccessWorkerRecord } from "@/lib/auth/worker-record-access"
import { normalizeResumeStorageObjectPath } from "@/lib/onboarding/normalize-resume-storage-path"
import {
  getLatestWorkerResumeStoragePath,
  syncWorkerPrimaryResumePath,
} from "@/lib/onboarding/sync-worker-primary-resume-path"
import { getSupabaseUrl } from "@/lib/supabase-env"
import { WORKER_RESUMES_BUCKET } from "@/lib/supabase-storage-buckets"
import { resolveStorageAccessibleUrl } from "@/lib/supabase/resolve-storage-accessible-url"
import { resolveWorkerProfilePhotoUrl } from "@/lib/applicant-portal/worker-profile-photo"
import { loadWorkerProfileSkills } from "@/lib/worker-profile-skills"
import { parseRequiredUuid } from "@/lib/validation/uuid"
import {
  findWorkerTenantEmailConflict,
  TENANT_EMAIL_TAKEN_MESSAGE,
} from "@/lib/tenant/tenant-email-uniqueness"
import { formatPipelineStatusLabel } from "@/lib/workers/candidate-status-label"
import {
  areFinalApprovalPrerequisitesMet,
  shouldPromoteToForApproval,
} from "@/lib/admin/promote-for-approval"
import { isEligibleForFinalApprovalView } from "@/lib/admin/final-approval"

export const runtime = "nodejs"

type WorkerProfileSupabaseClient = ReturnType<typeof createClient<any, "public", any>>

function hasUrl(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0
}

function urlOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s.length > 0 ? s : null
}

type FirmaSigningRow = {
  signing_request_id: string | null
  firma_status: string | null
  iframe_url: string | null
  updated_at: string | null
}

type StorageHit = {
  bucket: string
  path: string
  name: string
  created_at: string | null
}

type ClassifiedDocType = "license" | "tb" | "cpr" | "authorization" | "agreement_w2" | "agreement_i9"

function asTrimmedString(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((item) => String(item).trim()).filter((x) => x.length > 0)
}

export async function GET(req: NextRequest) {
  try {
    const workerIdRaw = req.nextUrl.searchParams.get("workerId")?.trim() || ""
    if (!workerIdRaw) {
      return NextResponse.json({ error: "Missing workerId" }, { status: 400 })
    }
    const idCheck = parseRequiredUuid(workerIdRaw, "workerId")
    if (!idCheck.ok) {
      return NextResponse.json({ error: idCheck.error }, { status: 400 })
    }
    const workerId = idCheck.value
    const applicationIdRaw = req.nextUrl.searchParams.get("applicationId")?.trim() || ""
    const applicationIdCheck = applicationIdRaw
      ? parseRequiredUuid(applicationIdRaw, "applicationId")
      : null
    const applicationId =
      applicationIdCheck && applicationIdCheck.ok ? applicationIdCheck.value : null

    const auth = await requireApiSession()
    if (auth instanceof NextResponse) return auth

    const url = getSupabaseUrl()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase service role not configured" }, { status: 503 })
    }

    const supabase = createClient(url, key)

    const { data: worker, error: wErr } = await supabase
      .from("worker")
      .select("*")
      .eq("id", workerId)
      .maybeSingle()

    if (wErr) throw wErr
    if (!worker?.id) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 })
    }

    const w = worker as Record<string, unknown>
    if (!canAccessWorkerRecord(auth, { id: String(w.id), user_id: w.user_id })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const userIdForLegacy =
      w.user_id != null && String(w.user_id).trim() !== "" ? String(w.user_id) : null
    const tenantIdForWorker =
      w.tenant_id != null && String(w.tenant_id).trim() !== "" ? String(w.tenant_id) : null

    const workerEmail = w.email != null ? String(w.email).trim().toLowerCase() : ""

    const [tenantResult, reqResult, docResult] = await Promise.all([
      tenantIdForWorker
        ? supabase
            .from("tenants")
            .select("onboarding_config_version")
            .eq("id", tenantIdForWorker)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("worker_requirements")
        .select("resume_path")
        .or(
          userIdForLegacy
            ? `worker_id.eq.${workerId},worker_id.eq.${userIdForLegacy}`
            : `worker_id.eq.${workerId}`
        )
        .limit(1),
      supabase.from("worker_documents").select("*").eq("worker_id", workerId).maybeSingle(),
    ])

    let onboardingConfigVersion = 0
    if (tenantIdForWorker) {
      onboardingConfigVersion =
        (tenantResult.data as { onboarding_config_version?: number } | null)
          ?.onboarding_config_version ?? 0
    }
    const skipLegacyStorageScan = onboardingConfigVersion >= 1

    const { error: reqErr } = reqResult
    if (reqErr) {
      console.warn("[admin/worker-profile] worker_requirements", reqErr)
    }

    const reqRow = Array.isArray(reqResult.data) ? reqResult.data[0] : reqResult.data
    const resumePathRaw = (reqRow as { resume_path?: string } | null | undefined)?.resume_path
    const resumePathStored =
      typeof resumePathRaw === "string" && resumePathRaw.trim() !== ""
        ? resumePathRaw.trim()
        : null

    let resumePathCanonical: string | null = null
    let resumeSource: "application_worker_resumes" | "worker_requirements.resume_path" | "worker_resumes" | "none" =
      "none"

    try {
      if (applicationId) {
        const scopedPath = await getLatestWorkerResumeStoragePath(supabase, workerId, {
          jobApplicationId: applicationId,
        })
        const scopedNormalized = scopedPath
          ? normalizeResumeStorageObjectPath(scopedPath)
          : null
        if (scopedNormalized) {
          resumePathCanonical = scopedNormalized
          resumeSource = "application_worker_resumes"
        }
      }
    } catch (scopedErr) {
      console.warn("[admin/worker-profile] application resume fallback", scopedErr)
    }

    if (!resumePathCanonical) {
      const fromRequirements = resumePathStored
        ? normalizeResumeStorageObjectPath(resumePathStored)
        : null
      if (fromRequirements) {
        resumePathCanonical = fromRequirements
        resumeSource = "worker_requirements.resume_path"
      }
    }

    if (!resumePathCanonical) {
      try {
        const fallbackPath = await getLatestWorkerResumeStoragePath(supabase, workerId)
        const fallbackNormalized = fallbackPath
          ? normalizeResumeStorageObjectPath(fallbackPath)
          : null
        if (fallbackNormalized) {
          resumePathCanonical = fallbackNormalized
          resumeSource = "worker_resumes"
        }
      } catch (fallbackErr) {
        console.warn("[admin/worker-profile] worker_resumes fallback", fallbackErr)
      }
    }

    if (
      resumePathCanonical &&
      resumeSource !== "worker_requirements.resume_path"
    ) {
      void syncWorkerPrimaryResumePath(supabase, workerId, userIdForLegacy).catch((err) => {
        console.warn("[admin/worker-profile] sync primary resume path", err)
      })
    }

    let resumeUrl: string | null = null
    if (resumePathCanonical) {
      const { data: signed, error: signErr } = await supabase.storage
        .from(WORKER_RESUMES_BUCKET)
        .createSignedUrl(resumePathCanonical, 3600)
      if (signErr) {
        console.warn("[admin/worker-profile] resume signed URL", signErr)
      } else {
        resumeUrl = signed?.signedUrl ?? null
      }
    }

    const { data: docRow } = docResult

    const docs = (docRow ?? null) as Record<string, unknown> | null
    const workerKeys = Array.from(
      new Set([workerId, userIdForLegacy].filter((x): x is string => Boolean(x && x.trim())))
    )

    let candidateBuckets: string[] = []
    let publicBucketSet = new Set<string>()
    let listHits: StorageHit[] = []

    if (!skipLegacyStorageScan) {
      const { data: allBuckets } = await supabase.storage.listBuckets()
      const bucketSet = new Set<string>((allBuckets ?? []).map((b) => b.id))
      candidateBuckets = Array.from(
        new Set(["docs", "worker_required_files", "worker-onboarding", "worker-resumes"])
      ).filter((bucket) => bucketSet.has(bucket))
      publicBucketSet = new Set<string>(
        (allBuckets ?? []).filter((b) => b.public).map((b) => b.id)
      )

      const candidatePaths = Array.from(
        new Set(
          workerKeys.flatMap((key) => [
            key,
            `license/${key}`,
            `tb/${key}`,
            `cpr/${key}`,
            `docs/${key}`,
            `authorization/${key}`,
            `agreement/${key}`,
            `onboarding/${key}`,
          ])
        )
      )
      const scanTargets = candidateBuckets.flatMap((bucket) =>
        candidatePaths.map((path) => ({ bucket, path }))
      )
      const listResults = await Promise.all(
        scanTargets.map(async ({ bucket, path }) => {
          const { data: files, error } = await supabase.storage.from(bucket).list(path, {
            limit: 25,
            sortBy: { column: "created_at", order: "desc" },
          })
          if (error || !Array.isArray(files)) return [] as StorageHit[]
          return files
            .filter((f) => Boolean(f?.name) && !String(f?.name).endsWith("/"))
            .map((f) => ({
              bucket,
              path: `${path}/${f.name}`,
              name: String(f.name),
              created_at: (f as { created_at?: string }).created_at ?? null,
            }))
        })
      )
      listHits = listResults.flat()
    }

    async function toAccessibleUrl(hit: StorageHit): Promise<string | null> {
      if (publicBucketSet.has(hit.bucket)) {
        return supabase.storage.from(hit.bucket).getPublicUrl(hit.path).data.publicUrl
      }
      const { data, error } = await supabase.storage.from(hit.bucket).createSignedUrl(hit.path, 3600)
      if (error) return null
      return data?.signedUrl ?? null
    }

    function classifyStorageHit(hit: StorageHit): ClassifiedDocType | null {
      const path = hit.path.toLowerCase()
      const name = hit.name.toLowerCase()
      const full = `${path} ${name}`
      if (
        path.startsWith("tb/") ||
        full.includes("tb test") ||
        full.includes("tb_test") ||
        full.includes("/tb-") ||
        full.includes("tuberculosis")
      ) {
        return "tb"
      }
      if (
        path.startsWith("cpr/") ||
        full.includes("cpr") ||
        full.includes("bls") ||
        full.includes("basic life support")
      ) {
        return "cpr"
      }
      if (
        full.includes("agreement_i9") ||
        full.includes("agreement-i9") ||
        (full.includes("/i9") && !full.includes("authorization"))
      ) {
        return "agreement_i9"
      }
      if (
        full.includes("agreement_w2") ||
        full.includes("agreement-w2") ||
        full.includes("/w2")
      ) {
        return "agreement_w2"
      }
      if (
        full.includes("authorization") ||
        full.includes("agreement") ||
        full.includes("w2") ||
        full.includes("i9") ||
        (hit.bucket === "worker-onboarding" && full.includes("document"))
      ) {
        return "authorization"
      }
      if (
        path.startsWith("license/") ||
        full.includes("nursing") ||
        full.includes("license")
      ) {
        return "license"
      }
      return null
    }

    function newestHit(hits: StorageHit[]): StorageHit | null {
      if (hits.length === 0) return null
      return [...hits].sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0
        const tb = b.created_at ? Date.parse(b.created_at) : 0
        return tb - ta
      })[0]
    }
    async function toAccessibleUrlIfAny(hit: StorageHit | null): Promise<string | null> {
      if (!hit) return null
      return toAccessibleUrl(hit)
    }

    const byType: Record<ClassifiedDocType, StorageHit[]> = {
      license: [],
      tb: [],
      cpr: [],
      authorization: [],
      agreement_w2: [],
      agreement_i9: [],
    }
    for (const hit of listHits) {
      const type = classifyStorageHit(hit)
      if (type) byType[type].push(hit)
    }
    const [
      storageNursingUrl,
      storageTbUrl,
      storageCprUrl,
      storageAuthUrlFromFiles,
      storageAgreementW2Url,
      storageAgreementI9Url,
    ] = await Promise.all([
      toAccessibleUrlIfAny(newestHit(byType.license)),
      toAccessibleUrlIfAny(newestHit(byType.tb)),
      toAccessibleUrlIfAny(newestHit(byType.cpr)),
      toAccessibleUrlIfAny(newestHit(byType.authorization)),
      toAccessibleUrlIfAny(newestHit(byType.agreement_w2)),
      toAccessibleUrlIfAny(newestHit(byType.agreement_i9)),
    ])
    const attachmentFiles = await Promise.all(
      listHits.slice(0, 12).map(async (hit) => ({
        bucket: hit.bucket,
        path: hit.path,
        name: hit.name,
        created_at: hit.created_at,
        url: await toAccessibleUrl(hit),
      }))
    )
    async function resolveDocUrl(stored: unknown, storageFallback: string | null): Promise<string | null> {
      const fromDb = await resolveStorageAccessibleUrl(supabase, urlOrNull(stored))
      return fromDb ?? storageFallback
    }

    const applicantName = `${String(w.first_name ?? "").trim()} ${String(w.last_name ?? "").trim()}`.trim() || "Applicant"

    const [
      refResult,
      workerRoleResult,
      activityResult,
      noteResult,
      firmaSigningResult,
      legacyReviewResult,
      nursingLicenseUrlResolved,
      tbTestUrlResolved,
      cprCertUrlResolved,
      ssnUrl,
      ssnBackUrl,
      driversLicenseUrl,
      driversLicenseBackUrl,
      agreementW2UrlResolved,
      agreementI9UrlResolved,
      licenseRecordResult,
      profileSkills,
      mapped,
      onboardingSubmissionResult,
      profilePhotoUrl,
    ] = await Promise.all([
      supabase
        .from("worker_references")
        .select("id, reference_first_name, reference_last_name, reference_phone, reference_email, created_at")
        .eq("worker_id", workerId)
        .order("created_at", { ascending: true })
        .limit(10),
      supabase.from("worker_category_roles").select("*").eq("worker_id", workerId),
      supabase
        .from("activity_logs")
        .select("id, action, entity_type, entity_id, details, created_at")
        .eq("entity_id", workerId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("worker_notes")
        .select("id, body, created_at, updated_at, created_by_user_id")
        .eq("worker_id", workerId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("worker_firma_signing_sessions")
        .select("signing_request_id,firma_status,iframe_url,updated_at")
        .eq("worker_id", workerId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("worker_legacy_document_reviews")
        .select("document_key, status")
        .eq("worker_id", workerId),
      resolveDocUrl(docs?.nursing_license_url, storageNursingUrl),
      resolveDocUrl(docs?.tb_test_url, storageTbUrl),
      resolveDocUrl(docs?.cpr_certification_url, storageCprUrl),
      resolveDocUrl(docs?.ssn_url, null),
      resolveDocUrl(docs?.ssn_back_url, null),
      resolveDocUrl(docs?.drivers_license_url, null),
      resolveDocUrl(docs?.drivers_license_back_url, null),
      resolveDocUrl(docs?.agreement_w2_url, storageAgreementW2Url),
      resolveDocUrl(docs?.agreement_i9_url, storageAgreementI9Url),
      supabase
        .from("worker_license_records")
        .select(
          "id, license_type, certification_name, license_number, expires_at, file_url, storage_path, status, uploaded_at"
        )
        .eq("worker_id", workerId)
        .order("uploaded_at", { ascending: false })
        .limit(5),
      loadWorkerProfileSkills(supabase, workerId),
      mapAdminOnboardingProgress({
        supabase,
        workerId,
        userId: userIdForLegacy,
        applicantName,
        workerDocuments: docs,
        resumePathRaw: resumePathStored,
        candidateBuckets,
        storageHits: listHits,
        firmaSigningStatus: null,
        referencesCount: 0,
        tenantId: tenantIdForWorker,
      }),
      tenantIdForWorker
        ? loadOnboardingApplicationSubmission(supabase, workerId, tenantIdForWorker).catch(
            (submissionErr) => {
              console.warn("[admin/worker-profile] onboarding submission", submissionErr)
              return null
            }
          )
        : Promise.resolve(null),
      resolveWorkerProfilePhotoUrl(supabase, w.profile_photo),
    ])

    const nursingLicenseUrl = nursingLicenseUrlResolved ?? storageNursingUrl
    const tbTestUrl = tbTestUrlResolved ?? storageTbUrl
    const cprCertUrl = cprCertUrlResolved ?? storageCprUrl
    const licenseOk = hasUrl(nursingLicenseUrl)
    const tbOk = hasUrl(tbTestUrl)
    const cprOk = hasUrl(cprCertUrl)
    const idOk = hasUrl(docs?.ssn_url) || hasUrl(docs?.drivers_license_url)

    const { data: refRows } = refResult

    const references = (refRows ?? []).map((r) => {
      const row = r as Record<string, unknown>
      const fn = String(row.reference_first_name ?? "").trim()
      const ln = String(row.reference_last_name ?? "").trim()
      const name = `${fn} ${ln}`.trim() || "—"
      return {
        id: String(row.id),
        name,
        phone: row.reference_phone != null ? String(row.reference_phone) : null,
        email: row.reference_email != null ? String(row.reference_email) : null,
      }
    })

    const { data: licenseRecordRows } = licenseRecordResult

    const licenseRecords = ((licenseRecordRows ?? []) as Record<string, unknown>[]).map((row) => {
      const licenseType = asTrimmedString(row.license_type) ?? ""
      const certificationName = asTrimmedString(row.certification_name)
      return {
        id: row.id != null ? String(row.id) : null,
        license_type: licenseType,
        certification_name: certificationName,
        license_type_label: licenseTypeDisplayLabel(licenseType, certificationName),
        license_number: asTrimmedString(row.license_number),
        expires_at: row.expires_at != null ? String(row.expires_at) : null,
        has_file: Boolean(asTrimmedString(row.storage_path) || asTrimmedString(row.file_url)),
        status: asTrimmedString(row.status),
        uploaded_at: asTrimmedString(row.uploaded_at),
      }
    })

    const primaryLicense = licenseRecords[0] ?? null

    let skillAssessmentRows: Record<string, unknown>[] = []
    let saCompleted = 0
    let saTotal = 0

    const positions = toStringArray(w.positions)
    const experienceYearsRaw = w.experience_years ?? w.years_experience
    const experienceYears =
      typeof experienceYearsRaw === "number"
        ? experienceYearsRaw
        : experienceYearsRaw != null && String(experienceYearsRaw).trim() !== ""
          ? Number(experienceYearsRaw)
          : null

    const { data: workerRoleRows } = workerRoleResult
    const workerRoles = ((workerRoleRows ?? []) as Record<string, unknown>[]).filter(
      (row) => row != null
    )
    const categoryIds = workerRoles
      .map((row) => String(row.job_category_id ?? "").trim())
      .filter((id) => id.length > 0)
    const { data: jobCategoryRows } = await supabase
      .from("job_categories")
      .select("*")
      .in("id", categoryIds.length > 0 ? categoryIds : ["00000000-0000-0000-0000-000000000000"])
    const jobCategoryById = new Map<string, Record<string, unknown>>(
      ((jobCategoryRows ?? []) as Record<string, unknown>[]).map((row) => [String(row.id ?? ""), row])
    )
    const roleAssignments = workerRoles.map((row) => {
      const categoryId = String(row.job_category_id ?? "")
      const cat = jobCategoryById.get(categoryId)
      return {
        role: asTrimmedString(row.role),
        job_category_id: categoryId || null,
        job_category_name: asTrimmedString(cat?.name),
        created_at: asTrimmedString(row.created_at),
      }
    })

    const workerAuthId = asTrimmedString(w.user_id)
    const facilityAssignments: Array<Record<string, unknown>> = []
    if (workerAuthId) {
      const { data: assignmentRows } = await supabase
        .from("worker_shift_assignments")
        .select("*")
        .eq("worker_id", workerAuthId)
      const assignments = (assignmentRows ?? []) as Record<string, unknown>[]
      if (assignments.length > 0) {
        const shiftIds = assignments
          .map((row) => String(row.shift_id ?? "").trim())
          .filter((id) => id.length > 0)
        const { data: shiftRows } = await supabase
          .from("shifts")
          .select("*")
          .in("id", shiftIds.length > 0 ? shiftIds : ["00000000-0000-0000-0000-000000000000"])
        const shiftById = new Map<string, Record<string, unknown>>(
          ((shiftRows ?? []) as Record<string, unknown>[]).map((row) => [String(row.id ?? ""), row])
        )
        const facilityIds = ((shiftRows ?? []) as Record<string, unknown>[])
          .map((row) => String(row.facility_id ?? "").trim())
          .filter((id) => id.length > 0)
        const { data: facilityRows } = await supabase
          .from("facility")
          .select("*")
          .in(
            "id",
            facilityIds.length > 0 ? facilityIds : ["00000000-0000-0000-0000-000000000000"]
          )
        const facilityById = new Map<string, Record<string, unknown>>(
          ((facilityRows ?? []) as Record<string, unknown>[]).map((row) => [String(row.id ?? ""), row])
        )
        for (const assignment of assignments) {
          const shift = shiftById.get(String(assignment.shift_id ?? ""))
          const facility = shift ? facilityById.get(String(shift.facility_id ?? "")) : null
          facilityAssignments.push({
            assignment_id: assignment.id ?? null,
            assigned_at: asTrimmedString(assignment.assigned_at),
            status: asTrimmedString(assignment.status),
            shift_id: assignment.shift_id ?? null,
            shift_title: asTrimmedString(shift?.title),
            facility_id: shift?.facility_id ?? null,
            facility_name: asTrimmedString(facility?.name),
            facility_address: asTrimmedString(facility?.address),
          })
        }
      }
    }

    const { data: activityRows } = activityResult
    const activityLogs = ((activityRows ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id ?? null,
      action: asTrimmedString(row.action),
      entity_type: asTrimmedString(row.entity_type),
      entity_id: row.entity_id ?? null,
      details: row.details ?? null,
      created_at: asTrimmedString(row.created_at),
    }))

    const { data: noteRows, error: notesErr } = noteResult
    if (notesErr) {
      console.warn("[admin/worker-profile] worker_notes", notesErr)
    }
    const noteAuthorIds = [
      ...new Set(
        ((noteRows ?? []) as { created_by_user_id?: string | null }[])
          .map((row) => row.created_by_user_id)
          .filter((id): id is string => Boolean(id))
      ),
    ]
    const noteAuthorsById = new Map<string, { first_name: string | null; last_name: string | null }>()
    if (noteAuthorIds.length > 0) {
      const { data: noteAuthors } = await supabase
        .from("users")
        .select("id, first_name, last_name")
        .in("id", noteAuthorIds)
      for (const author of (noteAuthors ?? []) as {
        id: string
        first_name: string | null
        last_name: string | null
      }[]) {
        noteAuthorsById.set(author.id, author)
      }
    }
    const workerNotes = ((noteRows ?? []) as Record<string, unknown>[]).map((row) => {
      const authorId =
        row.created_by_user_id != null ? String(row.created_by_user_id) : null
      const author = authorId ? noteAuthorsById.get(authorId) : null
      const authorName = author
        ? `${author.first_name ?? ""} ${author.last_name ?? ""}`.trim() || "Recruiter"
        : "Recruiter"
      return {
        id: row.id ?? null,
        body: asTrimmedString(row.body),
        created_at: asTrimmedString(row.created_at),
        updated_at: asTrimmedString(row.updated_at),
        author_name: authorName,
      }
    })

    let firmaSigning: FirmaSigningRow | null = null
    const { data: firmaRow, error: firmaErr } = firmaSigningResult
    if (firmaErr) {
      console.warn("[admin/worker-profile] worker_firma_signing_sessions", firmaErr)
    } else {
      firmaSigning = (firmaRow as FirmaSigningRow | null) ?? null
    }

    skillAssessmentRows = mapped.skillAssessments.rows
    saCompleted = mapped.skillAssessments.completed
    saTotal = mapped.skillAssessments.total
    const onboardingSteps = mapped.steps
    const onboardingCompletion = {
      completedSteps: mapped.completedSteps,
      totalSteps: mapped.totalSteps,
      percent: mapped.completionPercent,
    }

    const onboardingSubmission = onboardingSubmissionResult

    const createdAt = w.created_at != null ? String(w.created_at) : null
    const updatedAt = w.updated_at != null ? String(w.updated_at) : createdAt

    let statusNorm = String(w.status ?? w.worker_status ?? "new").trim().toLowerCase() || "new"

    try {
      const { loadWorkerPipelineChecklistItems, pipelineItemIsComplete } = await import(
        "@/lib/worker-pipeline-checklist"
      )
      const pipelineRows = await loadWorkerPipelineChecklistItems(supabase, workerId)
      const sections = [
        {
          id: "screening",
          rows: [
            {
              id: "call_1",
              checked: pipelineItemIsComplete(pipelineRows.get("call_1")),
              callLogCompleted: pipelineRows.get("call_1")?.call_log_completed === true,
              state: pipelineItemIsComplete(pipelineRows.get("call_1")) ? "complete" : "pending",
            },
            {
              id: "call_2",
              checked: pipelineItemIsComplete(pipelineRows.get("call_2")),
              callLogCompleted: pipelineRows.get("call_2")?.call_log_completed === true,
              state: pipelineItemIsComplete(pipelineRows.get("call_2")) ? "complete" : "pending",
            },
          ],
        },
      ]
      const prerequisitesComplete = areFinalApprovalPrerequisitesMet({
        hasWorker: true,
        sections,
        skillAssessments: { completed: saCompleted, total: saTotal },
        referencesCount: references.length,
      })
      const finalApprovalReady = isEligibleForFinalApprovalView({
        workerStatus: statusNorm,
        checklistProgressPercent: onboardingCompletion.percent,
        onboardingCompletionPercent: onboardingCompletion.percent,
        trackerDoneCount: prerequisitesComplete ? 4 : 0,
      })
      if (
        shouldPromoteToForApproval({
          workerId,
          currentStatus: statusNorm,
          prerequisitesComplete,
          finalApprovalReady,
        })
      ) {
        const now = new Date().toISOString()
        const { error: promoteErr } = await supabase
          .from("worker")
          .update({ status: "for_approval", updated_at: now })
          .eq("id", workerId)
        if (!promoteErr) {
          statusNorm = "for_approval"
          w.status = "for_approval"
        }
      }
    } catch (promoteErr) {
      console.warn("[admin/worker-profile] for_approval promotion", promoteErr)
    }

    const statusLabel = formatPipelineStatusLabel(statusNorm)

    const resolvedDocumentUrl = await resolveDocUrl(docs?.document_url, storageAuthUrlFromFiles)
    const storageAuthUrl = resolvedDocumentUrl ?? firmaSigning?.iframe_url ?? null
    const agreementW2Url =
      agreementW2UrlResolved ?? storageAgreementW2Url ?? storageAuthUrl
    const agreementI9Url = agreementI9UrlResolved ?? storageAgreementI9Url

    const legacyUrls = {
      nursing_license_url: nursingLicenseUrl,
      tb_test_url: tbTestUrl,
      cpr_certification_url: cprCertUrl,
      authorization_document_url: storageAuthUrl,
      agreement_w2_url: agreementW2Url,
      agreement_i9_url: agreementI9Url,
      ssn_url: ssnUrl,
      drivers_license_url: driversLicenseUrl,
    }

    const { data: legacyReviewRows } = legacyReviewResult
    const legacyDocumentReviews = Object.fromEntries(
      (legacyReviewRows ?? [])
        .map((row) => {
          const key = String((row as { document_key?: string }).document_key ?? "").trim()
          const status = String((row as { status?: string }).status ?? "").trim()
          return key && status ? [key, status] : null
        })
        .filter((entry): entry is [string, string] => entry != null)
    )

    let attachmentRequirements: Awaited<ReturnType<typeof loadAdminAttachmentRequirements>> = []
    if (tenantIdForWorker) {
      try {
        attachmentRequirements = await loadAdminAttachmentRequirements(
          {
            supabase,
            workerId,
            tenantId: tenantIdForWorker,
            resumeUrl,
            resumePath: resumePathCanonical,
            resumePathRaw: resumePathStored,
            legacyUrls,
          },
          { onboardingConfigVersion, legacyReviewRows: legacyReviewRows ?? [] }
        )
      } catch (attachErr) {
        console.warn("[admin/worker-profile] attachment requirements", attachErr)
      }
    }

    console.info("[debug-doc-upload] admin-worker-profile:attachment-mapping", {
      route: "GET /api/admin/worker-profile",
      workerId,
      workerUserId: userIdForLegacy,
      bucketCandidates: candidateBuckets,
      storageHits: listHits.length,
      classifiedCounts: {
        license: byType.license.length,
        tb: byType.tb.length,
        cpr: byType.cpr.length,
        authorization: byType.authorization.length,
      },
      dbUrls: {
        nursing_license_url: urlOrNull(docs?.nursing_license_url),
        tb_test_url: urlOrNull(docs?.tb_test_url),
        cpr_certification_url: urlOrNull(docs?.cpr_certification_url),
        document_url: urlOrNull(docs?.document_url),
      },
      resolvedUrls: {
        nursing_license_url: nursingLicenseUrl,
        tb_test_url: tbTestUrl,
        cpr_certification_url: cprCertUrl,
        authorization_document_url: storageAuthUrl,
      },
    })

    void writeActivityLog({
      actorUserId: auth.devBypass ? null : auth.userId,
      tenantId: tenantIdForWorker,
      action: isStaffRole(auth.role) ? "worker.profile.view" : "worker.profile.self_view",
      entityType: "worker",
      entityId: workerId,
      metadata: {
        route: "GET /api/admin/worker-profile",
        staff: isStaffRole(auth.role),
        tenant_id: tenantIdForWorker,
      },
      request: req,
    })

    return NextResponse.json({
      worker: {
        id: String(w.id),
        first_name: w.first_name != null ? String(w.first_name) : null,
        last_name: w.last_name != null ? String(w.last_name) : null,
        email: w.email != null ? String(w.email) : null,
        phone: w.phone != null ? String(w.phone) : null,
        address1: w.address1 != null ? String(w.address1) : null,
        address2: w.address2 != null ? String(w.address2) : null,
        city: w.city != null ? String(w.city) : null,
        state: w.state != null ? String(w.state) : null,
        zip: w.zip != null ? String(w.zip) : null,
        job_role: w.job_role != null ? String(w.job_role) : null,
        created_at: createdAt,
        updated_at: updatedAt,
        status: statusNorm,
        status_label: statusLabel,
        date_of_birth: w.date_of_birth != null ? String(w.date_of_birth) : null,
        years_experience:
          experienceYears,
        hourly_rate: w.hourly_rate != null ? String(w.hourly_rate) : null,
        ssn_last_four: w.ssn_last_four != null ? String(w.ssn_last_four) : null,
        positions,
        profile_photo_url: profilePhotoUrl,
        employee_id: asTrimmedString(w.employee_id) ?? asTrimmedString(w.employee_number),
        employee_number: asTrimmedString(w.employee_number),
        employment_type: asTrimmedString(w.employment_type),
        reports_to: asTrimmedString(w.reports_to) ?? asTrimmedString(w.manager_name),
        converted_worker_type: asTrimmedString(w.converted_worker_type),
        converted_at: w.converted_at != null ? String(w.converted_at) : null,
      },
      requirements: {
        resume_path: resumePathCanonical,
        resume_path_raw: resumePathStored,
        resume_url: resumeUrl,
      },
      documents: docs
        ? {
            updated_at: docs.updated_at != null ? String(docs.updated_at) : null,
            nursing_license_url: licenseOk,
            tb_test_url: tbOk,
            cpr_certification_url: cprOk,
            identity_uploaded: idOk,
          }
        : null,
      document_urls: {
        nursing_license_url: nursingLicenseUrl,
        tb_test_url: tbTestUrl,
        cpr_certification_url: cprCertUrl,
        ssn_url: ssnUrl,
        ssn_back_url: ssnBackUrl,
        drivers_license_url: driversLicenseUrl,
        drivers_license_back_url: driversLicenseBackUrl,
        authorization_document_url: storageAuthUrl,
        agreement_w2_url: agreementW2Url,
        agreement_i9_url: agreementI9Url,
      },
      signeasy: {
        document_name:
          docs != null && docs.document_name != null ? String(docs.document_name) : null,
        document_id:
          docs != null && docs.document_id != null ? String(docs.document_id) : null,
      },
      firma_signing: {
        signing_request_id: firmaSigning?.signing_request_id ?? null,
        firma_status: firmaSigning?.firma_status ?? null,
        iframe_url: firmaSigning?.iframe_url ?? null,
        updated_at: firmaSigning?.updated_at ?? null,
      },
      references,
      skillAssessments: { completed: saCompleted, total: saTotal, rows: skillAssessmentRows },
      onboardingSteps,
      onboardingCompletion,
      onboardingSubmission,
      nursing_licenses:
        licenseRecords.length > 0
          ? licenseRecords.map((row) => ({
              id: row.id,
              license_url: row.has_file ? "attached" : null,
              state: asTrimmedString(w.state),
              license_type: row.license_type_label || row.license_type,
              license_type_key: row.license_type,
              expires_at: row.expires_at,
            }))
          : [
              {
                license_url: urlOrNull(docs?.nursing_license_url),
                state: asTrimmedString(w.state),
                license_type: asTrimmedString(w.job_role),
                license_type_key: null,
                expires_at: null,
              },
            ].filter((row) => row.license_url != null),
      profile_license: primaryLicense,
      license_records: licenseRecords,
      education: {
        source: resumeSource,
        resume_available: Boolean(resumePathCanonical),
        items: [] as Array<Record<string, unknown>>,
      },
      experience: {
        years: experienceYears,
        job_role: asTrimmedString(w.job_role),
        positions,
        role_assignments: roleAssignments,
      },
      skills: {
        positions,
        role_assignments: roleAssignments,
        assessed_categories: skillAssessmentRows.map((row) => ({
          category: asTrimmedString(row.category),
          category_title: asTrimmedString(row.category_title),
          completed: row.completed === true,
        })),
      },
      facilities_assigned: facilityAssignments,
      profile_skills: profileSkills,
      notes: workerNotes,
      attachment_files: attachmentFiles,
      attachment_requirements: attachmentRequirements,
      legacy_document_reviews: legacyDocumentReviews,
      activity_logs: activityLogs,
      activity_history: activityLogs,
      activity: {
        source: "Onboarding application",
        created_at: createdAt,
        updated_at: updatedAt,
      },
    })
  } catch (err: unknown) {
    console.error("[admin/worker-profile]", err)
    const msg = err instanceof Error ? err.message : "Unexpected error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function isMissingColumnErr(e: unknown) {
  const err = e as { code?: string; message?: string } | null
  if (!err) return false
  if (err.code === "42703") return true
  return typeof err.message === "string" && err.message.includes(" does not exist")
}

async function upsertWorkerReference(
  supabase: WorkerProfileSupabaseClient,
  workerId: string,
  tenantId: string,
  referenceIndex: number,
  value: ReferenceFieldValue
) {
  const { data: existingRows, error: listErr } = await supabase
    .from("worker_references")
    .select("id")
    .eq("worker_id", workerId)
    .order("created_at", { ascending: true })
    .limit(10)

  if (listErr) throw listErr

  const existing = (existingRows ?? [])[referenceIndex] as { id?: string } | undefined
  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    worker_id: workerId,
    reference_first_name: value.first,
    reference_last_name: value.last,
    reference_phone: value.phone,
    reference_email: value.email,
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("worker_references")
      .update(row as never)
      .eq("id", existing.id)
    if (error) throw error
    return { id: String(existing.id) }
  }

  const { data: inserted, error } = await supabase
    .from("worker_references")
    .insert(row as never)
    .select("id")
    .maybeSingle()

  if (error) throw error
  const insertedRow = inserted as { id?: string | number | null } | null
  return { id: insertedRow?.id != null ? String(insertedRow.id) : null }
}

async function upsertPrimaryLicenseRecord(
  supabase: WorkerProfileSupabaseClient,
  workerId: string,
  tenantId: string,
  patch: { license_type?: string; expires_at?: string }
) {
  const { data: existingRows, error: listErr } = await supabase
    .from("worker_license_records")
    .select("id, license_type, expires_at")
    .eq("worker_id", workerId)
    .order("uploaded_at", { ascending: false })
    .limit(1)

  if (listErr) throw listErr

  const existing = (existingRows ?? [])[0] as
    | { id?: string; license_type?: string; expires_at?: string | null }
    | undefined

  if (existing?.id) {
    const updateRow: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.license_type) updateRow.license_type = patch.license_type
    if (patch.expires_at) updateRow.expires_at = patch.expires_at

    const { error } = await supabase
      .from("worker_license_records")
      .update(updateRow as never)
      .eq("id", existing.id)
    if (error) throw error
    return { id: String(existing.id) }
  }

  return { id: null }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireStaffApiSession()
    if (auth instanceof NextResponse) return auth

    const body = (await req.json().catch(() => ({}))) as {
      workerId?: string
      field?: string
      value?: unknown
      referenceIndex?: number
    }

    const idCheck = parseRequiredUuid(body.workerId?.trim() ?? "", "workerId")
    if (!idCheck.ok) {
      return NextResponse.json({ error: idCheck.error }, { status: 400 })
    }
    const workerId = idCheck.value

    const url = getSupabaseUrl()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase service role not configured" }, { status: 503 })
    }

    const supabase = createClient(url, key)

    const { data: worker, error: workerErr } = await supabase
      .from("worker")
      .select("id, user_id, tenant_id, email")
      .eq("id", workerId)
      .maybeSingle()

    if (workerErr) throw workerErr
    if (!worker?.id || !worker.tenant_id) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 })
    }

    if (!canAccessWorkerRecord(auth, { id: String(worker.id), user_id: worker.user_id })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const tenantId = String(worker.tenant_id)
    const field = typeof body.field === "string" ? body.field.trim() : ""

    if (field === "reference") {
      const referenceIndex =
        typeof body.referenceIndex === "number" && body.referenceIndex >= 0
          ? Math.floor(body.referenceIndex)
          : -1
      if (referenceIndex < 0 || referenceIndex > 9) {
        return NextResponse.json({ error: "Invalid reference index" }, { status: 400 })
      }

      const parsed = normalizeReferenceFieldValue(body.value)
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 })
      }

      const saved = await upsertWorkerReference(
        supabase,
        workerId,
        tenantId,
        referenceIndex,
        parsed.value
      )

      void writeActivityLog({
        actorUserId: auth.devBypass ? null : auth.userId,
        tenantId,
        action: "worker.profile.reference_update",
        entityType: "worker",
        entityId: workerId,
        metadata: {
          route: "PATCH /api/admin/worker-profile",
          reference_index: referenceIndex,
          reference_id: saved.id,
        },
        request: req,
      })

      return NextResponse.json({ ok: true, reference: saved })
    }

    if (field === "license_type") {
      const parsed = normalizeLicenseTypeValue(body.value)
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 })
      }

      const saved = await upsertPrimaryLicenseRecord(supabase, workerId, tenantId, {
        license_type: parsed.value,
      })

      void writeActivityLog({
        actorUserId: auth.devBypass ? null : auth.userId,
        tenantId,
        action: "worker.profile.license_type_update",
        entityType: "worker",
        entityId: workerId,
        metadata: { route: "PATCH /api/admin/worker-profile", license_id: saved.id },
        request: req,
      })

      return NextResponse.json({ ok: true, license: saved })
    }

    if (field === "license_expires_at") {
      const parsed = normalizeLicenseExpiresValue(body.value)
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 })
      }

      const saved = await upsertPrimaryLicenseRecord(supabase, workerId, tenantId, {
        expires_at: parsed.value,
      })

      void writeActivityLog({
        actorUserId: auth.devBypass ? null : auth.userId,
        tenantId,
        action: "worker.profile.license_expires_update",
        entityType: "worker",
        entityId: workerId,
        metadata: { route: "PATCH /api/admin/worker-profile", license_id: saved.id },
        request: req,
      })

      return NextResponse.json({ ok: true, license: saved })
    }

    if (!isWorkerProfileFieldKey(field)) {
      return NextResponse.json({ error: "Invalid field" }, { status: 400 })
    }

    const normalized = normalizeWorkerFieldValue(field as WorkerProfileFieldKey, body.value)
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 })
    }

    if (field === "email" && typeof normalized.dbValue === "string") {
      const conflict = await findWorkerTenantEmailConflict(supabase, {
        tenantId,
        email: normalized.dbValue,
        excludeWorkerId: workerId,
      })
      if (conflict) {
        return NextResponse.json({ error: TENANT_EMAIL_TAKEN_MESSAGE }, { status: 409 })
      }
    }

    const updatePayload = buildWorkerUpdatePayload(
      field as WorkerProfileFieldKey,
      normalized.dbValue
    )

    const { data: updated, error: updateErr } = await supabase
      .from("worker")
      .update(updatePayload as never)
      .eq("id", workerId)
      .select("id")
      .maybeSingle()

    if (updateErr) {
      if (isMissingColumnErr(updateErr)) {
        return NextResponse.json(
          {
            error: "This field is not available in the database yet. Apply the latest migrations.",
          },
          { status: 503 }
        )
      }
      throw updateErr
    }

    if (!updated?.id) {
      return NextResponse.json({ error: "Update failed" }, { status: 500 })
    }

    try {
      await syncApplicantProfileFromWorkerField({
        supabase,
        tenantId,
        workerId,
        field: field as WorkerProfileFieldKey,
        dbValue: normalized.dbValue,
      })
    } catch (syncErr) {
      console.warn("[admin/worker-profile] applicant_profiles sync failed", syncErr)
    }

    const userIdForLegacy =
      worker.user_id != null && String(worker.user_id).trim() !== ""
        ? String(worker.user_id)
        : null

    await Promise.all([
      invalidateResourceCache("worker", workerId),
      invalidateTenantCache("worker_search", tenantId),
      invalidateTenantCache("worker", tenantId),
      userIdForLegacy ? invalidateResourceCache("worker", userIdForLegacy) : Promise.resolve(),
      invalidateTableCache("worker_search"),
    ])

    void writeActivityLog({
      actorUserId: auth.devBypass ? null : auth.userId,
      tenantId,
      action: "worker.profile.field_update",
      entityType: "worker",
      entityId: workerId,
      metadata: {
        route: "PATCH /api/admin/worker-profile",
        field,
      },
      request: req,
    })

    return NextResponse.json({ ok: true, field, workerId })
  } catch (err: unknown) {
    console.error("[admin/worker-profile] PATCH", err)
    const msg = err instanceof Error ? err.message : "Unexpected error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
