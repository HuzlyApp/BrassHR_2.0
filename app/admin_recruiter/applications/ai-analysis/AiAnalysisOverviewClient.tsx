"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  IdCard,
  Loader2,
  Medal,
  Search,
  Tag,
  Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import BrandedFileTypeIcon from "@/app/admin_recruiter/components/BrandedFileTypeIcon";
import { ListTableCheckbox } from "@/app/admin_recruiter/components/ListTableCheckbox";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import {
  CANDIDATES_PAGE_TITLE_STYLE,
} from "@/app/admin_recruiter/candidates/candidates-typography";
import {
  candidateApplicantProfileHref,
  candidateDetailPreHireHref,
  candidateHireJourneyHref,
  candidateProfileHref,
} from "@/app/admin_recruiter/candidates/candidate-links";
import {
  CandidatesBreadcrumb,
  JobsBreadcrumb,
  jobCandidatesHrefForJob,
} from "@/app/admin_recruiter/jobs/JobsBreadcrumb";
import {
  formatMatchCategory,
  formatMatchModelLabel,
  formatMatchScore,
  formatRecommendedAction,
} from "@/lib/jobs/match-analysis/display";
import {
  VERIFIED_INFO_CATEGORIES,
  VERIFIED_INFO_CATEGORY_LABELS,
  countQualificationOutcomes,
  filterQualificationRequirements,
  isVerifiedInfoCategory,
  qualificationDisplayStatus,
  recruiterVerifiedNeedsNoteDecision,
  checklistStep2Items,
  type QualificationDisplayStatus,
  type QualificationFilter,
  type QualificationOutcomeCounts,
  type QualificationRequirement,
  type VerifiedInfoCategory,
} from "@/lib/jobs/match-analysis/workspace";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";
import { ResumeHistoryModal, type ResumeHistoryItem } from "../ResumeHistoryModal";
import { RemoveFromJobConfirmModal } from "../RemoveFromJobConfirmModal";
import { StageStatusSequenceButtons } from "@/app/admin_recruiter/components/StageStatusSequenceButtons";
import {
  isPreHireStatusStageName,
  type PreHireStatusStageName,
} from "@/lib/jobs/application-statuses/stage-assignments";
import { resolvePreHireStatusStageForActions } from "@/lib/jobs/application-statuses/resolve-pre-hire-stage";
import {
  currentPreHireStatusStageName,
  groupStepsIntoHireStages,
} from "@/lib/onboarding/hire-stage-groups";
import type { CandidateWorkflowPhaseView } from "@/lib/onboarding/candidate-workflow-phase-view";
import CandidateCommunicationDialog from "@/app/admin_recruiter/components/CandidateCommunicationDialog";
import {
  DeepMatchConfirmDialog,
  FollowUpConfirmDialog,
  MatchAnalyzeButton,
} from "../MatchAnalyzeButton";
import {
  MatchAnalysisModelSelect,
  useMatchAnalysisProvider,
} from "../MatchAnalysisModelSelect";
import { downloadMatchAnalysisAssessment } from "./download-match-analysis-assessment";
import {
  RequirementNotesIndicator,
  RequirementVerificationNotesPanel,
  pendingVerificationNotePrefill,
  recruiterVerifiedNotePrefill,
} from "./RequirementVerificationNotes";
import { useMatchAnalysisWorkspace } from "./use-match-analysis-workspace";
import type { VerificationNote } from "@/lib/jobs/match-analysis/verification-notes";
import type { AnalysisMode } from "@/lib/jobs/match-analysis/schema";
import { deepMatchSubmitBanner, isDeepMatchStage, publicMatchScore } from "@/lib/jobs/match-analysis/match-stage";
import {
  DEEP_MATCH_BLOCKED_NOT_READY,
  DEEP_MATCH_BLOCKED_TALENT_POOL,
  FLOW_DIAMOND_COPY,
  MATCH_PROGRESSION_STEPS,
  canAdvanceMatchProgression,
  canRunDeepMatch,
  canSelectMatchProgressionStep,
  fitBandFromDeepMatchResult,
  fitBandLabel,
  fitBandTagClassName,
  listingDisplayFitBand,
  matchProgressionInitialIndex,
  matchProgressionFollowUpNeedsConfirm,
  matchProgressionStepRequiresDeepConfirm,
  type QuickMatchFitBand,
} from "@/lib/jobs/match-analysis/progression";
import { fitBandFromQuickRoute, quickRouteFromAnalysis } from "@/lib/jobs/match-analysis/quick-route";
import { isSubmissionResumeFileName } from "@/lib/jobs/match-analysis/submission-resume";
import { adminWorkerResumePreviewHref } from "@/lib/resume/worker-resume-file-name";
import { MatchProgressionStepper } from "./MatchProgressionStepper";
import { deepMatchModelForProvider } from "@/lib/jobs/match-analysis/step-config";

const CARD =
  "rounded-[12px] border border-[#E5E7EB] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]";
/** Clears sticky admin header when scrolling step anchors into view. */
const STEP_SCROLL_MARGIN_CLASS =
  "scroll-mt-[calc(var(--admin-recruiter-header-height,67px)+1rem)]";

function scrollAiAnalysisBelowHeader(elementId = "ai-analysis-overview-top") {
  const el = document.getElementById(elementId);
  if (!el) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--admin-recruiter-header-height")
    .trim();
  const headerPx = Number.parseFloat(raw) || 67;
  const y = el.getBoundingClientRect().top + window.scrollY - headerPx - 16;
  window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
}
const FIELD =
  "h-11 w-full rounded-lg border border-[#D0D5DD] bg-white px-3 text-sm text-[#101828] outline-none transition placeholder:text-[#98A2B3] focus:border-[color:var(--brand-primary)]";
const SELECT_FIELD =
  `${FIELD} appearance-none cursor-pointer bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat pr-10`;
const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2398A2B3' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";
const AREA =
  "w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2.5 text-sm text-[#101828] outline-none transition placeholder:text-[#98A2B3] focus:border-[color:var(--brand-primary)]";
const PRIMARY_BTN =
  "inline-flex items-center justify-center rounded-lg bg-[color:var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60";
const OUTLINE_BTN =
  "inline-flex items-center justify-center rounded-lg border-2 border-[color:var(--brand-secondary)] bg-white px-4 py-2.5 text-sm font-semibold text-[color:var(--brand-secondary)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-secondary)_6%,white)]";
const HEADER_OUTLINE_BTN =
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg border border-[color:var(--brand-secondary)] bg-white px-3 text-xs font-semibold leading-4 text-[color:var(--brand-secondary)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-secondary)_6%,white)] disabled:cursor-not-allowed disabled:opacity-60";
const HEADER_TOOLBAR =
  "flex min-w-0 flex-wrap items-center gap-2";
const SIDEBAR_TITLE_CLASS = "text-base font-semibold";
const SECTION_HEADER_DIVIDER = "border-b border-[#E5E7EB] pb-4";

function SidebarTitle({ children }: { children: ReactNode }) {
  const branding = useTenantBranding();

  return (
    <h2 className={SIDEBAR_TITLE_CLASS} style={{ color: branding.secondaryHex }}>
      {children}
    </h2>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  const branding = useTenantBranding();

  return (
    <h2 className="text-lg font-semibold" style={{ color: branding.secondaryHex }}>
      {children}
    </h2>
  );
}

function SectionHeaderBlock({ children }: { children: ReactNode }) {
  return <div className={SECTION_HEADER_DIVIDER}>{children}</div>;
}

function SidebarSectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <SectionHeaderBlock>
      <SidebarTitle>{title}</SidebarTitle>
      {subtitle ? <p className="mt-1 text-sm text-[#667085]">{subtitle}</p> : null}
    </SectionHeaderBlock>
  );
}
const FILTERS = [
  "All",
  "Mandatory",
  "Preferred",
  "Confirmed",
  "Needs Verification",
  "Not Met",
  "Blocking",
] as const;

type FilterId = (typeof FILTERS)[number];

type AiAnalysisOverviewClientProps = {
  applicationId: string;
  backHref: string;
  jobId?: string;
  /** Hide breadcrumb when rendered inside candidate detail tabs. */
  embedded?: boolean;
};

function candidateProfileHrefForAnalysisContext(
  workerId: string,
  backHref: string,
  jobId?: string
): string {
  if (backHref.includes("/admin_recruiter/new/profile")) {
    return candidateProfileHref(workerId);
  }
  return candidateApplicantProfileHref(workerId, {
    from: backHref.includes("/admin_recruiter/candidates") ? "candidates" : "applications",
    jobId: jobId || undefined,
  });
}

function copyText(value: string, success: string) {
  void navigator.clipboard.writeText(value);
  toast.success(success);
}

function fitBandRingColors(band: QuickMatchFitBand | null | undefined): {
  track: string;
  stroke: string;
} {
  if (band === "low") return { track: "#FEE2E2", stroke: "#DC2626" };
  if (band === "strong") return { track: "#DCFCE7", stroke: "#00B135" };
  if (band === "review") return { track: "#FEF9C3", stroke: "#CA8A04" };
  return { track: "#E5E7EB", stroke: "#E5E7EB" };
}

function MatchRing({
  percent,
  label,
  strokeColor,
  fitBand = null,
}: {
  percent: number | null;
  label: string;
  strokeColor: string;
  fitBand?: QuickMatchFitBand | null;
}) {
  const outer = 139;
  const size = 121;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Steps 1–3: label-only ring colored by fit band (no %). Step 4+: fill to match %.
  const labelOnly = percent == null;
  const bandColors = fitBandRingColors(fitBand);
  const fill = labelOnly ? (fitBand ? 100 : 0) : Math.min(100, Math.max(0, percent ?? 0));
  const offset = circumference - (fill / 100) * circumference;
  const trackColor = labelOnly ? bandColors.track : "#E5E7EB";
  const progressColor = labelOnly ? bandColors.stroke : strokeColor;

  return (
    <div className="relative shrink-0" style={{ width: outer, height: outer }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={progressColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center px-3">
        {labelOnly ? (
          <span className="max-w-[6.5rem] text-center text-[18px] font-semibold leading-6 text-black sm:text-[20px] sm:leading-7">
            {label}
          </span>
        ) : (
          <div className="flex w-[79px] flex-col items-center text-center">
            <span className="h-9 text-[30px] font-semibold leading-9 text-black">{`${percent}%`}</span>
            <span className="text-xs font-normal leading-4 text-black/50">{label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const FILTER_TO_QUAL: Record<FilterId, QualificationFilter> = {
  All: "all",
  Mandatory: "mandatory",
  Preferred: "preferred",
  Confirmed: "confirmed",
  "Needs Verification": "needs_verification",
  "Not Met": "not_met",
  Blocking: "blocking",
};

function AlignedIconListItem({
  iconSrc,
  children,
}: {
  iconSrc: string;
  children: string;
}) {
  return (
    <li className="flex items-start gap-3 text-sm text-[#344054]">
      <span className="inline-flex h-6 w-[18px] shrink-0 items-center justify-center">
        <img src={iconSrc} alt="" className="block h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 leading-6">{children}</span>
    </li>
  );
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", { timeZone: "America/New_York", 
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatHistoryWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", { timeZone: "America/New_York", 
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function historyScoreBadgeClass(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(Number(score))) return "bg-[#F2F4F7] text-[#475467]";
  const n = Number(score);
  if (n >= 75) return "bg-[#00B135] text-white";
  if (n >= 50) return "bg-[#2563EB] text-white";
  if (n >= 25) return "bg-[#CA8A04] text-white";
  return "bg-[#DC2626] text-white";
}

function historyStatusFromItem(item: {
  score: number | null;
  category: string | null;
  display_category: string | null;
  analysis?: unknown;
}): { label: string; band: QuickMatchFitBand | null } {
  const route = quickRouteFromAnalysis(item.analysis);
  if (route) {
    const band = fitBandFromQuickRoute(route);
    const fromAnalysis =
      item.analysis &&
      typeof item.analysis === "object" &&
      "candidate_match" in item.analysis &&
      item.analysis.candidate_match &&
      typeof item.analysis.candidate_match === "object" &&
      "display_category" in item.analysis.candidate_match &&
      typeof (item.analysis.candidate_match as { display_category?: unknown }).display_category ===
        "string"
        ? String(
            (item.analysis.candidate_match as { display_category: string }).display_category
          ).trim()
        : "";
    const label =
      item.display_category?.trim() ||
      fromAnalysis ||
      (route === "STRONG" ? "Strong" : route === "LOW_MATCH" ? "Low match" : "Review");
    return { label, band };
  }

  const display = item.display_category?.trim();
  if (display) {
    const lower = display.toLowerCase();
    const band: QuickMatchFitBand | null = lower.includes("low")
      ? "low"
      : lower.includes("strong") || lower.includes("good")
        ? "strong"
        : lower.includes("review")
          ? "review"
          : null;
    return { label: display, band };
  }

  const categoryLabel = formatMatchCategory(item.category);
  if (categoryLabel) return { label: categoryLabel, band: null };
  return { label: "Not analyzed", band: null };
}

function AnalysisHistoryItem({
  item,
}: {
  item: {
    id: string;
    version: number;
    score: number | null;
    category: string | null;
    display_category: string | null;
    model: string | null;
    analyzed_at: string;
    analysis?: unknown;
  };
}) {
  const { label, band } = historyStatusFromItem(item);
  const hasScore = item.score != null && Number.isFinite(Number(item.score));

  return (
    <li className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-[#475467]">Version {item.version}</span>
          {hasScore ? (
            <span
              className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${historyScoreBadgeClass(item.score)}`}
            >
              {formatMatchScore(item.score)}
            </span>
          ) : null}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
              band ? fitBandTagClassName(band) : "bg-[#F2F4F7] text-[#475467]"
            }`}
          >
            {label}
          </span>
        </div>
        <p className="text-xs leading-4 text-[#94A3B8]">
          {[formatHistoryWhen(item.analyzed_at), item.model].filter(Boolean).join(" · ")}
        </p>
      </div>
    </li>
  );
}

function verifiedCategoryLabel(category: string): string {
  if (isVerifiedInfoCategory(category)) return VERIFIED_INFO_CATEGORY_LABELS[category];
  return category.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function verifiedCategoryBadgeClass(category: string): string {
  const normalized = category.trim().toLowerCase();
  if (normalized === "license") return "bg-[#DBEAFE] text-[#1D4ED8]";
  if (normalized === "certification") return "bg-[#DCFCE7] text-[#166534]";
  if (normalized === "availability") return "bg-[#F3E8FF] text-[#7E22CE]";
  if (normalized === "note") return "bg-[#F2F4F7] text-[#475467]";
  return "bg-[#FFEDD5] text-[#9A3412]";
}

function VerifiedCategoryIcon({ category }: { category: string }) {
  const normalized = category.trim().toLowerCase();
  const className = "h-[18px] w-[18px] text-[color:var(--brand-primary)]";

  if (normalized === "license") return <IdCard className={className} aria-hidden />;
  if (normalized === "certification") return <Medal className={className} aria-hidden />;
  if (normalized === "availability") return <CalendarClock className={className} aria-hidden />;
  if (normalized === "note") return <FileText className={className} aria-hidden />;
  return <Tag className={className} aria-hidden />;
}

function VerifiedInformationItem({
  item,
}: {
  item: {
    id: string;
    category: string;
    title: string;
    details: string | null;
    verifiedAt: string;
    verifiedByName: string;
  };
}) {
  return (
    <li className="overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex">
        <div className="w-1 shrink-0 bg-[color:var(--brand-primary)]" aria-hidden />
        <div className="min-w-0 flex-1 px-3.5 py-3">
          <div className="flex items-start gap-3">
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: "color-mix(in srgb, var(--brand-primary) 12%, white)",
              }}
            >
              <VerifiedCategoryIcon category={item.category} />
            </span>
            <div className="min-w-0 flex-1">
              <span
                className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${verifiedCategoryBadgeClass(item.category)}`}
              >
                {verifiedCategoryLabel(item.category)}
              </span>
              <p className="mt-2 text-sm font-semibold leading-5 text-[#101828]">{item.title}</p>
              {item.details ? (
                <p className="mt-1.5 text-sm leading-6 text-[#475467]">{item.details}</p>
              ) : null}
              <p className="mt-2 text-xs text-[#94A3B8]">
                Verified by {item.verifiedByName}
                {item.verifiedAt ? ` · ${formatWhen(item.verifiedAt)}` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

function resolveAnalyzedResumeId(
  resumes: Array<{ id: string; uploadedAt?: string }>,
  analyzedAt: string | null | undefined,
  isAnalyzed: boolean
): string | null {
  if (!isAnalyzed || !analyzedAt?.trim() || resumes.length === 0) return null;
  const analyzedTime = new Date(analyzedAt).getTime();
  if (Number.isNaN(analyzedTime)) return null;

  const eligible = resumes.filter((resume) => {
    if (!resume.uploadedAt) return false;
    const uploadedTime = new Date(resume.uploadedAt).getTime();
    return !Number.isNaN(uploadedTime) && uploadedTime <= analyzedTime;
  });

  if (eligible.length === 0) return null;
  return eligible[eligible.length - 1]?.id ?? null;
}

function formatRequirementType(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized === "mandatory") return "Mandatory";
  if (normalized === "preferred") return "Preferred";
  return type;
}

const CHECKLIST_BADGE =
  "inline-flex items-center justify-center rounded-md px-2.5 py-1 text-center text-xs font-semibold text-white";

function typeBadgeClass(type: string) {
  return formatRequirementType(type) === "Mandatory" ? "bg-[#00B135]" : "bg-[#0284C7]";
}

function statusBadgeClass(status: QualificationDisplayStatus) {
  if (status === "Confirmed") return "bg-[#2563EB]";
  if (status === "Blocking") return "bg-[#DC2626]";
  if (status === "Not Met") return "bg-[#EA580C]";
  return "bg-[#CA8A04]";
}

const OUTCOME_STAT_CARDS = [
  {
    filter: "Confirmed" as const,
    label: "CONFIDENCE",
    title: "Confirmed requirements",
    valueClass: "text-[#16A34A]",
    countKey: "confirmed" as const,
  },
  {
    filter: "Needs Verification" as const,
    label: "VERIFY",
    title: "Requirements to verify",
    valueClass: "text-[#EA580C]",
    countKey: "verify" as const,
  },
  {
    filter: "Not Met" as const,
    label: "NOT MET",
    title: "Requirements not met",
    valueClass: "text-[#DC2626]",
    countKey: "notMet" as const,
  },
];

function filterCount(
  item: FilterId,
  counts: QualificationOutcomeCounts
): number {
  switch (item) {
    case "All":
      return counts.total;
    case "Mandatory":
      return counts.mandatory;
    case "Preferred":
      return counts.preferred;
    case "Confirmed":
      return counts.confirmed;
    case "Needs Verification":
      return counts.verify;
    case "Not Met":
      return counts.notMet;
    case "Blocking":
      return counts.blocking;
  }
}

function ringStrokeColor(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(Number(score))) return "#E5E7EB";
  const n = Number(score);
  if (n >= 75) return "#00B546";
  if (n >= 50) return "#3B82F6";
  if (n >= 25) return "#F59E0B";
  return "#EF4444";
}

export function AiAnalysisOverviewClient({
  applicationId,
  backHref,
  jobId,
  embedded = false,
}: AiAnalysisOverviewClientProps) {
  const router = useRouter();
  const branding = useTenantBranding();
  const brandStyle = brandingToCssVars(branding) as CSSProperties;
  const [workspaceReloadToken, setWorkspaceReloadToken] = useState(0);
  const [analysisProvider, setAnalysisProvider] = useMatchAnalysisProvider();
  const workspace = useMatchAnalysisWorkspace(applicationId, workspaceReloadToken);
  const {
    loading,
    analyzing,
    data,
    workerId,
    analysis,
    blocking,
    isAnalyzed,
    verifyingId,
    toggleVerified,
    createVerificationNote,
    updateVerificationNote,
    deleteVerificationNote,
    markNoteSentToCandidate,
    savingVerificationNote,
    busyVerificationNoteId,
    recommendedAnswers,
    updateRecommendedAnswer,
    callContext,
    updateCallContext,
    savingAnswers,
    decision,
    decisionNote,
    savingDecision,
    verifiedTitle,
    setVerifiedTitle,
    verifiedDetails,
    setVerifiedDetails,
    verifiedCategory,
    setVerifiedCategory,
    savingVerified,
    info,
    extractedDraft,
    setExtractedDraft,
    savingText,
    resumes,
    viewResume,
    downloadSubmissionDocx,
    improvementSummary,
    runAnalyze,
    saveScreeningAnswers,
    uploadScreeningReply,
    uploadingScreening,
    advanceMatchProgress,
    draftSubmissionResume,
    draftingSubmissionResume,
    sendToTalentPool,
    addVerified,
    saveExtractedText,
  } = workspace;

  const [filter, setFilter] = useState<FilterId>("All");
  const [query, setQuery] = useState("");
  const [openReqId, setOpenReqId] = useState("");
  const [noteCreateSignal, setNoteCreateSignal] = useState<{
    id: string;
    n: number;
    prefill: "verified" | "pending";
  } | null>(null);
  const [dataQualityOpen, setDataQualityOpen] = useState(true);

  /* ── Resume History Modal state ── */
  const [resumeHistoryOpen, setResumeHistoryOpen] = useState(false);
  const [resumeHistoryItems, setResumeHistoryItems] = useState<ResumeHistoryItem[]>([]);
  const [resumeHistoryLoading, setResumeHistoryLoading] = useState(false);
  const [resumeHistoryError, setResumeHistoryError] = useState<string | null>(null);
  const [resumeHistoryBusyId, setResumeHistoryBusyId] = useState<string | null>(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [removingFromJob, setRemovingFromJob] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [downloadingAssessment, setDownloadingAssessment] = useState(false);
  const [commOpen, setCommOpen] = useState(false);
  const [askCandidateNote, setAskCandidateNote] = useState<VerificationNote | null>(null);
  const [statusName, setStatusName] = useState("");
  const [statusSystemKey, setStatusSystemKey] = useState<string | null>(null);
  const [statusRevision, setStatusRevision] = useState(0);
  const [preHireStageName, setPreHireStageName] = useState<PreHireStatusStageName>("Intake");
  const [viewedStep, setViewedStep] = useState(0);
  const [userPickedStep, setUserPickedStep] = useState(false);
  const [confirmDeepOpen, setConfirmDeepOpen] = useState(false);
  const [confirmFollowUpOpen, setConfirmFollowUpOpen] = useState(false);
  const [followUpAdvancing, setFollowUpAdvancing] = useState(false);
  const pendingProgressionScrollRef = useRef<string | null>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const screeningUploadRef = useRef<HTMLInputElement>(null);

  const loadResumeHistory = useCallback(async () => {
    setResumeHistoryLoading(true);
    setResumeHistoryError(null);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/resume-history`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as {
        error?: string;
        resumes?: ResumeHistoryItem[];
      };
      if (!response.ok) throw new Error(payload.error || "Could not load resume history.");
      setResumeHistoryItems(payload.resumes ?? []);
    } catch (err) {
      setResumeHistoryError(err instanceof Error ? err.message : "Could not load resume history.");
      setResumeHistoryItems([]);
    } finally {
      setResumeHistoryLoading(false);
    }
  }, [applicationId]);

  function openResumeHistory() {
    setResumeHistoryOpen(true);
    void loadResumeHistory();
  }

  async function viewResumeFromHistory(resumeId: string) {
    if (!workerId) {
      toast.error("Could not open resume.");
      return;
    }
    window.open(
      adminWorkerResumePreviewHref({
        workerId,
        resumeId,
        applicationId,
      }),
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function parseResumeFromHistory(resumeId: string) {
    setResumeHistoryBusyId(resumeId);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/resumes/${encodeURIComponent(resumeId)}/parse`,
        { method: "POST" }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string; resumes?: ResumeHistoryItem[] };
      if (!response.ok) throw new Error(payload.error || "Could not parse resume.");
      if (payload.resumes) setResumeHistoryItems(payload.resumes);
      else await loadResumeHistory();
      toast.success("Resume parsed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not parse resume.");
    } finally {
      setResumeHistoryBusyId(null);
    }
  }

  async function deleteResumeFromHistory(resumeId: string, fileName: string) {
    if (!window.confirm(`Delete ${fileName}? This cannot be undone.`)) return;
    setResumeHistoryBusyId(resumeId);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/resumes/${encodeURIComponent(resumeId)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json().catch(() => ({}))) as { resumes?: ResumeHistoryItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not delete resume.");
      setResumeHistoryItems(payload.resumes ?? []);
      setWorkspaceReloadToken((t) => t + 1);
      toast.success("Resume deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete resume.");
    } finally {
      setResumeHistoryBusyId(null);
    }
  }

  function beginReuploadResume() {
    resumeInputRef.current?.click();
  }

  async function handleResumeFileSelected(file: File | undefined) {
    if (!file) return;
    setResumeUploading(true);
    try {
      const formData = new FormData();
      formData.append("resume", file);
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/resume`,
        { method: "POST", body: formData }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        autoQuickMatch?: {
          status?: string;
          error?: string | null;
        } | null;
      };
      if (!response.ok) throw new Error(payload.error || "Could not upload resume.");
      await loadResumeHistory();
      setWorkspaceReloadToken((t) => t + 1);
      toast.success("Resume uploaded.");
      const match = payload.autoQuickMatch;
      if (match?.status === "ANALYZED") {
        toast.success("Quick Match complete.");
      } else if (match && match.status !== "ANALYZED") {
        toast.error(
          match.error?.trim() ||
            "Quick Match did not finish — use Re-run Quick Match to try again."
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload resume.");
    } finally {
      setResumeUploading(false);
      if (resumeInputRef.current) resumeInputRef.current.value = "";
    }
  }

  function openRemoveFromJobConfirm() {
    setRemoveError(null);
    setRemoveConfirmOpen(true);
  }

  async function handleRunAnalyze(mode: AnalysisMode = "analyze") {
    const ok = await runAnalyze(mode, analysisProvider);
    if (!ok) return false;
    setOpenReqId("");
    router.refresh();
    return true;
  }

  async function confirmRemoveFromJob() {
    setRemovingFromJob(true);
    setRemoveError(null);
    try {
      const response = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/remove`,
        { method: "DELETE", credentials: "include", cache: "no-store" }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Failed to remove from job");
      setRemoveConfirmOpen(false);
      toast.success("Candidate removed from this job");
      window.location.assign(backHref);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove from job";
      setRemoveError(message);
      toast.error(message);
      setRemovingFromJob(false);
    }
  }

  const app = data?.application;
  const hasDeepMatch = isDeepMatchStage(app?.ai_match_stage);
  const outcomeCounts = useMemo(
    () => countQualificationOutcomes(data?.requirements ?? [], blocking),
    [data?.requirements, blocking]
  );
  const checklistItems = useMemo(
    () => checklistStep2Items(data?.requirements ?? [], blocking),
    [data?.requirements, blocking]
  );
  const matchScore = publicMatchScore(app?.ai_match_stage, app?.ai_match_score);
  const storedRoute = analysis?.quick_match?.quick_route ?? null;
  const parkedInTalentPool =
    app?.recruiter_decision === "do_not_pursue" ||
    (statusSystemKey ?? app?.status_system_key) === "rejected";
  // Same Fit as the job candidates list and Analysis history: the stored Quick Match
  // route before Deep Match, checklist band only when no route was stored.
  const displayedFitBand: QuickMatchFitBand =
    listingDisplayFitBand({
      analyzed: isAnalyzed,
      stage: app?.ai_match_stage ?? data?.matchProgression?.stage ?? null,
      category: hasDeepMatch ? app?.ai_match_category : null,
      displayCategory: hasDeepMatch ? app?.ai_match_display_category : null,
      score: hasDeepMatch ? matchScore : null,
      counts: {
        confirmed: outcomeCounts.confirmed,
        verify: outcomeCounts.verify,
        notMet: outcomeCounts.notMet,
        mandatory: outcomeCounts.mandatory,
        mandatoryConfirmed: outcomeCounts.mandatoryConfirmed,
        blocking: outcomeCounts.blocking,
        quickRoute: storedRoute,
      },
    }) ??
    (storedRoute ? fitBandFromQuickRoute(storedRoute) : "review");
  const fitBand = displayedFitBand;
  // Steps 1–3: show Low / Review / Strong. Step 4+ (Deep Match): show actual match %.
  const matchLabel = hasDeepMatch
    ? app?.ai_match_display_category || formatMatchCategory(app?.ai_match_category) || "Match"
    : isAnalyzed
      ? fitBandLabel(displayedFitBand)
      : "Not analyzed";
  // After Deep Match, badge follows scored result (e.g. Weak Match → Low), not Quick Match Strong.
  const statusFitBand = hasDeepMatch
    ? fitBandFromDeepMatchResult({
        category: app?.ai_match_category,
        displayCategory: app?.ai_match_display_category || matchLabel,
        score: matchScore,
      })
    : displayedFitBand;
  const candidateName = `${info.firstName} ${info.lastName}`.trim() || "Candidate";
  const jobTitle =
    data?.job?.title?.trim() ||
    analysis?.job?.job_title?.trim() ||
    "";
  const jobDetailsId = data?.job?.id?.trim() || jobId?.trim() || "";
  const jobDetailsHref = jobDetailsId
    ? `/admin_recruiter/jobs/${encodeURIComponent(jobDetailsId)}`
    : "";
  const confidencePercent =
    hasDeepMatch && analysis?.candidate_match?.confidence_score != null
      ? Math.round(Number(analysis.candidate_match.confidence_score))
      : null;
  const recommendation = hasDeepMatch ? formatRecommendedAction(app?.ai_match_action) : "";
  const summary = hasDeepMatch ? analysis?.candidate_match?.recruiter_decision_summary ?? "" : "";
  const submitBanner = hasDeepMatch
    ? deepMatchSubmitBanner({
        action: app?.ai_match_action,
        readiness: analysis?.submission_readiness?.readiness_status,
      })
    : null;
  const strengths = checklistItems.strengths;
  const verificationNeeded = checklistItems.verifications;
  const recommendedQuestions = data?.recommendedQuestions ?? [];
  const followUpQuestions = data?.followUpQuestions ?? [];
  const deepQuestions = data?.deepQuestions ?? [];
  const screeningUploads = data?.screeningUploads ?? [];
  const resumeCompleteness = hasDeepMatch
    ? analysis?.data_quality?.resume_completeness ?? "—"
    : "—";
  const jobCompleteness = hasDeepMatch
    ? analysis?.data_quality?.job_description_completeness ?? "—"
    : "—";
  const canAdvance = canAdvanceMatchProgression({
    isAnalyzed,
    fitBand,
    parkedInTalentPool,
  });
  const progressionState = useMemo(
    () => ({
      isAnalyzed,
      stage: app?.ai_match_stage ?? data?.matchProgression?.stage ?? null,
      hasDeepMatch,
      parkedInTalentPool,
      fitBand,
    }),
    [isAnalyzed, app?.ai_match_stage, data?.matchProgression?.stage, hasDeepMatch, parkedInTalentPool, fitBand]
  );
  const unlockedIndex = matchProgressionInitialIndex(progressionState);
  const derivedProgressionIndex = unlockedIndex;
  const latestSubmissionResume = useMemo(() => {
    const packs = resumes.filter((row) => isSubmissionResumeFileName(row.fileName));
    return packs[packs.length - 1] ?? null;
  }, [resumes]);
  const latestSubmissionDocx = useMemo(() => {
    const packs = resumes.filter((row) => /_submission_resume\.docx$/i.test(row.fileName));
    return packs[packs.length - 1] ?? null;
  }, [resumes]);
  const latestSubmissionPdf = useMemo(() => {
    const packs = resumes.filter((row) => /_submission_resume\.pdf$/i.test(row.fileName));
    return packs[packs.length - 1] ?? null;
  }, [resumes]);
  const latestOriginalResume = useMemo(() => {
    const originals = resumes.filter((row) => !isSubmissionResumeFileName(row.fileName));
    return originals[originals.length - 1] ?? null;
  }, [resumes]);
  const hasSubmissionResume = Boolean(latestSubmissionDocx || latestSubmissionPdf || latestSubmissionResume);
  const originalPreviewHref =
    workerId && latestOriginalResume
      ? adminWorkerResumePreviewHref({
          workerId,
          resumeId: latestOriginalResume.id,
          applicationId,
        })
      : null;
  const optimizedPreviewHref =
    workerId && (latestSubmissionPdf || latestSubmissionResume)
      ? adminWorkerResumePreviewHref({
          workerId,
          resumeId: (latestSubmissionPdf || latestSubmissionResume)!.id,
          applicationId,
        })
      : null;
  const canRunPaidDeep = canRunDeepMatch({
    isAnalyzed,
    unlockedIndex,
    parkedInTalentPool,
  });
  const progressionStep = MATCH_PROGRESSION_STEPS[viewedStep] ?? null;
  const progressionHint = progressionStep?.hint ?? "";
  const progressionHintBody = progressionHint.replace(/^Step\s+\d+\s*·\s*[^.]*\.\s*/i, "").trim();
  // Only used by the commented-out checklist counts under the progression hint.
  // const preferredConfirmed = useMemo(() => {
  //   return (data?.requirements ?? []).filter((row) => {
  //     const type = String(row.requirement_type ?? "").toUpperCase();
  //     return type === "PREFERRED" && qualificationDisplayStatus(row, blocking) === "Confirmed";
  //   }).length;
  // }, [data?.requirements, blocking]);

  useEffect(() => {
    if (!userPickedStep) setViewedStep(derivedProgressionIndex);
  }, [derivedProgressionIndex, userPickedStep]);

  useEffect(() => {
    if (!pendingProgressionScrollRef.current) return;
    pendingProgressionScrollRef.current = null;
    // Keep stepper + overview fully visible under the sticky admin header.
    scrollAiAnalysisBelowHeader("ai-analysis-overview-top");
  }, [viewedStep]);

  function requestDeepMatchConfirm() {
    if (!canRunPaidDeep) {
      toast.error(
        parkedInTalentPool ? DEEP_MATCH_BLOCKED_TALENT_POOL : DEEP_MATCH_BLOCKED_NOT_READY
      );
      return;
    }
    setConfirmDeepOpen(true);
  }

  async function confirmAndRunDeepMatch() {
    setConfirmDeepOpen(false);
    const ok = await handleRunAnalyze("deep");
    if (!ok) return;
    setUserPickedStep(true);
    pendingProgressionScrollRef.current = "top";
    setViewedStep(3);
  }

  function selectProgressionStep(index: number) {
    if (!canSelectMatchProgressionStep({ index, unlockedIndex, canAdvance })) return;
    if (matchProgressionStepRequiresDeepConfirm({ index, unlockedIndex })) {
      requestDeepMatchConfirm();
      return;
    }
    if (index === 1 && unlockedIndex < 1) {
      void moveToVerifications();
      return;
    }
    if (index === 2 && unlockedIndex < 2) {
      void moveToFollowUp();
      return;
    }
    setUserPickedStep(true);
    pendingProgressionScrollRef.current = "top";
    setViewedStep(index);
  }

  async function runVerificationsAnalysis() {
    if (!canAdvance) {
      toast.error("This candidate is not qualified to continue. Use Talent Pool.");
      return;
    }
    const ok = await handleRunAnalyze("call_pack");
    if (!ok) return;
    setUserPickedStep(true);
    pendingProgressionScrollRef.current = "top";
    setViewedStep(1);
  }

  function moveToVerifications() {
    if (!canAdvance) {
      toast.error("This candidate is not qualified to continue. Use Talent Pool.");
      return;
    }
    void runVerificationsAnalysis();
  }

  async function advanceToFollowUp() {
    if (!canAdvance) {
      toast.error("This candidate is not qualified to continue. Use Talent Pool.");
      return;
    }
    if (followUpAdvancing) return;
    setFollowUpAdvancing(true);
    try {
      const saved = await saveScreeningAnswers({ silent: true });
      if (!saved) return;
      await advanceMatchProgress("follow_up");
      setConfirmFollowUpOpen(false);
      setUserPickedStep(true);
      pendingProgressionScrollRef.current = "top";
      setViewedStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not continue to Follow-up.");
    } finally {
      setFollowUpAdvancing(false);
    }
  }

  function moveToFollowUp() {
    if (!canAdvance) {
      toast.error("This candidate is not qualified to continue. Use Talent Pool.");
      return;
    }
    if (matchProgressionFollowUpNeedsConfirm(outcomeCounts.verify)) {
      setConfirmFollowUpOpen(true);
      return;
    }
    void advanceToFollowUp();
  }

  async function handleTalentPool() {
    const ok = await sendToTalentPool();
    if (ok) {
      setStatusName("Not a Fit");
      setStatusSystemKey("rejected");
    }
  }
  const analysisHistory = useMemo(() => {
    const rows = data?.analysisHistory ?? [];
    if (rows.length) return rows;
    if (!app || (app.ai_match_status !== "ANALYZED" && app.ai_match_score == null && !app.ai_analyzed_at)) {
      return [];
    }
    const route = quickRouteFromAnalysis(analysis);
    const quickLabel =
      route === "STRONG"
        ? "Strong"
        : route === "LOW_MATCH"
          ? "Low match"
          : route === "REVIEW"
            ? "Review"
            : null;
    return [
      {
        id: app.id,
        version: Number(app.ai_analysis_version) || 1,
        score: app.ai_match_score,
        category: app.ai_match_category,
        display_category: app.ai_match_display_category || quickLabel || null,
        model: app.ai_analysis_model,
        analyzed_at: app.ai_analyzed_at ?? "",
        analysis: analysis ?? null,
      },
    ];
  }, [data?.analysisHistory, app, analysis]);

  useEffect(() => {
    if (app?.status_name) setStatusName(app.status_name);
    if (app?.status_system_key !== undefined) setStatusSystemKey(app.status_system_key ?? null);
  }, [app?.status_name, app?.status_system_key]);

  // Status actions under This Job use the Pre-Hire catalog for the candidate's
  // current hire-journey stage — never AI Analysis progression steps.
  useEffect(() => {
    const scopedWorkerId = workerId?.trim();
    if (!scopedWorkerId) {
      setPreHireStageName("Intake");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [phaseRes, assignRes, appRes] = await Promise.all([
          fetch(`/api/admin/candidates/${encodeURIComponent(scopedWorkerId)}/workflow-phases`, {
            cache: "no-store",
          }),
          fetch("/api/admin/application-status-stage-assignments", { cache: "no-store" }),
          fetch(`/api/admin/job-applications/${encodeURIComponent(applicationId)}`, {
            cache: "no-store",
          }),
        ]);
        const phaseJson = (await phaseRes.json()) as CandidateWorkflowPhaseView & { error?: string };
        const assignJson = (await assignRes.json()) as {
          lanes?: Array<{
            stageName?: string;
            statusId?: string;
            lane?: string;
            workflowId?: string | null;
            sortOrder?: number;
          }>;
          error?: string;
        };
        const appJson = (await appRes.json()) as {
          application?: { status_id?: string | null; workflow_id?: string | null };
          error?: string;
        };
        if (cancelled) return;

        const journeyStages = groupStepsIntoHireStages(phaseRes.ok ? (phaseJson.preHire?.steps ?? []) : [], "pre_hire");
        const journeyStage = currentPreHireStatusStageName(journeyStages);
        const laneRows = Array.isArray(assignJson.lanes)
          ? assignJson.lanes
              .filter(
                (row): row is {
                  stageName: string;
                  statusId: string;
                  lane: string;
                  workflowId: string | null;
                  sortOrder: number;
                } =>
                  typeof row.stageName === "string" &&
                  typeof row.statusId === "string" &&
                  typeof row.lane === "string"
              )
              .map((row) => ({
                stageName: row.stageName,
                statusId: row.statusId,
                lane: row.lane as "happy_path" | "alternate" | "closed",
                workflowId: row.workflowId ?? null,
                sortOrder: Number(row.sortOrder ?? 0),
              }))
          : [];
        const next = resolvePreHireStatusStageForActions({
          hireJourneyStageName: journeyStage,
          statusId: appJson.application?.status_id ?? null,
          workflowId: appJson.application?.workflow_id ?? null,
          lanes: laneRows,
        });
        if (!cancelled && isPreHireStatusStageName(next)) setPreHireStageName(next);
      } catch {
        if (!cancelled) setPreHireStageName("Intake");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workerId, applicationId, statusRevision]);

  const noteFeedItems = useMemo(() => {
    const verified = (data?.verifiedInformation ?? []).map((item) => ({
      kind: "verified" as const,
      id: item.id,
      sortAt: item.verifiedAt,
      item,
    }));
    const notes = (data?.notes ?? []).map((note) => ({
      kind: "note" as const,
      id: note.id,
      sortAt: note.created_at,
      note,
    }));
    const verification = (data?.verificationNotes ?? []).map((note) => ({
      kind: "verification" as const,
      id: note.id,
      sortAt: note.updatedAt || note.createdAt,
      note,
    }));
    return [...verified, ...notes, ...verification].sort(
      (a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime()
    );
  }, [data?.verifiedInformation, data?.notes, data?.verificationNotes]);

  async function handleAskCandidate(note: VerificationNote) {
    setAskCandidateNote(note);
    await markNoteSentToCandidate(note);
    setCommOpen(true);
  }

  function handleRecruiterVerifiedClick(row: QualificationRequirement) {
    if (recruiterVerifiedNeedsNoteDecision(row)) {
      setOpenReqId(row.id);
      setNoteCreateSignal({ id: row.id, n: Date.now(), prefill: "verified" });
      toast("Save a note first, then check Recruiter verified.");
      return;
    }
    void toggleVerified(row);
  }

  const latestResumeId =
    resumes.length > 1 ? resumes[resumes.length - 1]?.id ?? null : null;
  const analyzedResumeId = useMemo(
    () => resolveAnalyzedResumeId(resumes, app?.ai_analyzed_at, isAnalyzed),
    [resumes, app?.ai_analyzed_at, isAnalyzed]
  );

  const filteredRequirements = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = filterQualificationRequirements(
      data?.requirements ?? [],
      FILTER_TO_QUAL[filter],
      blocking
    );
    if (!q) return base;
    return base.filter((row) => row.requirement_text.toLowerCase().includes(q));
  }, [filter, query, data?.requirements, blocking]);

  function handleDownloadAssessment() {
    if (!isAnalyzed) {
      toast.error("Run analysis before downloading the assessment.");
      return;
    }
    setDownloadingAssessment(true);
    try {
      downloadMatchAnalysisAssessment({
        candidateName,
        jobTitle,
        matchScore,
        matchLabel,
        recommendation,
        summary,
        confidencePercent,
        analysis,
        requirements: data?.requirements ?? [],
        blocking,
        strengths,
        verificationNeeded,
        recommendedQuestions: recommendedQuestions.map((item) => ({
          question: item.question,
          answer: recommendedAnswers[item.key] ?? item.answer ?? "",
        })),
        analysisHistory,
        decision,
        decisionNote,
        analyzedAt: app?.ai_analyzed_at,
      });
      toast.success("Assessment downloaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download assessment.");
    } finally {
      setDownloadingAssessment(false);
    }
  }

  const shellClass = embedded
    ? "box-border w-full min-w-0 max-w-full pb-8"
    : "box-border w-full min-w-0 max-w-full px-3 pb-10 pt-4 sm:px-5 sm:pt-5 lg:px-8";

  if (loading) {
    return (
      <div className={shellClass} style={brandStyle}>
        <div
          className={`flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-6 text-sm text-[#667085] ${
            embedded ? "" : "mt-8"
          }`}
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading AI analysis…
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass} style={brandStyle} data-application-id={applicationId}>
      {!embedded ? (
        backHref.includes("/admin_recruiter/applications") ? (
          <JobsBreadcrumb
            page="ai-analysis"
            jobCandidatesHref={jobCandidatesHrefForJob(jobId) || backHref}
          />
        ) : (
          <CandidatesBreadcrumb currentLabel="AI Analysis" backHref={backHref} />
        )
      ) : null}

      <div
        className={`${embedded ? "" : "mt-4"} ${STEP_SCROLL_MARGIN_CLASS}`}
        id="ai-analysis-overview-top"
      >
        <MatchProgressionStepper
          viewedIndex={viewedStep}
          unlockedIndex={unlockedIndex}
          canAdvance={canAdvance}
          onSelect={selectProgressionStep}
        />
      </div>

      <div className="mt-6 grid min-w-0 items-start gap-5 sm:gap-[30px] xl:grid-cols-[minmax(0,1fr)_minmax(16rem,21.875rem)]">
        <div className="min-w-0 space-y-5">
          <section className="overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-white">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <BrandedSvgIcon
                  src="/hugeicons_ai-user.svg"
                  className="h-5 w-5"
                  color={branding.primaryHex}
                />
                <h1
                  className="m-0 text-base font-semibold leading-6 tracking-normal sm:text-lg sm:leading-7"
                  style={{ ...CANDIDATES_PAGE_TITLE_STYLE, color: branding.secondaryHex }}
                >
                  AI Analysis Overview
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#667085]">Model</span>
                  <MatchAnalysisModelSelect
                    variant="primary"
                    value={analysisProvider}
                    onChange={setAnalysisProvider}
                    disabled={analyzing}
                    className="h-9 shrink-0"
                    claudeAvailable={data?.claudeAvailable}
                  />
                </div>
                <MatchAnalyzeButton
                  variant="primary"
                  analyzing={analyzing}
                  isAnalyzed={isAnalyzed}
                  viewedStep={viewedStep}
                  deepPrimary={viewedStep >= 3}
                  hasVerifications={unlockedIndex >= 1}
                  hasFollowUp={unlockedIndex >= 2}
                  hasDeepMatch={hasDeepMatch}
                  analysisProvider={analysisProvider}
                  requireDeepConfirm={data?.matchProgression?.requireDeepConfirm !== false}
                  allowDeep={canRunPaidDeep}
                  className="shrink-0 h-9"
                  onAnalyze={(mode) => void handleRunAnalyze(mode)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-4 border-b border-[#E5E7EB] px-4 py-4 sm:px-5">
              <div className="flex min-w-0 flex-col items-center justify-between gap-4 sm:flex-row sm:items-center sm:text-left">
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                  <MatchRing
                    percent={matchScore == null ? null : Math.round(matchScore)}
                    label={matchLabel}
                    strokeColor={ringStrokeColor(matchScore)}
                    fitBand={isAnalyzed ? statusFitBand : null}
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold leading-7 text-[#374151] sm:text-2xl sm:leading-8">{candidateName}</h2>
                    {jobTitle ? (
                      <p className="mt-0.5 text-sm leading-5 text-[#6B7280]">
                        For:{" "}
                        {jobDetailsHref ? (
                          <Link
                            href={jobDetailsHref}
                            className="font-medium text-[#001A46] underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                            title="View job details"
                          >
                            {jobTitle}
                          </Link>
                        ) : (
                          <span className="font-medium text-[#001A46]">{jobTitle}</span>
                        )}
                      </p>
                    ) : null}
                    {workerId ? (
                      <div className="mt-3 flex items-center gap-3">
                        <Link
                          href={candidateProfileHrefForAnalysisContext(workerId, backHref, jobId)}
                          className="inline-flex items-center justify-center rounded-lg border border-[color:var(--brand-primary)] bg-white px-4 py-1.5 text-sm font-semibold text-[color:var(--brand-primary)] shadow-sm transition hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_4%,white)]"
                        >
                          View Profile
                        </Link>
                        <Link
                          href={
                            embedded
                              ? candidateDetailPreHireHref(workerId)
                              : candidateHireJourneyHref(workerId)
                          }
                          className="inline-flex items-center justify-center rounded-lg border border-[color:var(--brand-secondary)] bg-[color:var(--brand-secondary)] px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
                        >
                          Hiring Journey
                        </Link>
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                      {confidencePercent != null && confidencePercent > 0 ? (
                        <span className="inline-flex rounded-full bg-[#001A46] px-2.5 py-1 text-[10px] font-normal leading-[15px] text-white">
                          Confidence {confidencePercent}%
                        </span>
                      ) : null}
                      {isAnalyzed ? (
                        <span
                          className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold leading-[15px] ${fitBandTagClassName(statusFitBand)}`}
                        >
                          {fitBandLabel(statusFitBand)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {isAnalyzed && outcomeCounts.total > 0 ? (
                  <div
                    className="flex flex-wrap justify-center gap-2 sm:justify-end"
                    aria-label="Requirement outcome counts"
                  >
                    {OUTCOME_STAT_CARDS.map((card) => {
                      const active = filter === card.filter;
                      return (
                        <button
                          key={card.label}
                          type="button"
                          title={card.title}
                          aria-pressed={active}
                          onClick={() => {
                            setFilter(card.filter);
                            scrollAiAnalysisBelowHeader("match-step-quick");
                          }}
                          className={`inline-flex w-[70px] h-[50px] flex-col items-center justify-center rounded-lg border transition ${
                            active
                              ? "border-[color:var(--brand-primary)] bg-[color:color-mix(in_srgb,var(--brand-primary)_8%,white)]"
                              : "border-[#E5E7EB] bg-[#F8FAFC] hover:border-[#D0D5DD]"
                          }`}
                        >
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-[#667085]">
                            {card.label}
                          </span>
                          <span className={`text-base font-semibold tabular-nums leading-5 ${card.valueClass}`}>
                            {outcomeCounts[card.countKey]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            {app?.ai_analysis_error ? (
              <p className="border-b border-[#E5E7EB] px-5 py-5 text-xs leading-4 text-[#B91C1C]">{app.ai_analysis_error}</p>
            ) : null}
            {summary ? (
              <p className="px-5 py-5 text-xs leading-4 text-[#4B5563]">{summary}</p>
            ) : !isAnalyzed ? (
              <p className="px-5 py-5 text-xs leading-4 text-[#6B7280]">
                This candidate has not been analyzed yet. Run Quick Match to populate the checklist.
              </p>
            ) : !hasDeepMatch ? (
              <p className="px-5 py-5 text-xs leading-4 text-[#6B7280]">
                Quick Match is complete. Match % and confidence appear after Run Deep Match.
              </p>
            ) : null}
            {submitBanner ? (
              <div
                className={`border-t border-[#E5E7EB] px-5 py-3 text-sm font-semibold ${
                  submitBanner.kind === "submit"
                    ? "bg-[#ECFDF3] text-[#027A48]"
                    : submitBanner.kind === "do_not_submit"
                      ? "bg-[#FEF3F2] text-[#B42318]"
                      : "bg-[#FFFAEB] text-[#B54708]"
                }`}
              >
                {submitBanner.label}
              </div>
            ) : viewedStep >= 4 ? (
              <p className="border-t border-[#E5E7EB] px-5 py-3 text-sm text-[#667085]">
                Run Deep Match to fill the submit recommendation.
              </p>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-[12px] border border-[color:var(--brand-primary)] bg-[#FFFDFC] p-5 shadow-sm">
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-bold text-[#101828]">This Job</h2>
                <p className="mt-2 text-sm text-[#475467]">
                  Stage · <span className="font-semibold text-[#101828]">{preHireStageName}</span>
                </p>
                {statusName ? (
                  <p className="mt-1 text-sm text-[#475467]">
                    Status · <span className="font-semibold text-[#101828]">{statusName}</span>
                  </p>
                ) : null}
              </div>
              <StageStatusSequenceButtons
                key={`${preHireStageName}-${statusRevision}`}
                applicationId={applicationId}
                stageName={preHireStageName}
                showHiringJourneyHint
                onStatusChanged={(next) => {
                  setStatusName(next.statusName);
                  setStatusSystemKey(null);
                  setStatusRevision((revision) => revision + 1);
                }}
                onException={async (status) => {
                  if (!status.name.toLowerCase().includes("talent pool")) return false;
                  await handleTalentPool();
                  setStatusRevision((revision) => revision + 1);
                  return true;
                }}
              />
            </div>
          </section>

          {progressionStep && progressionHint ? (
            <div className="flex overflow-hidden rounded-[12px] border border-[color:var(--brand-primary)] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <div className="w-1 shrink-0 bg-[color:var(--brand-primary)]" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                <span className="inline-flex w-fit shrink-0 items-center rounded-md bg-[color:color-mix(in_srgb,var(--brand-primary)_12%,white)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--brand-primary)]">
                  Step {progressionStep.stepNumber}
                </span>
                <div className="min-w-0">
                  <p
                    className="m-0 text-sm font-semibold leading-5"
                    style={{ color: branding.secondaryHex }}
                  >
                    {progressionStep.label}
                  </p>
                  {progressionHintBody ? (
                    <p className="m-0 mt-0.5 text-sm leading-5 text-[#667085]">{progressionHintBody}</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {viewedStep >= 4 ? (
            <section className={`${CARD} ${STEP_SCROLL_MARGIN_CLASS}`} id="match-step-submission">
              <SectionHeaderBlock>
                <SectionTitle>Optimized submission résumé</SectionTitle>
                <p className="mt-1 text-sm text-[#667085]">
                  Editable Word deliverable for the MSP / client portal, with a PDF preview for comparison.
                  Only job-relevant, evidence-supported details are included.
                </p>
              </SectionHeaderBlock>
              {hasSubmissionResume ? (
                <div className="mt-4 flex flex-col gap-4">
                  <div className="flex items-start gap-3 rounded-lg border border-[color:var(--brand-primary)] bg-white px-3 py-3">
                    <BrandedFileTypeIcon type="pdf" className="mt-0.5 h-7 w-7 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="m-0 block max-w-full truncate text-sm font-semibold text-[color:var(--brand-primary)]">
                          {(latestSubmissionDocx || latestSubmissionResume)?.fileName ||
                            "Optimized submission résumé"}
                        </p>
                        <span className="shrink-0 rounded-md bg-[color:var(--brand-primary)] px-2 py-0.5 text-[11px] font-semibold text-white">
                          Optimized
                        </span>
                      </div>
                      {(latestSubmissionDocx || latestSubmissionResume)?.uploadedAtLabel ||
                      (latestSubmissionDocx || latestSubmissionResume)?.uploadedAt ? (
                        <p className="mt-0.5 text-xs text-[#667085]">
                          Created{" "}
                          {(latestSubmissionDocx || latestSubmissionResume)?.uploadedAtLabel ||
                            formatWhen((latestSubmissionDocx || latestSubmissionResume)?.uploadedAt)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {(originalPreviewHref || optimizedPreviewHref) && workerId ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="overflow-hidden rounded-lg border border-[#E4E7EC] bg-[#F9FAFB]">
                        <div className="flex items-center justify-between border-b border-[#E4E7EC] px-3 py-2">
                          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#667085]">
                            Original
                          </p>
                          {latestOriginalResume ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-[color:var(--brand-primary)] hover:underline"
                              onClick={() => void viewResume(latestOriginalResume.id)}
                            >
                              Open
                            </button>
                          ) : null}
                        </div>
                        {originalPreviewHref ? (
                          <iframe
                            title="Original résumé preview"
                            src={originalPreviewHref}
                            className="h-[420px] w-full bg-white"
                          />
                        ) : (
                          <p className="m-0 px-3 py-8 text-center text-sm text-[#667085]">
                            No original résumé on file.
                          </p>
                        )}
                      </div>
                      <div className="overflow-hidden rounded-lg border border-[#E4E7EC] bg-[#F9FAFB]">
                        <div className="flex items-center justify-between border-b border-[#E4E7EC] px-3 py-2">
                          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#667085]">
                            Optimized preview
                          </p>
                          {latestSubmissionPdf || latestSubmissionResume ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-[color:var(--brand-primary)] hover:underline"
                              onClick={() =>
                                void viewResume((latestSubmissionPdf || latestSubmissionResume)!.id)
                              }
                            >
                              Open
                            </button>
                          ) : null}
                        </div>
                        {optimizedPreviewHref ? (
                          <iframe
                            title="Optimized résumé PDF preview"
                            src={optimizedPreviewHref}
                            className="h-[420px] w-full bg-white"
                          />
                        ) : (
                          <p className="m-0 px-3 py-8 text-center text-sm text-[#667085]">
                            Draft an optimized résumé to preview.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {improvementSummary ? (
                    <div className="rounded-lg border border-[#E4E7EC] bg-white px-4 py-3">
                      <p className="m-0 text-sm font-semibold text-[#101828]">Improvement summary</p>
                      <p className="mt-1 text-sm leading-5 text-[#475467]">{improvementSummary.overall}</p>
                      <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                            Clarity
                          </dt>
                          <dd className="m-0 mt-0.5 text-sm text-[#344054]">{improvementSummary.clarity}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                            Relevance
                          </dt>
                          <dd className="m-0 mt-0.5 text-sm text-[#344054]">
                            {improvementSummary.relevance}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                            Formatting
                          </dt>
                          <dd className="m-0 mt-0.5 text-sm text-[#344054]">
                            {improvementSummary.formatting}
                          </dd>
                        </div>
                      </dl>
                      {improvementSummary.skillEvidenceNote ? (
                        <p
                          className={`mt-3 text-sm ${
                            improvementSummary.skillEvidenceQuality === "keyword_stuffing"
                              ? "font-medium text-[#B42318]"
                              : "text-[#475467]"
                          }`}
                        >
                          {improvementSummary.skillEvidenceNote}
                        </p>
                      ) : null}
                      {(improvementSummary.added.length > 0 ||
                        improvementSummary.removed.length > 0 ||
                        improvementSummary.needsVerification.length > 0) && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          {improvementSummary.added.length > 0 ? (
                            <div>
                              <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                                Added / highlighted
                              </p>
                              <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-[#344054]">
                                {improvementSummary.added.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {improvementSummary.removed.length > 0 ? (
                            <div>
                              <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                                Removed / trimmed
                              </p>
                              <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-[#344054]">
                                {improvementSummary.removed.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {improvementSummary.needsVerification.length > 0 ? (
                            <div>
                              <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                                Needs verification
                              </p>
                              <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-[#344054]">
                                {improvementSummary.needsVerification.map((item) => (
                                  <li key={item}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {latestSubmissionDocx ? (
                      <button
                        type="button"
                        className={PRIMARY_BTN}
                        onClick={() =>
                          void downloadSubmissionDocx(
                            latestSubmissionDocx.id,
                            latestSubmissionDocx.fileName
                          )
                        }
                      >
                        Download .docx
                      </button>
                    ) : null}
                    {(latestSubmissionPdf || latestSubmissionResume) && (
                      <button
                        type="button"
                        className={OUTLINE_BTN}
                        onClick={() =>
                          void viewResume((latestSubmissionPdf || latestSubmissionResume)!.id)
                        }
                      >
                        View PDF
                      </button>
                    )}
                    <button
                      type="button"
                      className={OUTLINE_BTN}
                      disabled={draftingSubmissionResume || !hasDeepMatch}
                      onClick={() => void draftSubmissionResume()}
                    >
                      {draftingSubmissionResume ? "Drafting…" : "Draft again"}
                    </button>
                    {hasSubmissionResume ? (
                      <button
                        type="button"
                        className={OUTLINE_BTN}
                        onClick={() => setCommOpen(true)}
                      >
                        Email MSP / upload portal
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-[#667085]">
                    No optimized résumé yet. Draft one from Deep Match evidence and screening follow-up,
                    then download the Word file for the portal.
                  </p>
                  <button
                    type="button"
                    className={`${PRIMARY_BTN} mt-3`}
                    disabled={draftingSubmissionResume || !hasDeepMatch}
                    onClick={() => void draftSubmissionResume()}
                  >
                    {draftingSubmissionResume ? "Drafting résumé…" : "Draft submission résumé"}
                  </button>
                </div>
              )}
            </section>
          ) : null}

          <section className={`${CARD} ${STEP_SCROLL_MARGIN_CLASS}`} id="match-step-quick">
            <SectionHeaderBlock>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BrandedSvgIcon
                    src="/Qualification-checklist.svg"
                    className="h-[15px] w-[18px]"
                    color="var(--brand-primary)"
                  />
                  <SectionTitle>Qualification Checklist</SectionTitle>
                </div>
              </div>
            </SectionHeaderBlock>

            <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex w-max flex-nowrap items-center gap-2">
                {FILTERS.map((item) => {
                  const active = filter === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setFilter(item)}
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                        active
                          ? "bg-[color:var(--brand-primary)] text-white"
                          : "bg-[#F2F4F7] hover:bg-[#E4E7EC]"
                      }`}
                      style={active ? undefined : { color: branding.secondaryHex }}
                    >
                      {item} ({filterCount(item, outcomeCounts)})
                    </button>
                  );
                })}
                </div>
              </div>
              <label className="relative w-full shrink-0 sm:max-w-[260px] xl:w-[240px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search requirements..."
                  className={`${FIELD} h-10 pl-9`}
                />
              </label>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[720px] w-full text-left">
                <thead>
                  <tr className="border-b border-[#E5E7EB] text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                    <th className="py-3 pr-3 text-left">Requirement</th>
                    <th className="py-3 pr-3 text-center">Type</th>
                    <th className="py-3 pr-3 text-center">Status</th>
                    <th className="w-10 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filteredRequirements.map((row: QualificationRequirement) => {
                    const open = openReqId === row.id;
                    const displayStatus = qualificationDisplayStatus(row, blocking);
                    return (
                      <Fragment key={row.id}>
                        <tr
                          className={`cursor-pointer hover:bg-[#F9FAFB] ${open ? "" : "border-b border-[#F2F4F7]"}`}
                          onClick={() => setOpenReqId(open ? "" : row.id)}
                        >
                          <td className="py-3.5 pr-3">
                            <div className="flex flex-wrap items-start gap-2">
                              <p className="cursor-pointer text-sm font-medium leading-5 text-[#101828]">
                                {row.requirement_text}
                              </p>
                              <RequirementNotesIndicator requirement={row} />
                            </div>
                          </td>
                          <td className="py-3.5 pr-3 text-center">
                            <span className={`${CHECKLIST_BADGE} ${typeBadgeClass(row.requirement_type)}`}>
                              {formatRequirementType(row.requirement_type)}
                            </span>
                          </td>
                          <td className="py-3.5 pr-3 text-center">
                            <div className="inline-flex flex-col items-center gap-1">
                              <span className={`${CHECKLIST_BADGE} ${statusBadgeClass(displayStatus)}`}>
                                {displayStatus}
                              </span>
                              {(row.verification_note_count ?? 0) > 0 ? (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#3730A3]">
                                  Note saved
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3.5">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[#667085] hover:bg-[#F2F4F7]"
                              aria-expanded={open}
                              aria-label={open ? "Collapse candidate evidence" : "Expand candidate evidence"}
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenReqId(open ? "" : row.id);
                              }}
                            >
                              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </td>
                        </tr>
                        {open ? (
                          <tr className="border-b border-[#F2F4F7]">
                            <td colSpan={4} className="pb-4 pr-3">
                              <div className="rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">
                                  Candidate Evidence
                                </p>
                                <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0 flex-1">
                                    {row.candidate_evidence ? (
                                      <blockquote className="border-l-[3px] border-[color:var(--brand-primary)] pl-3 text-sm italic leading-6 text-[#344054]">
                                        {row.candidate_evidence}
                                      </blockquote>
                                    ) : (
                                      <p className="text-sm leading-6 text-[#667085]">
                                        No candidate evidence recorded.
                                      </p>
                                    )}
                                    {row.impact ? (
                                      <p className="mt-2 text-xs leading-5 text-[#667085]">
                                        <span className="font-semibold text-[#475467]">Impact:</span> {row.impact}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 flex-col items-start gap-1 pt-0.5">
                                    <label
                                      htmlFor={`recruiter-verified-${row.id}`}
                                      className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-medium text-[#344054]"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      <ListTableCheckbox
                                        id={`recruiter-verified-${row.id}`}
                                        size="md"
                                        checked={row.recruiter_verified}
                                        disabled={verifyingId === row.id}
                                        onChange={() => handleRecruiterVerifiedClick(row)}
                                        aria-label={`Recruiter verified: ${row.requirement_text}`}
                                      />
                                      Recruiter verified
                                      {verifyingId === row.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#98A2B3]" />
                                      ) : null}
                                    </label>
                                    {recruiterVerifiedNeedsNoteDecision(row) ? (
                                      <p className="max-w-[220px] text-[11px] leading-4 text-[#667085]">
                                        Save a note first
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                                <RequirementVerificationNotesPanel
                                  applicationId={applicationId}
                                  requirement={row}
                                  notes={(data?.verificationNotes ?? []).filter(
                                    (note) => note.requirementId === row.id
                                  )}
                                  busyNoteId={busyVerificationNoteId}
                                  saving={savingVerificationNote}
                                  openCreateSignal={
                                    noteCreateSignal?.id === row.id ? noteCreateSignal.n : 0
                                  }
                                  createPrefill={
                                    noteCreateSignal?.id === row.id
                                      ? noteCreateSignal.prefill === "verified"
                                        ? recruiterVerifiedNotePrefill(row)
                                        : pendingVerificationNotePrefill(row)
                                      : undefined
                                  }
                                  onOpenCreateConsumed={() => setNoteCreateSignal(null)}
                                  onCreate={(draft) => createVerificationNote(row.id, draft)}
                                  onUpdate={(noteId, draft) =>
                                    updateVerificationNote(row.id, noteId, draft)
                                  }
                                  onDelete={(noteId) => deleteVerificationNote(row.id, noteId)}
                                  onAskCandidate={(note) => void handleAskCandidate(note)}
                                />
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#667085]">
                                  <button
                                    type="button"
                                    className="cursor-pointer font-medium text-[color:var(--brand-primary)] hover:underline"
                                    onClick={() => setOpenReqId("")}
                                  >
                                    Show less
                                  </button>
                                  <span>
                                    Source: {row.evidence_source || "Resume"} • Confidence: {row.confidence}%
                                  </span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {!filteredRequirements.length ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-sm text-[#667085]">
                        No requirements match this filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {isAnalyzed ? (
              <p className="mt-4 rounded-lg border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-xs leading-5 text-[#B54708]">
                {FLOW_DIAMOND_COPY}
                {statusFitBand === "low"
                  ? " This applicant is Low match."
                  : statusFitBand === "strong"
                    ? " This applicant is Strong."
                    : " This applicant is Review."}
              </p>
            ) : null}
          </section>

          {viewedStep >= 1 ? (
          <>
          <div className={`grid gap-3 lg:grid-cols-2 ${STEP_SCROLL_MARGIN_CLASS}`} id="match-step-verifications">
            <section className={CARD}>
              <SectionHeaderBlock>
                <div className="flex items-center gap-2">
                  <BrandedSvgIcon
                    src="/akar-icons_trophy.svg"
                    className="h-[20px] w-[20px]"
                    color="var(--brand-primary)"
                  />
                  <SectionTitle>Documented Strengths</SectionTitle>
                </div>
              </SectionHeaderBlock>
              <ul className="mt-4 space-y-3">
                {strengths.length ? (
                  strengths.map((item, index) => (
                    <AlignedIconListItem key={`strength-${index}`} iconSrc="/icon-park-solid_check-one.svg">
                      {item}
                    </AlignedIconListItem>
                  ))
                ) : (
                  <li className="text-sm text-[#667085]">No confirmed items on the Qualification Checklist yet.</li>
                )}
              </ul>
            </section>

            <section className={CARD}>
              <SectionHeaderBlock>
                <div className="flex items-center gap-2">
                  <BrandedSvgIcon
                    src="/selfhst_web-check-dark.svg"
                    className="h-[20px] w-[20px]"
                    color="var(--brand-primary)"
                  />
                  <SectionTitle>Verification Needed</SectionTitle>
                </div>
              </SectionHeaderBlock>
              <ul className="mt-4 space-y-3">
                {verificationNeeded.length ? (
                  verificationNeeded.map((item, index) => (
                    <AlignedIconListItem key={`verify-${index}`} iconSrc="/ic_round-warning.svg">
                      {item}
                    </AlignedIconListItem>
                  ))
                ) : (
                  <li className="text-sm text-[#667085]">No checklist items need verification.</li>
                )}
              </ul>
            </section>
          </div>

          <section className={`${CARD} ${STEP_SCROLL_MARGIN_CLASS}`}>
            <SectionHeaderBlock>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <SectionTitle>List of screening questions</SectionTitle>
                  <p className="mt-1 text-sm text-[#667085]">
                    Step 2 call pack · {recommendedQuestions.length} targeted questions to confirm on the call.
                  </p>
                </div>
              <div className="flex flex-wrap items-center gap-2">
                {recommendedQuestions.length ? (
                  <button
                    type="button"
                    className={`${OUTLINE_BTN} h-10 gap-2 px-3`}
                    onClick={() =>
                      copyText(
                        recommendedQuestions.map((item, index) => `${index + 1}. ${item.question}`).join("\n\n"),
                        "Questions copied"
                      )
                    }
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                    Copy all
                  </button>
                ) : null}
              </div>
              </div>
            </SectionHeaderBlock>

            <div className="mt-4 space-y-4">
              {recommendedQuestions.length ? (
                recommendedQuestions.map((item, index) => (
                  <article key={item.key} className="rounded-[12px] border border-[#E5E7EB] bg-[#FCFCFD] p-4">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--brand-primary)] text-sm font-semibold text-[color:var(--brand-primary)]">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <p className="flex-1 text-sm font-semibold leading-6 text-[#101828]">{item.question}</p>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#667085] hover:bg-white"
                            aria-label="Copy question"
                            onClick={() => copyText(item.question, "Question copied")}
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                        {item.reason ? (
                          <p className="mt-2 text-sm leading-5 text-[#344054]">
                            <span className="font-medium">Why this matters:</span> {item.reason}
                          </p>
                        ) : null}
                        {item.relatedRequirement ? (
                          <p className="mt-1 text-sm leading-5 text-[#667085]">
                            <span className="font-medium text-[#475467]">Related:</span> {item.relatedRequirement}
                          </p>
                        ) : null}
                        <label className="mt-3 block">
                          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#667085]">
                            Candidate answer
                          </span>
                          <textarea
                            value={recommendedAnswers[item.key] ?? ""}
                            onChange={(event) =>
                              updateRecommendedAnswer(item.key, event.target.value)
                            }
                            onBlur={(event) => {
                              if (event.target.value.trim() === (item.answer ?? "").trim()) return;
                              void saveScreeningAnswers();
                            }}
                            rows={3}
                            placeholder="Record the candidate’s answer from the call…"
                            className={`${AREA} min-h-[5.5rem] resize-y`}
                          />
                        </label>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <p className="text-sm text-[#667085]">
                  {analyzing
                    ? "Generating screening questions…"
                    : "No screening questions yet. Open the Verifications step to generate the call pack."}
                </p>
              )}
            </div>

            <div className="mt-4 rounded-[12px] border border-[#E5E7EB] bg-[#FCFCFD] p-4">
              <label className="block">
                <textarea
                  value={callContext}
                  onChange={(event) => updateCallContext(event.target.value)}
                  onBlur={(event) => {
                    if (event.target.value.trim() === (data?.callContext ?? "").trim()) return;
                    void saveScreeningAnswers();
                  }}
                  rows={4}
                  placeholder="Tone, availability, red flags, client-fit notes, anything the model should use next…"
                  className={`${AREA} min-h-[6.5rem] resize-y`}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                className={OUTLINE_BTN}
                disabled={savingAnswers}
                onClick={() => void saveScreeningAnswers()}
              >
                {savingAnswers ? "Saving…" : "Save screening answers"}
              </button>
            </div>
          </section>

          {viewedStep >= 2 ? (
          <section className={`${CARD} ${STEP_SCROLL_MARGIN_CLASS}`} id="match-step-follow-up">
            <SectionHeaderBlock>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <SectionTitle>Follow-Up</SectionTitle>
                  <p className="mt-1 text-sm text-[#667085]">
                    Step 3 questions, separate from the Verifications call pack. Record answers or upload the reply when it arrives.
                  </p>
                </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`${OUTLINE_BTN} h-10 gap-2 px-3`}
                  disabled={uploadingScreening}
                  onClick={() => screeningUploadRef.current?.click()}
                >
                  <Upload className="h-4 w-4" aria-hidden />
                  {uploadingScreening ? "Uploading…" : "Upload reply"}
                </button>
              </div>
              </div>
            </SectionHeaderBlock>

            <div className="mt-4 space-y-4">
              {followUpQuestions.length ? (
                followUpQuestions.map((item, index) => (
                  <article key={`follow-up-${item.key}`} className="rounded-[12px] border border-[#E5E7EB] bg-[#FCFCFD] p-4">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--brand-primary)] text-sm font-semibold text-[color:var(--brand-primary)]">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-6 text-[#101828]">{item.question}</p>
                        {item.reason ? (
                          <p className="mt-2 text-sm leading-5 text-[#344054]">
                            <span className="font-medium">Why this matters:</span> {item.reason}
                          </p>
                        ) : null}
                        <label className="mt-3 block">
                          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#667085]">
                            Notes
                          </span>
                          <textarea
                            value={recommendedAnswers[item.key] ?? ""}
                            onChange={(event) =>
                              updateRecommendedAnswer(item.key, event.target.value)
                            }
                            onBlur={(event) => {
                              if (event.target.value.trim() === (item.answer ?? "").trim()) return;
                              void saveScreeningAnswers();
                            }}
                            rows={3}
                            placeholder="Record the candidate answer or recruiter notes..."
                            className={`${AREA} min-h-[5.5rem] resize-y`}
                          />
                        </label>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <p className="text-sm text-[#667085]">
                  No follow-up questions yet. Continue to Follow-up, or re-run Follow-up, to write questions for this step.
                </p>
              )}
            </div>

            {data?.questionSetsStale?.follow_up ? (
              <p className="mt-3 text-xs text-[#B54708]">
                Checklist or notes changed. Re-run Follow-up to refresh these questions.
              </p>
            ) : null}

            {followUpQuestions.length ? (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className={OUTLINE_BTN}
                  disabled={savingAnswers}
                  onClick={() => void saveScreeningAnswers()}
                >
                  {savingAnswers ? "Saving…" : "Save notes"}
                </button>
              </div>
            ) : null}
            {screeningUploads.length ? (
              <ul className="mt-4 space-y-2 border-t border-[#E5E7EB] pt-4">
                {screeningUploads.map((item) => (
                  <li key={item.id} className="text-sm text-[#344054]">
                    <span className="font-medium">{item.fileName}</span>
                    {item.extractedText ? (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-[#667085]">
                        {item.extractedText.slice(0, 400)}
                        {item.extractedText.length > 400 ? "…" : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          ) : null}
          </>
          ) : null}

          {viewedStep >= 3 ? (
          <section className={`${CARD} ${STEP_SCROLL_MARGIN_CLASS}`} id="match-step-deep">
            <SectionHeaderBlock>
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 text-left"
                onClick={() => setDataQualityOpen((open) => !open)}
                aria-expanded={dataQualityOpen}
              >
                <div>
                  <SectionTitle>Data Quality & Analysis Notes</SectionTitle>
                  <p className="mt-1 text-sm text-[#667085]">
                    Resume completeness: {resumeCompleteness} • Job Completeness: {jobCompleteness}
                  </p>
                </div>
                {dataQualityOpen ? (
                  <ChevronUp className="mt-1 h-5 w-5 shrink-0 text-[#667085]" />
                ) : (
                  <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-[#667085]" />
                )}
              </button>
            </SectionHeaderBlock>

            {dataQualityOpen ? (
              <div className="mt-4 space-y-5 text-sm leading-6 text-[#344054]">
                {hasDeepMatch ? (
                  <>
                    <NoteBlock title="Missing Information" items={analysis?.data_quality?.missing_information ?? []} />
                    <NoteBlock
                      title="Job-description conflicts"
                      items={analysis?.data_quality?.job_description_conflicts ?? []}
                      empty="None."
                    />
                    <NoteBlock title="Résumé conflicts" items={analysis?.data_quality?.resume_conflicts ?? []} />
                    <NoteBlock
                      title="Experience calculations"
                      items={analysis?.experience_analysis?.experience_calculation_notes ?? []}
                    />
                  </>
                ) : (
                  <p>Run Deep Match to fill data quality notes and the submit recommendation.</p>
                )}
              </div>
            ) : null}
            {hasDeepMatch && deepQuestions.length ? (
              <div className="mt-4 space-y-3 border-t border-[#E5E7EB] pt-4">
                <p className="text-sm font-semibold text-[#101828]">Deeper analysis questions</p>
                <ol className="space-y-2">
                  {deepQuestions.map((item, index) => (
                    <li key={item.key} className="text-sm leading-6 text-[#344054]">
                      <span className="font-semibold text-[#101828]">{index + 1}. {item.question}</span>
                      {item.reason ? <span className="mt-1 block text-[#667085]">{item.reason}</span> : null}
                    </li>
                  ))}
                </ol>
                {data?.questionSetsStale?.deep ? (
                  <p className="text-xs text-[#B54708]">
                    Résumé, candidate, or job inputs changed. Re-run Deep Match to refresh these questions.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-5">
          <section className={CARD}>
            <SidebarSectionHeader title="Resume" />
            {resumes.length > 0 ? (
              <div className="mt-4 flex flex-col gap-2">
                {resumes.map((resume, index) => {
                  const isLatest = resumes.length > 1 && index === resumes.length - 1;
                  const isOptimized = isSubmissionResumeFileName(resume.fileName);
                  return (
                    <div
                      key={resume.id}
                      className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${
                        isOptimized
                          ? "border border-[color:var(--brand-primary)] bg-white"
                          : "border border-[#E5E7EB] bg-white"
                      }`}
                    >
                      <BrandedFileTypeIcon
                        type={resume.fileIconType ?? "pdf"}
                        className="mt-0.5 h-7 w-7 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => void viewResume(resume.id)}
                            className="block max-w-full truncate text-left text-sm font-semibold text-[color:var(--brand-primary)] hover:underline disabled:opacity-60"
                            title={`View ${resume.fileName}`}
                            aria-label={`View ${resume.fileName}`}
                          >
                            {resume.fileName}
                          </button>
                          {isOptimized ? (
                            <span className="shrink-0 rounded-md bg-[color:var(--brand-primary)] px-2 py-0.5 text-[11px] font-semibold text-white">
                              Optimized
                            </span>
                          ) : isLatest ? (
                            <span className="shrink-0 rounded-md bg-[color:var(--brand-secondary)] px-2 py-0.5 text-[11px] font-semibold text-white">
                              Latest
                            </span>
                          ) : null}
                        </div>
                        {resume.uploadedAtLabel || resume.uploadedAt ? (
                          <p className="mt-0.5 text-xs text-[#667085]">
                            Uploaded{" "}
                            {resume.uploadedAtLabel || formatWhen(resume.uploadedAt)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#E5E7EB] px-3 py-3">
                <BrandedFileTypeIcon type="pdf" className="h-7 w-7 shrink-0" />
                <span className="truncate text-sm font-medium text-[#344054]">
                  {data?.extractedResume?.fileName || "No resume uploaded"}
                </span>
              </div>
            )}
          </section>

          <section className={CARD}>
            <SidebarSectionHeader
              title="Extracted Resume"
              subtitle="Correct before analysis if needed."
            />
            <textarea
              value={extractedDraft}
              onChange={(event) => setExtractedDraft(event.target.value)}
              rows={12}
              className={`${AREA} mt-4 max-h-[280px] font-mono text-xs leading-5`}
            />
            <div className="mt-3">
              <button
                type="button"
                className={`${PRIMARY_BTN} w-auto`}
                disabled={savingText}
                onClick={() => void saveExtractedText()}
              >
                {savingText ? "Saving…" : "Save extracted text"}
              </button>
            </div>
          </section>

          <section className={CARD}>
            <div className="flex flex-col items-start text-left">
              <h3 className="text-base font-semibold" style={{ color: "var(--brand-secondary)" }}>Notes</h3>
              <p className="mt-1 text-xs text-[#64748B]">
                Recruiter notes and verified evidence for this workspace.
              </p>
            </div>
            
            <div className="mt-4 mb-5 space-y-3">
              <textarea
                value={verifiedDetails}
                onChange={(event) => {
                  setVerifiedCategory("note");
                  setVerifiedTitle("Note");
                  setVerifiedDetails(event.target.value);
                }}
                rows={3}
                className={AREA}
                placeholder="Add a note..."
              />
              <button
                type="button"
                className={`${PRIMARY_BTN} w-full`}
                disabled={savingVerified || !verifiedDetails.trim()}
                onClick={() => void addVerified()}
              >
                {savingVerified ? "Saving…" : "Add Note"}
              </button>
            </div>

            {noteFeedItems.length ? (
              <ul className="mt-4 space-y-3">
                {noteFeedItems.map((entry) =>
                  entry.kind === "verified" ? (
                    <VerifiedInformationItem key={`verified-${entry.id}`} item={entry.item} />
                  ) : entry.kind === "verification" ? (
                    <li
                      key={`verification-${entry.id}`}
                      className="rounded-lg border border-[#E5E7EB] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#344054]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3730A3]">
                          Requirement note
                        </span>
                      </div>
                      <p className="mt-1">{entry.note.noteBody}</p>
                    </li>
                  ) : (
                    <li
                      key={`note-${entry.id}`}
                      className="rounded-lg border border-[#E5E7EB] bg-[#FCFCFD] px-3 py-2.5 text-sm text-[#344054]"
                    >
                      <p>{entry.note.body}</p>
                      <p className="mt-1 text-xs text-[#94A3B8]">
                        {entry.note.author_name} · {formatWhen(entry.note.created_at)}
                      </p>
                    </li>
                  )
                )}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[#667085]">No notes or verified information yet.</p>
            )}
          </section>

          {/*
          <section className={CARD}>
            <SidebarSectionHeader
              title="Verified information"
              subtitle="Stored as recruiter-confirmed evidence."
            />
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#667085]">
                  Add new
                </p>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                    <Field label="Category">
                      <select
                        value={verifiedCategory}
                        onChange={(event) =>
                          setVerifiedCategory(event.target.value as VerifiedInfoCategory)
                        }
                        className={SELECT_FIELD}
                        style={{ backgroundImage: SELECT_CHEVRON }}
                      >
                        {VERIFIED_INFO_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {VERIFIED_INFO_CATEGORY_LABELS[category]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Title">
                      <input
                        value={verifiedTitle}
                        onChange={(event) => setVerifiedTitle(event.target.value)}
                        className={FIELD}
                        placeholder="License, certification, availability…"
                      />
                    </Field>
                  </div>
                  <Field label="Details">
                    <textarea
                      value={verifiedDetails}
                      onChange={(event) => setVerifiedDetails(event.target.value)}
                      rows={3}
                      className={AREA}
                      placeholder="Additional verified details…"
                    />
                  </Field>
                </div>
              </div>
            </div>
            <button
              type="button"
              className={`${PRIMARY_BTN} mt-4 w-full`}
              disabled={savingVerified}
              onClick={() => void addVerified()}
            >
              {savingVerified ? "Saving…" : "Add Verified Information"}
            </button>
          </section>
          */}

          <section className={CARD}>
            <SidebarSectionHeader title="Analysis history" />
            {analysisHistory.length ? (
              <ul className="mt-4 flex flex-col gap-2">
                {analysisHistory.map((item) => (
                  <AnalysisHistoryItem key={item.id} item={item} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[#667085]">No previous analysis versions.</p>
            )}
          </section>

          <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
            <button
              type="button"
              onClick={openResumeHistory}
              className={`${OUTLINE_BTN} w-full text-center`}
            >
              Update Resume
            </button>
            <button
              type="button"
              className={`${OUTLINE_BTN} w-full`}
              disabled={downloadingAssessment || !isAnalyzed}
              onClick={handleDownloadAssessment}
            >
              {downloadingAssessment ? "Downloading…" : "Download Assessment"}
            </button>
            <button
              type="button"
              className={`${OUTLINE_BTN} min-[400px]:col-span-2 w-full`}
              disabled={removingFromJob}
              onClick={openRemoveFromJobConfirm}
            >
              Remove from job
            </button>
          </div>
        </aside>
      </div>

      {/* Hidden file input for resume re-upload */}
      <input
        ref={resumeInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => void handleResumeFileSelected(e.target.files?.[0])}
      />
      <input
        ref={screeningUploadRef}
        type="file"
        accept=".pdf,.txt,.docx,.jpg,.jpeg,.png,.webp,.gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadScreeningReply(file);
          if (screeningUploadRef.current) screeningUploadRef.current.value = "";
        }}
      />

      <DeepMatchConfirmDialog
        open={confirmDeepOpen}
        modelLabel={formatMatchModelLabel(deepMatchModelForProvider(analysisProvider))}
        busy={analyzing}
        onCancel={() => setConfirmDeepOpen(false)}
        onConfirm={() => void confirmAndRunDeepMatch()}
      />

      <FollowUpConfirmDialog
        open={confirmFollowUpOpen}
        verifyCount={outcomeCounts.verify}
        busy={followUpAdvancing}
        onCancel={() => {
          if (followUpAdvancing) return;
          setConfirmFollowUpOpen(false);
        }}
        onConfirm={() => void advanceToFollowUp()}
      />

      <ResumeHistoryModal
        open={resumeHistoryOpen}
        jobTitle={jobTitle}
        resumes={resumeHistoryItems}
        loading={resumeHistoryLoading}
        error={resumeHistoryError}
        busyResumeId={resumeHistoryBusyId}
        reuploadBusy={resumeUploading}
        reuploadDisabled={false}
        reuploadDisabledReason={null}
        onClose={() => {
          if (resumeUploading || resumeHistoryBusyId) return;
          setResumeHistoryOpen(false);
        }}
        onReupload={beginReuploadResume}
        onView={viewResumeFromHistory}
        onDelete={deleteResumeFromHistory}
        onParse={parseResumeFromHistory}
      />

      <RemoveFromJobConfirmModal
        open={removeConfirmOpen}
        busy={removingFromJob}
        error={removeError}
        onCancel={() => {
          if (removingFromJob) return;
          setRemoveConfirmOpen(false);
          setRemoveError(null);
        }}
        onConfirm={() => void confirmRemoveFromJob()}
      />

      {workerId ? (
        <CandidateCommunicationDialog
          open={commOpen}
          onClose={() => {
            setCommOpen(false);
            setAskCandidateNote(null);
          }}
          workerId={workerId}
          candidateName={candidateName}
          email={info.email || null}
          phone={info.phone || null}
          initialChannel="email"
          onSent={() => {
            if (askCandidateNote) {
              void markNoteSentToCandidate(askCandidateNote);
            }
            toast.success("Request sent to candidate");
          }}
        />
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[#344054]">{label}</span>
      {children}
    </label>
  );
}

function NoteBlock({
  title,
  items,
  empty,
}: {
  title: string;
  items: readonly string[];
  empty?: string;
}) {
  return (
    <div>
      <h3 className="font-semibold text-[#101828]">{title}</h3>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2">{empty ?? "None."}</p>
      )}
    </div>
  );
}
