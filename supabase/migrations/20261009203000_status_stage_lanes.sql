-- Per-stage button categories for Pre-Hire and AI analysis statuses.
-- happy_path: recommended flow. alternate: exception order.
-- closed: withdrawn and other stop statuses, including MSP or client rejections.

CREATE TABLE IF NOT EXISTS public.application_status_stage_lanes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  stage_name text NOT NULL,
  status_id uuid NOT NULL REFERENCES public.application_statuses (id) ON DELETE CASCADE,
  lane text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT application_status_stage_lanes_lane_chk CHECK (
    lane IN ('happy_path', 'alternate', 'closed')
  ),
  CONSTRAINT application_status_stage_lanes_stage_chk CHECK (
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

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_lanes_uidx
  ON public.application_status_stage_lanes (tenant_id, stage_name, status_id);

CREATE INDEX IF NOT EXISTS application_status_stage_lanes_stage_idx
  ON public.application_status_stage_lanes (tenant_id, stage_name, lane, sort_order);

CREATE INDEX IF NOT EXISTS application_status_stage_lanes_status_id_idx
  ON public.application_status_stage_lanes (status_id);

DROP TRIGGER IF EXISTS set_application_status_stage_lanes_updated_at
  ON public.application_status_stage_lanes;
CREATE TRIGGER set_application_status_stage_lanes_updated_at
BEFORE UPDATE ON public.application_status_stage_lanes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.application_status_stage_lanes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS application_status_stage_lanes_staff_select
  ON public.application_status_stage_lanes;
CREATE POLICY application_status_stage_lanes_staff_select
  ON public.application_status_stage_lanes
  FOR SELECT TO authenticated
  USING (public.user_is_tenant_staff(tenant_id));

DROP POLICY IF EXISTS application_status_stage_lanes_admin_insert
  ON public.application_status_stage_lanes;
CREATE POLICY application_status_stage_lanes_admin_insert
  ON public.application_status_stage_lanes
  FOR INSERT TO authenticated
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS application_status_stage_lanes_admin_update
  ON public.application_status_stage_lanes;
CREATE POLICY application_status_stage_lanes_admin_update
  ON public.application_status_stage_lanes
  FOR UPDATE TO authenticated
  USING (public.user_is_tenant_admin(tenant_id))
  WITH CHECK (public.user_is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS application_status_stage_lanes_admin_delete
  ON public.application_status_stage_lanes;
CREATE POLICY application_status_stage_lanes_admin_delete
  ON public.application_status_stage_lanes
  FOR DELETE TO authenticated
  USING (public.user_is_tenant_admin(tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.application_status_stage_lanes TO authenticated;
GRANT ALL ON public.application_status_stage_lanes TO service_role;
