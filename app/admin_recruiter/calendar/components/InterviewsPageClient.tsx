"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import type { AdminInterviewItem } from "@/app/api/admin/applicant-appointments/route";
import { formatInterviewDate, formatInterviewTimeRange } from "@/lib/interviews/format";
import {
  EASTERN_TIME_ZONE,
  addEasternDays,
  easternHour,
  startOfEasternDay,
  startOfEasternWeek,
} from "@/lib/datetime/eastern";
import { localDateString } from "@/lib/interviews/schedule-fields";
import {
  InterviewDetailSidebar,
  InterviewListActionButtons,
} from "./InterviewDetailSidebar";
import { InterviewSuccessModal } from "./InterviewSuccessModal";
import { ScheduleInterviewModal } from "./ScheduleInterviewModal";
import {
  invitationRescheduleMessage,
  invitationSuccessMessage,
  type ScheduleInterviewPayload,
} from "@/lib/interviews/schedule-payload";

type TabId = "upcoming" | "recent";
type ViewMode = "list" | "calendar";

type ApplicantOption = {
  id: string;
  name: string;
  detail?: string;
  status: string;
};

const HOUR_LABELS = [
  "8:00 AM",
  "9:00 AM",
  "10:00 AM",
  "11:00 AM",
  "Noon",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
] as const;

/** Eastern wall-clock hour for each row (must stay in sync with HOUR_LABELS). */
const HOUR_SLOTS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

function startOfDay(date: Date): Date {
  return startOfEasternDay(date);
}

function addDays(date: Date, days: number): Date {
  return addEasternDays(date, days);
}

function getWeekStart(date: Date): Date {
  return startOfEasternWeek(date);
}

function isDateInWeek(date: Date, weekStart: Date): boolean {
  const day = startOfDay(date);
  const weekEnd = addDays(weekStart, 6);
  return day >= weekStart && day <= weekEnd;
}

function getDefaultCalendarAnchor(interviews: AdminInterviewItem[]): Date {
  const now = new Date();
  if (interviews.length === 0) return now;

  const weekStart = getWeekStart(now);
  const hasInterviewThisWeek = interviews.some((item) =>
    isDateInWeek(new Date(item.startsAt), weekStart)
  );

  if (hasInterviewThisWeek) return now;

  const earliest = [...interviews].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  )[0];
  return new Date(earliest.startsAt);
}

function interviewMatchesHourSlot(startsAt: string, slotHour: number): boolean {
  const start = new Date(startsAt);
  return easternHour(start) === slotHour;
}

function TabButton({
  active,
  count,
  label,
  loading,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium transition disabled:cursor-wait disabled:opacity-70 min-[850px]:justify-start min-[850px]:text-left ${
        active
          ? "border border-[color:var(--brand-primary,#bc8b41)] bg-white text-[color:var(--brand-primary,#bc8b41)]"
          : "border border-transparent text-[#1F2937] hover:bg-[#F8FAFC]"
      }`}
    >
      <span
        className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full p-0.5 text-[10px] font-semibold leading-none ${
          loading
            ? "animate-pulse bg-[#E5E7EB] text-transparent"
            : active
              ? "bg-[color:var(--brand-primary,#bc8b41)] text-white"
              : "bg-[#F4F4F4] text-[color:var(--brand-primary,#bc8b41)]"
        }`}
        aria-hidden
      >
        {count}
      </span>
      <span>{label}</span>
    </button>
  );
}

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#E5E7EB] ${className}`} aria-hidden />;
}

function InterviewsLoadingSkeleton({ viewMode, monthTitle }: { viewMode: ViewMode; monthTitle: string }) {
  if (viewMode === "calendar") {
    return (
      <div className="flex flex-1 flex-col" role="status" aria-live="polite" aria-busy="true" aria-label="Loading interviews">
        <div className="mb-4 flex flex-col gap-3 min-[850px]:flex-row min-[850px]:items-center min-[850px]:justify-between">
          <p className="text-base font-bold text-[#111827]">{monthTitle}</p>
          <div className="inline-flex items-center gap-2 self-start text-xs text-[#64748B]">
            <span className="font-medium text-[#111827]">Calendar View</span>
            <SkeletonBlock className="h-5 w-9 rounded-full" />
            <span>List View</span>
          </div>
        </div>
        <div className="-mx-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden min-[850px]:mx-0">
          <div className="min-w-[600px] overflow-hidden rounded-lg border border-[#E5E7EB] bg-white min-[850px]:min-w-0">
            <div
              className="grid border-b border-[#E5E7EB] bg-white [grid-template-columns:56px_repeat(7,minmax(76px,1fr))] min-[850px]:[grid-template-columns:93px_repeat(7,minmax(0,1fr))]"
            >
              <div className="border-r border-[#E5E7EB]" aria-hidden />
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center border-r border-[#E5E7EB] px-1.5 py-3 last:border-r-0 min-[850px]:px-2">
                  <SkeletonBlock className="h-3 w-6" />
                  <SkeletonBlock className="mt-1 h-6 w-8 rounded px-2 py-1" />
                  <SkeletonBlock className="mt-2 h-0.5 w-full" />
                </div>
              ))}
            </div>
            <div className="space-y-0">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="grid min-h-[56px] border-b border-[#E5E7EB] [grid-template-columns:56px_repeat(7,minmax(76px,1fr))] min-[850px]:[grid-template-columns:93px_repeat(7,minmax(0,1fr))]"
                >
                  <div className="border-r border-[#E5E7EB] px-2 py-4 min-[850px]:px-3">
                    <SkeletonBlock className="ml-auto h-3 w-10" />
                  </div>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <div key={j} className="border-r border-[#E5E7EB] p-1 last:border-r-0">
                      {i === 1 && j === 3 ? <SkeletonBlock className="h-10 w-full rounded" /> : null}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col" role="status" aria-live="polite" aria-busy="true" aria-label="Loading interviews">
      <div className="mb-4 flex flex-col gap-3 min-[850px]:flex-row min-[850px]:items-center min-[850px]:justify-between">
        <p className="text-sm font-semibold text-[#1F2937] min-[850px]:text-base">{monthTitle}</p>
        <div className="inline-flex items-center gap-2 self-start text-xs text-[#64748B]">
          <span>Calendar View</span>
          <SkeletonBlock className="h-5 w-8 rounded-full" />
          <span className="text-[#1F2937]">List View</span>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-b border-[#E5E7EB] last:border-b-0">
            <div className="flex items-center justify-between gap-3 border-b border-[#EEF2F6] bg-[#F8FAFC] px-4 py-2.5 min-[850px]:hidden">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="h-4 w-16" />
            </div>
            <div className="flex min-h-[72px] flex-col px-4 py-3 min-[850px]:hidden">
              <SkeletonBlock className="h-4 w-40" />
              <SkeletonBlock className="mt-2 h-3 w-56" />
            </div>
            <div className="hidden min-h-[96px] min-[850px]:flex">
              <div className="flex w-[120px] shrink-0 items-center justify-center border-r border-[#E5E7EB] px-2">
                <div className="flex flex-col items-center gap-1">
                  <SkeletonBlock className="h-3 w-8" />
                  <SkeletonBlock className="h-6 w-12 rounded px-2 py-1" />
                </div>
              </div>
              <div className="flex flex-1 items-center justify-between gap-4 px-6 py-4">
                <div className="flex flex-1 flex-col gap-2">
                  <SkeletonBlock className="h-4 w-52" />
                  <SkeletonBlock className="h-3 w-72" />
                </div>
                <SkeletonBlock className="h-4 w-24 shrink-0" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onSchedule }: { onSchedule: () => void }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-4 py-16 text-center">
      <h3 className="text-lg font-semibold text-black">No Interview found</h3>
      <p className="mt-3 text-sm text-[#6B7280]">Currently there are no interview scheduled</p>
      <p className="mt-1 text-sm text-[color:var(--brand-primary,#bc8b41)]">Learn more about interviews</p>
      <button
        type="button"
        onClick={onSchedule}
        className="mt-8 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
        style={{ backgroundColor: "var(--brand-primary, #bc8b41)" }}
      >
        <Plus className="h-4 w-4" />
        Schedule Interview
      </button>
    </div>
  );
}

function InterviewListView({
  interviews,
  onView,
  onReschedule,
}: {
  interviews: AdminInterviewItem[];
  onView: (interview: AdminInterviewItem) => void;
  onReschedule: (interview: AdminInterviewItem) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, AdminInterviewItem[]>();
    interviews.forEach((item) => {
      const key = formatInterviewDate(item.startsAt);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    });
    return Array.from(map.entries());
  }, [interviews]);

  return (
    <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
      {grouped.map(([dateLabel, items]) => (
        <div key={dateLabel}>
          {items.map((item) => {
            const dayLabel = dateLabel.split(" ")[0];
            const dateDisplay = new Date(item.startsAt).toLocaleDateString("en-US", { timeZone: "America/New_York", 
              month: "short",
              day: "numeric",
            });
            const timeLabel = formatInterviewTimeRange(item.startsAt, item.endsAt);

            return (
              <div key={item.id} className="border-b border-[#E5E7EB] last:border-b-0">
                <div className="min-[850px]:hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-[#EEF2F6] bg-[#F8FAFC] px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">{dayLabel}</p>
                      <p className="text-sm font-semibold text-[#1F2937]">{dateDisplay}</p>
                    </div>
                    <p className="shrink-0 text-xs font-semibold text-[#1F2937]">{timeLabel}</p>
                  </div>
                  <div className="flex items-start justify-between gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => onView(item)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-semibold text-[#1F2937]">{item.title}</p>
                      {item.description ? (
                        <p className="mt-1 text-xs leading-relaxed text-[#64748B]">{item.description}</p>
                      ) : null}
                    </button>
                    <InterviewListActionButtons
                      interview={item}
                      onView={onView}
                      onReschedule={onReschedule}
                    />
                  </div>
                </div>

                <div className="hidden min-h-[96px] min-[850px]:flex">
                  <div className="flex w-[120px] shrink-0 items-center justify-center border-r border-[#E5E7EB] bg-white px-2 text-center">
                    <div>
                      <p className="text-[10px] uppercase text-[#64748B]">{dayLabel}</p>
                      <p className="text-sm font-semibold text-[#1F2937]">{dateDisplay}</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-4 px-6 py-4">
                    <button
                      type="button"
                      onClick={() => onView(item)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-semibold text-[#1F2937]">{item.title}</p>
                      {item.description ? (
                        <p className="mt-1 text-xs text-[#64748B]">{item.description}</p>
                      ) : null}
                    </button>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="text-xs font-semibold text-[#1F2937]">{timeLabel}</p>
                      <InterviewListActionButtons
                        interview={item}
                        onView={onView}
                        onReschedule={onReschedule}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const CALENDAR_GRID_CLASS =
  "grid [grid-template-columns:56px_repeat(7,minmax(76px,1fr))] min-[850px]:[grid-template-columns:93px_repeat(7,minmax(0,1fr))]";

function InterviewCalendarView({
  interviews,
  anchorDate,
  onSelect,
}: {
  interviews: AdminInterviewItem[];
  anchorDate: Date;
  onSelect: (interview: AdminInterviewItem) => void;
}) {
  const weekStart = getWeekStart(anchorDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayKey = localDateString(new Date());
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayInWeek = weekDays.some((day) => localDateString(day) === todayKey);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AdminInterviewItem[]>();
    interviews.forEach((item) => {
      const key = localDateString(new Date(item.startsAt));
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    });
    return map;
  }, [interviews]);

  return (
    <div className="-mx-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden min-[850px]:mx-0">
      <div className="min-w-[600px] overflow-hidden rounded-lg border border-[#E5E7EB] bg-white min-[850px]:min-w-0">
        <div className={`${CALENDAR_GRID_CLASS} border-b border-[#E5E7EB] bg-white`}>
          <div className="border-r border-[#E5E7EB] bg-white" aria-hidden />
          {weekDays.map((day) => {
            const key = localDateString(day);
            const isToday = key === todayKey;
            const count = eventsByDay.get(key)?.length ?? 0;
            return (
              <div
                key={key}
                className="flex flex-col items-center border-r border-[#E5E7EB] px-1.5 py-3 last:border-r-0 min-[850px]:px-2"
              >
                <p className="text-[9px] font-medium uppercase tracking-wide text-[#64748B] min-[850px]:text-[10px]">
                  {day.toLocaleDateString("en-US", { timeZone: "America/New_York",  weekday: "short" })}
                </p>
                <span
                  className={`mt-1 inline-flex h-6 min-w-[24px] items-center justify-center rounded px-1.5 py-1 text-[11px] font-semibold leading-none min-[850px]:px-2 min-[850px]:text-xs ${
                    isToday
                      ? "bg-[color:var(--brand-primary,#bc8b41)] text-white"
                      : "text-[#1F2937]"
                  }`}
                >
                  {day.getDate()}
                </span>
                <span
                  className={`mt-2 block h-0.5 w-full rounded-full ${
                    isToday ? "bg-[color:var(--brand-primary,#bc8b41)]" : "bg-transparent"
                  }`}
                  aria-hidden
                />
                {count > 0 ? (
                  <p className="mt-1 text-[10px] font-semibold leading-none text-[color:var(--brand-primary,#bc8b41)]">
                    {count}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="relative max-h-[560px] overflow-y-auto">
          {HOUR_LABELS.map((label, index) => {
            const hour = HOUR_SLOTS[index];
            const rowMinutes = hour * 60;
            const showNowLine = todayInWeek && Math.abs(nowMinutes - rowMinutes) < 30;

            return (
              <div
                key={label}
                className={`relative min-h-[56px] border-b border-[#E5E7EB] bg-white ${CALENDAR_GRID_CLASS}`}
              >
                <div className="relative border-r border-[#E5E7EB] bg-white px-2 py-4 text-right text-[10px] text-[#64748B] min-[850px]:px-3 min-[850px]:text-[11px]">
                  {label}
                </div>
                {weekDays.map((day) => {
                  const key = localDateString(day);
                  const dayEvents = (eventsByDay.get(key) ?? []).filter((event) =>
                    interviewMatchesHourSlot(event.startsAt, hour)
                  );
                  return (
                    <div
                      key={`${label}-${key}`}
                      className="relative border-r border-[#E5E7EB] bg-white p-1 last:border-r-0 min-[850px]:p-1.5"
                    >
                      {dayEvents.map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => onSelect(event)}
                          className="mb-1 flex w-full cursor-pointer overflow-hidden rounded border border-[#E5E7EB] bg-[#F3F4F6] text-left transition hover:border-[color:var(--brand-primary,#bc8b41)] hover:bg-[color:color-mix(in_srgb,var(--brand-primary,#bc8b41)_8%,white)]"
                        >
                          <div className="min-w-0 flex-1 px-1.5 py-1.5 min-[850px]:px-2.5 min-[850px]:py-2">
                            <p className="truncate text-[10px] font-semibold text-[#111827] min-[850px]:text-xs">
                              {event.title}
                            </p>
                            <p className="mt-0.5 hidden truncate text-[10px] leading-snug text-[#6B7280] min-[850px]:block">
                              {event.description || `Interview with ${event.applicantName}`}
                            </p>
                          </div>
                          <div className="w-1 shrink-0 bg-[#012352]" aria-hidden />
                        </button>
                      ))}
                    </div>
                  );
                })}
                {showNowLine ? (
                  <div
                    className="pointer-events-none absolute z-10 flex items-center max-[849px]:left-[56px] min-[850px]:left-[93px]"
                    style={{ right: 0, top: "50%", transform: "translateY(-50%)" }}
                  >
                    <div className="h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-[color:var(--brand-primary,#bc8b41)]" />
                    <div className="h-px flex-1 bg-[color:var(--brand-primary,#bc8b41)]" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatInterviewWhen(startsAt: string): { date: string; time: string } {
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return { date: startsAt, time: "" };
  const date = d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const weekday = d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  });
  const time = d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return { date, time: `${weekday} ${time}` };
}

function InterviewStatusPill({ status }: { status: string }) {
  const norm = status.trim().toLowerCase();
  if (norm === "confirmed" || norm === "upcoming") {
    return (
      <span className="inline-flex items-center rounded-md bg-[#EBF5FF] px-3 py-1 text-xs font-semibold text-[#2563EB]">
        Confirmed
      </span>
    );
  }
  if (norm === "invite sent" || norm === "invited") {
    return (
      <span className="inline-flex items-center rounded-md bg-[#EEF2FF] px-3 py-1 text-xs font-semibold text-[#4F46E5]">
        Invite sent
      </span>
    );
  }
  if (norm === "walk-in" || norm === "walkin") {
    return (
      <span className="inline-flex items-center rounded-md bg-[#FEF3C7] px-3 py-1 text-xs font-semibold text-[#D97706]">
        Walk-in
      </span>
    );
  }
  if (norm === "completed") {
    return (
      <span className="inline-flex items-center rounded-md bg-[#DCFCE7] px-3 py-1 text-xs font-semibold text-[#16A34A]">
        Completed
      </span>
    );
  }
  if (norm === "cancelled") {
    return (
      <span className="inline-flex items-center rounded-md bg-[#FEE2E2] px-3 py-1 text-xs font-semibold text-[#DC2626]">
        Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 capitalize">
      {status}
    </span>
  );
}

type InterviewsPageClientProps = {
  /** When set, shows only this candidate's interviews and hides applicant dropdown in schedule modal. */
  workerId?: string;
  candidateName?: string;
  candidateStatus?: string;
  /** Renders without page header / outer card wrapper (for candidate Activities tab). */
  embedded?: boolean;
};

export default function InterviewsPageClient({
  workerId,
  candidateName,
  candidateStatus = "approved",
  embedded = false,
}: InterviewsPageClientProps = {}) {
  const [tab, setTab] = useState<TabId>("upcoming");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [interviews, setInterviews] = useState<AdminInterviewItem[]>([]);
  const [applicants, setApplicants] = useState<ApplicantOption[]>([]);
  const [counts, setCounts] = useState({ upcoming: 0, recent: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState("You have scheduled a new interview");
  const [invitationNotice, setInvitationNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [calendarWeekAnchor, setCalendarWeekAnchor] = useState<Date | null>(null);
  const [selectedInterview, setSelectedInterview] = useState<AdminInterviewItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null);
  const [rescheduleInitial, setRescheduleInitial] = useState<ScheduleInterviewPayload | null>(null);

  const loadInterviews = useCallback(async (activeTab: TabId) => {
    setLoading(true);
    setError(null);
    try {
      if (workerId) {
        const [upcomingRes, recentRes] = await Promise.all([
          fetch("/api/admin/applicant-appointments?tab=upcoming", { credentials: "include" }),
          fetch("/api/admin/applicant-appointments?tab=recent", { credentials: "include" }),
        ]);
        const upcomingData = (await upcomingRes.json().catch(() => ({}))) as {
          error?: string;
          interviews?: AdminInterviewItem[];
          applicants?: ApplicantOption[];
        };
        const recentData = (await recentRes.json().catch(() => ({}))) as {
          error?: string;
          interviews?: AdminInterviewItem[];
        };
        if (!upcomingRes.ok) {
          throw new Error(upcomingData.error || "Failed to load upcoming interviews");
        }
        if (!recentRes.ok) {
          throw new Error(recentData.error || "Failed to load recent interviews");
        }
        const upcoming = (upcomingData.interviews ?? []).filter((item) => item.workerId === workerId);
        const recent = (recentData.interviews ?? []).filter((item) => item.workerId === workerId);
        setCounts({ upcoming: upcoming.length, recent: recent.length });
        setInterviews(activeTab === "upcoming" ? upcoming : recent);
        if (!embedded) setApplicants(upcomingData.applicants ?? []);
        return;
      }

      const res = await fetch(`/api/admin/applicant-appointments?tab=${activeTab}`, {
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        interviews?: AdminInterviewItem[];
        applicants?: ApplicantOption[];
        counts?: { upcoming: number; recent: number };
      };
      if (!res.ok) throw new Error(data.error || "Failed to load interviews");
      setInterviews(data.interviews ?? []);
      setApplicants(data.applicants ?? []);
      setCounts(data.counts ?? { upcoming: 0, recent: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interviews");
      setInterviews([]);
    } finally {
      setLoading(false);
    }
  }, [workerId, embedded]);

  useEffect(() => {
    void loadInterviews(tab);
  }, [tab, loadInterviews]);

  useEffect(() => {
    setCalendarWeekAnchor(getDefaultCalendarAnchor(interviews));
  }, [interviews]);

  const anchorDate = calendarWeekAnchor ?? new Date();

  function shiftCalendarWeek(deltaDays: number) {
    setCalendarWeekAnchor((prev) => addDays(prev ?? new Date(), deltaDays));
  }

  function openInterviewDetail(interview: AdminInterviewItem) {
    setSelectedInterview(interview);
    setDetailOpen(true);
  }

  function closeInterviewDetail() {
    setDetailOpen(false);
    setSelectedInterview(null);
  }

  function interviewToSchedulePayload(interview: AdminInterviewItem): ScheduleInterviewPayload {
    return {
      workerId: interview.workerId,
      applicationId: interview.applicationId,
      jobId: interview.jobId,
      startsAt: interview.startsAt,
      endsAt: interview.endsAt || interview.startsAt,
      timezone: EASTERN_TIME_ZONE,
      title: interview.title,
      meetingType: interview.meetingType || "online",
      meetingLink: interview.meetingLink,
      location: interview.location,
      notes: interview.notes,
      candidateNotes: null,
      interviewers: interview.interviewers.map((item) => ({
        userId: item.userId,
        email: item.email,
        name: item.name,
      })),
    };
  }

  function openReschedule(interview: AdminInterviewItem) {
    setSelectedInterview(interview);
    setDetailOpen(false);
    setEditingInterviewId(interview.id);
    setRescheduleInitial(interviewToSchedulePayload(interview));
    setScheduleError(null);
    setInvitationNotice(null);
    setScheduleOpen(true);
  }

  function openCreateSchedule() {
    setEditingInterviewId(null);
    setRescheduleInitial(null);
    setScheduleError(null);
    setInvitationNotice(null);
    setScheduleOpen(true);
  }

  async function handleSchedule(payload: ScheduleInterviewPayload) {
    setSubmitting(true);
    setScheduleError(null);
    try {
      const isEdit = Boolean(editingInterviewId);
      const res = await fetch(
        isEdit
          ? `/api/admin/applicant-appointments/${encodeURIComponent(editingInterviewId as string)}`
          : "/api/admin/applicant-appointments",
        {
          method: isEdit ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        invitation?: {
          sentCount: number;
          failedCount: number;
          skippedCount: number;
          invitationStatus: "sent" | "partial" | "failed" | "pending";
        };
      };
      if (!res.ok) {
        throw new Error(data.error || (isEdit ? "Failed to reschedule interview" : "Failed to schedule interview"));
      }
      const invitationStatus = data.invitation?.invitationStatus;
      const message = isEdit
        ? invitationRescheduleMessage(data.invitation)
        : invitationSuccessMessage(data.invitation);
      setScheduleOpen(false);
      setEditingInterviewId(null);
      setRescheduleInitial(null);
      setScheduleError(null);
      setTab("upcoming");
      await loadInterviews("upcoming");
      if (invitationStatus === "partial" || invitationStatus === "failed") {
        setInvitationNotice(message);
        setSuccessOpen(false);
      } else {
        setInvitationNotice(null);
        setSuccessMessage(message);
        setSuccessOpen(true);
      }
    } catch (err) {
      setScheduleError(
        err instanceof Error
          ? err.message
          : editingInterviewId
            ? "Failed to reschedule interview"
            : "Failed to schedule interview"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const hasInterviews = interviews.length > 0;
  const monthTitle = anchorDate.toLocaleDateString("en-US", { timeZone: "America/New_York",  month: "long", year: "numeric" });

  const modalApplicants = useMemo(() => {
    if (workerId && candidateName) {
      return [{ id: workerId, name: candidateName, status: candidateStatus }];
    }
    return applicants;
  }, [workerId, candidateName, candidateStatus, applicants]);

  const panel = (
    <div
      className={`flex flex-col overflow-hidden min-[850px]:flex-row ${
        embedded ? "min-h-[520px]" : "min-h-[640px] rounded-xl border border-[#E5E7EB]"
      }`}
    >
      <aside className="shrink-0 border-b border-[#E5E7EB] p-3 min-[850px]:w-[234px] min-[850px]:border-b-0 min-[850px]:border-r">
        <div className="grid grid-cols-2 gap-2 min-[850px]:block min-[850px]:space-y-1 min-[850px]:pt-2">
          <TabButton
            active={tab === "upcoming"}
            count={counts.upcoming}
            label="Upcoming"
            loading={loading}
            onClick={() => setTab("upcoming")}
          />
          <TabButton
            active={tab === "recent"}
            count={counts.recent}
            label="Recent"
            loading={loading}
            onClick={() => setTab("recent")}
          />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col p-4 min-[850px]:p-5">
        {invitationNotice ? (
          <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            {invitationNotice}
          </p>
        ) : null}
        {loading ? (
          <InterviewsLoadingSkeleton viewMode={viewMode} monthTitle={monthTitle} />
        ) : error ? (
          <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>
        ) : !hasInterviews ? (
          <EmptyState onSchedule={openCreateSchedule} />
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 min-[850px]:flex-row min-[850px]:items-center min-[850px]:justify-between">
              <div className="flex items-center gap-2">
                {viewMode === "calendar" ? (
                  <button
                    type="button"
                    onClick={() => shiftCalendarWeek(-7)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#E5E7EB] text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#111827]"
                    aria-label="Previous week"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                ) : null}
                <p className="text-base font-bold text-[#111827]">{monthTitle}</p>
                {viewMode === "calendar" ? (
                  <button
                    type="button"
                    onClick={() => shiftCalendarWeek(7)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#E5E7EB] text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#111827]"
                    aria-label="Next week"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <div className="inline-flex items-center gap-2 self-start text-xs text-[#64748B]">
                <span className={viewMode === "calendar" ? "font-medium text-[#111827]" : ""}>
                  Calendar View
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={viewMode === "calendar"}
                  onClick={() => setViewMode((v) => (v === "list" ? "calendar" : "list"))}
                  className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition ${
                    viewMode === "calendar"
                      ? "bg-[color:var(--brand-primary,#bc8b41)]"
                      : "bg-[#CBD5E1]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                      viewMode === "calendar" ? "left-0.5" : "left-4"
                    }`}
                  />
                </button>
                <span className={viewMode === "list" ? "font-medium text-[#111827]" : ""}>List View</span>
              </div>
            </div>
            {viewMode === "list" ? (
              <InterviewListView
                interviews={interviews}
                onView={openInterviewDetail}
                onReschedule={openReschedule}
              />
            ) : (
              <InterviewCalendarView
                interviews={interviews}
                anchorDate={anchorDate}
                onSelect={openInterviewDetail}
              />
            )}
          </>
        )}

        {hasInterviews && !loading ? (
          <div className="mt-5 flex justify-stretch min-[850px]:justify-end">
            <button
              type="button"
              onClick={openCreateSchedule}
              className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white min-[850px]:w-auto"
              style={{ backgroundColor: "var(--brand-primary, #bc8b41)" }}
            >
              <Plus className="h-4 w-4" />
              Schedule Interview
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );

  const modals = (
    <>
      <InterviewDetailSidebar
        open={detailOpen}
        interview={selectedInterview}
        onClose={closeInterviewDetail}
        onReschedule={openReschedule}
      />

      <ScheduleInterviewModal
        open={scheduleOpen}
        applicants={modalApplicants}
        submitting={submitting}
        error={scheduleError}
        fixedWorkerId={editingInterviewId ? selectedInterview?.workerId ?? workerId : workerId}
        fixedApplicantName={
          editingInterviewId ? selectedInterview?.applicantName ?? candidateName : candidateName
        }
        fixedJobTitle={editingInterviewId ? selectedInterview?.jobTitle ?? undefined : undefined}
        fixedApplicationId={
          editingInterviewId ? selectedInterview?.applicationId ?? undefined : undefined
        }
        mode={editingInterviewId ? "reschedule" : "create"}
        initialValues={rescheduleInitial}
        defaultTitle={
          editingInterviewId
            ? selectedInterview?.title
            : candidateName
              ? `Interview with ${candidateName}`
              : undefined
        }
        onClose={() => {
          setScheduleOpen(false);
          setScheduleError(null);
          setEditingInterviewId(null);
          setRescheduleInitial(null);
        }}
        onSubmit={handleSchedule}
      />

      <InterviewSuccessModal
        open={successOpen}
        message={successMessage}
        onClose={() => setSuccessOpen(false)}
        onGoToCalendar={() => {
          setSuccessOpen(false);
          setViewMode("calendar");
          setTab("upcoming");
        }}
      />
    </>
  );

  if (embedded) {
    return (
      <>
        {panel}
        {modals}
      </>
    );
  }

  return (
    <main className="box-border w-full min-w-0 max-w-full px-4 py-6 sm:px-8 sm:py-8 font-[Inter,sans-serif]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">
            Applicant Interviews
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Manage applicant interviews
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateSchedule}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[color:var(--brand-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-primary)]"
        >
          <Plus className="size-4" strokeWidth={2.5} />
          Schedule an Interview
        </button>
      </div>

      {invitationNotice ? (
        <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
          {invitationNotice}
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-white text-xs font-semibold text-[#6B7280]">
                <th className="px-6 py-4">When</th>
                <th className="px-6 py-4">Candidate</th>
                <th className="px-6 py-4">Job</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Interviewer</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB]">
              {loading && interviews.length === 0 ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-6 py-4">
                      <div className="h-6 w-full animate-pulse rounded bg-gray-100" />
                    </td>
                  </tr>
                ))
              ) : interviews.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                    No interviews found.
                  </td>
                </tr>
              ) : (
                interviews.map((item) => {
                  const when = formatInterviewWhen(item.startsAt);
                  const jobLabel = item.jobTitle?.trim() || "—";
                  const interviewer =
                    item.interviewers?.map((row) => row.name || row.email).filter(Boolean).join(", ") ||
                    "—";
                  const statusLabel = item.status || "upcoming";
                  const locationLabel =
                    item.meetingType === "online"
                      ? item.location?.trim() || "Remote"
                      : item.location?.trim() || "—";

                  return (
                    <tr key={item.id} className="transition-colors hover:bg-gray-50/70">
                      <td className="whitespace-nowrap px-6 py-4 align-middle">
                        <div className="text-xs font-normal text-[#6B7280]">{when.date}</div>
                        <div className="text-xs text-[#6B7280]">{when.time}</div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle font-bold text-[#111827]">
                        {item.applicantName || "—"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle">
                        {item.jobId ? (
                          <Link
                            href={`/admin_recruiter/jobs/${item.jobId}`}
                            className="text-xs font-normal text-[color:var(--brand-primary)] underline hover:brightness-90"
                          >
                            {jobLabel}
                          </Link>
                        ) : (
                          <span className="text-xs font-normal text-[#6B7280]">{jobLabel}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle text-xs text-[#6B7280]">
                        {locationLabel}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle text-xs text-[#374151]">
                        {interviewer}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle">
                        <InterviewStatusPill status={statusLabel} />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 align-middle text-right">
                        <button
                          type="button"
                          onClick={() => openInterviewDetail(item)}
                          className="inline-flex items-center justify-center rounded-md border border-[color:var(--brand-primary)] px-4 py-1 text-xs font-semibold text-[color:var(--brand-primary)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_8%,white)]"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modals}
    </main>
  );
}
