/**
 * Module and Settings resources. The database table `permission_resources` is the
 * runtime source of truth (seeded from this catalog). Role-to-access rules are
 * rows in `tenant_role_permissions`, not client conditionals.
 *
 * Legacy mapping (nothing stored View/Create/Edit/Delete/Approve/Manage):
 * - Create, Approve, and Manage were design labels only. Create and Approve fold
 *   into Edit. Manage on Settings folds into Edit on `settings_company` for the
 *   system admin role, which previously owned the admin console.
 * - System admin (`staff_roles.is_admin`) keeps View, Edit, and Delete on every
 *   configurable resource so existing admins do not lose access.
 * - Other seeded staff roles keep View, Edit, and Delete on the modules and
 *   Settings sections the sidebar already exposed, and on the staff APIs those
 *   screens already called. They do not gain Company settings, Automation, or
 *   Templates.
 * - Dashboard is `alwaysGranted` for every authenticated staff role and is not
 *   a matrix row. Applicants stay on the worker portal.
 */

export type PermissionKind = "module" | "settings_section";

export type PermissionResourceDef = {
  key: string;
  label: string;
  description: string;
  kind: PermissionKind;
  parentKey: string | null;
  pagePrefixes: string[];
  apiPrefixes: string[];
  sortOrder: number;
  alwaysGranted: boolean;
};

export const PERMISSION_ACTIONS = ["view", "edit", "delete"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/** APIs the signed-in shell needs. They are not a module grant. */
export const SHELL_API_PREFIXES = [
  "/api/admin/header-data",
  "/api/admin/effective-branding",
  "/api/admin/recruiter-data",
  "/api/admin/access",
] as const;

/** Platform operator only. Tenant roles never receive this path. */
export const GOD_ADMIN_API_PREFIXES = ["/api/admin/view-as-tenant"] as const;

/**
 * Staff roles that are not admins. Matches the sidebar they could already open
 * and the staff APIs behind those screens.
 */
export const LIMITED_STAFF_RESOURCE_KEYS = [
  "hiring",
  "people",
  "organization",
  "jobs",
  "scheduling",
  "mail",
  "chat",
  "settings_profile",
  "settings_notifications",
  "settings_help",
  "settings_reports",
] as const;

export const PERMISSION_RESOURCES: PermissionResourceDef[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "View dashboard and summary.",
    kind: "module",
    parentKey: null,
    pagePrefixes: ["/admin_recruiter/home", "/admin_recruiter/dashboard"],
    apiPrefixes: ["/api/admin/dashboard-overview", "/api/admin/dashboard-analytics"],
    sortOrder: 10,
    alwaysGranted: true,
  },
  {
    key: "hiring",
    label: "Hiring",
    description: "View and manage applicants.",
    kind: "module",
    parentKey: null,
    pagePrefixes: [
      "/admin_recruiter/candidates",
      "/admin_recruiter/applications",
      "/admin_recruiter/calendar",
      "/admin_recruiter/pending",
      "/admin_recruiter/approved",
      "/admin_recruiter/approved-pending-conversion",
      "/admin_recruiter/disapproved",
      "/admin_recruiter/pre-approval",
      "/admin_recruiter/advanced-search",
      "/admin_recruiter/advanced-detail",
      "/admin_recruiter/new",
    ],
    apiPrefixes: [
      "/api/admin/job-applications",
      "/api/admin/candidates",
      "/api/admin/add-candidate-from-resume",
      "/api/admin/applicant-appointments",
      "/api/admin/application-statuses",
      "/api/admin/application-status-groups",
      "/api/admin/application-status-stage-assignments",
      "/api/admin/hiring-area",
      "/api/admin/stage-context-notes",
      "/api/admin/skill-assessment-pdf",
      "/api/admin/skill-assessment-results",
      "/api/admin/match-analysis",
    ],
    sortOrder: 20,
    alwaysGranted: false,
  },
  {
    key: "people",
    label: "People",
    description: "View and manage workers and managers.",
    kind: "module",
    parentKey: null,
    pagePrefixes: ["/admin_recruiter/workers", "/admin_recruiter/managers"],
    apiPrefixes: ["/api/admin/workers", "/api/admin/employment-workers", "/api/admin/team-members", "/api/admin/worker-*"],
    sortOrder: 30,
    alwaysGranted: false,
  },
  {
    key: "organization",
    label: "Organization",
    description: "Manage facilities and locations.",
    kind: "module",
    parentKey: null,
    pagePrefixes: ["/admin_recruiter/facilities"],
    apiPrefixes: ["/api/admin/facilities", "/api/admin/facility-assignments"],
    sortOrder: 40,
    alwaysGranted: false,
  },
  {
    key: "jobs",
    label: "Jobs",
    description: "Create and manage job orders.",
    kind: "module",
    parentKey: null,
    pagePrefixes: ["/admin_recruiter/jobs"],
    apiPrefixes: ["/api/admin/jobs", "/api/admin/job-options", "/api/admin/professions"],
    sortOrder: 50,
    alwaysGranted: false,
  },
  {
    key: "scheduling",
    label: "Scheduling",
    description: "Manage schedules and shifts.",
    kind: "module",
    parentKey: null,
    pagePrefixes: ["/admin_recruiter/calendar/shifts", "/admin_recruiter/attendance", "/admin_recruiter/scheduling"],
    apiPrefixes: ["/api/admin/shift-calendar", "/api/admin/applicant-attendance"],
    sortOrder: 60,
    alwaysGranted: false,
  },
  {
    key: "mail",
    label: "Mail",
    description: "View and manage mail.",
    kind: "module",
    parentKey: null,
    pagePrefixes: ["/admin_recruiter/mail"],
    apiPrefixes: ["/api/admin/mail"],
    sortOrder: 70,
    alwaysGranted: false,
  },
  {
    key: "chat",
    label: "Chat",
    description: "View and manage messages.",
    kind: "module",
    parentKey: null,
    pagePrefixes: ["/admin_recruiter/messages"],
    apiPrefixes: ["/api/admin/messages"],
    sortOrder: 80,
    alwaysGranted: false,
  },
  {
    key: "settings_company",
    label: "Company settings",
    description: "Manage organization settings, branding, and roles.",
    kind: "settings_section",
    parentKey: "settings",
    pagePrefixes: ["/admin_recruiter/settings"],
    apiPrefixes: [
      "/api/admin/users",
      "/api/admin/roles",
      "/api/admin/branding",
      "/api/admin/business-info",
      "/api/admin/assessment-settings",
      "/api/admin/hire-journey-theme",
      "/api/admin/profession-documents",
      "/api/admin/tenant-firma-settings",
      "/api/admin/tenants",
    ],
    sortOrder: 110,
    alwaysGranted: false,
  },
  {
    key: "settings_profile",
    label: "Personal settings",
    description: "View and edit the signed-in profile.",
    kind: "settings_section",
    parentKey: "settings",
    pagePrefixes: ["/admin_recruiter/account"],
    apiPrefixes: ["/api/account/settings"],
    sortOrder: 120,
    alwaysGranted: false,
  },
  {
    key: "settings_notifications",
    label: "Notifications",
    description: "View notification settings.",
    kind: "settings_section",
    parentKey: "settings",
    pagePrefixes: ["/admin_recruiter/notifications"],
    apiPrefixes: [],
    sortOrder: 130,
    alwaysGranted: false,
  },
  {
    key: "settings_help",
    label: "Help & Support",
    description: "View help and support.",
    kind: "settings_section",
    parentKey: "settings",
    pagePrefixes: ["/admin_recruiter/help-support", "/admin_recruiter/support-tickets", "/admin_recruiter/tickets"],
    apiPrefixes: ["/api/admin/faqs"],
    sortOrder: 140,
    alwaysGranted: false,
  },
  {
    key: "settings_reports",
    label: "Reports",
    description: "View reports and analytics.",
    kind: "settings_section",
    parentKey: "settings",
    pagePrefixes: ["/admin_recruiter/reports"],
    apiPrefixes: [],
    sortOrder: 150,
    alwaysGranted: false,
  },
  {
    key: "settings_automation",
    label: "Automation",
    description: "Manage workflows and onboarding automation.",
    kind: "settings_section",
    parentKey: "settings",
    pagePrefixes: [
      "/admin_recruiter/dashboard/onboarding-builder",
      "/admin_recruiter/dashboard/onboarding-flows",
      "/admin_recruiter/dashboard/templates",
      "/admin_recruiter/dashboard/workflow-mappings",
      "/admin_recruiter/dashboard/workflowlibrary",
    ],
    apiPrefixes: [
      "/api/admin/onboarding",
      "/api/admin/onboarding-builder",
      "/api/admin/onboarding-flows",
      "/api/admin/onboarding-libraries",
      "/api/admin/workflow-mappings",
      "/api/admin/workflow-templates",
    ],
    sortOrder: 160,
    alwaysGranted: false,
  },
  {
    key: "settings_templates",
    label: "Templates",
    description: "Manage document and email templates.",
    kind: "settings_section",
    parentKey: "settings",
    pagePrefixes: ["/admin_recruiter/template-builder", "/admin_recruiter/email-templates"],
    apiPrefixes: ["/api/admin/email-templates", "/api/admin/recruiter-templates"],
    sortOrder: 170,
    alwaysGranted: false,
  },
];

export function editorPermissionResources(): PermissionResourceDef[] {
  return PERMISSION_RESOURCES.filter((resource) => !resource.alwaysGranted);
}

export function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  if (!prefix) return false;
  if (prefix.endsWith("*")) {
    return pathname.startsWith(prefix.slice(0, -1));
  }
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function matchPrefixedKey(
  pathname: string,
  entries: readonly { key: string; prefixes: readonly string[] }[]
): string | null {
  let best: { key: string; length: number } | null = null;
  for (const entry of entries) {
    for (const prefix of entry.prefixes) {
      if (!pathMatchesPrefix(pathname, prefix)) continue;
      const length = prefix.endsWith("*") ? prefix.length - 1 : prefix.length;
      if (!best || length > best.length) best = { key: entry.key, length };
    }
  }
  return best?.key ?? null;
}

export type PathClass =
  | { kind: "shell" }
  | { kind: "god_only" }
  | { kind: "resource"; resourceKey: string; alwaysGranted: boolean }
  | { kind: "unmapped" };

export function classifyProtectedPath(pathname: string): PathClass {
  const path = pathname.split("?")[0] || "/";
  if (matchPrefixedKey(path, GOD_ADMIN_API_PREFIXES.map((prefix) => ({ key: prefix, prefixes: [prefix] })))) {
    return { kind: "god_only" };
  }
  if (matchPrefixedKey(path, SHELL_API_PREFIXES.map((prefix) => ({ key: prefix, prefixes: [prefix] })))) {
    return { kind: "shell" };
  }
  const entries = PERMISSION_RESOURCES.map((resource) => ({
    key: resource.key,
    prefixes: path.startsWith("/api/") ? resource.apiPrefixes : resource.pagePrefixes,
  }));
  const resourceKey = matchPrefixedKey(path, entries);
  if (!resourceKey) return { kind: "unmapped" };
  const resource = PERMISSION_RESOURCES.find((item) => item.key === resourceKey);
  return {
    kind: "resource",
    resourceKey,
    alwaysGranted: resource?.alwaysGranted === true,
  };
}

export function actionForMethod(method: string): PermissionAction {
  const normalized = method.trim().toUpperCase();
  if (normalized === "DELETE") return "delete";
  if (normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS") return "view";
  return "edit";
}

export type StoredGrant = {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function grantAllows(grant: StoredGrant | null, action: PermissionAction): boolean {
  if (!grant) return false;
  if (action === "view") return grant.canView;
  if (action === "edit") return grant.canEdit;
  return grant.canDelete;
}

/** Seed grants. Admin keeps every configurable action. Limited staff keep prior screens only. */
export function seededGrantForRole(isAdmin: boolean, resourceKey: string): StoredGrant | null {
  const resource = PERMISSION_RESOURCES.find((item) => item.key === resourceKey);
  if (!resource || resource.alwaysGranted) return null;
  if (isAdmin) return { canView: true, canEdit: true, canDelete: true };
  if ((LIMITED_STAFF_RESOURCE_KEYS as readonly string[]).includes(resourceKey)) {
    return { canView: true, canEdit: true, canDelete: true };
  }
  return null;
}

const ROLE_KEY = /^[a-z][a-z0-9_]{0,63}$/;

export function roleKeyFromLabel(label: string): string | null {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return ROLE_KEY.test(key) ? key : null;
}

export const RESERVED_ROLE_KEYS = new Set([
  "worker",
  "god_admin",
  "owner",
  "client",
  "admin",
  "recruiter",
  "hr",
  "manager",
  "finance",
  "support",
]);
