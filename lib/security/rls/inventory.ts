/**
 * Security inventory captured from the live Supabase catalog (2026-08-13).
 * Live tests re-query pg_policies; this file is the reviewed ownership map.
 */

export type SecurityClass =
  | "tenant-private"
  | "application-private"
  | "tenant-config"
  | "worker-owned"
  | "public-reference"
  | "public-job"
  | "deny-by-default"
  | "sensitive-storage";

export type OwnershipChain =
  | "tenants.id"
  | "direct.tenant_id"
  | "job_applications.tenant_id"
  | "job_applications → job_requisitions.tenant_id"
  | "worker.tenant_id"
  | "auth.uid() worker row"
  | "storage path prefix";

export type ResourceInventory = {
  resource: string;
  rls: "on" | "off";
  policyCount: number;
  tenantSource: OwnershipChain;
  securityClass: SecurityClass;
  notes: string;
};

export const RECRUITING_RESOURCES: ResourceInventory[] = [
  {
    resource: "tenants",
    rls: "on",
    policyCount: 2,
    tenantSource: "tenants.id",
    securityClass: "public-reference",
    notes: "anon/authenticated can SELECT every active tenant (tenants_public_select_active).",
  },
  {
    resource: "users",
    rls: "on",
    policyCount: 3,
    tenantSource: "direct.tenant_id",
    securityClass: "tenant-private",
    notes: "tenant_isolation uses current_tenant_id(); users_update_own can update own row including role/god_admin unless a trigger blocks it.",
  },
  {
    resource: "user_roles",
    rls: "on",
    policyCount: 0,
    tenantSource: "direct.tenant_id",
    securityClass: "deny-by-default",
    notes: "RLS on, no policies → PostgREST deny-all. Membership writes go through service role. is_active suspends tenant membership.",
  },
  {
    resource: "staff_invitations",
    rls: "on",
    policyCount: 0,
    tenantSource: "direct.tenant_id",
    securityClass: "deny-by-default",
    notes: "RLS on, no policies, grants revoked from anon/authenticated. Invite metadata only; activation tokens stay in Auth.",
  },
  {
    resource: "worker",
    rls: "on",
    policyCount: 2,
    tenantSource: "direct.tenant_id",
    securityClass: "tenant-private",
    notes: "tenant_isolation via current_tenant_id(); worker_own_session is user_id = auth.uid() with no tenant predicate.",
  },
  {
    resource: "workers",
    rls: "on",
    policyCount: 2,
    tenantSource: "direct.tenant_id",
    securityClass: "tenant-private",
    notes: "Staff ALL via user_is_tenant_staff; applicant read via approved_applicant_owns_worker.",
  },
  {
    resource: "job_requisitions",
    rls: "on",
    policyCount: 4,
    tenantSource: "direct.tenant_id",
    securityClass: "public-job",
    notes: "Staff ALL. Public SELECT policies expose published/Open jobs, including a broad status-only policy without public_job_token.",
  },
  {
    resource: "job_applications",
    rls: "on",
    policyCount: 2,
    tenantSource: "direct.tenant_id",
    securityClass: "tenant-private",
    notes: "Staff ALL. Applicant SELECT is applicant_auth_user_id = auth.uid() with no column restriction (AI analysis/decisions visible).",
  },
  {
    resource: "worker_notes",
    rls: "on",
    policyCount: 3,
    tenantSource: "job_applications.tenant_id",
    securityClass: "application-private",
    notes: "Staff ALL on tenant_id only. Worker read via worker_owns_record(worker_id) — all applications. No tenant-consistency trigger vs application_id.",
  },
  {
    resource: "msp_submissions",
    rls: "on",
    policyCount: 1,
    tenantSource: "job_applications.tenant_id",
    securityClass: "application-private",
    notes: "Staff SELECT. Inserts are service-role only. One row per application. Trigger checks tenant, requisition, and worker.",
  },
  {
    resource: "application_status_history",
    rls: "on",
    policyCount: 1,
    tenantSource: "job_applications.tenant_id",
    securityClass: "application-private",
    notes: "Staff SELECT only (immutable via PostgREST). Writes go through SECURITY DEFINER change_job_application_status.",
  },
  {
    resource: "application_statuses",
    rls: "on",
    policyCount: 4,
    tenantSource: "direct.tenant_id",
    securityClass: "tenant-config",
    notes: "Admin INSERT/UPDATE/DELETE; staff SELECT. Recruiter cannot configure definitions via RLS.",
  },
  {
    resource: "job_screening_questions",
    rls: "on",
    policyCount: 2,
    tenantSource: "job_applications → job_requisitions.tenant_id",
    securityClass: "public-job",
    notes: "Staff ALL. Public read of active questions for published jobs.",
  },
  {
    resource: "application_screening_answers",
    rls: "on",
    policyCount: 2,
    tenantSource: "job_applications.tenant_id",
    securityClass: "application-private",
    notes: "Staff ALL on tenant_id. Applicant SELECT via job_applications.applicant_auth_user_id. No FK tenant match trigger.",
  },
  {
    resource: "job_application_analysis_versions",
    rls: "on",
    policyCount: 1,
    tenantSource: "job_applications.tenant_id",
    securityClass: "application-private",
    notes: "Staff ALL on tenant_id only.",
  },
  {
    resource: "job_application_decisions",
    rls: "on",
    policyCount: 1,
    tenantSource: "job_applications.tenant_id",
    securityClass: "application-private",
    notes: "Staff ALL on tenant_id only. recorded_by is client-supplied at the table.",
  },
  {
    resource: "job_application_verified_information",
    rls: "on",
    policyCount: 1,
    tenantSource: "job_applications.tenant_id",
    securityClass: "application-private",
    notes: "Staff ALL on tenant_id only.",
  },
  {
    resource: "job_application_ai_screening_answers",
    rls: "on",
    policyCount: 1,
    tenantSource: "job_applications.tenant_id",
    securityClass: "application-private",
    notes: "Staff ALL on tenant_id only.",
  },
  {
    resource: "job_application_match_requirements",
    rls: "on",
    policyCount: 1,
    tenantSource: "job_applications.tenant_id",
    securityClass: "application-private",
    notes: "Uses job_application_id, not application_id.",
  },
  {
    resource: "interview_schedules",
    rls: "on",
    policyCount: 1,
    tenantSource: "job_applications.tenant_id",
    securityClass: "application-private",
    notes: "Staff ALL. Meeting URLs/calendar UIDs are sensitive. No applicant SELECT.",
  },
  {
    resource: "interview_attendees",
    rls: "on",
    policyCount: 1,
    tenantSource: "job_applications.tenant_id",
    securityClass: "application-private",
    notes: "Staff ALL. Ownership is tenant_id; parent interview FK is not tenant-checked.",
  },
  {
    resource: "interview_invitation_deliveries",
    rls: "on",
    policyCount: 1,
    tenantSource: "job_applications.tenant_id",
    securityClass: "application-private",
    notes: "Staff ALL.",
  },
  {
    resource: "worker_resumes",
    rls: "on",
    policyCount: 2,
    tenantSource: "worker.tenant_id",
    securityClass: "sensitive-storage",
    notes: "Owner ALL via worker_belongs_to_auth (no tenant). Staff SELECT.",
  },
  {
    resource: "worker_documents",
    rls: "on",
    policyCount: 1,
    tenantSource: "worker.tenant_id",
    securityClass: "sensitive-storage",
    notes: "Applicant SELECT only via approved_applicant_owns_worker. Staff likely service-role.",
  },
  {
    resource: "applicant_appointments",
    rls: "on",
    policyCount: 0,
    tenantSource: "job_applications.tenant_id",
    securityClass: "deny-by-default",
    notes: "RLS on, no policies. Calendar APIs must authorize; service role bypasses RLS.",
  },
  {
    resource: "activity_logs",
    rls: "on",
    policyCount: 0,
    tenantSource: "direct.tenant_id",
    securityClass: "deny-by-default",
    notes: "RLS on, no policies. Audit reads must not use unscoped service-role queries.",
  },
  {
    resource: "documents",
    rls: "on",
    policyCount: 0,
    tenantSource: "direct.tenant_id",
    securityClass: "deny-by-default",
    notes: "RLS on, no policies.",
  },
  {
    resource: "industry_catalog",
    rls: "on",
    policyCount: 2,
    tenantSource: "tenants.id",
    securityClass: "public-reference",
    notes: "Authenticated SELECT. Writes restricted to god_admin.",
  },
  {
    resource: "ai_prompt_template",
    rls: "on",
    policyCount: 2,
    tenantSource: "direct.tenant_id",
    securityClass: "tenant-config",
    notes: "Staff can SELECT global + own tenant templates. Writes god_admin only.",
  },
  {
    resource: "ai_prompt_version",
    rls: "on",
    policyCount: 2,
    tenantSource: "direct.tenant_id",
    securityClass: "tenant-config",
    notes: "Published/retired bodies immutable via trigger. Writes god_admin only.",
  },
  {
    resource: "tenant_ai_binding",
    rls: "on",
    policyCount: 2,
    tenantSource: "direct.tenant_id",
    securityClass: "tenant-config",
    notes: "Staff SELECT own tenant. Writes god_admin only.",
  },
  {
    resource: "ai_prompt_run",
    rls: "on",
    policyCount: 1,
    tenantSource: "direct.tenant_id",
    securityClass: "tenant-private",
    notes: "Append-only. Staff SELECT own tenant. No authenticated INSERT/UPDATE/DELETE.",
  },
];

export const RLS_DISABLED_PUBLIC_TABLES = ["default_workflow_migration_report"] as const;

export const HIGH_RISK_SECURITY_DEFINER_FUNCTIONS = [
  {
    name: "change_job_application_status",
    issue:
      "SECURITY DEFINER with no auth.uid() check. Live grants included anon. Trusts caller p_tenant_id. App APIs use service role after requireStaffApiSession.",
  },
  {
    name: "current_tenant_id",
    issue:
      "Returns users.tenant_id LIMIT 1. Breaks multi-tenant membership and same-user-across-tenants.",
  },
  {
    name: "user_is_tenant_staff",
    issue:
      "Correctly checks user_roles and users.tenant_id + role in (admin, client). Recruiter maps to client. Does not accept client-supplied JWT role claims.",
  },
  {
    name: "user_is_tenant_admin",
    issue: "Checks user_roles.role = admin OR users.role in (admin, owner) OR god_admin.",
  },
  {
    name: "worker_belongs_to_auth",
    issue: "Matches worker.user_id = auth.uid() with no tenant predicate.",
  },
  {
    name: "worker_owns_record",
    issue: "Same as worker_belongs_to_auth — no tenant predicate.",
  },
  {
    name: "is_god_admin_user",
    issue: "Reads public.users.god_admin, not user-editable JWT user_metadata. EXECUTE granted to anon.",
  },
  {
    name: "publish_ai_prompt_version",
    issue:
      "SECURITY DEFINER. Checks is_god_admin_user() or service_role/postgres. REVOKE FROM PUBLIC.",
  },
  {
    name: "bind_tenant_ai_industries",
    issue:
      "SECURITY DEFINER used for idempotent tenant industry binding. Called from staff APIs after validation.",
  },
  {
    name: "seed_default_tenant_onboarding",
    issue: "SECURITY DEFINER granted to authenticated; takes p_tenant_id from caller.",
  },
] as const;

export const STORAGE_BUCKETS = [
  {
    name: "recruiter-template-documents",
    public: false,
    notes: "Path prefix must be tenant UUID; checked with user_is_tenant_staff.",
  },
  {
    name: "staff-profile-photos",
    public: false,
    notes: "First folder must equal auth.uid().",
  },
  {
    name: "worker_required_files",
    public: false,
    notes:
      "Allows auth.uid() prefix, portal/{worker_id} for owner, or tenant-uuid prefix for staff. Ownership is path-derived.",
  },
  {
    name: "worker-resumes",
    public: false,
    notes: "Owner path = auth.uid(). Staff cannot read via Storage RLS; they need signed URLs from an authorized API.",
  },
] as const;

/** Tables whose INSERT WITH CHECK is only user_is_tenant_staff(tenant_id) — FK spoof risk. */
export const FK_SPOOF_CANDIDATE_TABLES = [
  "worker_notes",
  "application_screening_answers",
  "interview_schedules",
  "interview_attendees",
  "job_application_analysis_versions",
  "job_application_decisions",
  "job_application_verified_information",
  "job_application_ai_screening_answers",
] as const;

export const ACCESS_MATRIX = [
  { resource: "User Management", role: "Admin", own: "ALLOW", other: "DENY" },
  { resource: "User Management", role: "Recruiter", own: "DENY", other: "DENY" },
  { resource: "Jobs", role: "Admin", own: "ALLOW", other: "DENY" },
  { resource: "Jobs", role: "Recruiter", own: "ALLOW", other: "DENY" },
  { resource: "Workers", role: "Admin", own: "ALLOW", other: "DENY" },
  { resource: "Workers", role: "Recruiter", own: "ALLOW", other: "DENY" },
  { resource: "Applications", role: "Recruiter", own: "ALLOW", other: "DENY" },
  { resource: "Notes", role: "Recruiter", own: "ALLOW", other: "DENY" },
  { resource: "Notes", role: "Worker", own: "READ own worker", other: "DENY" },
  { resource: "Status History", role: "Recruiter", own: "READ", other: "DENY" },
  { resource: "Candidate Statuses", role: "Admin", own: "WRITE", other: "DENY" },
  { resource: "Candidate Statuses", role: "Recruiter", own: "READ", other: "WRITE DENY" },
  { resource: "Screening Answers", role: "Recruiter", own: "ALLOW", other: "DENY" },
  { resource: "Interviews", role: "Recruiter", own: "ALLOW", other: "DENY" },
  { resource: "Analysis", role: "Recruiter", own: "ALLOW", other: "DENY" },
  { resource: "Analysis", role: "Worker", own: "DENY", other: "DENY" },
  { resource: "Documents", role: "Recruiter", own: "ALLOW*", other: "DENY" },
] as const;
