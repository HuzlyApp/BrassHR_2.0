import type { User } from "@supabase/supabase-js";

/** Profile row from public.users (maps to account "profile" in the UI). */
export type AccountProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string | null;
  role_label?: string | null;
  is_admin?: boolean;
  job_title: string | null;
  organization_id: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  created_at: string | null;
  updated_at: string | null;
};

/** Organization row from public.tenants. */
export type AccountOrganization = {
  id: string;
  name: string;
  legal_name: string | null;
  subdomain: string | null;
  domain: string | null;
  website: string | null;
  industry: string | null;
  company_size: string | null;
  phone: string | null;
  email: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  logo_url: string | null;
  ein: string | null;
  plan: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AccountSettings = {
  user_id: string;
  timezone: string;
  language: string;
  date_format: string;
  theme: string;
  email_notifications: boolean;
  sms_notifications: boolean;
  push_notifications: boolean;
  marketing_emails: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type AccountChecklist = {
  user_id: string;
  profile_completed: boolean;
  business_info_completed: boolean;
  account_settings_completed: boolean;
  security_completed: boolean;
  email_verified: boolean;
  organization_created: boolean;
  payment_setup_completed: boolean;
  team_invited: boolean;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AccountData = {
  user: User | null;
  profile: AccountProfile | null;
  organization: AccountOrganization | null;
  settings: AccountSettings | null;
  checklist: AccountChecklist | null;
};

export const DEFAULT_ACCOUNT_SETTINGS: Omit<AccountSettings, "user_id" | "created_at" | "updated_at"> = {
  timezone: "America/New_York",
  language: "en",
  date_format: "MM/DD/YYYY",
  theme: "system",
  email_notifications: true,
  sms_notifications: false,
  push_notifications: true,
  marketing_emails: false,
};
