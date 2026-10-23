/** Figma sidebar icon names — maps 1:1 to `Type=` in SVG filenames. */
export type SidebarIconType =
  | "Dashboard"
  | "Mail"
  | "Chat"
  | "Schedule"
  | "Shifts"
  | "Tickets"
  | "Reports"
  | "Finance"
  | "Taskboard"
  | "Template Builder"
  | "Teams"
  | "Automation"
  | "Connect"
  | "Applicant"
  | "Clients"
  | "Organization"
  | "Jobs"
  | "My Profile"
  | "Notifications"
  | "Help & Support"
  | "Settings"
  | "Time"
  | "Pay"
  | "Logout";

const DEFAULT_FOLDER = "/icons/sidebar-icons/default-icons";
const ACTIVE_FOLDER = "/icons/sidebar-icons/active-page-icons";

/** Icons that only exist in the default-icons folder. */
const DEFAULT_ONLY: SidebarIconType[] = [];

/** Icons that only exist in the active-page-icons folder. */
const ACTIVE_ONLY: SidebarIconType[] = [];

function iconFolder(active: boolean): string {
  return active ? ACTIVE_FOLDER : DEFAULT_FOLDER;
}

function buildIconPath(type: SidebarIconType, active: boolean): string {
  const state = active ? "Selected" : "Default";
  // Keep `Type=` / `State=` readable; only encode characters that break URLs/CSS.
  return `${iconFolder(active)}/Type=${encodeURIComponent(type)}%2C%20State=${state}.svg`;
}

/** Resolve default vs active Figma sidebar icon (20×20), with fallbacks when a variant is missing. */
export function getSidebarIconSrc(type: SidebarIconType, active: boolean): string {
  if (active && DEFAULT_ONLY.includes(type)) {
    return buildIconPath(type, false);
  }
  if (!active && ACTIVE_ONLY.includes(type)) {
    return buildIconPath(type, true);
  }
  return buildIconPath(type, active);
}

export const SIDEBAR_ICON_SIZE_CLASS = "h-5 w-5";
