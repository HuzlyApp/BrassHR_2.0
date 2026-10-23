export const ACCOUNT_TABS = [
  { slug: "personal", label: "Personal" },
  { slug: "business-info", label: "Business Info" },
  { slug: "account-settings", label: "Account Settings" },
  { slug: "security", label: "Security" },
  // { slug: "checklist", label: "Checklist" }, // Hidden for now; keep for future enablement
] as const;

export type AccountTabSlug = (typeof ACCOUNT_TABS)[number]["slug"];

/** Company admin tabs. Hidden from recruiter and client roles. */
const RECRUITER_HIDDEN_ACCOUNT_TAB_SLUGS = new Set<AccountTabSlug>(["business-info", "account-settings"]);

export function isRecruiterHiddenAccountTab(slug: AccountTabSlug): boolean {
  return RECRUITER_HIDDEN_ACCOUNT_TAB_SLUGS.has(slug);
}

export function isAccountTabSlug(value: string): value is AccountTabSlug {
  return ACCOUNT_TABS.some((tab) => tab.slug === value);
}

export function accountTabHref(slug: AccountTabSlug): string {
  return `/admin_recruiter/account/${slug}`;
}
