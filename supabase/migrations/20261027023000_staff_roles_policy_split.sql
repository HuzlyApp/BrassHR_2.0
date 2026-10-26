-- One SELECT policy, with god-admin writes split out, so role checks do not stack permissive policies.

DROP POLICY IF EXISTS staff_roles_god_admin_write ON public.staff_roles;
DROP POLICY IF EXISTS staff_roles_select_active ON public.staff_roles;
DROP POLICY IF EXISTS staff_roles_insert_god_admin ON public.staff_roles;
DROP POLICY IF EXISTS staff_roles_update_god_admin ON public.staff_roles;
DROP POLICY IF EXISTS staff_roles_delete_god_admin ON public.staff_roles;

CREATE POLICY staff_roles_select_active
  ON public.staff_roles
  FOR SELECT
  TO authenticated
  USING (is_active OR (SELECT public.is_god_admin_user()));

CREATE POLICY staff_roles_insert_god_admin
  ON public.staff_roles
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_god_admin_user()));

CREATE POLICY staff_roles_update_god_admin
  ON public.staff_roles
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_god_admin_user()))
  WITH CHECK ((SELECT public.is_god_admin_user()));

CREATE POLICY staff_roles_delete_god_admin
  ON public.staff_roles
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_god_admin_user()));
