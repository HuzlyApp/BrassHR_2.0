"use client";

import BrandedSvgIcon from "@/app/components/BrandedSvgIcon";

const SORT_ICON_COLOR = "#94A3B8";
const SORT_ICON_SRC = "/icons/ri_expand-up-down-fill.svg";

export type ListSortableHeaderProps = {
  label: string;
  align?: "left" | "center";
  active: boolean;
  direction?: "asc" | "desc";
  onSort: () => void;
  className?: string;
  iconClassName?: string;
};

/** Shared table header: title left/center, expand sort icon pinned to the right. */
export function ListSortableHeader({
  label,
  align = "center",
  active,
  direction = "desc",
  onSort,
  className = "",
  iconClassName = "h-5 w-5",
}: ListSortableHeaderProps) {
  const ascending = active && direction === "asc";

  return (
    <button
      type="button"
      onClick={onSort}
      className={`relative inline-flex w-full items-center text-sm font-medium normal-case tracking-normal text-black transition hover:text-[#0F172A] ${className}`}
      aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
      aria-label={`Sort by ${label}`}
      title={`Sort by ${label}`}
    >
      <span
        className={`min-w-0 pr-6 ${align === "left" ? "text-left" : "w-full text-center"}`}
      >
        {label}
      </span>
      <BrandedSvgIcon
        src={SORT_ICON_SRC}
        color={SORT_ICON_COLOR}
        className={`pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 ${iconClassName}`}
      />
    </button>
  );
}
