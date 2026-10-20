-- Each status group sets the three button categories used on Pre-Hire stages
-- and AI analysis steps. Null keeps the name-based default.

ALTER TABLE public.application_statuses
  ADD COLUMN IF NOT EXISTS button_lane text;

ALTER TABLE public.application_statuses
  DROP CONSTRAINT IF EXISTS application_statuses_button_lane_chk;

ALTER TABLE public.application_statuses
  ADD CONSTRAINT application_statuses_button_lane_chk CHECK (
    button_lane IS NULL OR button_lane IN ('happy_path', 'alternate', 'closed')
  );
