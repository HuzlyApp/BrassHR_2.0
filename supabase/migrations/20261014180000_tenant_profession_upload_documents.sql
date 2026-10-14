-- Certificates and licenses a tenant asks each profession to upload.
-- Scoped by tenant_professions, which already belongs to the tenant industry.

CREATE TABLE IF NOT EXISTS public.tenant_profession_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  profession_id uuid NOT NULL REFERENCES public.tenant_professions (id) ON DELETE CASCADE,
  name text NOT NULL,
  document_kind text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_profession_documents_name_not_empty CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT tenant_profession_documents_kind_chk CHECK (document_kind IN ('certificate', 'license'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_profession_documents_name_uidx
  ON public.tenant_profession_documents (tenant_id, profession_id, lower(name))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS tenant_profession_documents_profession_idx
  ON public.tenant_profession_documents (tenant_id, profession_id, sort_order)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_tenant_profession_documents_updated_at ON public.tenant_profession_documents;
CREATE TRIGGER trg_tenant_profession_documents_updated_at
BEFORE UPDATE ON public.tenant_profession_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_profession_documents_tenant ON public.tenant_profession_documents;
CREATE TRIGGER trg_tenant_profession_documents_tenant
BEFORE INSERT OR UPDATE OF profession_id, tenant_id ON public.tenant_profession_documents
FOR EACH ROW
EXECUTE FUNCTION public.profession_belongs_to_tenant();

COMMENT ON TABLE public.tenant_profession_documents IS
  'Certificate and license uploads for one tenant profession. Each row is required or optional.';

CREATE TABLE IF NOT EXISTS public.worker_profession_document_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.worker (id) ON DELETE CASCADE,
  profession_document_id uuid NOT NULL REFERENCES public.tenant_profession_documents (id) ON DELETE RESTRICT,
  file_url text NOT NULL,
  original_file_name text,
  file_type text,
  file_size bigint,
  status text NOT NULL DEFAULT 'uploaded',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_profession_document_uploads_status_chk CHECK (
    status IN ('uploaded', 'under_review', 'approved', 'rejected')
  ),
  CONSTRAINT worker_profession_document_uploads_file_not_empty CHECK (char_length(btrim(file_url)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS worker_profession_document_uploads_current_uidx
  ON public.worker_profession_document_uploads (tenant_id, worker_id, profession_document_id);

CREATE INDEX IF NOT EXISTS worker_profession_document_uploads_worker_idx
  ON public.worker_profession_document_uploads (tenant_id, worker_id, uploaded_at DESC);

DROP TRIGGER IF EXISTS trg_worker_profession_document_uploads_updated_at ON public.worker_profession_document_uploads;
CREATE TRIGGER trg_worker_profession_document_uploads_updated_at
BEFORE UPDATE ON public.worker_profession_document_uploads
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.worker_profession_document_uploads_enforce()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_doc_tenant uuid;
  v_worker_tenant uuid;
BEGIN
  SELECT d.tenant_id
  INTO v_doc_tenant
  FROM public.tenant_profession_documents d
  WHERE d.id = NEW.profession_document_id;

  IF v_doc_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Profession document does not belong to this tenant';
  END IF;

  SELECT w.tenant_id
  INTO v_worker_tenant
  FROM public.worker w
  WHERE w.id = NEW.worker_id;

  IF v_worker_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Worker does not belong to this tenant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_profession_document_uploads_enforce ON public.worker_profession_document_uploads;
CREATE TRIGGER trg_worker_profession_document_uploads_enforce
BEFORE INSERT OR UPDATE OF tenant_id, worker_id, profession_document_id
ON public.worker_profession_document_uploads
FOR EACH ROW
EXECUTE FUNCTION public.worker_profession_document_uploads_enforce();

ALTER TABLE public.tenant_profession_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_profession_document_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_profession_documents_staff_select ON public.tenant_profession_documents;
CREATE POLICY tenant_profession_documents_staff_select
  ON public.tenant_profession_documents
  FOR SELECT
  TO authenticated
  USING ((SELECT public.user_is_tenant_staff(tenant_id)));

DROP POLICY IF EXISTS tenant_profession_documents_admin_write ON public.tenant_profession_documents;
CREATE POLICY tenant_profession_documents_admin_write
  ON public.tenant_profession_documents
  FOR ALL
  TO authenticated
  USING ((SELECT public.user_is_tenant_admin(tenant_id)))
  WITH CHECK ((SELECT public.user_is_tenant_admin(tenant_id)));

DROP POLICY IF EXISTS tenant_profession_documents_applicant_select ON public.tenant_profession_documents;
CREATE POLICY tenant_profession_documents_applicant_select
  ON public.tenant_profession_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.worker w
      WHERE w.tenant_id = tenant_profession_documents.tenant_id
        AND public.approved_applicant_owns_worker(w.id)
    )
  );

DROP POLICY IF EXISTS worker_profession_document_uploads_staff ON public.worker_profession_document_uploads;
CREATE POLICY worker_profession_document_uploads_staff
  ON public.worker_profession_document_uploads
  FOR ALL
  TO authenticated
  USING ((SELECT public.user_is_tenant_staff(tenant_id)))
  WITH CHECK ((SELECT public.user_is_tenant_staff(tenant_id)));

DROP POLICY IF EXISTS worker_profession_document_uploads_applicant_select ON public.worker_profession_document_uploads;
CREATE POLICY worker_profession_document_uploads_applicant_select
  ON public.worker_profession_document_uploads
  FOR SELECT
  TO authenticated
  USING ((SELECT public.approved_applicant_owns_worker(worker_id)));

DROP POLICY IF EXISTS worker_profession_document_uploads_applicant_insert ON public.worker_profession_document_uploads;
CREATE POLICY worker_profession_document_uploads_applicant_insert
  ON public.worker_profession_document_uploads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.approved_applicant_owns_worker(worker_id))
    AND status = 'uploaded'
  );

DROP POLICY IF EXISTS worker_profession_document_uploads_applicant_update ON public.worker_profession_document_uploads;
CREATE POLICY worker_profession_document_uploads_applicant_update
  ON public.worker_profession_document_uploads
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.approved_applicant_owns_worker(worker_id)))
  WITH CHECK (
    (SELECT public.approved_applicant_owns_worker(worker_id))
    AND status IN ('uploaded', 'under_review')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_profession_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.worker_profession_document_uploads TO authenticated;
GRANT ALL ON public.tenant_profession_documents TO service_role;
GRANT ALL ON public.worker_profession_document_uploads TO service_role;

CREATE OR REPLACE FUNCTION public.seed_profession_upload_documents(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tenant_profession_documents (
    tenant_id,
    profession_id,
    name,
    document_kind,
    is_required,
    sort_order
  )
  SELECT
    p.tenant_id,
    p.id,
    v.name,
    v.document_kind,
    v.is_required,
    v.sort_order
  FROM public.tenant_professions p
  CROSS JOIN (
    VALUES
      ('Nursing license'::text, 'license'::text, true, 10),
      ('CPR'::text, 'certificate'::text, true, 20),
      ('BLS'::text, 'certificate'::text, true, 30),
      ('ACLS'::text, 'certificate'::text, false, 40),
      ('Driver license'::text, 'license'::text, true, 50)
  ) AS v(name, document_kind, is_required, sort_order)
  WHERE p.tenant_id = p_tenant_id
    AND p.catalog_key = 'nursing'
    AND p.is_active = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.tenant_profession_documents existing
      WHERE existing.profession_id = p.id
        AND lower(existing.name) = lower(v.name)
        AND existing.is_active = true
    );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_profession_upload_documents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_profession_upload_documents(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.seed_tenant_professions_on_industry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.primary_industry_key IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.primary_industry_key IS NOT DISTINCT FROM OLD.primary_industry_key THEN
    RETURN NEW;
  END IF;
  PERFORM public.seed_tenant_profession_catalog(NEW.id);
  PERFORM public.seed_profession_upload_documents(NEW.id);
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_tenant uuid;
BEGIN
  FOR v_tenant IN
    SELECT id FROM public.tenants WHERE primary_industry_key IS NOT NULL
  LOOP
    PERFORM public.seed_profession_upload_documents(v_tenant);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
