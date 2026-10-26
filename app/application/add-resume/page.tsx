"use client"

import { APPLICATION_ROUTES } from "@/lib/onboarding/application-routes"
import { applicationPath } from "@/lib/tenant/with-tenant"
import { useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import OnboardingStepper from "@/app/components/OnboardingStepper"
import OnboardingLoader from "@/app/components/OnboardingLoader"
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext"
import {
  brandingShellGradient,
  brandingToCssVars,
  hexToRgba,
  isRemoteOrBlobImageSrc,
  normalizeBrandingImageSrc,
  tenantApplicantPanelLogoUrl,
} from "@/lib/tenant/tenant-branding"
import {
  evaluateResumeParseQuality,
  normalizedResumeToStoredJson,
  RESUME_PARSE_FAILED_USER_MESSAGE,
} from "@/lib/resumeParseQuality"
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon"
import BrandingRightPanelLogo, {
  BRANDING_RIGHT_PANEL_STACK_GAP_CLASS,
} from "@/app/components/BrandingRightPanelLogo"
import BrandedUploadIcon from "@/app/components/BrandedUploadIcon"
import { setScopedApplicantId } from "@/lib/tenant/scoped-storage"
import { uploadFileViaSignedUrl } from "@/lib/resume/direct-resume-upload-client"
import { readStoredApplyLocation } from "@/lib/service-area/apply-location-client"
import { readServiceAreaApiMessage } from "@/lib/service-area/copy"
import { useOnboardingConfigOptional } from "@/app/components/onboarding/OnboardingConfigProvider"
import {
  findResumeUploadStep,
  markResumeUploadStepComplete,
} from "@/lib/onboarding/mark-resume-upload-step-complete"
import { workerSignInHref } from "@/lib/auth/worker-sign-in"
import { currentOnboardingTenantSlug } from "@/lib/tenant/with-tenant"
import {
  isWorkflowTestSession,
  shouldGateResumeEntryByJobBoard,
} from "@/lib/onboarding/workflow-test-session"

const APPLICANT_SESSION_TIMEOUT_MS = 15_000
const WORKER_ENSURE_TIMEOUT_MS = 15_000
const RESUME_UPLOAD_TIMEOUT_MS = 45_000
const WORKER_REQUIREMENTS_TIMEOUT_MS = 10_000
const UPLOAD_WATCHDOG_TIMEOUT_MS = 60_000

function timeoutError(message: string) {
  return new Error(message)
}

function promiseWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: number | undefined
  return Promise.race([
    promise.finally(() => {
      if (timer) window.clearTimeout(timer)
    }),
    new Promise<T>((_, reject) => {
      timer = window.setTimeout(() => reject(timeoutError(message)), ms)
    }),
  ])
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  ms: number,
  message: string,
): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(timeoutError(message)), ms)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw timeoutError(message)
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

export default function Step1Upload() {
  const branding = useTenantBranding()
  const shellStyle: CSSProperties = {
    ...brandingToCssVars(branding),
    background: brandingShellGradient(branding),
  }
  const panelSrc = normalizeBrandingImageSrc(branding.loginBackgroundSrc, "/images/handshake.jpg")
  const logoSrc = normalizeBrandingImageSrc(tenantApplicantPanelLogoUrl(branding), "/images/new-logo-nexus.svg", {
    allowBlob: true,
  })
  const panelUseNativeImg = isRemoteOrBlobImageSrc(panelSrc)
  const brandBorderStyle = { borderColor: branding.primaryHex } as CSSProperties
  const brandMutedBgStyle = { backgroundColor: hexToRgba(branding.primaryHex, 0.08) } as CSSProperties
  const primaryBtnStyle = { backgroundColor: branding.primaryHex } as CSSProperties
  const brandTextStyle = { color: branding.primaryHex } as CSSProperties
  const secondaryTextStyle = { color: branding.secondaryHex } as CSSProperties
  const workerSignInUrl = workerSignInHref({
    tenant: branding.slug || currentOnboardingTenantSlug(),
  })

  const ACCEPTED_RESUME_EXTENSIONS = [".pdf", ".doc", ".docx"]

  function isAcceptedResumeFile(selected: File): boolean {
    const lower = selected.name.toLowerCase()
    return ACCEPTED_RESUME_EXTENSIONS.some((ext) => lower.endsWith(ext))
  }

  function validateResumeFile(selected: File): string | null {
    if (!isAcceptedResumeFile(selected)) {
      return "Please upload a resume in PDF, DOC, or DOCX format."
    }
    if (selected.size > 10 * 1024 * 1024) {
      return "Max file size is 10MB."
    }
    return null
  }

  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInput = useRef<HTMLInputElement>(null)
  const onboarding = useOnboardingConfigOptional()

  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadPhase, setUploadPhase] = useState("Uploading resume...")
  const [parseStatus, setParseStatus] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [fileRequiredError, setFileRequiredError] = useState<string | null>(null)
  const [savedResumeName, setSavedResumeName] = useState("")
  const [savedResumeSizeBytes, setSavedResumeSizeBytes] = useState<number | null>(null)
  const search = searchParams.toString()
  const isWorkflowTest = isWorkflowTestSession(search)
  const jobToken = isWorkflowTest
    ? ""
    : searchParams.get("job_token")?.trim() ||
      (typeof window !== "undefined" ? localStorage.getItem("applicationJobToken")?.trim() : "") ||
      ""

  useEffect(() => {
    if (typeof window === "undefined") return
    if (isWorkflowTest) {
      // Test workflow must not reuse a prior live job application token.
      localStorage.removeItem("applicationJobToken")
      return
    }
    if (jobToken) {
      localStorage.setItem("applicationJobToken", jobToken)
      return
    }
    // Direct Start Application (no job): clear any stale token so config stays job-free.
    localStorage.removeItem("applicationJobToken")
  }, [isWorkflowTest, jobToken, searchParams])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (
      !shouldGateResumeEntryByJobBoard({
        search,
        jobToken,
      })
    ) {
      return
    }
    const tenantSlug =
      searchParams.get("tenant")?.trim().toLowerCase() ||
      branding.slug?.trim().toLowerCase() ||
      currentOnboardingTenantSlug() ||
      ""
    if (!tenantSlug) return

    void fetch(`/api/public/application-entry?tenant=${encodeURIComponent(tenantSlug)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          path?: string
          kind?: string
        }
        if (!response.ok) return
        // Tenant has open jobs — applicants should pick a position first.
        if (payload.kind === "jobs" || payload.kind === "apply") {
          router.replace(payload.path || `/jobs?tenant=${encodeURIComponent(tenantSlug)}`)
        }
        // kind === "onboarding": stay on add-resume without job_token
      })
      .catch(() => {
        /* stay on page for direct onboarding */
      })
  }, [branding.slug, jobToken, router, search, searchParams])

  useEffect(() => {
    if (typeof window === "undefined") return
    const hasSuccessfulUpload = Boolean(
      localStorage.getItem("resumeStoragePath")?.trim() ||
        localStorage.getItem("resumeId")?.trim()
    )
    if (!hasSuccessfulUpload) {
      // Stale selection from a failed prior upload should not look "already uploaded".
      localStorage.removeItem("resumeName")
      localStorage.removeItem("resumeSizeBytes")
      localStorage.removeItem("resumeMimeType")
      setSavedResumeName("")
      setSavedResumeSizeBytes(null)
      return
    }
    setSavedResumeName(localStorage.getItem("resumeName") || "")
    const sizeRaw = localStorage.getItem("resumeSizeBytes")
    const sizeNum = sizeRaw ? Number(sizeRaw) : null
    setSavedResumeSizeBytes(sizeNum != null && Number.isFinite(sizeNum) ? sizeNum : null)
  }, [])

  useEffect(() => {
    if (file || savedResumeName) {
      setFileRequiredError(null)
    }
  }, [file, savedResumeName])

  useEffect(() => {
    if (!uploading) return
    const timer = window.setTimeout(() => {
      setUploading(false)
      setUploadPhase("Uploading resume...")
      clearFailedUploadSelection()
      setParseError(
        `Resume upload is taking too long while ${uploadPhase.toLowerCase()}. Please try again.`
      )
    }, UPLOAD_WATCHDOG_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [uploading, uploadPhase])

  function formatBytes(bytes: number | null) {
    if (!bytes && bytes !== 0) return ""
    const mb = bytes / (1024 * 1024)
    if (mb >= 1) return `${mb.toFixed(1)} MB`
    const kb = bytes / 1024
    if (kb >= 1) return `${kb.toFixed(0)} KB`
    return `${bytes} B`
  }

  function clearFailedUploadSelection() {
    setFile(null)
    setFileRequiredError(null)
    if (fileInput.current) fileInput.current.value = ""

    const hasSuccessfulUpload = Boolean(
      localStorage.getItem("resumeStoragePath")?.trim() ||
        localStorage.getItem("resumeId")?.trim()
    )
    if (hasSuccessfulUpload) {
      setSavedResumeName(localStorage.getItem("resumeName") || "")
      const sizeRaw = localStorage.getItem("resumeSizeBytes")
      const sizeNum = sizeRaw ? Number(sizeRaw) : null
      setSavedResumeSizeBytes(sizeNum != null && Number.isFinite(sizeNum) ? sizeNum : null)
      return
    }

    setSavedResumeName("")
    setSavedResumeSizeBytes(null)
    localStorage.removeItem("resumeName")
    localStorage.removeItem("resumeSizeBytes")
    localStorage.removeItem("resumeMimeType")
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return

    setFileRequiredError(null)
    setParseError(null)
    setParseStatus(null)

    const validationError = validateResumeFile(selected)
    if (validationError) {
      setFileRequiredError(validationError)
      return
    }

    // Keep selection in memory only until upload succeeds.
    setFile(selected)

    // Allows selecting the same file again to retrigger `onChange`.
    e.target.value = ""
  }

  function browse() {
    fileInput.current?.click()
  }

  function drop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const dropped = e.dataTransfer.files[0]
    if (!dropped) return

    setFileRequiredError(null)
    setParseError(null)
    setParseStatus(null)

    const validationError = validateResumeFile(dropped)
    if (validationError) {
      setFileRequiredError(validationError)
      return
    }

    setFile(dropped)
  }

  function dragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(true)
  }

  function dragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
  }

  function next() {
    const hasSavedResume =
      typeof window !== "undefined" &&
      Boolean(localStorage.getItem("resumeName")?.trim()) &&
      Boolean(
        localStorage.getItem("parsedResume")?.trim() ||
        localStorage.getItem("resumeStoragePath")?.trim()
      )

    if (!file) {
      if (hasSavedResume) {
        setFileRequiredError(null)
        setParseError(null)
        setParseStatus(null)
        try {
          const raw = localStorage.getItem("parsedResume")?.trim()
          if (raw) {
            let parsed: unknown
            try {
              parsed = JSON.parse(raw) as unknown
            } catch {
              setParseError(RESUME_PARSE_FAILED_USER_MESSAGE)
              localStorage.removeItem("parsedResume")
              return
            }
            const quality = evaluateResumeParseQuality(parsed)
            if (!quality.ok) {
              localStorage.removeItem("parsedResume")
            } else {
              localStorage.setItem(
                "parsedResume",
                JSON.stringify(normalizedResumeToStoredJson(quality.normalized)),
              )
            }
          }
        } catch {
          localStorage.removeItem("parsedResume")
        }
        void (async () => {
          const { ensureApplicantMatchesAuthSession } = await import(
            "@/lib/onboarding/ensure-applicant-auth"
          )
          const { ensureApplicantWorker } = await import("@/lib/onboarding/ensure-applicant-worker")
          const session = await ensureApplicantMatchesAuthSession()
          if ("error" in session) {
            setParseError(session.error)
            return
          }
          setScopedApplicantId(session.applicantId)
          await ensureApplicantWorker(session.applicantId).catch(() => {
            /* best-effort; resume-upload-success will retry */
          })
          try {
            const resumeStep = findResumeUploadStep(onboarding?.config)
            const resumeStepStatus = resumeStep
              ? onboarding?.progress?.steps?.find(
                  (row) => row.onboarding_step_id === resumeStep.id
                )?.status
              : undefined
            await markResumeUploadStepComplete({
              updateStepStatus: onboarding?.updateStepStatus,
              config: onboarding?.config,
              currentStatus: resumeStepStatus,
            })
          } catch {
            /* progress sync is best-effort */
          }
          router.push(applicationPath(APPLICATION_ROUTES.profileReview))
        })()
        return
      }
      setFileRequiredError("Please upload your resume before continuing.")
      return
    }

    ;(async () => {
      setUploading(true)
      setUploadPhase("Preparing applicant session...")
      setParseError(null)
      setParseStatus(null)
      try {
        const { ensureApplicantMatchesAuthSession } = await import(
          "@/lib/onboarding/ensure-applicant-auth"
        )
        const session = await promiseWithTimeout(
          ensureApplicantMatchesAuthSession(),
          APPLICANT_SESSION_TIMEOUT_MS,
          "Applicant session setup timed out. Please refresh and try again.",
        )
        if ("error" in session) {
          throw new Error(session.error)
        }

        setScopedApplicantId(session.applicantId)

        setUploadPhase("Preparing applicant profile...")
        const { ensureApplicantWorker } = await import("@/lib/onboarding/ensure-applicant-worker")
        const workerResult = await promiseWithTimeout(
          ensureApplicantWorker(session.applicantId),
          WORKER_ENSURE_TIMEOUT_MS,
          "Profile setup timed out. Please refresh and try again.",
        )
        if (!workerResult.ok) {
          throw new Error(workerResult.error)
        }

        setUploadPhase("Uploading resume...")
        const uploadSearch = new URLSearchParams(window.location.search)
        const isWorkflowTestUpload = isWorkflowTestSession(window.location.search)
        const tenantSlug = uploadSearch.get("tenant")?.trim().toLowerCase() || ""
        let activeJobToken = ""
        let storedLocation: ReturnType<typeof readStoredApplyLocation> = null
        if (!isWorkflowTestUpload) {
          const urlJobToken = uploadSearch.get("job_token")?.trim() || ""
          activeJobToken =
            urlJobToken ||
            jobToken ||
            (typeof window !== "undefined" ? localStorage.getItem("applicationJobToken")?.trim() : "") ||
            ""
          if (activeJobToken && tenantSlug) {
            storedLocation = readStoredApplyLocation(tenantSlug, activeJobToken)
          }
          if (activeJobToken) {
            try {
              localStorage.setItem("applicationJobToken", activeJobToken)
            } catch {
              /* ignore */
            }
          }
        } else {
          try {
            localStorage.removeItem("applicationJobToken")
          } catch {
            /* ignore */
          }
        }

        const directBody = {
          applicantId: session.applicantId,
          ...(tenantSlug ? { tenantSlug } : {}),
          ...(workerResult.workerId ? { workerId: workerResult.workerId } : {}),
          ...(workerResult.tenantId ? { tenantId: workerResult.tenantId } : {}),
          ...(activeJobToken ? { jobToken: activeJobToken } : {}),
          ...(storedLocation ? { workLocation: storedLocation } : {}),
        }

        let uploadJson: {
          fileName?: string
          storagePath?: string | null
          resumeId?: string | null
          parseStatus?: string | null
          parseError?: string | null
        }
        try {
          uploadJson = await uploadFileViaSignedUrl({
            prepareUrl: "/api/upload-resume",
            prepareBody: directBody,
            file,
            onProgress: (percent) => setUploadPhase(`Uploading resume… ${percent}%`),
          })
        } catch (directError) {
          const directMessage = directError instanceof Error ? directError.message : ""
          const canFallback =
            directMessage === "DIRECT_UNAVAILABLE" ||
            (file.size <= 4 * 1024 * 1024 &&
              /upload failed|did not finish|not configured|timed out/i.test(directMessage))
          if (!canFallback) throw directError
          setUploadPhase("Uploading resume...")
          const fd = new FormData()
          fd.append("file", file)
          fd.append("applicantId", session.applicantId)
          if (tenantSlug) fd.append("tenantSlug", tenantSlug)
          if (workerResult.workerId) fd.append("workerId", workerResult.workerId)
          if (workerResult.tenantId) fd.append("tenantId", workerResult.tenantId)
          if (activeJobToken) {
            fd.append("jobToken", activeJobToken)
            if (storedLocation) fd.append("workLocation", JSON.stringify(storedLocation))
          }
          const uploadRes = await fetchWithTimeout(
            "/api/upload-resume",
            { method: "POST", body: fd },
            RESUME_UPLOAD_TIMEOUT_MS,
            "Upload timed out. Please check your connection and try again.",
          )
          if (!uploadRes.ok) {
            const data = await uploadRes.json().catch(() => ({}))
            throw new Error(readServiceAreaApiMessage(data, "Failed to upload resume"))
          }
          uploadJson = (await uploadRes.json()) as typeof uploadJson
        }

        if (uploadJson.storagePath) {
          localStorage.setItem("resumeStoragePath", uploadJson.storagePath)
          void fetchWithTimeout(
            "/api/onboarding/worker-requirements",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                applicantId: session.applicantId,
                resume_path: uploadJson.storagePath,
                ...(tenantSlug ? { tenantSlug } : {}),
              }),
            },
            WORKER_REQUIREMENTS_TIMEOUT_MS,
            "Resume sync timed out.",
          ).catch(() => {
            // Non-blocking: continue onboarding even if this sync fails.
          })
        }

        if (uploadJson.resumeId) {
          localStorage.setItem("resumeId", uploadJson.resumeId)
        } else {
          localStorage.removeItem("resumeId")
        }

        localStorage.setItem("resumeName", uploadJson?.fileName || file.name)
        localStorage.setItem("resumeSizeBytes", String(file.size))
        localStorage.setItem("resumeMimeType", file.type || "")
        localStorage.removeItem("parsedResume")
        localStorage.setItem("step1TermsAccepted", "false")
        localStorage.setItem("step1ReviewCompleted", "false")
        setSavedResumeName(uploadJson?.fileName || file.name)
        setSavedResumeSizeBytes(file.size)
        setParseStatus(uploadJson.parseStatus ?? "processing")

        setUploadPhase("Finishing...")
        try {
          const resumeStep = findResumeUploadStep(onboarding?.config)
          const resumeStepStatus = resumeStep
            ? onboarding?.progress?.steps?.find(
                (row) => row.onboarding_step_id === resumeStep.id
              )?.status
            : undefined
          await markResumeUploadStepComplete({
            updateStepStatus: onboarding?.updateStepStatus,
            config: onboarding?.config,
            resumePath: uploadJson.storagePath ?? null,
            currentStatus: resumeStepStatus,
          })
        } catch {
          /* progress sync is best-effort */
        }

        void import("@/lib/onboarding/ensure-applicant-worker").then(({ ensureApplicantWorker }) =>
          ensureApplicantWorker(session.applicantId).catch(() => {
            /* resume-upload-success will retry */
          }),
        )

        router.push(applicationPath(APPLICATION_ROUTES.profileReview))
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to upload resume"
        clearFailedUploadSelection()
        setParseError(msg)
      } finally {
        setUploading(false)
        setUploadPhase("Uploading resume...")
      }
    })()
  }

  function clearSelectedResume() {
    setFile(null)
    setSavedResumeName("")
    setSavedResumeSizeBytes(null)
    setFileRequiredError(null)
    setParseError(null)
    setParseStatus(null)
    localStorage.removeItem("resumeName")
    localStorage.removeItem("resumeSizeBytes")
    localStorage.removeItem("resumeMimeType")
    localStorage.removeItem("resumeStoragePath")
    localStorage.removeItem("parsedResume")
    localStorage.removeItem("resumeId")
    localStorage.setItem("step1TermsAccepted", "false")
    localStorage.setItem("step1ReviewCompleted", "false")
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center p-3 sm:p-4 min-[700px]:p-6 min-[1200px]:p-8"
      style={shellStyle}
    >

      <div
        className={`flex min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-opacity min-[700px]:min-h-[540px] min-[700px]:flex-row ${uploading ? "opacity-50" : "opacity-100"}`}
      >

        <div className="w-full min-w-0 px-4 pb-6 pt-6 sm:px-6 sm:pb-8 sm:pt-8 min-[700px]:w-2/3 min-[700px]:p-8 min-[1200px]:p-10">

          <OnboardingStepper />

          <h2 className="mb-4 mt-4 text-lg font-semibold text-gray-800 sm:mb-6 sm:mt-6 sm:text-2xl">
            Upload your resume
          </h2>

          <div
            onDrop={drop}
            onDragOver={dragOver}
            onDragLeave={dragLeave}
            role="button"
            tabIndex={0}
            onClick={browse}
            className={`cursor-pointer rounded-xl border-2 border-dashed text-center transition ${
              file || savedResumeName ? "p-3 sm:p-4" : "p-4 sm:p-6 min-[700px]:p-8 min-[1200px]:p-10"
            }`}
            style={
              dragActive
                ? { ...brandBorderStyle, ...brandMutedBgStyle }
                : brandBorderStyle
            }
          >

            {file || savedResumeName ? (
              <div
                className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3"
                style={{
                  borderColor: hexToRgba(branding.primaryHex, 0.35),
                  backgroundColor: hexToRgba(branding.primaryHex, 0.1),
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border sm:h-12 sm:w-12"
                    style={{
                      backgroundColor: hexToRgba(branding.primaryHex, 0.18),
                      borderColor: hexToRgba(branding.primaryHex, 0.28),
                    }}
                  >
                    <BrandedSvgIcon
                      src="/icons/pdf-icon.svg"
                      className="h-5 w-5 shrink-0 sm:h-6 sm:w-6"
                      color={branding.primaryHex}
                    />
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="truncate text-sm font-semibold sm:text-base" style={secondaryTextStyle}>
                      {file?.name || savedResumeName}
                    </div>
                    <div className="text-[11px] text-slate-500 sm:text-xs">
                      {formatBytes(file ? file.size : savedResumeSizeBytes)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    clearSelectedResume()
                  }}
                  className="shrink-0 cursor-pointer rounded-md p-1 transition hover:bg-[color:var(--brand-primary)]/10"
                  aria-label="Remove uploaded resume"
                >
                  <BrandedSvgIcon
                    src="/icons/delete-icon.svg"
                    className="h-7 w-7"
                    color={branding.primaryHex}
                  />
                </button>
              </div>
            ) : (
              <>
                <div className="mx-auto mb-4 flex items-center justify-center">
                  <BrandedUploadIcon className="h-14 w-14" primaryHex={branding.primaryHex} />
                </div>

                <p className="text-black mb-4">
                  Drag your file(s) to start uploading
                </p>

                <div className="text-xs text-[#6D6D6D] mb-2">OR</div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    browse()
                  }}
                  className="cursor-pointer rounded-md border px-6 py-2 text-sm transition hover:opacity-90"
                  style={{ ...brandBorderStyle, ...brandTextStyle }}
                >
                  Browse files
                </button>

                <p className="text-xs text-[#6B7280] mt-3">
                  Max 10 MB files are allowed
                </p>
              </>
            )}

            <input
              type="file"
              accept=".pdf,.doc,.docx"
              ref={fileInput}
              className="hidden"
              onChange={handleFile}
            />
          </div>

          <div className="mt-3 text-xs text-[#6D6D6D]">
            Accepted formats: PDF, DOC, and DOCX (max 10 MB)
          </div>

          {fileRequiredError ? (
            <div className="mt-3 text-sm text-rose-600">
              {fileRequiredError}
            </div>
          ) : null}

          {parseError ? (
            <div
              role="alert"
              className="mt-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3"
            >
              <p className="font-medium">{parseError}</p>
            </div>
          ) : null}

          {parseStatus === "processing" ? (
            <p className="mt-3 text-sm text-slate-600">
              Resume uploaded. Profile details will be filled in automatically when parsing finishes.
            </p>
          ) : null}

          <p className="mt-4 text-sm text-slate-500">
            Already have an account?{" "}
            <a
              href={workerSignInUrl}
              className="font-semibold underline-offset-4 hover:underline"
              style={brandTextStyle}
            >
              Sign in
            </a>
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2 sm:mt-8 sm:gap-3 min-[700px]:mt-8 min-[700px]:flex min-[700px]:justify-end min-[700px]:gap-3 min-[1200px]:mt-10 min-[1200px]:gap-4">
            <button
              onClick={() => router.back()}
              className="w-full cursor-pointer rounded-lg border px-3 py-2.5 text-[11px] hover:bg-gray-50 sm:px-4 sm:py-2.5 sm:text-sm min-[700px]:w-auto min-[700px]:px-5 min-[1200px]:px-6 min-[1200px]:py-2"
              style={{ ...brandBorderStyle, ...brandTextStyle }}
            >
              Cancel
            </button>

            <button
              onClick={next}
              disabled={uploading}
              className={`w-full cursor-pointer rounded-lg px-3 py-2.5 text-[11px] text-white transition hover:brightness-90 sm:px-4 sm:py-2.5 sm:text-sm min-[700px]:w-auto min-[700px]:px-6 min-[1200px]:px-8 min-[1200px]:py-2 ${uploading ? "cursor-not-allowed opacity-70" : ""}`}
              style={primaryBtnStyle}
            >
              {uploading ? "Uploading..." : "Upload Resume and Continue"}
            </button>
          </div>

        </div>

        <div className="relative hidden w-1/3 min-[700px]:block">
          {panelUseNativeImg ? (
            <img
              src={panelSrc}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-60 grayscale"
            />
          ) : (
            <Image
              src={panelSrc}
              alt=""
              fill
              sizes="(max-width: 699px) 0px, 33vw"
              className="object-cover grayscale opacity-60"
            />
          )}
          <div className="absolute inset-0 bg-white/65" />
          <div className="absolute inset-0 flex items-center justify-center p-5 pt-[calc(1.5rem+10%)] text-center min-[900px]:p-8 min-[900px]:pt-[calc(2rem+12%)]">
            <div className={`flex w-full max-w-[270px] flex-col items-center ${BRANDING_RIGHT_PANEL_STACK_GAP_CLASS}`}>
              <BrandingRightPanelLogo
                src={logoSrc}
                alt={branding.companyName}
                widthClassName="w-full max-w-full"
              />
              <div className="flex w-full items-center justify-center gap-4">
                <div className="h-px flex-1 bg-slate-400/55" />
                <BrandedSvgIcon
                  src="/icons/circle-star-icon.svg"
                  className="h-6 w-6 flex-none"
                  color={branding.primaryHex}
                />
                <div className="h-px flex-1 bg-slate-400/55" />
              </div>
              <p className="text-center text-[14px] font-normal leading-5 tracking-normal text-black min-[900px]:text-[16px] min-[900px]:leading-6">
                {branding.tagline}
              </p>
            </div>
          </div>
        </div>

      </div>

      {uploading ? (
        <OnboardingLoader overlay label={uploadPhase} />
      ) : null}
    </div>
  )
}
