-- Tenant-scoped sidebar and Settings permissions.
--
-- Legacy mapping (View/Create/Edit/Delete/Approve/Manage were never stored):
--   Create and Approve fold into Edit.
--   Manage folds into Edit on settings_company, granted to system admin only.
--   System admin (staff_roles.is_admin) receives view, edit, and delete on every
--   configurable resource so existing administrators keep full access.
--   Other seeded staff roles receive view, edit, and delete only on the modules
--   and Settings sections they could already open (hiring, people, organization,
--   jobs, scheduling, mail, chat, personal settings, notifications, help, reports).
--   They do not receive company settings, automation, or templates.
--   Dashboard is always_granted and has no permission rows.

CREATE TABLE IF NOT EXISTS public.permission_resources (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind text NOT NULL,
  parent_key text,
  page_prefixes text[] NOT NULL DEFAULT '{}',
  api_prefixes text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  always_granted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permission_resources_key_format CHECK (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT permission_resources_kind CHECK (kind IN ('module', 'settings_section')),
  CONSTRAINT permission_resources_label_not_blank CHECK (char_length(btrim(label)) > 0)
);

CREATE TABLE IF NOT EXISTS public.tenant_roles (
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  role_key text NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role_key),
  CONSTRAINT tenant_roles_key_format CHECK (role_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT tenant_roles_label_not_blank CHECK (char_length(btrim(label)) > 0)
);

CREATE INDEX IF NOT EXISTS tenant_roles_tenant_idx ON public.tenant_roles (tenant_id);

DROP TRIGGER IF EXISTS trg_tenant_roles_set_updated_at ON public.tenant_roles;
CREATE TRIGGER trg_tenant_roles_set_updated_at
  BEFORE UPDATE ON public.tenant_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.tenant_role_permissions (
  tenant_id uuid NOT NULL,
  role_key text NOT NULL,
  resource_key text NOT NULL REFERENCES public.permission_resources (key) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, role_key, resource_key),
  CONSTRAINT tenant_role_permissions_role_fk
    FOREIGN KEY (tenant_id, role_key)
    REFERENCES public.tenant_roles (tenant_id, role_key)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tenant_role_permissions_lookup_idx
  ON public.tenant_role_permissions (tenant_id, role_key);

DROP TRIGGER IF EXISTS trg_tenant_role_permissions_set_updated_at ON public.tenant_role_permissions;
CREATE TRIGGER trg_tenant_role_permissions_set_updated_at
  BEFORE UPDATE ON public.tenant_role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permission_resources
  (key, label, description, kind, parent_key, page_prefixes, api_prefixes, sort_order, always_granted)
VALUES
  ('dashboard', 'Dashboard', 'View dashboard and summary.', 'module', NULL,
    ARRAY['/admin_recruiter/home', '/admin_recruiter/dashboard'],
    ARRAY['/api/admin/dashboard-overview', '/api/admin/dashboard-analytics'], 10, true),
  ('hiring', 'Hiring', 'View and manage applicants.', 'module', NULL,
    ARRAY['/admin_recruiter/candidates', '/admin_recruiter/applications', '/admin_recruiter/calendar', '/admin_recruiter/pending', '/admin_recruiter/approved', '/admin_recruiter/approved-pending-conversion', '/admin_recruiter/disapproved', '/admin_recruiter/pre-approval', '/admin_recruiter/advanced-search', '/admin_recruiter/advanced-detail', '/admin_recruiter/new'],
    ARRAY['/api/admin/job-applications', '/api/admin/candidates', '/api/admin/add-candidate-from-resume', '/api/admin/applicant-appointments', '/api/admin/application-statuses', '/api/admin/application-status-groups', '/api/admin/application-status-stage-assignments', '/api/admin/hiring-area', '/api/admin/stage-context-notes', '/api/admin/skill-assessment-pdf', '/api/admin/skill-assessment-results', '/api/admin/match-analysis'], 20, false),
  ('people', 'People', 'View and manage workers and managers.', 'module', NULL,
    ARRAY['/admin_recruiter/workers', '/admin_recruiter/managers'],
    ARRAY['/api/admin/workers', '/api/admin/employment-workers', '/api/admin/team-members', '/api/admin/worker-*'], 30, false),
  ('organization', 'Organization', 'Manage facilities and locations.', 'module', NULL,
    ARRAY['/admin_recruiter/facilities'],
    ARRAY['/api/admin/facilities', '/api/admin/facility-assignments'], 40, false),
  ('jobs', 'Jobs', 'Create and manage job orders.', 'module', NULL,
    ARRAY['/admin_recruiter/jobs'],
    ARRAY['/api/admin/jobs', '/api/admin/job-options', '/api/admin/professions'], 50, false),
  ('scheduling', 'Scheduling', 'Manage schedules and shifts.', 'module', NULL,
    ARRAY['/admin_recruiter/calendar/shifts', '/admin_recruiter/attendance', '/admin_recruiter/scheduling'],
    ARRAY['/api/admin/shift-calendar', '/api/admin/applicant-attendance'], 60, false),
  ('mail', 'Mail', 'View and manage mail.', 'module', NULL,
    ARRAY['/admin_recruiter/mail'],
    ARRAY['/api/admin/mail'], 70, false),
  ('chat', 'Chat', 'View and manage messages.', 'module', NULL,
    ARRAY['/admin_recruiter/messages'],
    ARRAY['/api/admin/messages'], 80, false),
  ('settings_company', 'Company settings', 'Manage organization settings, branding, and roles.', 'settings_section', NULL,
    ARRAY['/admin_recruiter/settings'],
    ARRAY['/api/admin/users', '/api/admin/roles', '/api/admin/branding', '/api/admin/business-info', '/api/admin/assessment-settings', '/api/admin/hire-journey-theme', '/api/admin/profession-documents', '/api/admin/tenant-firma-settings', '/api/admin/tenants'], 110, false),
  ('settings_profile', 'Personal settings', 'View and edit the signed-in profile.', 'settings_section', NULL,
    ARRAY['/admin_recruiter/account'],
    ARRAY['/api/account/settings'], 120, false),
  ('settings_notifications', 'Notifications', 'View notification settings.', 'settings_section', NULL,
    ARRAY['/admin_recruiter/notifications'],
    ARRAY[]::text[], 130, false),
  ('settings_help', 'Help & Support', 'View help and support.', 'settings_section', NULL,
    ARRAY['/admin_recruiter/help-support', '/admin_recruiter/support-tickets', '/admin_recruiter/tickets'],
    ARRAY['/api/admin/faqs'], 140, false),
  ('settings_reports', 'Reports', 'View reports and analytics.', 'settings_section', NULL,
    ARRAY['/admin_recruiter/reports'],
    ARRAY[]::text[], 150, false),
  ('settings_automation', 'Automation', 'Manage workflows and onboarding automation.', 'settings_section', NULL,
    ARRAY['/admin_recruiter/dashboard/onboarding-builder', '/admin_recruiter/dashboard/onboarding-flows', '/admin_recruiter/dashboard/templates', '/admin_recruiter/dashboard/workflow-mappings', '/admin_recruiter/dashboard/workflowlibrary'],
    ARRAY['/api/admin/onboarding', '/api/admin/onboarding-builder', '/api/admin/onboarding-flows', '/api/admin/onboarding-libraries', '/api/admin/workflow-mappings', '/api/admin/workflow-templates'], 160, false),
  ('settings_templates', 'Templates', 'Manage document and email templates.', 'settings_section', NULL,
    ARRAY['/admin_recruiter/template-builder', '/admin_recruiter/email-templates'],
    ARRAY['/api/admin/email-templates', '/api/admin/recruiter-templates'], 170, false)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_tenant_role_access(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.tenant_roles (tenant_id, role_key, label, description, is_system, is_admin)
  SELECT p_tenant_id, sr.key, sr.label, '', true, sr.is_admin
  FROM public.staff_roles sr
  WHERE sr.is_active
    AND sr.is_staff
  ON CONFLICT (tenant_id, role_key) DO NOTHING;

  INSERT INTO public.tenant_role_permissions (tenant_id, role_key, resource_key, can_view, can_edit, can_delete)
  SELECT tr.tenant_id, tr.role_key, pr.key, true, true, true
  FROM public.tenant_roles tr
  JOIN public.permission_resources pr ON pr.always_granted = false
  WHERE tr.tenant_id = p_tenant_id
    AND tr.is_system
    AND tr.is_admin
  ON CONFLICT (tenant_id, role_key, resource_key) DO NOTHING;

  INSERT INTO public.tenant_role_permissions (tenant_id, role_key, resource_key, can_view, can_edit, can_delete)
  SELECT tr.tenant_id, tr.role_key, pr.key, true, true, true
  FROM public.tenant_roles tr
  JOIN public.permission_resources pr
    ON pr.always_granted = false
   AND pr.key = ANY (ARRAY[
     'hiring',
     'people',
     'organization',
     'jobs',
     'scheduling',
     'mail',
     'chat',
     'settings_profile',
     'settings_notifications',
     'settings_help',
     'settings_reports'
   ]::text[])
  WHERE tr.tenant_id = p_tenant_id
    AND tr.is_system
    AND tr.is_admin = false
  ON CONFLICT (tenant_id, role_key, resource_key) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.seed_tenant_role_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_tenant_role_access(uuid) TO service_role;

SELECT public.seed_tenant_role_access(id) FROM public.tenants;

CREATE OR REPLACE FUNCTION public.trg_tenants_seed_role_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.seed_tenant_role_access(NEW.id);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_tenants_seed_role_access() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_tenants_seed_role_access ON public.tenants;
CREATE TRIGGER trg_tenants_seed_role_access
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_tenants_seed_role_access();

ALTER TABLE public.permission_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_resources FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_role_permissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permission_resources_select_authenticated ON public.permission_resources;
CREATE POLICY permission_resources_select_authenticated
  ON public.permission_resources
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS tenant_roles_select_tenant_staff ON public.tenant_roles;
CREATE POLICY tenant_roles_select_tenant_staff
  ON public.tenant_roles
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_god_admin_user())
    OR (SELECT public.user_is_tenant_staff(tenant_id))
  );

DROP POLICY IF EXISTS tenant_role_permissions_select_tenant_staff ON public.tenant_role_permissions;
CREATE POLICY tenant_role_permissions_select_tenant_staff
  ON public.tenant_role_permissions
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_god_admin_user())
    OR (SELECT public.user_is_tenant_staff(tenant_id))
  );

REVOKE ALL ON TABLE public.permission_resources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_roles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_role_permissions FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.permission_resources TO authenticated;
GRANT SELECT ON TABLE public.tenant_roles TO authenticated;
GRANT SELECT ON TABLE public.tenant_role_permissions TO authenticated;

GRANT ALL ON TABLE public.permission_resources TO service_role;
GRANT ALL ON TABLE public.tenant_roles TO service_role;
GRANT ALL ON TABLE public.tenant_role_permissions TO service_role;

COMMENT ON TABLE public.permission_resources IS 'Sidebar modules and Settings sections. Dashboard is always_granted and is not a role-matrix row.';
COMMENT ON TABLE public.tenant_roles IS 'Per-tenant staff roles. System rows are copied from staff_roles; custom rows are created in Company settings.';
COMMENT ON TABLE public.tenant_role_permissions IS 'View, edit, and delete grants. Edit does not imply delete.';
