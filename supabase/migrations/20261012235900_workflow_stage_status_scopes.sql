-- Pre-hire status lists can differ per workflow. Null workflow_id is the tenant default.
-- Closing reason codes are scoped the same way.

ALTER TABLE public.application_status_stage_lanes
  ADD COLUMN IF NOT EXISTS workflow_id uuid REFERENCES public.onboarding_flows (id) ON DELETE CASCADE;

DROP INDEX IF EXISTS public.application_status_stage_lanes_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_lanes_default_uidx
  ON public.application_status_stage_lanes (tenant_id, stage_name, status_id)
  WHERE workflow_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_lanes_workflow_uidx
  ON public.application_status_stage_lanes (tenant_id, workflow_id, stage_name, status_id)
  WHERE workflow_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS application_status_stage_lanes_workflow_idx
  ON public.application_status_stage_lanes (tenant_id, workflow_id, stage_name, lane, sort_order);

CREATE TABLE IF NOT EXISTS public.application_status_stage_reason_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES public.onboarding_flows (id) ON DELETE CASCADE,
  stage_name text NOT NULL,
  code text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_status_stage_reason_codes_code_chk CHECK (
    char_length(btrim(code)) BETWEEN 1 AND 80
  ),
  CONSTRAINT application_status_stage_reason_codes_stage_chk CHECK (
    stage_name IN (
      'Intake',
      'Screening',
      'Interview',
      'Submission',
      'Compliance',
      'Offer & Agreement',
      'Approvals',
      'Step 1 · Quick Match',
      'Step 2 · Verifications',
      'Step 3 · Follow-Up',
      'Step 4 · Deep Match',
      'Step 5 · Submission'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_reason_codes_default_uidx
  ON public.application_status_stage_reason_codes (tenant_id, stage_name, lower(code))
  WHERE workflow_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_reason_codes_workflow_uidx
  ON public.application_status_stage_reason_codes (tenant_id, workflow_id, stage_name, lower(code))
  WHERE workflow_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS application_status_stage_reason_codes_stage_idx
  ON public.application_status_stage_reason_codes (tenant_id, stage_name, sort_order);

DROP TRIGGER IF EXISTS set_application_status_stage_reason_codes_updated_at
  ON public.application_status_stage_reason_codes;
CREATE TRIGGER set_application_status_stage_reason_codes_updated_at
BEFORE UPDATE ON public.application_status_stage_reason_codes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.application_status_stage_reason_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_status_stage_reason_codes_staff_select
  ON public.application_status_stage_reason_codes;
CREATE POLICY application_status_stage_reason_codes_staff_select
  ON public.application_status_stage_reason_codes
  FOR SELECT TO authenticated
  USING (public.user_is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS application_status_stage_reason_codes_admin_write
  ON public.application_status_stage_reason_codes;
CREATE POLICY application_status_stage_reason_codes_admin_write
  ON public.application_status_stage_reason_codes
  FOR ALL TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_status_stage_reason_codes TO authenticated;
GRANT ALL ON public.application_status_stage_reason_codes TO service_role;

INSERT INTO public.application_status_stage_reason_codes (tenant_id, stage_name, code, sort_order)
SELECT t.id, v.stage_name, v.code, v.sort_order
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('Intake', 'Not a Fit', 0),
    ('Screening', 'C2C Only', 0),
    ('Screening', 'Unreachable', 1),
    ('Screening', 'Candidate Withdrew', 2),
    ('Screening', 'Not a Fit', 3),
    ('Screening', 'Requires Sponsorship', 4),
    ('Interview', 'Candidate Withdrew', 0),
    ('Interview', 'Not a Fit', 1),
    ('Submission', 'Rejected by MSP', 0),
    ('Submission', 'Rejected by Client', 1),
    ('Submission', 'Candidate Withdrew', 2),
    ('Compliance', 'Verification Failed', 0),
    ('Compliance', 'Candidate Withdrew', 1),
    ('Offer & Agreement', 'Offer Declined', 0)
) AS v(stage_name, code, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.application_status_stage_reason_codes existing
  WHERE existing.tenant_id = t.id
    AND existing.workflow_id IS NULL
    AND existing.stage_name = v.stage_name
);
