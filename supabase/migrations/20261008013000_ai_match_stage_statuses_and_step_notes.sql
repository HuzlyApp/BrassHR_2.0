-- AI analysis steps 1–5 can be assigned status groups in Settings.
-- Stage names are distinct from Pre-Hire "Submission".
-- Closed stays shared in application code and is not stored per stage.
-- Per-step notes: each workflow step and each AI analysis step keeps its own notes.

ALTER TABLE public.application_status_group_stage_assignments
  DROP CONSTRAINT IF EXISTS application_status_group_stage_assignments_stage_chk;

ALTER TABLE public.application_status_group_stage_assignments
  ADD CONSTRAINT application_status_group_stage_assignments_stage_chk CHECK (
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
  );

CREATE OR REPLACE FUNCTION public.ensure_default_ai_match_group_stage_assignments(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start uuid;
  v_interview uuid;
  v_msp uuid;
  v_client uuid;
  v_hire uuid;
BEGIN
  SELECT id INTO v_start FROM public.application_status_groups
  WHERE tenant_id = p_tenant_id AND system_key = 'start' LIMIT 1;
  SELECT id INTO v_interview FROM public.application_status_groups
  WHERE tenant_id = p_tenant_id AND system_key = 'interview' LIMIT 1;
  SELECT id INTO v_msp FROM public.application_status_groups
  WHERE tenant_id = p_tenant_id AND system_key = 'msp' LIMIT 1;
  SELECT id INTO v_client FROM public.application_status_groups
  WHERE tenant_id = p_tenant_id AND system_key = 'client' LIMIT 1;
  SELECT id INTO v_hire FROM public.application_status_groups
  WHERE tenant_id = p_tenant_id AND system_key = 'hire' LIMIT 1;

  -- Seed a step only when that step has no groups yet, so admin edits are kept.
  INSERT INTO public.application_status_group_stage_assignments (
    tenant_id, stage_name, group_id, sort_order
  )
  SELECT p_tenant_id, seed.stage_name, seed.group_id, seed.sort_order
  FROM (
    VALUES
      ('Step 1 · Quick Match', v_start::uuid, 0),
      ('Step 2 · Verifications', v_interview::uuid, 0),
      ('Step 3 · Follow-Up', v_interview::uuid, 0),
      ('Step 4 · Deep Match', v_msp::uuid, 0),
      ('Step 5 · Submission', v_client::uuid, 0),
      ('Step 5 · Submission', v_hire::uuid, 1)
  ) AS seed(stage_name, group_id, sort_order)
  WHERE seed.group_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.application_status_group_stage_assignments existing
      WHERE existing.tenant_id = p_tenant_id
        AND existing.stage_name = seed.stage_name
    )
  ON CONFLICT (tenant_id, stage_name, group_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_ai_match_group_stage_assignments(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_default_ai_match_group_stage_assignments(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_default_ai_match_group_stage_assignments(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_ai_match_group_stage_assignments(uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.stage_context_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.worker (id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.job_applications (id) ON DELETE CASCADE,
  context_kind text NOT NULL,
  context_key text NOT NULL,
  body text NOT NULL,
  created_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stage_context_notes_kind_chk CHECK (
    context_kind IN ('workflow_step', 'ai_match_step')
  ),
  CONSTRAINT stage_context_notes_key_chk CHECK (
    char_length(trim(context_key)) BETWEEN 1 AND 200
  ),
  CONSTRAINT stage_context_notes_body_not_empty CHECK (char_length(trim(body)) > 0)
);

COMMENT ON TABLE public.stage_context_notes IS
  'Staff notes scoped to one workflow step or one AI analysis step. Not shared across steps.';

CREATE INDEX IF NOT EXISTS stage_context_notes_lookup_idx
  ON public.stage_context_notes (tenant_id, worker_id, context_kind, context_key, created_at DESC);

CREATE INDEX IF NOT EXISTS stage_context_notes_worker_id_idx
  ON public.stage_context_notes (worker_id);

CREATE INDEX IF NOT EXISTS stage_context_notes_application_id_idx
  ON public.stage_context_notes (application_id);

CREATE INDEX IF NOT EXISTS stage_context_notes_created_by_user_id_idx
  ON public.stage_context_notes (created_by_user_id);

DROP TRIGGER IF EXISTS set_stage_context_notes_updated_at ON public.stage_context_notes;
CREATE TRIGGER set_stage_context_notes_updated_at
BEFORE UPDATE ON public.stage_context_notes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stage_context_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stage_context_notes_staff_select ON public.stage_context_notes;
CREATE POLICY stage_context_notes_staff_select
  ON public.stage_context_notes
  FOR SELECT TO authenticated
  USING (public.user_is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS stage_context_notes_staff_insert ON public.stage_context_notes;
CREATE POLICY stage_context_notes_staff_insert
  ON public.stage_context_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS stage_context_notes_staff_update ON public.stage_context_notes;
CREATE POLICY stage_context_notes_staff_update
  ON public.stage_context_notes
  FOR UPDATE TO authenticated
  USING (public.user_is_tenant_staff(tenant_id))
  WITH CHECK (public.user_is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS stage_context_notes_staff_delete ON public.stage_context_notes;
CREATE POLICY stage_context_notes_staff_delete
  ON public.stage_context_notes
  FOR DELETE TO authenticated
  USING (public.user_is_tenant_staff(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_context_notes TO authenticated;
GRANT ALL ON public.stage_context_notes TO service_role;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    PERFORM public.ensure_default_application_statuses(t.id);
    PERFORM public.ensure_default_ai_match_group_stage_assignments(t.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
