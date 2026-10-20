-- Job workflows store extra steps (for example custom_question_30) as disabled
-- catalog rows so applicant progress has a real step id. Those inserts use
-- sort_order values starting at 300000. UNIQUE (onboarding_config_id, sort_order)
-- rejects them once that range is already used, and /api/onboarding/config
-- then returns 500: Could not store onboarding step custom_question_30.
--
-- Enabled steps keep a unique order. Disabled catalog anchors may share a
-- sort_order; they are not shown in the applicant flow.

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'tenant_onboarding_steps'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%(onboarding_config_id, sort_order)%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.tenant_onboarding_steps DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

-- Space any enabled steps that already share a sort_order so the partial
-- unique index below can be created.
WITH collisions AS (
  SELECT DISTINCT onboarding_config_id
  FROM public.tenant_onboarding_steps
  WHERE is_enabled
  GROUP BY onboarding_config_id, sort_order
  HAVING count(*) > 1
),
ranked AS (
  SELECT
    s.id,
    row_number() OVER (
      PARTITION BY s.onboarding_config_id
      ORDER BY s.sort_order, s.updated_at, s.id
    ) AS rn
  FROM public.tenant_onboarding_steps s
  JOIN collisions c ON c.onboarding_config_id = s.onboarding_config_id
  WHERE s.is_enabled
)
UPDATE public.tenant_onboarding_steps s
SET sort_order = ranked.rn * 10,
    updated_at = now()
FROM ranked
WHERE s.id = ranked.id
  AND s.sort_order IS DISTINCT FROM ranked.rn * 10;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_onboarding_steps_enabled_config_sort_uidx
  ON public.tenant_onboarding_steps (onboarding_config_id, sort_order)
  WHERE is_enabled;

CREATE INDEX IF NOT EXISTS tenant_onboarding_steps_config_sort_idx
  ON public.tenant_onboarding_steps (onboarding_config_id, sort_order);
