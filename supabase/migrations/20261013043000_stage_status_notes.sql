-- Notes for a status stage stay on that workflow and stage.
-- The same wording on another stage or workflow is a separate row.

CREATE TABLE IF NOT EXISTS public.application_status_stage_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES public.onboarding_flows (id) ON DELETE CASCADE,
  stage_name text NOT NULL,
  body text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_status_stage_notes_body_chk CHECK (
    char_length(btrim(body)) BETWEEN 1 AND 500
  ),
  CONSTRAINT application_status_stage_notes_stage_chk CHECK (
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

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_notes_default_uidx
  ON public.application_status_stage_notes (tenant_id, stage_name, lower(btrim(body)))
  WHERE workflow_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_notes_workflow_uidx
  ON public.application_status_stage_notes (tenant_id, workflow_id, stage_name, lower(btrim(body)))
  WHERE workflow_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS application_status_stage_notes_stage_idx
  ON public.application_status_stage_notes (tenant_id, stage_name, sort_order);

DROP TRIGGER IF EXISTS set_application_status_stage_notes_updated_at
  ON public.application_status_stage_notes;
CREATE TRIGGER set_application_status_stage_notes_updated_at
BEFORE UPDATE ON public.application_status_stage_notes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.application_status_stage_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_status_stage_notes_staff_select
  ON public.application_status_stage_notes;
CREATE POLICY application_status_stage_notes_staff_select
  ON public.application_status_stage_notes
  FOR SELECT TO authenticated
  USING (public.user_is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS application_status_stage_notes_admin_write
  ON public.application_status_stage_notes;
CREATE POLICY application_status_stage_notes_admin_write
  ON public.application_status_stage_notes
  FOR ALL TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_status_stage_notes TO authenticated;
GRANT ALL ON public.application_status_stage_notes TO service_role;

ALTER TABLE public.application_status_stage_lanes
  ADD COLUMN IF NOT EXISTS note_id uuid REFERENCES public.application_status_stage_notes (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS application_status_stage_lanes_note_id_idx
  ON public.application_status_stage_lanes (note_id);

NOTIFY pgrst, 'reload schema';
