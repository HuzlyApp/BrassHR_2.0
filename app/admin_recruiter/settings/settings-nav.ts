import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Briefcase,
  ClipboardList,
  FileStack,
  LifeBuoy,
  ListChecks,
  Monitor,
  ShieldCheck,
  UserCircle,
  UserCog,
  UserPlus,
  Wand2,
  Workflow,
} from "lucide-react";

export type SettingsNavItemId =
  | "profile"
  | "account"
  | "branding"
  | "notifications"
  | "security"
  | "automation"
  | "profession"
  | "assessment"
  | "statuses"
  | "templates"
  | "admin-console"
  | "roles"
  | "help"
  | "reports";

export type SettingsSectionSlug =
  | "branding"
  | "admin-console"
  | "roles"
  | "profession"
  | "assessment"
  | "statuses"
  | "hiring-theme";

export type SettingsNavItem = {
  id: SettingsNavItemId;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Highlight when pathname matches any of these prefixes. */
  matchPrefixes: string[];
  matchExact?: boolean;
};

export type SettingsNavGroup = {
  id: string;
  label: string | null;
  items: SettingsNavItem[];
};

/** Secondary Settings sidebar — only items that already exist in the app. */
export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    id: "personal",
    label: "Personal Settings",
    items: [
      {
        id: "profile",
        label: "Profile",
        href: "/admin_recruiter/account/personal",
        icon: UserCircle,
        matchPrefixes: ["/admin_recruiter/account/personal"],
      },
      {
        id: "account",
        label: "Account",
        href: "/admin_recruiter/account/account-settings",
        icon: UserCog,
        matchPrefixes: [
          "/admin_recruiter/account/account-settings",
          "/admin_recruiter/account/business-info",
        ],
      },
    ],
  },
  {
    id: "app",
    label: "App Settings",
    items: [
      {
        id: "branding",
        label: "Branding",
        href: "/admin_recruiter/settings/branding",
        icon: Wand2,
        matchPrefixes: ["/admin_recruiter/settings/branding", "/admin_recruiter/settings/hiring-theme"],
      },
      {
        id: "notifications",
        label: "Notifications",
        href: "/admin_recruiter/notifications",
        icon: Bell,
        matchPrefixes: ["/admin_recruiter/notifications"],
      },
      {
        id: "security",
        label: "Security",
        href: "/admin_recruiter/account/security",
        icon: ShieldCheck,
        matchPrefixes: ["/admin_recruiter/account/security"],
      },
    ],
  },
  {
    id: "workflow",
    label: "Workflow",
    items: [
      {
        id: "automation",
        label: "Automation",
        href: "/admin_recruiter/dashboard/onboarding-flows",
        icon: Workflow,
        matchPrefixes: [
          "/admin_recruiter/dashboard/onboarding-flows",
          "/admin_recruiter/dashboard/workflow-mappings",
          "/admin_recruiter/dashboard/workflowlibrary",
          "/admin_recruiter/dashboard/templates",
          "/admin_recruiter/dashboard/onboarding-builder",
        ],
      },
    ],
  },
  {
    id: "recruitment",
    label: "Recruitment",
    items: [
      {
        id: "profession",
        label: "Profession",
        href: "/admin_recruiter/settings/profession",
        icon: Briefcase,
        matchPrefixes: ["/admin_recruiter/settings/profession"],
      },
      {
        id: "assessment",
        label: "Assessment",
        href: "/admin_recruiter/settings/assessment",
        icon: ClipboardList,
        matchPrefixes: ["/admin_recruiter/settings/assessment"],
      },
      {
        id: "statuses",
        label: "Statuses",
        href: "/admin_recruiter/settings/statuses",
        icon: ListChecks,
        matchPrefixes: ["/admin_recruiter/settings/statuses"],
      },
      {
        id: "templates",
        label: "Templates",
        href: "/admin_recruiter/template-builder",
        icon: FileStack,
        matchPrefixes: ["/admin_recruiter/template-builder", "/admin_recruiter/email-templates"],
      },
    ],
  },
  {
    id: "administration",
    label: "Administration",
    items: [
      {
        id: "admin-console",
        label: "Admin Console",
        href: "/admin_recruiter/settings/admin-console",
        icon: Monitor,
        matchPrefixes: ["/admin_recruiter/settings/admin-console"],
      },
      {
        id: "roles",
        label: "Roles & Permissions",
        href: "/admin_recruiter/settings/roles",
        icon: UserPlus,
        matchPrefixes: ["/admin_recruiter/settings/roles"],
      },
    ],
  },
  {
    id: "help",
    label: null,
    items: [
      {
        id: "help",
        label: "Help & Support",
        href: "/admin_recruiter/help-support",
        icon: LifeBuoy,
        matchPrefixes: ["/admin_recruiter/help-support"],
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    items: [
      {
        id: "reports",
        label: "Reports",
        href: "/admin_recruiter/reports",
        icon: BarChart3,
        matchPrefixes: ["/admin_recruiter/reports"],
      },
    ],
  },
];

/** In-app settings sections rendered under /admin_recruiter/settings/[section]. */
export const SETTINGS_SECTION_META: Record<
  SettingsSectionSlug,
  { title: string; description: string }
> = {
  branding: {
    title: "Branding",
    description: "Customized your branding.",
  },
  "admin-console": {
    title: "Admin Console",
    description: "Manage system-wide settings, users, and administrative controls.",
  },
  roles: {
    title: "Roles & Permissions",
    description: "Manage users, roles, and access permissions.",
  },
  profession: {
    title: "Profession",
    description: "Configure profession document requirements for applicants.",
  },
  assessment: {
    title: "Assessment",
    description: "Build and manage skill assessments for your hiring flow.",
  },
  statuses: {
    title: "Statuses",
    description: "Manage statuses used in your recruitment pipeline. Customize labels, colors, and workflows.",
  },
  "hiring-theme": {
    title: "Hiring journey",
    description: "Customize colors used across the hiring journey experience.",
  },
};

export const SETTINGS_SECTION_SLUGS = Object.keys(SETTINGS_SECTION_META) as SettingsSectionSlug[];

export function isSettingsSectionSlug(value: string): value is SettingsSectionSlug {
  return SETTINGS_SECTION_SLUGS.includes(value as SettingsSectionSlug);
}

export function settingsSectionHref(slug: SettingsSectionSlug): string {
  return `/admin_recruiter/settings/${slug}`;
}

export function isSettingsNavItemActive(item: SettingsNavItem, pathname: string): boolean {
  if (item.matchExact) {
    return item.matchPrefixes.some((prefix) => pathname === prefix);
  }
  return item.matchPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Default landing page when opening Settings from the main sidebar. */
export const SETTINGS_LANDING_HREF = "/admin_recruiter/settings/branding";

/** All path prefixes covered by the settings mini-sidebar. */
export const SETTINGS_MINI_SIDEBAR_PREFIXES: string[] = Array.from(
  new Set(
    SETTINGS_NAV_GROUPS.flatMap((group) => group.items.flatMap((item) => item.matchPrefixes)).concat([
      "/admin_recruiter/settings",
    ])
  )
);

/** True while the settings mini-sidebar should stay open for this route. */
export function isSettingsMiniSidebarPath(pathname: string): boolean {
  const path = pathname.trim();
  if (!path) return false;
  return SETTINGS_MINI_SIDEBAR_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}
