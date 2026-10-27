"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";
import { AdminTenantBrandingProvider } from "@/app/components/tenant/AdminTenantBrandingProvider";
import { AccountDataProvider } from "@/app/admin_recruiter/account/AccountDataProvider";
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

/**
 * Default body copy color for recruiter admin; pages still set explicit colors
 * (e.g. sidebar `text-white`, links `text-teal-*`) where needed.
 */
export default function AdminRecruiterShell({ children }: { children: ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const pathname = usePathname();

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
    }
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
  const candidateDetailRoute = isCandidateDetailPage(pathname ?? "");

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
            {candidateDetailRoute ? (
              <div className="admin-candidate-detail-shell">{children}</div>
            ) : (
              children
            )}
          </WorkflowDashboardHeaderProvider>
        </div>
      </div>
      </AccountDataProvider>
      </AdminStaffAuthGuard>
    </AdminTenantBrandingProvider>
  );
}
