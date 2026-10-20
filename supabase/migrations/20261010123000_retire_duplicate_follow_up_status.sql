-- Follow up was added beside the existing Follow-up Needed status.
-- Applications, history, and stage assignments use Follow-up Needed, so remove
-- the unused Follow up row for those tenants.

DELETE FROM public.application_statuses follow_up
WHERE lower(btrim(follow_up.name)) = 'follow up'
  AND EXISTS (
    SELECT 1
    FROM public.application_statuses needed
    WHERE needed.tenant_id = follow_up.tenant_id
      AND needed.id <> follow_up.id
      AND lower(btrim(replace(replace(needed.name, chr(8211), '-'), chr(8212), '-'))) IN (
        'follow-up needed',
        'follow up needed'
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.job_applications application
    WHERE application.status_id = follow_up.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.application_status_history history
    WHERE history.from_status_id = follow_up.id
      OR history.to_status_id = follow_up.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.application_status_stage_assignments assignment
    WHERE assignment.status_id = follow_up.id
  );

UPDATE public.application_statuses
SET button_lane = 'alternate'
WHERE button_lane IS NULL
  AND lower(btrim(replace(replace(name, chr(8211), '-'), chr(8212), '-'))) IN (
    'follow-up needed',
    'follow up needed'
  );
