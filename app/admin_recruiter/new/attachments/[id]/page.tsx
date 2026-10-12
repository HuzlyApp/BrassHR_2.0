"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DetailedCandidateHeader from "../../../components/DetailedCandidateHeader";
import DetailedTabs from "../../../components/DetailedTabs";
import CandidateDetailLoader from "../../../components/CandidateDetailLoader";
import BrandedFileTypeIcon from "../../../components/BrandedFileTypeIcon";
import DocumentReviewActions from "../../../components/DocumentReviewActions";
import { useWorkerDocumentReview } from "../../../hooks/useWorkerDocumentReview";
import {
  Briefcase,
  Calendar,
  Download,
  Eye,
  LogOut,
  Menu,
  Plus,
  Settings,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  X,
} from "lucide-react";
import PreIdentifiedCertifications from "../../../components/PreIdentifiedCertifications";
import AiPreScanBanner from "@/app/components/AiPreScanBanner";
import { scanUploadedDocument } from "@/lib/document-verification-client";
import type { DocumentVerificationResult } from "@/lib/document-verification";
import { isPdfFile } from "@/lib/document-upload-helpers";
import type { OnboardingStepType } from "@/lib/onboarding/types";

type WorkerProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  job_role: string | null;
  status_label?: string;
  profile_photo_url?: string | null;
};

type AttachmentRequirement = {
  id: string;
  title: string;
  url: string | null;
  filename: string;
  required_document_id?: string | null;
  submitted_document_id?: string | null;
  legacy_document_key?: string | null;
  status?: string | null;
  step_type?: OnboardingStepType;
  step_key?: string;
  phase?: "pre_hire" | "post_hire";
  step_title?: string;
};

type WorkerProfileResponse = {
  worker: WorkerProfile;
  attachment_requirements?: AttachmentRequirement[];
};

type AttachmentRow = {
  key: string;
  id: string;
  title: string;
  url: string | null;
  filename: string;
  requiredDocumentId: string | null;
  submittedDocumentId: string | null;
  legacyDocumentKey: string | null;
  status: string | null;
  stepType: OnboardingStepType | null;
  stepKey: string | null;
  phase: "pre_hire" | "post_hire";
  stepTitle: string;
};

function attachmentRowKey(
  row: Omit<AttachmentRow, "key">,
  index: number
): string {
  if (row.requiredDocumentId) return `req-${row.requiredDocumentId}`;
  if (row.stepKey) return `step-${row.stepKey}`;
  return `${row.id}-${index}`;
}

function isResumeAttachmentRow(row: Pick<AttachmentRow, "id" | "stepType">): boolean {
  return row.stepType === "resume_upload" || row.id === "resume";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NA";
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return (first + last).toUpperCase();
}

export default function NewApplicantAttachmentsFilledPage() {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const applicantId = params?.id;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<WorkerProfileResponse | null>(null);
  const [scanById, setScanById] = useState<
    Record<string, { loading: boolean; result: DocumentVerificationResult | null; error: string | null }>
  >({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUploadRow, setPendingUploadRow] = useState<AttachmentRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchApplicant = useCallback(async () => {
    if (!applicantId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/admin/worker-profile?workerId=${encodeURIComponent(applicantId)}`
      );
      const json = (await res.json()) as WorkerProfileResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || `Failed to load profile (${res.status})`);
      }
      setProfile(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Failed to fetch applicant for attachments:", msg, e);
      setLoadError(msg);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  const {
    actionError,
    submitReview,
    isReviewLoading,
  } = useWorkerDocumentReview(applicantId, fetchApplicant);

  useEffect(() => {
    void fetchApplicant();
  }, [fetchApplicant]);

  const openUploadPicker = (row: AttachmentRow) => {
    setUploadError(null);
    setPendingUploadRow(row);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (file: File | undefined) => {
    const row = pendingUploadRow;
    setPendingUploadRow(null);
    if (!file || !row || !applicantId) return;

    setUploadingId(row.key);
    setUploadError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("workerId", applicantId);
      fd.append("documentTitle", row.title);

      if (isResumeAttachmentRow(row)) {
        fd.append("attachmentKind", "resume");
      } else if (row.requiredDocumentId) {
        fd.append("requiredDocumentId", row.requiredDocumentId);
      } else {
        throw new Error(`Upload is not configured for "${row.title}".`);
      }

      const res = await fetch("/api/admin/worker-attachment-upload", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Upload failed");
      }

      setScanById((prev) => {
        const next = { ...prev };
        delete next[row.key];
        return next;
      });
      await fetchApplicant();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setUploadError(msg);
    } finally {
      setUploadingId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const applicant = profile?.worker ?? null;

  const attachmentRows: AttachmentRow[] = useMemo(() => {
    if (!profile) return [];
    const fromConfig = profile.attachment_requirements ?? [];
    return fromConfig.map((row, index) => {
      const mapped = {
        id: row.id,
        title: row.title,
        url: row.url,
        filename: row.filename?.trim() ? row.filename : "—",
        requiredDocumentId: row.required_document_id ?? null,
        submittedDocumentId: row.submitted_document_id ?? null,
        legacyDocumentKey: row.legacy_document_key ?? null,
        status: row.status ?? null,
        stepType: row.step_type ?? null,
        stepKey: row.step_key ?? null,
        phase: row.phase ?? "pre_hire",
        stepTitle: row.step_title ?? row.title,
      };
      return {
        ...mapped,
        key: attachmentRowKey(mapped, index),
      };
    });
  }, [profile]);

  useEffect(() => {
    if (!attachmentRows.length) return;

    let cancelled = false;

    async function runScans() {
      for (const row of attachmentRows) {
        if (!row.url) continue;

        setScanById((prev) => ({
          ...prev,
          [row.key]: { loading: true, result: null, error: null },
        }));

        try {
          const result = await scanUploadedDocument({
            documentType: row.title,
            fileUrl: row.url,
            fileName: row.filename,
          });
          if (cancelled) return;
          setScanById((prev) => ({
            ...prev,
            [row.key]: { loading: false, result, error: null },
          }));
        } catch (e) {
          if (cancelled) return;
          const msg = e instanceof Error ? e.message : "Scan failed";
          setScanById((prev) => ({
            ...prev,
            [row.key]: { loading: false, result: null, error: msg },
          }));
        }
      }
    }

    void runScans();
    return () => {
      cancelled = true;
    };
  }, [attachmentRows]);

  const uploadedCount = useMemo(
    () => attachmentRows.filter((r) => r.url).length,
    [attachmentRows]
  );
  const totalCount = attachmentRows.length;

  const candidateName = useMemo(() => {
    const n = `${applicant?.first_name ?? ""} ${applicant?.last_name ?? ""}`.trim();
    return n || "Applicant";
  }, [applicant]);

  const candidateRole = applicant?.job_role || "N/A";

  return (
    <div className="flex min-h-screen bg-zinc-50 overflow-hidden">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0A1F1C] text-white transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="px-6 py-8 flex items-center gap-3 border-b border-white/10">
            <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center">
              <span className="text-[#0A1F1C] font-bold text-3xl">N</span>
            </div>
            <div>
              <div className="font-semibold text-2xl tracking-tight">Nexus</div>
              <div className="text-xs text-teal-400 -mt-1">MedPro Staffing</div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-8 space-y-1">
            <div className="px-4 text-xs uppercase tracking-widest text-teal-400/70 mb-4">
              PERSONAL SETTINGS
            </div>
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/10 rounded-2xl"
            >
              Profile
            </a>
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/10 rounded-2xl"
            >
              Account
            </a>

            <div className="px-4 pt-8 text-xs uppercase tracking-widest text-teal-400/70 mb-4">
              TEAM MANAGEMENT
            </div>

            {[
              { label: "Candidates", href: "/admin_recruiter/candidates", icon: Users },
              { label: "New", href: "/admin_recruiter/new", icon: UserPlus },
              { label: "Pending", href: "/admin_recruiter/pending", icon: UserCheck },
              { label: "Approved", href: "/admin_recruiter/approved", icon: UserCheck },
              { label: "Disapproved", href: "/admin_recruiter/disapproved", icon: UserX },
              { label: "Workers", href: "/admin_recruiter/workers", icon: Briefcase },
              { label: "Schedule", href: "/admin_recruiter/schedule", icon: Calendar },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 text-sm rounded-2xl transition-all ${
                    isActive ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}

            <div className="px-4 pt-10">
              <a
                href="#"
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/10 rounded-2xl"
              >
                <Settings className="w-5 h-5" /> Settings
              </a>
            </div>
          </nav>

          <div className="p-6 border-t border-white/10">
            <button className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-white/10 rounded-2xl">
              <LogOut className="w-5 h-5" /> Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden lg:pl-72">
        <header className="h-16 border-b bg-white flex items-center px-6 justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen((v) => !v)} className="lg:hidden text-gray-600">
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div className="font-semibold text-2xl">New Applicant</div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-1 rounded-full text-sm">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Online
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-medium text-sm">Sean Smith</div>
                <div className="text-xs text-gray-600">Manager</div>
              </div>
              <img
                src="https://i.pravatar.cc/128?u=sean"
                alt="Sean Smith"
                className="w-9 h-9 rounded-full object-cover"
              />
            </div>
          </div>
        </header>

        <div className="flex-1 w-full min-w-0 overflow-auto admin-recruiter-page-pad">
          <div className="admin-recruiter-content-width">
            <DetailedTabs applicantId={applicantId} activeTab="Attachments" />

            {loadError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {loadError}
              </div>
            ) : null}

            {uploadError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {uploadError}
              </div>
            ) : null}

            {actionError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {actionError}
              </div>
            ) : null}

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.docx,application/pdf,image/png,image/jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                void handleFileSelected(file);
              }}
            />

            {loading ? (
              <CandidateDetailLoader label="Loading attachments..." />
            ) : (
              <>
            <DetailedCandidateHeader
              name={candidateName}
              role={candidateRole}
              status={applicant?.status_label}
              profilePhotoUrl={applicant?.profile_photo_url}
              workerId={applicantId}
              candidateEmail={applicant?.email ?? null}
            />

            <div className="w-full min-w-0 admin-recruiter-content-width">
              {/* Top */}
              <div className="hidden p-6 items-start justify-between gap-6 border-b border-[#9CC3FF]/30 bg-white/40">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-teal-600 text-white flex items-center justify-center font-semibold text-sm">
                    {initials(candidateName)}
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-gray-600">
                      {loading ? "Loading..." : candidateName}
                    </div>
                    <div className="text-xs text-gray-600">{candidateRole}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] px-3 py-1 rounded-full bg-white/70 border border-zinc-200 text-gray-600 font-medium">
                    New Applicant
                  </span>
                  <button className="bg-white/70 border border-[#9CC3FF] text-gray-600 px-5 py-2.5 rounded-2xl hover:bg-white transition text-sm">
                    <Plus className="inline-block w-4 h-4 mr-2" />
                    New Appointment
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-[#9CC3FF]/20 bg-white/30" />

              <div className="p-5">
                {/*
                Recruiters review documents on attachments — upload bar hidden.
                <div className="flex h-[52px] w-full items-center justify-between rounded-md border border-[#D1D5DB] px-5 py-[14px]">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 text-[16px] font-semibold leading-6 text-[#111827]"
                  >
                    Upload Files
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center"
                    aria-label="Add upload"
                  >
                    <BrandedPlusIcon className="h-6 w-6" />
                  </button>
                </div>
                */}

                <div>
                  <div className="mb-4 flex items-center justify-between border-b border-[#E5E7EB] pb-4">
                    <h3 className="text-[20px] font-semibold leading-7 text-[#111827]">Requirements Submitted</h3>
                    <p className="text-sm font-medium text-[#6B7280]">
                      Uploaded{" "}
                      <span className="font-semibold text-[#111827]">{uploadedCount}</span> of{" "}
                      <span className="font-semibold text-[#111827]">{totalCount}</span>
                    </p>
                  </div>

                  <div className="space-y-3">
                      {attachmentRows.map((r, idx) => {
                        const scan = scanById[r.key];
                        const isPdf = isPdfFile(null, r.filename, r.url);

                        return (
                        <div
                          key={r.key}
                          className="w-full rounded-md border border-[#D1D5DB]"
                        >
                          <div className="flex min-h-[44px] items-center justify-between gap-3 px-5 pt-3 pb-2 md:h-[44px]">
                            <div className="min-w-0 text-[16px] font-semibold leading-6 text-[#111827]">
                              {idx + 1}. {r.title}
                              <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                {r.phase === "post_hire" ? "Post-Hire" : "Pre-Hire"}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                disabled={!r.url}
                                onClick={() => r.url && window.open(r.url, "_blank", "noopener,noreferrer")}
                                className="inline-flex h-5 w-5 items-center justify-center text-[color:var(--brand-primary)] disabled:opacity-40 disabled:pointer-events-none"
                                aria-label={`View ${r.title}`}
                              >
                                <Eye className="h-5 w-5" />
                              </button>
                              <a
                                href={r.url ?? undefined}
                                download
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex h-5 w-5 items-center justify-center text-[color:var(--brand-primary)] ${
                                  !r.url ? "pointer-events-none opacity-40" : ""
                                }`}
                                aria-label={`Download ${r.title}`}
                              >
                                <Download className="h-5 w-5" />
                              </a>
                            </div>
                          </div>

                          <div className="flex flex-col items-stretch gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between md:gap-4">
                            {r.url ? (
                              <div className="flex h-[50px] w-full min-w-0 max-w-[520px] md:w-[306px] md:min-w-[306px] items-center gap-2 rounded-[8px] border border-[color:color-mix(in_srgb,var(--brand-primary)_30%,white)] bg-[#F8FAFC] px-3 py-2">
                                <BrandedFileTypeIcon type={isPdf ? "pdf" : "jpeg"} className="h-6 w-6 shrink-0" />
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-semibold leading-4 tracking-[0.01em] text-[color:var(--brand-primary)]">
                                    {r.filename}
                                  </div>
                                  <div className="text-xs font-normal leading-4 tracking-[0.01em] text-[#6B7280]">
                                    Uploaded file
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex h-[50px] w-full min-w-0 max-w-[520px] md:w-[306px] md:min-w-[306px] items-center justify-between rounded-[8px] border border-dashed border-[color:color-mix(in_srgb,var(--brand-primary)_30%,white)] bg-[#F8FAFC] px-3 py-2">
                                <span className="text-xs text-[#6B7280]">No Document</span>
                                <button
                                  type="button"
                                  disabled={uploadingId === r.key}
                                  onClick={() => openUploadPicker(r)}
                                  className="inline-flex h-8 items-center justify-center rounded-md border border-[color:color-mix(in_srgb,var(--brand-primary)_30%,white)] bg-white px-4 text-xs font-semibold text-[color:var(--brand-primary)] disabled:opacity-50"
                                >
                                  {uploadingId === r.key ? "Uploading..." : "Upload"}
                                </button>
                              </div>
                            )}

                            {r.url ? (
                              <DocumentReviewActions
                                disabled={!r.submittedDocumentId && !r.legacyDocumentKey}
                                loading={isReviewLoading({
                                  submittedDocumentId: r.submittedDocumentId,
                                  legacyDocumentKey: r.legacyDocumentKey,
                                })}
                                currentStatus={r.status}
                                onApprove={() =>
                                  void submitReview(
                                    {
                                      submittedDocumentId: r.submittedDocumentId,
                                      legacyDocumentKey: r.legacyDocumentKey,
                                    },
                                    "approved"
                                  )
                                }
                                onReject={() =>
                                  void submitReview(
                                    {
                                      submittedDocumentId: r.submittedDocumentId,
                                      legacyDocumentKey: r.legacyDocumentKey,
                                    },
                                    "rejected"
                                  )
                                }
                                onRequestMore={() =>
                                  void submitReview(
                                    {
                                      submittedDocumentId: r.submittedDocumentId,
                                      legacyDocumentKey: r.legacyDocumentKey,
                                    },
                                    "needs_revision"
                                  )
                                }
                              />
                            ) : (
                              <button
                                type="button"
                                disabled={uploadingId === r.key}
                                onClick={() => openUploadPicker(r)}
                                className="inline-flex h-8 items-center justify-center rounded-md bg-[color:var(--brand-primary)] px-5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-50"
                              >
                                {uploadingId === r.key ? "Uploading..." : "Upload"}
                              </button>
                            )}
                          </div>

                          {r.url ? (
                            <AiPreScanBanner
                              loading={scan?.loading}
                              result={scan?.result ?? null}
                              error={scan?.error ?? null}
                            />
                          ) : null}
                        </div>
                        );
                      })}
                  </div>

                  {applicantId ? <PreIdentifiedCertifications workerId={applicantId} /> : null}
                </div>
              </div>
            </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

