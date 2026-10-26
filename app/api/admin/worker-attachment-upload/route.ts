import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { requireApiSession } from "@/lib/auth/api-session"
import { isStaffRole } from "@/lib/auth/app-role"
import { canAccessWorkerRecord } from "@/lib/auth/worker-record-access"
import {
  resolveDocumentField,
  sanitizeFileName,
  saveStaffLegacyDocumentUpload,
  saveStaffRequiredDocumentUpload,
  type StaffUploadResult,
} from "@/lib/admin/staff-document-upload"
import { isAcceptedDocumentFileType } from "@/lib/document-upload-helpers"
import { persistWorkerResumePath } from "@/lib/onboarding/persist-worker-resume-path"
import { getSupabaseUrl } from "@/lib/supabase-env"
import { WORKER_REQUIRED_FILES_BUCKET, WORKER_RESUMES_BUCKET } from "@/lib/supabase-storage-buckets"
import { enforceRateLimit, getClientIp } from "@/lib/security/rate-limit"
import { parseRequiredUuid } from "@/lib/validation/uuid"

export const runtime = "nodejs"

const MAX_RESUME_BYTES = Number(process.env.MAX_RESUME_UPLOAD_BYTES ?? 10 * 1024 * 1024)
const ALLOWED_RESUME_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

function uploadResponse(result: StaffUploadResult) {
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, path: result.path, bucket: result.bucket })
}

type ProfessionDocumentExpiryRow = {
  id: string
  has_expiration: boolean | null
}

async function saveProfessionDocumentUpload(
  supabase: SupabaseClient,
  input: {
    tenantId: string
    workerId: string
    professionDocumentId: string
    file: File
    issuedDate?: string
    expiryDate?: string
  }
): Promise<StaffUploadResult | null> {
  const { data, error } = await supabase
    .from("tenant_profession_documents")
    .select("id, has_expiration")
    .eq("id", input.professionDocumentId)
    .eq("tenant_id", input.tenantId)
    .eq("is_active", true)
    .maybeSingle()
  if (error) throw error
  const professionDoc = data as ProfessionDocumentExpiryRow | null
  if (!professionDoc) return null

  if (!isAcceptedDocumentFileType(input.file, ["pdf", "png", "jpg", "jpeg", "webp"])) {
    return { ok: false, status: 400, error: "File type not allowed. Upload a PNG, JPG, WebP, or PDF." }
  }
  if (input.file.size > 10 * 1024 * 1024) {
    return { ok: false, status: 400, error: "File exceeds 10MB limit" }
  }

  const { validateCredentialDates } = await import("@/lib/professions/catalog")
  const {
    countWorkerProfessionDocumentFiles,
    MAX_PROFESSION_DOCUMENT_FILES,
  } = await import("@/lib/professions/profession-documents")

  const hasExpiration = professionDoc.has_expiration === true
  const dateError = validateCredentialDates({
    hasExpiration,
    issuedDate: input.issuedDate ?? null,
    expiryDate: input.expiryDate ?? null,
  })
  if (dateError) {
    return { ok: false, status: 400, error: dateError }
  }

  const existingCount = await countWorkerProfessionDocumentFiles(
    supabase,
    input.tenantId,
    input.workerId,
    input.professionDocumentId
  )
  if (existingCount >= MAX_PROFESSION_DOCUMENT_FILES) {
    return {
      ok: false,
      status: 400,
      error: `You can upload at most ${MAX_PROFESSION_DOCUMENT_FILES} files for this document.`,
    }
  }

  const buffer = Buffer.from(await input.file.arrayBuffer())
  const objectPath = `${input.tenantId}/${input.workerId}/${input.professionDocumentId}/${randomUUID()}-${sanitizeFileName(input.file.name)}`
  const { error: uploadError } = await supabase.storage
    .from(WORKER_REQUIRED_FILES_BUCKET)
    .upload(objectPath, buffer, {
      contentType: input.file.type || "application/octet-stream",
      upsert: true,
    })
  if (uploadError) return { ok: false, status: 500, error: uploadError.message || "Upload failed" }

  const row = {
    tenant_id: input.tenantId,
    worker_id: input.workerId,
    profession_document_id: input.professionDocumentId,
    file_url: objectPath,
    original_file_name: input.file.name,
    file_type: input.file.type || null,
    file_size: input.file.size,
    status: "uploaded",
    issued_date: hasExpiration ? input.issuedDate || null : null,
    expiry_date: hasExpiration ? input.expiryDate || null : null,
    uploaded_at: new Date().toISOString(),
  }
  const { error: writeError } = await supabase
    .from("worker_profession_document_uploads")
    .insert(row as Record<string, unknown>)
  if (writeError) throw writeError

  return { ok: true, path: objectPath, bucket: WORKER_REQUIRED_FILES_BUCKET }
}

export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, {
      namespace: "admin-worker-attachment-upload",
      key: getClientIp(req),
      limit: Number(process.env.RATE_LIMIT_UPLOADS_PER_HOUR ?? 40),
      windowMs: 60 * 60 * 1000,
      failClosed: false,
    })
    if (limited) return limited

    const auth = await requireApiSession()
    if (auth instanceof NextResponse) return auth
    if (!isStaffRole(auth.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const workerIdRaw = String(formData.get("workerId") ?? "").trim()
    const requiredDocumentId = String(formData.get("requiredDocumentId") ?? "").trim() || null
    const documentTitle = String(formData.get("documentTitle") ?? "").trim()
    const documentFieldRaw = String(formData.get("documentField") ?? "").trim()
    const attachmentKind = String(formData.get("attachmentKind") ?? "").trim()

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }

    const idCheck = parseRequiredUuid(workerIdRaw, "workerId")
    if (!idCheck.ok) {
      return NextResponse.json({ error: idCheck.error }, { status: 400 })
    }
    const workerId = idCheck.value

    const url = getSupabaseUrl()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 503 })
    }

    const supabase = createClient(url, key)

    const { data: worker, error: wErr } = await supabase
      .from("worker")
      .select("id, tenant_id, user_id")
      .eq("id", workerId)
      .maybeSingle()

    if (wErr) throw wErr
    if (!worker?.id || worker.tenant_id == null) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 })
    }

    if (!canAccessWorkerRecord(auth, { id: String(worker.id), user_id: worker.user_id })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const tenantId = String(worker.tenant_id)
    const userId =
      worker.user_id != null && String(worker.user_id).trim()
        ? String(worker.user_id).trim()
        : workerId

    const isResume = attachmentKind === "resume" || (!requiredDocumentId && documentTitle.toLowerCase().includes("resume"))

    if (isResume) {
      const lowerName = file.name.toLowerCase()
      const mime = (file.type || "").toLowerCase()
      if (file.size > MAX_RESUME_BYTES) {
        return NextResponse.json({ error: "Resume file is too large" }, { status: 400 })
      }
      if (
        !ALLOWED_RESUME_MIME.has(mime) &&
        !lowerName.endsWith(".pdf") &&
        !lowerName.endsWith(".docx")
      ) {
        return NextResponse.json({ error: "Only PDF and DOCX resumes are supported" }, { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const objectPath = `${userId}/${randomUUID()}-${sanitizeFileName(file.name)}`

      const { error: uploadError } = await supabase.storage
        .from(WORKER_RESUMES_BUCKET)
        .upload(objectPath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message || "Upload failed" }, { status: 500 })
      }

      await persistWorkerResumePath(supabase, userId, objectPath)

      return NextResponse.json({ ok: true, path: objectPath, bucket: WORKER_RESUMES_BUCKET })
    }

    if (!requiredDocumentId) {
      const directDocumentField = resolveDocumentField(documentFieldRaw, documentTitle)
      if (!directDocumentField) {
        return NextResponse.json(
          { error: "Missing requiredDocumentId or documentField" },
          { status: 400 }
        )
      }
      return uploadResponse(
        await saveStaffLegacyDocumentUpload(supabase, {
          tenantId,
          workerId,
          actorUserId: auth.userId,
          column: directDocumentField,
          file,
          documentTitle,
        })
      )
    }

    const saved = await saveStaffRequiredDocumentUpload(supabase, {
      tenantId,
      workerId,
      actorUserId: auth.userId,
      uploadedByUserId: auth.devBypass ? null : auth.userId,
      requiredDocumentId,
      file,
      documentTitle,
      documentField: documentFieldRaw,
    })
    if (!saved.ok && saved.status === 404) {
      const professionSaved = await saveProfessionDocumentUpload(supabase, {
        tenantId,
        workerId,
        professionDocumentId: requiredDocumentId,
        file,
        issuedDate: String(formData.get("issuedDate") ?? "").trim() || undefined,
        expiryDate: String(formData.get("expiryDate") ?? "").trim() || undefined,
      })
      if (professionSaved) return uploadResponse(professionSaved)
    }
    return uploadResponse(saved)
  } catch (err: unknown) {
    console.error("[admin/worker-attachment-upload]", err)
    const msg = err instanceof Error ? err.message : "Unexpected error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
