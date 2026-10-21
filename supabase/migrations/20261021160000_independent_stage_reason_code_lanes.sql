-- Alternate and Closing reason codes are separate rows.
-- A code that was copied onto both lanes is kept on the lane it belongs to.
-- Codes that exist on only one lane are left in place.

ALTER TABLE public.application_status_stage_reason_codes
  ADD COLUMN IF NOT EXISTS lane text;

UPDATE public.application_status_stage_reason_codes
SET lane = CASE
  WHEN lower(btrim(code)) IN (
    'unreachable',
    'call back later',
    'call back',
    'callback',
    'left voicemail',
    'left a voicemail'
  ) THEN 'alternate'
  ELSE 'closed'
END
WHERE lane IS NULL;

DROP INDEX IF EXISTS public.application_status_stage_reason_codes_default_uidx;
DROP INDEX IF EXISTS public.application_status_stage_reason_codes_workflow_uidx;

-- Drop the copy that landed on the wrong lane. The matching row on the
-- correct lane, including its note, stays.
DELETE FROM public.application_status_stage_reason_codes AS wrong
USING public.application_status_stage_reason_codes AS kept
WHERE wrong.tenant_id = kept.tenant_id
  AND wrong.stage_name = kept.stage_name
  AND wrong.workflow_id IS NOT DISTINCT FROM kept.workflow_id
  AND lower(btrim(wrong.code)) = lower(btrim(kept.code))
  AND wrong.lane IS DISTINCT FROM kept.lane
  AND wrong.lane IS DISTINCT FROM CASE
    WHEN lower(btrim(wrong.code)) IN (
      'unreachable',
      'call back later',
      'call back',
      'callback',
      'left voicemail',
      'left a voicemail'
    ) THEN 'alternate'
    WHEN lower(btrim(wrong.code)) IN (
      'not a fit',
      'c2c only',
      'candidate withdrew',
      'requires sponsorship',
      'rejected by msp',
      'rejected by client',
      'verification failed',
      'offer declined'
    ) THEN 'closed'
    ELSE wrong.lane
  END;

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
