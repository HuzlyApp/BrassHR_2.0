"use client";

import React, { useState, useEffect } from "react";
import { Search, ChevronDown, Check, LayoutList, SlidersHorizontal, RefreshCw } from "lucide-react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import {
  BRAAS_PRIMARY,
  BRAAS_SECONDARY,
  readableTextOnBrand,
} from "@/lib/tenant/tenant-branding";

export type WorkersFilterBarProps = {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearch: () => void;
  roleFilter: string;
  onRoleFilterChange: (role: string) => void;
  clientFilter: string;
  onClientFilterChange: (client: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  roleOptions: string[];
  clientOptions: string[];
  statusOptions: string[];
  searching?: boolean;
  onRefresh?: () => void;
  onOpenColumns?: () => void;
  onOpenFilters?: () => void;
  activeFilterCount?: number;
};

export function WorkersFilterBar({
  searchQuery,
  onSearchQueryChange,
  onSearch,
  roleFilter,
  onRoleFilterChange,
  clientFilter,
  onClientFilterChange,
  statusFilter,
  onStatusFilterChange,
  roleOptions = ["All", "IT Project Manager", "Oracle Fusion ERP Admin", "Software Engineer", "Medical Assistant", "Production Supervisor"],
  clientOptions = ["All", "Lennox", "Freddie Mac", "HealthTech", "Nexus Medical"],
  statusOptions = ["All", "Active", "Inactive", "Onboarding"],
  searching = false,
  onRefresh,
  onOpenColumns,
  onOpenFilters,
  activeFilterCount = 0,
}: WorkersFilterBarProps) {
  const branding = useTenantBranding();
  const primaryColor = branding.primaryHex || BRAAS_PRIMARY;
  const secondaryColor = branding.secondaryHex || BRAAS_SECONDARY || "#012352";
  const textOnPrimary = readableTextOnBrand(primaryColor);

  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  useEffect(() => {
    function handleGlobalClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.("[data-filter-dropdown]")) {
        setRoleMenuOpen(false);
        setClientMenuOpen(false);
        setStatusMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleGlobalClick);
    return () => document.removeEventListener("mousedown", handleGlobalClick);
  }, []);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        {/* Search input box with branding Search button */}
        <div className="flex max-w-[480px] flex-1 items-center rounded-lg border border-[#E5E7EB] bg-white p-1 shadow-2xs">
          <div className="relative flex flex-1 items-center pl-3">
            <Search className="h-4 w-4 shrink-0 text-[#94A3B8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
              placeholder="Search worker"
              className="w-full bg-transparent px-3 py-1.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none"
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
            className="h-8 shrink-0 rounded-lg px-4 text-xs font-semibold leading-4 shadow-xs transition hover:brightness-95 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {/* Filter Dropdowns on the right */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Role Dropdown */}
          <div className="relative" data-filter-dropdown>
            <button
              type="button"
              onClick={() => {
                setRoleMenuOpen(!roleMenuOpen);
                setClientMenuOpen(false);
                setStatusMenuOpen(false);
              }}
              className="inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-medium leading-4 text-[#334155] transition hover:bg-[#F8FAFC] cursor-pointer"
            >
              <span className="truncate">Role • {roleFilter || "All IT"}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
            </button>
            {roleMenuOpen && (
              <div className="absolute right-0 z-30 mt-1.5 max-h-64 w-60 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg">
                {roleOptions.map((opt) => {
                  const isAll = opt === "All" || opt === "All IT";
                  const isSelected = roleFilter ? roleFilter === opt : isAll;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        onRoleFilterChange(isAll ? "" : opt);
                        setRoleMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs text-[#334155] hover:bg-[#F8FAFC] cursor-pointer"
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
                setStatusMenuOpen(false);
              }}
              className="inline-flex h-8 max-w-[200px] items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-medium leading-4 text-[#334155] transition hover:bg-[#F8FAFC] cursor-pointer"
            >
              <span className="truncate">Client • {clientFilter || "All"}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
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
                      className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs text-[#334155] hover:bg-[#F8FAFC] cursor-pointer"
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

          {/* Status Dropdown */}
          <div className="relative" data-filter-dropdown>
            <button
              type="button"
              onClick={() => {
                setStatusMenuOpen(!statusMenuOpen);
                setRoleMenuOpen(false);
                setClientMenuOpen(false);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 text-xs font-medium leading-4 text-[#334155] transition hover:bg-[#F8FAFC] cursor-pointer"
            >
              <span>Status • {statusFilter || "Active"}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
            </button>
            {statusMenuOpen && (
              <div className="absolute right-0 z-30 mt-1.5 w-44 rounded-xl border border-[#E2E8F0] bg-white py-1 shadow-lg">
                {statusOptions.map((opt) => {
                  const isAll = opt === "All";
                  const isSelected = statusFilter ? statusFilter === opt : opt === "Active";
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        onStatusFilterChange(isAll ? "" : opt);
                        setStatusMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs text-[#334155] hover:bg-[#F8FAFC] cursor-pointer"
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
        </div>
      </div>

      {/* View & tools toggle buttons (matching Figma icons under search) */}
      <div className="flex items-center gap-2">
        {onOpenColumns && (
          <button
            type="button"
            onClick={onOpenColumns}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#475569] shadow-2xs hover:bg-[#F8FAFC] cursor-pointer transition"
            title="Edit Columns"
          >
            <LayoutList className="h-4 w-4" />
          </button>
        )}
        {onOpenFilters && (
          <button
            type="button"
            onClick={onOpenFilters}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#475569] shadow-2xs hover:bg-[#F8FAFC] cursor-pointer transition"
            title="All Filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeFilterCount > 0 && (
              <span
                style={{ backgroundColor: primaryColor }}
                className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-xs"
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#475569] shadow-2xs hover:bg-[#F8FAFC] cursor-pointer transition"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

