"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  closedGroupPickerLabel,
  groupSelectOptions,
  groupStatuses,
  type GroupableStatus,
  type GroupedSelectOption,
  type StatusGroupSection,
} from "@/lib/jobs/application-statuses/groups";

function GroupAccordionSection<T extends GroupableStatus>({
  section,
  open,
  onOpen,
  onToggle,
  renderOption,
}: {
  section: StatusGroupSection<T>;
  open: boolean;
  onOpen: () => void;
  onToggle: () => void;
  renderOption: (option: T) => ReactNode;
}) {
  const panelId = useId();

  return (
    <div
      role="group"
      aria-label={section.name}
      onMouseEnter={onOpen}
      onFocus={onOpen}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={`flex min-h-9 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-[#0F172A] transition hover:bg-[#F8FAFC] ${
          open ? "bg-[#F1F5F9]" : ""
        }`}
      >
        <span className="min-w-0 truncate">
          {section.shared ? closedGroupPickerLabel(section.name) : section.name}
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 text-[11px] font-medium text-[#94A3B8]">
          {section.shared ? (
            <span className="rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#92400E]">
              Shared
            </span>
          ) : null}
          {section.statuses.length}
          <span aria-hidden className={`transition ${open ? "rotate-90" : ""}`}>
            ›
          </span>
        </span>
      </button>

      {open ? (
        <div id={panelId} role="menu" aria-label={`${section.name} statuses`} className="pb-1">
          {section.shared ? (
            <p className="px-3 pb-1 text-[11px] leading-4 text-[#92400E]">
              Closing outcomes available from every stage
            </p>
          ) : null}
          {section.statuses.length === 0 ? (
            <p className="px-3 py-1.5 text-sm text-[#94A3B8]">No statuses</p>
          ) : (
            section.statuses.map((option) => (
              <div key={option.id} className="pl-2">
                {renderOption(option)}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Compact status picker: shows group names only.
 * Hover / focus opens a group; tap toggles it on touch devices.
 * Statuses for the open group appear nested underneath.
 */
export function GroupedStatusMenuList<T extends GroupableStatus>({
  options,
  renderOption,
}: {
  options: T[];
  renderOption: (option: T) => ReactNode;
}) {
  const sections = groupStatuses(options);
  const showGroups = sections.some((section) => section.name !== "Ungrouped");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpenKey(null), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close]);

  if (!showGroups) {
    return (
      <>
        {options.map((option) => (
          <Fragment key={option.id}>{renderOption(option)}</Fragment>
        ))}
      </>
    );
  }

  return (
    <div ref={rootRef} className="py-1">
      {sections.map((section) => (
        <GroupAccordionSection
          key={section.key}
          section={section}
          open={openKey === section.key}
          onOpen={() => setOpenKey(section.key)}
          onToggle={() =>
            setOpenKey((current) => (current === section.key ? null : section.key))
          }
          renderOption={renderOption}
        />
      ))}
    </div>
  );
}

export function GroupedFilterOptions({ options }: { options: GroupedSelectOption[] }) {
  const sections = groupSelectOptions(options);
  const showGroups = sections.some((section) => section.name !== "Ungrouped");

  if (!showGroups) {
    return (
      <>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </>
    );
  }

  return (
    <>
      {sections.map((section) => (
        <optgroup
          key={section.key}
          label={section.shared ? closedGroupPickerLabel(section.name) : section.name}
        >
          {section.statuses.map((option) => (
            <option key={option.value} value={option.value} title={section.description ?? undefined}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
