"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CalendarDays, ChevronDown, ChevronRight, Clock, Download, Info, Loader2, Mail, MapPin, Phone, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import BrandedFileTypeIcon from "@/app/admin_recruiter/components/BrandedFileTypeIcon";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import { CurrentStageCell } from "@/app/admin_recruiter/components/CurrentStageCell";
import {
  CANDIDATES_PAGE_TITLE_CLASS,
  CANDIDATES_PAGE_TITLE_STYLE,
} from "@/app/admin_recruiter/candidates/candidates-typography";
import { formatPhoneForDisplay } from "@/lib/admin/worker-profile-field-client";
import { applicationCurrentStageMeta } from "@/lib/jobs/application-status";
import { profileMatchRingColor } from "@/lib/jobs/match-analysis/display";
import { workTypeLabel } from "@/lib/admin/candidate-profile-view";
import { GroupedFilterOptions } from "@/app/admin_recruiter/components/GroupedStatusMenu";
import type {
  CandidateProfileActivity,
  CandidateProfilePayload,
  CandidateProfileResume,
} from "@/lib/admin/candidate-profile-view";
import { exportRowsAsCsv } from "@/lib/admin/export-list-download";
import { CandidateProfileDocumentsTab } from "./CandidateProfileDocumentsTab";
import {
  CANDIDATE_PROFILE_NAME_CLASS,
  CANDIDATE_PROFILE_NAME_STYLE,
  PROFILE_TABS,
  applicationReviewHref,
  formatProfileActivityRelativeTime,
  formatProfileApplicationDate,
  isCandidateProfileTabId,
  overallStatusBadgeClass,
  AI_CONFIDENCE_SCORE_TOOLTIP,
  profileAiAnalysisHref,
  profileCandidatesBackHref,
  profileStatusPillClass,
  resumeIconType,
  workTypeBadgeClass,
  DEFAULT_PROFILE_ACTIVITY_RANGE,
  PROFILE_ACTIVITY_RANGE_PRESETS,
  filterProfileActivityByRange,
  isProfileActivityRangeId,
  profileActivityInitial,
  splitProfessionalSummaryBlocks,
  type CandidateProfileTabId,
  type ProfileActivityRangeId,
} from "./candidate-profile-ui";
import { fetchStaffDetailJson, candidateProfileApiUrl } from "@/lib/admin/staff-detail-fetch-cache";
import { adminWorkerResumePreviewHref } from "@/lib/resume/worker-resume-file-name";
import {
  CandidatesBreadcrumb,
  JobsBreadcrumb,
  jobCandidatesHrefForJob,
} from "@/app/admin_recruiter/jobs/JobsBreadcrumb";

const CARD_CLASS = "rounded-xl border border-[#E5E7EB] bg-white";
const PAGE_SHELL_CLASS = "box-border w-full min-w-0 max-w-full overflow-x-hidden px-3 pb-10 pt-4 sm:px-5 sm:pt-5 lg:px-8";
const FILTER_SELECT_CLASS =
  "h-11 w-full min-w-0 cursor-pointer appearance-none rounded-lg border border-[#E5E7EB] bg-white py-2 pl-3 pr-9 text-sm font-medium text-[#374151] outline-none transition hover:bg-[#F9FAFB] focus:border-[color:var(--brand-primary)] sm:h-10 sm:w-auto sm:min-w-[148px]";

function MatchRing({ score }: { score: number }) {
  const size = 88;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);
  const strokeColor = profileMatchRingColor(clamped);

  return (
    <div className="relative h-[88px] w-[88px] shrink-0" aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-lg font-bold"
        style={{ color: strokeColor }}
      >
        {clamped}%
      </span>
    </div>
  );
}

const ACTIVITY_DATE_INPUT_CLASS =
  "h-11 w-full min-w-0 cursor-pointer rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-[#374151] outline-none transition hover:bg-[#F9FAFB] focus:border-[color:var(--brand-primary)] sm:h-10 sm:w-44 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:rounded-sm";

function ActivityAvatar({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initial = profileActivityInitial(name);
  const showPhoto = Boolean(photoUrl?.trim()) && !imageFailed;

  return (
    <span
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--brand-primary)] text-sm font-semibold text-white"
      aria-hidden={!showPhoto}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl ?? ""}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        initial
      )}
    </span>
  );
}

function ProfileActivityFeed({
  items,
  actorName,
  photoUrl,
}: {
  items: CandidateProfileActivity[];
  actorName: string;
  photoUrl: string | null;
}) {
  const [rangeId, setRangeId] = useState<ProfileActivityRangeId>(DEFAULT_PROFILE_ACTIVITY_RANGE);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const filtered = useMemo(
    () => filterProfileActivityByRange(items, rangeId, new Date(), customFrom, customTo),
    [items, rangeId, customFrom, customTo]
  );
  const customIncomplete = rangeId === "custom" && (!customFrom || !customTo);

  return (
    <section className={`${CARD_CLASS} mt-5 overflow-hidden`}>
      <div className="flex flex-col gap-4 border-b border-[#E5E7EB] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <h2 className="text-lg font-semibold text-[color:var(--brand-secondary)]">Activity</h2>
        <label className="relative block w-full min-w-0 cursor-pointer sm:w-auto">
          <span className="sr-only">Filter activity by date range</span>
          <select
            className={`${FILTER_SELECT_CLASS} w-full min-w-[180px]`}
            value={rangeId}
            onChange={(event) => {
              const next = event.target.value;
              if (isProfileActivityRangeId(next)) setRangeId(next);
            }}
          >
            {PROFILE_ACTIVITY_RANGE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
        </label>
      </div>

      {rangeId === "custom" ? (
        <div className="grid grid-cols-1 items-end gap-3 border-b border-[#E5E7EB] px-4 py-4 sm:flex sm:flex-wrap sm:px-5">
          <label className="w-full min-w-0 cursor-pointer sm:w-44">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">
              From
            </span>
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(event) => setCustomFrom(event.target.value)}
              className={ACTIVITY_DATE_INPUT_CLASS}
            />
          </label>
          <label className="w-full min-w-0 cursor-pointer sm:w-44">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#64748B]">
              To
            </span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(event) => setCustomTo(event.target.value)}
              className={ACTIVITY_DATE_INPUT_CLASS}
            />
          </label>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <Clock className="mx-auto h-8 w-8 text-[#CBD5E1]" aria-hidden />
          <p className="mt-3 text-sm font-medium text-[#334155]">No activity yet</p>
          <p className="mt-1 text-sm text-[#64748B]">
            Profile views, applications, and notes will show up here.
          </p>
        </div>
      ) : customIncomplete ? (
        <div className="px-5 py-12 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-[#CBD5E1]" aria-hidden />
          <p className="mt-3 text-sm font-medium text-[#334155]">Pick a date range</p>
          <p className="mt-1 text-sm text-[#64748B]">
            Select both dates to see activity between those days.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <CalendarDays className="mx-auto h-8 w-8 text-[#CBD5E1]" aria-hidden />
          <p className="mt-3 text-sm font-medium text-[#334155]">No activity in this range</p>
          <p className="mt-1 text-sm text-[#64748B]">
            Try a wider window, or choose specific dates.
          </p>
        </div>
      ) : (
        <ul>
          {filtered.map((item) => {
            const description = item.detail?.trim() ? `${item.title} · ${item.detail}` : item.title;
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 border-b border-[#EEF2F6] px-4 py-3.5 last:border-b-0 sm:gap-4 sm:px-5"
              >
                <ActivityAvatar name={actorName} photoUrl={photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-5 text-[color:var(--brand-secondary)]">
                    {actorName}
                  </p>
                  <p className="mt-0.5 truncate text-sm leading-5 text-[#64748B]" title={description}>
                    {description}
                  </p>
                </div>
                <time
                  dateTime={item.at}
                  className="shrink-0 text-xs font-medium text-[#94A3B8] sm:text-sm"
                >
                  {formatProfileActivityRelativeTime(item.at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ProfessionalSummaryContact({
  icon: Icon,
  children,
}: {
  icon: typeof Mail;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-sm text-[#475569]">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand-primary)]" aria-hidden />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function ProfessionalSummaryCard({ text }: { text: string }) {
  const blocks = useMemo(() => splitProfessionalSummaryBlocks(text), [text]);

  return (
    <section className={`${CARD_CLASS} mt-5 overflow-hidden`}>
      <div className="border-b border-[#E5E7EB] px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold text-[color:var(--brand-secondary)]">
          Professional Summary
        </h2>
      </div>
      {text.trim() ? (
        <div className="max-h-[36rem] overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-5">
          <div className="flex flex-col">
            {blocks.map((block, index) => {
              const key = `${block.kind}-${index}`;
              if (block.kind === "name") {
                return (
                  <p
                    key={key}
                    className="break-words text-lg font-semibold leading-7 text-[color:var(--brand-secondary)] sm:text-xl"
                  >
                    {block.text}
                  </p>
                );
              }
              if (block.kind === "location") {
                return (
                  <div key={key} className="mt-2">
                    <ProfessionalSummaryContact icon={MapPin}>{block.text}</ProfessionalSummaryContact>
                  </div>
                );
              }
              if (block.kind === "email") {
                return (
                  <div key={key} className="mt-1.5">
                    <ProfessionalSummaryContact icon={Mail}>
                      <a
                        href={`mailto:${block.text}`}
                        className="break-all text-[color:var(--brand-secondary)] underline-offset-2 hover:underline"
                      >
                        {block.text}
                      </a>
                    </ProfessionalSummaryContact>
                  </div>
                );
              }
              if (block.kind === "phone") {
                const tel = block.text.replace(/[^\d+]/g, "");
                return (
                  <div key={key} className="mt-1.5">
                    <ProfessionalSummaryContact icon={Phone}>
                      <a
                        href={`tel:${tel}`}
                        className="text-[color:var(--brand-secondary)] underline-offset-2 hover:underline"
                      >
                        {block.text}
                      </a>
                    </ProfessionalSummaryContact>
                  </div>
                );
              }
              if (block.kind === "heading") {
                return (
                  <h3
                    key={key}
                    className="mt-6 break-words border-b border-[#EEF2F7] pb-1.5 text-base font-semibold tracking-wide text-[color:var(--brand-secondary)] first:mt-0"
                  >
                    {block.text}
                  </h3>
                );
              }
              if (block.kind === "jobTitle") {
                return (
                  <p key={key} className="mt-4 break-words text-[15px] font-semibold leading-6 text-[#0F172A]">
                    {block.text}
                  </p>
                );
              }
              if (block.kind === "company") {
                return (
                  <p key={key} className="mt-0.5 break-words text-sm font-medium text-[#334155]">
                    {block.text}
                  </p>
                );
              }
              if (block.kind === "date") {
                return (
                  <div key={key} className="mt-0.5 flex items-center gap-1.5 text-xs text-[#64748B]">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{block.text}</span>
                  </div>
                );
              }
              if (block.kind === "tag") {
                return (
                  <span
                    key={key}
                    className="mt-4 inline-flex w-fit rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-medium text-[#475569]"
                  >
                    {block.text}
                  </span>
                );
              }
              return (
                <p key={key} className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-[#475569]">
                  {block.text}
                </p>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="px-4 py-12 text-center text-sm text-[#64748B] sm:px-5">
          No professional summary yet. Upload and parse a résumé on the Documents tab.
        </p>
      )}
    </section>
  );
}

function SummaryDonut({
  slices,
  emptyLabel,
}: {
  slices: Array<{ key: string; label: string; count: number; color: string }>;
  emptyLabel: string;
}) {
  const data = slices.filter((slice) => slice.count > 0);
  if (data.length === 0) {
    return <p className="py-8 text-sm text-[#64748B]">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="h-[140px] w-[140px] shrink-0 cursor-pointer [&_.recharts-wrapper]:cursor-pointer [&_.recharts-surface]:outline-none [&_.recharts-sector]:cursor-pointer [&_.recharts-sector]:outline-none [&_path]:cursor-pointer [&_path]:outline-none [&_*:focus]:outline-none">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart style={{ outline: "none", cursor: "pointer" }}>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={2}
              stroke="#FFFFFF"
              strokeWidth={2}
              style={{ outline: "none", cursor: "pointer" }}
            >
              {data.map((slice) => (
                <Cell
                  key={slice.key}
                  fill={slice.color}
                  style={{ outline: "none", cursor: "pointer" }}
                  stroke="none"
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [`${value}`, String(name)]}
              contentStyle={{ borderRadius: 8, borderColor: "#E5E7EB", fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {data.map((slice) => (
          <li key={slice.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-[#374151]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
              <span className="truncate">{slice.label}</span>
            </span>
            <span className="shrink-0 font-semibold text-[#0F172A]">{slice.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CandidateProfileClient({ workerId }: { workerId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const jobId = searchParams.get("jobId");
  const tabParam = searchParams.get("tab");
  const activeTab: CandidateProfileTabId = isCandidateProfileTabId(tabParam)
    ? tabParam
    : "applications";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CandidateProfilePayload | null>(null);
  const [workTypeFilter, setWorkTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const loadedWorkerIdRef = useRef<string | null>(null);

  const backHref = profileCandidatesBackHref({ from, jobId, workerId });
  const fromJobCandidates = from === "applications";
  const profileBreadcrumb = fromJobCandidates ? (
    <JobsBreadcrumb page="applicant" jobCandidatesHref={jobCandidatesHrefForJob(jobId)} />
  ) : (
    <CandidatesBreadcrumb
      currentLabel="Applicant"
      backHref={backHref}
      backLabel={from === "messages" ? "Messages" : "Candidates"}
    />
  );

  const load = useCallback(async () => {
    const id = workerId.trim();
    if (!id) {
      setError("Missing candidate.");
      setLoading(false);
      return;
    }
    const silent = loadedWorkerIdRef.current === id;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { ok, payload } = await fetchStaffDetailJson<CandidateProfilePayload & { error?: string }>(
        candidateProfileApiUrl(id)
      );
      if (!ok) throw new Error(payload.error || "Failed to load candidate profile");
      setProfile(payload);
      loadedWorkerIdRef.current = id;
    } catch (err) {
      if (!silent) setProfile(null);
      setError(err instanceof Error ? err.message : "Failed to load candidate profile");
    } finally {
      setLoading(false);
    }
  }, [workerId]);

  useEffect(() => {
    void load();
  }, [load]);

  function setTab(tab: CandidateProfileTabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const applications = profile?.applications ?? [];
  const workTypeOptions = useMemo(() => {
    return Array.from(new Set(applications.map((row) => row.workType.trim()).filter(Boolean))).sort();
  }, [applications]);
  const statusOptions = useMemo(() => {
    const seen = new Map<
      string,
      {
        value: string;
        label: string;
        groupName: string | null;
        groupDescription: string | null;
        groupSortOrder: number | null;
      }
    >();
    for (const row of applications) {
      const label = row.statusName.trim() || row.status;
      if (!label || seen.has(label)) continue;
      seen.set(label, {
        value: label,
        label,
        groupName: row.statusGroupName ?? null,
        groupDescription: row.statusGroupDescription ?? null,
        groupSortOrder: row.statusGroupSortOrder ?? null,
      });
    }
    return [...seen.values()];
  }, [applications]);
  const filteredApplications = useMemo(() => {
    return applications.filter((row) => {
      if (workTypeFilter !== "all" && row.workType !== workTypeFilter) return false;
      if (statusFilter !== "all") {
        const label = row.statusName.trim() || row.status;
        if (label !== statusFilter) return false;
      }
      return true;
    });
  }, [applications, statusFilter, workTypeFilter]);

  function openResume(applicationId: string, resume: CandidateProfileResume) {
    window.open(
      adminWorkerResumePreviewHref({
        workerId,
        resumeId: resume.id,
        // A fallback résumé is bound to another application; the preview route rejects a mismatch.
        applicationId: resume.jobApplicationId?.trim() || applicationId,
      }),
      "_blank",
      "noopener,noreferrer"
    );
  }

  function exportApplications() {
    exportRowsAsCsv(
      filteredApplications,
      [
        { header: "Job Title", value: (row) => row.jobTitle },
        { header: "Company", value: (row) => row.companyName },
        { header: "Work Type", value: (row) => row.workType },
        { header: "Application Date", value: (row) => formatProfileApplicationDate(row.appliedAt).absolute },
        { header: "Current Stage", value: (row) => applicationCurrentStageMeta(row.status, row.statusName).label },
        { header: "Status", value: (row) => row.statusName },
        { header: "Resume", value: (row) => row.resume?.fileName || "" },
      ],
      `${profile?.candidate.name || "candidate"}-applications.csv`
    );
  }

  if (loading) {
    return (
      <div className={PAGE_SHELL_CLASS}>
        <div className={`${CARD_CLASS} flex items-center gap-2 px-4 py-8 text-sm text-[#64748B]`}>
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading candidate profile…
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className={PAGE_SHELL_CLASS}>
        {profileBreadcrumb}
        <h1 className={`${CANDIDATES_PAGE_TITLE_CLASS} mt-0`} style={CANDIDATES_PAGE_TITLE_STYLE}>
          Candidate Profile
        </h1>
        <p className={`${CARD_CLASS} mt-4 px-4 py-6 text-sm text-[#667085]`}>
          {error || "This candidate profile could not be found."}
        </p>
      </div>
    );
  }

  const { candidate, stats, match } = profile;
  const aiHref = profileAiAnalysisHref({
    workerId: candidate.id,
    applicationId: match?.applicationId,
    jobId: match?.jobRequisitionId || jobId,
  });

  return (
    <div className={PAGE_SHELL_CLASS}>
      {profileBreadcrumb}

      <section className={`${CARD_CLASS} p-4 sm:p-6`}>
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className={`${CANDIDATE_PROFILE_NAME_CLASS} break-words`} style={CANDIDATE_PROFILE_NAME_STYLE}>
                {candidate.name}
              </h1>
              {candidate.isActiveApplicant ? (
                <span className="inline-flex items-center rounded-full bg-[#DCFCE7] px-2.5 py-1 text-xs font-semibold text-[#15803D]">
                  Active Applicant
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-[#475569]">
                  {candidate.statusLabel}
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-2 text-sm text-[#475569] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
              <span className="inline-flex min-w-0 items-start gap-2">
                <BrandedSvgIcon
                  src="/icons/admin-recruiter/alternate_email.svg"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  color="var(--brand-primary)"
                />
                <span className="min-w-0 break-all">{candidate.email || "—"}</span>
              </span>
              <span className="inline-flex min-w-0 items-start gap-2">
                <BrandedSvgIcon
                  src="/icons/admin-recruiter/phone.svg"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  color="var(--brand-primary)"
                />
                <span className="min-w-0 break-words">
                  {candidate.phone ? formatPhoneForDisplay(candidate.phone) : "—"}
                </span>
              </span>
              <span className="inline-flex min-w-0 items-start gap-2">
                <BrandedSvgIcon
                  src="/icons/admin-recruiter/location-marker.svg"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  color="var(--brand-primary)"
                />
                <span className="min-w-0 break-words">{candidate.location || "—"}</span>
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[#EEF2F6] pt-4 sm:grid-cols-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#94A3B8]">Total Applications</p>
                <p className="mt-1 text-xl font-semibold text-[#0F172A]">{stats.totalApplications}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#94A3B8]">W-2 Applications</p>
                <p className="mt-1 text-xl font-semibold text-[#0F172A]">{stats.w2Applications}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#94A3B8]">1099 Applications</p>
                <p className="mt-1 text-xl font-semibold text-[#0F172A]">
                  {stats.contractor1099Applications}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#94A3B8]">Status</p>
                <span
                  className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-sm font-semibold ${overallStatusBadgeClass(stats.overallStatus)}`}
                >
                  {stats.overallStatus}
                </span>
              </div>
            </div>
          </div>

          <aside className="w-full min-w-0 shrink-0 rounded-xl border border-[#E5E7EB] bg-[#F8FAFC] p-4 xl:max-w-[280px]">
            <div className="flex items-center gap-4">
              {match ? (
                <MatchRing score={match.score} />
              ) : (
                <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-sm font-semibold text-[#94A3B8]">
                  —
                </div>
              )}
              <div className="min-w-0">
                <p className="break-words text-base font-semibold text-[#012352]">{match?.label || "Not analyzed"}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#64748B]">
                  AI Confidence Score
                  <span className="relative inline-flex">
                    <button
                      type="button"
                      className="peer inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#94A3B8] transition hover:text-[#64748B] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#94A3B8] sm:h-5 sm:w-5"
                      aria-label="About AI Confidence Score"
                      aria-describedby="ai-confidence-score-tooltip"
                    >
                      <Info className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <span
                      id="ai-confidence-score-tooltip"
                      role="tooltip"
                      className="pointer-events-none absolute left-0 top-[calc(100%+8px)] z-30 hidden w-[min(18rem,calc(100vw-3rem))] whitespace-normal rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-left text-xs font-normal leading-4 text-[#475569] shadow-lg peer-hover:block peer-focus:block peer-focus-visible:block sm:left-auto sm:right-0"
                    >
                      {AI_CONFIDENCE_SCORE_TOOLTIP}
                    </span>
                  </span>
                </p>
              </div>
            </div>
            <Link
              href={aiHref}
              className="mt-4 inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm font-medium text-[#334155] transition hover:bg-white/80"
            >
              View AI Analysis Overview
            </Link>
          </aside>
        </div>
      </section>

      <div className="-mx-3 mt-5 px-3 sm:mx-0 sm:px-0">
        <nav
          className="flex gap-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Candidate profile tabs"
        >
          {PROFILE_TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`relative min-h-11 shrink-0 cursor-pointer px-3 py-3 text-sm font-medium transition sm:px-4 ${
                  selected
                    ? "text-[color:var(--brand-primary)]"
                    : "text-[#64748B] hover:text-[#0F172A]"
                }`}
                aria-current={selected ? "page" : undefined}
              >
                {tab.label}
                {selected ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[color:var(--brand-primary)]" />
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "overview" ? (
        <ProfessionalSummaryCard text={profile.professionalSummary ?? ""} />
      ) : null}

      {activeTab === "applications" ? (
        <>
          <section className={`${CARD_CLASS} mt-5 overflow-hidden`}>
            <div className="flex flex-col gap-4 border-b border-[#E5E7EB] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div>
                <h2 className="text-lg font-semibold text-[#0F172A]">All Job Applications</h2>
                <p className="mt-1 text-sm text-[#64748B]">
                  This candidate applied to multiple jobs for different work types.
                </p>
              </div>
              <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <label className="relative block w-full min-w-0 cursor-pointer sm:w-auto">
                  <span className="sr-only">Filter by work type</span>
                  <select
                    className={FILTER_SELECT_CLASS}
                    value={workTypeFilter}
                    onChange={(event) => setWorkTypeFilter(event.target.value)}
                  >
                    <option value="all">All Work Types</option>
                    {workTypeOptions.map((type) => (
                      <option key={type} value={type}>
                        {workTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                </label>
                <label className="relative block w-full min-w-0 cursor-pointer sm:w-auto">
                  <span className="sr-only">Filter by status</span>
                  <select
                    className={FILTER_SELECT_CLASS}
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  >
                    <option value="all">All Status</option>
                    <GroupedFilterOptions options={statusOptions} />
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                </label>
                <button
                  type="button"
                  onClick={exportApplications}
                  disabled={filteredApplications.length === 0}
                  className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 text-sm font-medium text-[#374151] transition hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-auto"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
              </div>
            </div>

            {filteredApplications.length === 0 ? (
              <p className="px-5 py-10 text-sm text-[#64748B]">
                {applications.length === 0
                  ? "This candidate has not applied to any jobs yet."
                  : "No applications match these filters."}
              </p>
            ) : (
              <div className="overflow-x-auto overscroll-x-contain">
                <table className="min-w-[960px] w-full text-left">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] text-sm font-medium text-[#64748B]">
                      <th className="px-5 py-3 font-medium">Job Title</th>
                      <th className="px-4 py-3 font-medium">Work Type</th>
                      <th className="px-4 py-3 font-medium">Application Date</th>
                      <th className="px-4 py-3 font-medium">Current Stage</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Resume</th>
                      <th className="px-5 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApplications.map((row) => {
                      const applied = formatProfileApplicationDate(row.appliedAt);
                      const stage = applicationCurrentStageMeta(row.status, row.statusName);
                      return (
                        <tr key={row.id} className="border-b border-[#F1F5F9] last:border-b-0">
                          <td className="px-5 py-4 align-top">
                            <div className="min-w-0">
                              <Link
                                href={applicationReviewHref(row.id, row.jobRequisitionId)}
                                className="block truncate text-sm font-semibold leading-5 text-[color:var(--brand-primary)] hover:underline"
                              >
                                {row.jobTitle}
                              </Link>
                              <p className="mt-0.5 truncate text-xs leading-4 text-[#64748B]">
                                {row.companyName}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            {row.workType ? (
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${workTypeBadgeClass(row.workType)}`}
                              >
                                {workTypeLabel(row.workType)}
                              </span>
                            ) : (
                              <span className="text-sm text-[#94A3B8]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-4 align-top">
                            <p className="text-sm font-medium leading-5 text-[#0F172A]">{applied.relative}</p>
                            {applied.absolute && applied.absolute !== applied.relative ? (
                              <p className="mt-0.5 text-xs leading-4 text-[#64748B]">{applied.absolute}</p>
                            ) : null}
                          </td>
                          <td className="min-w-[160px] max-w-[220px] px-4 py-4 align-top">
                            <CurrentStageCell
                              label={stage.label}
                              note={row.statusNote?.trim() || stage.subtitle}
                              progress={stage.progress}
                              barColor={stage.barColor}
                            />
                          </td>
                          <td className="px-4 py-4 align-top">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${profileStatusPillClass(row.status)}`}
                              style={
                                row.statusColor
                                  ? {
                                      backgroundColor: `color-mix(in srgb, ${row.statusColor} 16%, white)`,
                                      color: row.statusColor,
                                    }
                                  : undefined
                              }
                            >
                              {row.statusName}
                            </span>
                          </td>
                          <td className="px-4 py-4 align-top">
                            {row.resume ? (
                              <button
                                type="button"
                                onClick={() => void openResume(row.id, row.resume!)}
                                className="flex min-w-0 cursor-pointer items-start gap-2 text-left"
                              >
                                <BrandedFileTypeIcon
                                  type={resumeIconType(row.resume.fileName, row.resume.fileType)}
                                  className="mt-0.5 h-8 w-8 shrink-0"
                                />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium leading-5 text-[color:var(--brand-primary)]">
                                    {row.resume.fileName}
                                  </span>
                                  <span className="mt-0.5 block text-xs leading-4 text-[#64748B]">
                                    {row.resume.fileSizeLabel}
                                  </span>
                                </span>
                              </button>
                            ) : (
                              <span className="text-sm text-[#94A3B8]">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 align-top">
                            <Link
                              href={applicationReviewHref(row.id, row.jobRequisitionId)}
                              className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-[color:var(--brand-primary)] hover:underline"
                            >
                              View Details
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <section className={`${CARD_CLASS} p-4 sm:p-5`}>
              <h3 className="text-base font-semibold text-[#0F172A]">Work Type Summary</h3>
              <div className="mt-3">
                <SummaryDonut
                  slices={profile.workTypeSummary}
                  emptyLabel="No work type data yet."
                />
              </div>
            </section>
            <section className={`${CARD_CLASS} p-4 sm:p-5`}>
              <h3 className="text-base font-semibold text-[#0F172A]">Application Status Summary</h3>
              <div className="mt-3">
                <SummaryDonut
                  slices={profile.statusSummary}
                  emptyLabel="No application status data yet."
                />
              </div>
            </section>
            <section className="rounded-xl border border-[#F3E8D7] bg-[#FBF6EE] p-4 sm:p-5">
              <h3 className="inline-flex items-center gap-2 text-base font-semibold text-[#0F172A]">
                <Sparkles className="h-4 w-4 text-[#C4A574]" aria-hidden />
                Smart Insight
              </h3>
              <p className="mt-3 break-words text-sm leading-6 text-[#57534E]">{profile.smartInsight}</p>
              <Link
                href={aiHref}
                className="mt-4 inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg border border-[#E8D7B8] bg-transparent px-3 text-sm font-medium text-[#8B6914] transition hover:bg-white/50 sm:h-10 sm:w-auto"
              >
                View AI Analysis Overview
              </Link>
            </section>
          </div>
        </>
      ) : null}

      {activeTab === "documents" ? (
        <CandidateProfileDocumentsTab
          workerId={candidate.id}
          applications={applications}
          resumes={profile.resumes ?? []}
          documents={profile.documents}
          onReload={load}
        />
      ) : null}

      {activeTab === "activity" ? (
        <ProfileActivityFeed
          items={profile.activity}
          actorName={candidate.name}
          photoUrl={candidate.profilePhotoUrl}
        />
      ) : null}
    </div>
  );
}
