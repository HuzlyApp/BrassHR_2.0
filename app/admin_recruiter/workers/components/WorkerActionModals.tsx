"use client";

import React, { useState } from "react";
import { X, Building2, User, Clock, Send, CheckCircle2 } from "lucide-react";
import type { WorkerListRow } from "../figma-demo-data";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { BRAAS_PRIMARY, readableTextOnBrand } from "@/lib/tenant/tenant-branding";

export type FacilitiesModalProps = {
  worker: WorkerListRow | null;
  onClose: () => void;
};

export function FacilitiesModal({ worker, onClose }: FacilitiesModalProps) {
  if (!worker) return null;

  const facilities = worker.facilities?.length
    ? worker.facilities
    : [`${worker.client || "Client"} Main Facility`];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[rgba(99,53,255,0.12)] text-[#6335FF]">
              <Building2 className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#0F172A]">Assigned Facilities</h3>
              <p className="text-xs text-[#64748B]">{worker.name} • {worker.jobRole}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5">
            <p className="text-xs font-semibold text-[#475569]">Client Organization</p>
            <p className="text-sm font-semibold text-[#0F172A] mt-0.5">{worker.client || "Unassigned"}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B] mb-2">
              Facility Locations
            </p>
            <div className="space-y-2">
              {facilities.map((fac, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3.5 shadow-2xs"
                >
                  <CheckCircle2 className="mt-0.5 size-4 text-[#10B981] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#1E293B]">{fac}</p>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      Assignment: {worker.assignmentStartDate || "05/23/2026"} - {worker.assignmentEndDate || "05/23/2026"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-xs font-semibold text-[#374151] hover:bg-gray-50 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export type ChangeManagerModalProps = {
  worker: WorkerListRow | null;
  onClose: () => void;
  onSaveManager: (workerId: string, newManager: string) => void;
};

export function ChangeManagerModal({ worker, onClose, onSaveManager }: ChangeManagerModalProps) {
  const branding = useTenantBranding();
  const primaryColor = branding.primaryHex || BRAAS_PRIMARY;
  const textOnPrimary = readableTextOnBrand(primaryColor);

  const managerOptions = ["Sean J.", "Amanda Miller", "Marcus Vance", "Elena Rostova"];
  const [selectedManager, setSelectedManager] = useState(worker?.manager || managerOptions[0]);

  if (!worker) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[rgba(0,78,255,0.12)] text-[#004EFF]">
              <User className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#0F172A]">Change Manager</h3>
              <p className="text-xs text-[#64748B]">{worker.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#475569] mb-1.5">
              Select Responsible Manager
            </label>
            <select
              value={selectedManager}
              onChange={(e) => setSelectedManager(e.target.value)}
              className="w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-sm text-[#1E293B] shadow-2xs focus:border-[#BC8B41] focus:outline-none"
            >
              {managerOptions.map((mgr) => (
                <option key={mgr} value={mgr}>
                  {mgr}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-[#64748B]">
            Assigning a manager gives them direct oversight of shift scheduling, approvals, and reviews for this worker.
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-xs font-semibold text-[#374151] hover:bg-gray-50 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onSaveManager(worker.id, selectedManager);
              onClose();
            }}
            style={{ backgroundColor: primaryColor, color: textOnPrimary }}
            className="rounded-lg px-4 py-2 text-xs font-semibold shadow-xs hover:brightness-95 transition cursor-pointer"
          >
            Update Manager
          </button>
        </div>
      </div>
    </div>
  );
}

export type StatusHistoryModalProps = {
  worker: WorkerListRow | null;
  onClose: () => void;
};

export function StatusHistoryModal({ worker, onClose }: StatusHistoryModalProps) {
  if (!worker) return null;

  const history = [
    {
      status: "Active Assignment",
      note: `Assigned to ${worker.client || "Client"} as ${worker.jobRole}`,
      date: "May 23, 2026",
    },
    {
      status: "Onboarding Completed",
      note: "All compliance documents verified and signed",
      date: "May 15, 2026",
    },
    {
      status: "Application Approved",
      note: "Candidate successfully converted to active workforce roster",
      date: "May 02, 2026",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[rgba(14,97,87,0.12)] text-[#0E6157]">
              <Clock className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#0F172A]">Status History</h3>
              <p className="text-xs text-[#64748B]">{worker.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {history.map((item, idx) => (
            <div key={idx} className="relative flex items-start gap-3 pl-2">
              <div className="mt-1 flex size-3 shrink-0 rounded-full bg-[#10B981]" />
              <div className="min-w-0 flex-1 border-b border-[#F1F5F9] pb-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[#0F172A]">{item.status}</p>
                  <span className="text-[11px] text-[#94A3B8]">{item.date}</span>
                </div>
                <p className="text-xs text-[#64748B] mt-0.5">{item.note}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-xs font-semibold text-[#374151] hover:bg-gray-50 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export type QuickMessageModalProps = {
  worker: WorkerListRow | null;
  onClose: () => void;
  onSend: (workerId: string, message: string) => void;
};

export function QuickMessageModal({ worker, onClose, onSend }: QuickMessageModalProps) {
  const branding = useTenantBranding();
  const primaryColor = branding.primaryHex || BRAAS_PRIMARY;
  const textOnPrimary = readableTextOnBrand(primaryColor);
  const [message, setMessage] = useState("");

  if (!worker) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-4">
          <div>
            <h3 className="text-base font-semibold text-[#0F172A]">Message {worker.name}</h3>
            <p className="text-xs text-[#64748B]">{worker.email || worker.phone}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-4">
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message here..."
            className="w-full rounded-xl border border-[#CBD5E1] p-3 text-sm text-[#1E293B] shadow-2xs focus:border-[#BC8B41] focus:outline-none"
          />
        </div>

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#D1D5DB] bg-white px-4 py-2 text-xs font-semibold text-[#374151] hover:bg-gray-50 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (message.trim()) {
                onSend(worker.id, message);
                onClose();
              }
            }}
            disabled={!message.trim()}
            style={{ backgroundColor: primaryColor, color: textOnPrimary }}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold shadow-xs hover:brightness-95 transition disabled:opacity-60 cursor-pointer"
          >
            <Send className="size-3.5" />
            <span>Send Message</span>
          </button>
        </div>
      </div>
    </div>
  );
}

