-- Staff role names live in public.staff_roles. Existing users and user_roles rows are not rewritten.
-- Recruiter memberships stay stored as "client". Worker stays the applicant role and is not a catalog row.

CREATE TABLE public.staff_roles (
  key text PRIMARY KEY,
  label text NOT NULL,
  storage_key text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  is_admin boolean NOT NULL DEFAULT false,
  is_staff boolean NOT NULL DEFAULT true,
  is_assignable boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_roles_key_format CHECK (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT staff_roles_storage_key_format CHECK (storage_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  CONSTRAINT staff_roles_label_not_blank CHECK (char_length(btrim(label)) > 0),
  CONSTRAINT staff_roles_storage_key_unique UNIQUE (storage_key)
);

CREATE INDEX staff_roles_active_sort_idx
  ON public.staff_roles (is_active, sort_order);

DROP TRIGGER IF EXISTS trg_staff_roles_set_updated_at ON public.staff_roles;
CREATE TRIGGER trg_staff_roles_set_updated_at
  BEFORE UPDATE ON public.staff_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.staff_roles (key, label, storage_key, aliases, is_admin, is_staff, is_assignable, sort_order)
VALUES
  ('hr', 'HR', 'hr', '{}', false, true, true, 10),
  ('recruiter', 'Recruiter', 'client', '{}', false, true, true, 20),
  ('manager', 'Manager', 'manager', '{}', false, true, true, 30),
  ('finance', 'Finance', 'finance', '{}', false, true, true, 40),
  ('support', 'Support', 'support', '{}', false, true, true, 50),
  ('admin', 'Admin', 'admin', ARRAY['owner'], true, true, true, 60)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_roles_select_active ON public.staff_roles;
CREATE POLICY staff_roles_select_active
  ON public.staff_roles
  FOR SELECT
  TO authenticated
  USING (is_active);

DROP POLICY IF EXISTS staff_roles_god_admin_write ON public.staff_roles;
CREATE POLICY staff_roles_god_admin_write
  ON public.staff_roles
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_god_admin_user()))
  WITH CHECK ((SELECT public.is_god_admin_user()));

REVOKE ALL ON TABLE public.staff_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.staff_roles TO authenticated;
GRANT ALL ON TABLE public.staff_roles TO service_role;

-- The staff policy compares the enum. Drop it before the columns become text.
DROP POLICY IF EXISTS worker_references_staff ON public.worker_references;

ALTER TABLE public.users ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.users ALTER COLUMN role TYPE text USING role::text;
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'worker';

ALTER TABLE public.user_roles ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.user_roles ALTER COLUMN role TYPE text USING role::text;
ALTER TABLE public.user_roles ALTER COLUMN role SET DEFAULT 'worker';

ALTER TABLE public.staff_invitations ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.staff_invitations ALTER COLUMN role TYPE text USING role::text;
ALTER TABLE public.staff_invitations ALTER COLUMN role SET DEFAULT 'client';

CREATE POLICY worker_references_staff
  ON public.worker_references
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.staff_roles sr
        ON sr.is_active
       AND sr.is_admin
       AND (
         sr.key = ur.role
         OR sr.storage_key = ur.role
         OR ur.role = ANY (sr.aliases)
       )
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.tenant_id = worker_references.tenant_id
        AND ur.is_active = true
    )
  );

CREATE OR REPLACE FUNCTION public.user_is_tenant_staff(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.users u ON u.id = ur.user_id
    JOIN public.staff_roles sr
      ON sr.is_active
     AND sr.is_staff
     AND (
       sr.key = ur.role
       OR sr.storage_key = ur.role
       OR ur.role = ANY (sr.aliases)
     )
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.tenant_id = p_tenant_id
      AND ur.is_active = true
      AND u.is_active = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.staff_roles sr
      ON sr.is_active
     AND sr.is_staff
     AND (
       sr.key = u.role
       OR sr.storage_key = u.role
       OR u.role = ANY (sr.aliases)
     )
    WHERE u.id = (SELECT auth.uid())
      AND u.tenant_id = p_tenant_id
      AND u.is_active = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = u.id
          AND ur.tenant_id = p_tenant_id
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_is_tenant_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = (SELECT auth.uid())
      AND u.god_admin = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.users u ON u.id = ur.user_id
    JOIN public.staff_roles sr
      ON sr.is_active
     AND sr.is_admin
     AND (
       sr.key = ur.role
       OR sr.storage_key = ur.role
       OR ur.role = ANY (sr.aliases)
     )
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.tenant_id = p_tenant_id
      AND ur.is_active = true
      AND u.is_active = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.users u
    JOIN public.staff_roles sr
      ON sr.is_active
     AND sr.is_admin
     AND (
       sr.key = u.role
       OR sr.storage_key = u.role
       OR u.role = ANY (sr.aliases)
     )
    WHERE u.id = (SELECT auth.uid())
      AND u.tenant_id = p_tenant_id
      AND u.is_active = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = u.id
          AND ur.tenant_id = p_tenant_id
          AND ur.is_active = false
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.user_is_tenant_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_tenant_staff(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.user_is_tenant_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_tenant_admin(uuid) TO authenticated, service_role;

DROP TYPE public.app_role;

NOTIFY pgrst, 'reload schema';
