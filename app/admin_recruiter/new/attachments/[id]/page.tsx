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
  is_required?: boolean;
  document_kind?: "certificate" | "license" | null;
  has_expiration?: boolean;
  issued_date?: string | null;
  expiry_date?: string | null;
  files?: Array<{
    id: string;
    url: string | null;
    filename: string;
    status: string | null;
  }>;
};

type WorkerProfileResponse = {
  worker: WorkerProfile;
  attachment_requirements?: AttachmentRequirement[];
};

type SettingsDocument = {
  id: string;
  name: string;
  documentKind: "certificate" | "license";
  isRequired: boolean;
  hasExpiration: boolean;
};

type SettingsProfession = {
  id: string;
  name: string;
  documents: SettingsDocument[];
};

type SettingsCatalog = {
  canManage: boolean;
  workerProfessionId: string | null;
  savedProfessionId: string | null;
  professions: SettingsProfession[];
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
  isRequired: boolean;
  documentKind: "certificate" | "license" | null;
  hasExpiration: boolean;
  issuedDate: string | null;
  expiryDate: string | null;
  files: Array<{
    id: string;
    url: string | null;
    filename: string;
    status: string | null;
  }>;
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
  const [settings, setSettings] = useState<SettingsCatalog | null>(null);
  const [professionId, setProfessionId] = useState("");
  const [fileNameDrafts, setFileNameDrafts] = useState<Record<string, string>>({});
  const [dateDrafts, setDateDrafts] = useState<
    Record<string, { issuedDate: string; expiryDate: string }>
  >({});
  const [newDocumentName, setNewDocumentName] = useState("");
  const [newDocumentKind, setNewDocumentKind] = useState<"certificate" | "license">("certificate");
  const [newDocumentRequired, setNewDocumentRequired] = useState(true);
  const [newDocumentHasExpiration, setNewDocumentHasExpiration] = useState(true);
  const [savingDocuments, setSavingDocuments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchApplicant = useCallback(async (quiet = false) => {
    if (!applicantId) return;
    if (!quiet) setLoading(true);
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

  const loadSettings = useCallback(async () => {
    if (!applicantId) return;
    const response = await fetch(
      `/api/admin/profession-documents?workerId=${encodeURIComponent(applicantId)}`
    );
    const payload = (await response.json()) as SettingsCatalog & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Could not load document settings");
    setSettings(payload);
    setProfessionId(payload.savedProfessionId || payload.workerProfessionId || "");
  }, [applicantId]);

  useEffect(() => {
    void fetchApplicant();
    void loadSettings().catch((error: unknown) => {
      setUploadError(error instanceof Error ? error.message : "Could not load document settings");
    });
  }, [fetchApplicant, loadSettings]);

  const selectedProfession = settings?.professions.find((profession) => profession.id === professionId) ?? null;
  const professionLocked = Boolean(settings?.savedProfessionId);

  async function saveProfessionDocuments(
    nextProfessionId: string,
    documents: Array<{
      id?: string;
      name: string;
      documentKind: "certificate" | "license";
      isRequired: boolean;
      hasExpiration: boolean;
    }>
  ) {
    if (!applicantId || !nextProfessionId) return;
    setSavingDocuments(true);
    setUploadError(null);
    try {
      const response = await fetch("/api/admin/profession-documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionId: nextProfessionId, workerId: applicantId, documents }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not save documents");
      await Promise.all([fetchApplicant(true), loadSettings()]);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not save documents");
    } finally {
      setSavingDocuments(false);
    }
  }

  async function connectProfession(nextProfessionId: string) {
    if (settings?.savedProfessionId) return;
    setProfessionId(nextProfessionId);
    if (!nextProfessionId || !settings?.canManage) return;
    const documents = settings.professions.find((profession) => profession.id === nextProfessionId)?.documents ?? [];
    await saveProfessionDocuments(
      nextProfessionId,
      documents.map((document) => ({
        id: document.id,
        name: document.name,
        documentKind: document.documentKind,
        isRequired: document.isRequired,
        hasExpiration: document.hasExpiration === true,
      }))
    );
  }

  async function commitFileName(
    row: AttachmentRow,
    file: { id: string; filename: string },
    draftKey: string
  ) {
    if (!applicantId) return;
    const fileName = (fileNameDrafts[draftKey] ?? file.filename).trim();
    if (!fileName || fileName === file.filename || fileName === "—") return;
    setSavingDocuments(true);
    setUploadError(null);
    try {
      const response = await fetch("/api/admin/profession-documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: applicantId,
          fileName,
          professionUploadId: file.id.startsWith("legacy") ? undefined : file.id,
          professionDocumentId: row.requiredDocumentId,
          submittedDocumentId: row.submittedDocumentId,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not rename file");
      await fetchApplicant(true);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not rename file");
    } finally {
      setSavingDocuments(false);
    }
  }

  async function addDocument() {
    if (!selectedProfession) {
      setUploadError("Choose a profession before adding a document.");
      return;
    }
    const name = newDocumentName.trim();
    if (!name) {
      setUploadError("Document name is required.");
      return;
    }
    await saveProfessionDocuments(selectedProfession.id, [
      ...selectedProfession.documents.map((document) => ({
        id: document.id,
        name: document.name,
        documentKind: document.documentKind,
        isRequired: document.isRequired,
        hasExpiration: document.hasExpiration === true,
      })),
      {
        name,
        documentKind: newDocumentKind,
        isRequired: newDocumentRequired,
        hasExpiration: newDocumentHasExpiration,
      },
    ]);
    setNewDocumentName("");
    setNewDocumentKind("certificate");
    setNewDocumentRequired(true);
    setNewDocumentHasExpiration(true);
  }

  function rowNeedsExpiration(row: AttachmentRow): boolean {
    if (row.hasExpiration) return true;
    return (
      selectedProfession?.documents.find((document) => document.id === row.requiredDocumentId)
        ?.hasExpiration === true
    );
  }

  function patchDateDraft(rowKey: string, patch: Partial<{ issuedDate: string; expiryDate: string }>) {
    setDateDrafts((current) => ({
      ...current,
      [rowKey]: {
        issuedDate: patch.issuedDate ?? current[rowKey]?.issuedDate ?? "",
        expiryDate: patch.expiryDate ?? current[rowKey]?.expiryDate ?? "",
      },
    }));
  }

  const openUploadPicker = (row: AttachmentRow) => {
    setUploadError(null);
    if (rowNeedsExpiration(row)) {
      const dates = dateDrafts[row.key] ?? {
        issuedDate: row.issuedDate ?? "",
        expiryDate: row.expiryDate ?? "",
      };
      if (!dates.issuedDate.trim() || !dates.expiryDate.trim()) {
        setUploadError(`Add issued and expiry dates for ${row.title} before uploading.`);
        return;
      }
      if (dates.expiryDate < dates.issuedDate) {
        setUploadError(`Expiry date for ${row.title} must be on or after the issued date.`);
        return;
      }
    }
    setPendingUploadRow(row);
    const input = fileInputRef.current;
    if (input) {
      const settingsDoc = selectedProfession?.documents.find(
        (document) => document.id === row.requiredDocumentId
      );
      input.multiple = Boolean(settingsDoc) && !isResumeAttachmentRow(row);
    }
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (fileList: FileList | null) => {
    const row = pendingUploadRow;
    setPendingUploadRow(null);
    const files = Array.from(fileList ?? []);
    if (!files.length || !row || !applicantId) return;

    const dates = dateDrafts[row.key] ?? {
      issuedDate: row.issuedDate ?? "",
      expiryDate: row.expiryDate ?? "",
    };
    const issuedDate = dates.issuedDate.trim();
    const expiryDate = dates.expiryDate.trim();
    if (rowNeedsExpiration(row) && (!issuedDate || !expiryDate)) {
      setUploadError(`Add issued and expiry dates for ${row.title} before uploading.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploadingId(row.key);
    setUploadError(null);

    try {
      for (const file of files.slice(0, 5)) {
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
        if (issuedDate) fd.append("issuedDate", issuedDate);
        if (expiryDate) fd.append("expiryDate", expiryDate);

        const res = await fetch("/api/admin/worker-attachment-upload", {
          method: "POST",
          body: fd,
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(json.error || "Upload failed");
        }
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
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        fileInputRef.current.multiple = false;
      }
    }
  };

  const applicant = profile?.worker ?? null;

  const attachmentRows: AttachmentRow[] = useMemo(() => {
    if (!profile) return [];
    const fromConfig = profile.attachment_requirements ?? [];
    return fromConfig.map((row, index) => {
      const settingsDoc = selectedProfession?.documents.find(
        (document) => document.id === row.required_document_id
      );
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
        isRequired: row.is_required !== false,
        documentKind: row.document_kind ?? null,
        hasExpiration: row.has_expiration === true || settingsDoc?.hasExpiration === true,
        issuedDate: row.issued_date ?? null,
        expiryDate: row.expiry_date ?? null,
        files:
          row.files && row.files.length
            ? row.files
            : row.url
              ? [
                  {
                    id: row.submitted_document_id || row.id,
                    url: row.url,
                    filename: row.filename?.trim() ? row.filename : "—",
                    status: row.status ?? null,
                  },
                ]
              : [],
      };
      return {
        ...mapped,
        key: attachmentRowKey(mapped, index),
      };
    });
  }, [profile, selectedProfession]);

  useEffect(() => {
    setDateDrafts((current) => {
      const next = { ...current };
      for (const row of attachmentRows) {
        if (!row.hasExpiration) continue;
        if (next[row.key]?.issuedDate || next[row.key]?.expiryDate) continue;
        if (!row.issuedDate && !row.expiryDate) continue;
        next[row.key] = {
          issuedDate: row.issuedDate ?? "",
          expiryDate: row.expiryDate ?? "",
        };
      }
      return next;
    });
  }, [attachmentRows]);

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
                void handleFileSelected(e.target.files);
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
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[#E5E7EB] pb-4">
                    <div>
                      <h3 className="text-[20px] font-semibold leading-7 text-[#111827]">Requirements Submitted</h3>
                      <p className="mt-1 text-sm text-[#6B7280]">
                        These documents come from the profession’s upload settings. Add another from settings if needed.
                      </p>
                    </div>
                    <p className="text-sm font-medium text-[#6B7280]">
                      Uploaded{" "}
                      <span className="font-semibold text-[#111827]">{uploadedCount}</span> of{" "}
                      <span className="font-semibold text-[#111827]">{totalCount}</span>
                    </p>
                  </div>

                  {settings ? (
                    <div className="mb-4 block max-w-sm">
                      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#64748B]">
                        Profession
                      </span>
                      {professionLocked ? (
                        <p className="flex h-9 items-center rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 text-sm font-medium text-[#0F172A]">
                          {selectedProfession?.name || "Saved profession"}
                        </p>
                      ) : (
                        <select
                          value={professionId}
                          disabled={!settings.canManage || savingDocuments}
                          onChange={(event) => void connectProfession(event.target.value)}
                          className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] disabled:bg-[#F8FAFC]"
                        >
                          <option value="">Select profession</option>
                          {settings.professions.map((profession) => (
                            <option key={profession.id} value={profession.id}>
                              {profession.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ) : null}

                  <div className="space-y-3">
                      {attachmentRows.map((r, idx) => {
                        const scan = scanById[r.key];
                        const needsExpiration = rowNeedsExpiration(r);
                        const issuedValue =
                          dateDrafts[r.key]?.issuedDate ?? r.issuedDate ?? "";
                        const expiryValue =
                          dateDrafts[r.key]?.expiryDate ?? r.expiryDate ?? "";

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
                              {r.documentKind ? (
                                <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                  {r.documentKind === "license" ? "License" : "Certificate"}
                                </span>
                              ) : null}
                              {r.documentKind ? (
                                <span
                                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                    r.isRequired ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"
                                  }`}
                                >
                                  {r.isRequired ? "Required" : "Optional"}
                                </span>
                              ) : null}
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

                          {needsExpiration ? (
                            <div className="grid gap-3 px-5 pb-1 sm:grid-cols-2 sm:max-w-[520px]">
                              <label className="block space-y-1">
                                <span className="text-[11px] font-medium text-[#64748B]">Issue date</span>
                                <input
                                  type="date"
                                  value={issuedValue}
                                  disabled={savingDocuments || uploadingId === r.key}
                                  onChange={(event) =>
                                    patchDateDraft(r.key, { issuedDate: event.target.value })
                                  }
                                  aria-label={`${r.title} issue date`}
                                  className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] disabled:bg-[#F8FAFC]"
                                />
                              </label>
                              <label className="block space-y-1">
                                <span className="text-[11px] font-medium text-[#64748B]">Expiry date</span>
                                <input
                                  type="date"
                                  value={expiryValue}
                                  disabled={savingDocuments || uploadingId === r.key}
                                  onChange={(event) =>
                                    patchDateDraft(r.key, { expiryDate: event.target.value })
                                  }
                                  aria-label={`${r.title} expiry date`}
                                  className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] disabled:bg-[#F8FAFC]"
                                />
                              </label>
                            </div>
                          ) : null}

                          <div className="flex flex-col gap-3 px-5 py-3">
                            {r.files.length > 0 ? (
                              <div className="flex min-w-0 flex-wrap items-center gap-3">
                                {r.files.map((file) => {
                                  const fileDraftKey = `${r.key}:${file.id}`;
                                  const fileIsPdf = isPdfFile(null, file.filename, file.url);
                                  return (
                                    <div
                                      key={file.id}
                                      className="flex h-[50px] w-full min-w-0 max-w-[280px] items-center gap-2 rounded-[8px] border border-[color:color-mix(in_srgb,var(--brand-primary)_30%,white)] bg-[#F8FAFC] px-3 py-2 sm:w-[240px]"
                                    >
                                      <BrandedFileTypeIcon
                                        type={fileIsPdf ? "pdf" : "jpeg"}
                                        className="h-6 w-6 shrink-0"
                                      />
                                      <div className="min-w-0 flex-1">
                                        {settings?.canManage && !isResumeAttachmentRow(r) ? (
                                          <input
                                            value={fileNameDrafts[fileDraftKey] ?? file.filename}
                                            disabled={savingDocuments}
                                            onChange={(event) =>
                                              setFileNameDrafts((current) => ({
                                                ...current,
                                                [fileDraftKey]: event.target.value,
                                              }))
                                            }
                                            onBlur={() => void commitFileName(r, file, fileDraftKey)}
                                            aria-label={`File name for ${file.filename}`}
                                            className="h-7 w-full min-w-0 rounded border border-[#CBD5E1] bg-white px-2 text-xs font-semibold text-[color:var(--brand-primary)]"
                                          />
                                        ) : (
                                          <div className="truncate text-xs font-semibold leading-4 tracking-[0.01em] text-[color:var(--brand-primary)]">
                                            {file.filename}
                                          </div>
                                        )}
                                        <div className="text-xs font-normal leading-4 tracking-[0.01em] text-[#6B7280]">
                                          Uploaded file
                                        </div>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1.5">
                                        <button
                                          type="button"
                                          disabled={!file.url}
                                          onClick={() =>
                                            file.url && window.open(file.url, "_blank", "noopener,noreferrer")
                                          }
                                          className="inline-flex h-5 w-5 items-center justify-center text-[color:var(--brand-primary)] disabled:opacity-40"
                                          aria-label={`View ${file.filename}`}
                                        >
                                          <Eye className="h-4 w-4" />
                                        </button>
                                        <a
                                          href={file.url ?? undefined}
                                          download
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className={`inline-flex h-5 w-5 items-center justify-center text-[color:var(--brand-primary)] ${
                                            !file.url ? "pointer-events-none opacity-40" : ""
                                          }`}
                                          aria-label={`Download ${file.filename}`}
                                        >
                                          <Download className="h-4 w-4" />
                                        </a>
                                      </div>
                                    </div>
                                  );
                                })}
                                {r.files.length < 5 && !isResumeAttachmentRow(r) ? (
                                  <button
                                    type="button"
                                    disabled={uploadingId === r.key}
                                    onClick={() => openUploadPicker(r)}
                                    className="inline-flex h-[50px] min-w-[120px] items-center justify-center rounded-[8px] border border-dashed border-[color:color-mix(in_srgb,var(--brand-primary)_30%,white)] bg-white px-4 text-xs font-semibold text-[color:var(--brand-primary)] disabled:opacity-50"
                                  >
                                    {uploadingId === r.key ? "Uploading..." : "Add file"}
                                  </button>
                                ) : null}
                              </div>
                            ) : (
                              <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
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
                                <button
                                  type="button"
                                  disabled={uploadingId === r.key}
                                  onClick={() => openUploadPicker(r)}
                                  className="inline-flex h-8 items-center justify-center rounded-md bg-[color:var(--brand-primary)] px-5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-50"
                                >
                                  {uploadingId === r.key ? "Uploading..." : "Upload"}
                                </button>
                              </div>
                            )}

                            {r.files.length > 0 ? (
                              <div className="flex justify-end">
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
                              </div>
                            ) : null}
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

                  {settings?.canManage ? (
                    <form
                      className="mt-4 grid gap-2 rounded-md border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-3 sm:grid-cols-[minmax(0,1fr)_140px_auto_auto_auto] sm:items-center"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void addDocument();
                      }}
                    >
                      <input
                        value={newDocumentName}
                        onChange={(event) => setNewDocumentName(event.target.value)}
                        placeholder="New certificate or license name"
                        className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
                      />
                      <select
                        value={newDocumentKind}
                        onChange={(event) => setNewDocumentKind(event.target.value as "certificate" | "license")}
                        className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm"
                      >
                        <option value="certificate">Certificate</option>
                        <option value="license">License</option>
                      </select>
                      <label className="inline-flex items-center gap-2 text-sm text-[#0F172A]">
                        <input
                          type="checkbox"
                          checked={newDocumentRequired}
                          onChange={(event) => setNewDocumentRequired(event.target.checked)}
                          className="h-4 w-4 rounded border-[#CBD5E1]"
                        />
                        {newDocumentRequired ? "Required" : "Optional"}
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-[#0F172A]">
                        <span className="text-[#64748B]">Expiry</span>
                        <select
                          value={newDocumentHasExpiration ? "yes" : "no"}
                          onChange={(event) => setNewDocumentHasExpiration(event.target.value === "yes")}
                          className="h-9 rounded-lg border border-[#CBD5E1] bg-white px-2 text-sm"
                          aria-label="Requires expiry date"
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </label>
                      <button
                        type="submit"
                        disabled={savingDocuments || !professionId}
                        className="inline-flex h-9 items-center justify-center gap-1 rounded-lg bg-[#012352] px-4 text-sm font-medium text-white disabled:opacity-60"
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                        {savingDocuments ? "Saving…" : "Add"}
                      </button>
                    </form>
                  ) : null}

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

