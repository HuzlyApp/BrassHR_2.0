-- Add change_source field to application_status_history
-- Per BrassHR FSD v1.5: track whether status change was USER, SYSTEM, or API

ALTER TABLE public.application_status_history
  ADD COLUMN IF NOT EXISTS change_source text 
  CHECK (change_source IN ('USER', 'SYSTEM', 'API'))
  DEFAULT 'USER';

-- Update existing records to USER (default)
UPDATE public.application_status_history
  SET change_source = 'USER'
  WHERE change_source IS NULL;

-- Make it non-nullable after backfill
ALTER TABLE public.application_status_history
  ALTER COLUMN change_source SET NOT NULL;

COMMENT ON COLUMN public.application_status_history.change_source IS
  'Source of the status change: USER (manual staff action), SYSTEM (automated workflow), or API (external integration)';
