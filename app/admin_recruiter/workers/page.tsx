"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";
import {
  CANDIDATES_FILTER_CONTROL_CLASS,
  CANDIDATES_FILTER_LABEL_CLASS,
  CANDIDATES_PAGE_SUBTITLE_STYLE,
} from "@/app/admin_recruiter/candidates/candidates-typography";
import { CandidatesPageHeader } from "@/app/admin_recruiter/components/CandidatesPageHeader";
import { AdvancedSearchButton } from "@/app/admin_recruiter/components/CandidatesListShell";
import { ColumnsEditorModal } from "@/app/admin_recruiter/components/ColumnsEditorModal";
import AdvancedSearchModal from "@/app/admin_recruiter/components/AdvancedSearchModal";
import { ListExportDropdown } from "@/app/admin_recruiter/components/ListExportDropdown";
import { useCandidatesFilterRowsDefault } from "@/app/admin_recruiter/hooks/useCandidatesFilterRowsDefault";
import {
  employmentWorkerTabLabel,
  type EmploymentWorkerTab,
} from "@/lib/admin/employment-workers";
import {
  Columns2,
  Search,
  RefreshCw,
  Filter,
  List,
} from "lucide-react";
import {
  DEFAULT_WORKER_COLUMNS,
  WORKER_COLUMN_OPTIONS,
  loadWorkerColumnOrder,
  saveWorkerColumnOrder,
  workerColumnLabel,
  type WorkerColumnId,
} from "./worker-columns";
import { renderWorkerListCell, type WorkerListRow } from "./render-worker-list-cell";
import { exportWorkersCsv, exportWorkersXls } from "./export-workers";

type EmploymentWorkerRow = {
  id: string;
  candidate_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_role: string | null;
  location: string | null;
  status: string | null;
  worker_type: string | null;
  employment_classification: string | null;
  created_at: string | null;
  profile_photo_url?: string | null;
};

type SearchWorkerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_role: string | null;
  city: string | null;
  state: string | null;
  created_at: string | null;
  status?: string | null;
  worker_type?: string | null;
  employment_classification?: string | null;
  profile_photo_url?: string | null;
  candidate_id?: string | null;
};

const ADVANCED_SEARCH_STORAGE_KEY = "admin_recruiter_workers_advanced_search";
type AdvancedSearchParams = { lat: number; lng: number; radius: number; place?: string };
const WORKERS_FILTER_SELECT_CLASS =
  `${CANDIDATES_FILTER_CONTROL_CLASS} appearance-none bg-[length:12px_12px] bg-[right_10px_center] bg-no-repeat pr-8`;
const WORKERS_FILTER_GRID_SELECT_CLASS =
  "relative z-10 h-10 w-full min-w-0 cursor-pointer appearance-none rounded-md border border-[#dce6e3] bg-white bg-[length:12px_12px] bg-[right_10px_center] bg-no-repeat pl-2 pr-8 text-sm text-[#334155] sm:h-9";
const WORKERS_FILTER_SELECT_CHEVRON = {
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  )}")`,
} as const;

function mapEmploymentWorkerRow(w: EmploymentWorkerRow): WorkerListRow {
  const name = `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim() || "Unnamed";
  return {
    id: w.id,
    profileId: w.candidate_id,
    name,
    email: w.email?.trim() || "",
    role: w.job_role || "—",
    location: w.location?.trim() || "—",
    status: titleCaseStatus(w.status),
    createdAt: w.created_at ?? null,
    profilePhotoUrl: w.profile_photo_url ?? null,
    phone: w.phone?.trim() || "",
    workerType: workerTypeLabel(w.worker_type),
    employmentType: w.employment_classification?.trim() || "",
    reference: (w.candidate_id || w.id).slice(0, 7).toUpperCase(),
  };
}

function mapSearchWorkerRow(w: SearchWorkerRow): WorkerListRow {
  const name = `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim() || "Unnamed";
  const location = [w.city?.trim(), w.state?.trim()].filter(Boolean).join(", ") || "—";
  return {
    id: w.id,
    profileId: w.candidate_id || w.id,
    name,
    email: w.email?.trim() || "",
    role: w.job_role || "—",
    location,
    status: titleCaseStatus(w.status),
    createdAt: w.created_at ?? null,
    profilePhotoUrl: w.profile_photo_url ?? null,
    phone: w.phone?.trim() || "",
    workerType: workerTypeLabel(w.worker_type),
    employmentType: w.employment_classification?.trim() || "",
    reference: (w.candidate_id || w.id).slice(0, 7).toUpperCase(),
  };
}

function matchesWorkerTab(row: WorkerListRow, tab: EmploymentWorkerTab): boolean {
  if (tab === "all") return true;
  if (tab === "new") return row.status.toLowerCase() === "new";
  if (tab === "w2") return row.workerType === "W-2";
  if (tab === "1099") return row.workerType === "1099";
  return true;
}

const WORKER_TABS: Array<{ id: EmploymentWorkerTab; label: string }> = [
  // { id: "new", label: "New only" }, // Hidden for now — keep tab logic for future use.
  { id: "all", label: "All workers" },
  { id: "w2", label: "W-2" },
  { id: "1099", label: "1099" },
];

function titleCaseStatus(s: string | null | undefined) {
  const v = (s || "").trim();
  if (!v) return "—";
  const low = v.toLowerCase();
  return low.slice(0, 1).toUpperCase() + low.slice(1);
}

function workerTypeLabel(value: string | null | undefined): string {
  const v = (value || "").trim().toLowerCase();
  if (v === "w2") return "W-2";
  if (v === "1099") return "1099";
  return value?.trim() || "";
}

function formatDateShort(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { timeZone: "America/New_York", 
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function CompactFilterField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium leading-4 text-[#475569]">{label}</span>
      {children}
    </label>
  );
}

function InlineFilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex w-full min-w-0 shrink-0 flex-col gap-1 lg:w-auto lg:flex-row lg:items-center lg:gap-2">
      <span className={CANDIDATES_FILTER_LABEL_CLASS} style={CANDIDATES_PAGE_SUBTITLE_STYLE}>
        {label}
      </span>
      {children}
    </label>
  );
}

export default function WorkersPage() {
  const router = useRouter();
  const [workers, setWorkers] = useState<WorkerListRow[]>([]);
  const [totalFromApi, setTotalFromApi] = useState<number | null>(null);
  const [tabLabel, setTabLabel] = useState("workers");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [workerTab, setWorkerTab] = useState<EmploymentWorkerTab>("all");
  const [showFilterRows, setShowFilterRows] = useCandidatesFilterRowsDefault();
  const [jobRoleFilter, setJobRoleFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [listColumnOrder, setListColumnOrder] = useState<WorkerColumnId[]>(DEFAULT_WORKER_COLUMNS);
  const [editColumnsOpen, setEditColumnsOpen] = useState(false);
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [advancedSearchParams, setAdvancedSearchParams] = useState<AdvancedSearchParams | null>(null);

  const advancedSearchContext = useMemo(() => {
    if (!advancedSearchParams) {
      return { active: false, lat: 0, lng: 0, radius: 0, place: "" };
    }
    return {
      active: true,
      lat: advancedSearchParams.lat,
      lng: advancedSearchParams.lng,
      radius: advancedSearchParams.radius,
      place: (advancedSearchParams.place ?? "").trim(),
    };
  }, [advancedSearchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(ADVANCED_SEARCH_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<AdvancedSearchParams>;
      const lat = Number(parsed.lat);
      const lng = Number(parsed.lng);
      const radius = Number(parsed.radius);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radius) && radius > 0) {
        setAdvancedSearchParams({
          lat,
          lng,
          radius,
          place: typeof parsed.place === "string" ? parsed.place : "",
        });
      }
    } catch {
      window.sessionStorage.removeItem(ADVANCED_SEARCH_STORAGE_KEY);
    }
  }, []);

  const applyAdvancedSearchParams = useCallback((params: AdvancedSearchParams | null) => {
    setAdvancedSearchParams(params);
    if (typeof window === "undefined") return;
    if (!params) {
      window.sessionStorage.removeItem(ADVANCED_SEARCH_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(ADVANCED_SEARCH_STORAGE_KEY, JSON.stringify(params));
  }, []);

  useEffect(() => {
    setListColumnOrder(loadWorkerColumnOrder());
  }, []);

  const loadWorkers = useCallback(async (overrideAdvancedSearch?: AdvancedSearchParams | null) => {
    const activeSearch = overrideAdvancedSearch === undefined ? advancedSearchParams : overrideAdvancedSearch;
    setLoading(true);
    try {
      if (activeSearch) {
        const res = await fetch("/api/search-workers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lat: activeSearch.lat,
            lng: activeSearch.lng,
            radius: activeSearch.radius,
            ...(activeSearch.place ? { place: activeSearch.place } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to fetch search results");

        const rows: SearchWorkerRow[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.workers)
            ? data.workers
            : [];
        setTotalFromApi(rows.length);
        setTabLabel("Results");
        setWorkers(rows.map(mapSearchWorkerRow));
        return;
      }

      const res = await fetch(`/api/admin/employment-workers?tab=${workerTab}`, {
        cache: "no-store",
      });
      const data = await res.json();
      const authError =
        res.status === 401 ||
        res.status === 403 ||
        String(data?.error ?? "").toLowerCase() === "unauthorized" ||
        String(data?.detail ?? "").toLowerCase().includes("staff role required");
      if (authError) {
        setWorkers([]);
        setTotalFromApi(0);
        setTabLabel(employmentWorkerTabLabel(workerTab));
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Failed to fetch workers");

      const list: EmploymentWorkerRow[] = Array.isArray(data?.workers) ? data.workers : [];
      setTotalFromApi(typeof data?.total === "number" ? data.total : list.length);
      setTabLabel(
        typeof data?.tabLabel === "string" ? data.tabLabel : employmentWorkerTabLabel(workerTab)
      );

      setWorkers(list.map(mapEmploymentWorkerRow));
    } catch (err) {
      console.error("Failed to fetch workers:", err);
      setWorkers([]);
      setTotalFromApi(null);
      setTabLabel(advancedSearchParams ? "Results" : employmentWorkerTabLabel(workerTab));
    } finally {
      setLoading(false);
    }
  }, [workerTab, advancedSearchParams]);

  useEffect(() => {
    if (advancedSearchParams) return;
    void loadWorkers();
  }, [workerTab, advancedSearchParams, loadWorkers]);

  useEffect(() => {
    if (!advancedSearchParams) return;
    void loadWorkers();
  }, [advancedSearchParams, loadWorkers]);

  const filtered = useMemo(() => {
    let out = workers;
    if (advancedSearchContext.active) {
      out = out.filter((row) => matchesWorkerTab(row, workerTab));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((c) => {
        return (
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.role.toLowerCase().includes(q) ||
          c.location.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
        );
      });
    }
    if (jobRoleFilter) out = out.filter((c) => c.role === jobRoleFilter);
    if (locationFilter) out = out.filter((c) => c.location === locationFilter);
    if (dateFilter) {
      out = out.filter((c) => {
        if (!c.createdAt) return false;
        const d = new Date(c.createdAt);
        if (Number.isNaN(d.getTime())) return false;
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        return ymd === dateFilter;
      });
    }
    return out;
  }, [workers, query, jobRoleFilter, locationFilter, dateFilter, advancedSearchContext.active, workerTab]);

  const jobRoleOptions = useMemo(() => {
    const s = new Set<string>();
    for (const w of workers) {
      if (w.role && w.role !== "—") s.add(w.role);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [workers]);

  const locationOptions = useMemo(() => {
    const s = new Set<string>();
    for (const w of workers) {
      if (w.location && w.location !== "—") s.add(w.location);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [workers]);

  function workerTabClass(active: boolean): string {
    return active
      ? "border-b-2 border-(--brand-primary) pb-3 text-(--brand-primary)"
      : "border-b-2 border-transparent pb-3 text-[#667085] transition-colors hover:text-(--brand-primary)";
  }

  return (
    <div className="px-5 pb-8 pt-5 lg:px-8">
      <div className="mb-4 flex items-center gap-6 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {WORKER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setWorkerTab(tab.id)}
            className={`shrink-0 whitespace-nowrap text-sm font-medium ${workerTabClass(workerTab === tab.id)}`}
            aria-current={workerTab === tab.id ? "page" : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="w-full overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-white">
        <CandidatesPageHeader title="Workers" subtitle="Manage workers in one place" />

        <div className="flex w-full flex-col gap-0 overflow-visible rounded-t-[8px] border-y border-[#E5E7EB] bg-white">
          <div className="flex flex-col gap-2 border-b border-[#E5E7EB] px-3 py-2.5 xl:hidden">
            <div className="flex w-full items-center gap-2">
              <div className="flex h-10 min-w-0 flex-1 items-center rounded-md border border-[#dce6e3] bg-white px-3 md:h-8">
                <Search className="mr-2 h-4 w-4 shrink-0 text-[#94A3B8]" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search workers"
                  className="min-w-0 flex-1 bg-transparent text-base font-normal leading-6 text-[#334155] outline-none placeholder:text-[#94A3B8] sm:text-sm"
                  style={CANDIDATES_PAGE_SUBTITLE_STYLE}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowFilterRows((v) => !v)}
                className={`inline-flex h-10 w-auto shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap transition sm:h-8 sm:px-3 sm:text-sm ${
                  showFilterRows || Boolean(jobRoleFilter || locationFilter || dateFilter)
                    ? "border-[color:var(--brand-primary)] bg-[color:color-mix(in_srgb,var(--brand-primary)_10%,white)] text-[color:var(--brand-primary)]"
                    : "border-[#dce6e3] bg-white text-[#334155] hover:bg-zinc-50"
                }`}
              >
                <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden min-[480px]:inline">Filters</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
              <div className="flex items-center gap-1.5 md:gap-2">
                <button
                  type="button"
                  onClick={() => setEditColumnsOpen(true)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#dce6e3] bg-white text-[#334155] transition hover:bg-zinc-50"
                  aria-label="Columns"
                  title="Columns"
                >
                  <Columns2 className="h-4 w-4" />
                </button>
                <ListExportDropdown
                  variant="icon"
                  onExportCsv={() => exportWorkersCsv(filtered)}
                  onExportXls={() => exportWorkersXls(filtered)}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (advancedSearchContext.active) {
                      applyAdvancedSearchParams(null);
                      void loadWorkers(null);
                      return;
                    }
                    void loadWorkers();
                  }}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[#dce6e3] bg-white text-[#334155] transition hover:bg-zinc-50"
                  aria-label={advancedSearchContext.active ? "Reset Search" : "Refresh"}
                  title={advancedSearchContext.active ? "Reset Search" : "Refresh"}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--brand-primary)] bg-[color:color-mix(in_srgb,var(--brand-primary)_10%,white)] text-[color:var(--brand-primary)]"
                  aria-label="List view"
                  title="List view"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 min-[600px]:ml-auto min-[600px]:flex-none">
                <AdvancedSearchButton
                  onClick={() => setAdvancedSearchOpen(true)}
                  size="sm"
                  className="w-full justify-center min-[600px]:w-auto"
                />
              </div>
            </div>
          </div>

          <div className="hidden h-[52px] w-full shrink-0 items-center gap-3 border-b border-[#E5E7EB] px-[14px] xl:flex">
            <div className="flex h-8 w-full min-w-0 max-w-[360px] items-center rounded-md border border-[#dce6e3] bg-white px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 text-[#94A3B8]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search workers"
                className="min-w-0 flex-1 bg-transparent text-sm font-normal leading-6 text-[#334155] outline-none placeholder:text-[#94A3B8]"
                style={CANDIDATES_PAGE_SUBTITLE_STYLE}
              />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilterRows((v) => !v)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#dce6e3] bg-white px-3 text-sm font-normal leading-6 text-[#334155] transition hover:bg-zinc-50"
                style={CANDIDATES_PAGE_SUBTITLE_STYLE}
              >
                <Filter className="h-4 w-4 shrink-0" />
                Filters
              </button>
              <button
                type="button"
                onClick={() => setEditColumnsOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#dce6e3] bg-white px-3 text-sm font-normal leading-6 text-[#334155] transition hover:bg-zinc-50"
                style={CANDIDATES_PAGE_SUBTITLE_STYLE}
              >
                <Columns2 className="h-4 w-4 shrink-0" />
                Columns
              </button>
              <ListExportDropdown
                onExportCsv={() => exportWorkersCsv(filtered)}
                onExportXls={() => exportWorkersXls(filtered)}
              />
              <button
                type="button"
                onClick={() => {
                  if (advancedSearchContext.active) {
                    applyAdvancedSearchParams(null);
                    void loadWorkers(null);
                    return;
                  }
                  void loadWorkers();
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#dce6e3] bg-white px-3 text-sm font-normal leading-6 text-[#334155] transition hover:bg-zinc-50"
                style={CANDIDATES_PAGE_SUBTITLE_STYLE}
              >
                <RefreshCw className={`h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} />
                {advancedSearchContext.active ? "Reset Search" : "Refresh"}
              </button>
              {!showFilterRows ? (
                <AdvancedSearchButton onClick={() => setAdvancedSearchOpen(true)} size="sm" />
              ) : null}
            </div>
          </div>

          {showFilterRows ? (
            <>
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-[#E8EEEC] bg-[#F8FAFC] p-2.5 mx-3 my-2.5 min-[600px]:grid-cols-2 md:grid-cols-3 xl:hidden">
                <CompactFilterField label="Job Role">
                  <select
                    value={jobRoleFilter}
                    onChange={(e) => setJobRoleFilter(e.target.value)}
                    className={WORKERS_FILTER_GRID_SELECT_CLASS}
                    style={WORKERS_FILTER_SELECT_CHEVRON}
                  >
                    <option value="">All</option>
                    {jobRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </CompactFilterField>
                <CompactFilterField label="Location">
                  <select
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className={WORKERS_FILTER_GRID_SELECT_CLASS}
                    style={WORKERS_FILTER_SELECT_CHEVRON}
                  >
                    <option value="">All</option>
                    {locationOptions.map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </CompactFilterField>
                <CompactFilterField label="Date Applied" className="min-[600px]:col-span-2 md:col-span-1">
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="h-10 w-full min-w-0 rounded-md border border-[#dce6e3] bg-white px-2 text-sm text-[#334155] scheme-light sm:h-9"
                  />
                </CompactFilterField>
              </div>

              <div className="hidden items-center gap-4 border-b border-[#E5E7EB] px-[14px] py-2.5 xl:flex">
                <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  <BrandedSvgIcon
                    src="/icons/admin-recruiter/candidates/filtered.svg.svg"
                    className="h-4 w-4 shrink-0"
                    color="var(--brand-primary)"
                  />
                  <InlineFilterField label="Job Role">
                    <select
                      value={jobRoleFilter}
                      onChange={(e) => setJobRoleFilter(e.target.value)}
                      className={`${WORKERS_FILTER_SELECT_CLASS} relative z-10`}
                      style={{ ...CANDIDATES_PAGE_SUBTITLE_STYLE, ...WORKERS_FILTER_SELECT_CHEVRON }}
                    >
                      <option value="">All</option>
                      {jobRoleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </InlineFilterField>
                  <InlineFilterField label="Location">
                    <select
                      value={locationFilter}
                      onChange={(e) => setLocationFilter(e.target.value)}
                      className={`${WORKERS_FILTER_SELECT_CLASS} relative z-10`}
                      style={{ ...CANDIDATES_PAGE_SUBTITLE_STYLE, ...WORKERS_FILTER_SELECT_CHEVRON }}
                    >
                      <option value="">All</option>
                      {locationOptions.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                    </select>
                  </InlineFilterField>
                  <InlineFilterField label="Date Applied">
                    <input
                      type="date"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className={`${CANDIDATES_FILTER_CONTROL_CLASS} relative z-10 scheme-light`}
                      style={CANDIDATES_PAGE_SUBTITLE_STYLE}
                    />
                  </InlineFilterField>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <AdvancedSearchButton onClick={() => setAdvancedSearchOpen(true)} size="sm" />
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex w-full items-center gap-3 px-[14px] py-3">
          <div className="text-xs leading-4 text-[#5e7371]">
            {advancedSearchContext.active ? (
              <>
                Total:{" "}
                <span className="font-semibold text-[#203130]">{loading ? "—" : totalFromApi ?? filtered.length}</span>{" "}
                Results
                {advancedSearchContext.place ? (
                  <>
                    {" "}
                    found in{" "}
                    <span className="font-semibold text-[#203130]">{advancedSearchContext.place}</span>
                  </>
                ) : null}
              </>
            ) : (
              <>
                Total:{" "}
                <span className="font-semibold text-[#203130]">{loading ? "—" : totalFromApi ?? workers.length}</span>{" "}
                {tabLabel}
              </>
            )}
          </div>
        </div>

        <div className="bg-white px-[14px] py-4">
          {loading ? null : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-600">
              <div>No workers found.</div>
              {advancedSearchContext.active ? (
                <button
                  type="button"
                  onClick={() => {
                    applyAdvancedSearchParams(null);
                    void loadWorkers(null);
                  }}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-[color:var(--brand-primary)] px-5 text-sm font-semibold text-white hover:brightness-95"
                >
                  Reset Search
                </button>
              ) : null}
            </div>
          ) : (
            (() => {
              const cols = listColumnOrder.length ? listColumnOrder : DEFAULT_WORKER_COLUMNS;
              return (
                <div className="overflow-hidden rounded-md border border-[#E5E7EB]">
                  <div className="overflow-auto">
                    <table className="min-w-[760px] w-full border-collapse">
                      <thead className="bg-[#F3F4F6]">
                        <tr className="border-b border-[#E5E7EB]">
                          {cols.map((colId, colIndex) => {
                            const isLast = colIndex === cols.length - 1;
                            return (
                            <th
                              key={colId}
                              className={`bg-[#F3F4F6] px-4 py-3 text-sm font-medium uppercase tracking-[0.08em] text-black first:pl-6 last:pr-6 ${
                                isLast ? "border-r-0" : "border-r border-[#E5E7EB]"
                              } ${
                                colId === "name" ? "text-left" : "text-center"
                              } ${colId === "createdDate" ? "min-w-[140px] whitespace-nowrap" : ""}`}
                            >
                              {workerColumnLabel(colId)}
                            </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((w) => (
                          <tr key={w.id} className="border-b border-[#E9EDF3] hover:bg-[#F9FBFB]">
                            {cols.map((colId, colIndex) => {
                              const isLast = colIndex === cols.length - 1;
                              return (
                              <td
                                key={colId}
                                className={`px-4 py-4 align-middle first:pl-6 last:pr-6 ${
                                  isLast ? "border-r-0" : "border-r border-[#EEF2F7]"
                                } ${
                                  colId === "name" ? "text-left" : "text-center"
                                } ${colId === "createdDate" ? "min-w-[140px] whitespace-nowrap" : ""}`}
                              >
                                {renderWorkerListCell(colId, w, formatDateShort)}
                              </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>

      <ColumnsEditorModal
        key={editColumnsOpen ? "worker-cols-open" : "worker-cols-closed"}
        open={editColumnsOpen}
        onOpenChange={setEditColumnsOpen}
        options={WORKER_COLUMN_OPTIONS}
        value={listColumnOrder}
        defaultValue={DEFAULT_WORKER_COLUMNS}
        title="Edit Columns"
        description="Choose which columns appear in the workers list and drag to reorder them."
        onSave={(order) => {
          setListColumnOrder(order);
          saveWorkerColumnOrder(order);
        }}
      />

      <AdvancedSearchModal
        open={advancedSearchOpen}
        onClose={() => setAdvancedSearchOpen(false)}
        initialParams={
          advancedSearchContext.active
            ? {
                lat: advancedSearchContext.lat,
                lng: advancedSearchContext.lng,
                radius: advancedSearchContext.radius,
                place: advancedSearchContext.place,
              }
            : undefined
        }
        onViewResults={(params) => {
          const nextParams: AdvancedSearchParams = {
            lat: params.lat,
            lng: params.lng,
            radius: params.radius,
            ...(params.place ? { place: params.place } : {}),
          };
          applyAdvancedSearchParams(nextParams);
          void loadWorkers(nextParams);
          router.replace("/admin_recruiter/workers");
          setAdvancedSearchOpen(false);
        }}
      />
    </div>
  );
}
