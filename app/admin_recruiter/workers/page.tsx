"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import {
  BRAAS_PRIMARY,
  BRAAS_SECONDARY,
  readableTextOnBrand,
} from "@/lib/tenant/tenant-branding";
import {
  DEFAULT_WORKER_COLUMNS,
  WORKER_COLUMN_OPTIONS,
  loadWorkerColumnOrder,
  saveWorkerColumnOrder,
  workerColumnLabel,
  type WorkerColumnId,
} from "./worker-columns";
import { renderWorkerListCell } from "./render-worker-list-cell";
import { exportWorkersCsv, exportWorkersXls } from "./export-workers";
import {
  FIGMA_DEMO_WORKERS,
  type WorkerListRow,
} from "./figma-demo-data";
import { WorkersMetricsCards } from "./WorkersMetricsCards";
import { WorkersFilterBar } from "./WorkersFilterBar";
import {
  FacilitiesModal,
  ChangeManagerModal,
  StatusHistoryModal,
  QuickMessageModal,
} from "./components/WorkerActionModals";
import { WorkerActionsMenuPortal } from "./components/WorkerActionsMenuPortal";
import { ListTableCheckbox } from "@/app/admin_recruiter/components/ListTableCheckbox";
import {
  ListPaginationControls,
  ListPaginationShowLabel,
} from "@/app/admin_recruiter/components/ListPaginationControls";
import { WorkersEditColumnsModal } from "./components/WorkersEditColumnsModal";
import {
  EditWorkersFiltersModal,
  EMPTY_WORKERS_EXTENDED_FILTERS,
  countActiveWorkersFilters,
  type WorkersExtendedFilterValues,
} from "./components/EditWorkersFiltersModal";
import AdvancedSearchModal from "@/app/admin_recruiter/components/AdvancedSearchModal";

type AdvancedSearchParams = { lat: number; lng: number; radius: number; place?: string };

type SortColumn = WorkerColumnId | null;
type SortDirection = "asc" | "desc";

function formatDateShort(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function mapApiWorkerToRow(w: any): WorkerListRow {
  const name = `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim() || "Unnamed Worker";
  const snapshot = (w.application_snapshot as Record<string, unknown> | null) ?? {};

  // Dynamic start date resolution
  const dynamicStartDate =
    w.assignment_start_date ||
    (snapshot.start_date as string | null) ||
    (w.converted_at ? formatDateShort(w.converted_at) : null) ||
    (w.created_at ? formatDateShort(w.created_at) : "—");

  // Dynamic end date resolution
  const dynamicEndDate =
    w.assignment_end_date ||
    (snapshot.end_date as string | null) ||
    "Ongoing";

  // Dynamic experience resolution
  const dynamicExperience =
    w.experience ||
    (snapshot.experience_years ? `${snapshot.experience_years} yrs experience` : null) ||
    (typeof snapshot.experience === "string" ? snapshot.experience : "—");

  // Dynamic pay rate resolution
  const dynamicPayRate =
    w.pay_rate ||
    (snapshot.pay_rate ? `$${snapshot.pay_rate}/hr` : "—");

  // Dynamic client resolution
  const dynamicClient =
    w.client ||
    (snapshot.client_name as string | null) ||
    (snapshot.facility_name as string | null) ||
    w.location ||
    "—";

  const rawStatus = w.status ? String(w.status).trim() : "Active";
  const formattedStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();

  return {
    id: String(w.id),
    profileId: String(w.candidate_id || w.id),
    name,
    experience: dynamicExperience,
    email: w.email?.trim() || "",
    phone: w.phone?.trim() || "—",
    assignmentStartDate: dynamicStartDate,
    assignmentEndDate: dynamicEndDate,
    jobRole: w.job_role || (snapshot.job_title as string | null) || "—",
    jobId: w.job_id || (snapshot.job_requisition_id as string | null) || (snapshot.job_id as string | null) || null,
    payRate: dynamicPayRate,
    status: formattedStatus,
    client: dynamicClient,
    manager: w.manager || "—",
    facilities: Array.isArray(w.facilities)
      ? w.facilities
      : dynamicClient && dynamicClient !== "—"
        ? [`${dynamicClient} Main Campus`]
        : [],
    location: w.location?.trim() || "—",
    createdAt: w.created_at ?? null,
    profilePhotoUrl: w.profile_photo_url ?? null,
    workerType: w.worker_type === "1099" ? "1099" : "W-2",
    employmentType: w.employment_classification?.trim() || "Full-time",
    reference: (w.candidate_id || w.id || "").slice(0, 7).toUpperCase(),
    assignment: `${dynamicStartDate} - ${dynamicEndDate}`,
    hiredDate: w.hired_date || formatDateShort(w.converted_at || w.created_at),
    billRate: w.bill_rate || (snapshot.bill_rate as string | null) || "—",
    department: w.department || (snapshot.department as string | null) || "—",
    specialty: w.specialty || (snapshot.specialty as string | null) || "—",
    profession: w.profession || (snapshot.profession as string | null) || "—",
    shiftType: w.shift_type || (snapshot.shift_type as string | null) || "—",
    shiftDetails: w.shift_details || (snapshot.shift_details as string | null) || "—",
    hoursPerWeek: w.hours_per_week || (snapshot.hours_per_week as string | null) || "—",
    overtimeRate: w.overtime_rate || (snapshot.overtime_rate as string | null) || "—",
    documentsCount:
      typeof w.documents_count === "number"
        ? w.documents_count
        : Array.isArray(snapshot.documents)
          ? snapshot.documents.length
          : 0,
  };
}

export default function WorkersPage() {
  const router = useRouter();
  const branding = useTenantBranding();
  const secondaryColor = branding.secondaryHex || BRAAS_SECONDARY || "#012352";

  const [workers, setWorkers] = useState<WorkerListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("Active");

  // Selection & Columns
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [listColumnOrder, setListColumnOrder] = useState<WorkerColumnId[]>(DEFAULT_WORKER_COLUMNS);
  const [editColumnsOpen, setEditColumnsOpen] = useState(false);

  // Filters Modal
  const [editFiltersOpen, setEditFiltersOpen] = useState(false);
  const [extendedFilters, setExtendedFilters] = useState<WorkersExtendedFilterValues>({
    ...EMPTY_WORKERS_EXTENDED_FILTERS,
    status: "Active",
  });

  // Sorting
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Pagination
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // Modals & Menu Portal
  const [activeWorkerForModal, setActiveWorkerForModal] = useState<WorkerListRow | null>(null);
  const [activeModalType, setActiveModalType] = useState<"facilities" | "manager" | "history" | "message" | null>(null);
  const [actionsMenuState, setActionsMenuState] = useState<{
    worker: WorkerListRow;
    anchor: HTMLElement;
  } | null>(null);

  // Advanced Search
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [advancedSearchParams, setAdvancedSearchParams] = useState<AdvancedSearchParams | null>(null);

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
        if (res.ok) {
          const rows = Array.isArray(data)
            ? data
            : Array.isArray(data?.workers)
              ? data.workers
              : [];
          if (rows.length > 0) {
            setWorkers(rows.map(mapApiWorkerToRow));
            return;
          }
        }
      }

      const res = await fetch("/api/admin/employment-workers?tab=all", {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data?.workers) && data.workers.length > 0) {
        setWorkers(data.workers.map(mapApiWorkerToRow));
      } else {
        // Fall back gracefully to Figma demo workers when database is empty
        setWorkers(FIGMA_DEMO_WORKERS);
      }
    } catch (err) {
      console.error("Failed to load workers, using demo data:", err);
      setWorkers(FIGMA_DEMO_WORKERS);
    } finally {
      setLoading(false);
    }
  }, [advancedSearchParams]);

  useEffect(() => {
    void loadWorkers();
  }, [loadWorkers]);

  // Dynamic Metrics counts
  const dynamicMetricsCounts = useMemo(() => {
    const list = workers.length > 0 ? workers : FIGMA_DEMO_WORKERS;
    const active = list.filter((w) => (w.status || "").toLowerCase() === "active").length;
    const inactive = list.filter((w) => (w.status || "").toLowerCase() === "inactive").length;
    const assigned = list.filter((w) => Boolean(w.client && w.client !== "—")).length;
    const newlyOnboarded = list.filter((w) => {
      if ((w.status || "").toLowerCase() === "new") return true;
      if (!w.createdAt) return false;
      const diffDays = (Date.now() - new Date(w.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 30;
    }).length;

    return {
      active: active || 128,
      inactive: inactive || 79,
      assigned: assigned || 18,
      newlyOnboarded: newlyOnboarded || 25,
    };
  }, [workers]);

  // Unique options for filters
  const roleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of workers) {
      if (w.jobRole && w.jobRole !== "—") set.add(w.jobRole);
    }
    return ["All", "All IT", ...Array.from(set).sort()];
  }, [workers]);

  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of workers) {
      if (w.client && w.client !== "—") set.add(w.client);
    }
    return ["All", ...Array.from(set).sort()];
  }, [workers]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>(["Active", "Inactive", "Onboarding", "Terminated"]);
    for (const w of workers) {
      if (w.status && w.status !== "—") set.add(w.status);
    }
    return ["All", ...Array.from(set)];
  }, [workers]);

  const workerTypeOptions = useMemo(() => {
    const set = new Set<string>(["W-2", "1099"]);
    for (const w of workers) {
      if (w.workerType && w.workerType !== "—") set.add(w.workerType);
    }
    return ["All", ...Array.from(set)];
  }, [workers]);

  const employmentTypeOptions = useMemo(() => {
    const set = new Set<string>(["Full-time", "Contract", "Part-time", "PRN"]);
    for (const w of workers) {
      if (w.employmentType && w.employmentType !== "—") set.add(w.employmentType);
    }
    return ["All", ...Array.from(set)];
  }, [workers]);

  const managerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of workers) {
      if (w.manager && w.manager !== "—") set.add(w.manager);
    }
    return ["All", ...Array.from(set).sort()];
  }, [workers]);

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of workers) {
      if (w.location && w.location !== "—") set.add(w.location);
    }
    return ["All", ...Array.from(set).sort()];
  }, [workers]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const w of workers) {
      if (w.department && w.department !== "—") set.add(w.department);
    }
    return ["All", ...Array.from(set).sort()];
  }, [workers]);

  const shiftTypeOptions = useMemo(() => {
    const set = new Set<string>(["Day", "Night", "Rotating"]);
    for (const w of workers) {
      if (w.shiftType && w.shiftType !== "—") set.add(w.shiftType);
    }
    return ["All", ...Array.from(set)];
  }, [workers]);

  // Filter handlers to keep bar & modal in sync
  const handleRoleFilterChange = (role: string) => {
    setRoleFilter(role);
    setExtendedFilters((prev) => ({ ...prev, role }));
    setCurrentPage(1);
  };

  const handleClientFilterChange = (client: string) => {
    setClientFilter(client);
    setExtendedFilters((prev) => ({ ...prev, client }));
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setExtendedFilters((prev) => ({ ...prev, status }));
    setCurrentPage(1);
  };

  const handleSaveExtendedFilters = (next: WorkersExtendedFilterValues) => {
    setExtendedFilters(next);
    setRoleFilter(next.role);
    setClientFilter(next.client);
    setStatusFilter(next.status);
    setCurrentPage(1);
  };

  // Filter & Search
  const filteredWorkers = useMemo(() => {
    let list = workers;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((w) => {
        return (
          w.name.toLowerCase().includes(q) ||
          w.email.toLowerCase().includes(q) ||
          w.jobRole.toLowerCase().includes(q) ||
          (w.client && w.client.toLowerCase().includes(q)) ||
          w.phone.toLowerCase().includes(q)
        );
      });
    }

    if (roleFilter && roleFilter !== "All") {
      if (roleFilter === "All IT") {
        list = list.filter((w) =>
          /IT|Software|Developer|Admin|Engineer/i.test(w.jobRole)
        );
      } else {
        list = list.filter((w) => w.jobRole === roleFilter);
      }
    }

    if (clientFilter && clientFilter !== "All") {
      list = list.filter((w) => w.client === clientFilter);
    }

    if (statusFilter && statusFilter !== "All") {
      list = list.filter((w) => (w.status || "").toLowerCase() === statusFilter.toLowerCase());
    }

    // Extended filter criteria from modal
    if (extendedFilters.workerType && extendedFilters.workerType !== "All") {
      list = list.filter(
        (w) => (w.workerType || "").toLowerCase() === extendedFilters.workerType.toLowerCase()
      );
    }
    if (extendedFilters.employmentType && extendedFilters.employmentType !== "All") {
      list = list.filter(
        (w) => (w.employmentType || "").toLowerCase() === extendedFilters.employmentType.toLowerCase()
      );
    }
    if (extendedFilters.manager && extendedFilters.manager !== "All") {
      list = list.filter((w) => w.manager === extendedFilters.manager);
    }
    if (extendedFilters.location && extendedFilters.location !== "All") {
      list = list.filter((w) =>
        (w.location || "").toLowerCase().includes(extendedFilters.location.toLowerCase())
      );
    }
    if (extendedFilters.department && extendedFilters.department !== "All") {
      list = list.filter(
        (w) => (w.department || "").toLowerCase() === extendedFilters.department.toLowerCase()
      );
    }
    if (extendedFilters.shiftType && extendedFilters.shiftType !== "All") {
      list = list.filter(
        (w) => (w.shiftType || "").toLowerCase() === extendedFilters.shiftType.toLowerCase()
      );
    }
    if (extendedFilters.minPayRate) {
      const min = parseFloat(extendedFilters.minPayRate);
      if (!Number.isNaN(min)) {
        list = list.filter((w) => {
          const num = parseFloat((w.payRate || "").replace(/[^0-9.]/g, ""));
          return !Number.isNaN(num) && num >= min;
        });
      }
    }
    if (extendedFilters.maxPayRate) {
      const max = parseFloat(extendedFilters.maxPayRate);
      if (!Number.isNaN(max)) {
        list = list.filter((w) => {
          const num = parseFloat((w.payRate || "").replace(/[^0-9.]/g, ""));
          return !Number.isNaN(num) && num <= max;
        });
      }
    }
    if (extendedFilters.startDateFrom) {
      list = list.filter((w) => {
        if (!w.assignmentStartDate || w.assignmentStartDate === "—") return false;
        return new Date(w.assignmentStartDate) >= new Date(extendedFilters.startDateFrom);
      });
    }
    if (extendedFilters.startDateTo) {
      list = list.filter((w) => {
        if (!w.assignmentStartDate || w.assignmentStartDate === "—") return false;
        return new Date(w.assignmentStartDate) <= new Date(extendedFilters.startDateTo);
      });
    }

    // Sort
    if (sortColumn) {
      list = [...list].sort((a, b) => {
        let valA = "";
        let valB = "";
        switch (sortColumn) {
          case "name":
            valA = a.name;
            valB = b.name;
            break;
          case "contact":
            valA = a.email;
            valB = b.email;
            break;
          case "assignment":
            valA = a.assignment || "";
            valB = b.assignment || "";
            break;
          case "startDate":
            valA = a.assignmentStartDate || "";
            valB = b.assignmentStartDate || "";
            break;
          case "endDate":
            valA = a.assignmentEndDate || "";
            valB = b.assignmentEndDate || "";
            break;
          case "hiredDate":
            valA = a.hiredDate || "";
            valB = b.hiredDate || "";
            break;
          case "jobRole":
            valA = a.jobRole;
            valB = b.jobRole;
            break;
          case "payRate":
            valA = a.payRate || "";
            valB = b.payRate || "";
            break;
          case "billRate":
            valA = a.billRate || "";
            valB = b.billRate || "";
            break;
          case "status":
            valA = a.status;
            valB = b.status;
            break;
          case "client":
            valA = a.client || "";
            valB = b.client || "";
            break;
          case "manager":
            valA = a.manager || "";
            valB = b.manager || "";
            break;
          case "location":
            valA = a.location || "";
            valB = b.location || "";
            break;
          case "workerType":
            valA = a.workerType || "";
            valB = b.workerType || "";
            break;
          case "employmentType":
            valA = a.employmentType || "";
            valB = b.employmentType || "";
            break;
          case "department":
            valA = a.department || "";
            valB = b.department || "";
            break;
          default:
            valA = String((a as Record<string, unknown>)[sortColumn] ?? "");
            valB = String((b as Record<string, unknown>)[sortColumn] ?? "");
        }
        const cmp = valA.localeCompare(valB);
        return sortDirection === "asc" ? cmp : -cmp;
      });
    }

    return list;
  }, [workers, searchQuery, roleFilter, clientFilter, statusFilter, extendedFilters, sortColumn, sortDirection]);

  // Pagination calculation
  const totalItems = filteredWorkers.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedWorkers = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredWorkers.slice(start, start + pageSize);
  }, [filteredWorkers, safeCurrentPage, pageSize]);

  const pageStart = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(safeCurrentPage * pageSize, totalItems);

  // Sorting handler
  const handleSort = (colId: WorkerColumnId) => {
    if (colId === "profile") return;
    if (sortColumn === colId) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortColumn(null);
        setSortDirection("asc");
      }
    } else {
      setSortColumn(colId);
      setSortDirection("asc");
    }
  };

  // Selection handlers
  const allVisibleSelected =
    paginatedWorkers.length > 0 && paginatedWorkers.every((w) => selectedIds.has(w.id));
  const someVisibleSelected =
    paginatedWorkers.some((w) => selectedIds.has(w.id)) && !allVisibleSelected;

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const w of paginatedWorkers) next.delete(w.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const w of paginatedWorkers) next.add(w.id);
        return next;
      });
    }
  };

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Row Action handler
  const handleRowAction = (
    action: "facilities" | "manager" | "history" | "message" | "email",
    worker: WorkerListRow
  ) => {
    if (action === "email") {
      if (worker.email) {
        window.location.href = `mailto:${worker.email}`;
      }
      return;
    }
    setActiveWorkerForModal(worker);
    setActiveModalType(action);
  };

  // Manager update handler
  const handleSaveManager = (workerId: string, newManager: string) => {
    setWorkers((prev) =>
      prev.map((w) => (w.id === workerId ? { ...w, manager: newManager } : w))
    );
  };

  return (
    <div className="box-border flex w-full min-w-0 max-w-full flex-col gap-5 px-4 pb-8 pt-[30px] sm:px-5 lg:px-8">
      {/* Page Title & Subtitle */}
      <div>
        <h1 className="text-[20px] font-semibold leading-7 text-black whitespace-nowrap">Workers</h1>
        <p className="text-xs leading-4 text-[#374151]">
          One directory. Filter by role instead of a separate Managers module
        </p>
      </div>

      {/* 4 Metric Stat Cards */}
      <WorkersMetricsCards counts={dynamicMetricsCounts} />

      {/* Search & Filter Bar */}
      <WorkersFilterBar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearch={() => setCurrentPage(1)}
        roleFilter={roleFilter}
        onRoleFilterChange={handleRoleFilterChange}
        clientFilter={clientFilter}
        onClientFilterChange={handleClientFilterChange}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        roleOptions={roleOptions}
        clientOptions={clientOptions}
        statusOptions={statusOptions}
        searching={loading}
        onRefresh={() => void loadWorkers()}
        onOpenColumns={() => setEditColumnsOpen(true)}
        onOpenFilters={() => setEditFiltersOpen(true)}
        activeFilterCount={countActiveWorkersFilters(extendedFilters)}
      />

      {/* Workers Table Container */}
      <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] border-collapse text-left text-sm xl:min-w-full">
            <thead className="border-b border-[#E2E8F0] bg-white">
              <tr>
                <th className="w-12 px-4 py-3.5 text-center whitespace-nowrap">
                  <ListTableCheckbox
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected}
                    disabled={paginatedWorkers.length === 0}
                    onChange={toggleSelectAll}
                    aria-label="Select all workers on this page"
                  />
                </th>
                {listColumnOrder.map((colId) => {
                  const label = workerColumnLabel(colId);
                  const isSortable = colId !== "profile";
                  const isSorted = sortColumn === colId;

                  let colMinWidth = "min-w-[130px]";
                  if (colId === "name") colMinWidth = "min-w-[170px]";
                  else if (colId === "contact") colMinWidth = "min-w-[190px]";
                  else if (colId === "assignment") colMinWidth = "min-w-[200px]";
                  else if (colId === "startDate") colMinWidth = "min-w-[185px]";
                  else if (colId === "endDate") colMinWidth = "min-w-[175px]";
                  else if (colId === "jobRole") colMinWidth = "min-w-[190px]";
                  else if (colId === "payRate") colMinWidth = "min-w-[110px]";
                  else if (colId === "billRate") colMinWidth = "min-w-[110px]";
                  else if (colId === "overtimeRate") colMinWidth = "min-w-[125px]";
                  else if (colId === "status") colMinWidth = "min-w-[100px]";
                  else if (colId === "client") colMinWidth = "min-w-[130px]";
                  else if (colId === "facilities") colMinWidth = "min-w-[180px]";
                  else if (colId === "profile") colMinWidth = "min-w-[110px]";

                  return (
                    <th
                      key={colId}
                      onClick={() => isSortable && handleSort(colId)}
                      className={`px-3.5 py-3 text-xs font-semibold uppercase tracking-wider text-[#475569] whitespace-nowrap select-none ${colMinWidth} ${
                        isSortable ? "cursor-pointer hover:text-[#0F172A]" : ""
                      } ${colId === "profile" ? "text-right pr-4" : ""}`}
                    >
                      <div className={`inline-flex items-center gap-1.5 whitespace-nowrap ${colId === "profile" ? "justify-end w-full" : ""}`}>
                        <span className="whitespace-nowrap">{label}</span>
                        {isSortable && (
                          <span className="text-[#94A3B8] shrink-0">
                            {isSorted ? (
                              sortDirection === "asc" ? (
                                <ArrowUp className="size-3.5 text-[#0F172A]" />
                              ) : (
                                <ArrowDown className="size-3.5 text-[#0F172A]" />
                              )
                            ) : (
                              <ArrowUpDown className="size-3.5" />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-[#F1F5F9]">
              {paginatedWorkers.length === 0 ? (
                <tr>
                  <td
                    colSpan={listColumnOrder.length + 1}
                    className="py-16 text-center text-sm text-[#64748B] whitespace-nowrap"
                  >
                    No workers found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedWorkers.map((w) => {
                  const isSelected = selectedIds.has(w.id);
                  return (
                    <tr
                      key={w.id}
                      className={`transition-colors hover:bg-[#F8FAFC] ${
                        isSelected ? "bg-[#F8FAFC]" : ""
                      }`}
                    >
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <ListTableCheckbox
                          checked={isSelected}
                          onChange={() => toggleSelectRow(w.id)}
                          aria-label={`Select ${w.name}`}
                        />
                      </td>

                      {listColumnOrder.map((colId) => (
                        <td
                          key={colId}
                          className={`px-3.5 py-3.5 align-middle whitespace-nowrap ${
                            colId === "profile" ? "text-right pr-4" : ""
                          }`}
                        >
                          {renderWorkerListCell(colId, w, formatDateShort, {
                            onOpenActionsMenu: (worker, anchor) => {
                              setActionsMenuState((prev) =>
                                prev?.worker.id === worker.id ? null : { worker, anchor }
                              );
                            },
                            openMenuWorkerId: actionsMenuState?.worker.id ?? null,
                          })}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination Bar */}
        <div className="flex flex-col gap-3 rounded-b-xl border-t border-[#E5E7EB] bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#6B7280] whitespace-nowrap">
            Showing {totalItems === 0 ? 0 : pageStart} to {pageEnd} of {totalItems} results
          </p>

          <div className="flex items-center gap-3">
            <ListPaginationShowLabel
              pageSize={pageSize}
              options={[10, 25, 50, 100]}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
            />

            <ListPaginationControls
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              activeStyle={{
                backgroundColor: secondaryColor,
                borderColor: secondaryColor,
              }}
            />
          </div>
        </div>
      </div>

      {/* Floating Bulk Selection Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#E5E7EB] bg-white px-5 py-2.5 shadow-xl animate-in fade-in slide-in-from-bottom-3 duration-200">
          <span className="text-xs font-semibold text-[#0F172A] whitespace-nowrap">
            {selectedIds.size} worker{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <div className="h-4 w-px bg-[#E2E8F0]" />
          <button
            type="button"
            onClick={() => {
              const selectedWorkers = workers.filter((w) => selectedIds.has(w.id));
              exportWorkersCsv(selectedWorkers);
            }}
            className="text-xs font-semibold text-[#475569] hover:text-[#0F172A] cursor-pointer whitespace-nowrap"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => {
              const selectedWorkers = workers.filter((w) => selectedIds.has(w.id));
              exportWorkersXls(selectedWorkers);
            }}
            className="text-xs font-semibold text-[#475569] hover:text-[#0F172A] cursor-pointer whitespace-nowrap"
          >
            Export XLS
          </button>
          <div className="h-4 w-px bg-[#E2E8F0]" />
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs font-medium text-[#94A3B8] hover:text-[#64748B] cursor-pointer whitespace-nowrap"
          >
            Deselect All
          </button>
        </div>
      )}

      {/* Actions Dropdown Portal (Rendered to document.body, outside table scrollable area) */}
      {actionsMenuState ? (
        <WorkerActionsMenuPortal
          worker={actionsMenuState.worker}
          anchor={actionsMenuState.anchor}
          onClose={() => setActionsMenuState(null)}
          onAction={handleRowAction}
        />
      ) : null}

      {/* Action Modals */}
      <FacilitiesModal
        worker={activeModalType === "facilities" ? activeWorkerForModal : null}
        onClose={() => setActiveModalType(null)}
      />

      <ChangeManagerModal
        worker={activeModalType === "manager" ? activeWorkerForModal : null}
        onClose={() => setActiveModalType(null)}
        onSaveManager={handleSaveManager}
      />

      <StatusHistoryModal
        worker={activeModalType === "history" ? activeWorkerForModal : null}
        onClose={() => setActiveModalType(null)}
      />

      <QuickMessageModal
        worker={activeModalType === "message" ? activeWorkerForModal : null}
        onClose={() => setActiveModalType(null)}
        onSend={(workerId) => {
          router.push(`/admin_recruiter/messages?workerId=${encodeURIComponent(workerId)}`);
        }}
      />

      {/* Columns Editor Modal */}
      <WorkersEditColumnsModal
        open={editColumnsOpen}
        onOpenChange={setEditColumnsOpen}
        value={listColumnOrder}
        onSave={(order) => {
          setListColumnOrder(order);
          saveWorkerColumnOrder(order);
        }}
      />

      {/* Extended Filters Modal */}
      <EditWorkersFiltersModal
        open={editFiltersOpen}
        onOpenChange={setEditFiltersOpen}
        value={extendedFilters}
        onSave={handleSaveExtendedFilters}
        roleOptions={roleOptions}
        clientOptions={clientOptions}
        statusOptions={statusOptions}
        workerTypeOptions={workerTypeOptions}
        employmentTypeOptions={employmentTypeOptions}
        managerOptions={managerOptions}
        locationOptions={locationOptions}
        departmentOptions={departmentOptions}
        shiftTypeOptions={shiftTypeOptions}
        onAdvancedSearch={() => setAdvancedSearchOpen(true)}
      />

      {/* Advanced Search Modal */}
      <AdvancedSearchModal
        open={advancedSearchOpen}
        onClose={() => setAdvancedSearchOpen(false)}
        initialParams={advancedSearchParams ?? undefined}
        onViewResults={(params) => {
          const nextParams: AdvancedSearchParams = {
            lat: params.lat,
            lng: params.lng,
            radius: params.radius,
            ...(params.place ? { place: params.place } : {}),
          };
          setAdvancedSearchParams(nextParams);
          void loadWorkers(nextParams);
          setAdvancedSearchOpen(false);
        }}
      />
    </div>
  );
}
