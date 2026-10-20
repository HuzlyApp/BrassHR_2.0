-- MSP candidate submission record, configurator task, and missing pipeline statuses.
-- Does not rewrite existing application stages.

CREATE TABLE IF NOT EXISTS public.msp_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  job_application_id uuid NOT NULL REFERENCES public.job_applications (id) ON DELETE CASCADE,
  job_requisition_id uuid NOT NULL REFERENCES public.job_requisitions (id) ON DELETE RESTRICT,
  worker_id uuid REFERENCES public.worker (id) ON DELETE SET NULL,
  submitted_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'submitted',
  msp_reference text,
  notes text,
  packet_variants text[] NOT NULL DEFAULT '{}',
  readiness_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT msp_submissions_status_chk CHECK (status = 'submitted'),
  CONSTRAINT msp_submissions_notes_len_chk CHECK (notes IS NULL OR length(notes) <= 4000),
  CONSTRAINT msp_submissions_reference_len_chk CHECK (
    msp_reference IS NULL OR length(msp_reference) <= 200
  )
);

COMMENT ON TABLE public.msp_submissions IS
  'One recruiter submission of a candidate packet to the MSP for a job application. Later MSP or client decisions are application statuses and are not written by an external MSP feed.';

CREATE UNIQUE INDEX IF NOT EXISTS msp_submissions_application_uidx
  ON public.msp_submissions (job_application_id);

CREATE INDEX IF NOT EXISTS msp_submissions_job_requisition_id_idx
  ON public.msp_submissions (job_requisition_id);

CREATE INDEX IF NOT EXISTS msp_submissions_tenant_job_idx
  ON public.msp_submissions (tenant_id, job_requisition_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS msp_submissions_worker_id_idx
  ON public.msp_submissions (worker_id)
  WHERE worker_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS msp_submissions_submitted_by_idx
  ON public.msp_submissions (submitted_by_user_id)
  WHERE submitted_by_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_msp_submission_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_job uuid;
BEGIN
  SELECT a.job_requisition_id
  INTO v_job
  FROM public.job_applications a
  WHERE a.id = NEW.job_application_id
    AND a.tenant_id = NEW.tenant_id;

  IF v_job IS NULL THEN
    RAISE EXCEPTION 'MSP submission tenant must match the application'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.job_requisition_id IS DISTINCT FROM v_job THEN
    RAISE EXCEPTION 'MSP submission requisition must match the application'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.worker_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.worker w
    WHERE w.id = NEW.worker_id
      AND w.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'MSP submission worker must belong to the same tenant'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_msp_submissions_consistency ON public.msp_submissions;
CREATE TRIGGER trg_msp_submissions_consistency
  BEFORE INSERT OR UPDATE ON public.msp_submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_msp_submission_consistency();

ALTER TABLE public.msp_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS msp_submissions_staff_select ON public.msp_submissions;
CREATE POLICY msp_submissions_staff_select
  ON public.msp_submissions
  FOR SELECT TO authenticated
  USING (public.user_is_tenant_staff(tenant_id));

GRANT SELECT ON public.msp_submissions TO authenticated;
GRANT ALL ON public.msp_submissions TO service_role;

REVOKE ALL ON FUNCTION public.enforce_msp_submission_consistency() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_msp_submission_consistency() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_msp_submission_consistency() FROM authenticated;

INSERT INTO public.onboarding_step_library (
  tenant_id, category_id, category_label, step_key, step_type, title, description, icon_key, sort_order, default_settings
)
SELECT
  NULL,
  'approval-decision',
  'Approval & Decision Steps',
  'submit-to-msp',
  'custom_question',
  'Submit to MSP',
  'Prepare the candidate profile and packet, then submit the candidate to the MSP. Required documents follow this workflow.',
  'submit-to-msp',
  11,
  jsonb_build_object('phase', 'pre_hire', 'stageName', 'Submission', 'completionOwner', 'recruiter_or_hr')
WHERE NOT EXISTS (
  SELECT 1
  FROM public.onboarding_step_library
  WHERE tenant_id IS NULL
    AND step_key = 'submit-to-msp'
);

CREATE OR REPLACE FUNCTION public.ensure_default_application_statuses(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_defaults text[][] := ARRAY[
    ARRAY['new', 'New / Not Contacted', '0'],
    ARRAY['', 'Attempted Contact', '1'],
    ARRAY['', 'Follow-up Needed', '2'],
    ARRAY['', 'Unreachable', '3'],
    ARRAY['reviewing', 'Screening Complete', '4'],
    ARRAY['shortlisted', E'Qualified ' || chr(8211) || ' Ready for Interview', '5'],
    ARRAY['interviewing', 'Interview Complete', '6'],
    ARRAY['', 'Profile Ready', '7'],
    ARRAY['', 'Submitted for MSP Review', '8'],
    ARRAY['', 'Presented to Client', '9'],
    ARRAY['', 'Selected', '10'],
    ARRAY['', 'Approved by MSP', '11'],
    ARRAY['hired', 'Selected by Client', '12'],
    ARRAY['undecided', 'Fit for Future Roles', '13'],
    ARRAY['withdrawn', 'Candidate Withdrew', '14'],
    ARRAY['rejected', 'Not a Fit', '15'],
    ARRAY['', 'Rejected After Interview', '16'],
    ARRAY['', 'Rejected by MSP', '17'],
    ARRAY['', 'Rejected by Client', '18'],
    ARRAY['archived', 'Position Closed', '19'],
    ARRAY['', 'AI Assessed', '20'],
    ARRAY['', 'Submitted to MSP', '21'],
    ARRAY['', 'Client Interview', '22'],
    ARRAY['', 'Offer/Agreement', '23']
  ];
  v_row text[];
  v_key text;
  v_name text;
  v_sort integer;
BEGIN
  FOREACH v_row SLICE 1 IN ARRAY v_defaults LOOP
    v_key := NULLIF(btrim(v_row[1]), '');
    v_name := v_row[2];
    v_sort := v_row[3]::integer;

    INSERT INTO public.application_statuses (
      tenant_id, name, system_key, sort_order, is_active, is_default
    )
    SELECT
      p_tenant_id,
      v_name,
      v_key,
      v_sort,
      true,
      COALESCE(v_key = 'new', false)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.application_statuses s
      WHERE s.tenant_id = p_tenant_id
        AND (
          (v_key IS NOT NULL AND s.system_key = v_key)
          OR lower(btrim(s.name)) = lower(btrim(v_name))
        )
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_application_statuses(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_default_application_statuses(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_default_application_statuses(uuid) TO service_role;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.ensure_default_application_statuses(t.id);
  END LOOP;
END $$;
