"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type ScheduleItem = {
  id: string;
  time: string;
  label: string;
  description: string;
};

type TodoItem = {
  id: string;
  title: string;
  description: string;
  agoLabel: string;
  isRead: boolean;
};

type ShiftItem = {
  id: string;
  date: string;
  timeRange: string;
  facilityAddress: string;
  workerCount: number;
  managerName: string;
};

type OnboardHireItem = {
  id: string;
  name: string;
  role: string;
  startLabel: string;
  status: string;
};

type FacilityWorkerItem = {
  id: string;
  name: string;
  address: string;
  workerCount: number;
};

type DashboardOverviewData = {
  greeting: string;
  userName: string;
  selectedDate: string;
  selectedDateLabel: string;
  schedule: {
    meetings: ScheduleItem[];
    interviews: ScheduleItem[];
    meetingCount: number;
    interviewCount: number;
  };
  todos: TodoItem[];
  shifts: ShiftItem[];
  onboardHires: OnboardHireItem[];
  facilityWorkers: FacilityWorkerItem[];
};

const AVATAR_COLORS = ["#E85D4C", "#012352", "#6B7280", "#3B82F6", "#0D9488", "#9333EA"];

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function formatWeekdayDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function buildDateOptions(anchorIso: string, range = 14): { iso: string; label: string }[] {
  const options: { iso: string; label: string }[] = [];
  for (let offset = -range; offset <= range; offset += 1) {
    const iso = addDaysIso(anchorIso, offset);
    options.push({ iso, label: formatWeekdayDate(iso) });
  }
  return options;
}

function DashboardDateDropdown({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: string;
  onSelectDate: (iso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dateOptions = useMemo(() => buildDateOptions(selectedDate), [selectedDate]);
  const selectedDateLabel = formatWeekdayDate(selectedDate);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-1 rounded-md border border-[#E5E7EB] bg-white px-2.5 py-1.5 text-sm font-medium text-[#374151] transition hover:bg-[#F9FAFB]"
        aria-label="Select date"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedDateLabel}
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label="Date options"
          className="absolute right-0 top-full z-50 mt-1 max-h-64 w-[min(320px,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-[#E5E7EB] bg-white py-1 shadow-lg"
        >
          {dateOptions.map((option) => {
            const active = option.iso === selectedDate;
            return (
              <button
                key={option.iso}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onSelectDate(option.iso);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left text-sm transition ${
                  active
                    ? "bg-[color:color-mix(in_srgb,var(--brand-primary)_10%,white)] font-semibold text-[color:var(--brand-primary)]"
                    : "text-[#374151] hover:bg-[#F9FAFB]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CardShell({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="w-full min-w-0 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-5 py-4">
        <h2 className="truncate text-base font-semibold text-[#111827]">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function GhostButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center justify-center rounded-md border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#111827] transition hover:bg-[#F9FAFB]"
    >
      {label}
    </Link>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="py-6 text-center text-sm text-[#6B7280]">{message}</p>;
}

export default function DashboardOverviewClient() {
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [scheduleTab, setScheduleTab] = useState<"meetings" | "interviews">("meetings");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardOverviewData | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/dashboard-overview?date=${selectedDate}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as DashboardOverviewData & { error?: string };
      if (!res.ok) throw new Error(json.error || "Failed to load dashboard");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const scheduleItems = useMemo(() => {
    if (!data) return [];
    return scheduleTab === "meetings" ? data.schedule.meetings : data.schedule.interviews;
  }, [data, scheduleTab]);

  return (
    <div className="relative w-full min-w-0 space-y-[14px] admin-recruiter-page-pad">
        <header className="space-y-1">
          <h1 className="inline-flex items-center gap-1 font-[Inter,sans-serif] text-[18px] font-semibold leading-[28px] text-[#012352]">
            {data?.greeting ?? "Good morning"}, {data?.userName ?? "there"}!
            <img
              src="/icons/clapping-hands.svg"
              alt=""
              width={18}
              height={18}
              className="h-[18px] w-[18px] shrink-0"
              aria-hidden
            />
          </h1>
          <p className="font-[Inter,sans-serif] text-[12px] font-normal leading-[16px] text-[#6B7280]">
            Here&apos;s what&apos;s happening with your schedule and work!
          </p>
        </header>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        <div className="grid w-full min-w-0 grid-cols-1 gap-[14px] xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <CardShell
            title={data?.selectedDateLabel ?? "Schedule"}
            action={
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedDate((current) => addDaysIso(current, -1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#E5E7EB] text-[#374151] hover:bg-[#F9FAFB]"
                  aria-label="Previous day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDate((current) => addDaysIso(current, 1))}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#E5E7EB] text-[#374151] hover:bg-[#F9FAFB]"
                  aria-label="Next day"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            }
          >
            <div className="mb-4 flex items-center gap-6 border-b border-[#E5E7EB]">
              {(["meetings", "interviews"] as const).map((tab) => {
                const active = scheduleTab === tab;
                const count =
                  tab === "meetings" ? (data?.schedule.meetingCount ?? 0) : (data?.schedule.interviewCount ?? 0);
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setScheduleTab(tab)}
                    className={`border-b-2 pb-3 text-sm font-semibold capitalize transition ${
                      active
                        ? "border-[color:var(--brand-primary)] text-[color:var(--brand-primary)]"
                        : "border-transparent text-[#6B7280] hover:text-[#111827]"
                    }`}
                  >
                    {tab} ({count})
                  </button>
                );
              })}
            </div>

            {loading ? null : scheduleItems.length === 0 ? (
              <EmptyState message={`No ${scheduleTab} for this day.`} />
            ) : (
              <ul className="space-y-4">
                {scheduleItems.slice(0, 4).map((item) => (
                  <li key={item.id} className="flex gap-4">
                    <div className="w-16 shrink-0 text-sm font-semibold text-[#111827]">{item.time}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-[#6B7280]">{item.label}</div>
                      <div className="text-sm font-semibold leading-5 text-[#012352]">{item.description}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex justify-center">
              <GhostButton href="/admin_recruiter/calendar" label="More Details" />
            </div>
          </CardShell>

          <CardShell title="To Do's">
            {loading ? (
              <EmptyState message="Loading to do list..." />
            ) : !data?.todos.length ? (
              <EmptyState message="No tasks right now." />
            ) : (
              <ul className="space-y-4">
                {data.todos.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-[#6B7280]">{item.title}</div>
                      <div className="text-sm font-semibold leading-5 text-[#012352]">{item.description}</div>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-[#6B7280]">{item.agoLabel}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex justify-center">
              <GhostButton href="/admin_recruiter/notifications" label="More Details" />
            </div>
          </CardShell>
        </div>

        <CardShell title="Scheduled Shifts">
          {loading ? (
            <EmptyState message="Loading shifts..." />
          ) : !data?.shifts.length ? (
            <EmptyState message="No upcoming shifts." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E7EB] text-left text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                    <th className="px-2 py-3">Date</th>
                    <th className="px-2 py-3">Time</th>
                    <th className="px-2 py-3">Facility Address</th>
                    <th className="px-2 py-3">Workers</th>
                    <th className="px-2 py-3">Manager</th>
                    <th className="px-2 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.shifts.map((shift) => (
                    <tr key={shift.id} className="border-b border-[#F3F4F6] text-sm text-[#111827]">
                      <td className="px-2 py-4 font-medium">{shift.date}</td>
                      <td className="px-2 py-4">{shift.timeRange}</td>
                      <td className="px-2 py-4 text-[#374151]">{shift.facilityAddress}</td>
                      <td className="px-2 py-4">{shift.workerCount}</td>
                      <td className="px-2 py-4">{shift.managerName}</td>
                      <td className="px-2 py-4 text-right">
                        <GhostButton href="/admin_recruiter/calendar/shifts" label="Details" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardShell>

        <div className="grid w-full min-w-0 grid-cols-1 gap-[14px] xl:grid-cols-2">
          <CardShell title="Onboard New Hires">
            {loading ? (
              <EmptyState message="Loading hires..." />
            ) : !data?.onboardHires.length ? (
              <EmptyState message="No new hires to onboard." />
            ) : (
              <ul className="space-y-4">
                {data.onboardHires.map((hire, index) => (
                  <li key={hire.id} className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                        style={{ backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] }}
                        aria-hidden
                      >
                        {initials(hire.name)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[#111827]">{hire.name}</div>
                        <div className="truncate text-xs text-[#6B7280]">{hire.role}</div>
                        <div className="truncate text-xs text-[#6B7280]">{hire.startLabel}</div>
                      </div>
                    </div>
                    <Link
                      href={`/admin_recruiter/new/checklist/${hire.id}`}
                      className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-[#D1D5DB] bg-white px-4 text-sm font-semibold text-[#111827] hover:bg-[#F9FAFB]"
                    >
                      Onboard
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex justify-center">
              <GhostButton href="/admin_recruiter/new" label="More Details" />
            </div>
          </CardShell>

          <CardShell
            title="Active Facilities Workers"
            action={
              <DashboardDateDropdown selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            }
          >
            {loading ? null : !data?.facilityWorkers.length ? (
              <EmptyState message="No active facility workers yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] text-left text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                      <th className="px-2 py-3">Facility</th>
                      <th className="px-2 py-3">Address</th>
                      <th className="px-2 py-3">Number of workers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.facilityWorkers.map((facility) => (
                      <tr key={facility.id} className="border-b border-[#F3F4F6] text-sm">
                        <td className="px-2 py-4 font-semibold text-[#111827]">{facility.name}</td>
                        <td className="px-2 py-4 text-[#374151]">{facility.address}</td>
                        <td className="px-2 py-4 font-semibold text-[#111827]">{facility.workerCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-5 flex justify-center">
              <GhostButton href="/admin_recruiter/facilities" label="More Details" />
            </div>
          </CardShell>
        </div>
    </div>
  );
}
