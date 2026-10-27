"use client";

/* eslint-disable @next/next/no-img-element -- Figma SVGs keep their own width and height. */

import React, { useState } from "react";
import { Check } from "lucide-react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import {
  BRAAS_PRIMARY,
  BRAAS_SECONDARY,
  readableTextOnBrand,
} from "@/lib/tenant/tenant-branding";

export type ApplicantsFilterBarProps = {
  applicantQuery: string;
  onApplicantQueryChange: (query: string) => void;
  keywordQuery: string;
  onKeywordQueryChange: (keywords: string) => void;
  onSearch: () => void;
  roleFilter: string;
  onRoleFilterChange: (role: string) => void;
  clientFilter: string;
  onClientFilterChange: (client: string) => void;
  matchFilter: string;
  onMatchFilterChange: (match: string) => void;
  ownerFilter: string;
  onOwnerFilterChange: (owner: string) => void;
  highlightMultiJob: boolean;
  onHighlightMultiJobChange: (val: boolean) => void;
  onAddApplicant: () => void;
  onMatchToJob: () => void;
  onOpenAllFilters?: () => void;
  onEditColumns?: () => void;
  activeFilterCount?: number;
  viewMode: "table" | "grid";
  onViewModeChange: (mode: "table" | "grid") => void;
  searching?: boolean;
  roleOptions?: string[];
  clientOptions?: string[];
  ownerOptions?: string[];
  matchOptions?: string[];
};

export function ApplicantsFilterBar({
  applicantQuery,
  onApplicantQueryChange,
  keywordQuery,
  onKeywordQueryChange,
  onSearch,
  roleFilter,
  onRoleFilterChange,
  clientFilter,
  onClientFilterChange,
  matchFilter,
  onMatchFilterChange,
  ownerFilter,
  onOwnerFilterChange,
  highlightMultiJob,
  onHighlightMultiJobChange,
  onAddApplicant,
  onMatchToJob,
  onOpenAllFilters,
  onEditColumns,
  activeFilterCount = 0,
  viewMode,
  onViewModeChange,
  searching = false,
  roleOptions = ["All", "IT Project Manager", "Software Engineer", "ERP Admin", "QA Analyst", "Data Analyst"],
  clientOptions = ["All", "ZippyCorp", "HealthTech", "Nexus Medical", "Apex Systems"],
  ownerOptions = ["All", "Me", "Unassigned"],
  matchOptions = ["All", "Strong", "Review", "Not Match"],
}: ApplicantsFilterBarProps) {
  const branding = useTenantBranding();
  const primaryColor = branding.primaryHex || BRAAS_PRIMARY;
  const secondaryColor = branding.secondaryHex || BRAAS_SECONDARY || "#012352";
  const textOnPrimary = readableTextOnBrand(primaryColor);

  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [matchMenuOpen, setMatchMenuOpen] = useState(false);
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);

  // Close menus on outside click
  React.useEffect(() => {
    function handleGlobalClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.("[data-filter-dropdown]")) {
        setRoleMenuOpen(false);
        setClientMenuOpen(false);
        setMatchMenuOpen(false);
        setOwnerMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleGlobalClick);
    return () => document.removeEventListener("mousedown", handleGlobalClick);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex max-w-[750px] flex-1 items-center rounded-lg border border-[#E5E7EB] bg-white p-1">
          <div className="relative flex flex-1 items-center pl-3">
            <img src="/icons/applicants/icon-search.svg" alt="" className="shrink-0" />
            <input
              type="text"
              value={applicantQuery}
              onChange={(e) => onApplicantQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
              placeholder="Search applicant"
              className="w-full bg-transparent px-3 py-1.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none"
            />
          </div>

          <div className="h-6 w-px bg-[#E2E8F0] shrink-0 mx-1" />

          <div className="flex flex-1 items-center px-2">
            <input
              type="text"
              value={keywordQuery}
              onChange={(e) => onKeywordQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
              placeholder="Search keywords"
              className="w-full bg-transparent px-2 py-1.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={onSearch}
            disabled={searching}
            style={{
              backgroundColor: primaryColor,
              color: textOnPrimary,
            }}
            className="h-8 shrink-0 rounded-lg px-4 text-xs font-semibold leading-4 shadow-sm transition hover:brightness-95 active:scale-[0.98] disabled:opacity-60"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {/* Dropdown Filters on the Right */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Role Dropdown */}
          <div className="relative" data-filter-dropdown>
            <button
              type="button"
              onClick={() => {
                setRoleMenuOpen(!roleMenuOpen);
                setClientMenuOpen(false);
                setMatchMenuOpen(false);
                setOwnerMenuOpen(false);
              }}
              className="inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-medium leading-4 text-[#334155] transition hover:bg-[#F8FAFC]"
            >
              <span className="truncate">Role • {roleFilter || "All"}</span>
              <img src="/icons/applicants/icon-chevron-down.svg" alt="" className="shrink-0" />
            </button>
            {roleMenuOpen && (
              <div className="absolute right-0 z-30 mt-1.5 max-h-64 w-60 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg">
                {roleOptions.map((opt) => {
                  const isAll = opt === "All" || opt === "All Roles" || opt === "All IT";
                  const isSelected = roleFilter ? roleFilter === opt : isAll;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        onRoleFilterChange(isAll ? "" : opt);
                        setRoleMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs text-[#334155] hover:bg-[#F8FAFC]"
                    >
                      <span className="truncate pr-2">{opt}</span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 shrink-0" style={{ color: primaryColor }} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Client Dropdown */}
          <div className="relative" data-filter-dropdown>
            <button
              type="button"
              onClick={() => {
                setClientMenuOpen(!clientMenuOpen);
                setRoleMenuOpen(false);
                setMatchMenuOpen(false);
                setOwnerMenuOpen(false);
              }}
              className="inline-flex h-8 max-w-[200px] items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-medium leading-4 text-[#334155] transition hover:bg-[#F8FAFC]"
            >
              <span className="truncate">Client • {clientFilter || "All"}</span>
              <img src="/icons/applicants/icon-chevron-down.svg" alt="" className="shrink-0" />
            </button>
            {clientMenuOpen && (
              <div className="absolute right-0 z-30 mt-1.5 max-h-64 w-52 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg">
                {clientOptions.map((opt) => {
                  const isAll = opt === "All";
                  const isSelected = clientFilter ? clientFilter === opt : isAll;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        onClientFilterChange(isAll ? "" : opt);
                        setClientMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs text-[#334155] hover:bg-[#F8FAFC]"
                    >
                      <span className="truncate pr-2">{opt}</span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 shrink-0" style={{ color: primaryColor }} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Match Dropdown */}
          <div className="relative" data-filter-dropdown>
            <button
              type="button"
              onClick={() => {
                setMatchMenuOpen(!matchMenuOpen);
                setRoleMenuOpen(false);
                setClientMenuOpen(false);
                setOwnerMenuOpen(false);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-medium leading-4 text-[#334155] transition hover:bg-[#F8FAFC]"
            >
              <span>Match • {matchFilter || "All"}</span>
              <img src="/icons/applicants/icon-chevron-down.svg" alt="" className="shrink-0" />
            </button>
            {matchMenuOpen && (
              <div className="absolute right-0 z-30 mt-1.5 w-44 rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg">
                {matchOptions.map((opt) => {
                  const isAll = opt === "All";
                  const isSelected = matchFilter ? matchFilter === opt : isAll;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        onMatchFilterChange(isAll ? "" : opt);
                        setMatchMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs text-[#334155] hover:bg-[#F8FAFC]"
                    >
                      <span>{opt}</span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 shrink-0" style={{ color: primaryColor }} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Owner Dropdown */}
          <div className="relative" data-filter-dropdown>
            <button
              type="button"
              onClick={() => {
                setOwnerMenuOpen(!ownerMenuOpen);
                setRoleMenuOpen(false);
                setClientMenuOpen(false);
                setMatchMenuOpen(false);
              }}
              className="inline-flex h-8 max-w-[200px] items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-medium leading-4 text-[#334155] transition hover:bg-[#F8FAFC]"
            >
              <span className="truncate">Owner • {ownerFilter || "All"}</span>
              <img src="/icons/applicants/icon-chevron-down.svg" alt="" className="shrink-0" />
            </button>
            {ownerMenuOpen && (
              <div className="absolute right-0 z-30 mt-1.5 max-h-64 w-48 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg">
                {ownerOptions.map((opt) => {
                  const isAll = opt === "All" || opt === "All Recruiters";
                  const isSelected = ownerFilter ? ownerFilter === opt : isAll;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        onOwnerFilterChange(isAll ? "" : opt);
                        setOwnerMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs text-[#334155] hover:bg-[#F8FAFC]"
                    >
                      <span className="truncate pr-2">{opt}</span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 shrink-0" style={{ color: primaryColor }} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar / Actions Row */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEditColumns}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white transition hover:bg-[#F8FAFC]"
            title="Columns view"
            aria-label="Columns view"
          >
            <img src="/icons/applicants/icon-columns.svg" alt="" />
          </button>
          <button
            type="button"
            onClick={onOpenAllFilters}
            className="relative inline-flex size-8 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white transition hover:bg-[#F8FAFC]"
            title="All Filters"
            aria-label="All Filters"
          >
            <img src="/icons/applicants/icon-filters.svg" alt="" />
            {activeFilterCount > 0 && (
              <span
                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                style={{ backgroundColor: primaryColor, color: textOnPrimary }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          <button
            type="button"
            onClick={onAddApplicant}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3.5 text-xs font-semibold leading-4 text-[#475569] transition hover:bg-[#F8FAFC] active:scale-[0.98]"
          >
            <img src="/icons/applicants/icon-add-applicant.svg" alt="" />
            <span>Add Applicant</span>
          </button>

          <button
            type="button"
            onClick={onMatchToJob}
            style={{
              backgroundColor: primaryColor,
              color: textOnPrimary,
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold leading-4 transition hover:brightness-95 active:scale-[0.98]"
          >
            <img src="/icons/applicants/icon-match-job.svg" alt="" />
            <span>Match to a job</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onViewModeChange("table")}
              className={`inline-flex size-8 items-center justify-center rounded-lg border bg-white transition ${
                viewMode === "table" ? "border-[#BC8B41]" : "border-[#CBD5E1]"
              }`}
              title="Table view"
              aria-label="Table view"
              aria-pressed={viewMode === "table"}
            >
              <img src="/icons/applicants/icon-list.svg" alt="" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              className={`inline-flex size-8 items-center justify-center rounded-lg border bg-white transition ${
                viewMode === "grid" ? "border-[#BC8B41]" : "border-[#CBD5E1]"
              }`}
              title="Grid view"
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
            >
              <img src="/icons/applicants/icon-grid.svg" alt="" />
            </button>
          </div>
        </div>
      </div>

      <label className="flex cursor-pointer select-none items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={highlightMultiJob}
          onClick={() => onHighlightMultiJobChange(!highlightMultiJob)}
          style={highlightMultiJob ? { backgroundColor: secondaryColor } : undefined}
          className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
            highlightMultiJob ? "" : "bg-[#CBD5E1]"
          }`}
        >
          <span
            className={`pointer-events-none mt-1 inline-block size-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              highlightMultiJob ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </button>
        <span className="text-xs font-normal leading-4 text-[#374151]">
          Highlight Multi-Job Applicants
        </span>
      </label>
    </div>
  );
}
