"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { AdminTenantBrandingProvider } from "@/app/components/tenant/AdminTenantBrandingProvider";
import { AccountDataProvider } from "@/app/admin_recruiter/account/AccountDataProvider";
import SettingsMobileNav from "@/app/admin_recruiter/settings/SettingsMobileNav";
import SettingsSidebar from "@/app/admin_recruiter/settings/SettingsSidebar";
import { isSettingsMiniSidebarPath } from "@/app/admin_recruiter/settings/settings-nav";
import {
  AdminRecruiterSidebar,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH_NARROW,
  SIDEBAR_COLLAPSED_WIDTH_MOBILE,
  SIDEBAR_EXPANDED_WIDTH,
} from "./components/AdminRecruiterSidebar";
import { AdminRecruiterHeader } from "./components/AdminRecruiterHeader";
import { AdminRecruiterDashboardSubNav } from "./components/AdminRecruiterDashboardSubNav";
import { WorkflowDashboardHeaderProvider } from "./components/WorkflowDashboardHeaderContext";
import GodAdminImpersonationBanner from "./components/GodAdminImpersonationBanner";
import { AdminStaffAuthGuard } from "./components/AdminStaffAuthGuard";
import { isCandidateDetailPage } from "./components/candidate-detail-navigation";
import "./layout.css";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "adminRecruiterSidebarCollapsed";

function persistSidebarCollapsed(next: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
  } catch {
    /* ignore */
  }
}

/**
 * Default body copy color for recruiter admin; pages still set explicit colors
 * (e.g. sidebar `text-white`, links `text-teal-*`) where needed.
 */
export default function AdminRecruiterShell({ children }: { children: ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const pathname = usePathname() ?? "";
  const inSettingsArea = isSettingsMiniSidebarPath(pathname);
  const wasInSettingsAreaRef = useRef<boolean | null>(null);
  const settingsCollapseReadyRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("access") !== "denied") return;
    toast.error("You don't have access to that page.");
    params.delete("access");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState(null, "", next);
  }, [pathname]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
      if (stored === "true") setSidebarCollapsed(true);
      else if (stored === "false") setSidebarCollapsed(false);
    } catch {
      /* ignore */
    } finally {
      settingsCollapseReadyRef.current = true;
    }
  }, []);

  /** Enter Settings → collapse main rail + show mini-sidebar. Leave Settings → expand main rail. */
  useEffect(() => {
    if (!settingsCollapseReadyRef.current) return;
    const wasInSettings = wasInSettingsAreaRef.current;
    wasInSettingsAreaRef.current = inSettingsArea;
    if (wasInSettings === null) {
      if (inSettingsArea) {
        setSidebarCollapsed(true);
        persistSidebarCollapsed(true);
      }
      return;
    }
    if (inSettingsArea && !wasInSettings) {
      setSidebarCollapsed(true);
      persistSidebarCollapsed(true);
      return;
    }
    if (!inSettingsArea && wasInSettings) {
      setSidebarCollapsed(false);
      persistSidebarCollapsed(false);
    }
  }, [inSettingsArea]);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      persistSidebarCollapsed(next);
      return next;
    });
  };

  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
  const candidateDetailRoute = isCandidateDetailPage(pathname);

  const pageBody = candidateDetailRoute ? (
    <div className="admin-candidate-detail-shell">{children}</div>
  ) : (
    children
  );

  return (
    <AdminTenantBrandingProvider>
      <AdminStaffAuthGuard>
      <AccountDataProvider>
      <div
        className="admin-recruiter-shell min-h-screen text-gray-600"
        style={{
          backgroundColor: "#F4F4F4",
          ["--admin-sidebar-width" as string]: `${sidebarWidth}px`,
          ["--admin-sidebar-collapsed-width" as string]: `${SIDEBAR_COLLAPSED_WIDTH}px`,
          ["--admin-sidebar-collapsed-width-narrow" as string]: `${SIDEBAR_COLLAPSED_WIDTH_NARROW}px`,
          ["--admin-sidebar-collapsed-width-mobile" as string]: `${SIDEBAR_COLLAPSED_WIDTH_MOBILE}px`,
        }}
      >
        <AdminRecruiterSidebar
          collapsed={sidebarCollapsed}
          isMobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
        <div
          className="admin-recruiter-content admin-recruiter-main-wrap min-h-screen"
          data-mobile-nav-open={mobileSidebarOpen ? "true" : "false"}
        >
          <GodAdminImpersonationBanner />
          <AdminRecruiterHeader
            onMenuClick={() => setMobileSidebarOpen(true)}
            mobileNavOpen={mobileSidebarOpen}
            sidebarCollapsed={sidebarCollapsed}
            onSidebarToggle={toggleSidebarCollapsed}
          />
          <WorkflowDashboardHeaderProvider>
            <AdminRecruiterDashboardSubNav />
            {inSettingsArea ? (
              <div className="flex min-h-0 min-w-0 w-full flex-1 items-start">
                <SettingsSidebar />
                <div className="min-w-0 flex-1 px-5 pb-8 pt-5 lg:px-6">
                  <SettingsMobileNav />
                  {pageBody}
                </div>
              </div>
            ) : (
              pageBody
            )}
          </WorkflowDashboardHeaderProvider>
        </div>
      </div>
      </AccountDataProvider>
      </AdminStaffAuthGuard>
    </AdminTenantBrandingProvider>
  );
}
