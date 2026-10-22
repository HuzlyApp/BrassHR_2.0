"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DetailedCandidateHeader from "../../../components/DetailedCandidateHeader";
import DetailedTabs from "../../../components/DetailedTabs";
import CandidateDetailLoader from "../../../components/CandidateDetailLoader";
import BrandedFileTypeIcon from "../../../components/BrandedFileTypeIcon";
import DocumentReviewActions from "../../../components/DocumentReviewActions";
import { useWorkerDocumentReview } from "../../../hooks/useWorkerDocumentReview";
import { legacyDocumentKeyFromField } from "@/lib/admin/document-review";
import { isPdfFile } from "@/lib/document-upload-helpers";
import { isFirmaSigningComplete } from "@/lib/onboarding/firma-step-settings";
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

type AuthorizationRequirement = {
  id: string;
  title: string;
  url: string | null;
  filename: string;
  required_document_id?: string | null;
  submitted_document_id?: string | null;
  legacy_document_key?: string | null;
  status?: string | null;
  step_type?: string;
  step_key?: string;
};

type ProfileApi = {
  worker: WorkerProfile;
  attachment_requirements?: AuthorizationRequirement[];
  legacy_document_reviews?: Record<string, string>;
  document_urls: {
    nursing_license_url: string | null;
    tb_test_url: string | null;
    cpr_certification_url: string | null;
    ssn_url: string | null;
    ssn_back_url: string | null;
    drivers_license_url: string | null;
    drivers_license_back_url: string | null;
    authorization_document_url: string | null;
  };
  signeasy: { document_name: string | null; document_id: string | null };
  firma_signing: {
    signing_request_id: string | null;
    firma_status: string | null;
    iframe_url: string | null;
    updated_at: string | null;
  };
};

type DocSlot = {
  label: string;
  url: string | null;
  requiredDocumentId?: string | null;
  submittedDocumentId?: string | null;
  legacyDocumentKey?: string | null;
  status?: string | null;
  documentField?: string;
};

type DocSection = {
  id: string;
  title: string;
  slots: DocSlot[];
};

type UploadSlot = {
  id: string;
  documentField?: string;
  requiredDocumentId?: string | null;
  title: string;
};

function legacyDocumentFieldForTitle(title: string): string | null {
  const t = title.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("authorization") || t.includes("agreement") || t.includes("employee")) {
    return "authorization";
  }
  if (t.includes("ssn") || t.includes("social security")) {
    return t.includes("back") ? "ssn_back" : "ssn_front";
  }
  if (t.includes("driver") && t.includes("license")) {
    return t.includes("back") ? "dl_back" : "dl_front";
  }
  return null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function fileLabelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : "File";
  } catch {
    return "File";
  }
}

function FileActions({ url }: { url: string | null }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        disabled={!url}
        onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
        className="inline-flex items-center justify-center text-[#0D9488] disabled:opacity-40 disabled:pointer-events-none"
        aria-label="View file"
      >
        <Eye className="h-5 w-5" />
      </button>
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center justify-center text-[#0D9488] ${
          !url ? "pointer-events-none opacity-40" : ""
        }`}
        aria-label="Download file"
      >
        <Download className="h-5 w-5" />
      </a>
    </div>
  );
}

export default function NewApplicantAuthorizationFilledPage() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const applicantId = params?.id;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileApi | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUploadSlot, setPendingUploadSlot] = useState<UploadSlot | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchApplicant = useCallback(async () => {
    if (!applicantId) return;
    if (!isUuid(applicantId)) {
      try {
        const res = await fetch("/api/workers", { cache: "no-store" });
        const json = (await res.json()) as
          | { workers?: Array<{ id?: string | null }> }
          | { error?: string };
        const workers = Array.isArray((json as { workers?: unknown[] }).workers)
          ? ((json as { workers: Array<{ id?: string | null }> }).workers ?? [])
          : [];
        const validWorkers = workers
          .map((w) => (w?.id ? String(w.id).trim() : ""))
          .filter((id) => isUuid(id));
        const unique = Array.from(new Set(validWorkers));
        if (unique.length === 1) {
          router.replace(`/admin_recruiter/new/authorization/${unique[0]}`);
          return;
        }
      } catch {
        // no-op; explicit error shown below
      }
      setLoadError("Invalid workerId in URL. Open Authorization from a specific candidate record.");
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/admin/worker-profile?workerId=${encodeURIComponent(applicantId)}`
      );
      const json = (await res.json()) as ProfileApi & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || `Failed to load profile (${res.status})`);
      }
      setProfile(json);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== "Invalid workerId") {
        console.error("Failed to fetch applicant for authorization:", msg, e);
      }
      setLoadError(msg);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [applicantId, router]);

  useEffect(() => {
    void fetchApplicant();
  }, [fetchApplicant]);

  const {
    actionError,
    submitReview,
    requestEsign,
    isReviewLoading,
    esignLoading,
  } = useWorkerDocumentReview(applicantId, fetchApplicant);

  const openUploadPicker = (slot: UploadSlot) => {
    setUploadError(null);
    setPendingUploadSlot(slot);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (file: File | undefined) => {
    const slot = pendingUploadSlot;
    setPendingUploadSlot(null);
    if (!file || !slot || !applicantId) return;

    setUploadingId(slot.id);
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

  const candidateName = useMemo(() => {
    const n = `${applicant?.first_name ?? ""} ${applicant?.last_name ?? ""}`.trim();
    return n || "Applicant";
  }, [applicant]);

  const candidateRole = applicant?.job_role || "N/A";

  const signeasy = profile?.signeasy;
  const firmaSigning = profile?.firma_signing;
  const du = profile?.document_urls;

  const authUploadedUrl = du?.authorization_document_url?.trim() || null;
  const firmaSigningUrl = firmaSigning?.iframe_url?.trim() || null;
  const authHasPacket = Boolean(
    signeasy?.document_name?.trim() || firmaSigning?.signing_request_id || authUploadedUrl
  );
  const authSigned = Boolean(isFirmaSigningComplete(firmaSigning?.firma_status));
  const authFileLabel =
    signeasy?.document_name?.trim() ||
    (authUploadedUrl ? fileLabelFromUrl(authUploadedUrl) : null) ||
    "Authorization agreement (e-sign)";
  const requestStatus = firmaSigning?.firma_status || "unknown";
  const signingRequestId = firmaSigning?.signing_request_id?.trim() || "";

  const openFirmaSigningUrl = (mode: "preview" | "download") => {
    const url = firmaSigningUrl || authUploadedUrl;
    if (!url) return;
    if (mode === "download") {
      window.location.href = url;
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const legacyReviewMap = profile?.legacy_document_reviews ?? {};

  const authorizationRequirements = useMemo(
    () =>
      (profile?.attachment_requirements ?? []).filter(
        (row) => row.step_type === "authorizations"
      ),
    [profile?.attachment_requirements]
  );

  const documentSections: DocSection[] = useMemo(() => {
    if (authorizationRequirements.length > 0) {
      return authorizationRequirements.map((req) => ({
        id: req.id,
        title: req.title,
        slots: [
          {
            label: "Document",
            url: req.url,
            requiredDocumentId: req.required_document_id ?? null,
            submittedDocumentId: req.submitted_document_id ?? null,
            legacyDocumentKey: req.legacy_document_key ?? legacyDocumentKeyFromField(
              legacyDocumentFieldForTitle(req.title) ?? undefined
            ),
            status: req.status ?? null,
            documentField: legacyDocumentFieldForTitle(req.title) ?? undefined,
          },
        ],
      }));
    }

    if (!du) return [];
    const legacySlot = (
      label: string,
      url: string | null,
      documentField: string,
      legacyKey: string
    ): DocSlot => ({
      label,
      url,
      documentField,
      legacyDocumentKey: legacyKey,
      status: legacyReviewMap[legacyKey] ?? (url ? "uploaded" : null),
    });

    return [
      {
        id: "ssn",
        title: "SSN Card",
        slots: [
          legacySlot("Front", du.ssn_url, "ssn_front", "ssn_url"),
          legacySlot("Back", du.ssn_back_url, "ssn_back", "ssn_back_url"),
        ],
      },
      {
        id: "dl",
        title: "Driver's License",
        slots: [
          legacySlot("Front", du.drivers_license_url, "dl_front", "drivers_license_url"),
          legacySlot("Back", du.drivers_license_back_url, "dl_back", "drivers_license_back_url"),
        ],
      },
      {
        id: "employment",
        title: "Employment Agreement",
        slots: [
          {
            label: "Agreement",
            url: authHasPacket ? "signeasy-linked" : null,
            documentField: "authorization",
            legacyDocumentKey: "document_url",
            status: legacyReviewMap.document_url ?? (authHasPacket ? "uploaded" : null),
          },
        ],
      },
    ];
  }, [authorizationRequirements, du, authHasPacket, legacyReviewMap]);

  const reviewRows = useMemo(() => {
    const rows: { id: string; title: string }[] = [
      { id: "auth", title: "Authorization" },
      { id: "ssn", title: "SSN Card" },
      { id: "dl", title: "Driver's License" },
    ];
    return rows;
  }, []);

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
            <DetailedTabs applicantId={applicantId} activeTab="Authorization" />

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
              <CandidateDetailLoader label="Loading authorization..." />
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
              <section>
                <div className="mb-3 text-[20px] font-semibold leading-7 text-[#1F2937]">Authorization</div>
                <div className="rounded-md border border-[#D1D5DB]">
                  <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3">
                    <div className="text-[16px] font-semibold leading-6 text-[#111827]">1. Authorization</div>
                    <div className="text-sm text-[#6B7280]">
                      {authSigned ? (
                        <>
                          Signed <span className="font-semibold text-[#111827]">1</span> of{" "}
                          <span className="font-semibold text-[#111827]">1</span>
                        </>
                      ) : (
                        <>Packet {authHasPacket ? "created" : "not linked"}</>
                      )}
                    </div>
                  </div>

                  <div className="border-b border-[#E5E7EB] bg-[#F9FAFB] px-5 py-3">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#374151]">
                      <span className="font-semibold">Signature status:</span>
                      <span className="rounded-full bg-white px-2 py-1 font-medium capitalize">
                        {requestStatus.replaceAll("_", " ")}
                      </span>
                      {signingRequestId ? (
                        <span className="text-[#6B7280]">Request ID: {signingRequestId}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col items-stretch gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between md:gap-4">
                    {authHasPacket ? (
                      <div className="flex h-[50px] w-full min-w-0 max-w-[520px] items-center gap-2 rounded-[8px] border border-[#99D8D3] bg-[#F8FAFC] px-3 py-2 md:w-[306px] md:min-w-[306px]">
                        <BrandedFileTypeIcon type="pdf" className="h-6 w-6 shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold leading-4 tracking-[0.01em] text-[#0D9488]">
                            {authFileLabel}
                          </div>
                          <div className="text-xs font-normal leading-4 tracking-[0.01em] text-[#6B7280]">
                            7.23 MB
                          </div>
                        </div>
                        {authSigned ? (
                          <span className="ml-auto rounded-md bg-[#7BE2DB] px-2 py-1 text-[10px] font-semibold text-[#0D9488]">
                            Signed
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex h-[50px] w-full max-w-[520px] items-center justify-between rounded-[8px] border border-dashed border-[#99D8D3] bg-[#F8FAFC] px-3 py-2 md:w-[306px]">
                        <span className="text-xs text-[#6B7280]">No Document</span>
                        <button
                          type="button"
                          disabled={uploadingId === "auth"}
                          onClick={() =>
                            openUploadPicker({
                              id: "auth",
                              documentField: "authorization",
                              title: "Authorization",
                            })
                          }
                          className="inline-flex h-8 items-center justify-center rounded-md border border-[#99D8D3] px-4 text-xs font-semibold text-[#0D9488] disabled:opacity-50"
                        >
                          {uploadingId === "auth" ? "Uploading..." : "Upload"}
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openFirmaSigningUrl("preview")}
                        disabled={!firmaSigningUrl && !authUploadedUrl}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#99D8D3] text-[#0D9488] disabled:opacity-40"
                        title="Preview authorization document"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openFirmaSigningUrl("download")}
                        disabled={!firmaSigningUrl && !authUploadedUrl}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#99D8D3] text-[#0D9488] disabled:opacity-40"
                        title="Download authorization document"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <DocumentReviewActions
                        disabled={!authHasPacket && !authUploadedUrl}
                        loading={isReviewLoading({ legacyDocumentKey: "document_url" })}
                        currentStatus={legacyReviewMap.document_url ?? (authSigned ? "approved" : "uploaded")}
                        onApprove={() =>
                          void submitReview({ legacyDocumentKey: "document_url" }, "approved")
                        }
                        onReject={() =>
                          void submitReview({ legacyDocumentKey: "document_url" }, "rejected")
                        }
                        showRequestEsign
                        esignLoading={esignLoading}
                        onRequestEsign={() => void requestEsign()}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="mt-8">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[20px] font-semibold leading-7 text-[#1F2937]">Documents</div>
                  {(() => {
                    const coreSections = documentSections.filter((s) => s.id !== "employment");
                    const uploaded = coreSections.reduce(
                      (n, d) => n + d.slots.filter((s) => s.url).length,
                      0
                    );
                    const total = coreSections.reduce((n, d) => n + d.slots.length, 0);
                    return (
                  <div className="text-sm text-[#6B7280]">
                    Uploaded{" "}
                    <span className="font-semibold text-[#111827]">
                      {uploaded}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-[#111827]">
                      {total}
                    </span>
                  </div>
                    );
                  })()}
                </div>

                <div className="space-y-4">
                  {documentSections.map((d, idx) => (
                    <div key={d.id} className="w-full rounded-md border border-[#D1D5DB] md:h-[130px]">
                      <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3">
                        <div className="text-[16px] font-semibold leading-6 text-[#111827]">
                          {idx + 2}. {d.title}
                        </div>
                        <FileActions url={d.slots[0]?.url || d.slots[1]?.url || null} />
                      </div>

                      <div className="flex flex-col items-stretch gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between md:gap-4">
                        <div className="flex flex-col gap-3 md:flex-row">
                          {d.id === "employment" && !authSigned ? (
                            <div className="flex h-[50px] w-full min-w-0 max-w-[520px] md:w-[306px] md:min-w-[306px] items-center justify-between rounded-[8px] border border-dashed border-[#99D8D3] bg-[#F8FAFC] px-3 py-2">
                              <span className="text-xs text-[#6B7280]">No Document</span>
                              <button
                                type="button"
                                disabled={uploadingId === "employment"}
                                onClick={() =>
                                  openUploadPicker({
                                    id: "employment",
                                    documentField: "authorization",
                                    requiredDocumentId: d.slots[0]?.requiredDocumentId,
                                    title: "Employment Agreement",
                                  })
                                }
                                className="inline-flex h-8 items-center justify-center rounded-md border border-[#99D8D3] px-4 text-xs font-semibold text-[#0D9488] disabled:opacity-50"
                              >
                                {uploadingId === "employment" ? "Uploading..." : "Upload"}
                              </button>
                            </div>
                          ) : (
                            d.slots.map((slot) =>
                              slot.url ? (
                                <div
                                  key={`${d.id}-${slot.label}`}
                                  className="flex h-[50px] w-full min-w-0 max-w-[520px] md:w-[306px] md:min-w-[306px] items-center gap-2 rounded-[8px] border border-[#99D8D3] bg-[#F8FAFC] px-3 py-2"
                                >
                                  <BrandedFileTypeIcon
                                    type={isPdfFile(null, fileLabelFromUrl(slot.url ?? ""), slot.url) ? "pdf" : "jpeg"}
                                    className="h-6 w-6 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-semibold leading-4 tracking-[0.01em] text-[color:var(--brand-primary)]">
                                      {d.id === "employment" ? authFileLabel : fileLabelFromUrl(slot.url)}
                                    </div>
                                    <div className="text-xs font-normal leading-4 tracking-[0.01em] text-[#6B7280]">
                                      5.23 MB
                                    </div>
                                  </div>
                                  {d.id === "employment" && authSigned ? (
                                    <span className="ml-auto rounded-md bg-[#7BE2DB] px-2 py-1 text-[10px] font-semibold text-[#0D9488]">
                                      Signed
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <div
                                  key={`${d.id}-${slot.label}`}
                                  className="flex h-[50px] w-full min-w-0 max-w-[520px] md:w-[306px] md:min-w-[306px] items-center justify-between rounded-[8px] border border-dashed border-[#99D8D3] bg-[#F8FAFC] px-3 py-2"
                                >
                                  <span className="text-xs text-[#6B7280]">
                                    {slot.label === "Front" ? "Upload card front" : "Upload card back"}
                                  </span>
                                  <button
                                    type="button"
                                    disabled={uploadingId === `${d.id}-${slot.label}`}
                                    onClick={() =>
                                      openUploadPicker({
                                        id: `${d.id}-${slot.label}`,
                                        requiredDocumentId: slot.requiredDocumentId,
                                        documentField: slot.documentField,
                                        title:
                                          slot.label === "Document"
                                            ? d.title
                                            : `${d.title} ${slot.label}`,
                                      })
                                    }
                                    className="inline-flex h-8 items-center justify-center rounded-md border border-[#99D8D3] bg-white px-4 text-xs font-semibold text-[#0D9488] disabled:opacity-50"
                                  >
                                    {uploadingId === `${d.id}-${slot.label}` ? "Uploading..." : "Upload"}
                                  </button>
                                </div>
                              )
                            )
                          )}
                        </div>

                        {(() => {
                          const reviewSlot =
                            d.slots.find((slot) => slot.url && slot.url !== "signeasy-linked") ??
                            d.slots[0];
                          const reviewTarget = {
                            submittedDocumentId: reviewSlot?.submittedDocumentId ?? null,
                            legacyDocumentKey: reviewSlot?.legacyDocumentKey ?? null,
                          };
                          return (
                            <DocumentReviewActions
                              disabled={!d.slots.some((s) => s.url && s.url !== "signeasy-linked")}
                              loading={isReviewLoading(reviewTarget)}
                              currentStatus={reviewSlot?.status}
                              onApprove={() => void submitReview(reviewTarget, "approved")}
                              onReject={() => void submitReview(reviewTarget, "rejected")}
                              onRequestMore={() =>
                                void submitReview(reviewTarget, "needs_revision")
                              }
                              requestMoreLabel="Request a doc"
                              showRequestEsign={d.id === "employment"}
                              esignLoading={esignLoading}
                              onRequestEsign={() => void requestEsign()}
                            />
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
