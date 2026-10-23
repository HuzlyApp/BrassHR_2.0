"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Download,
  Eye,
  FileSignature,
  FileText,
  Handshake,
  Layers,
  Mail,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { useHireJourneyTheme } from "@/app/admin_recruiter/components/hire-stage/HireJourneyTheme";
import { hireJourneyThemeCssVars } from "@/lib/tenant/hire-journey-theme";
import { brandingToCssVars, readableTextOnBrand } from "@/lib/tenant/tenant-branding";
import type {
  WorkflowStepInspection,
  WorkflowStepInspectionKind,
} from "@/lib/onboarding/candidate-workflow-step-inspection";
import {
  stepDisplayStatusLabel,
  type WorkflowStepDisplayStatus,
} from "@/lib/onboarding/assigned-workflow-steps";
import { isAgreementEsignStep, isAuthorizationEsignStep } from "@/lib/onboarding/lock-post-hire";
import {
  decisionLabel,
  isDecisionVariant,
  staffActionLabel,
  staffActionResultMessage,
  staffStepVariantForLibraryId,
  type StaffStepAction,
  type StaffStepEmailResult,
} from "@/lib/onboarding/staff-step-review-shared";
import { lifecyclePhaseLabel } from "@/lib/onboarding/workflow-phase-groups";
import { workflowStepOwnershipCopy } from "@/lib/onboarding/workflow-step-ownership-copy";
import { isNamedRecruiterScreeningStep } from "@/lib/onboarding/recruiter-screening-progress";
import {
  candidateInterviewStatusLabel,
  candidateInterviewStatusTone,
  interviewStepStatus,
  type CandidateInterview,
  type StepPillTone,
} from "@/lib/onboarding/interview-step";
import { formatInterviewDate, formatInterviewTimeRange } from "@/lib/interviews/format";
import JobApplicationStepSection from "./JobApplicationStepSection";
import OfferAcceptanceSection from "./OfferAcceptanceSection";
import RecruiterScreeningAiSection from "./RecruiterScreeningAiSection";
import SkillAssessmentResults from "./SkillAssessmentResults";
import WorkflowStepStaffActionModal from "./WorkflowStepStaffActionModal";
import StepDocumentUploadsSection, { ExtraFilesSection } from "./StepDocumentUploadsSection";
import type { StepUploadSlot } from "@/lib/onboarding/staff-step-documents";
import { StageContextNotesSection } from "./StageContextNotesSection";
import { hireStageLabelForStep } from "@/lib/onboarding/hire-stage-groups";
import { isPreHireStatusStageName } from "@/lib/jobs/application-statuses/stage-assignments";
import { isWelcomeEmailWorkflowStep } from "@/lib/onboarding/welcome-email-step";

const KIND_ICONS: Record<WorkflowStepInspectionKind, LucideIcon> = {
  job_application: BriefcaseBusiness,
  resume: FileText,
  upload: UploadCloud,
  form: ClipboardList,
  assessment: ClipboardCheck,
  references: Users,
  agreement: FileSignature,
  background_check: ShieldCheck,
  final_review: CheckCircle2,
  offer: Handshake,
  generic: Layers,
};

type BadgeTone = StepPillTone | "submitted" | "revision";

/** Status colour stays semantic so it never competes with the tenant palette. */
const BADGE_TONE: Record<BadgeTone, { badge: string; dot: string }> = {
  success: { badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/25", dot: "bg-emerald-500" },
  warning: { badge: "bg-amber-50 text-amber-800 ring-amber-600/25", dot: "bg-amber-500" },
  revision: { badge: "bg-orange-50 text-orange-800 ring-orange-600/25", dot: "bg-orange-500" },
  danger: { badge: "bg-red-50 text-red-700 ring-red-600/25", dot: "bg-red-500" },
  info: { badge: "bg-blue-50 text-blue-700 ring-blue-600/25", dot: "bg-blue-500" },
  submitted: { badge: "bg-indigo-50 text-indigo-700 ring-indigo-600/25", dot: "bg-indigo-500" },
  neutral: { badge: "bg-slate-100 text-slate-700 ring-slate-500/25", dot: "bg-slate-400" },
};

const STATUS_TONE: Record<WorkflowStepDisplayStatus, BadgeTone> = {
  not_started: "neutral",
  in_progress: "info",
  submitted: "submitted",
  under_review: "warning",
  completed: "success",
  approved: "success",
  rejected: "danger",
  needs_revision: "revision",
  skipped: "neutral",
  not_applicable: "neutral",
  blocked: "danger",
};

function StatusBadge({
  tone,
  label,
  className = "",
}: {
  tone: BadgeTone;
  label: string;
  className?: string;
}) {
  const styles = BADGE_TONE[tone];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold leading-4 ring-1 ring-inset ${styles.badge} ${className}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${styles.dot}`} />
      {label}
    </span>
  );
}

/** Candidate steps still waiting on the candidate; submitted / completed steps need no reminder. */
const CANDIDATE_EMAIL_STATUSES: ReadonlySet<WorkflowStepDisplayStatus> = new Set([
  "not_started",
  "in_progress",
  "needs_revision",
  "rejected",
  "blocked",
  "skipped",
]);

function candidateEmailNotice(
  email: StaffStepEmailResult | null | undefined,
  welcomeTemplate?: boolean
): {
  tone: "success" | "warning";
  message: string;
} {
  if (welcomeTemplate && email?.sent) {
    return {
      tone: "success",
      message: "Welcome email sent using your tenant Welcome email template.",
    };
  }
  if (email?.sent && email.lockedStepTitle && email.nextStepTitle) {
    return {
      tone: "success",
      message: `Email sent. "${email.lockedStepTitle}" is still locked, so the link opens "${email.nextStepTitle}", which the candidate needs to complete first.`,
    };
  }
  if (email?.sent) {
    return {
      tone: "success",
      message: email.nextStepTitle
        ? `Email sent. The candidate received a link to complete "${email.nextStepTitle}".`
        : "Email sent. The candidate received a link to continue.",
    };
  }
  if (email?.reason === "RESEND_NOT_CONFIGURED") {
    return { tone: "warning", message: "Email isn't configured for this environment, so nothing was sent." };
  }
  return {
    tone: "warning",
    message: `The email couldn't be sent${email?.reason ? ` (${email.reason})` : ""}. Try again in a moment.`,
  };
}

/** Decision steps are a staff to-do, so their open states read amber/orange rather than grey/blue. */
const DECISION_TONE: Partial<Record<WorkflowStepDisplayStatus, WorkflowStepDisplayStatus>> = {
  not_started: "under_review",
  in_progress: "needs_revision",
  blocked: "rejected",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAnswer(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function responseFileUrl(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function titleCase(value: string): string {
  return value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function Meta({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-800">{value?.trim() || "—"}</dd>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {count != null ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {count}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function CenteredEmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
}) {
  return (
    <section className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      <span
        aria-hidden
        className="inline-flex size-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500"
      >
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>
    </section>
  );
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  online: "Online",
  phone: "Phone",
  in_person: "In person",
};

function InterviewCard({
  interview,
  total,
  latest,
}: {
  interview: CandidateInterview;
  total: number;
  latest: boolean;
}) {
  const name =
    interview.sequence && total > 1 ? `Interview ${interview.sequence} of ${total}` : "Interview";
  return (
    <li
      className={`rounded-lg border px-3 py-3 ${
        latest ? "border-[color:var(--brand-primary)]/40 bg-white" : "border-slate-200 bg-white"
      } ${interview.status === "cancelled" ? "opacity-70" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            {name}
            {latest ? (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--brand-primary) 12%, white)",
                  color: "var(--brand-primary)",
                }}
              >
                Latest
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 break-words text-xs text-slate-600">{interview.title}</p>
        </div>
        <StatusBadge
          tone={candidateInterviewStatusTone(interview.status)}
          label={candidateInterviewStatusLabel(interview.status)}
        />
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Meta label="Date" value={formatInterviewDate(interview.startsAt)} />
        <Meta
          label="Time"
          value={`${formatInterviewTimeRange(interview.startsAt, interview.endsAt)} ET`}
        />
        <Meta
          label="Meeting type"
          value={interview.meetingType ? MEETING_TYPE_LABELS[interview.meetingType] ?? titleCase(interview.meetingType) : null}
        />
        <Meta
          label="Interviewers"
          value={interview.interviewers.map((person) => person.name).join(", ") || null}
        />
        {interview.location ? <Meta label="Location" value={interview.location} /> : null}
        <Meta label="Booked" value={formatDateTime(interview.createdAt)} />
      </dl>
      {interview.meetingLink ? (
        <a
          href={interview.meetingLink}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block break-all text-xs font-semibold text-[color:var(--brand-primary)] hover:underline"
        >
          Join meeting
        </a>
      ) : null}
      {interview.notes ? (
        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {interview.notes}
        </p>
      ) : null}
    </li>
  );
}

export default function CandidateWorkflowStepModal({
  open,
  onOpenChange,
  loading,
  error,
  inspection: initialInspection,
  workerId,
  onStepUpdated,
  onScheduleInterview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
  error?: string | null;
  inspection: WorkflowStepInspection | null;
  /** Enables complete / reject / reopen for staff-owned steps. */
  workerId?: string;
  onStepUpdated?: () => void | Promise<void>;
  /** Shown on interview steps until the interview outcome is recorded. */
  onScheduleInterview?: () => void;
}) {
  const branding = useTenantBranding();
  const hireJourneyTheme = useHireJourneyTheme();
  const [activeInspectionOverride, setActiveInspectionOverride] = useState<WorkflowStepInspection | null>(null);
  const inspection = activeInspectionOverride ?? initialInspection;
  const currentInspection = inspection;
  const title = inspection?.step.title ?? "Notes";
  const stepId = inspection?.step.id ?? null;
  const [pendingAction, setPendingAction] = useState<StaffStepAction | null>(null);
  const [pendingOnBehalf, setPendingOnBehalf] = useState(false);
  const [pendingVerify, setPendingVerify] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "warning"; message: string } | null>(null);
  const [resyncing, setResyncing] = useState(false);
  const [resyncNotice, setResyncNotice] = useState<{ tone: "success" | "warning"; message: string } | null>(null);

  useEffect(() => {
    setActiveInspectionOverride(null);
    setPendingAction(null);
    setPendingOnBehalf(false);
    setPendingVerify(false);
    setUploadingKey(null);
    setUploadError(null);
    setActionError(null);
    setNotice(null);
    setResyncNotice(null);
  }, [stepId, open]);

  async function handleResyncFirma() {
    if (!workerId || !stepId || resyncing) return;
    setResyncing(true);
    setResyncNotice(null);
    try {
      const res = await fetch(
        `/api/admin/candidates/${encodeURIComponent(workerId)}/workflow-steps/${encodeURIComponent(stepId)}/resync-firma`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) {
        setResyncNotice({
          tone: "warning",
          message: json.error || "Failed to re-sync signing status from Firma.",
        });
        return;
      }
      if (json.inspection) {
        setActiveInspectionOverride(json.inspection);
      }
      setResyncNotice({
        tone: "success",
        message: json.is_signed
          ? "Signing status confirmed as Signed. Agreement document is available to preview and download."
          : `Live signing status re-synced: ${json.firma_status || "Pending"}.`,
      });
      await onStepUpdated?.();
    } catch (err) {
      setResyncNotice({
        tone: "warning",
        message: err instanceof Error ? err.message : "Failed to re-sync signing status.",
      });
    } finally {
      setResyncing(false);
    }
  }

  // Radix portals render outside the branding wrapper, so re-declare the vars here
  // and drive the header/button colours straight from the tenant palette. The header
  // stays a light brand wash so the secondary-coloured title keeps its contrast.
  const brandStyle = useMemo(() => {
    const modalButton = hireJourneyTheme?.modalButtonColor;
    const buttonCustomized = Boolean(modalButton && modalButton.toUpperCase() !== branding.primaryHex.toUpperCase());
    return {
      ...brandingToCssVars(branding),
      ...(hireJourneyTheme ? hireJourneyThemeCssVars(hireJourneyTheme) : {}),
      "--step-modal-header": `linear-gradient(135deg, color-mix(in srgb, ${branding.primaryHex} 16%, white) 0%, color-mix(in srgb, ${branding.secondaryHex} 8%, white) 100%)`,
      "--step-modal-cta": buttonCustomized
        ? modalButton
        : `linear-gradient(90deg, ${branding.primaryHex} 0%, color-mix(in srgb, ${branding.primaryHex} 74%, white) 100%)`,
      "--step-modal-icon": `linear-gradient(135deg, ${branding.primaryHex} 0%, color-mix(in srgb, ${branding.primaryHex} 65%, white) 100%)`,
      "--step-modal-on-primary": readableTextOnBrand(buttonCustomized ? modalButton! : branding.primaryHex),
      "--step-modal-on-secondary": readableTextOnBrand(branding.secondaryHex),
    } as React.CSSProperties;
  }, [branding, hireJourneyTheme]);

  const staffAction = currentInspection?.staffAction;
  const staffReview = currentInspection?.staffReview ?? null;
  const canAct = Boolean(workerId && staffAction?.allowed && staffAction.actions.length);
  const KindIcon = currentInspection ? KIND_ICONS[currentInspection.kind] : Layers;
  const variant = staffAction?.variant ?? "default";
  const enrollmentNotReady = currentInspection?.enrollment?.decision === "not_ready";
  const statusLabel = !currentInspection
    ? ""
    : enrollmentNotReady
      ? "Not ready"
      : stepDisplayStatusLabel(currentInspection.step);
  const interviewState = currentInspection ? interviewStepStatus(currentInspection.step) : null;
  const statusTone: BadgeTone = !currentInspection
    ? "neutral"
    : enrollmentNotReady
      ? "warning"
      : interviewState
      ? interviewState.tone
      : isDecisionVariant(staffStepVariantForLibraryId(currentInspection.step.stepType))
        ? STATUS_TONE[DECISION_TONE[currentInspection.step.displayStatus] ?? currentInspection.step.displayStatus]
        : STATUS_TONE[currentInspection.step.displayStatus];
  const interviews = currentInspection?.interviews ?? null;
  const interviewsNewestFirst = useMemo(
    () => (interviews ? [...interviews].reverse() : []),
    [interviews]
  );
  const latestInterviewId = currentInspection?.step.interview?.latest?.id ?? null;
  const activeInterviewCount = currentInspection?.step.interview?.count ?? 0;
  const canSchedule = Boolean(
    onScheduleInterview &&
      interviewState &&
      interviewState.key !== "completed" &&
      interviewState.key !== "rejected"
  );
  const documentUploads = currentInspection?.documentUploads ?? null;
  const candidateUploadStep = Boolean(documentUploads && !staffAction?.allowed);
  const candidateReview = currentInspection?.candidateReview ?? null;
  const authorizationEsign = Boolean(
    inspection &&
      inspection.phase !== "post_hire" &&
      isAgreementEsignStep({
        snapshotStepId: inspection.step.snapshotStepId,
        stepKey: inspection.step.stepKey,
        stepType: inspection.step.stepType,
        title: inspection.step.title,
      })
  );
  const authorizationConfirmation = Boolean(
    inspection &&
      inspection.phase !== "post_hire" &&
      isAuthorizationEsignStep({
        snapshotStepId: inspection.step.snapshotStepId,
        stepKey: inspection.step.stepKey,
        stepType: inspection.step.stepType,
        title: inspection.step.title,
      })
  );
  const authorizationAwaitingSignature = Boolean(
    authorizationEsign && !inspection?.agreement?.isSigned
  );
  const canVerifyCandidate = Boolean(
    workerId &&
      candidateReview?.canVerify &&
      (authorizationConfirmation || !authorizationEsign || inspection?.agreement?.isSigned)
  );
  const canCompleteForCandidate = Boolean(
    workerId &&
      !canVerifyCandidate &&
      !authorizationEsign &&
      (candidateReview?.canComplete || documentUploads?.canCompleteForCandidate)
  );
  // The candidate re-submitted after an earlier verification, so that verification no longer applies.
  const staleCandidateVerification = Boolean(
    candidateReview && !candidateReview.verified && staffReview?.decision === "complete"
  );
  const slotDocumentIds = useMemo(
    () => new Set((documentUploads?.slots ?? []).flatMap((slot) => (slot.documentId ? [slot.documentId] : []))),
    [documentUploads]
  );
  const otherDocuments = useMemo(
    () => (inspection?.documents ?? []).filter((doc) => !slotDocumentIds.has(doc.id)),
    [inspection?.documents, slotDocumentIds]
  );
  const ownership = workflowStepOwnershipCopy({
    kind: currentInspection?.kind,
    staffCanAct: Boolean(staffAction?.allowed),
    displayStatus: currentInspection?.step.displayStatus,
    staffCanUpload: candidateUploadStep && Boolean(documentUploads?.canUpload),
    candidateReview: candidateReview?.verified ? "verified" : candidateReview?.canVerify ? "awaiting" : null,
  });
  const stepSideLabel = ownership.badge;
  const screeningApplicationId =
    currentInspection && isNamedRecruiterScreeningStep(currentInspection.step)
      ? currentInspection.applicationId
      : null;
  const formQuestions = useMemo(() => {
    const questions = inspection?.form?.questions ?? [];
    return screeningApplicationId
      ? questions.filter((question) => formatAnswer(question.answer) !== "—")
      : questions;
  }, [inspection?.form?.questions, screeningApplicationId]);
  const hireLifecycle = inspection?.phase === "post_hire" ? "post_hire" : "pre_hire";
  const hireStageName = useMemo(() => {
    if (!inspection) return null;
    return hireStageLabelForStep({
      stageName: inspection.step.settings?.stageName,
      libraryId: inspection.step.stepType,
      stepKey: inspection.step.stepKey,
      lifecycle: hireLifecycle,
    });
  }, [hireLifecycle, inspection]);
  const showStageStatus =
    hireLifecycle === "pre_hire" &&
    Boolean(inspection?.applicationId) &&
    Boolean(hireStageName && isPreHireStatusStageName(hireStageName));
  const isWelcomeEmailStep =
    inspection ? isWelcomeEmailWorkflowStep(inspection.step.stepType) : false;
  const agreementPendingReview = Boolean(authorizationEsign && !candidateReview?.verified);
  const authorizationOpen = Boolean(authorizationConfirmation && !candidateReview?.verified);
  const canEmailCandidate = Boolean(
    workerId &&
      inspection &&
      (authorizationOpen ||
        authorizationAwaitingSignature ||
        agreementPendingReview ||
        (isWelcomeEmailStep && inspection.phase === "post_hire") ||
        (!staffAction?.allowed &&
          CANDIDATE_EMAIL_STATUSES.has(inspection.step.displayStatus)))
  );
  const showFooter =
    !loading &&
    !error &&
    (canSchedule ||
      (canAct && staffAction) ||
      canEmailCandidate ||
      canCompleteForCandidate ||
      canVerifyCandidate);

  async function uploadStepDocument(
    slot: StepUploadSlot,
    file: File,
    dates?: { issuedDate: string; expiryDate: string }
  ) {
    if (!workerId || !stepId || uploadingKey) return;
    setUploadingKey(slot.key);
    setUploadError(null);
    setNotice(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("slotKey", slot.key);
      if (dates?.issuedDate) body.append("issuedDate", dates.issuedDate);
      if (dates?.expiryDate) body.append("expiryDate", dates.expiryDate);
      const res = await fetch(
        `/api/admin/candidates/${encodeURIComponent(workerId)}/workflow-steps/${encodeURIComponent(stepId)}/documents`,
        { method: "POST", credentials: "include", body }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        inspection?: WorkflowStepInspection | null;
      };
      if (!res.ok) throw new Error(json.error || "Failed to upload the document.");
      if (json.inspection) setActiveInspectionOverride(json.inspection);
      setNotice({ tone: "success", message: `${slot.title} uploaded for the candidate.` });
      await onStepUpdated?.();
      if (onStepUpdated) setActiveInspectionOverride(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload the document.");
    } finally {
      setUploadingKey(null);
    }
  }

  async function sendCandidateEmail() {
    if (!workerId || !stepId) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/admin/candidates/${encodeURIComponent(workerId)}/workflow-steps/${encodeURIComponent(stepId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send_email", clientOrigin: window.location.origin }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        email?: StaffStepEmailResult | null;
      };
      setNotice(
        res.ok
          ? candidateEmailNotice(json.email, isWelcomeEmailStep)
          : { tone: "warning", message: json.error || "Failed to send the email." }
      );
      if (res.ok) await onStepUpdated?.();
    } catch {
      setNotice({ tone: "warning", message: "Failed to send the email." });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAction(
    input: { note: string; notifyCandidate: boolean },
    direct?: { action: StaffStepAction; onBehalf: boolean; verify: boolean }
  ) {
    const action = direct?.action ?? pendingAction;
    const onBehalf = direct?.onBehalf ?? pendingOnBehalf;
    const verify = direct?.verify ?? pendingVerify;
    if (!workerId || !stepId || !action) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(
        `/api/admin/candidates/${encodeURIComponent(workerId)}/workflow-steps/${encodeURIComponent(stepId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            note: input.note || null,
            notifyCandidate: input.notifyCandidate,
            clientOrigin: window.location.origin,
            ...(onBehalf ? { onBehalfOfCandidate: true } : {}),
            ...(verify ? { verifyCandidateSubmission: true } : {}),
          }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        email?: StaffStepEmailResult | null;
        applicationStatus?: { statusName: string } | null;
      };
      if (!res.ok) throw new Error(json.error || "Failed to update this step.");
      setPendingAction(null);
      setPendingOnBehalf(false);
      setPendingVerify(false);
      if (action === "complete") {
        onOpenChange(false);
        await onStepUpdated?.();
        return;
      }
      const resultNotice =
        action === "reject" && variant === "default" && inspection && !inspection.step.required
          ? { tone: "success" as const, message: "Step rejected. It's optional, so it doesn't block the candidate's next stage." }
          : staffActionResultMessage(action, json.email ?? null, variant);
      const statusName = json.applicationStatus?.statusName;
      setNotice(
        statusName
          ? { ...resultNotice, message: `${resultNotice.message} Progress status updated to "${statusName}".` }
          : resultNotice
      );
      await onStepUpdated?.();
      if (onStepUpdated) setActiveInspectionOverride(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update this step.");
    } finally {
      setSubmitting(false);
    }
  }

  function markCompleteNow(flags: { onBehalf: boolean; verify: boolean }) {
    setActionError(null);
    void submitAction(
      { note: "", notifyCandidate: false },
      { action: "complete", onBehalf: flags.onBehalf, verify: flags.verify }
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-slate-950/50 backdrop-blur-[2px]" />
        <Dialog.Content
          style={brandStyle}
          className="fixed left-1/2 top-1/2 z-[101] flex max-h-[calc(100dvh-2rem)] w-[min(58rem,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white outline-none"
          aria-describedby="workflow-step-inspection-desc"
        >
          <div
            className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-5 py-4"
            style={{ background: "var(--step-modal-header)" }}
          >
            <span
              aria-hidden
              className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm"
              style={{ background: "var(--step-modal-icon)", color: "var(--step-modal-on-primary)" }}
            >
              <KindIcon className="h-5 w-5" />
            </span>

            <div className="min-w-0 flex-1">
              <Dialog.Title
                className="truncate text-lg font-semibold leading-6"
                style={{ color: "var(--brand-secondary)" }}
              >
                {title}
              </Dialog.Title>
              <Dialog.Description id="workflow-step-inspection-desc" className="mt-1 text-xs text-slate-600">
                {currentInspection
                  ? [
                      lifecyclePhaseLabel(currentInspection.phase),
                      titleCase(currentInspection.step.stepType),
                      currentInspection.step.required ? "Required" : "Optional",
                    ].join(" · ")
                  : "Candidate workflow step"}
              </Dialog.Description>
              {currentInspection ? (
                <span
                  className="mt-2 inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--brand-primary) 12%, white)",
                    color: "var(--brand-primary)",
                  }}
                >
                  {stepSideLabel}
                </span>
              ) : null}
              {currentInspection ? (
                <p className="mt-2 text-xs text-slate-600">{ownership.note}</p>
              ) : null}
              {currentInspection?.completedBy && currentInspection.step.displayStatus === "completed" ? (
                <p className="mt-1 text-xs font-medium text-slate-700">
                  Completed by {currentInspection.completedBy}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {currentInspection ? (
                <span className="hidden sm:inline-flex">
                  <StatusBadge tone={statusTone} label={statusLabel} className="shadow-sm" />
                </span>
              ) : null}
              <Dialog.Close
                className="inline-flex size-9 items-center justify-center rounded-full shadow-sm transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-secondary)]"
                style={{
                  backgroundColor: "var(--brand-secondary)",
                  color: "var(--step-modal-on-secondary)",
                }}
                aria-label="Close step details"
              >
                <X className="h-4 w-4" aria-hidden />
              </Dialog.Close>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#F8FAFC] px-5 py-4">
            {actionError && !pendingAction ? (
              <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {actionError}
              </div>
            ) : null}
            {notice ? (
              <div
                role="status"
                className={`rounded-xl border px-4 py-3 text-sm ${
                  notice.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                {notice.message}
              </div>
            ) : null}

            {loading ? (
              <div className="space-y-3" aria-busy>
                <div className="h-24 animate-pulse rounded-xl bg-slate-200/70" />
                <div className="h-32 animate-pulse rounded-xl bg-slate-200/70" />
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            ) : !inspection ? (
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                No submission details are available for this step.
              </p>
            ) : (
              <>
                <div className="sm:hidden">
                  <StatusBadge tone={statusTone} label={statusLabel} />
                </div>

                {showStageStatus && inspection.applicationId && hireStageName ? (
                  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-900">Application status</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Stage · <span className="font-semibold text-slate-900">{hireStageName}</span>
                    </p>
                  </section>
                ) : null}

                {workerId ? (
                  <StageContextNotesSection
                    key={inspection.step.id}
                    workerId={workerId}
                    applicationId={inspection.applicationId}
                    contextKind="workflow_step"
                    contextKey={inspection.step.id}
                    title="Notes"
                    subtitle={
                      hireLifecycle === "post_hire"
                        ? "Notes for this Post-Hire step only."
                        : `Notes for this step only${hireStageName ? ` (${hireStageName})` : ""}.`
                    }
                  />
                ) : null}

                {inspection.emptyState ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {inspection.emptyState}
                  </p>
                ) : null}

                {documentUploads ? (
                  <StepDocumentUploadsSection
                    uploads={documentUploads}
                    documents={inspection.documents}
                    candidateStep={candidateUploadStep}
                    canEdit={Boolean(workerId)}
                    uploadingKey={uploadingKey}
                    error={uploadError}
                    onUpload={(slot, file, dates) => void uploadStepDocument(slot, file, dates)}
                  />
                ) : null}

                {inspection.extraFiles ? <ExtraFilesSection files={inspection.extraFiles} /> : null}

                {interviews ? (
                  <Section title="Interviews" count={activeInterviewCount}>
                    {interviewsNewestFirst.length ? (
                      <ul className="space-y-3">
                        {interviewsNewestFirst.map((interview) => (
                          <InterviewCard
                            key={interview.id}
                            interview={interview}
                            total={activeInterviewCount}
                            latest={interview.id === latestInterviewId}
                          />
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-600">No interviews booked with this candidate yet.</p>
                    )}
                  </Section>
                ) : null}

                {inspection.checkResult ? (
                  <Section
                    title={inspection.checkResult.kind === "facility" ? "Facility approval" : "Compliance check"}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{inspection.checkResult.typeLabel}</p>
                      <StatusBadge
                        tone={inspection.checkResult.tone}
                        label={inspection.checkResult.statusLabel}
                      />
                    </div>
                    <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {inspection.checkResult.kind === "facility" ? (
                        <Meta label="Facility" value={inspection.checkResult.facilityName} />
                      ) : (
                        <>
                          <Meta label="Vendor" value={inspection.checkResult.vendorName} />
                          <Meta label="Reference" value={inspection.checkResult.externalRef} />
                        </>
                      )}
                      <Meta label="Result date" value={formatDateTime(inspection.checkResult.completedAt)} />
                      <Meta label="Recorded by" value={inspection.checkResult.completedByName} />
                    </dl>
                    {inspection.checkResult.resultSummary ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
                        {inspection.checkResult.resultSummary}
                      </p>
                    ) : null}
                  </Section>
                ) : null}

                {inspection.jobApplication ? (
                  <JobApplicationStepSection view={inspection.jobApplication} />
                ) : null}

                {inspection.offer ? <OfferAcceptanceSection offer={inspection.offer} /> : null}

                {inspection.enrollment ? (
                  <Section title="Candidate response">
                    <p className="text-sm font-medium text-slate-900">{inspection.enrollment.question}</p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      {inspection.enrollment.decision ? (
                        <StatusBadge
                          tone={inspection.enrollment.decision === "agreed" ? "success" : "warning"}
                          label={inspection.enrollment.decisionLabel ?? ""}
                        />
                      ) : (
                        <StatusBadge tone="neutral" label="Not answered yet" />
                      )}
                      {inspection.enrollment.answeredAt ? (
                        <p className="text-xs text-slate-500">
                          Answered {formatDateTime(inspection.enrollment.answeredAt)}
                        </p>
                      ) : null}
                    </div>
                  </Section>
                ) : null}

                {/* Timeline hidden from step details.
                <Section title="Timeline">
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Meta label="Assigned" value={formatDateTime(inspection.assignedAt)} />
                    <Meta label="Started" value={formatDateTime(inspection.startedAt)} />
                    <Meta label="Submitted" value={formatDateTime(inspection.submittedAt)} />
                    <Meta label="Completed" value={formatDateTime(inspection.completedAt)} />
                    <Meta
                      label="Approved or rejected"
                      value={formatDateTime(inspection.approvedOrRejectedAt)}
                    />
                  </dl>
                </Section>
                */}

                {staffReview && !staleCandidateVerification ? (
                  <Section
                    title={
                      variant === "interview"
                        ? "Interview outcome"
                        : candidateReview
                          ? "Recruiter verification"
                          : "Internal review"
                    }
                  >
                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <Meta
                        label="Decision"
                        value={
                          isDecisionVariant(variant) && staffReview.decision !== "reopen"
                            ? decisionLabel(variant, staffReview.decision)
                            : staffReview.decision === "complete"
                              ? candidateReview ? "Verified · Completed" : "Completed"
                              : staffReview.decision === "reject"
                                ? "Rejected"
                                : titleCase(staffReview.decision)
                        }
                      />
                      <Meta label="Reviewed by" value={staffReview.reviewedByName} />
                      <Meta label="Reviewed at" value={formatDateTime(staffReview.reviewedAt)} />
                    </dl>
                    {staffReview.note ? (
                      <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {staffReview.note}
                      </p>
                    ) : null}
                  </Section>
                ) : null}

                {inspection.notes && inspection.notes !== staffReview?.note ? (
                  <Section title="Notes or rejection reason">
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{inspection.notes}</p>
                  </Section>
                ) : null}

                {otherDocuments.length > 0 ? (
                  <Section title="Uploaded documents" count={otherDocuments.length}>
                    <ul className="space-y-3">
                      {otherDocuments.map((doc) => (
                        <li key={doc.id} className="rounded-lg border border-slate-200 px-3 py-2">
                          <p className="break-words text-sm font-medium text-slate-900">
                            {doc.documentName || doc.originalFileName || "Uploaded file"}
                          </p>
                          {doc.documentName && doc.originalFileName ? (
                            <p className="break-words text-xs text-slate-600">{doc.originalFileName}</p>
                          ) : null}
                          <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-600 sm:grid-cols-2">
                            <div>Type: {doc.documentType || "—"}</div>
                            <div>Size: {formatBytes(doc.fileSize)}</div>
                            <div>Uploaded: {formatDateTime(doc.uploadedAt)}</div>
                            <div>Uploaded by: {doc.uploadedBy || "—"}</div>
                            <div>Verification: {doc.verificationStatus || "—"}</div>
                            {inspection.reviewable ? (
                              <>
                                <div>Reviewed: {formatDateTime(doc.approvedOrRejectedAt)}</div>
                                {doc.reviewedBy ? <div>Reviewed by: {doc.reviewedBy}</div> : null}
                              </>
                            ) : null}
                          </dl>
                          {doc.reviewNotes ? (
                            <p className="mt-1 text-xs text-rose-700">{doc.reviewNotes}</p>
                          ) : null}
                          {doc.fileUnavailable ? (
                            <p className="mt-2 text-xs text-amber-800">File unavailable.</p>
                          ) : doc.previewUrl ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <a
                                href={doc.previewUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-primary)]"
                                style={{
                                  borderColor: "var(--brand-primary)",
                                  color: "var(--brand-primary)",
                                  backgroundColor: "color-mix(in srgb, var(--brand-primary) 6%, white)",
                                }}
                              >
                                <Eye className="h-3.5 w-3.5" aria-hidden />
                                Preview
                              </a>
                              <a
                                href={doc.downloadUrl ?? doc.previewUrl}
                                target="_blank"
                                rel="noreferrer"
                                download={doc.originalFileName ?? true}
                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:brightness-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-primary)]"
                                style={{
                                  background: "var(--step-modal-cta)",
                                  color: "var(--step-modal-on-primary)",
                                }}
                              >
                                <Download className="h-3.5 w-3.5" aria-hidden />
                                Download
                              </a>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </Section>
                ) : null}

                {screeningApplicationId ? (
                  <RecruiterScreeningAiSection
                    key={screeningApplicationId}
                    applicationId={screeningApplicationId}
                    isRejected={inspection.step.displayStatus === "rejected" || inspection.step.displayStatus === "blocked"}
                    reviewNote={staffReview?.note ?? null}
                  />
                ) : null}

                {formQuestions.length ? (
                  <Section title="Form responses" count={formQuestions.length}>
                    <ul className="space-y-3">
                      {formQuestions.map((question, index) => {
                        const isCheckbox =
                          question.fieldType === "checkbox" ||
                          /authoriz|consent|agreement|confirm/i.test(question.label);
                        const isAuthorized =
                          isCheckbox && /authoriz|yes|true|confirmed/i.test(String(question.answer ?? ""));
                        const fileUrl = isCheckbox ? null : responseFileUrl(question.answer);
                        return (
                          <li
                            key={`${question.label}-${index}`}
                            className="rounded-lg border border-slate-200 px-3.5 py-2.5 bg-white"
                          >
                            <p className="text-sm font-medium text-slate-900">{question.label}</p>
                            {isCheckbox ? (
                              <div className="mt-2 flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
                                    isAuthorized
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                      : "bg-slate-100 text-slate-700 border border-slate-200"
                                  }`}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                                  {formatAnswer(question.answer)}
                                </span>
                              </div>
                            ) : fileUrl ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition hover:brightness-95"
                                  style={{
                                    borderColor: "var(--brand-primary)",
                                    color: "var(--brand-primary)",
                                    backgroundColor: "color-mix(in srgb, var(--brand-primary) 6%, white)",
                                  }}
                                >
                                  <Eye className="h-3.5 w-3.5" aria-hidden />
                                  Preview
                                </a>
                                <a
                                  href={fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  download
                                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:brightness-[0.97]"
                                  style={{
                                    background: "var(--step-modal-cta)",
                                    color: "var(--step-modal-on-primary)",
                                  }}
                                >
                                  <Download className="h-3.5 w-3.5" aria-hidden />
                                  Download
                                </a>
                              </div>
                            ) : (
                              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
                                {formatAnswer(question.answer)}
                              </p>
                            )}
                            <p className="mt-2 text-[11px] text-slate-500">
                              {fileUrl ? "Document" : isCheckbox ? "Confirmation checkbox" : question.fieldType}
                              {question.submittedAt ? ` · ${formatDateTime(question.submittedAt)}` : ""}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </Section>
                ) : null}

                {inspection.assessment &&
                inspection.assessment.summary.answeredQuestions === 0 &&
                inspection.step.displayStatus === "not_started" ? (
                  <CenteredEmptyState
                    icon={ClipboardCheck}
                    title="Assessment not started"
                    message="The candidate hasn't started this skill assessment yet. Results will appear here once they begin answering."
                  />
                ) : inspection.assessment ? (
                  <Section
                    title="Skill assessment results"
                    count={inspection.assessment.summary.totalCategories}
                  >
                    <SkillAssessmentResults
                      startedAt={formatDateTime(inspection.assessment.startedAt)}
                      completedAt={formatDateTime(inspection.assessment.completedAt)}
                      summary={inspection.assessment.summary}
                      categories={inspection.assessment.categories}
                    />
                  </Section>
                ) : null}

                {inspection.references.length ? (
                  <Section title="References" count={inspection.references.length}>
                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {inspection.references.map((reference) => (
                        <li
                          key={reference.id}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        >
                          <p className="font-medium text-slate-900">{reference.name}</p>
                          <p className="text-slate-600">{reference.relationship || "—"}</p>
                          <p className="break-words text-slate-600">
                            {reference.email || "—"}
                            {reference.phone ? ` · ${reference.phone}` : ""}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Submitted {formatDateTime(reference.submittedAt)}
                          </p>
                          {reference.recruiterNotes ? (
                            <p className="mt-1 text-xs text-slate-700">{reference.recruiterNotes}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </Section>
                ) : null}

                {inspection.agreement ? (
                  <Section title="Signed Agreement & eSignature">
                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <Meta label="Agreement" value={inspection.agreement.documentName} />
                      <div className="min-w-0">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          Signature Status
                        </dt>
                        <dd className="mt-0.5">
                          <StatusBadge
                            tone={
                              inspection.agreement.isSigned ||
                              inspection.agreement.signatureStatus.toLowerCase().includes("signed") ||
                              inspection.agreement.signatureStatus.toLowerCase().includes("completed")
                                ? "success"
                                : "warning"
                            }
                            label={inspection.agreement.signatureStatus}
                          />
                        </dd>
                      </div>
                      <Meta label="Signer" value={inspection.agreement.signerIdentity} />
                      <Meta label="Sent" value={formatDateTime(inspection.agreement.sentAt)} />
                      {inspection.agreement.viewedAt ? (
                        <Meta label="Viewed" value={formatDateTime(inspection.agreement.viewedAt)} />
                      ) : null}
                      <Meta label="Signed" value={formatDateTime(inspection.agreement.signedAt)} />
                      {inspection.agreement.signingRequestId ? (
                        <Meta label="Signing Request ID" value={inspection.agreement.signingRequestId} />
                      ) : null}
                    </dl>

                    {resyncNotice ? (
                      <div
                        role="status"
                        className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${
                          resyncNotice.tone === "success"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                        }`}
                      >
                        {resyncNotice.message}
                      </div>
                    ) : null}

                    {/* Action buttons: Preview, Download, and Re-sync Recovery */}
                    <div className="mt-4 flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-100">
                      {inspection.agreement.completedDocumentUrl ? (
                        <a
                          href={inspection.agreement.completedDocumentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3.5 py-2 text-xs font-semibold shadow-sm transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                          style={{
                            borderColor: "var(--brand-primary)",
                            color: "var(--brand-primary)",
                            backgroundColor: "color-mix(in srgb, var(--brand-primary) 6%, white)",
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden />
                          Preview Signed Agreement
                        </a>
                      ) : null}

                      {inspection.agreement.downloadUrl || inspection.agreement.completedDocumentUrl ? (
                        <a
                          href={inspection.agreement.downloadUrl || inspection.agreement.completedDocumentUrl!}
                          target="_blank"
                          rel="noreferrer"
                          download={`${inspection.agreement.documentName || "Signed_Agreement"}.pdf`}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm transition hover:brightness-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                          style={{
                            background: "var(--step-modal-cta)",
                            color: "var(--step-modal-on-primary)",
                          }}
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden />
                          Download Signed Agreement
                        </a>
                      ) : null}

                      {inspection.agreement.canResync && workerId ? (
                        <button
                          type="button"
                          onClick={() => void handleResyncFirma()}
                          disabled={resyncing}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${resyncing ? "animate-spin text-slate-400" : "text-slate-500"}`}
                            aria-hidden
                          />
                          {resyncing ? "Re-syncing with Firma…" : "Re-sync signing status"}
                        </button>
                      ) : null}
                    </div>

                    {!inspection.agreement.isSigned && inspection.agreement.canResync ? (
                      <p className="mt-2 text-[11px] text-slate-500">
                        If the candidate has signed or document sync was delayed, click &quot;Re-sync signing status&quot; to check live status with the provider.
                      </p>
                    ) : null}
                  </Section>
                ) : null}

                {inspection.authorization && inspection.kind === "background_check" ? (
                  <Section title="Authorization">
                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Meta
                        label="Authorization status"
                        value={inspection.authorization.authorizationStatus}
                      />
                      <Meta
                        label="Consent timestamp"
                        value={formatDateTime(inspection.authorization.consentTimestamp)}
                      />
                      <Meta
                        label="Provider status"
                        value={inspection.authorization.providerSafeStatus}
                      />
                      <Meta label="Review status" value={inspection.authorization.reviewStatus} />
                    </dl>
                  </Section>
                ) : null}

                {inspection.finalReview ? (
                  <Section title="Final review">
                    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Meta
                        label="Submitted"
                        value={formatDateTime(inspection.finalReview.submittedAt)}
                      />
                      <Meta
                        label="Candidate confirmation"
                        value={inspection.finalReview.confirmation}
                      />
                      <Meta label="Reviewer" value={inspection.finalReview.reviewer} />
                      <Meta label="Decision" value={inspection.finalReview.decision} />
                    </dl>
                    {inspection.finalReview.missingRequirements.length ? (
                      <p className="mt-3 text-sm text-amber-800">
                        Missing at submission: {inspection.finalReview.missingRequirements.join(", ")}
                      </p>
                    ) : null}
                    {inspection.finalReview.stepsIncluded.length ? (
                      <p className="mt-2 text-xs text-slate-600">
                        Steps included: {inspection.finalReview.stepsIncluded.join(", ")}
                      </p>
                    ) : null}
                  </Section>
                ) : null}
              </>
            )}
          </div>

          {showFooter ? (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3">
              <p className="text-xs font-semibold text-slate-700">{stepSideLabel}</p>
              <div className="flex flex-wrap gap-2">
                {canEmailCandidate ? (
                  <button
                    type="button"
                    onClick={() => void sendCandidateEmail()}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition hover:brightness-[0.97] disabled:opacity-50"
                    style={{
                      background: "var(--step-modal-cta)",
                      color: "var(--step-modal-on-primary)",
                    }}
                  >
                    <Mail className="h-4 w-4" aria-hidden />
                    {submitting
                      ? "Sending…"
                      : authorizationAwaitingSignature || authorizationConfirmation
                        ? "Send email to candidate"
                        : isWelcomeEmailStep
                          ? "Send Welcome Email"
                          : "Send Email"}
                  </button>
                ) : null}
                {canSchedule ? (
                  <button
                    type="button"
                    onClick={onScheduleInterview}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50"
                    style={{
                      borderColor: "var(--brand-primary)",
                      color: "var(--brand-primary)",
                    }}
                  >
                    <CalendarDays className="h-4 w-4" aria-hidden />
                    {activeInterviewCount > 0 ? "Schedule Another Interview" : "Schedule Interview"}
                  </button>
                ) : null}
                {canVerifyCandidate || authorizationOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      const verify = Boolean(
                        canVerifyCandidate || inspection?.step.displayStatus === "submitted"
                      );
                      markCompleteNow({ onBehalf: !verify, verify });
                    }}
                    disabled={submitting}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition hover:brightness-[0.97] disabled:opacity-50"
                    style={{ background: "var(--step-modal-cta)", color: "var(--step-modal-on-primary)" }}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Mark as complete
                  </button>
                ) : agreementPendingReview ? (
                  <button
                    type="button"
                    disabled
                    title="Available after the candidate signs the agreement"
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm opacity-50"
                    style={{ background: "var(--step-modal-cta)", color: "var(--step-modal-on-primary)" }}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Mark as complete
                  </button>
                ) : null}
                {canCompleteForCandidate ? (
                  <button
                    type="button"
                    onClick={() => {
                      markCompleteNow({ onBehalf: true, verify: false });
                    }}
                    disabled={submitting || uploadingKey != null}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition hover:brightness-[0.97] disabled:opacity-50"
                    style={{ background: "var(--step-modal-cta)", color: "var(--step-modal-on-primary)" }}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Mark as complete
                  </button>
                ) : null}
                {(canAct ? staffAction?.actions ?? [] : [])
                  .filter((action) => !(authorizationEsign && action === "complete" && !inspection?.agreement?.isSigned))
                  .map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      if (action === "complete") {
                        markCompleteNow({ onBehalf: false, verify: false });
                        return;
                      }
                      setPendingAction(action);
                    }}
                    disabled={submitting}
                    style={
                      action === "complete"
                        ? {
                            background: "var(--step-modal-cta)",
                            color: "var(--step-modal-on-primary)",
                          }
                        : undefined
                    }
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                      action === "complete"
                        ? "shadow-sm hover:brightness-[0.97]"
                        : action === "reject"
                          ? "border border-red-300 text-red-700 hover:bg-red-50"
                          : action === "needs_review"
                            ? "border border-amber-300 text-amber-800 hover:bg-amber-50"
                            : "border border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {staffActionLabel(action, variant)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
      {/* Reject, Need to Review, and Reopen. Mark as complete skips this dialog. */}
      <WorkflowStepStaffActionModal
        action={pendingAction === "complete" ? null : pendingAction}
        variant={variant}
        optional={inspection ? !inspection.step.required : false}
        onBehalf={pendingOnBehalf}
        verifySubmission={pendingVerify}
        stepTitle={title}
        submitting={submitting}
        error={actionError}
        onCancel={() => {
          setPendingAction(null);
          setPendingOnBehalf(false);
          setPendingVerify(false);
          setActionError(null);
        }}
        onConfirm={(input) => void submitAction(input)}
      />
    </Dialog.Root>
  );
}
