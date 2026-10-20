-- Links a candidate's application to the profession whose upload documents
-- appear on Documents attachments.

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS tenant_profession_id uuid REFERENCES public.tenant_professions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS job_applications_tenant_profession_idx
  ON public.job_applications (tenant_id, worker_id, tenant_profession_id)
  WHERE tenant_profession_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.job_applications_profession_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_profession_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_professions p
    WHERE p.id = NEW.tenant_profession_id
      AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Profession does not belong to this tenant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_applications_profession_tenant ON public.job_applications;
CREATE TRIGGER trg_job_applications_profession_tenant
BEFORE INSERT OR UPDATE OF tenant_profession_id, tenant_id ON public.job_applications
FOR EACH ROW
EXECUTE FUNCTION public.job_applications_profession_same_tenant();

NOTIFY pgrst, 'reload schema';
