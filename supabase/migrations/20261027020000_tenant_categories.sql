-- One product category per tenant. Staffing is the default for every existing
-- tenant and for tenants created later. SMB is stored only when assigned explicitly.

CREATE TABLE IF NOT EXISTS public.tenant_categories (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants (id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'Staffing',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_categories_category_check CHECK (category IN ('Staffing', 'SMB'))
);

COMMENT ON TABLE public.tenant_categories IS
  'One product category per tenant. Staffing is the default; SMB is assigned explicitly.';
COMMENT ON COLUMN public.tenant_categories.category IS
  'Staffing or SMB. New and backfilled tenants use Staffing unless SMB is set explicitly.';

-- tenant_id is the primary key, so the foreign key is already indexed.
CREATE INDEX IF NOT EXISTS tenant_categories_category_idx
  ON public.tenant_categories (category);

CREATE OR REPLACE FUNCTION public.assign_default_tenant_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tenant_categories (tenant_id)
  VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.assign_default_tenant_category() IS
  'Inserts the Staffing category for a new tenant. Does not change an existing category.';

REVOKE ALL ON FUNCTION public.assign_default_tenant_category() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_default_tenant_category() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_default_tenant_category() TO service_role;

DROP TRIGGER IF EXISTS trg_tenants_assign_default_category ON public.tenants;
CREATE TRIGGER trg_tenants_assign_default_category
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_default_tenant_category();

CREATE OR REPLACE FUNCTION public.tenant_categories_guard_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_categories.tenant_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tenant_categories_guard_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_categories_guard_tenant_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.tenant_categories_guard_tenant_id() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_tenant_categories_guard_tenant_id ON public.tenant_categories;
CREATE TRIGGER trg_tenant_categories_guard_tenant_id
  BEFORE UPDATE ON public.tenant_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.tenant_categories_guard_tenant_id();

DROP TRIGGER IF EXISTS trg_tenant_categories_set_updated_at ON public.tenant_categories;
CREATE TRIGGER trg_tenant_categories_set_updated_at
  BEFORE UPDATE ON public.tenant_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.tenant_categories (tenant_id)
SELECT t.id
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tenant_categories c
  WHERE c.tenant_id = t.id
);

ALTER TABLE public.tenant_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_categories_select_member ON public.tenant_categories;
CREATE POLICY tenant_categories_select_member
  ON public.tenant_categories
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.is_god_admin_user())
    OR tenant_id = (SELECT public.current_tenant_id())
    OR public.user_is_tenant_staff(tenant_id)
  );

DROP POLICY IF EXISTS tenant_categories_insert_god_admin ON public.tenant_categories;
CREATE POLICY tenant_categories_insert_god_admin
  ON public.tenant_categories
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_god_admin_user()));

DROP POLICY IF EXISTS tenant_categories_update_god_admin ON public.tenant_categories;
CREATE POLICY tenant_categories_update_god_admin
  ON public.tenant_categories
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_god_admin_user()))
  WITH CHECK ((SELECT public.is_god_admin_user()));

-- Default privileges grant every Data API role full access to new public tables.
REVOKE ALL ON TABLE public.tenant_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.tenant_categories TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.tenant_categories TO authenticated;
GRANT ALL ON TABLE public.tenant_categories TO service_role;

NOTIFY pgrst, 'reload schema';
