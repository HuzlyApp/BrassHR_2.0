-- Profession, workflow, and document catalog.
-- Extends the live schema. Does not replace professions, job_categories,
-- tenant_required_documents, worker_submitted_documents, or worker_license_records.
--
-- Live columns already cover part of the job link:
--   job_requisitions.profession_id -> professions(id)
--   job_requisitions.workflow_id   -> onboarding_flows(id)
--   job_requisitions.job_role      text label
-- This migration adds tenant_professions for the industry list, job_role_id,
-- and onboarding_flows.profession_id. It does not add a second profession_id
-- or an onboarding_flow_id duplicate of workflow_id.

-- ---------------------------------------------------------------------------
-- Platform starters. No tenant_id.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profession_catalog (
  key text PRIMARY KEY,
  industry_key text NOT NULL REFERENCES public.industry_catalog (key),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT profession_catalog_key_format CHECK (key ~ '^[a-z][a-z0-9_]{1,62}$'),
  CONSTRAINT profession_catalog_name_not_empty CHECK (char_length(btrim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS profession_catalog_industry_idx
  ON public.profession_catalog (industry_key, name)
  WHERE is_active = true;

COMMENT ON TABLE public.profession_catalog IS
  'Platform profession starters for an industry. Tenants copy these into tenant_professions.';

-- ---------------------------------------------------------------------------
-- Tenant profession list. Server sets tenant_id.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tenant_professions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  industry_key text NOT NULL REFERENCES public.industry_catalog (key),
  catalog_key text REFERENCES public.profession_catalog (key),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_professions_name_not_empty CHECK (char_length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_professions_name_uidx
  ON public.tenant_professions (tenant_id, industry_key, lower(name));

CREATE INDEX IF NOT EXISTS tenant_professions_tenant_idx
  ON public.tenant_professions (tenant_id, is_active, name);

CREATE INDEX IF NOT EXISTS tenant_professions_catalog_idx
  ON public.tenant_professions (catalog_key)
  WHERE catalog_key IS NOT NULL;

DROP TRIGGER IF EXISTS trg_tenant_professions_updated_at ON public.tenant_professions;
CREATE TRIGGER trg_tenant_professions_updated_at
BEFORE UPDATE ON public.tenant_professions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.tenant_professions_match_industry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_industry text;
BEGIN
  SELECT t.primary_industry_key
  INTO v_industry
  FROM public.tenants t
  WHERE t.id = NEW.tenant_id;

  IF v_industry IS NULL OR NEW.industry_key IS DISTINCT FROM v_industry THEN
    RAISE EXCEPTION 'Profession industry must match the tenant industry';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_professions_match_industry ON public.tenant_professions;
CREATE TRIGGER trg_tenant_professions_match_industry
BEFORE INSERT OR UPDATE OF tenant_id, industry_key ON public.tenant_professions
FOR EACH ROW
EXECUTE FUNCTION public.tenant_professions_match_industry();

-- ---------------------------------------------------------------------------
-- Existing tables: profession link and job role link
-- ---------------------------------------------------------------------------

ALTER TABLE public.job_roles
  ADD COLUMN IF NOT EXISTS profession_id uuid REFERENCES public.tenant_professions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS job_roles_profession_idx
  ON public.job_roles (profession_id)
  WHERE profession_id IS NOT NULL;

ALTER TABLE public.onboarding_flows
  ADD COLUMN IF NOT EXISTS profession_id uuid REFERENCES public.tenant_professions (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS onboarding_flows_profession_idx
  ON public.onboarding_flows (tenant_id, profession_id)
  WHERE profession_id IS NOT NULL;

ALTER TABLE public.job_requisitions
  ADD COLUMN IF NOT EXISTS job_role_id uuid REFERENCES public.job_roles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS job_requisitions_job_role_idx
  ON public.job_requisitions (job_role_id)
  WHERE job_role_id IS NOT NULL;

COMMENT ON COLUMN public.job_requisitions.job_role_id IS
  'Tenant job role. job_role text stays as the display label.';
COMMENT ON COLUMN public.job_requisitions.workflow_id IS
  'Published onboarding flow for this job. Apply reads that flow''s document list.';
COMMENT ON COLUMN public.onboarding_flows.profession_id IS
  'Tenant profession for this flow. Required when a user saves a new employment-typed flow.';

CREATE OR REPLACE FUNCTION public.profession_belongs_to_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.profession_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_professions p
    WHERE p.id = NEW.profession_id
      AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Profession does not belong to this tenant';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_flows_profession_tenant ON public.onboarding_flows;
CREATE TRIGGER trg_onboarding_flows_profession_tenant
BEFORE INSERT OR UPDATE OF profession_id, tenant_id ON public.onboarding_flows
FOR EACH ROW
EXECUTE FUNCTION public.profession_belongs_to_tenant();

DROP TRIGGER IF EXISTS trg_job_roles_profession_tenant ON public.job_roles;
CREATE TRIGGER trg_job_roles_profession_tenant
BEFORE INSERT OR UPDATE OF profession_id, tenant_id ON public.job_roles
FOR EACH ROW
EXECUTE FUNCTION public.profession_belongs_to_tenant();

-- ---------------------------------------------------------------------------
-- Documents on one workflow
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workflow_required_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.onboarding_flows (id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  has_expiration boolean NOT NULL DEFAULT false,
  collect_issuing_organization boolean NOT NULL DEFAULT false,
  collect_scope boolean NOT NULL DEFAULT false,
  collect_validity boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_required_documents_code_format CHECK (code ~ '^[A-Z][A-Z0-9_]{1,62}$'),
  CONSTRAINT workflow_required_documents_name_not_empty CHECK (char_length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_required_documents_code_uidx
  ON public.workflow_required_documents (tenant_id, flow_id, code);

CREATE INDEX IF NOT EXISTS workflow_required_documents_flow_idx
  ON public.workflow_required_documents (tenant_id, flow_id, sort_order)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_workflow_required_documents_updated_at ON public.workflow_required_documents;
CREATE TRIGGER trg_workflow_required_documents_updated_at
BEFORE UPDATE ON public.workflow_required_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.workflow_required_documents_same_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.onboarding_flows f
    WHERE f.id = NEW.flow_id
      AND f.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Workflow does not belong to this tenant';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workflow_required_documents_tenant ON public.workflow_required_documents;
CREATE TRIGGER trg_workflow_required_documents_tenant
BEFORE INSERT OR UPDATE OF flow_id, tenant_id ON public.workflow_required_documents
FOR EACH ROW
EXECUTE FUNCTION public.workflow_required_documents_same_tenant();

-- ---------------------------------------------------------------------------
-- One current credential row per worker per required document
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.worker_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.worker (id) ON DELETE CASCADE,
  required_document_id uuid NOT NULL REFERENCES public.workflow_required_documents (id) ON DELETE RESTRICT,
  application_id uuid,
  license_name text NOT NULL,
  issuing_organization text,
  scope text,
  validity text,
  issued_date date,
  expiry_date date,
  document_url text,
  storage_path text,
  original_file_name text,
  file_type text,
  file_size bigint,
  status text NOT NULL DEFAULT 'uploaded',
  review_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_credentials_status_chk CHECK (
    status IN (
      'uploaded',
      'under_review',
      'approved',
      'rejected',
      'needs_revision',
      'expired'
    )
  ),
  CONSTRAINT worker_credentials_name_not_empty CHECK (char_length(btrim(license_name)) > 0),
  CONSTRAINT worker_credentials_date_order_chk CHECK (
    issued_date IS NULL OR expiry_date IS NULL OR expiry_date >= issued_date
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS worker_credentials_current_uidx
  ON public.worker_credentials (tenant_id, worker_id, required_document_id);

CREATE INDEX IF NOT EXISTS worker_credentials_worker_idx
  ON public.worker_credentials (tenant_id, worker_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS worker_credentials_document_idx
  ON public.worker_credentials (required_document_id);

DROP TRIGGER IF EXISTS trg_worker_credentials_updated_at ON public.worker_credentials;
CREATE TRIGGER trg_worker_credentials_updated_at
BEFORE UPDATE ON public.worker_credentials
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.worker_credentials_enforce_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_doc public.workflow_required_documents%ROWTYPE;
  v_worker_tenant uuid;
BEGIN
  SELECT *
  INTO v_doc
  FROM public.workflow_required_documents d
  WHERE d.id = NEW.required_document_id
    AND d.tenant_id = NEW.tenant_id;

  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'Required document was not found for this tenant';
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

  IF NEW.license_name IS NULL OR char_length(btrim(NEW.license_name)) = 0 THEN
    NEW.license_name := v_doc.name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_credentials_enforce_rules ON public.worker_credentials;
CREATE TRIGGER trg_worker_credentials_enforce_rules
BEFORE INSERT OR UPDATE ON public.worker_credentials
FOR EACH ROW
EXECUTE FUNCTION public.worker_credentials_enforce_rules();

-- ---------------------------------------------------------------------------
-- Flow-scoped status catalog. Existing application_statuses stay tenant-wide.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workflow_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  flow_id uuid NOT NULL REFERENCES public.onboarding_flows (id) ON DELETE CASCADE,
  stage_code text NOT NULL,
  status_code text NOT NULL,
  name text NOT NULL,
  status_role text NOT NULL,
  rank integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_statuses_stage_chk CHECK (
    stage_code IN ('INTAKE', 'SCREENING', 'INTERVIEW', 'SUBMISSION', 'COMPLIANCE', 'OFFER')
  ),
  CONSTRAINT workflow_statuses_code_format CHECK (status_code ~ '^[A-Z][A-Z0-9_]{1,62}$'),
  CONSTRAINT workflow_statuses_name_not_empty CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT workflow_statuses_role_chk CHECK (status_role IN ('PRIMARY', 'ALTERNATE', 'CLOSE')),
  CONSTRAINT workflow_statuses_rank_chk CHECK (
    (status_role = 'PRIMARY' AND rank IS NOT NULL AND rank >= 1)
    OR (status_role <> 'PRIMARY' AND rank IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_statuses_code_uidx
  ON public.workflow_statuses (tenant_id, flow_id, status_code);

CREATE INDEX IF NOT EXISTS workflow_statuses_flow_idx
  ON public.workflow_statuses (tenant_id, flow_id, stage_code, rank);

DROP TRIGGER IF EXISTS trg_workflow_statuses_updated_at ON public.workflow_statuses;
CREATE TRIGGER trg_workflow_statuses_updated_at
BEFORE UPDATE ON public.workflow_statuses
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_workflow_statuses_tenant ON public.workflow_statuses;
CREATE TRIGGER trg_workflow_statuses_tenant
BEFORE INSERT OR UPDATE OF flow_id, tenant_id ON public.workflow_statuses
FOR EACH ROW
EXECUTE FUNCTION public.workflow_required_documents_same_tenant();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.profession_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_professions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_required_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profession_catalog_read ON public.profession_catalog;
CREATE POLICY profession_catalog_read
  ON public.profession_catalog
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS tenant_professions_staff_select ON public.tenant_professions;
CREATE POLICY tenant_professions_staff_select
  ON public.tenant_professions
  FOR SELECT
  TO authenticated
  USING ((SELECT public.user_is_tenant_staff(tenant_id)));

DROP POLICY IF EXISTS tenant_professions_admin_write ON public.tenant_professions;
CREATE POLICY tenant_professions_admin_write
  ON public.tenant_professions
  FOR ALL
  TO authenticated
  USING ((SELECT public.user_is_tenant_admin(tenant_id)))
  WITH CHECK ((SELECT public.user_is_tenant_admin(tenant_id)));

DROP POLICY IF EXISTS workflow_required_documents_staff_select ON public.workflow_required_documents;
CREATE POLICY workflow_required_documents_staff_select
  ON public.workflow_required_documents
  FOR SELECT
  TO authenticated
  USING ((SELECT public.user_is_tenant_staff(tenant_id)));

DROP POLICY IF EXISTS workflow_required_documents_admin_write ON public.workflow_required_documents;
CREATE POLICY workflow_required_documents_admin_write
  ON public.workflow_required_documents
  FOR ALL
  TO authenticated
  USING ((SELECT public.user_is_tenant_admin(tenant_id)))
  WITH CHECK ((SELECT public.user_is_tenant_admin(tenant_id)));

DROP POLICY IF EXISTS workflow_required_documents_applicant_select ON public.workflow_required_documents;
CREATE POLICY workflow_required_documents_applicant_select
  ON public.workflow_required_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.worker w
      WHERE w.tenant_id = workflow_required_documents.tenant_id
        AND public.approved_applicant_owns_worker(w.id)
    )
  );

DROP POLICY IF EXISTS worker_credentials_staff ON public.worker_credentials;
CREATE POLICY worker_credentials_staff
  ON public.worker_credentials
  FOR ALL
  TO authenticated
  USING ((SELECT public.user_is_tenant_staff(tenant_id)))
  WITH CHECK ((SELECT public.user_is_tenant_staff(tenant_id)));

DROP POLICY IF EXISTS worker_credentials_applicant_select ON public.worker_credentials;
CREATE POLICY worker_credentials_applicant_select
  ON public.worker_credentials
  FOR SELECT
  TO authenticated
  USING ((SELECT public.approved_applicant_owns_worker(worker_id)));

DROP POLICY IF EXISTS worker_credentials_applicant_insert ON public.worker_credentials;
CREATE POLICY worker_credentials_applicant_insert
  ON public.worker_credentials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT public.approved_applicant_owns_worker(worker_id))
    AND status IN ('uploaded', 'under_review')
  );

DROP POLICY IF EXISTS worker_credentials_applicant_update ON public.worker_credentials;
CREATE POLICY worker_credentials_applicant_update
  ON public.worker_credentials
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.approved_applicant_owns_worker(worker_id)))
  WITH CHECK (
    (SELECT public.approved_applicant_owns_worker(worker_id))
    AND status IN ('uploaded', 'under_review', 'needs_revision')
  );

DROP POLICY IF EXISTS workflow_statuses_staff_select ON public.workflow_statuses;
CREATE POLICY workflow_statuses_staff_select
  ON public.workflow_statuses
  FOR SELECT
  TO authenticated
  USING ((SELECT public.user_is_tenant_staff(tenant_id)));

DROP POLICY IF EXISTS workflow_statuses_admin_write ON public.workflow_statuses;
CREATE POLICY workflow_statuses_admin_write
  ON public.workflow_statuses
  FOR ALL
  TO authenticated
  USING ((SELECT public.user_is_tenant_admin(tenant_id)))
  WITH CHECK ((SELECT public.user_is_tenant_admin(tenant_id)));

GRANT SELECT ON public.profession_catalog TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_professions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_required_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.worker_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_statuses TO authenticated;
GRANT ALL ON public.profession_catalog TO service_role;
GRANT ALL ON public.tenant_professions TO service_role;
GRANT ALL ON public.workflow_required_documents TO service_role;
GRANT ALL ON public.worker_credentials TO service_role;
GRANT ALL ON public.workflow_statuses TO service_role;

-- ---------------------------------------------------------------------------
-- Starters for the industries already in industry_catalog
-- ---------------------------------------------------------------------------

INSERT INTO public.profession_catalog (key, industry_key, name) VALUES
  ('nursing', 'healthcare', 'Nursing'),
  ('pharmacy', 'healthcare', 'Pharmacy'),
  ('office_admin', 'healthcare', 'Office Admin'),
  ('home_health_aide', 'home_care', 'Home Health Aide'),
  ('caregiver', 'home_care', 'Caregiver'),
  ('physical_therapist', 'allied_health', 'Physical Therapist'),
  ('medical_assistant', 'allied_health', 'Medical Assistant'),
  ('medication_aide', 'senior_care', 'Medication Aide'),
  ('caregiver_senior', 'senior_care', 'Caregiver'),
  ('server', 'hospitality', 'Server'),
  ('cook', 'hospitality', 'Cook'),
  ('cashier', 'retail', 'Cashier'),
  ('software_developer', 'technology', 'Software Developer'),
  ('it_support', 'technology', 'IT Support'),
  ('electrician', 'trades', 'Electrician'),
  ('janitor', 'cleaning', 'Janitor'),
  ('teacher', 'childcare', 'Teacher'),
  ('program_coordinator', 'nonprofit', 'Program Coordinator'),
  ('forklift_operator', 'warehouse', 'Forklift Operator'),
  ('warehouse_associate', 'warehouse', 'Warehouse Associate'),
  ('driver', 'transportation', 'Driver'),
  ('accountant', 'professional', 'Accountant'),
  ('stylist', 'beauty', 'Stylist'),
  ('trainer', 'fitness', 'Trainer'),
  ('general_staff', 'other', 'General Staff')
ON CONFLICT (key) DO UPDATE SET
  industry_key = EXCLUDED.industry_key,
  name = EXCLUDED.name,
  is_active = true;

CREATE OR REPLACE FUNCTION public.seed_tenant_profession_catalog(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_industry text;
  v_profession_id uuid;
  v_flow_id uuid;
  v_draft jsonb;
  v_library_id uuid;
BEGIN
  SELECT primary_industry_key
  INTO v_industry
  FROM public.tenants
  WHERE id = p_tenant_id;

  IF v_industry IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.tenant_professions (tenant_id, industry_key, catalog_key, name)
  SELECT p_tenant_id, c.industry_key, c.key, c.name
  FROM public.profession_catalog c
  WHERE c.industry_key = v_industry
    AND c.is_active = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.tenant_professions existing
      WHERE existing.tenant_id = p_tenant_id
        AND existing.industry_key = c.industry_key
        AND lower(existing.name) = lower(c.name)
    );

  IF v_industry <> 'healthcare' THEN
    RETURN;
  END IF;

  SELECT id
  INTO v_profession_id
  FROM public.tenant_professions
  WHERE tenant_id = p_tenant_id
    AND catalog_key = 'nursing'
  LIMIT 1;

  IF v_profession_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id
  INTO v_flow_id
  FROM public.onboarding_flows
  WHERE tenant_id = p_tenant_id
    AND profession_id = v_profession_id
    AND employment_type = 'W2'
  LIMIT 1;

  IF v_flow_id IS NULL THEN
    SELECT f.builder_draft, f.library_id
    INTO v_draft, v_library_id
    FROM public.onboarding_flows f
    WHERE f.tenant_id = p_tenant_id
      AND f.employment_type = 'W2'
    ORDER BY f.updated_at DESC
    LIMIT 1;

    INSERT INTO public.onboarding_flows (
      tenant_id,
      library_id,
      name,
      status,
      employment_type,
      profession_id,
      builder_draft,
      created_as_blank
    ) VALUES (
      p_tenant_id,
      v_library_id,
      'Nursing W2',
      'published',
      'W2',
      v_profession_id,
      COALESCE(v_draft, '{"nodes":[],"edges":[]}'::jsonb),
      false
    )
    RETURNING id INTO v_flow_id;
  END IF;

  INSERT INTO public.workflow_required_documents (
    tenant_id,
    flow_id,
    code,
    name,
    is_required,
    has_expiration,
    collect_issuing_organization,
    collect_scope,
    collect_validity,
    sort_order
  )
  SELECT
    p_tenant_id,
    v_flow_id,
    v.code,
    v.name,
    v.is_required,
    v.has_expiration,
    v.collect_org,
    v.collect_scope,
    v.collect_validity,
    v.sort_order
  FROM (
    VALUES
      ('NURSING_LICENSE'::text, 'Nursing license'::text, true, true, true, true, true, 10),
      ('CPR'::text, 'CPR'::text, true, true, true, false, true, 20),
      ('BLS'::text, 'BLS'::text, true, true, true, false, true, 30),
      ('ACLS'::text, 'ACLS'::text, false, true, true, false, true, 40),
      ('SSN_CARD'::text, 'SSN card'::text, true, false, false, false, false, 50),
      ('DRIVERS_LICENSE'::text, 'Driver license'::text, true, true, true, false, false, 60)
  ) AS v(code, name, is_required, has_expiration, collect_org, collect_scope, collect_validity, sort_order)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.workflow_required_documents existing
    WHERE existing.tenant_id = p_tenant_id
      AND existing.flow_id = v_flow_id
      AND existing.code = v.code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_tenant_profession_catalog(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_tenant_profession_catalog(uuid) TO service_role;

DO $$
DECLARE
  v_tenant uuid;
BEGIN
  FOR v_tenant IN
    SELECT id FROM public.tenants WHERE primary_industry_key IS NOT NULL
  LOOP
    PERFORM public.seed_tenant_profession_catalog(v_tenant);
  END LOOP;
END $$;

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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_seed_professions ON public.tenants;
CREATE TRIGGER trg_tenants_seed_professions
AFTER INSERT OR UPDATE OF primary_industry_key ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.seed_tenant_professions_on_industry();

GRANT EXECUTE ON FUNCTION public.seed_tenant_professions_on_industry() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
