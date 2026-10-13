import type { SidebarIconType } from "@/app/admin_recruiter/components/sidebar-icons";
import { CANDIDATE_ROUTE_PREFIXES } from "@/app/admin_recruiter/components/candidates-tabs-config";

export type SidebarLink = {
  label: string;
  href: string;
  matchPrefixes: string[];
  matchExact?: boolean;
  disabled?: boolean;
};

export type SidebarSection = {
  label: string;
  href: string;
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

/** Routes not built yet — rows render without navigation. */
const TIME_CHILDREN: SidebarLink[] = [
  { label: "Clock-ins", href: "#", matchPrefixes: [], disabled: true },
  { label: "Timesheets", href: "#", matchPrefixes: [], disabled: true },
  { label: "Approvals", href: "#", matchPrefixes: [], disabled: true },
];

/** Routes not built yet — rows render without navigation. */
const PAY_CHILDREN: SidebarLink[] = [
  { label: "Payroll Export", href: "#", matchPrefixes: [], disabled: true },
  { label: "Bill / Pay Rates", href: "#", matchPrefixes: [], disabled: true },
];

const TASKBOARD_CHILDREN: SidebarLink[] = [
  // {
  //   label: "Onboarding",
  //   href: "#",
  //   matchPrefixes: [],
  //   disabled: true,
  // }, // Hidden for now — keep for future use.
  {
    label: "Interviews",
    href: "/admin_recruiter/calendar",
    matchPrefixes: ["/admin_recruiter/calendar"],
    matchExact: true,
  },
  // {
  //   label: "Calls",
  //   href: "#",
  //   matchPrefixes: [],
  //   disabled: true,
  // }, // Hidden for now — keep for future use.
];

const TASKBOARD_ACTIVE_PREFIXES: string[] = [];

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
  {
    label: "Candidates",
    href: "/admin_recruiter/candidates",
    matchPrefixes: CANDIDATE_ROUTE_PREFIXES,
  },
];

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
    iconType: ICON.dashboard,
    matchPrefixes: DASHBOARD_ACTIVE_PREFIXES,
    children: DASHBOARD_CHILDREN,
  },
  {
    label: "Reports",
    href: "#",
    iconType: ICON.reports,
    matchPrefixes: ["/admin_recruiter/reports"],
    children: REPORTS_CHILDREN,
  },
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
    iconType: ICON.schedule,
    matchPrefixes: ["/admin_recruiter/calendar/shifts", "/admin_recruiter/attendance"],
    children: SCHEDULING_CHILDREN,
  },
];

const EXTRA_TOP_SECTIONS: SidebarSection[] = [
  {
    label: "Mail",
    href: MAIL_ROUTE,
    iconType: ICON.mail,
    matchPrefixes: [MAIL_ROUTE],
  },
  {
    label: "Templates",
    href: "#",
    iconType: ICON.templateBuilder,
    matchPrefixes: TEMPLATES_ACTIVE_PREFIXES,
    children: TEMPLATES_CHILDREN,
  },
  {
    label: "Taskboard",
    href: "#",
    iconType: ICON.taskboard,
    matchPrefixes: TASKBOARD_ACTIVE_PREFIXES,
    children: TASKBOARD_CHILDREN,
  },
  {
    label: "Chat",
    href: "/admin_recruiter/messages",
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

const SHARED_FOOTER_SECTIONS: SidebarSection[] = [
  {
    label: "Help & Support",
    href: "/admin_recruiter/help-support",
    iconType: ICON.help,
    matchPrefixes: ["/admin_recruiter/help-support"],
  },
  {
    label: "Settings",
    href: "/admin_recruiter/settings",
    iconType: ICON.settings,
    matchPrefixes: ["/admin_recruiter/settings"],
  },
];

/** Company owner / admin recruiter (client login). */
export const CLIENT_SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    label: "Dashboard",
    href: "#",
    iconType: ICON.dashboard,
    matchPrefixes: DASHBOARD_ACTIVE_PREFIXES,
    children: DASHBOARD_CHILDREN,
  },
  {
    label: "Hiring",
    href: "#",
    iconType: ICON.candidates,
    matchPrefixes: CANDIDATE_ROUTE_PREFIXES,
    children: RECRUITMENT_CHILDREN,
  },
  {
    label: "People",
    href: "#",
    iconType: ICON.teams,
    matchPrefixes: ["/admin_recruiter/workers", "/admin_recruiter/managers"],
    children: WORKFORCE_CHILDREN,
  },
  {
    label: "Organization",
    href: "#",
    iconType: ICON.organization,
    matchPrefixes: ["/admin_recruiter/facilities"],
    children: ORGANIZATION_CHILDREN,
  },
  {
    label: "Jobs",
    href: JOBS_ROUTE,
    iconType: ICON.jobs,
    matchPrefixes: [JOBS_ROUTE],
  },
  {
    label: "Scheduling",
    href: "#",
    iconType: ICON.schedule,
    matchPrefixes: ["/admin_recruiter/calendar/shifts", "/admin_recruiter/attendance"],
    children: SCHEDULING_CHILDREN,
  },
  {
    label: "Time",
    href: "#",
    iconType: ICON.time,
    matchPrefixes: [],
    children: TIME_CHILDREN,
  },
  {
    label: "Pay",
    href: "#",
    iconType: ICON.pay,
    matchPrefixes: [],
    children: PAY_CHILDREN,
  },
  {
    label: "Automation",
    href: "#",
    iconType: ICON.automation,
    matchPrefixes: AUTOMATION_ACTIVE_PREFIXES,
    children: AUTOMATION_CHILDREN,
  },
  {
    label: "Reports",
    href: "#",
    iconType: ICON.reports,
    matchPrefixes: ["/admin_recruiter/reports"],
    children: REPORTS_CHILDREN,
  },
  {
    label: "Templates",
    href: "#",
    iconType: ICON.templateBuilder,
    matchPrefixes: TEMPLATES_ACTIVE_PREFIXES,
    children: TEMPLATES_CHILDREN,
  },
  {
    label: "Taskboard",
    href: "#",
    iconType: ICON.taskboard,
    matchPrefixes: TASKBOARD_ACTIVE_PREFIXES,
    children: TASKBOARD_CHILDREN,
  },
  {
    label: "Mail",
    href: MAIL_ROUTE,
    iconType: ICON.mail,
    matchPrefixes: [MAIL_ROUTE],
  },
  {
    label: "Chat",
    href: "/admin_recruiter/messages",
    iconType: ICON.chat,
    matchPrefixes: ["/admin_recruiter/messages"],
  },
  {
    label: "Profile",
    href: "/admin_recruiter/account/personal",
    iconType: ICON.account,
    matchPrefixes: ["/admin_recruiter/account"],
  },
  {
    label: "Notifications",
    href: "/admin_recruiter/notifications",
    iconType: ICON.notifications,
    matchPrefixes: ["/admin_recruiter/notifications"],
  },
  ...SHARED_FOOTER_SECTIONS,
];

/** Brass HR platform god admin viewing admin recruiter. */
export const GOD_ADMIN_SIDEBAR_SECTIONS: SidebarSection[] = [
  ...FIGMA_PRIMARY_SECTIONS,
  {
    label: "Hiring",
    href: "#",
    iconType: ICON.candidates,
    matchPrefixes: CANDIDATE_ROUTE_PREFIXES,
    children: RECRUITMENT_CHILDREN,
  },
  {
    label: "People",
    href: "#",
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
    iconType: ICON.organization,
    matchPrefixes: ["/admin_recruiter/facilities"],
    children: ORGANIZATION_CHILDREN,
  },
  {
    label: "Jobs",
    href: JOBS_ROUTE,
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
  {
    label: "Profile",
    href: "/admin_recruiter/account/personal",
    iconType: ICON.account,
    matchPrefixes: ["/admin_recruiter/account"],
  },
  {
    label: "Notifications",
    href: "/admin_recruiter/notifications",
    iconType: ICON.notifications,
    matchPrefixes: ["/admin_recruiter/notifications"],
  },
  ...SHARED_FOOTER_SECTIONS,
];

export { ICON as SIDEBAR_ICON_TYPES };
