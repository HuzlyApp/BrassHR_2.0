-- Per-tenant names for the alternate and closing buttons on each status stage.
-- Null keeps the built-in labels: "Follow Up needed" and "Close Application".

ALTER TABLE public.application_status_stage_buttons
  ADD COLUMN IF NOT EXISTS alternate_label text,
  ADD COLUMN IF NOT EXISTS closed_label text;

ALTER TABLE public.application_status_stage_buttons
  DROP CONSTRAINT IF EXISTS application_status_stage_buttons_alternate_label_chk;

ALTER TABLE public.application_status_stage_buttons
  ADD CONSTRAINT application_status_stage_buttons_alternate_label_chk
  CHECK (
    alternate_label IS NULL
    OR char_length(btrim(alternate_label)) BETWEEN 1 AND 60
  );

ALTER TABLE public.application_status_stage_buttons
  DROP CONSTRAINT IF EXISTS application_status_stage_buttons_closed_label_chk;

ALTER TABLE public.application_status_stage_buttons
  ADD CONSTRAINT application_status_stage_buttons_closed_label_chk
  CHECK (
    closed_label IS NULL
    OR char_length(btrim(closed_label)) BETWEEN 1 AND 60
  );

NOTIFY pgrst, 'reload schema';
