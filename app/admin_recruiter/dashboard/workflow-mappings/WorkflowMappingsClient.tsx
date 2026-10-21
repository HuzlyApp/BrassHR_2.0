"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import type { EmploymentType } from "@/lib/jobs/types";

type MappingItem = {
  id: string;
  professionId: string | null;
  professionName: string | null;
  specialtyId: string | null;
  specialtyName: string | null;
  employmentType: EmploymentType;
  location: string | null;
  locationType: string | null;
  yearsOfExperience: string | null;
  workflowId: string;
  workflowName: string;
  workflowEmploymentType: string | null;
  isActive: boolean;
  priority: number;
  specificity: number;
};

type OptionsPayload = {
  professions: Array<{ id: string; name: string }>;
  specialties: Array<{ id: string; name: string; profession_id: string }>;
  employmentTypes: EmploymentType[];
  locationTypes: string[];
  workflows: Array<{ id: string; name: string; employment_type?: string | null }>;
};

type FormState = {
  id?: string;
  professionId: string;
  employmentType: EmploymentType;
  location: string;
  locationType: string;
  workflowId: string;
  priority: number;
  isActive: boolean;
};

const emptyForm = (): FormState => ({
  professionId: "",
  employmentType: "W2",
  location: "",
  locationType: "",
  workflowId: "",
  priority: 100,
  isActive: true,
});

const selectClass =
  "w-full appearance-none rounded-lg border border-[#D1D5DB] bg-white px-3 py-2.5 text-sm text-[#111827] outline-none transition focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand-primary)_15%,transparent)]";

const modalInputClass =
  "w-full rounded-lg border border-[color-mix(in_srgb,var(--brand-primary)_40%,#D1D5DB)] bg-white px-3 py-2.5 text-sm text-[#111827] outline-none transition focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand-primary)_15%,transparent)]";

function employmentLabel(type: EmploymentType): string {
  return type === "Contract" ? "RNR" : type;
}

function criteriaSummary(mapping: MappingItem): string {
  const parts = [employmentLabel(mapping.employmentType)];
  if (mapping.professionName) parts.push(mapping.professionName);
  else parts.push("Any profession");
  if (mapping.specialtyName) parts.push(mapping.specialtyName);
  if (mapping.locationType) parts.push(mapping.locationType);
  if (mapping.location) parts.push(mapping.location);
  if (mapping.yearsOfExperience) parts.push(`${mapping.yearsOfExperience} yrs`);
  return parts.join(" + ");
}

export default function WorkflowMappingsClient() {
  const searchParams = useSearchParams();
  const [mappings, setMappings] = useState<MappingItem[]>([]);
  const [options, setOptions] = useState<OptionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filterProfession, setFilterProfession] = useState("");
  const [filterEmployment, setFilterEmployment] = useState("");

  const loadMappings = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterProfession) params.set("professionId", filterProfession);
    if (filterEmployment) params.set("employmentType", filterEmployment);
    const response = await fetch(`/api/admin/workflow-mappings?${params}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to load mappings");
    setMappings(payload.mappings ?? []);
  }, [filterProfession, filterEmployment]);

  const loadOptions = useCallback(async (employmentType?: string) => {
    const params = employmentType ? `?employmentType=${encodeURIComponent(employmentType)}` : "";
    const response = await fetch(`/api/admin/workflow-mappings/options${params}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to load options");
    setOptions(payload);
  }, []);

  useEffect(() => {
    void Promise.all([loadMappings(), loadOptions()])
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load page"))
      .finally(() => setLoading(false));
  }, [loadMappings, loadOptions]);

  function openCreate(prefill?: Partial<FormState>) {
    setForm({ ...emptyForm(), ...prefill });
    setFormOpen(true);
  }

  useEffect(() => {
    const professionId = searchParams.get("professionId");
    const employmentType = searchParams.get("employmentType") as EmploymentType | null;
    const workflowId = searchParams.get("workflowId");
    if (professionId || employmentType || workflowId) {
      setFilterProfession(professionId ?? "");
      setFilterEmployment(employmentType ?? "");
      openCreate({
        professionId: professionId ?? "",
        employmentType: employmentType ?? "W2",
        workflowId: workflowId ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!formOpen) return;
    void loadOptions(form.employmentType).catch(() => undefined);
  }, [form.employmentType, formOpen, loadOptions]);

  function openEdit(mapping: MappingItem) {
    setForm({
      id: mapping.id,
      professionId: mapping.professionId ?? "",
      employmentType: mapping.employmentType,
      location: mapping.location ?? "",
      locationType: mapping.locationType ?? "",
      workflowId: mapping.workflowId,
      priority: mapping.priority,
      isActive: mapping.isActive,
    });
    setFormOpen(true);
  }

  async function saveMapping() {
    setSaving(true);
    try {
      const body = {
        id: form.id,
        professionId: form.professionId || null,
        specialtyId: null,
        employmentType: form.employmentType,
        location: form.location || null,
        locationType: form.locationType || null,
        yearsOfExperience: null,
        workflowId: form.workflowId,
        priority: form.priority,
        isActive: form.isActive,
      };
      const response = await fetch(
        form.id ? `/api/admin/workflow-mappings/${form.id}` : "/api/admin/workflow-mappings",
        {
          method: form.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to save mapping");
      toast.success(form.id ? "Mapping updated" : "Mapping created");
      setFormOpen(false);
      await loadMappings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save mapping");
    } finally {
      setSaving(false);
    }
  }

  async function removeMapping(mapping: MappingItem) {
    if (!window.confirm(`Remove mapping for ${criteriaSummary(mapping)}?`)) {
      return;
    }
    try {
      const response = await fetch(`/api/admin/workflow-mappings/${mapping.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to delete mapping");
      toast.success(
        payload.deactivated
          ? "Mapping deactivated (jobs still reference workflow)"
          : "Mapping deleted"
      );
      await loadMappings();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete mapping");
    }
  }

  return (
    <main className="w-full min-w-0 overflow-x-hidden px-3 py-4 sm:px-5 sm:py-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold leading-7 text-[#111827] sm:text-2xl">
            Workflow Mappings
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-[#6B7280]">
            Map employment type and optional job attributes to a published workflow. Jobs pick the
            most specific matching rule automatically; leave attributes blank to match any value
            (employment-type defaults).
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreate()}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white transition hover:brightness-[0.95] sm:w-auto"
          style={{ backgroundColor: "var(--brand-primary)" }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Create Mapping
        </button>
      </div>

      <section className="mb-5 rounded-xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-full text-sm sm:w-[220px]">
            <span className="mb-1 block text-xs font-medium text-[#374151]">Filter profession</span>
            <select
              className={selectClass}
              value={filterProfession}
              onChange={(e) => setFilterProfession(e.target.value)}
            >
              <option value="">All professions</option>
              {options?.professions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block w-full text-sm sm:w-[220px]">
            <span className="mb-1 block text-xs font-medium text-[#374151]">
              Filter employment type
            </span>
            <select
              className={selectClass}
              value={filterEmployment}
              onChange={(e) => setFilterEmployment(e.target.value)}
            >
              <option value="">All employment types</option>
              {options?.employmentTypes.map((value) => (
                <option key={value} value={value}>
                  {employmentLabel(value)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
        {loading ? (
          <p className="p-6 text-sm text-[#6B7280]">Loading mappings…</p>
        ) : mappings.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-medium text-[#374151]">No workflow mappings configured yet.</p>
            <p className="mt-1 text-sm text-[#6B7280]">
              Create an employment-type default or a specific attribute combination so jobs assign
              workflows automatically.
            </p>
            <button
              type="button"
              onClick={() => openCreate()}
              className="mt-4 inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium transition hover:brightness-[0.95]"
              style={{
                borderColor: "color-mix(in srgb, var(--brand-primary) 30%, transparent)",
                color: "var(--brand-primary)",
              }}
            >
              Create first mapping
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    Criteria
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    Specificity
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    Workflow
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    Priority
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping) => (
                  <tr
                    key={mapping.id}
                    className="border-t border-[#F3F4F6] transition hover:bg-[#F9FAFB]"
                  >
                    <td className="px-4 py-3.5 font-medium text-[#111827]">
                      {criteriaSummary(mapping)}
                    </td>
                    <td className="px-4 py-3.5 text-center text-[#374151]">{mapping.specificity}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className="font-medium text-[#111827]">{mapping.workflowName}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center text-[#374151]">{mapping.priority}</td>
                    <td className="px-4 py-3.5 text-center">
                      {mapping.isActive ? (
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--brand-primary) 10%, white)",
                            color: "var(--brand-primary)",
                          }}
                        >
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-xs font-semibold text-[#6B7280]">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(mapping)}
                          className="inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold text-white transition hover:brightness-[0.9]"
                          style={{ backgroundColor: "var(--brand-primary)" }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeMapping(mapping)}
                          className="inline-flex h-8 items-center rounded-md bg-red-600 px-3 text-xs font-semibold text-white transition hover:bg-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xl sm:p-6">
            <h2 className="text-lg font-semibold text-[#111827]">
              {form.id ? "Edit workflow mapping" : "Create workflow mapping"}
            </h2>
            <p className="mt-1 text-xs text-[#6B7280]">
              Leave optional fields blank to match any value. Employment type alone creates a
              default mapping for that type.
            </p>
            <div className="mt-5 space-y-4">
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-medium text-[#374151]">
                  Employment type
                </span>
                <select
                  className={modalInputClass}
                  value={form.employmentType}
                  onChange={(e) =>
                    setForm((c) => ({
                      ...c,
                      employmentType: e.target.value as EmploymentType,
                      workflowId: "",
                    }))
                  }
                >
                  {options?.employmentTypes.map((value) => (
                    <option key={value} value={value}>
                      {employmentLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-medium text-[#374151]">
                  Profession (optional)
                </span>
                <select
                  className={modalInputClass}
                  value={form.professionId}
                  onChange={(e) => setForm((c) => ({ ...c, professionId: e.target.value }))}
                >
                  <option value="">Any profession</option>
                  {options?.professions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-medium text-[#374151]">
                  Location type (optional)
                </span>
                <select
                  className={modalInputClass}
                  value={form.locationType}
                  onChange={(e) => setForm((c) => ({ ...c, locationType: e.target.value }))}
                >
                  <option value="">Any location type</option>
                  {(options?.locationTypes ?? ["On-site", "Remote", "Hybrid"]).map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-medium text-[#374151]">
                  Job location (optional)
                </span>
                <input
                  className={modalInputClass}
                  value={form.location}
                  onChange={(e) => setForm((c) => ({ ...c, location: e.target.value }))}
                  placeholder="e.g. Dallas, TX"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-medium text-[#374151]">
                  Published workflow
                </span>
                <select
                  className={modalInputClass}
                  value={form.workflowId}
                  onChange={(e) => setForm((c) => ({ ...c, workflowId: e.target.value }))}
                >
                  <option value="">Select published workflow</option>
                  {options?.workflows.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-medium text-[#374151]">
                  Priority (lower wins ties)
                </span>
                <input
                  className={modalInputClass}
                  type="number"
                  min={0}
                  value={form.priority}
                  onChange={(e) => setForm((c) => ({ ...c, priority: Number(e.target.value) }))}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-3 text-sm text-[#374151]">
                <span
                  className="relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition"
                  style={{
                    borderColor: form.isActive
                      ? "var(--brand-secondary, var(--brand-primary))"
                      : "#D1D5DB",
                    backgroundColor: form.isActive
                      ? "var(--brand-secondary, var(--brand-primary))"
                      : "transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((c) => ({ ...c, isActive: e.target.checked }))}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                  {form.isActive ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path
                        d="M2.5 6L5 8.5L9.5 3.5"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
                <span className="font-medium">Active mapping</span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg border border-[#D1D5DB] px-4 py-2.5 text-sm font-medium text-[#374151] transition hover:bg-[#F9FAFB]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !form.workflowId}
                onClick={() => void saveMapping()}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-[0.95] disabled:opacity-50"
                style={{ backgroundColor: "var(--brand-primary)" }}
              >
                {saving ? "Saving…" : "Save Mapping"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-sm text-[#6B7280]">
        Need a workflow first?{" "}
        <Link
          href="/admin_recruiter/dashboard/onboarding-flows"
          className="font-medium hover:underline"
          style={{ color: "var(--brand-primary)" }}
        >
          Publish a workflow
        </Link>{" "}
        or start from{" "}
        <Link
          href="/admin_recruiter/dashboard/templates"
          className="font-medium hover:underline"
          style={{ color: "var(--brand-primary)" }}
        >
          My Templates
        </Link>
        .
      </p>
    </main>
  );
}
