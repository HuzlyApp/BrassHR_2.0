"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Check, MoreHorizontal, UserPlus, Users } from "lucide-react";
import toast from "react-hot-toast";
import {
  type StaffAccountStatus,
  type StaffDirectoryRow,
} from "@/lib/admin/staff-directory-types";

type StaffRoleOption = { key: string; label: string; isAdmin: boolean };
import { PERSON_NAME_MAX_LENGTH } from "@/lib/person-name";

const STATUS_STYLES: Record<StaffAccountStatus, string> = {
  pending: "bg-[#FEF3C7] text-[#92400E]",
  active: "bg-[#DCFCE7] text-[#166534]",
  suspended: "bg-[#E2E8F0] text-[#334155]",
  expired: "bg-[#FFEDD5] text-[#9A3412]",
  failed: "bg-[#FEE2E2] text-[#991B1B]",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York",  month: "short", day: "numeric", year: "numeric" });
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-[#0F172A]">{title}</h3>
        <p className="mt-2 text-sm text-[#64748B]">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-medium text-[#012352] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
              danger ? "bg-[#B91C1C]" : "bg-[#012352]"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminConsolePanel() {
  const [users, setUsers] = useState<StaffDirectoryRow[]>([]);
  const [roleOptions, setRoleOptions] = useState<StaffRoleOption[]>([]);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    run: () => Promise<void>;
  } | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("recruiter");
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [inviteConflict, setInviteConflict] = useState<StaffDirectoryRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/users");
      if (response.status === 403) {
        setVisible(false);
        setUsers([]);
        return;
      }
      const payload = (await response.json()) as {
        users?: StaffDirectoryRow[];
        roles?: StaffRoleOption[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Failed to load users");
      const nextRoles = payload.roles ?? [];
      setRoleOptions(nextRoles);
      setRole((current) =>
        nextRoles.some((option) => option.key === current)
          ? current
          : (nextRoles.find((option) => option.key === "recruiter")?.key ?? nextRoles[0]?.key ?? current)
      );
      setUsers(payload.users ?? []);
      setVisible(true);
    } catch (err) {
      setVisible(true);
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetInviteForm = useCallback(() => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setRole("recruiter");
    setRequirePasswordChange(true);
    setFormError(null);
    setInviteConflict(null);
  }, []);

  async function submitInvite(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    setInviteConflict(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          role,
          requirePasswordChange,
          origin: window.location.origin,
        }),
      });
      const payload = (await response.json()) as { error?: string; code?: string; user?: StaffDirectoryRow };
      if (!response.ok) {
        setFormError(payload.error || "Could not send invitation.");
        if (payload.code === "CONFLICT") {
          const normalized = email.trim().toLowerCase();
          const match = users.find(
            (row) => row.canResend && row.invitationId && row.email.toLowerCase() === normalized
          );
          setInviteConflict(match ?? null);
        }
        return;
      }
      toast.success(
        payload.user?.status === "pending"
          ? "Invitation sent. They’ll appear as Active after they set a password."
          : `${roleOptions.find((option) => option.key === role)?.label ?? "Staff member"} added to this organization.`
      );
      resetInviteForm();
      setInviteOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not send invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function runAction(path: string, init: RequestInit, success: string, options?: { closeInvite?: boolean }) {
    setSubmitting(true);
    try {
      const response = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Request failed");
      toast.success(success);
      setMenuId(null);
      if (options?.closeInvite) {
        setInviteOpen(false);
        resetInviteForm();
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
      setResendingId(null);
      setConfirm(null);
    }
  }

  function canResendInvitation(row: StaffDirectoryRow): boolean {
    return row.canResend && Boolean(row.invitationId);
  }

  function resendInvitation(row: StaffDirectoryRow) {
    if (!row.invitationId || submitting) return;
    setResendingId(row.invitationId);
    void runAction(
      `/api/admin/users/invitations/${row.invitationId}`,
      {
        method: "POST",
        body: JSON.stringify({ origin: window.location.origin }),
      },
      "Invitation resent.",
      { closeInvite: true }
    );
  }

  const empty = !loading && users.length === 0;
  const pendingCount = useMemo(() => users.filter((row) => row.status === "pending").length, [users]);

  if (!visible && !loading) return null;

  return (
    <section className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#012352]">
            <Users className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h3 className="text-base font-semibold text-[#0F172A]">Admin Console</h3>
            <p className="mt-0.5 text-sm text-[#64748B]">
              Invite recruiters, assign roles, and manage access for this organization.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            resetInviteForm();
            setInviteOpen(true);
          }}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#012352] px-4 text-sm font-medium text-white hover:brightness-95 disabled:opacity-60"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          Invite staff
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-sm text-[#991B1B]">
          {error}
          <button type="button" className="ml-3 font-medium underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-10 animate-pulse rounded-lg bg-[#F1F5F9]" />
          <div className="h-10 animate-pulse rounded-lg bg-[#F1F5F9]" />
          <div className="h-10 animate-pulse rounded-lg bg-[#F8FAFC]" />
        </div>
      ) : empty ? (
        <p className="rounded-lg border border-dashed border-[#CBD5E1] px-4 py-8 text-center text-sm text-[#64748B]">
          No team members yet. Invite a recruiter to give them access to this organization.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Invited</th>
                <th className="py-2 pr-3">Last login</th>
                <th className="py-2 pr-3">Created by</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.id} className="border-b border-[#F1F5F9] last:border-0">
                  <td className="py-3 pr-3 font-medium text-[#0F172A]">{row.name}</td>
                  <td className="py-3 pr-3 text-[#334155]">{row.email}</td>
                  <td className="py-3 pr-3 text-[#334155]">{row.roleLabel}</td>
                  <td className="py-3 pr-3">
                    <div className="flex flex-col items-start gap-1">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status]}`}>
                        {row.statusLabel}
                      </span>
                      {canResendInvitation(row) ? (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => resendInvitation(row)}
                          className="text-xs font-medium text-[#012352] hover:underline disabled:opacity-60"
                        >
                          {resendingId === row.invitationId ? "Resending…" : "Resend invitation"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-[#64748B]">{formatDate(row.invitationDate)}</td>
                  <td className="py-3 pr-3 text-[#64748B]">{formatDate(row.lastLogin)}</td>
                  <td className="py-3 pr-3 text-[#64748B]">{row.createdByName || "—"}</td>
                  <td className="relative py-3 text-right">
                    <button
                      type="button"
                      aria-label={`Actions for ${row.name}`}
                      onClick={() => setMenuId(menuId === row.id ? null : row.id)}
                      className="rounded-lg p-1.5 text-[#64748B] hover:bg-[#F1F5F9]"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuId === row.id ? (
                      <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-[#E2E8F0] bg-white py-1 text-left shadow-lg">
                        {canResendInvitation(row) ? (
                          <button
                            type="button"
                            disabled={submitting}
                            className="block w-full px-3 py-2 text-sm text-[#0F172A] hover:bg-[#F8FAFC] disabled:opacity-60"
                            onClick={() => resendInvitation(row)}
                          >
                            {resendingId === row.invitationId ? "Resending…" : "Resend invitation"}
                          </button>
                        ) : null}
                        {row.canChangeRole
                          ? roleOptions.filter((option) => option.key !== row.role).map((option) => (
                              <button
                                key={option.key}
                                type="button"
                                className="block w-full px-3 py-2 text-sm text-[#0F172A] hover:bg-[#F8FAFC]"
                                onClick={() => {
                                  setConfirm({
                                    title: "Change role",
                                    message: `Change ${row.name} from ${row.roleLabel} to ${option.label}?`,
                                    confirmLabel: "Change role",
                                    run: () =>
                                      runAction(
                                        `/api/admin/users/${row.userId}`,
                                        {
                                          method: "PATCH",
                                          body: JSON.stringify({ action: "change_role", role: option.key }),
                                        },
                                        "Role updated."
                                      ),
                                  });
                                  setMenuId(null);
                                }}
                              >
                                Change to {option.label}
                              </button>
                            ))
                          : null}
                        {row.canSuspend ? (
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-sm text-[#0F172A] hover:bg-[#F8FAFC]"
                            onClick={() => {
                              setConfirm({
                                title: "Suspend access",
                                message: `${row.name} will not be able to sign in to this organization until you reactivate them.`,
                                confirmLabel: "Suspend",
                                danger: true,
                                run: () =>
                                  runAction(
                                    `/api/admin/users/${row.userId}`,
                                    { method: "PATCH", body: JSON.stringify({ action: "suspend" }) },
                                    "Access suspended."
                                  ),
                              });
                              setMenuId(null);
                            }}
                          >
                            Suspend access
                          </button>
                        ) : null}
                        {row.canReactivate ? (
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-sm text-[#0F172A] hover:bg-[#F8FAFC]"
                            onClick={() => {
                              setConfirm({
                                title: "Reactivate access",
                                message: `Restore ${row.name}’s access to this organization?`,
                                confirmLabel: "Reactivate",
                                run: () =>
                                  runAction(
                                    `/api/admin/users/${row.userId}`,
                                    { method: "PATCH", body: JSON.stringify({ action: "reactivate" }) },
                                    "Access restored."
                                  ),
                              });
                              setMenuId(null);
                            }}
                          >
                            Reactivate access
                          </button>
                        ) : null}
                        {row.canRemove ? (
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-sm text-[#B91C1C] hover:bg-[#FEF2F2]"
                            onClick={() => {
                              setConfirm({
                                title: "Remove from organization",
                                message:
                                  "This removes their access to this organization. Their login identity is kept if they belong to another organization.",
                                confirmLabel: "Remove",
                                danger: true,
                                run: () =>
                                  runAction(
                                    row.kind === "invitation" && row.invitationId
                                      ? `/api/admin/users/invitations/${row.invitationId}`
                                      : `/api/admin/users/${row.userId}`,
                                    { method: "DELETE" },
                                    "Removed from this organization."
                                  ),
                              });
                              setMenuId(null);
                            }}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pendingCount > 0 ? (
            <p className="mt-3 text-xs text-[#64748B]">
              Pending accounts stay pending until the admin or recruiter sets a password from the invitation
              email. Use Resend invitation if they did not receive it.
            </p>
          ) : null}
        </div>
      )}

      {inviteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={submitInvite}
            className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold text-[#0F172A]">Invite staff</h3>
            <p className="mt-1 text-sm text-[#64748B]">
              We’ll email a one-time activation link. They choose their own password; we never store or display one.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-[#0F172A]">First name</span>
                <input
                  required
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  maxLength={PERSON_NAME_MAX_LENGTH}
                  className="h-10 w-full rounded-lg border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#012352]"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-[#0F172A]">Last name</span>
                <input
                  required
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  maxLength={PERSON_NAME_MAX_LENGTH}
                  className="h-10 w-full rounded-lg border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#012352]"
                />
              </label>
            </div>
            <label className="mt-3 block space-y-1.5">
              <span className="text-sm font-semibold text-[#0F172A]">Email address</span>
              <input
                required
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setInviteConflict(null);
                }}
                className="h-10 w-full rounded-lg border border-[#CBD5E1] px-3 text-sm outline-none focus:border-[#012352]"
              />
            </label>
            <label className="mt-3 block space-y-1.5">
              <span className="text-sm font-semibold text-[#0F172A]">Role</span>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm outline-none focus:border-[#012352]"
              >
                {roleOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 flex items-start gap-3 text-sm text-[#334155]">
              <span className="relative mt-0.5 inline-flex h-5 w-5 shrink-0">
                <input
                  type="checkbox"
                  className="peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-[5px] border-2 border-slate-300 bg-white transition-colors checked:border-[color:var(--brand-checkbox,var(--brand-primary))] checked:bg-[color:var(--brand-checkbox,var(--brand-primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--brand-checkbox,var(--brand-primary))_30%,transparent)]"
                  checked={requirePasswordChange}
                  onChange={(event) => setRequirePasswordChange(event.target.checked)}
                />
                <Check
                  className="pointer-events-none absolute inset-0 m-auto hidden h-3 w-3 text-white peer-checked:block"
                  strokeWidth={3}
                  aria-hidden
                />
              </span>
              <span>Require password setup before first login (recommended). They activate with a one-time email link.</span>
            </label>
            {formError ? <p className="mt-3 text-sm text-[#B91C1C]">{formError}</p> : null}
            {inviteConflict ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => resendInvitation(inviteConflict)}
                className="mt-2 text-sm font-medium text-[#012352] hover:underline disabled:opacity-60"
              >
                {resendingId === inviteConflict.invitationId ? "Resending…" : "Resend invitation"}
              </button>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setInviteOpen(false)}
                className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-medium text-[#012352]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-[#012352] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Send invitation"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          busy={submitting}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void confirm.run()}
        />
      ) : null}
    </section>
  );
}
