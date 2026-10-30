"use client";

import React, { useCallback, useMemo, useState, type CSSProperties } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, GripVertical, Search, X } from "lucide-react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import {
  BRAAS_PRIMARY,
  BRAAS_SECONDARY,
  brandingToCssVars,
} from "@/lib/tenant/tenant-branding";
import {
  DEFAULT_WORKER_COLUMNS,
  WORKER_COLUMN_OPTIONS,
  ensureFixedWorkerColumns,
  workerColumnDisplayLabel,
  type WorkerColumnId,
  type WorkerColumnOption,
} from "../worker-columns";

export type WorkersEditColumnsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: WorkerColumnId[];
  onSave: (order: WorkerColumnId[]) => void;
};

export function WorkersEditColumnsModal({
  open,
  onOpenChange,
  value,
  onSave,
}: WorkersEditColumnsModalProps) {
  const branding = useTenantBranding();
  const brandVars = brandingToCssVars(branding) as CSSProperties;
  const primaryGold = branding.primaryHex || BRAAS_PRIMARY || "#C59B27";
  const secondaryNavy = branding.secondaryHex || BRAAS_SECONDARY || "#012352";

  const [fieldSearch, setFieldSearch] = useState("");
  // draftMiddleOrder contains only the optional middle columns currently selected
  const [draftMiddleOrder, setDraftMiddleOrder] = useState<WorkerColumnId[]>(() => {
    return value.filter((id) => id !== "name" && id !== "profile");
  });
  const [dragId, setDragId] = useState<WorkerColumnId | null>(null);

  // Sync draft when opened
  React.useEffect(() => {
    if (open) {
      setDraftMiddleOrder(value.filter((id) => id !== "name" && id !== "profile"));
      setFieldSearch("");
    }
  }, [open, value]);

  const selectedSet = useMemo(() => new Set(draftMiddleOrder), [draftMiddleOrder]);

  const filteredOptions = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    if (!q) return WORKER_COLUMN_OPTIONS;
    return WORKER_COLUMN_OPTIONS.filter((c) =>
      c.label.toLowerCase().includes(q) || c.header.toLowerCase().includes(q)
    );
  }, [fieldSearch]);

  const toggleColumn = useCallback((id: WorkerColumnId) => {
    if (id === "name" || id === "profile") return; // Fixed columns cannot be toggled
    setDraftMiddleOrder((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }, []);

  const unselectAll = useCallback(() => {
    setDraftMiddleOrder([]);
  }, []);

  const resetToDefault = useCallback(() => {
    const defaultMiddle = DEFAULT_WORKER_COLUMNS.filter(
      (id) => id !== "name" && id !== "profile"
    );
    setDraftMiddleOrder(defaultMiddle);
    setFieldSearch("");
  }, []);

  const removeColumn = useCallback((id: WorkerColumnId) => {
    setDraftMiddleOrder((prev) => prev.filter((x) => x !== id));
  }, []);

  // HTML5 Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: WorkerColumnId) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetId: WorkerColumnId) => {
    e.preventDefault();
    const fromId = dragId || (e.dataTransfer.getData("text/plain") as WorkerColumnId);
    setDragId(null);
    if (!fromId || fromId === targetId) return;

    setDraftMiddleOrder((prev) => {
      const fromIdx = prev.indexOf(fromId);
      const toIdx = prev.indexOf(targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const next = [...prev];
      const [removed] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, removed);
      return next;
    });
  };

  const handleDragEnd = () => {
    setDragId(null);
  };

  const handleSave = () => {
    const fullOrder = ensureFixedWorkerColumns(draftMiddleOrder);
    onSave(fullOrder);
    onOpenChange(false);
  };

  // Fixed Name + Action count as 2 permanent columns
  const selectedCount = draftMiddleOrder.length + 2;
  const totalCount = WORKER_COLUMN_OPTIONS.length; // 30

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          style={brandVars}
          className="fixed left-1/2 top-1/2 z-50 flex h-[min(650px,calc(100vh-2rem))] w-[min(940px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[#E5E7EB] px-6 py-4">
            <Dialog.Title className="text-xl font-bold text-[#111827]">
              Edit Columns
            </Dialog.Title>
            <Dialog.Close
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black text-white transition hover:opacity-80 focus:outline-none"
              aria-label="Close"
            >
              <X className="size-4" strokeWidth={2.5} />
            </Dialog.Close>
          </div>

          {/* Main 2-column Body */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-8 overflow-hidden p-6 md:grid-cols-2">
            {/* Left: Choose display columns */}
            <div className="flex min-h-0 flex-col">
              <h3 className="shrink-0 text-sm font-semibold text-[#111827]">
                Choose display columns
              </h3>

              <div className="mt-2.5 flex shrink-0 items-center justify-between">
                <button
                  type="button"
                  onClick={unselectAll}
                  style={{ color: primaryGold }}
                  className="text-xs font-semibold hover:underline cursor-pointer transition"
                >
                  Unselect All
                </button>
                <span className="text-xs text-[#6B7280]">
                  ({selectedCount} of {totalCount})
                </span>
              </div>

              {/* Search Bar */}
              <div className="mt-2.5 flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 focus-within:border-[color:var(--brand-primary)]">
                <Search className="size-4 text-[#94A3B8] shrink-0" />
                <input
                  type="text"
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder="Search fields"
                  className="w-full bg-transparent text-xs text-[#1F2937] placeholder:text-[#94A3B8] outline-none"
                />
                {fieldSearch && (
                  <button
                    type="button"
                    onClick={() => setFieldSearch("")}
                    className="text-[#94A3B8] hover:text-[#111827] cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Scrollable Column List */}
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1.5 space-y-1">
                {filteredOptions.map((col) => {
                  const isFixed = col.fixed;
                  const isChecked = isFixed || selectedSet.has(col.id);

                  return (
                    <label
                      key={col.id}
                      onClick={(e) => {
                        if (isFixed) {
                          e.preventDefault();
                          return;
                        }
                        toggleColumn(col.id);
                      }}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition select-none ${
                        isFixed
                          ? "cursor-not-allowed opacity-80"
                          : "cursor-pointer hover:bg-[#F8FAFC]"
                      }`}
                    >
                      <span className="relative flex size-4 shrink-0 items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isFixed}
                          readOnly
                          className="sr-only"
                        />
                        <span
                          className={`flex size-4 items-center justify-center rounded-[4px] border transition ${
                            isFixed
                              ? "border-[#D1D5DB] bg-[#E5E7EB] text-[#6B7280]"
                              : isChecked
                                ? "border-[color:var(--brand-secondary,#012352)] bg-[color:var(--brand-secondary,#012352)] text-white"
                                : "border-[#D1D5DB] bg-white"
                          }`}
                        >
                          {isChecked && <Check className="size-3" strokeWidth={3} />}
                        </span>
                      </span>

                      <span
                        className={`text-xs sm:text-sm font-medium truncate ${
                          isFixed ? "text-[#6B7280]" : "text-[#374151]"
                        }`}
                      >
                        {col.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Right: Reorder the columns */}
            <div className="flex min-h-0 flex-col">
              <h3 className="shrink-0 text-sm font-semibold text-[#111827]">
                Reorder the columns
              </h3>

              <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1.5 space-y-2">
                {draftMiddleOrder.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-[#E5E7EB] p-6 text-center text-xs text-[#94A3B8]">
                    No custom columns selected.
                    <span className="mt-1 text-[11px] text-[#6B7280]">
                      Check optional fields on the left to add them to your view.
                    </span>
                  </div>
                ) : (
                  draftMiddleOrder.map((id) => (
                    <div
                      key={id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, id)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center justify-between rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-2.5 shadow-2xs transition hover:border-[#CBD5E1] cursor-grab active:cursor-grabbing ${
                        dragId === id ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <GripVertical
                          className="size-4 shrink-0"
                          style={{ color: primaryGold }}
                        />
                        <span className="text-xs sm:text-sm font-medium text-[#374151] truncate">
                          {workerColumnDisplayLabel(id)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeColumn(id)}
                        className="p-1 text-[#9CA3AF] transition hover:text-[#111827] cursor-pointer shrink-0 rounded"
                        title={`Remove ${workerColumnDisplayLabel(id)}`}
                        aria-label={`Remove ${workerColumnDisplayLabel(id)}`}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between border-t border-[#E5E7EB] px-6 py-4">
            <button
              type="button"
              onClick={resetToDefault}
              style={{
                borderColor: primaryGold,
                color: primaryGold,
              }}
              className="rounded-lg border bg-white px-4 py-2 text-xs sm:text-sm font-semibold transition hover:bg-amber-50/50 cursor-pointer shadow-2xs"
            >
              Reset to default
            </button>

            <div className="flex items-center gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-[#374151] transition hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
              </Dialog.Close>

              <button
                type="button"
                onClick={handleSave}
                style={{
                  backgroundColor: primaryGold,
                }}
                className="rounded-lg px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs transition hover:brightness-95 cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

