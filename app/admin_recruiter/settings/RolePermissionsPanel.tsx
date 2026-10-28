"use client";

import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { applyGrantSelection, withRequiredView } from "@/lib/auth/permission-catalog";

type ResourceRow = {
  key: string;
  label: string;
  description: string;
  kind: "module" | "settings_section";
};

type Grant = { resourceKey: string; canView: boolean; canEdit: boolean; canDelete: boolean };

type RoleRow = {
  roleKey: string;
  label: string;
  description: string;
  isSystem: boolean;
  isAdmin: boolean;
  userCount: number;
  permissions: Grant[];
};

type Action = "canView" | "canEdit" | "canDelete";

const ACTIONS: { key: Action; label: string }[] = [
  { key: "canView", label: "View" },
  { key: "canEdit", label: "Edit" },
  { key: "canDelete", label: "Delete" },
];

function emptyGrants(resources: ResourceRow[]): Grant[] {
  return resources.map((resource) => ({
    resourceKey: resource.key,
    canView: false,
    canEdit: false,
    canDelete: false,
  }));
}

function grantsForRole(role: RoleRow, resources: ResourceRow[]): Grant[] {
  return resources.map((resource) => {
    const existing = role.permissions.find((permission) => permission.resourceKey === resource.key);
    return {
      resourceKey: resource.key,
      ...withRequiredView({
        canView: existing?.canView === true,
        canEdit: existing?.canEdit === true,
        canDelete: existing?.canDelete === true,
      }),
    };
  });
}

export default function RolePermissionsPanel({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [grants, setGrants] = useState<Grant[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/roles");
      if (response.status === 403) {
        setHidden(true);
        return;
      }
      const body = (await response.json()) as { roles?: RoleRow[]; resources?: ResourceRow[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Could not load roles");
      setRoles(body.roles ?? []);
      setResources(body.resources ?? []);
      setHidden(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allSelected = useMemo(
    () => grants.length > 0 && grants.every((grant) => grant.canView && grant.canEdit && grant.canDelete),
    [grants]
  );

  function openCreate() {
    setEditing(null);
    setLabel("");
    setDescription("");
    setGrants(emptyGrants(resources));
    setOpen(true);
  }

  function openEdit(role: RoleRow) {
    setEditing(role);
    setLabel(role.label);
    setDescription(role.description);
    setGrants(grantsForRole(role, resources));
    setOpen(true);
  }

  function toggleAll(checked: boolean) {
    setGrants((current) =>
      current.map((grant) => ({ ...grant, canView: checked, canEdit: checked, canDelete: checked }))
    );
  }

  function toggle(resourceKey: string, action: Action, checked: boolean) {
    setGrants((current) =>
      current.map((grant) =>
        grant.resourceKey === resourceKey ? { ...grant, ...applyGrantSelection(grant, action, checked) } : grant
      )
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const payload = { label, description, permissions: grants };
      const response = await fetch(editing ? `/api/admin/roles/${editing.roleKey}` : "/api/admin/roles", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not save role");
      toast.success(editing ? "Role updated" : "Role created");
      setOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save role");
    } finally {
      setSaving(false);
    }
  }

  async function remove(role: RoleRow) {
    if (!canDelete || role.isSystem) return;
    const response = await fetch(`/api/admin/roles/${role.roleKey}`, { method: "DELETE" });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      toast.error(body.error || "Could not delete role");
      return;
    }
    toast.success("Role deleted");
    await load();
  }

  if (hidden) return null;

  const modules = resources.filter((resource) => resource.kind === "module");
  const settings = resources.filter((resource) => resource.kind === "settings_section");
  const userCount = editing?.userCount ?? 0;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="sr-only">
          Choose which sidebar modules and Settings sections each role can view, edit, or delete.
        </p>
        <div className="sm:ml-auto">
          <button
            type="button"
            onClick={openCreate}
            disabled={!canEdit || loading}
            className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
            style={{ backgroundColor: "var(--brand-primary)" }}
          >
            + Create Custom Role
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm text-[#64748B]">Loading roles…</p> : null}
      {!loading ? (
        <div className="overflow-x-auto rounded-lg border border-[#E5E7EB] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5E7EB] text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                <th className="px-4 py-3">Role Name</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Number of users</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.roleKey} className="border-b border-[#F3F4F6] last:border-0">
                  <td className="px-4 py-3 font-semibold text-[#012352]">{role.label}</td>
                  <td className="px-4 py-3 text-[#6B7280]">{role.description || "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-[#DCFCE7] px-2 py-0.5 text-xs font-medium text-[#166534]">
                      Active
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#334155]">
                    {role.userCount} {role.userCount === 1 ? "user" : "users"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        className="text-sm font-medium text-[color:var(--brand-primary)] hover:underline"
                        onClick={() => openEdit(role)}
                      >
                        Edit
                      </button>
                      {!role.isSystem ? (
                        <button
                          type="button"
                          className="text-sm font-medium text-[#B91C1C] disabled:opacity-40"
                          disabled={!canDelete}
                          onClick={() => void remove(role)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
          <form
            onSubmit={save}
            className="flex max-h-[90vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[20px] border border-[#E5E7EB] bg-white shadow-[0_20px_12.5px_rgba(0,0,0,0.1),0_10px_5px_rgba(0,0,0,0.04)]"
          >
            <div className="flex justify-end px-3.5 py-3">
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="flex size-6 items-center justify-center rounded-full bg-black text-white"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            </div>
            <div className="overflow-y-auto px-5 pb-5">
              <h2 className="text-[20px] font-semibold leading-7 text-black">{editing ? "Edit Role" : "Create Role"}</h2>
              <p className="text-xs leading-4 text-[#6B7280]">
                {editing ? "Update this role and the permissions for each module." : "Create a new role and set the permissions for each module."}
              </p>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <label className="block text-xs text-[#374151]">
                  Role Name <span className="text-[#E11D48]">*</span>
                  <input
                    required
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Enter Role Name"
                    disabled={!canEdit}
                    className="mt-2 h-10 w-full rounded-lg border border-[#CBD5E1] px-3 text-xs text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
                  />
                </label>
                <label className="block text-xs text-[#374151]">
                  Description
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Enter a brief description (optional)"
                    disabled={!canEdit}
                    className="mt-2 h-10 w-full rounded-lg border border-[#CBD5E1] px-3 text-xs text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
                  />
                </label>
              </div>
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <p className="text-sm font-semibold text-black">{label.trim() || "Role"} Permissions</p>
                  <p className="text-[10px] leading-[15px] text-[#6B7280]">
                    {userCount} {userCount === 1 ? "User" : "Users"}
                  </p>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-[#012352]">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    disabled={!canEdit}
                    onChange={(event) => toggleAll(event.target.checked)}
                    className="size-4 rounded border-[#012352] accent-[#012352]"
                  />
                  Select All
                </label>
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-[#E5E7EB]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] text-[#64748B]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Module</th>
                      {ACTIONS.map((action) => (
                        <th key={action.key} className="w-16 px-2 py-2 text-center font-medium">
                          {action.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...modules, ...settings].map((resource) => {
                      const grant = grants.find((item) => item.resourceKey === resource.key);
                      const showSettingsHeader = resource.kind === "settings_section" && settings[0]?.key === resource.key;
                      return (
                        <Fragment key={resource.key}>
                          {showSettingsHeader ? (
                            <tr className="bg-[#F8FAFC]">
                              <td colSpan={4} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
                                Settings
                              </td>
                            </tr>
                          ) : null}
                          <tr>
                            <td className="px-3 py-2">
                              <p className="font-semibold text-[#012352]">{resource.label}</p>
                              <p className="text-[11px] text-[#6B7280]">{resource.description}</p>
                            </td>
                            {ACTIONS.map((action) => (
                              <td key={action.key} className="px-2 py-2 text-center">
                                <input
                                  type="checkbox"
                                  aria-label={`${resource.label} ${action.label}`}
                                  checked={grant?.[action.key] === true}
                                  disabled={!canEdit}
                                  onChange={(event) => toggle(resource.key, action.key, event.target.checked)}
                                  className="size-4 rounded border-[#012352] accent-[#012352]"
                                />
                              </td>
                            ))}
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-6 text-sm font-medium text-[#012352]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canEdit || saving}
                  className="h-10 rounded-lg px-8 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: "var(--brand-primary)" }}
                >
                  {saving ? "Saving…" : editing ? "Save" : "Create"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
