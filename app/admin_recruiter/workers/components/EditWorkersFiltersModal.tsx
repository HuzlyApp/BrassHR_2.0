"use client";

import React, { useEffect, useState, type CSSProperties } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Calendar, MapPin } from "lucide-react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import {
  BRAAS_PRIMARY,
  BRAAS_SECONDARY,
  brandingToCssVars,
} from "@/lib/tenant/tenant-branding";

export type WorkersExtendedFilterValues = {
  role: string;
  client: string;
  status: string;
  workerType: string;
  employmentType: string;
  manager: string;
  location: string;
  department: string;
  shiftType: string;
  minPayRate: string;
  maxPayRate: string;
  startDateFrom: string;
  startDateTo: string;
};

export const EMPTY_WORKERS_EXTENDED_FILTERS: WorkersExtendedFilterValues = {
  role: "",
  client: "",
  status: "",
  workerType: "",
  employmentType: "",
  manager: "",
  location: "",
  department: "",
  shiftType: "",
  minPayRate: "",
  maxPayRate: "",
  startDateFrom: "",
  startDateTo: "",
};

export function countActiveWorkersFilters(v: WorkersExtendedFilterValues): number {
  let count = 0;
  if (v.role && v.role !== "All" && v.role !== "All IT") count++;
  if (v.client && v.client !== "All") count++;
  if (v.status && v.status !== "All") count++;
  if (v.workerType && v.workerType !== "All") count++;
  if (v.employmentType && v.employmentType !== "All") count++;
  if (v.manager && v.manager !== "All") count++;
  if (v.location && v.location !== "All") count++;
  if (v.department && v.department !== "All") count++;
  if (v.shiftType && v.shiftType !== "All") count++;
  if (v.minPayRate) count++;
  if (v.maxPayRate) count++;
  if (v.startDateFrom) count++;
  if (v.startDateTo) count++;
  return count;
}

export type EditWorkersFiltersModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: WorkersExtendedFilterValues;
  onSave: (next: WorkersExtendedFilterValues) => void;
  roleOptions?: string[];
  clientOptions?: string[];
  statusOptions?: string[];
  workerTypeOptions?: string[];
  employmentTypeOptions?: string[];
  managerOptions?: string[];
  locationOptions?: string[];
  departmentOptions?: string[];
  shiftTypeOptions?: string[];
  onAdvancedSearch?: () => void;
};

const FIELD_SURFACE =
  "rounded-lg border border-[#CBD5E1] bg-white h-10 w-full min-w-0 cursor-pointer appearance-none bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat px-3 pr-9 text-sm font-normal leading-6 text-[#334155] hover:bg-zinc-50 focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-0";

const SELECT_CHEVRON = {
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  )}")`,
} as const;

function ModalFilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function EditWorkersFiltersModal({
  open,
  onOpenChange,
  value,
  onSave,
  roleOptions = [],
  clientOptions = [],
  statusOptions = ["All", "Active", "Inactive", "Onboarding", "Terminated"],
  workerTypeOptions = ["All", "W-2", "1099"],
  employmentTypeOptions = ["All", "Full-time", "Contract", "Part-time", "PRN"],
  managerOptions = [],
  locationOptions = [],
  departmentOptions = [],
  shiftTypeOptions = ["All", "Day", "Night", "Rotating"],
  onAdvancedSearch,
}: EditWorkersFiltersModalProps) {
  const branding = useTenantBranding();
  const brandVars = brandingToCssVars(branding) as CSSProperties;
  const primaryGold = branding.primaryHex || BRAAS_PRIMARY || "#C59B27";

  const [draft, setDraft] = useState<WorkersExtendedFilterValues>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const setField = <K extends keyof WorkersExtendedFilterValues>(
    key: K,
    val: WorkersExtendedFilterValues[K]
  ) => {
    setDraft((prev) => ({ ...prev, [key]: val }));
  };

  const handleClear = () => {
    setDraft({ ...EMPTY_WORKERS_EXTENDED_FILTERS });
  };

  const handleApply = () => {
    onSave(draft);
    onOpenChange(false);
  };

  const activeCount = countActiveWorkersFilters(draft);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          style={brandVars}
          className="fixed left-1/2 top-1/2 z-50 flex h-[min(680px,calc(100vh-2rem))] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
            <div className="flex items-center gap-2.5">
              <Dialog.Title className="text-xl font-bold text-[#111827]">
                Filters
              </Dialog.Title>
              {activeCount > 0 && (
                <span
                  style={{ backgroundColor: primaryGold }}
                  className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                >
                  {activeCount}
                </span>
              )}
            </div>
            <Dialog.Close
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black text-white transition hover:opacity-80 focus:outline-none"
              aria-label="Close"
            >
              <X className="size-4" strokeWidth={2.5} />
            </Dialog.Close>
          </div>

          {/* Form Body */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
              {/* Role */}
              <ModalFilterField label="Job Role">
                <select
                  value={draft.role}
                  onChange={(e) => setField("role", e.target.value)}
                  style={SELECT_CHEVRON}
                  className={FIELD_SURFACE}
                >
                  <option value="">All Roles</option>
                  {roleOptions
                    .filter((r) => r !== "All" && r !== "All IT")
                    .map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                </select>
              </ModalFilterField>

              {/* Client */}
              <ModalFilterField label="Client / Facility">
                <select
                  value={draft.client}
                  onChange={(e) => setField("client", e.target.value)}
                  style={SELECT_CHEVRON}
                  className={FIELD_SURFACE}
                >
                  <option value="">All Clients</option>
                  {clientOptions
                    .filter((c) => c !== "All")
                    .map((client) => (
                      <option key={client} value={client}>
                        {client}
                      </option>
                    ))}
                </select>
              </ModalFilterField>

              {/* Status */}
              <ModalFilterField label="Status">
                <select
                  value={draft.status}
                  onChange={(e) => setField("status", e.target.value)}
                  style={SELECT_CHEVRON}
                  className={FIELD_SURFACE}
                >
                  <option value="">All Statuses</option>
                  {statusOptions
                    .filter((s) => s !== "All")
                    .map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                </select>
              </ModalFilterField>

              {/* Worker Type */}
              <ModalFilterField label="Worker Type">
                <select
                  value={draft.workerType}
                  onChange={(e) => setField("workerType", e.target.value)}
                  style={SELECT_CHEVRON}
                  className={FIELD_SURFACE}
                >
                  <option value="">All Worker Types</option>
                  {workerTypeOptions
                    .filter((w) => w !== "All")
                    .map((wt) => (
                      <option key={wt} value={wt}>
                        {wt}
                      </option>
                    ))}
                </select>
              </ModalFilterField>

              {/* Employment Type */}
              <ModalFilterField label="Employment Type">
                <select
                  value={draft.employmentType}
                  onChange={(e) => setField("employmentType", e.target.value)}
                  style={SELECT_CHEVRON}
                  className={FIELD_SURFACE}
                >
                  <option value="">All Employment Types</option>
                  {employmentTypeOptions
                    .filter((et) => et !== "All")
                    .map((et) => (
                      <option key={et} value={et}>
                        {et}
                      </option>
                    ))}
                </select>
              </ModalFilterField>

              {/* Manager */}
              <ModalFilterField label="Manager">
                <select
                  value={draft.manager}
                  onChange={(e) => setField("manager", e.target.value)}
                  style={SELECT_CHEVRON}
                  className={FIELD_SURFACE}
                >
                  <option value="">All Managers</option>
                  {managerOptions
                    .filter((m) => m !== "All")
                    .map((mgr) => (
                      <option key={mgr} value={mgr}>
                        {mgr}
                      </option>
                    ))}
                </select>
              </ModalFilterField>

              {/* Location */}
              <ModalFilterField label="Location">
                <select
                  value={draft.location}
                  onChange={(e) => setField("location", e.target.value)}
                  style={SELECT_CHEVRON}
                  className={FIELD_SURFACE}
                >
                  <option value="">All Locations</option>
                  {locationOptions
                    .filter((l) => l !== "All")
                    .map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                </select>
              </ModalFilterField>

              {/* Department */}
              <ModalFilterField label="Department">
                <select
                  value={draft.department}
                  onChange={(e) => setField("department", e.target.value)}
                  style={SELECT_CHEVRON}
                  className={FIELD_SURFACE}
                >
                  <option value="">All Departments</option>
                  {departmentOptions
                    .filter((d) => d !== "All")
                    .map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                </select>
              </ModalFilterField>

              {/* Shift Type */}
              <ModalFilterField label="Shift Type">
                <select
                  value={draft.shiftType}
                  onChange={(e) => setField("shiftType", e.target.value)}
                  style={SELECT_CHEVRON}
                  className={FIELD_SURFACE}
                >
                  <option value="">All Shifts</option>
                  {shiftTypeOptions
                    .filter((s) => s !== "All")
                    .map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                </select>
              </ModalFilterField>

              {/* Pay Rate Range */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                  Hourly Pay Rate Range ($/hr)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Min $/hr"
                    value={draft.minPayRate}
                    onChange={(e) => setField("minPayRate", e.target.value)}
                    className="h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[color:var(--brand-primary)]"
                  />
                  <input
                    type="number"
                    placeholder="Max $/hr"
                    value={draft.maxPayRate}
                    onChange={(e) => setField("maxPayRate", e.target.value)}
                    className="h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[color:var(--brand-primary)]"
                  />
                </div>
              </div>

              {/* Assignment Start Date (From - To) */}
              <div className="sm:col-span-2 flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                  Assignment Start Date Range
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-[#64748B]">From</span>
                    <input
                      type="date"
                      value={draft.startDateFrom}
                      onChange={(e) => setField("startDateFrom", e.target.value)}
                      className="h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[color:var(--brand-primary)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-[#64748B]">To</span>
                    <input
                      type="date"
                      value={draft.startDateTo}
                      onChange={(e) => setField("startDateTo", e.target.value)}
                      className="h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[color:var(--brand-primary)]"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Map Search Action */}
            {onAdvancedSearch && (
              <div className="mt-6 border-t border-[#E5E7EB] pt-5">
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onAdvancedSearch();
                  }}
                  style={{
                    borderColor: primaryGold,
                    color: primaryGold,
                  }}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border bg-white px-4 text-sm font-semibold transition hover:bg-amber-50/40 cursor-pointer"
                >
                  <MapPin className="size-4" />
                  Search by Map & Radius
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between border-t border-[#E5E7EB] px-6 py-4">
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-[#475569] transition hover:bg-gray-50 cursor-pointer"
            >
              Clear All
            </button>

            <div className="flex items-center gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-[#374151] transition hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
              </Dialog.Close>

              <button
                type="button"
                onClick={handleApply}
                style={{
                  backgroundColor: primaryGold,
                }}
                className="rounded-lg px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:brightness-95 cursor-pointer"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

