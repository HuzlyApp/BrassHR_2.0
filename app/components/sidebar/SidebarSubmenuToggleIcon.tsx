type SidebarSubmenuToggleIconProps = {
  open: boolean;
  /** Rendered edge length in px (Figma admin sidebar uses 20). */
  size?: number;
  /** Chevron direction while the submenu is open (Figma admin sidebar uses "up"). */
  openDirection?: "down" | "up";
};

const SIDEBAR_SUBMENU_RIGHT_ARROW_SRC = "/icons/right-Arrow.svg";
const SIDEBAR_SUBMENU_DOWN_ARROW_SRC = "/icons/down-Arrow.svg";
const SIDEBAR_SUBMENU_UP_ARROW_SRC = "/icons/up-Arrow.svg";

/** Default gray expand/collapse chevrons for sidebar submenus (not tenant-branded). */
export function SidebarSubmenuToggleIcon({
  open,
  size = 24,
  openDirection = "down",
}: SidebarSubmenuToggleIconProps) {
  const openSrc = openDirection === "up" ? SIDEBAR_SUBMENU_UP_ARROW_SRC : SIDEBAR_SUBMENU_DOWN_ARROW_SRC;
  return (
    <img
      src={open ? openSrc : SIDEBAR_SUBMENU_RIGHT_ARROW_SRC}
      alt=""
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
