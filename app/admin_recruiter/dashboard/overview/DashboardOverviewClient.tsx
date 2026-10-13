"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";

type StatMetric = {
  value: number;
  changePct: number | null;
};

type AttentionTone = "orange" | "red" | "green";

type AttentionItem = {
  id: string;
  name: string;
  title: string;
  subtitle: string;
  tag: string;
  tone: AttentionTone;
  agoLabel: string;
  href: string;
};

type JobByClientItem = {
  id: string;
  clientName: string;
  role: string;
  agoLabel: string;
  href: string;
};

type DashboardOverviewData = {
  greeting: string;
  userName: string;
  selectedDate: string;
  selectedDateLabel: string;
  stats?: {
    activeWorkers: StatMetric;
    newCandidates: StatMetric;
    newlyOnboarded: StatMetric;
    hired: StatMetric;
  };
  needsAttention?: AttentionItem[];
  jobsByClient?: JobByClientItem[];
};

type StatKey = keyof NonNullable<DashboardOverviewData["stats"]>;

const HOME_ICON_BASE = "/icons/admin-recruiter/home";
const SHIFTS_ROUTE = "/admin_recruiter/calendar/shifts";

const STAT_CARDS: {
  key: StatKey;
  label: string;
  icon: string;
  iconSize: number;
  color: string;
  tint: string;
}[] = [
  {
    key: "activeWorkers",
    label: "Active Workers",
    icon: `${HOME_ICON_BASE}/stat-active-workers.svg`,
    iconSize: 30,
    color: "#12AA00",
    tint: "rgba(18,170,0,0.15)",
  },
  {
    key: "newCandidates",
    label: "New Candidates",
    icon: `${HOME_ICON_BASE}/stat-new-candidates.svg`,
    iconSize: 30,
    color: "#9000B1",
    tint: "rgba(144,0,177,0.15)",
  },
  {
    key: "newlyOnboarded",
    label: "Newly Onboarded",
    icon: `${HOME_ICON_BASE}/stat-newly-onboarded.svg`,
    iconSize: 30,
    color: "#0062FF",
    tint: "rgba(0,98,255,0.15)",
  },
  {
    key: "hired",
    label: "Hired",
    icon: `${HOME_ICON_BASE}/stat-hired.svg`,
    iconSize: 28,
    color: "#DC6803",
    tint: "rgba(220,104,3,0.15)",
  },
];

const ATTENTION_TONE_CLASS: Record<AttentionTone, string> = {
  orange: "bg-[rgba(255,122,0,0.15)] text-[#FF7A00]",
  red: "bg-[rgba(225,29,72,0.15)] text-[#E11D48]",
  green: "bg-[rgba(18,170,0,0.15)] text-[#12AA00]",
};

const QUICK_ACTIONS: {
  label: string;
  icon: string;
  iconClass: string;
  href?: string;
  primary?: boolean;
}[] = [
  {
    label: "Post a shift",
    icon: `${HOME_ICON_BASE}/quick-post-shift.svg`,
    iconClass: "size-6",
    href: SHIFTS_ROUTE,
    primary: true,
  },
  {
    label: "Manage Clients",
    icon: `${HOME_ICON_BASE}/quick-manage-clients.svg`,
    iconClass: "h-[22px] w-[23.28px]",
    href: "/admin_recruiter/facilities",
  },
  {
    label: "View Submission",
    icon: `${HOME_ICON_BASE}/quick-view-submission.svg`,
    iconClass: "h-[22px] w-[18px]",
    href: "/admin_recruiter/applications",
  },
  {
    label: "Approve PTO",
    icon: `${HOME_ICON_BASE}/quick-approve-pto.svg`,
    iconClass: "size-6",
  },
];

const PANEL_CLASS = "w-full min-w-0 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white";
const PANEL_HEADER_CLASS = "flex h-12 shrink-0 items-center justify-between border-b border-[#E5E7EB] px-5";
const PANEL_TITLE_CLASS = "text-[14px] font-semibold leading-5 text-black!";
const VIEW_ALL_CLASS =
  "text-[12px] font-semibold leading-4 text-[#012352] transition hover:text-[color:var(--brand-primary)]";

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function formatStatValue(value: number | undefined): string {
  return typeof value === "number" ? value.toLocaleString("en-US") : "—";
}

function TrendArrow({ down }: { down: boolean }) {
  return (
    <svg
      width="6"
      height="7"
      viewBox="0 0 6 7"
      fill="none"
      aria-hidden
      className={`shrink-0 ${down ? "rotate-180" : ""}`}
    >
      <path d="M3.6 7V3.5H6L3 0L0 3.5H2.4V7H3.6Z" fill="currentColor" />
    </svg>
  );
}

function StatCard({
  label,
  icon,
  iconSize,
  color,
  tint,
  metric,
}: {
  label: string;
  icon: string;
  iconSize: number;
  color: string;
  tint: string;
  metric?: StatMetric;
}) {
  const changePct = metric?.changePct ?? null;
  return (
    <div className="flex h-[90px] min-w-0 items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-5 py-3.5">
      <span
        className="flex size-[50px] shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: tint }}
        aria-hidden
      >
        <img src={icon} alt="" width={iconSize} height={iconSize} style={{ width: iconSize, height: iconSize }} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[20px] font-semibold leading-7 text-[#012352]">{formatStatValue(metric?.value)}</span>
          {changePct !== null ? (
            <span
              className="inline-flex shrink-0 items-center justify-center gap-0.5 rounded p-1 text-[10px] font-semibold leading-[10px]"
              style={{ backgroundColor: tint, color }}
              title={`${changePct >= 0 ? "Up" : "Down"} ${Math.abs(changePct)}% vs last week`}
            >
              <TrendArrow down={changePct < 0} />
              {Math.abs(changePct)}%
            </span>
          ) : null}
        </div>
        <p className="truncate text-[14px] font-semibold leading-5 text-[#374151]">{label}</p>
      </div>
    </div>
  );
}

function PanelMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-white px-5 py-10 text-center text-[12px] text-[#6B7280]">
      {children}
    </div>
  );
}

function SkeletonRows({ count, height }: { count: number; height: string }) {
  return (
    <div className="flex flex-1 flex-col gap-px bg-[#ECF1F9]">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`flex items-center bg-white px-5 ${height}`}>
          <div className="h-3 w-2/3 animate-pulse rounded bg-[#F1F5F9]" />
        </div>
      ))}
    </div>
  );
}

function NeedsAttentionPanel({ loading, items }: { loading: boolean; items: AttentionItem[] }) {
  return (
    <section className={`${PANEL_CLASS} flex flex-col`}>
      <div className={PANEL_HEADER_CLASS}>
        <h2 className={PANEL_TITLE_CLASS}>Needs Attention</h2>
        <Link href="/admin_recruiter/new" className={VIEW_ALL_CLASS}>
          View All
        </Link>
      </div>
      {loading ? (
        <SkeletonRows count={5} height="h-[54px]" />
      ) : items.length === 0 ? (
        <PanelMessage>Nothing needs your attention right now.</PanelMessage>
      ) : (
        <ul className="flex flex-1 flex-col gap-px bg-[#ECF1F9]">
          {items.map((item) => (
            <li key={item.id} className="bg-white">
              <Link
                href={item.href}
                className="flex items-center justify-between gap-4 px-5 py-3 transition hover:bg-[#F8FAFC]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[#94A3B8] p-0.5 text-[12px] font-semibold leading-4 text-white"
                    aria-hidden
                  >
                    {initials(item.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold leading-4 text-black">{item.title}</p>
                    <p className="truncate text-[10px] leading-[15px] text-[#6B7280]">{item.subtitle}</p>
                  </div>
                </div>
                <div className="flex w-[150px] shrink-0 items-center gap-[30px]">
                  <span
                    className={`inline-flex min-w-[77px] items-center justify-center rounded px-2.5 py-1 text-[10px] font-semibold leading-[15px] ${ATTENTION_TONE_CLASS[item.tone]}`}
                  >
                    {item.tag}
                  </span>
                  <span className="whitespace-nowrap text-[10px] leading-[15px] text-[#6B7280]">{item.agoLabel}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function JobsByClientPanel({ loading, items }: { loading: boolean; items: JobByClientItem[] }) {
  return (
    <section className={`${PANEL_CLASS} flex flex-col`}>
      <div className={PANEL_HEADER_CLASS}>
        <h2 className={PANEL_TITLE_CLASS}>Jobs by Client</h2>
        <Link href="/admin_recruiter/jobs" className={VIEW_ALL_CLASS}>
          View All
        </Link>
      </div>
      {loading ? (
        <SkeletonRows count={7} height="h-10" />
      ) : items.length === 0 ? (
        <PanelMessage>No jobs posted yet.</PanelMessage>
      ) : (
        <ul className="flex flex-1 flex-col gap-px bg-[#ECF1F9]">
          {items.map((job) => (
            <li key={job.id} className="bg-white">
              <Link
                href={job.href}
                className="grid h-10 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_79px] items-center transition hover:bg-[#F8FAFC]"
              >
                <span className="truncate px-5 text-[12px] leading-4 text-black">{job.clientName}</span>
                <span className="truncate px-5 text-[10px] leading-[15px] text-[color:var(--brand-primary)]">
                  {job.role}
                </span>
                <span className="whitespace-nowrap px-5 text-[10px] leading-[15px] text-[#6B7280]">{job.agoLabel}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QuickActionsPanel() {
  return (
    <section className={PANEL_CLASS}>
      <div className={PANEL_HEADER_CLASS}>
        <h2 className={PANEL_TITLE_CLASS}>Quick Actions</h2>
      </div>
      <div className="flex items-center justify-between gap-5 px-5 py-5 xl:py-0">
        <div className="grid w-full min-w-0 grid-cols-1 gap-3.5 sm:grid-cols-2 xl:flex xl:w-[762px] xl:shrink-0">
          {QUICK_ACTIONS.map((action) => {
            const baseClass =
              "flex h-12 min-w-0 items-center justify-center gap-3 overflow-hidden rounded-xl px-3.5 py-3 text-[14px] font-semibold leading-5 whitespace-nowrap transition xl:min-w-max xl:flex-1";
            const toneClass = action.primary
              ? "bg-[color:var(--brand-primary)] text-white hover:brightness-95"
              : "border border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F9FAFB]";
            const content = (
              <>
                <span className="flex size-6 shrink-0 items-center justify-center" aria-hidden>
                  {action.primary ? (
                    <img src={action.icon} alt="" className={action.iconClass} />
                  ) : (
                    <BrandedSvgIcon src={action.icon} color="var(--brand-primary)" className={action.iconClass} />
                  )}
                </span>
                <span>{action.label}</span>
              </>
            );

            return action.href ? (
              <Link key={action.label} href={action.href} className={`${baseClass} ${toneClass}`}>
                {content}
              </Link>
            ) : (
              <button
                key={action.label}
                type="button"
                title={`${action.label} (Coming soon)`}
                className={`${baseClass} ${toneClass} cursor-default`}
              >
                {content}
              </button>
            );
          })}
        </div>
        <div className="relative ml-auto hidden h-[113px] w-[282px] min-w-0 shrink xl:block" aria-hidden>
          <div className="absolute inset-y-[3.73%] left-[9.63%] w-[84.09%]">
            <Image
              src="/images/admin-recruiter/home/quick-actions-illustration.png"
              alt=""
              fill
              sizes="240px"
              className="object-contain"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default function DashboardOverviewClient() {
  const [selectedDate] = useState(todayIsoDate);
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

  return (
    <div className="relative flex w-full min-w-0 flex-col gap-5 admin-recruiter-page-pad pt-[30px]! pb-8!">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-[20px] font-semibold leading-7 text-[#012352]!">
            <span className="truncate">
              {data?.greeting ?? "Good morning"}, {data?.userName ?? "there"}!
            </span>
            <img
              src="/icons/clapping-hands.svg"
              alt=""
              width={18}
              height={18}
              className="size-[18px] shrink-0"
              aria-hidden
            />
          </h1>
          <p className="text-[14px] leading-5 text-[#6B7280]">
            Here&apos;s what&apos;s happening with your schedule and work!
          </p>
        </div>
        {data?.selectedDateLabel ? (
          <p className="whitespace-nowrap text-[12px] leading-4 text-[#6B7280]">{data.selectedDateLabel}</p>
        ) : null}
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <section className="relative flex min-h-[170px] flex-col justify-center gap-3.5 overflow-hidden rounded-xl bg-[#012352] p-5">
        <div
          className="pointer-events-none absolute left-[23.73%] top-[-5.2%] hidden h-[114.94%] w-[76.63%] md:block"
          aria-hidden
        >
          <Image
            src="/images/admin-recruiter/home/hero-team.png"
            alt=""
            fill
            priority
            sizes="(min-width: 1280px) 850px, 77vw"
            className="object-cover"
          />
        </div>
        <p className="relative text-[12px] font-semibold leading-4 text-[color:var(--brand-primary)]">
          Keep your shifts filled
        </p>
        <div className="relative flex flex-col gap-2">
          <h2 className="text-[20px] font-semibold leading-7 text-white!">Get the right people on shift.</h2>
          <p className="max-w-[438px] text-[12px] leading-4 text-white">
            Post new shifts, review submission and keep your clients covered.
          </p>
        </div>
        <div className="relative flex flex-wrap gap-3.5">
          <Link
            href={SHIFTS_ROUTE}
            className="inline-flex items-center justify-center rounded-lg bg-[color:var(--brand-primary)] px-4 py-2 text-[12px] font-semibold leading-4 text-white transition hover:brightness-95"
          >
            Post a Shift
          </Link>
          <Link
            href={SHIFTS_ROUTE}
            className="inline-flex items-center justify-center rounded-lg border border-[color:var(--brand-primary)] px-4 py-2 text-[12px] font-semibold leading-4 text-white transition hover:bg-white/10"
          >
            View Open Shifts
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <StatCard
            key={card.key}
            label={card.label}
            icon={card.icon}
            iconSize={card.iconSize}
            color={card.color}
            tint={card.tint}
            metric={data?.stats?.[card.key]}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,600fr)_minmax(0,484fr)]">
        <NeedsAttentionPanel loading={loading} items={data?.needsAttention ?? []} />
        <JobsByClientPanel loading={loading} items={data?.jobsByClient ?? []} />
      </div>

      <QuickActionsPanel />
    </div>
  );
}
