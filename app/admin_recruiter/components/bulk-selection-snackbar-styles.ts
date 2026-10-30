/** Figma Analytics/bg — lite-yellow (icon bg). Fixed bulk-selection snackbar background. */
export const BULK_SELECTION_SNACKBAR_BG = "#FFF1BF";

export const BULK_SELECTION_SNACKBAR_BG_CLASS = "bg-[#FFF1BF]";

/** Primary tenant branding border for bulk-selection snackbars. */
export const BULK_SELECTION_SNACKBAR_BORDER_CLASS = "border border-[color:var(--brand-primary)]";

export const BULK_SELECTION_SNACKBAR_SURFACE_CLASS = [
  BULK_SELECTION_SNACKBAR_BG_CLASS,
  BULK_SELECTION_SNACKBAR_BORDER_CLASS,
].join(" ");

export const BULK_SELECTION_SNACKBAR_LAYOUT_CLASS =
  "flex flex-col gap-3 px-[14px] py-3 sm:flex-row sm:items-center sm:justify-between";

export const BULK_SELECTION_SNACKBAR_CLASS = [
  BULK_SELECTION_SNACKBAR_SURFACE_CLASS,
  BULK_SELECTION_SNACKBAR_LAYOUT_CLASS,
].join(" ");

export const BULK_SELECTION_SNACKBAR_LABEL_CLASS =
  "text-sm font-semibold leading-5 text-[color:var(--brand-secondary)]";

export const BULK_SELECTION_SNACKBAR_ACTION_CLASS =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[color:var(--brand-primary)] px-3 text-xs font-semibold leading-4 text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";

export const BULK_SELECTION_SNACKBAR_ICON_BTN_CLASS =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--brand-primary)] text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";
