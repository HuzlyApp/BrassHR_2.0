-- Renaming a status keeps its id. Related applications, stage lanes, and
-- history stay attached. Each name or description change is stored as a
-- version with the editor. Versions are append-only.

ALTER TABLE public.application_statuses
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS application_statuses_updated_by_idx
  ON public.application_statuses (updated_by);

CREATE TABLE IF NOT EXISTS public.application_status_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  status_id uuid NOT NULL REFERENCES public.application_statuses (id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  name text NOT NULL,
  previous_name text,
  description text,
  edited_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_status_versions_number_chk CHECK (version_number >= 1),
  CONSTRAINT application_status_versions_name_chk CHECK (length(btrim(name)) > 0),
  CONSTRAINT application_status_versions_status_version_uidx UNIQUE (status_id, version_number)
);

CREATE INDEX IF NOT EXISTS application_status_versions_tenant_status_idx
  ON public.application_status_versions (tenant_id, status_id, version_number DESC);

CREATE INDEX IF NOT EXISTS application_status_versions_edited_by_idx
  ON public.application_status_versions (edited_by);

ALTER TABLE public.application_status_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_status_versions_staff_select
  ON public.application_status_versions;
CREATE POLICY application_status_versions_staff_select
  ON public.application_status_versions
  FOR SELECT TO authenticated
  USING (public.user_is_tenant_staff(tenant_id));

GRANT SELECT ON public.application_status_versions TO authenticated;
GRANT ALL ON public.application_status_versions TO service_role;

-- Current catalog row is version 1 until the next edit.
INSERT INTO public.application_status_versions (
  tenant_id,
  status_id,
  version_number,
  name,
  previous_name,
  description,
  edited_by,
  edited_at
)
SELECT
  status.tenant_id,
  status.id,
  1,
  status.name,
  NULL,
  status.description,
  status.created_by,
  status.created_at
FROM public.application_statuses AS status
WHERE NOT EXISTS (
  SELECT 1
  FROM public.application_status_versions AS version
  WHERE version.status_id = status.id
);

CREATE OR REPLACE FUNCTION public.capture_application_status_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_version integer;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.description IS NOT DISTINCT FROM OLD.description THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('application_status_versions'),
    hashtext(NEW.id::text)
  );

  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_version
    FROM public.application_status_versions
    WHERE status_id = NEW.id;

  INSERT INTO public.application_status_versions (
    tenant_id,
    status_id,
    version_number,
    name,
    previous_name,
    description,
    edited_by,
    edited_at
  ) VALUES (
    NEW.tenant_id,
    NEW.id,
    next_version,
    NEW.name,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.name ELSE NULL END,
    NEW.description,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.created_by ELSE NEW.updated_by END,
    now()
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_application_status_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_application_status_version() FROM anon, authenticated;

DROP TRIGGER IF EXISTS capture_application_status_version_trg
  ON public.application_statuses;
CREATE TRIGGER capture_application_status_version_trg
AFTER INSERT OR UPDATE ON public.application_statuses
FOR EACH ROW
EXECUTE FUNCTION public.capture_application_status_version();

COMMENT ON TABLE public.application_status_versions IS
  'Append-only name history for an application status. The status id does not change when it is renamed.';

NOTIFY pgrst, 'reload schema';
