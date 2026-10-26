"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { brandingToCssVars } from "@/lib/tenant/tenant-branding";

export type AssignableTeamMember = {
  id: string;
  name: string;
  email?: string;
  role?: string;
  roleLabel?: string | null;
};

type AssignRecruiterModalProps = {
  open: boolean;
  candidateName: string;
  /** Defaults to "candidate"; pass "job" for job-level assignment. */
  subjectLabel?: string;
  currentAssigneeId?: string | null;
  busy?: boolean;
  error?: string | null;
  members: AssignableTeamMember[];
  membersLoading?: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign: (assigneeUserId: string | null) => void;
};

function isAssignableStaffRole(role: string | undefined): boolean {
  const key = role?.trim().toLowerCase() ?? "";
  return Boolean(key) && key !== "worker";
}

function assigneeRoleLabel(member: AssignableTeamMember): string | null {
  if (member.roleLabel?.trim()) return member.roleLabel.trim();
  if (!member.role?.trim()) return null;
  return member.role
    .trim()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const SELECT_CLASS =
  "h-10 w-full cursor-pointer appearance-none rounded-lg border border-[#CBD5E1] bg-white bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat px-3 pr-9 text-sm font-normal leading-6 text-[#334155] outline-none hover:bg-zinc-50 focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50";

const SELECT_CHEVRON = {
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="#94A3B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  )}")`,
} as const;

export function AssignRecruiterModal({
  open,
  candidateName,
  subjectLabel = "candidate",
  currentAssigneeId = null,
  busy = false,
  error = null,
  members,
  membersLoading = false,
  onOpenChange,
  onAssign,
}: AssignRecruiterModalProps) {
  const branding = useTenantBranding();
  const brandVars = brandingToCssVars(branding) as CSSProperties;
  const [selectedId, setSelectedId] = useState(currentAssigneeId ?? "");

  useEffect(() => {
    if (open) setSelectedId(currentAssigneeId ?? "");
  }, [open, currentAssigneeId]);

  const assignableMembers = useMemo(
    () =>
      members
        .filter((member) => isAssignableStaffRole(member.role))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members]
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/40" />
        <Dialog.Content
          style={brandVars}
          className="fixed left-1/2 top-1/2 z-[221] flex w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-xl outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-[#0F172A]">
                Assign recruiter
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[#64748B]">
                Choose an admin or recruiter for{" "}
                <span className="font-medium text-[#334155]">
                  {candidateName || `this ${subjectLabel}`}
                </span>
                .
              </Dialog.Description>
            </div>
            <Dialog.Close
              type="button"
              disabled={busy}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#0F172A] text-white transition hover:opacity-90 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </div>

          <div className="px-5 py-4">
            {membersLoading ? (
              <p className="py-6 text-center text-sm text-[#64748B]">Loading team members…</p>
            ) : assignableMembers.length === 0 ? (
              <p className="py-6 text-center text-sm text-[#64748B]">
                No admins or recruiters are available for this tenant.
              </p>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-[#475569]">Assignee</span>
                <select
                  value={selectedId}
                  disabled={busy}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className={SELECT_CLASS}
                  style={SELECT_CHEVRON}
                  aria-label="Select assignee"
                >
                  <option value="">Unassigned</option>
                  {assignableMembers.map((member) => {
                    const roleLabel = assigneeRoleLabel(member);
                    return (
                      <option key={member.id} value={member.id}>
                        {member.name}
                        {roleLabel ? ` (${roleLabel})` : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}

            {error ? (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#E5E7EB] px-5 py-4 sm:flex-row sm:justify-end sm:gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[color:var(--brand-primary)] px-4 text-sm font-semibold leading-5 text-[color:var(--brand-primary)] transition hover:bg-[color:color-mix(in_srgb,var(--brand-primary)_6%,white)] disabled:opacity-50 sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || membersLoading || assignableMembers.length === 0}
              onClick={() => onAssign(selectedId.trim() || null)}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] px-5 text-sm font-semibold leading-5 text-white transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--brand-primary)_35%,transparent)] disabled:opacity-50 sm:w-auto"
            >
              {busy ? "Saving…" : "Assign"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
