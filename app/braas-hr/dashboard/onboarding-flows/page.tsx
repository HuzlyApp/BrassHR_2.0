"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  Suspense,
  type FormEvent,
} from "react";
import toast from "react-hot-toast";
import CandidateDetailLoader from "@/app/admin_recruiter/components/CandidateDetailLoader";
import { useOnboardingFlows, type OnboardingFlowListItem } from "@/lib/onboarding/hooks/use-onboarding-flows";
import { useOnboardingLibraries } from "@/lib/onboarding/hooks/use-onboarding-libraries";
import { useOnboardingTemplates } from "@/lib/onboarding/hooks/use-onboarding-templates";
import {
  BRAND_SECONDARY_BG,
  CARD_BORDER,
  GOLD_GRADIENT,
  ICON_BOX_BG,
  PAGE_BG,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from "../constants";
import ConfigureMappingModal from "@/app/components/workflow-mappings/ConfigureMappingModal";
import { staffFetchInit } from "@/lib/staff-auth-headers";

type OnboardingFlow = OnboardingFlowListItem & {
  employmentType?: string | null;
  professionId?: string | null;
};

type FilterTab = "published" | "unpublished";
type FlowSaveStatus = "published" | "draft";

type SelectOption = { id: string; label: string };

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className="block shrink-0"
    >
      <path d="M3.5 3.5L10.5 10.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M10.5 3.5L3.5 10.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 6L8 10L12 6"
        stroke={TEXT_SECONDARY}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M4 10L8 6L12 10"
        stroke={TEXT_SECONDARY}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.25" stroke={TEXT_MUTED} strokeWidth="1.5" />
      <path d="M10 10L13 13" stroke={TEXT_MUTED} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path
        d="M2 5L4.25 7.25L8 3.25"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderOutlineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M2.5 6.5C2.5 5.395 3.395 4.5 4.5 4.5H7.1L8.25 6H13.5C14.605 6 15.5 6.895 15.5 8V13.5C15.5 14.605 14.605 15.5 13.5 15.5H4.5C3.395 15.5 2.5 14.605 2.5 13.5V6.5Z"
        stroke="#98a2b3"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TemplateOutlineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="3" y="2.5" width="12" height="13" rx="1.5" stroke="#98a2b3" strokeWidth="1.35" />
      <path d="M6 6H12M6 9H12M6 12H9.5" stroke="#98a2b3" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

type SearchCheckboxSelectProps = {
  id: string;
  triggerPlaceholder: string;
  searchPlaceholder: string;
  options: SelectOption[];
  selectedId: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  iconType?: "folder" | "template";
};

function SearchCheckboxSelect({
  id,
  triggerPlaceholder,
  searchPlaceholder,
  options,
  selectedId,
  onChange,
  disabled = false,
  iconType = "folder",
}: SearchCheckboxSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const filtered = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.trim().toLowerCase())
  );

  const selectedLabel = options.find((o) => o.id === selectedId)?.label;
  const ItemIcon = iconType === "folder" ? FolderOutlineIcon : TemplateOutlineIcon;

  return (
    <div ref={containerRef} className="min-w-0">
      <div className="relative">
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          onClick={() => !disabled && setOpen((v) => !v)}
          className={`flex h-10 w-full min-w-0 items-center justify-between rounded-lg border bg-white px-3 text-left text-sm outline-none transition max-[369px]:h-9 max-[369px]:px-2.5 max-[369px]:text-[13px] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand-primary)_25%,transparent)] disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:px-3.5 ${
            open ? "rounded-b-none border-b-0" : ""
          }`}
          style={{
            borderColor: CARD_BORDER,
            color: selectedLabel ? TEXT_PRIMARY : TEXT_MUTED,
          }}
        >
          <span className="min-w-0 truncate">{selectedLabel ?? triggerPlaceholder}</span>
          <span className="shrink-0">{open ? <ChevronUpIcon /> : <ChevronDownIcon />}</span>
        </button>

        {open && !disabled ? (
          <div
            className="absolute left-0 right-0 top-full z-20 overflow-hidden rounded-b-lg border border-t-0 bg-white shadow-sm"
            style={{ borderColor: CARD_BORDER }}
          >
            <div className="border-b px-3 py-2.5" style={{ borderColor: CARD_BORDER }}>
              <div className="relative">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-9 w-full rounded-md border-0 bg-transparent py-2 pl-1 pr-9 text-sm outline-none"
                  style={{ color: TEXT_PRIMARY }}
                  aria-label={searchPlaceholder}
                />
                <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2">
                  <SearchIcon />
                </span>
              </div>
            </div>

            <ul
              id={listboxId}
              role="listbox"
              aria-label={searchPlaceholder}
              className="max-h-[160px] overflow-y-auto py-1"
            >
              {filtered.length === 0 ? (
                <li className="px-3.5 py-3 text-sm" style={{ color: TEXT_MUTED }}>
                  No results found
                </li>
              ) : (
                filtered.map((opt) => {
                  const checked = selectedId === opt.id;
                  return (
                    <li key={opt.id} role="option" aria-selected={checked}>
                      <button
                        type="button"
                        onClick={() => onChange(checked ? "" : opt.id)}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition hover:bg-[#f9fafb]"
                        style={{
                          backgroundColor: checked ? "#f2f4f7" : undefined,
                          color: TEXT_PRIMARY,
                        }}
                      >
                        <ItemIcon />
                        <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                        <span
                          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition ${
                            checked ? "" : "border-[#d0d5dd] bg-white"
                          }`}
                          style={
                            checked
                              ? {
                                  borderColor: BRAND_SECONDARY_BG,
                                  backgroundColor: BRAND_SECONDARY_BG,
                                }
                              : undefined
                          }
                          aria-hidden
                        >
                          {checked ? <CheckIcon /> : null}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : null}
      </div>

      {selectedId ? (
        <p className="mt-1.5 text-right text-xs leading-[18px]" style={{ color: TEXT_MUTED }}>
          1 added
        </p>
      ) : null}
    </div>
  );
}

/** Figma modal header: flowchart nodes icon */
function FlowChartHeaderIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect x="1" y="8" width="6" height="6" rx="1.5" stroke="var(--brand-primary)" strokeWidth="1.5" />
      <rect x="15" y="1" width="6" height="6" rx="1.5" stroke="var(--brand-primary)" strokeWidth="1.5" />
      <rect x="15" y="15" width="6" height="6" rx="1.5" stroke="var(--brand-primary)" strokeWidth="1.5" />
      <path d="M7 11H11M11 11V4M11 11V18" stroke="var(--brand-primary)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CreateFlowPlusIcon() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/40">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
        <path d="M5 2V8M2 5H8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Figma: stacked rounded rectangles flow icon in gold */
function FlowListIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V8C21 8.53043 20.7893 9.03914 20.4142 9.41421C20.0391 9.78929 19.5304 10 19 10H5C4.46957 10 3.96086 9.78929 3.58579 9.41421C3.21071 9.03914 3 8.53043 3 8V5ZM3 16C3 15.4696 3.21071 14.9609 3.58579 14.5858C3.96086 14.2107 4.46957 14 5 14H19C19.5304 14 20.0391 14.2107 20.4142 14.5858C20.7893 14.9609 21 15.4696 21 16V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V16Z"
        stroke="var(--brand-primary)"
        strokeWidth="2"
      />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M8.7501 7.00008C8.7501 7.96658 7.9666 8.75008 7.0001 8.75008C6.0336 8.75008 5.2501 7.96658 5.2501 7.00008C5.2501 6.03358 6.0336 5.25008 7.0001 5.25008C7.9666 5.25008 8.7501 6.03358 8.7501 7.00008Z"
        stroke="var(--brand-primary)"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M1.43408 7.00006C2.17741 4.63343 4.38841 2.91675 7.00036 2.91675C9.61232 2.91675 11.8233 4.63345 12.5666 7.0001C11.8233 9.36674 9.61232 11.0834 7.00037 11.0834C4.38841 11.0834 2.1774 9.36672 1.43408 7.00006Z"
        stroke="var(--brand-primary)"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M8.88544 3.05214L10.9478 5.11453M9.76044 2.17714C10.33 1.60762 11.2533 1.60762 11.8228 2.17714C12.3923 2.74665 12.3923 3.67002 11.8228 4.23953L3.79167 12.2707H1.75V10.1876L9.76044 2.17714Z"
        stroke="var(--brand-primary)"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PublishedBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium leading-[18px]"
      style={{
        color: BRAND_SECONDARY_BG,
        border: `1px solid ${BRAND_SECONDARY_BG}`,
        backgroundColor: "#ffffff",
      }}
    >
      Published
    </span>
  );
}

function UnpublishedBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium leading-[18px]"
      style={{
        color: "#ffffff",
        border: "1px solid #94A3B8",
        backgroundColor: "#94A3B8",
      }}
    >
      Unpublished
    </span>
  );
}

type CreateNewFlowModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (flow: OnboardingFlow) => void | Promise<void>;
  templateOptions: SelectOption[];
  folderOptions: SelectOption[];
  defaultFolderId?: string;
  saving?: boolean;
  error?: string | null;
};

function CreateNewFlowModal({
  open,
  onClose,
  onCreated,
  templateOptions,
  folderOptions,
  defaultFolderId,
  saving = false,
  error,
}: CreateNewFlowModalProps) {
  const [flowName, setFlowName] = useState("");
  const [template, setTemplate] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [createAsBlank, setCreateAsBlank] = useState(false);
  const [folder, setFolder] = useState(defaultFolderId ?? "");
  const [saveStatus, setSaveStatus] = useState<FlowSaveStatus>("published");
  const [employmentType, setEmploymentType] = useState("");
  const [professionId, setProfessionId] = useState("");
  const [professions, setProfessions] = useState<SelectOption[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    setFlowName("");
    setTemplate("");
    setTemplateName("");
    setCreateAsBlank(false);
    setFolder(defaultFolderId ?? "");
    setSaveStatus("published");
    setEmploymentType("");
    setProfessionId("");
    setFormError(null);
  }, [open, defaultFolderId]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      const res = await fetch("/api/admin/professions", {
        ...(await staffFetchInit()),
        cache: "no-store",
      });
      const payload = (await res.json().catch(() => ({}))) as {
        professions?: Array<{ id: string; name: string }>;
      };
      if (!alive || !res.ok) return;
      setProfessions(
        (payload.professions ?? []).map((row) => ({ id: row.id, label: row.name }))
      );
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const handleCreate = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const name = flowName.trim();
      if (!name) return;
      if (employmentType && !professionId) {
        setFormError("A flow with an employment type needs a profession.");
        return;
      }
      setFormError(null);
      const status = saveStatus === "published" ? "published" : "unpublished";
      await onCreated({
        id: "",
        name,
        status,
        libraryId: folder || null,
        templateId: createAsBlank ? null : template || null,
        createdAsBlank: createAsBlank,
        createdAt: "",
        updatedAt: "",
        employmentType: employmentType || null,
        professionId: professionId || null,
      });
    },
    [flowName, onCreated, saveStatus, folder, createAsBlank, template, employmentType, professionId]
  );

  if (!open) return null;

  const fieldClassName =
    "h-10 w-full min-w-0 appearance-none rounded-lg border bg-white px-3 text-sm outline-none transition max-[369px]:h-9 max-[369px]:px-2.5 max-[369px]:text-[13px] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--brand-primary)_25%,transparent)] sm:h-11 sm:px-3.5";
  const fieldStyle = { borderColor: CARD_BORDER, color: TEXT_PRIMARY };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 px-3 py-4 sm:items-center sm:px-4 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-flow-title"
      onClick={onClose}
    >
      <div
        className="relative my-auto w-full max-w-[480px] overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-[#101828] transition hover:brightness-110 sm:right-5 sm:top-5"
          aria-label="Close"
        >
          <CloseIcon />
        </button>

        <div className="max-h-[min(92dvh,760px)] overflow-y-auto p-5 max-[369px]:p-4 sm:p-8">
        <div className="mb-5 flex items-center gap-2.5 pr-9 sm:mb-8 sm:gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11"
            style={{ backgroundColor: "#faf6ef" }}
          >
            <FlowChartHeaderIcon />
          </div>
          <h2
            id="create-flow-title"
            className="min-w-0 text-base font-semibold leading-6 max-[369px]:text-[15px] sm:text-xl sm:leading-7"
            style={{ color: TEXT_PRIMARY }}
          >
            Create a new flow
          </h2>
        </div>

        <form className="flex flex-col gap-4 sm:gap-5" onSubmit={handleCreate}>
          <div className="min-w-0">
            <label
              htmlFor="flow-name"
              className="mb-1.5 block text-sm font-medium leading-5"
              style={{ color: TEXT_PRIMARY }}
            >
              Flow Name
            </label>
            <input
              id="flow-name"
              type="text"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              placeholder="Enter flow name"
              required
              className={fieldClassName}
              style={fieldStyle}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor="flow-employment" className="mb-1.5 block text-sm font-medium leading-5" style={{ color: TEXT_PRIMARY }}>
                Employment type
              </label>
              <select
                id="flow-employment"
                value={employmentType}
                onChange={(event) => setEmploymentType(event.target.value)}
                className={fieldClassName}
                style={fieldStyle}
              >
                <option value="">Select employment type</option>
                <option value="W2">W2</option>
                <option value="1099">1099</option>
                <option value="RNR">RNR</option>
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor="flow-profession" className="mb-1.5 block text-sm font-medium leading-5" style={{ color: TEXT_PRIMARY }}>
                Profession
              </label>
              <select
                id="flow-profession"
                value={professionId}
                onChange={(event) => setProfessionId(event.target.value)}
                className={fieldClassName}
                style={fieldStyle}
                required={employmentType === "W2"}
              >
                <option value="">Select profession</option>
                {professions.map((profession) => (
                  <option key={profession.id} value={profession.id}>
                    {profession.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="min-w-0">
            <label
              htmlFor="flow-template"
              className="mb-1.5 block text-sm font-medium leading-5"
              style={{ color: TEXT_PRIMARY }}
            >
              Select Template
            </label>
            <SearchCheckboxSelect
              id="flow-template"
              triggerPlaceholder="Select a template"
              searchPlaceholder="Search template"
              options={templateOptions}
              selectedId={template}
              onChange={setTemplate}
              disabled={createAsBlank}
              iconType="template"
            />
          </div>

          <div className="relative flex items-center py-1">
            <div className="h-px flex-1" style={{ backgroundColor: CARD_BORDER }} />
            <span
              className="px-3 text-xs font-semibold uppercase tracking-wide"
              style={{ color: TEXT_MUTED }}
            >
              OR
            </span>
            <div className="h-px flex-1" style={{ backgroundColor: CARD_BORDER }} />
          </div>

          <label
            className="flex h-11 w-full min-w-0 cursor-pointer items-center justify-center gap-2.5 rounded-lg border transition max-[369px]:h-10 sm:h-12"
            style={{
              borderColor: createAsBlank ? "var(--brand-primary)" : CARD_BORDER,
              backgroundColor: createAsBlank ? "#faf6ef" : undefined,
            }}
          >
            <input
              type="checkbox"
              checked={createAsBlank}
              onChange={(e) => {
                const checked = e.target.checked;
                setCreateAsBlank(checked);
                if (checked) {
                  setTemplate("");
                }
              }}
              className="sr-only"
            />
            <span
              className={`flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border ${
                createAsBlank ? "" : "border-[#D0D5DD] bg-white"
              }`}
              style={
                createAsBlank
                  ? {
                      borderColor: BRAND_SECONDARY_BG,
                      backgroundColor: BRAND_SECONDARY_BG,
                    }
                  : undefined
              }
              aria-hidden
            >
              {createAsBlank ? <CheckIcon /> : null}
            </span>
            <span className="text-sm font-medium leading-5" style={{ color: TEXT_SECONDARY }}>
              Create as blank
            </span>
          </label>
          {createAsBlank ? (
            <p className="text-xs leading-5" style={{ color: TEXT_MUTED }}>
              Opens an empty canvas. Add steps from the library to build the workflow from scratch.
            </p>
          ) : null}

          {createAsBlank ? (
            <div className="min-w-0">
              <label
                htmlFor="template-name"
                className="mb-1.5 block text-sm font-medium leading-5"
                style={{ color: TEXT_PRIMARY }}
              >
                Template Name
              </label>
              <input
                id="template-name"
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className={fieldClassName}
                style={fieldStyle}
              />
            </div>
          ) : null}

          <div className="min-w-0">
            <label
              htmlFor="flow-folder"
              className="mb-1.5 block text-sm font-medium leading-5"
              style={{ color: TEXT_PRIMARY }}
            >
              Add flow to folder
            </label>
            <SearchCheckboxSelect
              id="flow-folder"
              triggerPlaceholder="Select folder"
              searchPlaceholder="Search folder"
              options={folderOptions}
              selectedId={folder}
              onChange={setFolder}
              iconType="folder"
            />
          </div>

          <fieldset className="flex flex-wrap items-center gap-4 sm:gap-6">
            <legend className="sr-only">Flow status</legend>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="radio"
                name="flow-status"
                value="published"
                checked={saveStatus === "published"}
                onChange={() => setSaveStatus("published")}
                className="h-[18px] w-[18px] border-[#d0d5dd]"
                style={{ accentColor: BRAND_SECONDARY_BG }}
              />
              <span className="text-sm font-medium leading-5" style={{ color: TEXT_SECONDARY }}>
                Published
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="radio"
                name="flow-status"
                value="draft"
                checked={saveStatus === "draft"}
                onChange={() => setSaveStatus("draft")}
                className="h-[18px] w-[18px] border-[#d0d5dd]"
                style={{ accentColor: BRAND_SECONDARY_BG }}
              />
              <span className="text-sm font-medium leading-5" style={{ color: TEXT_SECONDARY }}>
                Save as draft
              </span>
            </label>
          </fieldset>

          {formError || error ? (
            <p className="text-sm text-red-600" role="alert">
              {formError || error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving || !flowName.trim()}
            className="mt-1 h-10 w-full rounded-lg text-sm font-semibold text-white transition hover:brightness-[0.97] disabled:opacity-60 max-[369px]:h-9 sm:h-11"
            style={{ background: GOLD_GRADIENT }}
          >
            {saving ? "Creating…" : "Create"}
          </button>
        </form>
        </div>
      </div>
    </div>
  );
}

type FlowCardProps = {
  flow: OnboardingFlow;
  builderHref: string;
};

function FlowCard({ flow, builderHref }: FlowCardProps) {
  const published = flow.status === "published";

  return (
    <Link
      href={builderHref}
      className="group relative flex min-w-0 items-center gap-3 rounded-xl border bg-white px-3 py-3.5 transition hover:border-[color:var(--brand-primary)] sm:gap-4 sm:px-4 sm:py-4"
      style={{
        borderColor: CARD_BORDER,
        boxShadow: "0 1px 2px rgba(16, 24, 40, 0.05)",
      }}
      aria-label={`Open ${flow.name} in builder`}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11"
        style={{ backgroundColor: ICON_BOX_BG }}
      >
        <FlowListIcon />
      </div>

      <div className="min-w-0 flex-1 pr-12 sm:pr-16">
        <h3
          className="truncate text-[14px] font-semibold leading-5 sm:text-[15px] sm:leading-6"
          style={{ color: TEXT_PRIMARY }}
        >
          {flow.name}
        </h3>
        <div className="mt-1.5">
          {published ? <PublishedBadge /> : <UnpublishedBadge />}
        </div>
      </div>

      <div
        className="absolute right-3 top-1/2 flex h-[14px] w-[36px] -translate-y-1/2 items-center gap-2 opacity-100 transition-opacity sm:right-4 md:opacity-0 md:group-hover:opacity-100"
        aria-hidden
      >
        <EyeIcon />
        <EditIcon />
      </div>
    </Link>
  );
}

type OnboardingFlowsPageProps = {
  dashboardBasePath?: string;
  showTopTabs?: boolean;
  embeddedInAdminShell?: boolean;
};

function OnboardingFlowsPageContent({
  dashboardBasePath = "/braas-hr/dashboard",
  showTopTabs = false,
  embeddedInAdminShell = false,
}: OnboardingFlowsPageProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const libraryIdFromUrl = searchParams.get("library")?.trim() || undefined;

  const [activeTab, setActiveTab] = useState<FilterTab>("published");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [mappingSetup, setMappingSetup] = useState<{
    workflowId: string;
    workflowName: string;
    suggestedEmploymentType?: "W2" | "1099" | "Contract" | null;
  } | null>(null);

  const { libraries, isLoading: librariesLoading, error: librariesError } = useOnboardingLibraries();
  const { templateOptions, isLoading: templatesLoading } = useOnboardingTemplates();

  const onboardingLibrary = useMemo(
    () => libraries.find((l) => l.slug === "onboarding") ?? null,
    [libraries]
  );

  const effectiveLibraryId = libraryIdFromUrl ?? onboardingLibrary?.id;

  // Sync URL with resolved default library so refreshes stay scoped
  useEffect(() => {
    if (librariesLoading || libraryIdFromUrl || !onboardingLibrary?.id) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("library", onboardingLibrary.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [
    librariesLoading,
    libraryIdFromUrl,
    onboardingLibrary?.id,
    pathname,
    router,
    searchParams,
  ]);

  const folderOptions: SelectOption[] = useMemo(
    () => libraries.map((l) => ({ id: l.id, label: l.name })),
    [libraries]
  );

  const defaultFolderId = effectiveLibraryId ?? folderOptions[0]?.id;

  const {
    flows,
    publishedCount,
    unpublishedCount,
    library: activeLibrary,
    isLoading: flowsLoading,
    isFetching: flowsFetching,
    error: flowsError,
    createFlow,
    isCreating,
    refetch,
  } = useOnboardingFlows({
    libraryId: effectiveLibraryId,
    status: activeTab,
    enabled: !librariesLoading && Boolean(effectiveLibraryId),
  });

  const builderBase = `${dashboardBasePath}/onboarding-builder`;

  const handleFlowCreated = useCallback(
    async (draft: OnboardingFlow) => {
      try {
        const created = await createFlow({
          name: draft.name,
          libraryId: draft.libraryId ?? effectiveLibraryId ?? null,
          templateId: draft.templateId,
          createAsBlank: draft.createdAsBlank,
          status: draft.status,
          employmentType: draft.employmentType ?? null,
          professionId: draft.professionId ?? null,
        });
        setCreateModalOpen(false);
        if (created.status === "published") {
          setActiveTab("published");
          const templateEmployment = draft.templateId
            ? templateOptions.find((item) => item.id === draft.templateId)?.label
            : null;
          const label = templateEmployment?.toLowerCase() ?? "";
          const suggestedEmploymentType =
            label.includes("1099") || label.includes("contractor")
              ? "1099"
              : label.includes("rnr") || label.includes("r&r") || label.includes("recruit and release")
                ? "Contract"
                : label.includes("w2")
                  ? "W2"
                  : null;
          setMappingSetup({
            workflowId: created.id,
            workflowName: created.name,
            suggestedEmploymentType,
          });
        } else {
          setActiveTab("unpublished");
        }
        await refetch();
        router.push(`${builderBase}?flow=${created.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create flow");
        throw e;
      }
    },
    [createFlow, effectiveLibraryId, refetch, router, builderBase, templateOptions]
  );

  const sectionTitle = activeTab === "published" ? "Published Flows" : "Unpublished Flows";
  const libraryLabel = activeLibrary?.name ?? onboardingLibrary?.name ?? "Onboarding Flows";
  const isPageLoading = librariesLoading || (!effectiveLibraryId && !librariesError);
  const isFlowsLoading = isPageLoading || flowsLoading || flowsFetching;

  useEffect(() => {
    if (pathname === "/braas-hr/dashboard/onboarding-flows") {
      router.replace("/admin_recruiter/dashboard/onboarding-flows");
    }
  }, [pathname, router]);

  if (pathname === "/braas-hr/dashboard/onboarding-flows") {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: PAGE_BG }}>
      <div
        className={`w-full min-w-0 overflow-x-hidden ${
          embeddedInAdminShell
            ? "px-3 py-4 max-[369px]:px-2.5 sm:px-5 sm:py-6 lg:px-8"
            : "mx-auto max-w-[1280px] px-6 py-8 sm:px-10 sm:py-10"
        }`}
      >
        {!embeddedInAdminShell && showTopTabs ? (
          <div className="mb-6 flex h-[62px] w-full items-center justify-between border border-[#E4E7EC] bg-white px-5 py-[14px]">
            <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 text-[13px] leading-5">
              <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[#667085]">
                <Link href={dashboardBasePath} className="hover:underline">
                  Dashboard
                </Link>
                <span>&gt;</span>
                <span className="text-[#344054]">Workflows</span>
              </nav>
              <nav className="flex flex-wrap items-center gap-6 text-sm text-[#012352]" aria-label="Workflow tabs">
                <span className="cursor-pointer">Builder</span>
                <Link href="/admin_recruiter/dashboard/templates" className="cursor-pointer">
                  Templates
                </Link>
                <Link href="/admin_recruiter/dashboard/onboarding-flows" className="cursor-pointer border-b-2 border-[color:var(--brand-primary)] pb-1 text-[color:var(--brand-primary)]">
                  Workflows
                </Link>
                <Link href="/admin_recruiter/dashboard/workflowlibrary" className="cursor-pointer">
                  Library
                </Link>
              </nav>
            </div>
          </div>
        ) : null}

        <header className="mb-8 flex flex-col gap-4 min-[500px]:gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1
              className="text-[27px] font-semibold leading-[33px] tracking-normal text-[#000000] min-[500px]:text-[30px] min-[500px]:leading-[36px]"
            >
              {libraryLabel}
            </h1>
            <p className="mt-3 text-[16px] font-normal leading-6 text-[#374151]">
              {publishedCount} Published <span className="text-[#d0d5dd]">•</span>{" "}
              {unpublishedCount} Unpublished
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex h-10 w-full items-center justify-center gap-2 self-start rounded-lg px-4 text-sm font-semibold text-white transition hover:brightness-[0.97] min-[500px]:w-auto"
            style={{ backgroundColor: BRAND_SECONDARY_BG }}
          >
            <CreateFlowPlusIcon />
            Create a new flow
          </button>
        </header>

        <div
          className="mb-8 flex w-full gap-1 min-[500px]:inline-flex min-[500px]:w-auto"
          role="tablist"
          aria-label="Flow status"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "published"}
            onClick={() => setActiveTab("published")}
            className="flex-1 rounded-full px-5 py-2 text-sm font-semibold leading-5 transition min-[500px]:flex-none"
            style={{
              background: activeTab === "published" ? GOLD_GRADIENT : "transparent",
              color: activeTab === "published" ? "#ffffff" : TEXT_SECONDARY,
            }}
          >
            Published
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "unpublished"}
            onClick={() => setActiveTab("unpublished")}
            className="flex-1 rounded-full px-5 py-2 text-sm font-semibold leading-5 transition min-[500px]:flex-none"
            style={{
              background: activeTab === "unpublished" ? GOLD_GRADIENT : "transparent",
              color: activeTab === "unpublished" ? "#ffffff" : TEXT_SECONDARY,
            }}
          >
            Unpublished
          </button>
        </div>

        {(librariesError || flowsError) ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {librariesError instanceof Error
              ? librariesError.message
              : flowsError instanceof Error
                ? flowsError.message
                : "Failed to load onboarding flows"}
          </div>
        ) : null}

        {isFlowsLoading ? (
          <CandidateDetailLoader label="Loading flows…" className="min-h-[280px] bg-transparent py-10" />
        ) : !effectiveLibraryId ? (
          <p className="py-12 text-center text-sm" style={{ color: TEXT_MUTED }}>
            No onboarding library found for this tenant.
          </p>
        ) : (
          <>
        <div className="mb-5 flex items-center justify-between">
          <h2
            className="text-lg font-semibold leading-7"
            style={{ color: TEXT_PRIMARY }}
          >
            {sectionTitle}
          </h2>
          <span className="text-sm leading-5" style={{ color: TEXT_MUTED }}>
            {flows.length}
          </span>
        </div>

        {flows.length === 0 ? (
          <p className="py-12 text-center text-sm" style={{ color: TEXT_MUTED }}>
            {activeTab === "published"
              ? "No published flows found."
              : "No unpublished flows found."}
          </p>
        ) : (
          <section
            className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            aria-label={sectionTitle}
          >
            {flows.map((flow) => (
              <FlowCard
                key={flow.id}
                flow={flow}
                builderHref={`${builderBase}?flow=${flow.id}`}
              />
            ))}
          </section>
        )}
          </>
        )}
      </div>

      <CreateNewFlowModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleFlowCreated}
        templateOptions={templateOptions}
        folderOptions={folderOptions}
        defaultFolderId={defaultFolderId}
        saving={isCreating || templatesLoading}
      />

      <ConfigureMappingModal
        open={mappingSetup !== null}
        workflowId={mappingSetup?.workflowId ?? ""}
        workflowName={mappingSetup?.workflowName ?? ""}
        suggestedEmploymentType={mappingSetup?.suggestedEmploymentType}
        onClose={() => {
          setMappingSetup(null);
          if (mappingSetup?.workflowId) {
            router.push(`${builderBase}?flow=${mappingSetup.workflowId}`);
          }
        }}
        onSaved={() => {
          const flowId = mappingSetup?.workflowId;
          setMappingSetup(null);
          if (flowId) router.push(`${builderBase}?flow=${flowId}`);
        }}
      />
    </div>
  );
}

export function OnboardingFlowsPage(props: OnboardingFlowsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center">
          <CandidateDetailLoader />
        </div>
      }
    >
      <OnboardingFlowsPageContent {...props} />
    </Suspense>
  );
}

export default function BraasOnboardingFlowsPage() {
  return <OnboardingFlowsPage dashboardBasePath="/braas-hr/dashboard" />;
}
