-- Expiry flag on profession upload documents, and up to 5 files per upload.

ALTER TABLE public.tenant_profession_documents
  ADD COLUMN IF NOT EXISTS has_expiration boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tenant_profession_documents.has_expiration IS
  'When true, applicants must provide an expiry date when uploading this license or certificate.';

UPDATE public.tenant_profession_documents
SET has_expiration = true
WHERE has_expiration = false
  AND document_kind IN ('license', 'certificate')
  AND lower(name) IN (
    'nursing license',
    'cpr',
    'bls',
    'acls',
    'driver license'
  );

ALTER TABLE public.worker_profession_document_uploads
  ADD COLUMN IF NOT EXISTS issued_date date,
  ADD COLUMN IF NOT EXISTS expiry_date date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'worker_profession_document_uploads_date_order_chk'
      AND conrelid = 'public.worker_profession_document_uploads'::regclass
  ) THEN
    ALTER TABLE public.worker_profession_document_uploads
      ADD CONSTRAINT worker_profession_document_uploads_date_order_chk
      CHECK (
        issued_date IS NULL
        OR expiry_date IS NULL
        OR expiry_date >= issued_date
      );
  END IF;
END $$;

DROP INDEX IF EXISTS public.worker_profession_document_uploads_current_uidx;

CREATE INDEX IF NOT EXISTS worker_profession_document_uploads_doc_idx
  ON public.worker_profession_document_uploads (tenant_id, worker_id, profession_document_id, uploaded_at DESC);

CREATE OR REPLACE FUNCTION public.worker_profession_document_uploads_enforce()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_doc public.tenant_profession_documents%ROWTYPE;
  v_worker_tenant uuid;
  v_count integer;
BEGIN
  SELECT *
  INTO v_doc
  FROM public.tenant_profession_documents d
  WHERE d.id = NEW.profession_document_id;

  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Profession document was not found';
  END IF;

  IF v_doc.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Profession document does not belong to this tenant';
  END IF;

  SELECT w.tenant_id
  INTO v_worker_tenant
  FROM public.worker w
  WHERE w.id = NEW.worker_id;

  IF v_worker_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Worker does not belong to this tenant';
  END IF;

  IF v_doc.has_expiration AND (NEW.issued_date IS NULL OR NEW.expiry_date IS NULL) THEN
    RAISE EXCEPTION 'Issued date and expiry date are required';
  END IF;

  IF NEW.issued_date IS NOT NULL AND NEW.expiry_date IS NOT NULL AND NEW.expiry_date < NEW.issued_date THEN
    RAISE EXCEPTION 'Expiry date must be on or after the issued date';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT COUNT(*)::integer
    INTO v_count
    FROM public.worker_profession_document_uploads u
    WHERE u.tenant_id = NEW.tenant_id
      AND u.worker_id = NEW.worker_id
      AND u.profession_document_id = NEW.profession_document_id;

    IF v_count >= 5 THEN
      RAISE EXCEPTION 'You can upload at most 5 files for this document';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_profession_document_uploads_enforce ON public.worker_profession_document_uploads;
CREATE TRIGGER trg_worker_profession_document_uploads_enforce
BEFORE INSERT OR UPDATE OF tenant_id, worker_id, profession_document_id, issued_date, expiry_date
ON public.worker_profession_document_uploads
FOR EACH ROW
EXECUTE FUNCTION public.worker_profession_document_uploads_enforce();

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
    has_expiration,
    sort_order
  )
  SELECT
    p.tenant_id,
    p.id,
    v.name,
    v.document_kind,
    v.is_required,
    v.has_expiration,
    v.sort_order
  FROM public.tenant_professions p
  CROSS JOIN (
    VALUES
      ('Nursing license'::text, 'license'::text, true, true, 10),
      ('CPR'::text, 'certificate'::text, true, true, 20),
      ('BLS'::text, 'certificate'::text, true, true, 30),
      ('ACLS'::text, 'certificate'::text, false, true, 40),
      ('Driver license'::text, 'license'::text, true, true, 50)
  ) AS v(name, document_kind, is_required, has_expiration, sort_order)
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

NOTIFY pgrst, 'reload schema';
