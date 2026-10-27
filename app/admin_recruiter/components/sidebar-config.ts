import type { SidebarIconType } from "@/app/admin_recruiter/components/sidebar-icons";
import { CANDIDATE_ROUTE_PREFIXES } from "@/app/admin_recruiter/components/candidates-tabs-config";

export type SidebarLink = {
  label: string;
  href: string;
  /** Permission resource. Omitted children inherit the parent section. */
  resourceKey?: string;
  matchPrefixes: string[];
  matchExact?: boolean;
  disabled?: boolean;
  /** Set while rendering so the current page can highlight this row. */
  active?: boolean;
  children?: SidebarLink[];
};

export type SidebarSection = {
  label: string;
  href: string;
  resourceKey?: string;
  iconType: SidebarIconType;
  matchPrefixes: string[];
  controlsActiveState?: boolean;
  disabled?: boolean;
  children?: SidebarLink[];
};

/** Default landing page after admin / recruiter login. */
export const ADMIN_RECRUITER_HOME_ROUTE = "/admin_recruiter/home";

const ICON = {
  dashboard: "Dashboard",
  mail: "Mail",
  chat: "Chat",
  schedule: "Schedule",
  tickets: "Tickets",
  reports: "Reports",
  finance: "Finance",
  taskboard: "Taskboard",
  shifts: "Tickets",
  templateBuilder: "Template Builder",
  teams: "Teams",
  automation: "Automation",
  candidates: "Applicant",
  clients: "Clients",
  organization: "Organization",
  jobs: "Jobs",
  account: "My Profile",
  notifications: "Notifications",
  help: "Help & Support",
  settings: "Settings",
  time: "Time",
  pay: "Pay",
  logout: "Logout",
} as const satisfies Record<string, SidebarIconType>;

const DASHBOARD_OVERVIEW_BASE = "/admin_recruiter/dashboard/overview";

const DASHBOARD_BASE = "/admin_recruiter/dashboard";
const ONBOARDING_BUILDER_ROUTE = `${DASHBOARD_BASE}/onboarding-builder`;
const WORKFLOWS_ROUTE = `${DASHBOARD_BASE}/onboarding-flows`;
const TEMPLATES_ROUTE = `${DASHBOARD_BASE}/templates`;

const DASHBOARD_CHILDREN: SidebarLink[] = [
  {
    label: "Overview",
    href: DASHBOARD_OVERVIEW_BASE,
    matchPrefixes: [DASHBOARD_OVERVIEW_BASE],
    matchExact: true,
  },
  // {
  //   label: "Recruitment Analytics",
  //   href: `${DASHBOARD_OVERVIEW_BASE}/recruitment-analytics`,
  //   matchPrefixes: [`${DASHBOARD_OVERVIEW_BASE}/recruitment-analytics`],
  // }, // Hidden for now — keep for future use.
  // {
  //   label: "Workforce Analytics",
  //   href: `${DASHBOARD_OVERVIEW_BASE}/workforce-analytics`,
  //   matchPrefixes: [`${DASHBOARD_OVERVIEW_BASE}/workforce-analytics`],
  // }, // Hidden for now — keep for future use.
  // {
  //   label: "Financial Analytics",
  //   href: `${DASHBOARD_OVERVIEW_BASE}/financial-analytics`,
  //   matchPrefixes: [`${DASHBOARD_OVERVIEW_BASE}/financial-analytics`],
  // }, // Hidden for now — keep for future use.
  // {
  //   label: "Operational Insights",
  //   href: `${DASHBOARD_OVERVIEW_BASE}/operational-insights`,
  //   matchPrefixes: [`${DASHBOARD_OVERVIEW_BASE}/operational-insights`],
  // }, // Hidden for now — keep for future use.
];

const FINANCE_CHILDREN: SidebarLink[] = [
  { label: "Billing", href: "#", matchPrefixes: [], disabled: true },
  { label: "Invoices", href: "#", matchPrefixes: [], disabled: true },
];

const REPORTS_BASE = "/admin_recruiter/reports";

const REPORTS_CHILDREN: SidebarLink[] = [
  {
    label: "Overview",
    href: REPORTS_BASE,
    matchPrefixes: [REPORTS_BASE],
    matchExact: true,
  },
  // { label: "Recruitment Reports", href: "#", matchPrefixes: [], disabled: true }, // Hidden for now — keep for future use.
  // { label: "Workforce Reports", href: "#", matchPrefixes: [], disabled: true }, // Hidden for now — keep for future use.
  // { label: "Payroll Reports", href: "#", matchPrefixes: [], disabled: true }, // Hidden for now — keep for future use.
  // { label: "Financial Reports", href: "#", matchPrefixes: [], disabled: true }, // Hidden for now — keep for future use.
];

const SHIFTS_CHILDREN: SidebarLink[] = [
  { label: "All Shifts", href: "#", matchPrefixes: [], disabled: true },
  { label: "Open Shifts", href: "#", matchPrefixes: [], disabled: true },
  { label: "Upcoming Shifts", href: "#", matchPrefixes: [], disabled: true },
  { label: "In Progress", href: "#", matchPrefixes: [], disabled: true },
  { label: "Completed Shifts", href: "#", matchPrefixes: [], disabled: true },
  { label: "Unclaimed", href: "#", matchPrefixes: [], disabled: true },
];

const SCHEDULING_CHILDREN: SidebarLink[] = [
  {
    label: "Schedule",
    href: "/admin_recruiter/calendar/shifts",
    matchPrefixes: ["/admin_recruiter/calendar/shifts"],
  },
  {
    label: "Time & Attendance",
    href: "/admin_recruiter/attendance",
    matchPrefixes: ["/admin_recruiter/attendance"],
  },
];

// Time and Pay are hidden until those screens are built.
// const TIME_CHILDREN: SidebarLink[] = [
//   { label: "Clock-ins", href: "#", matchPrefixes: [], disabled: true },
//   { label: "Timesheets", href: "#", matchPrefixes: [], disabled: true },
//   { label: "Approvals", href: "#", matchPrefixes: [], disabled: true },
// ];
//
// const PAY_CHILDREN: SidebarLink[] = [
//   { label: "Payroll Export", href: "#", matchPrefixes: [], disabled: true },
//   { label: "Bill / Pay Rates", href: "#", matchPrefixes: [], disabled: true },
// ];

// Taskboard is hidden for now. Interviews lives under Candidates.
// const TASKBOARD_CHILDREN: SidebarLink[] = [
//   // {
//   //   label: "Onboarding",
//   //   href: "#",
//   //   matchPrefixes: [],
//   //   disabled: true,
//   // }, // Hidden for now — keep for future use.
//   {
//     label: "Interviews",
//     href: "/admin_recruiter/calendar",
//     matchPrefixes: ["/admin_recruiter/calendar"],
//     matchExact: true,
//   },
//   // {
//   //   label: "Calls",
//   //   href: "#",
//   //   matchPrefixes: [],
//   //   disabled: true,
//   // }, // Hidden for now — keep for future use.
// ];
//
// const TASKBOARD_ACTIVE_PREFIXES: string[] = [];

const EMAIL_TEMPLATES_ROUTE = "/admin_recruiter/email-templates";
const TEMPLATE_BUILDER_ROUTE = "/admin_recruiter/template-builder";

const TEMPLATES_CHILDREN: SidebarLink[] = [
  {
    label: "Document Templates",
    href: TEMPLATE_BUILDER_ROUTE,
    matchPrefixes: [TEMPLATE_BUILDER_ROUTE],
  },
  {
    label: "Email Templates",
    href: EMAIL_TEMPLATES_ROUTE,
    matchPrefixes: [EMAIL_TEMPLATES_ROUTE],
  },
];

const TEMPLATES_ACTIVE_PREFIXES = [EMAIL_TEMPLATES_ROUTE, TEMPLATE_BUILDER_ROUTE];

const RECRUITMENT_CHILDREN: SidebarLink[] = [
  // {
  //   label: "Candidates",
  //   href: "/admin_recruiter/candidates",
  //   matchPrefixes: CANDIDATE_ROUTE_PREFIXES,
  // },
  {
    label: "Applicants",
    href: "/admin_recruiter/applications",
    matchPrefixes: ["/admin_recruiter/applications"],
  },
  {
    label: "Interviews",
    href: "/admin_recruiter/calendar",
    matchPrefixes: ["/admin_recruiter/calendar"],
    matchExact: true,
  },
];

const HIRING_ACTIVE_PREFIXES = ["/admin_recruiter/applications", ...CANDIDATE_ROUTE_PREFIXES];

const WORKFORCE_CHILDREN: SidebarLink[] = [
  {
    label: "Workers",
    href: "/admin_recruiter/workers",
    matchPrefixes: ["/admin_recruiter/workers"],
  },
  {
    label: "Managers",
    href: "/admin_recruiter/managers",
    matchPrefixes: ["/admin_recruiter/managers"],
  },
];

const WORKFLOW_MAPPINGS_ROUTE = `${DASHBOARD_BASE}/workflow-mappings`;

const AUTOMATION_CHILDREN: SidebarLink[] = [
  // {
  //   label: "Onboarding",
  //   href: ONBOARDING_BUILDER_ROUTE,
  //   matchPrefixes: [ONBOARDING_BUILDER_ROUTE],
  // }, // Hidden for now; can be uncommented later
  {
    label: "Workflows",
    href: WORKFLOWS_ROUTE,
    matchPrefixes: [WORKFLOWS_ROUTE],
  },
  {
    label: "Templates",
    href: TEMPLATES_ROUTE,
    matchPrefixes: [TEMPLATES_ROUTE],
  },
  {
    label: "Workflow Mappings",
    href: WORKFLOW_MAPPINGS_ROUTE,
    matchPrefixes: [WORKFLOW_MAPPINGS_ROUTE],
  },
  {
    label: "Library",
    href: `${DASHBOARD_BASE}/workflowlibrary`,
    matchPrefixes: [`${DASHBOARD_BASE}/workflowlibrary`],
  },
];

const AUTOMATION_ACTIVE_PREFIXES = [
  ONBOARDING_BUILDER_ROUTE,
  WORKFLOWS_ROUTE,
  TEMPLATES_ROUTE,
  WORKFLOW_MAPPINGS_ROUTE,
  `${DASHBOARD_BASE}/workflowlibrary`,
];

const ORGANIZATION_CHILDREN: SidebarLink[] = [
  {
    label: "Locations",
    href: "/admin_recruiter/facilities",
    matchPrefixes: ["/admin_recruiter/facilities"],
  },
];

const JOBS_ROUTE = "/admin_recruiter/jobs";

const DASHBOARD_ACTIVE_PREFIXES = [DASHBOARD_OVERVIEW_BASE];

const MAIL_ROUTE = "/admin_recruiter/mail";

/** Figma order: Dashboard → Reports → Shifts → Scheduling */
const FIGMA_PRIMARY_SECTIONS: SidebarSection[] = [
  {
    label: "Dashboard",
    href: "#",
    resourceKey: "dashboard",
    iconType: ICON.dashboard,
    matchPrefixes: DASHBOARD_ACTIVE_PREFIXES,
    children: DASHBOARD_CHILDREN,
  },
  // {
  //   label: "Reports",
  //   href: "#",
  //   iconType: ICON.reports,
  //   matchPrefixes: ["/admin_recruiter/reports"],
  //   children: REPORTS_CHILDREN,
  // }, // Moved under Settings.
  {
    label: "Shifts",
    href: "#",
    iconType: ICON.shifts,
    matchPrefixes: [],
    children: SHIFTS_CHILDREN,
  },
  {
    label: "Scheduling",
    href: "#",
    resourceKey: "scheduling",
    iconType: ICON.schedule,
    matchPrefixes: ["/admin_recruiter/calendar/shifts", "/admin_recruiter/attendance"],
    children: SCHEDULING_CHILDREN,
  },
];

const EXTRA_TOP_SECTIONS: SidebarSection[] = [
  {
    label: "Mail",
    href: MAIL_ROUTE,
    resourceKey: "mail",
    iconType: ICON.mail,
    matchPrefixes: [MAIL_ROUTE],
  },
  // {
  //   label: "Templates",
  //   href: "#",
  //   iconType: ICON.templateBuilder,
  //   matchPrefixes: TEMPLATES_ACTIVE_PREFIXES,
  //   children: TEMPLATES_CHILDREN,
  // }, // Moved under Settings.
  // {
  //   label: "Taskboard",
  //   href: "#",
  //   iconType: ICON.taskboard,
  //   matchPrefixes: TASKBOARD_ACTIVE_PREFIXES,
  //   children: TASKBOARD_CHILDREN,
  // }, // Hidden for now — Interviews moved under Candidates.
  {
    label: "Chat",
    href: "/admin_recruiter/messages",
    resourceKey: "chat",
    iconType: ICON.chat,
    matchPrefixes: ["/admin_recruiter/messages"],
  },
  {
    label: "Finance",
    href: "#",
    iconType: ICON.finance,
    matchPrefixes: [],
    disabled: true,
    children: FINANCE_CHILDREN,
  },
];

const PROFILE_ROUTE = "/admin_recruiter/account/personal";
const SETTINGS_ROUTE = "/admin_recruiter/settings";
const HELP_SUPPORT_ROUTE = "/admin_recruiter/help-support";
const NOTIFICATIONS_ROUTE = "/admin_recruiter/notifications";

/** Admins see Personal Settings > Profile. Recruiters get Profile as a direct Settings item. */
const SETTINGS_CHILDREN: SidebarLink[] = [
  {
    label: "Company settings",
    href: SETTINGS_ROUTE,
    resourceKey: "settings_company",
    matchPrefixes: [SETTINGS_ROUTE],
  },
  {
    label: "Personal Settings",
    href: "#",
    resourceKey: "settings_profile",
    matchPrefixes: ["/admin_recruiter/account"],
    children: [
      {
        label: "Profile",
        href: PROFILE_ROUTE,
        matchPrefixes: ["/admin_recruiter/account"],
      },
    ],
  },
  {
    label: "Notifications",
    href: NOTIFICATIONS_ROUTE,
    resourceKey: "settings_notifications",
    matchPrefixes: [NOTIFICATIONS_ROUTE],
  },
  {
    label: "Help & Support",
    href: HELP_SUPPORT_ROUTE,
    resourceKey: "settings_help",
    matchPrefixes: [HELP_SUPPORT_ROUTE],
  },
  {
    label: "Reports",
    href: "#",
    resourceKey: "settings_reports",
    matchPrefixes: [REPORTS_BASE],
    children: REPORTS_CHILDREN,
  },
];

const SETTINGS_MATCH_PREFIXES = [
  SETTINGS_ROUTE,
  "/admin_recruiter/account",
  HELP_SUPPORT_ROUTE,
  NOTIFICATIONS_ROUTE,
  REPORTS_BASE,
];

/** Company admin: Organization, Automation, and Templates live under Settings, with their existing submenus. */
const ADMIN_SETTINGS_CHILDREN: SidebarLink[] = [
  ...SETTINGS_CHILDREN,
  {
    label: "Automation",
    href: "#",
    resourceKey: "settings_automation",
    matchPrefixes: AUTOMATION_ACTIVE_PREFIXES,
    children: AUTOMATION_CHILDREN,
  },
  {
    label: "Templates",
    href: "#",
    resourceKey: "settings_templates",
    matchPrefixes: TEMPLATES_ACTIVE_PREFIXES,
    children: TEMPLATES_CHILDREN,
  },
];

function settingsSection(children: SidebarLink[], matchPrefixes: string[]): SidebarSection {
  return {
    label: "Settings",
    href: "#",
    iconType: ICON.settings,
    matchPrefixes,
    children,
  };
}

const SHARED_FOOTER_SECTIONS: SidebarSection[] = [
  // {
  //   label: "Help & Support",
  //   href: "/admin_recruiter/help-support",
  //   iconType: ICON.help,
  //   matchPrefixes: ["/admin_recruiter/help-support"],
  // }, // Moved under Settings.
  settingsSection(SETTINGS_CHILDREN, SETTINGS_MATCH_PREFIXES),
];

const ADMIN_SETTINGS_SECTION = settingsSection(ADMIN_SETTINGS_CHILDREN, [
  ...SETTINGS_MATCH_PREFIXES,
  ...AUTOMATION_ACTIVE_PREFIXES,
  ...TEMPLATES_ACTIVE_PREFIXES,
]);

/** Company owner / admin recruiter (client login). */
export const CLIENT_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    label: "Dashboard",
    href: "#",
    resourceKey: "dashboard",
    iconType: ICON.dashboard,
    matchPrefixes: DASHBOARD_ACTIVE_PREFIXES,
    children: DASHBOARD_CHILDREN,
  },
  {
    label: "Hiring",
    href: "#",
    resourceKey: "hiring",
    iconType: ICON.candidates,
    matchPrefixes: HIRING_ACTIVE_PREFIXES,
    children: RECRUITMENT_CHILDREN,
  },
  {
    label: "People",
    href: "#",
    resourceKey: "people",
    iconType: ICON.teams,
    matchPrefixes: ["/admin_recruiter/workers", "/admin_recruiter/managers"],
    children: WORKFORCE_CHILDREN,
  },
  {
    label: "Organization",
    href: "#",
    resourceKey: "organization",
    iconType: ICON.organization,
    matchPrefixes: ["/admin_recruiter/facilities"],
    children: ORGANIZATION_CHILDREN,
  },
  {
    label: "Jobs",
    href: JOBS_ROUTE,
    resourceKey: "jobs",
    iconType: ICON.jobs,
    matchPrefixes: [JOBS_ROUTE],
  },
  {
    label: "Scheduling",
    href: "#",
    resourceKey: "scheduling",
    iconType: ICON.schedule,
    matchPrefixes: ["/admin_recruiter/calendar/shifts", "/admin_recruiter/attendance"],
    children: SCHEDULING_CHILDREN,
  },
  // {
  //   label: "Time",
  //   href: "#",
  //   iconType: ICON.time,
  //   matchPrefixes: [],
  //   children: TIME_CHILDREN,
  // }, // Hidden for now — routes are not built yet.
  // {
  //   label: "Pay",
  //   href: "#",
  //   iconType: ICON.pay,
  //   matchPrefixes: [],
  //   children: PAY_CHILDREN,
  // }, // Hidden for now — routes are not built yet.
  // {
  //   label: "Automation",
  //   href: "#",
  //   iconType: ICON.automation,
  //   matchPrefixes: AUTOMATION_ACTIVE_PREFIXES,
  //   children: AUTOMATION_CHILDREN,
  // }, // Moved under Settings.
  // {
  //   label: "Reports",
  //   href: "#",
  //   iconType: ICON.reports,
  //   matchPrefixes: ["/admin_recruiter/reports"],
  //   children: REPORTS_CHILDREN,
  // }, // Moved under Settings.
  // {
  //   label: "Templates",
  //   href: "#",
  //   iconType: ICON.templateBuilder,
  //   matchPrefixes: TEMPLATES_ACTIVE_PREFIXES,
  //   children: TEMPLATES_CHILDREN,
  // }, // Moved under Settings.
  // {
  //   label: "Taskboard",
  //   href: "#",
  //   iconType: ICON.taskboard,
  //   matchPrefixes: TASKBOARD_ACTIVE_PREFIXES,
  //   children: TASKBOARD_CHILDREN,
  // }, // Hidden for now — Interviews moved under Candidates.
  {
    label: "Mail",
    href: MAIL_ROUTE,
    resourceKey: "mail",
    iconType: ICON.mail,
    matchPrefixes: [MAIL_ROUTE],
  },
  {
    label: "Chat",
    href: "/admin_recruiter/messages",
    resourceKey: "chat",
    iconType: ICON.chat,
    matchPrefixes: ["/admin_recruiter/messages"],
  },
  // {
  //   label: "Profile",
  //   href: "/admin_recruiter/account/personal",
  //   iconType: ICON.account,
  //   matchPrefixes: ["/admin_recruiter/account"],
  // }, // Moved under Settings.
  // {
  //   label: "Notifications",
  //   href: "/admin_recruiter/notifications",
  //   iconType: ICON.notifications,
  //   matchPrefixes: ["/admin_recruiter/notifications"],
  // }, // Moved under Settings.
  ADMIN_SETTINGS_SECTION,
];

/** Brass HR platform god admin viewing admin recruiter. */
export const GOD_ADMIN_SIDEBAR_SECTIONS: SidebarSection[] = [
  ...FIGMA_PRIMARY_SECTIONS,
  {
    label: "Hiring",
    href: "#",
    resourceKey: "hiring",
    iconType: ICON.candidates,
    matchPrefixes: HIRING_ACTIVE_PREFIXES,
    children: RECRUITMENT_CHILDREN,
  },
  {
    label: "People",
    href: "#",
    resourceKey: "people",
    iconType: ICON.teams,
    matchPrefixes: ["/admin_recruiter/workers", "/admin_recruiter/managers"],
    children: WORKFORCE_CHILDREN,
  },
  {
    label: "Clients",
    href: "#",
    iconType: ICON.clients,
    matchPrefixes: ["/godadmin/tenants", "/godadmin"],
    children: [
      { label: "All Clients", href: "/godadmin/tenants", matchPrefixes: ["/godadmin/tenants", "/godadmin"] },
      { label: "Organization", href: "#", matchPrefixes: [], disabled: true },
      { label: "Facilities", href: "/admin_recruiter/facilities", matchPrefixes: ["/admin_recruiter/facilities"] },
    ],
  },
  {
    label: "Organization",
    href: "#",
    resourceKey: "organization",
    iconType: ICON.organization,
    matchPrefixes: ["/admin_recruiter/facilities"],
    children: ORGANIZATION_CHILDREN,
  },
  {
    label: "Jobs",
    href: JOBS_ROUTE,
    resourceKey: "jobs",
    iconType: ICON.jobs,
    matchPrefixes: [JOBS_ROUTE],
  },
  {
    label: "Automation",
    href: "#",
    iconType: ICON.automation,
    matchPrefixes: AUTOMATION_ACTIVE_PREFIXES,
    children: AUTOMATION_CHILDREN,
  },
  ...EXTRA_TOP_SECTIONS,
  // {
  //   label: "Profile",
  //   href: "/admin_recruiter/account/personal",
  //   iconType: ICON.account,
  //   matchPrefixes: ["/admin_recruiter/account"],
  // }, // Moved under Settings.
  // {
  //   label: "Notifications",
  //   href: "/admin_recruiter/notifications",
  //   iconType: ICON.notifications,
  //   matchPrefixes: ["/admin_recruiter/notifications"],
  // }, // Moved under Settings.
  ...SHARED_FOOTER_SECTIONS,
];

export { ICON as SIDEBAR_ICON_TYPES };
