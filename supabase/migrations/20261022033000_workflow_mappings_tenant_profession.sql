-- Workflow mapping profession criteria use the tenant profession list,
-- the same table as onboarding flows. Legacy professions ids are cleared
-- because they are not tenant_professions ids.
-- An active legacy row is deactivated first when another active row already
-- owns that any-profession criteria key.

WITH ranked AS (
  SELECT
    wm.id,
    row_number() OVER (
      PARTITION BY
        wm.tenant_id,
        wm.employment_type,
        COALESCE(wm.specialty_id::text, ''),
        COALESCE(lower(btrim(wm.location)), ''),
        COALESCE(lower(btrim(wm.location_type)), ''),
        COALESCE(lower(btrim(wm.years_of_experience)), ''),
        CASE
          WHEN wm.profession_id IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM public.tenant_professions AS tp
             WHERE tp.id = wm.profession_id
           )
          THEN wm.profession_id::text
          ELSE ''
        END
      ORDER BY
        CASE
          WHEN wm.profession_id IS NULL THEN 0
          WHEN EXISTS (
            SELECT 1
            FROM public.tenant_professions AS tp
            WHERE tp.id = wm.profession_id
          ) THEN 0
          ELSE 1
        END,
        wm.priority,
        wm.created_at,
        wm.id
    ) AS rn
  FROM public.workflow_mappings AS wm
  WHERE wm.is_active
)
UPDATE public.workflow_mappings AS wm
SET is_active = false
FROM ranked AS r
WHERE wm.id = r.id
  AND r.rn > 1
  AND wm.profession_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_professions AS tp
    WHERE tp.id = wm.profession_id
  );

UPDATE public.workflow_mappings AS wm
SET profession_id = NULL
WHERE wm.profession_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_professions AS tp
    WHERE tp.id = wm.profession_id
  );

ALTER TABLE public.workflow_mappings
  DROP CONSTRAINT IF EXISTS workflow_mappings_profession_id_fkey;

ALTER TABLE public.workflow_mappings
  ADD CONSTRAINT workflow_mappings_profession_id_fkey
  FOREIGN KEY (profession_id)
  REFERENCES public.tenant_professions (id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS workflow_mappings_profession_idx
  ON public.workflow_mappings (profession_id)
  WHERE profession_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_workflow_mappings_profession_tenant ON public.workflow_mappings;
CREATE TRIGGER trg_workflow_mappings_profession_tenant
BEFORE INSERT OR UPDATE OF profession_id, tenant_id ON public.workflow_mappings
FOR EACH ROW
EXECUTE FUNCTION public.profession_belongs_to_tenant();

COMMENT ON COLUMN public.workflow_mappings.profession_id IS
  'Optional tenant profession criterion. NULL matches any profession.';

NOTIFY pgrst, 'reload schema';
