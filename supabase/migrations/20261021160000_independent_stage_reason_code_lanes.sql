-- Alternate and Closing reason codes are separate rows.
-- Updating or deleting a code on one lane leaves the other lane in place.

ALTER TABLE public.application_status_stage_reason_codes
  ADD COLUMN IF NOT EXISTS lane text;

UPDATE public.application_status_stage_reason_codes
SET lane = 'alternate'
WHERE lane IS NULL;

DROP INDEX IF EXISTS public.application_status_stage_reason_codes_default_uidx;
DROP INDEX IF EXISTS public.application_status_stage_reason_codes_workflow_uidx;

INSERT INTO public.application_status_stage_reason_codes (
  tenant_id,
  workflow_id,
  stage_name,
  code,
  sort_order,
  note,
  lane
)
SELECT
  src.tenant_id,
  src.workflow_id,
  src.stage_name,
  src.code,
  src.sort_order,
  src.note,
  'closed'
FROM public.application_status_stage_reason_codes src
WHERE src.lane = 'alternate'
  AND NOT EXISTS (
    SELECT 1
    FROM public.application_status_stage_reason_codes existing
    WHERE existing.tenant_id = src.tenant_id
      AND existing.stage_name = src.stage_name
      AND existing.lane = 'closed'
      AND lower(existing.code) = lower(src.code)
      AND existing.workflow_id IS NOT DISTINCT FROM src.workflow_id
  );

ALTER TABLE public.application_status_stage_reason_codes
  ALTER COLUMN lane SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'application_status_stage_reason_codes_lane_chk'
      AND conrelid = 'public.application_status_stage_reason_codes'::regclass
  ) THEN
    ALTER TABLE public.application_status_stage_reason_codes
      ADD CONSTRAINT application_status_stage_reason_codes_lane_chk
      CHECK (lane IN ('alternate', 'closed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_reason_codes_default_uidx
  ON public.application_status_stage_reason_codes (tenant_id, stage_name, lane, lower(code))
  WHERE workflow_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS application_status_stage_reason_codes_workflow_uidx
  ON public.application_status_stage_reason_codes (tenant_id, workflow_id, stage_name, lane, lower(code))
  WHERE workflow_id IS NOT NULL;
