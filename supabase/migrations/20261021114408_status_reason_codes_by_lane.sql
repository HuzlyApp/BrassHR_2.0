-- Alternate and closing actions keep separate reason codes.
-- Rows created before this split are closing reasons.

ALTER TABLE public.application_status_stage_reason_codes
  ADD COLUMN IF NOT EXISTS lane text;

UPDATE public.application_status_stage_reason_codes
SET lane = 'closed'
WHERE lane IS NULL
   OR lane NOT IN ('alternate', 'closed');

ALTER TABLE public.application_status_stage_reason_codes
  ALTER COLUMN lane SET DEFAULT 'closed';

ALTER TABLE public.application_status_stage_reason_codes
  ALTER COLUMN lane SET NOT NULL;

ALTER TABLE public.application_status_stage_reason_codes
  DROP CONSTRAINT IF EXISTS application_status_stage_reason_codes_lane_chk;

ALTER TABLE public.application_status_stage_reason_codes
  ADD CONSTRAINT application_status_stage_reason_codes_lane_chk
  CHECK (lane IN ('alternate', 'closed'));

DROP INDEX IF EXISTS public.application_status_stage_reason_codes_default_uidx;
DROP INDEX IF EXISTS public.application_status_stage_reason_codes_workflow_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_reason_codes_default_uidx
  ON public.application_status_stage_reason_codes (tenant_id, stage_name, lane, lower(code))
  WHERE workflow_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_reason_codes_workflow_uidx
  ON public.application_status_stage_reason_codes (tenant_id, workflow_id, stage_name, lane, lower(code))
  WHERE workflow_id IS NOT NULL;
