-- Exception choice named Follow up, in the Start group, on every stage.

INSERT INTO public.application_statuses (
  tenant_id,
  name,
  sort_order,
  is_active,
  is_default,
  group_id,
  button_lane
)
SELECT
  g.tenant_id,
  'Follow up',
  4,
  true,
  false,
  g.id,
  'alternate'
FROM public.application_status_groups g
WHERE g.system_key = 'start'
  AND NOT EXISTS (
    SELECT 1
    FROM public.application_statuses s
    WHERE s.tenant_id = g.tenant_id
      AND lower(btrim(replace(replace(s.name, chr(8211), '-'), chr(8212), '-'))) IN (
        'follow up',
        'follow-up',
        'follow-up needed',
        'follow up needed'
      )
  );
