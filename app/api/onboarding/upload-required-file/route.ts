import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getSupabaseUrl } from "@/lib/supabase-env"
import { isAcceptedDocumentFileType } from "@/lib/document-upload-helpers"
import { WORKER_REQUIRED_FILES_BUCKET } from "@/lib/supabase-storage-buckets"
import { enforceRateLimit, getClientIp } from "@/lib/security/rate-limit"

export const runtime = "nodejs"
const MAX_UPLOAD_BYTES = Number(process.env.MAX_REQUIRED_FILE_UPLOAD_BYTES ?? 10 * 1024 * 1024)
const ALLOWED_UPLOAD_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]
const ALLOWED_EXTRA_FILE_TYPES = [
  ...ALLOWED_UPLOAD_TYPES,
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]

function sanitizeFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200)
}

export async function POST(req: Request) {
  try {
    const limited = await enforceRateLimit(req, {
      namespace: "upload-required-file",
      key: getClientIp(req),
      limit: Number(process.env.RATE_LIMIT_UPLOADS_PER_HOUR ?? 20),
      windowMs: 60 * 60 * 1000,
      failClosed: false,
    })
    if (limited) return limited

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const folderRaw = formData.get("folder")
    const applicantIdRaw = formData.get("applicantId")
    const folder = typeof folderRaw === "string" ? folderRaw.trim() : ""
    const applicantId =
      typeof applicantIdRaw === "string" ? applicantIdRaw.trim() : ""

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 })
    }
    if (!folder) {
      return NextResponse.json({ error: "Missing folder" }, { status: 400 })
    }
    if (!applicantId) {
      return NextResponse.json({ error: "Missing applicantId" }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File is too large" }, { status: 400 })
    }
    const allowedFolder = /^(ssn|license|tb|cpr|other)$/
    if (!allowedFolder.test(folder)) {
      return NextResponse.json({ error: "Invalid folder" }, { status: 400 })
    }
    const allowedTypes = folder === "other" ? ALLOWED_EXTRA_FILE_TYPES : ALLOWED_UPLOAD_TYPES
    if (!isAcceptedDocumentFileType(file, allowedTypes)) {
      return NextResponse.json(
        {
          error:
            folder === "other"
              ? "File type not allowed. Upload a PNG, JPG, WebP, PDF, DOC, or DOCX."
              : "File type not allowed. Upload a PNG, JPG, WebP, or PDF.",
        },
        { status: 400 }
      )
    }
    console.info("[debug-doc-upload] upload-required-file:start", {
      route: "/api/onboarding/upload-required-file",
      fileName: file.name,
      documentType: folder,
      applicantId,
      bucket: WORKER_REQUIRED_FILES_BUCKET,
    })

    const buffer = Buffer.from(await file.arrayBuffer())

    const url = getSupabaseUrl()
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json(
        { error: "Supabase service role not configured" },
        { status: 503 }
      )
    }

    const supabase = createClient(url, key)
    const path = `${folder}/${applicantId}/${Date.now()}-${randomUUID()}-${sanitizeFileName(file.name)}`

    const { error: uploadError } = await supabase.storage
      .from(WORKER_REQUIRED_FILES_BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (uploadError) {
      console.error("[debug-doc-upload] upload-required-file:error", {
        route: "/api/onboarding/upload-required-file",
        fileName: file.name,
        documentType: folder,
        applicantId,
        bucket: WORKER_REQUIRED_FILES_BUCKET,
        uploadedPath: path,
        error: uploadError.message,
      })
      return NextResponse.json(
        { error: uploadError.message || "Upload failed" },
        { status: 500 }
      )
    }

    const { data: signed } = await supabase.storage
      .from(WORKER_REQUIRED_FILES_BUCKET)
      .createSignedUrl(path, 60 * 60)
    const accessibleUrl = signed?.signedUrl || path
    console.info("[debug-doc-upload] upload-required-file:success", {
      route: "/api/onboarding/upload-required-file",
      fileName: file.name,
      documentType: folder,
      applicantId,
      bucket: WORKER_REQUIRED_FILES_BUCKET,
      uploadedPath: path,
      generatedUrl: accessibleUrl,
    })

    return NextResponse.json({
      path,
      publicUrl: accessibleUrl,
      fileName: file.name,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
