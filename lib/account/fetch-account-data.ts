import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { labelForRole, loadStaffRoles, matchStaffRole } from "@/lib/admin/staff-roles";
import { computeChecklistState } from "./completion";
import { buildFullName } from "./display-name";
import { resolveDefaultAccountTimezone } from "./reference-timezones";
import { resolveStaffProfilePhotoUrl } from "./staff-profile-photo";
import type {
  AccountChecklist,
  AccountData,
  AccountOrganization,
  AccountProfile,
  AccountSettings,
} from "./types";
import { DEFAULT_ACCOUNT_SETTINGS as DEFAULTS } from "./types";

type RawUserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  profile_photo: string | null;
  job_title: string | null;
  tenant_id: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function mapProfileRow(
  row: RawUserRow | null,
  authUser: User | null,
  avatarUrl: string | null
): AccountProfile | null {
  if (!row && !authUser) return null;

  const first_name = row?.first_name ?? null;
  const last_name = row?.last_name ?? null;

  return {
    id: row?.id ?? authUser?.id ?? "",
    first_name,
    last_name,
    full_name: buildFullName(first_name, last_name),
    email: authUser?.email ?? row?.email ?? null,
    phone: row?.phone ?? authUser?.phone ?? null,
    avatar_url: avatarUrl,
    role: row?.role ?? null,
    job_title: row?.job_title ?? null,
    organization_id: row?.tenant_id ?? null,
    address_line1: row?.address_line1 ?? null,
    address_line2: row?.address_line2 ?? null,
    city: row?.city ?? null,
    state: row?.state ?? null,
    zip_code: row?.zip_code ?? null,
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null,
  };
}

export async function ensureAccountSettings(
  supabase: SupabaseClient,
  userId: string
): Promise<AccountSettings> {
  const { data: existing, error: readError } = await supabase
    .from("account_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle<AccountSettings>();

  if (readError) throw readError;
  if (existing) return existing;

  const timezone = await resolveDefaultAccountTimezone(supabase);
  const now = new Date().toISOString();

  if (!timezone) {
    return {
      user_id: userId,
      ...DEFAULTS,
      created_at: null,
      updated_at: now,
    };
  }

  const row = {
    user_id: userId,
    ...DEFAULTS,
    timezone,
    updated_at: now,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("account_settings")
    .upsert(row)
    .select("*")
    .single<AccountSettings>();

  if (insertError) {
    if (insertError.code === "23503") {
      return {
        user_id: userId,
        ...DEFAULTS,
        timezone,
        created_at: null,
        updated_at: now,
      };
    }
    throw insertError;
  }
  return inserted;
}

export async function syncAccountChecklist(
  supabase: SupabaseClient,
  input: {
    user: User | null;
    profile: AccountProfile | null;
    organization: AccountOrganization | null;
    settings: AccountSettings | null;
    checklist: AccountChecklist | null;
  }
): Promise<AccountChecklist | null> {
  if (!input.user?.id) return input.checklist;

  const computed = computeChecklistState(input);
  const payload = {
    ...computed,
    user_id: input.user.id,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("account_checklist")
    .upsert(payload)
    .select("*")
    .single<AccountChecklist>();

  if (error) throw error;
  return data;
}

export async function fetchAccountData(supabase: SupabaseClient): Promise<AccountData> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) {
    return { user: null, profile: null, organization: null, settings: null, checklist: null };
  }

  const { data: userRow, error: profileError } = await supabase
    .from("users")
    .select(
      "id, first_name, last_name, email, phone, role, profile_photo, job_title, tenant_id, address_line1, address_line2, city, state, zip_code, created_at, updated_at"
    )
    .eq("id", user.id)
    .maybeSingle<RawUserRow>();

  if (profileError) throw profileError;

  const storedPhoto =
    userRow?.profile_photo ??
    (user.user_metadata as { avatar_url?: string } | undefined)?.avatar_url ??
    null;
  const resolvedAvatarUrl = await resolveStaffProfilePhotoUrl(supabase, storedPhoto);

  const profile = mapProfileRow(userRow, user, resolvedAvatarUrl);
  if (profile) {
    try {
      const catalog = await loadStaffRoles(supabase);
      const match = matchStaffRole(profile.role, catalog);
      profile.role_label = match?.label ?? labelForRole(profile.role, catalog);
      profile.is_admin = match?.isAdmin === true;
    } catch {
      profile.role_label = null;
      profile.is_admin = false;
    }
  }

  let organization: AccountOrganization | null = null;
  if (profile?.organization_id) {
    const { data: tenantRow, error: tenantError } = await supabase
      .from("tenants")
      .select(
        "id, name, legal_name, subdomain, domain, website, industry, company_size, phone, email, address_line_1, address_line_2, city, state, postal_code, country, logo_url, ein, plan, created_at, updated_at"
      )
      .eq("id", profile.organization_id)
      .maybeSingle<AccountOrganization>();

    if (tenantError) throw tenantError;
    organization = tenantRow;
  }

  const settings = await ensureAccountSettings(supabase, user.id);

  const { data: checklistRow, error: checklistReadError } = await supabase
    .from("account_checklist")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<AccountChecklist>();

  if (checklistReadError) throw checklistReadError;

  const checklist = await syncAccountChecklist(supabase, {
    user,
    profile,
    organization,
    settings,
    checklist: checklistRow,
  });

  return { user, profile, organization, settings, checklist };
}
