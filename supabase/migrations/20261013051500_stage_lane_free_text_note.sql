-- A status on a stage can keep a free-text note. The note is not a shared catalog row.

ALTER TABLE public.application_status_stage_lanes
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.application_status_stage_lanes
  DROP CONSTRAINT IF EXISTS application_status_stage_lanes_note_len_chk;

ALTER TABLE public.application_status_stage_lanes
  ADD CONSTRAINT application_status_stage_lanes_note_len_chk
  CHECK (note IS NULL OR char_length(note) <= 2000);

NOTIFY pgrst, 'reload schema';
