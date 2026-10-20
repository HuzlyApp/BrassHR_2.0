-- Rename the first lane labels to the three recruiter button categories.
-- Safe when the table was created with the earlier exception / follow_up names.

ALTER TABLE public.application_status_stage_lanes
  DROP CONSTRAINT IF EXISTS application_status_stage_lanes_lane_chk;

UPDATE public.application_status_stage_lanes
SET lane = 'closed'
WHERE lane = 'exception';

UPDATE public.application_status_stage_lanes
SET lane = 'alternate'
WHERE lane = 'follow_up';

ALTER TABLE public.application_status_stage_lanes
  ADD CONSTRAINT application_status_stage_lanes_lane_chk CHECK (
    lane IN ('happy_path', 'alternate', 'closed')
  );
