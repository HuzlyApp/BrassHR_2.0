"use client";

/* eslint-disable react-hooks/static-components */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { X } from "lucide-react";
import { SidebarSubmenuToggleIcon } from "@/app/components/sidebar/SidebarSubmenuToggleIcon";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { BRAAS_PLATFORM_FAVICON } from "@/lib/tenant/tenant-branding";
import { useAccountData } from "@/app/admin_recruiter/hooks/useAccountData";
import { appRoleToConsoleRole } from "@/lib/admin/staff-directory-types";
import {
  ADMIN_RECRUITER_HOME_ROUTE,
  CLIENT_SIDEBAR_SECTIONS,
  GOD_ADMIN_SIDEBAR_SECTIONS,
  SIDEBAR_ICON_TYPES,
  type SidebarLink,
  type SidebarSection,
} from "@/app/admin_recruiter/components/sidebar-config";
import SidebarNavIcon from "@/app/admin_recruiter/components/SidebarNavIcon";
import { StaffProfileAvatar } from "@/app/admin_recruiter/components/StaffProfileAvatar";
import {
  formatRoleLabel,
  getAccountDisplayName,
  getOrganizationDisplayName,
} from "@/lib/account/display-name";
import { useEffectiveBranding } from "@/lib/admin/hooks/use-effective-branding";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { recruiterLogoutLoginHref } from "@/lib/auth/recruiter-sign-in";
import { SIDEBAR_NAV_ACTIVE_TEXT_CLASS } from "@/lib/sidebar/sidebar-nav-styles";

/** Figma `text/text-brass-navy` — inactive admin sidebar labels. */
const ADMIN_SIDEBAR_INACTIVE_TEXT_CLASS = "text-[#012352]";
/** Figma `border/border-lite` — sidebar footer divider. */
const ADMIN_SIDEBAR_DIVIDER_CLASS = "border-[#ECF1F9]";

function adminNavTextClass(active: boolean): string {
  return active
    ? SIDEBAR_NAV_ACTIVE_TEXT_CLASS
    : `${ADMIN_SIDEBAR_INACTIVE_TEXT_CLASS} hover:text-[color:var(--brand-primary)]`;
}

/** Disabled (route not built yet) rows keep the Figma navy label, just without hover. */
function adminSubmenuTextClass(active: boolean, disabled = false): string {
  const color = active ? SIDEBAR_NAV_ACTIVE_TEXT_CLASS : ADMIN_SIDEBAR_INACTIVE_TEXT_CLASS;
  const hover = !active && !disabled ? " hover:text-[color:var(--brand-primary)]" : "";
  return `${color}${hover}`;
}

const SIDEBAR_EXPANDED_WIDTH = 272;
const SIDEBAR_COLLAPSED_WIDTH = 80;
const SIDEBAR_COLLAPSED_WIDTH_NARROW = Math.round(SIDEBAR_COLLAPSED_WIDTH * 0.8);
/** Extra-narrow mobile rail — 25% slimmer than narrow rail, only below 430px */
const SIDEBAR_COLLAPSED_WIDTH_MOBILE = Math.round(SIDEBAR_COLLAPSED_WIDTH_NARROW * 0.75);

type AdminRecruiterSidebarProps = {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  collapsed?: boolean;
};

/** First enabled child link for collapsed-rail navigation. */
function getFirstNavigableChildHref(children: SidebarLink[]): string | null {
  for (const child of children) {
    if (child.disabled) continue;
    if (child.children?.length) {
      const nested = getFirstNavigableChildHref(child.children);
      if (nested) return nested;
      continue;
    }
    const href = child.href?.trim();
    if (href && href !== "#") return href;
  }
  return null;
}

function linkOrNestedIsActive(
  link: SidebarLink,
  isActive: (link: Pick<SidebarLink, "matchPrefixes" | "matchExact">) => boolean
): boolean {
  if (isActive(link)) return true;
  return link.children?.some((child) => linkOrNestedIsActive(child, isActive)) ?? false;
}

type RenderedSidebarLink = SidebarLink & {
  active: boolean;
  children?: RenderedSidebarLink[];
};

function decorateSidebarLink(
  link: SidebarLink,
  isActive: (link: Pick<SidebarLink, "matchPrefixes" | "matchExact">) => boolean
): RenderedSidebarLink {
  const children = link.children?.map((child) => decorateSidebarLink(child, isActive));
  return {
    ...link,
    active: isActive(link) || Boolean(children?.some((child) => child.active)),
    children,
  };
}

const DEFAULT_TENANT_LOGO = BRAAS_PLATFORM_FAVICON;
const DASHBOARD_HOME_HREF = ADMIN_RECRUITER_HOME_ROUTE;
const RECRUITER_HIDDEN_SECTIONS = new Set(["Automation", "Templates", "Taskboard"]);
const RECRUITER_SETTINGS_CHILDREN = new Set(["Profile", "Notifications", "Help & Support", "Reports"]);

function settingsChildrenForRecruiter(children: SidebarLink[]): SidebarLink[] {
  const visible: SidebarLink[] = [];
  for (const child of children) {
    if (child.label === "Personal Settings") {
      for (const nested of child.children ?? []) {
        if (RECRUITER_SETTINGS_CHILDREN.has(nested.label)) visible.push(nested);
      }
      continue;
    }
    if (RECRUITER_SETTINGS_CHILDREN.has(child.label)) visible.push(child);
  }
  return visible;
}

export function AdminRecruiterSidebar({
  isMobileOpen = false,
  onMobileClose,
  collapsed = false,
}: AdminRecruiterSidebarProps) {
  const branding = useTenantBranding();
  const { user, profile, organization } = useAccountData();
  const [logoSrc, setLogoSrc] = useState(branding.faviconUrl || branding.logoUrl || DEFAULT_TENANT_LOGO);
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [openSectionLabels, setOpenSectionLabels] = useState<string[]>([]);
  const { viewer } = useEffectiveBranding();
  const isGodAdmin = viewer?.godAdmin === true;
  const isRecruiter = appRoleToConsoleRole(profile?.role) === "recruiter";
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const sidebarSections = useMemo(() => {
    if (isGodAdmin) return GOD_ADMIN_SIDEBAR_SECTIONS;
    if (isRecruiter) {
      return CLIENT_SIDEBAR_SECTIONS.filter((section) => !RECRUITER_HIDDEN_SECTIONS.has(section.label)).map(
        (section) => {
          if (section.label !== "Settings" || !section.children?.length) return section;
          return {
            ...section,
            children: settingsChildrenForRecruiter(section.children),
          };
        }
      );
    }
    return CLIENT_SIDEBAR_SECTIONS;
  }, [isGodAdmin, isRecruiter]);

  const handleNavClick = () => {
    onMobileClose?.();
  };

  useEffect(() => {
    setLogoSrc(branding.faviconUrl?.trim() || branding.logoUrl?.trim() || DEFAULT_TENANT_LOGO);
  }, [branding.faviconUrl, branding.logoUrl]);

  const handleLogout = async () => {
    const { error } = await supabaseBrowser.auth.signOut();
    if (error) return;
    onMobileClose?.();
    router.push(
      recruiterLogoutLoginHref({
        brandingSlug: branding.slug,
        organizationSubdomain: organization?.subdomain,
      })
    );
  };

  const profileName = getAccountDisplayName(profile, user);
  const profileRole = formatRoleLabel(profile?.role);
  const sidebarCompanyName = getOrganizationDisplayName(organization, profile, user);
  const profilePhoto = profile?.avatar_url ?? null;

  const isLinkActive = (link: Pick<SidebarLink, "matchPrefixes" | "matchExact">) =>
    link.matchPrefixes.some((prefix) =>
      link.matchExact ? pathname === prefix || pathname === `${prefix}/` : pathname.startsWith(prefix)
    );

  const isPathActive = (prefixes: string[]) => prefixes.some((prefix) => pathname.startsWith(prefix));

  const renderedSections = useMemo(
    () =>
      sidebarSections.map((section) => {
        const childActive =
          section.children?.some((child) => linkOrNestedIsActive(child, isLinkActive)) ?? false;
        const sectionPathActive = isPathActive(section.matchPrefixes);
        const sectionActive =
          section.controlsActiveState === false ? false : sectionPathActive || childActive;

        return {
          ...section,
          active: sectionActive,
          childActive,
          children: section.children?.map((child) => decorateSidebarLink(child, isLinkActive)) ?? [],
        };
      }),
    [pathname, sidebarSections]
  );

  useEffect(() => {
    const labels: string[] = [];
    for (const section of sidebarSections) {
      const sectionOpen =
        section.children?.some((child) => linkOrNestedIsActive(child, isLinkActive)) ||
        (section.matchPrefixes.length > 0 && isPathActive(section.matchPrefixes));
      if (sectionOpen) labels.push(section.label);
      for (const child of section.children ?? []) {
        if (child.children?.some((nested) => isLinkActive(nested))) labels.push(child.label);
      }
    }
    if (labels.length === 0) return;
    setOpenSectionLabels((prev) => {
      if (labels.every((label) => prev.includes(label))) return prev;
      return Array.from(new Set([...prev, ...labels]));
    });
  }, [pathname, sidebarSections]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.ownerDocument.activeElement;
    if (active instanceof HTMLElement && nav.contains(active)) {
      active.blur();
    }
    setSidebarHovered(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileOpen) setSidebarHovered(false);
  }, [isMobileOpen]);

  const isSectionOpen = (section: SidebarSection) => openSectionLabels.includes(section.label);

  const toggleSectionOpen = (sectionLabel: string, nav: HTMLElement | null) => {
    const scrollTop = nav?.scrollTop ?? 0;
    setOpenSectionLabels((prev) =>
      prev.includes(sectionLabel) ? prev.filter((label) => label !== sectionLabel) : [...prev, sectionLabel]
    );
    requestAnimationFrame(() => {
      if (nav) nav.scrollTop = scrollTop;
    });
  };

  const handleSectionToggleClick = (
    sectionLabel: string,
    event: MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    const nav = event.currentTarget.closest("nav");
    toggleSectionOpen(sectionLabel, nav);
  };

  const sidebarHoverProps = {
    onMouseEnter: () => setSidebarHovered(true),
    onMouseLeave: () => setSidebarHovered(false),
  };

  const sidebarHoverClass = sidebarHovered ? "is-hovered" : "";

  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

  /** Figma rows: 20px content + 24px gap → 44px pitch when expanded. */
  const collapsedRowClass = (isCollapsed: boolean, isMobileRail: boolean) =>
    isCollapsed
      ? isMobileRail
        ? "min-h-[36px] w-full justify-center px-0 py-1.5"
        : "min-h-[36px] w-full justify-center px-0 py-2"
      : "min-h-[44px] gap-3 pl-0 pr-3";

  const navTextClass = adminNavTextClass;

  const submenuTextClass = adminSubmenuTextClass;

  const iconTintHex = branding.primaryHex;

  const renderSidebarContent = (
    isCollapsed: boolean,
    options?: { isMobileRail?: boolean; showMobileClose?: boolean }
  ) => {
    const isMobileRail = options?.isMobileRail ?? false;
    const showMobileClose = options?.showMobileClose ?? false;

    return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div
        className={`admin-recruiter-sidebar-brand shrink-0 ${
          isMobileRail
            ? "flex items-center justify-center px-0"
            : isCollapsed
              ? "px-2"
              : "px-5"
        }`}
      >
        <div
          className={`flex w-full items-center ${
            isCollapsed && !isMobileRail
              ? "justify-center"
              : showMobileClose
                ? "justify-between gap-3"
                : isMobileRail
                  ? "justify-center"
                  : "gap-2.5"
          }`}
        >
          <Link
            href={DASHBOARD_HOME_HREF}
            onClick={handleNavClick}
            aria-label="Go to home"
            title="Home"
            className={`flex min-w-0 items-center transition hover:opacity-90 ${
              isCollapsed && !isMobileRail ? "justify-center" : isMobileRail ? "justify-center" : "gap-2.5"
            }`}
          >
            <div
              className={`admin-recruiter-sidebar-logo-frame flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[color:var(--brand-primary)] bg-white ${
                isMobileRail ? "h-9 w-9" : "h-10 w-10"
              }`}
            >
              <img
                src={logoSrc}
                alt={branding.companyName}
                className={`object-contain ${isMobileRail ? "max-h-[26px] max-w-[26px]" : "max-h-[28px] max-w-[28px]"}`}
                width={28}
                height={28}
                onError={() => setLogoSrc(DEFAULT_TENANT_LOGO)}
              />
            </div>
            {!isCollapsed ? (
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="truncate text-[18px] leading-5 font-semibold text-[#012352]">
                  {sidebarCompanyName || branding.companyName}
                </p>
                <p className="text-[10px] leading-[12px] font-light uppercase tracking-normal text-[color:var(--brand-primary)]">
                  Dashboard
                </p>
              </div>
            ) : null}
          </Link>
          {showMobileClose ? (
            <button
              type="button"
              onClick={onMobileClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#64748B] transition hover:bg-white hover:text-[#0F3B76]"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <nav
        ref={navRef}
        className={`admin-recruiter-sidebar-nav flex-1 overflow-y-auto overflow-x-hidden ${
          isMobileRail
            ? "flex flex-col items-center py-2 px-0"
            : isCollapsed
              ? "py-3 px-0"
              : "pt-2 pb-7 pl-5 pr-0"
        }`}
      >
        {renderedSections.map((section) => {
          const collapsedNavHref =
            (isCollapsed || isMobileRail) && section.children?.length
              ? getFirstNavigableChildHref(section.children)
              : null;
          const sectionExpandedOpen = !isCollapsed && !isMobileRail && isSectionOpen(section);
          /** Selected icon and the active line belong to the open page, not a parent that only has a submenu. */

          return (
          <div key={section.label} className={isMobileRail || isCollapsed ? "mb-1 w-full" : ""}>
            {section.children?.length ? (
              collapsedNavHref ? (
                <Link
                  href={collapsedNavHref}
                  onClick={handleNavClick}
                  title={section.label}
                  className={`group relative flex w-full cursor-pointer items-center overflow-hidden rounded-md transition hover:bg-white ${collapsedRowClass(
                    isCollapsed,
                    isMobileRail
                  )} ${navTextClass(section.childActive)}`}
                >
                  <SidebarNavIcon
                    iconType={section.iconType}
                    active={section.childActive}
                    colorHex={iconTintHex}
                  />
                  {section.childActive ? (
                    <span aria-hidden className="admin-recruiter-sidebar-active-indicator" />
                  ) : null}
                </Link>
              ) : (
              <>
                <button
                  type="button"
                  title={section.disabled ? `${section.label} (Coming soon)` : section.label}
                  onClick={(event) => {
                    if (isCollapsed || isMobileRail) return;
                    handleSectionToggleClick(section.label, event);
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  disabled={isCollapsed || isMobileRail}
                  className={`group relative flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-md border-0 bg-transparent text-left transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 ${navTextClass(false)} ${
                    isCollapsed || isMobileRail
                      ? collapsedRowClass(isCollapsed, isMobileRail)
                      : "min-h-[44px] pl-0 pr-[6px]"
                  }`}
                  aria-expanded={isSectionOpen(section)}
                  aria-label={`${isSectionOpen(section) ? "Collapse" : "Expand"} ${section.label}`}
                >
                  <div
                    className={`flex min-w-0 flex-1 items-center gap-3 ${
                      isCollapsed || isMobileRail ? "justify-center" : ""
                    }`}
                  >
                    <SidebarNavIcon
                      iconType={section.iconType}
                      active={false}
                      colorHex={iconTintHex}
                    />
                    {!isCollapsed && !isMobileRail ? (
                      <span className="truncate font-normal text-[14px] leading-5 tracking-normal">
                        {section.label}
                      </span>
                    ) : null}
                  </div>
                  {!isCollapsed && !isMobileRail ? (
                    <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
                      <SidebarSubmenuToggleIcon
                        open={isSectionOpen(section)}
                        size={20}
                        openDirection="up"
                      />
                    </span>
                  ) : null}
                </button>

                {sectionExpandedOpen ? (
                  <div className="admin-recruiter-sidebar-submenu">
                    {section.children.map((child) => {
                      if (child.children?.length) {
                        const groupOpen = openSectionLabels.includes(child.label);
                        return (
                          <div key={`${section.label}-${child.label}`}>
                            <button
                              type="button"
                              onClick={(event) => handleSectionToggleClick(child.label, event)}
                              onMouseDown={(event) => event.preventDefault()}
                              className={`admin-recruiter-sidebar-submenu-item flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent text-left font-normal text-[14px] leading-5 tracking-normal ${submenuTextClass(false)}`}
                              aria-expanded={groupOpen}
                              aria-label={`${groupOpen ? "Collapse" : "Expand"} ${child.label}`}
                            >
                              <span className="min-w-0 flex-1 truncate">{child.label}</span>
                              <SidebarSubmenuToggleIcon open={groupOpen} size={16} openDirection="up" />
                            </button>
                            {groupOpen ? (
                              <div className="admin-recruiter-sidebar-submenu-nested">
                                {(child.children as RenderedSidebarLink[]).map((nested) =>
                                  nested.disabled ? (
                                    <div
                                      key={`${child.label}-${nested.label}`}
                                      title={`${nested.label} (Coming soon)`}
                                      className={`admin-recruiter-sidebar-submenu-item group relative block cursor-default overflow-hidden rounded-md font-normal text-[14px] leading-5 tracking-normal ${submenuTextClass(false, true)}`}
                                      aria-disabled
                                    >
                                      <span>{nested.label}</span>
                                    </div>
                                  ) : (
                                    <Link
                                      key={`${child.label}-${nested.label}`}
                                      href={nested.href}
                                      onClick={handleNavClick}
                                      className={`admin-recruiter-sidebar-submenu-item group relative block overflow-hidden rounded-md font-normal text-[14px] leading-5 tracking-normal transition-colors hover:text-[color:var(--brand-primary)] ${submenuTextClass(nested.active)}`}
                                    >
                                      <span>{nested.label}</span>
                                      {nested.active ? (
                                        <span aria-hidden className="admin-recruiter-sidebar-active-indicator" />
                                      ) : null}
                                    </Link>
                                  )
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      }

                      return child.disabled ? (
                        <div
                          key={`${section.label}-${child.label}`}
                          title={`${child.label} (Coming soon)`}
                          className={`admin-recruiter-sidebar-submenu-item group relative block cursor-default overflow-hidden rounded-md font-normal text-[14px] leading-5 tracking-normal ${submenuTextClass(false, true)}`}
                          aria-disabled
                        >
                          <span>{child.label}</span>
                        </div>
                      ) : (
                        <Link
                          key={`${section.label}-${child.label}`}
                          href={child.href}
                          onClick={handleNavClick}
                          className={`admin-recruiter-sidebar-submenu-item group relative block overflow-hidden rounded-md font-normal text-[14px] leading-5 tracking-normal transition-colors hover:text-[color:var(--brand-primary)] ${submenuTextClass(child.active)}`}
                        >
                          <span>{child.label}</span>
                          {child.active ? (
                            <span aria-hidden className="admin-recruiter-sidebar-active-indicator" />
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </>
              )
            ) : section.disabled ? (
              <div
                title={`${section.label} (Coming soon)`}
                className={`group relative flex items-center overflow-hidden rounded-md ${
                  collapsedRowClass(isCollapsed, isMobileRail)
                } ${ADMIN_SIDEBAR_INACTIVE_TEXT_CLASS} opacity-60`}
                aria-disabled
              >
                <SidebarNavIcon
                  iconType={section.iconType}
                  active={!section.disabled && section.active}
                  colorHex={iconTintHex}
                />
                {!isCollapsed ? (
                  <span className="font-normal text-[14px] leading-5 tracking-normal transition-colors">{section.label}</span>
                ) : null}
              </div>
            ) : (
              <Link
                href={section.href}
                onClick={handleNavClick}
                title={isCollapsed ? section.label : undefined}
                className={`group relative flex items-center overflow-hidden rounded-md transition hover:bg-white ${collapsedRowClass(
                  isCollapsed,
                  isMobileRail
                )} ${navTextClass(section.active)}`}
              >
                <SidebarNavIcon
                  iconType={section.iconType}
                  active={!section.disabled && section.active}
                  colorHex={iconTintHex}
                />
                {!isCollapsed ? (
                  <span className="font-normal text-[14px] leading-5 tracking-normal transition-colors">
                    {section.label}
                  </span>
                ) : null}
                {section.active ? (
                  <span aria-hidden className="admin-recruiter-sidebar-active-indicator" />
                ) : null}
              </Link>
            )}
          </div>
          );
        })}
      </nav>

      <div
        className={`border-t ${ADMIN_SIDEBAR_DIVIDER_CLASS} ${
          isMobileRail || isCollapsed
            ? "flex justify-center px-0 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"
            : "p-5"
        }`}
      >
        <div
          className={`flex items-center ${
            isCollapsed || isMobileRail
              ? "flex-col items-center justify-center gap-2"
              : "gap-2"
          }`}
        >
          {!isCollapsed || isMobileRail ? (
            <Link
              href="/admin_recruiter/account/personal"
              onClick={handleNavClick}
              title="Profile"
              aria-label="Open profile"
              className="shrink-0 rounded-full transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--brand-primary)]"
            >
              <StaffProfileAvatar
                name={profileName}
                photoUrl={profilePhoto}
                size="sm"
                className="text-[14px]!"
              />
            </Link>
          ) : null}
          {!isCollapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] leading-5 font-semibold text-[#012352]">{profileName}</p>
              <p className="truncate text-[10px] leading-[15px] font-normal text-[#94A3B8]">{profileRole}</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleLogout}
            title="Logout"
            aria-label="Logout"
            className={`rounded-md p-1 hover:bg-[#F8FAFC] ${
              isCollapsed || isMobileRail ? "" : "-mr-1 ml-auto"
            }`}
          >
            <SidebarNavIcon iconType={SIDEBAR_ICON_TYPES.logout} active colorHex={iconTintHex} />
          </button>
        </div>
      </div>
    </div>
    );
  };

  const asideStyle = {
    width: sidebarWidth,
    maxWidth: sidebarWidth,
    minWidth: SIDEBAR_COLLAPSED_WIDTH,
  };

  return (
    <>
      <aside
        className={`admin-recruiter-sidebar fixed inset-y-0 left-0 z-40 hidden h-screen overflow-hidden border-r border-[#ECF1F9] admin-recruiter-chrome-border-r bg-white transition-[width] duration-200 ease-in-out min-[1000px]:block ${sidebarHoverClass}`}
        style={asideStyle}
        data-collapsed={collapsed ? "true" : "false"}
        {...sidebarHoverProps}
      >
        {renderSidebarContent(collapsed)}
      </aside>

      <aside
        className={`admin-recruiter-sidebar admin-recruiter-sidebar-mobile-rail fixed inset-y-0 left-0 z-40 h-screen overflow-hidden border-r border-[#ECF1F9] admin-recruiter-chrome-border-r bg-white min-[1000px]:hidden ${sidebarHoverClass} ${
          isMobileOpen ? "hidden" : "block"
        }`}
        data-collapsed="true"
        {...sidebarHoverProps}
      >
        {renderSidebarContent(true, { isMobileRail: true })}
      </aside>

      <div
        className={`fixed inset-0 z-50 bg-black/30 transition-opacity min-[1000px]:hidden ${
          isMobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onMobileClose}
        aria-hidden={!isMobileOpen}
      >
        <aside
          className={`admin-recruiter-sidebar h-full border-r border-[#ECF1F9] bg-white transition-transform duration-200 ease-in-out ${sidebarHoverClass} ${
            isMobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{
            width: SIDEBAR_EXPANDED_WIDTH,
            maxWidth: "min(90vw, 272px)",
          }}
          onClick={(event) => event.stopPropagation()}
          {...sidebarHoverProps}
        >
          {renderSidebarContent(false, { showMobileClose: true })}
        </aside>
      </div>
    </>
  );
}

export {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH_NARROW,
  SIDEBAR_COLLAPSED_WIDTH_MOBILE,
  SIDEBAR_EXPANDED_WIDTH,
};
