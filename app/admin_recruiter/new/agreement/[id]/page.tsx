"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import DetailedCandidateHeader from "../../../components/DetailedCandidateHeader";
import DetailedTabs from "../../../components/DetailedTabs";
import CandidateDetailLoader from "../../../components/CandidateDetailLoader";
import BrandedFileTypeIcon from "../../../components/BrandedFileTypeIcon";
import DocumentReviewActions from "../../../components/DocumentReviewActions";
import { useWorkerDocumentReview } from "../../../hooks/useWorkerDocumentReview";
import {
  buildWorkerAgreementSections,
  type AgreementRecord,
  type WorkerAgreementSection,
} from "@/lib/admin/build-worker-agreement-sections";
import type { AdminAttachmentRequirement } from "@/lib/onboarding/build-admin-attachment-requirements";
import {
  Briefcase,
  Calendar,
  Download,
  Eye,
  LogOut,
  Menu,
  Settings,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  X,
} from "lucide-react";

type WorkerProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  job_role: string | null;
  status_label?: string;
  profile_photo_url?: string | null;
};

type ProfileApi = {
  worker: WorkerProfile;
  attachment_requirements?: AdminAttachmentRequirement[];
  legacy_document_reviews?: Record<string, string>;
  document_urls?: {
    authorization_document_url?: string | null;
    agreement_w2_url?: string | null;
    agreement_i9_url?: string | null;
  };
  signeasy?: {
    document_name?: string | null;
  };
  firma_signing?: {
    signing_request_id?: string | null;
    firma_status?: string | null;
    iframe_url?: string | null;
    updated_at?: string | null;
  };
};

type UploadSlot = {
  sectionId: "w2" | "i9";
  title: string;
  requiredDocumentId?: string | null;
  documentField?: string;
};

function reviewTargetForSection(section: WorkerAgreementSection) {
  return {
    submittedDocumentId: section.submittedDocumentId,
    legacyDocumentKey: section.legacyDocumentKey,
  };
}

function AgreementStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "signed" | "not_uploaded";
}) {
  if (tone === "signed") {
    return (
      <span className="ml-auto rounded-md bg-[color:var(--brand-secondary)] px-2 py-1 text-[10px] font-semibold text-white">
        {label}
      </span>
    );
  }

  return (
    <span className="ml-auto rounded-md border border-[color:var(--brand-primary)] bg-white px-2 py-1 text-[10px] font-semibold text-[color:var(--brand-primary)]">
      {label}
    </span>
  );
}

function AgreementFileCard({
  section,
  uploading,
  esignLoading,
  onUpload,
  onRequestEsign,
}: {
  section: WorkerAgreementSection;
  uploading: boolean;
  esignLoading?: boolean;
  onUpload: () => void;
  onRequestEsign?: () => void;
}) {
  if (!section.hasFile) {
    return (
      <div className="flex h-[50px] w-full min-w-0 max-w-[520px] md:w-[306px] md:min-w-[306px] items-center justify-between gap-2 rounded-[8px] border border-dashed border-[color:color-mix(in_srgb,var(--brand-primary)_30%,white)] bg-[#F8FAFC] px-3 py-2">
        <span className="text-xs text-[#6B7280]">No Document</span>
        <div className="flex shrink-0 items-center gap-2">
          {section.statusBadge && section.statusBadgeTone ? (
            <AgreementStatusBadge label={section.statusBadge} tone={section.statusBadgeTone} />
          ) : null}
          {section.kind === "esign" ? (
            <button
              type="button"
              disabled={esignLoading}
              onClick={onRequestEsign}
              className="inline-flex h-8 items-center justify-center rounded-md bg-[color:var(--brand-primary)] px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              {esignLoading ? "Sending..." : "Request eSign"}
            </button>
          ) : null}
          {/*
          Recruiter agreement review only — admin upload disabled on agreement page.
          {section.kind === "upload" ? (
            <button
              type="button"
              disabled={uploading}
              onClick={onUpload}
              className="inline-flex h-8 items-center justify-center rounded-md border border-[color:color-mix(in_srgb,var(--brand-primary)_30%,white)] bg-white px-4 text-xs font-semibold text-[color:var(--brand-primary)] disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          ) : null}
          */}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[50px] w-full min-w-0 max-w-[520px] md:w-[306px] md:min-w-[306px] items-center gap-2 rounded-[8px] border border-[color:color-mix(in_srgb,var(--brand-primary)_30%,white)] bg-[#F8FAFC] px-3 py-2">
      <BrandedFileTypeIcon type="pdf" className="h-6 w-6 shrink-0" />
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold leading-4 tracking-[0.01em] text-[color:var(--brand-primary)]">
          {section.fileName}
        </div>
        {section.fileSizeLabel ? (
          <div className="text-xs font-normal leading-4 tracking-[0.01em] text-[#6B7280]">
            {section.fileSizeLabel}
          </div>
        ) : null}
      </div>
      {section.statusBadge && section.statusBadgeTone ? (
        <AgreementStatusBadge label={section.statusBadge} tone={section.statusBadgeTone} />
      ) : null}
    </div>
  );
}

export default function NewApplicantAgreementPage() {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const applicantId = params?.id;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileApi | null>(null);
  const [agreements, setAgreements] = useState<AgreementRecord[]>([]);
  /* Recruiter agreement review only — admin upload disabled on agreement page.
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUploadSlot, setPendingUploadSlot] = useState<UploadSlot | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  */

  const fetchData = useCallback(async () => {
    if (!applicantId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [profileRes, agreementRes] = await Promise.all([
        fetch(`/api/admin/worker-profile?workerId=${encodeURIComponent(applicantId)}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/worker-agreement?workerId=${encodeURIComponent(applicantId)}`, {
          cache: "no-store",
        }),
      ]);

      const profileJson = (await profileRes.json()) as ProfileApi & { error?: string };
      if (!profileRes.ok) {
        throw new Error(profileJson.error || `Failed to load profile (${profileRes.status})`);
      }

      const agreementJson = (await agreementRes.json()) as {
        agreements?: AgreementRecord[];
        error?: string;
      };
      if (!agreementRes.ok) {
        throw new Error(agreementJson.error || `Failed to load agreements (${agreementRes.status})`);
      }

      setProfile(profileJson);
      setAgreements(agreementJson.agreements ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Failed to fetch applicant agreement data:", msg, e);
      setLoadError(msg);
      setProfile(null);
      setAgreements([]);
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const {
    actionError,
    submitReview,
    requestAgreementUpload,
    requestEsign,
    isReviewLoading,
    isUploadRequestLoading,
    esignLoading,
  } = useWorkerDocumentReview(applicantId, fetchData);

  const applicant = profile?.worker ?? null;
  const candidateName = useMemo(() => {
    const n = `${applicant?.first_name ?? ""} ${applicant?.last_name ?? ""}`.trim();
    return n || "Applicant";
  }, [applicant]);
  const candidateRole = applicant?.job_role || "N/A";

  const sections = useMemo(
    () => (profile ? buildWorkerAgreementSections(profile, agreements) : []),
    [profile, agreements]
  );

  const w2Section = sections.find((section) => section.id === "w2") ?? null;
  const i9Section = sections.find((section) => section.id === "i9") ?? null;

  /* Recruiter agreement review only — admin upload disabled on agreement page.
  const openUploadPicker = (slot: UploadSlot) => {
    setUploadError(null);
    setPendingUploadSlot(slot);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (file: File | undefined) => {
    const slot = pendingUploadSlot;
    setPendingUploadSlot(null);
    if (!file || !slot || !applicantId) return;

    setUploadingId(slot.sectionId);
    setUploadError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("workerId", applicantId);
      fd.append("documentTitle", slot.title);
      if (slot.requiredDocumentId) {
        fd.append("requiredDocumentId", slot.requiredDocumentId);
      } else if (slot.documentField) {
        fd.append("documentField", slot.documentField);
      } else {
        throw new Error(`Upload is not configured for "${slot.title}".`);
      }

      const res = await fetch("/api/admin/worker-attachment-upload", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Upload failed");
      }

      await fetchData();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setUploadError(msg);
    } finally {
      setUploadingId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  */

  const openDocument = (section: WorkerAgreementSection, mode: "preview" | "download") => {
    const url = section.fileUrl || section.firmaSigningUrl;
    if (!url) return;
    if (mode === "download") {
      window.location.href = url;
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const renderSection = (section: WorkerAgreementSection, index: number) => {
    const reviewTarget = reviewTargetForSection(section);
    const canPreview = Boolean(section.fileUrl || section.firmaSigningUrl);
    const canDownload = section.kind === "upload" && Boolean(section.fileUrl || section.firmaSigningUrl);
    const uploadAlreadyRequested = section.reviewStatus === "needs_revision";
    const showRequestUpload =
      (section.reviewStatus === "rejected" || !section.hasFile) && !uploadAlreadyRequested;
    const actionsEnabled = section.hasFile || section.kind === "upload" || showRequestUpload || uploadAlreadyRequested;

    /* Recruiter agreement review only — admin upload disabled on agreement page.
    const openSectionUpload = () =>
      openUploadPicker({
        sectionId: section.id,
        title: section.title,
        requiredDocumentId: section.requiredDocumentId,
        documentField: section.documentField ?? undefined,
      });
    */

    const handleRequestUpload = () =>
      void requestAgreementUpload({
        section: section.id,
        title: section.title,
        submittedDocumentId: section.submittedDocumentId,
        legacyDocumentKey: section.legacyDocumentKey,
      });

    const sectionBusy =
      isReviewLoading(reviewTarget) ||
      isUploadRequestLoading(section.id);
      /* || uploadingId === section.id */

    return (
      <section key={section.id} className="rounded-md border border-[#D1D5DB]">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3">
          <div className="text-[16px] font-semibold leading-6 text-[#111827]">
            {index + 1}. {section.title}
          </div>
          <div className="text-sm text-[#6B7280]">{section.headerText}</div>
        </div>

        {section.uploadedAtLabel ? (
          <div className="border-b border-[#E5E7EB] px-5 py-3 text-sm text-[#6B7280]">
            <span className="font-semibold text-[#111827]">{section.title}</span>
            <span className="ml-3">{section.uploadedAtLabel}</span>
          </div>
        ) : null}

        <div className="flex flex-col items-stretch gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between md:gap-4">
          <AgreementFileCard
            section={section}
            uploading={false}
            esignLoading={esignLoading}
            onUpload={() => undefined}
            onRequestEsign={() =>
              void requestEsign()
            }
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canPreview}
              onClick={() => openDocument(section, "preview")}
              className="inline-flex items-center justify-center text-[color:var(--brand-primary)] disabled:opacity-40"
              aria-label={`View ${section.title}`}
            >
              <Eye className="h-5 w-5" />
            </button>
            {section.kind === "upload" ? (
              <button
                type="button"
                disabled={!canDownload}
                onClick={() => openDocument(section, "download")}
                className="inline-flex items-center justify-center text-[color:var(--brand-primary)] disabled:opacity-40"
                aria-label={`Download ${section.title}`}
              >
                <Download className="h-5 w-5" />
              </button>
            ) : null}
            <DocumentReviewActions
              disabled={!actionsEnabled}
              loading={sectionBusy}
              currentStatus={section.reviewStatus ?? (section.hasFile ? "uploaded" : null)}
              showApprove={section.hasFile}
              showReject={section.hasFile}
              approveVariant="primary"
              onApprove={() => void submitReview(reviewTarget, "approved")}
              onReject={() => void submitReview(reviewTarget, "rejected")}
              onRequestMore={showRequestUpload ? handleRequestUpload : undefined}
              requestMoreLabel={
                isUploadRequestLoading(section.id) ? "Sending..." : "Request to Upload"
              }
              showRequestEsign={section.kind === "esign" && section.hasFile && !section.isSigned}
              esignLoading={esignLoading}
              onRequestEsign={() =>
                void requestEsign()
              }
            />
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 overflow-hidden">
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
            <DetailedTabs applicantId={applicantId} activeTab="Agreement" />

            {/*
            Recruiter agreement review only — admin upload disabled on agreement page.
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
            */}

            {loadError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {loadError}
              </div>
            ) : null}

            {/*
            {uploadError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {uploadError}
              </div>
            ) : null}
            */}

            {actionError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {actionError}
              </div>
            ) : null}

            {loading ? (
              <CandidateDetailLoader label="Loading agreement..." />
            ) : (
              <>
                <DetailedCandidateHeader
                  name={candidateName}
                  role={candidateRole}
                  profilePhotoUrl={applicant?.profile_photo_url}
                  workerId={applicantId}
                  candidateEmail={applicant?.email ?? null}
                />

                <div className="w-full min-w-0 admin-recruiter-content-width">
                  <div className="space-y-6">
                    {w2Section ? renderSection(w2Section, 0) : null}
                    {i9Section ? renderSection(i9Section, 1) : null}
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
