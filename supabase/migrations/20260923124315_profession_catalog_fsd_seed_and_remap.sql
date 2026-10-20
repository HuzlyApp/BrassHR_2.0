-- Profession catalog (FSD v1.2 §§4.1–4.2): seed new codes, remap legacy rows, soft-hide old codes.
-- Safe for staging: no hard deletes; existing FKs on professions/specialties remain valid.
-- Apply on staging first; verify with docs/profession_catalog_staging_verify.sql before production.

-- ---------------------------------------------------------------------------
-- 1) Optional FSD metadata columns (additive only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.professions
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS needs_license_packet boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS example_titles text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'professions_category_chk'
      AND conrelid = 'public.professions'::regclass
  ) THEN
    ALTER TABLE public.professions
      ADD CONSTRAINT professions_category_chk
      CHECK (category IS NULL OR category IN ('healthcare', 'non_clinical'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS professions_active_sort_idx
  ON public.professions (is_active, sort_order)
  WHERE is_active = true;

COMMENT ON COLUMN public.professions.code IS
  'Backend key (snake_case for FSD catalog). Immutable after ship; UI must persist code/id, never label.';
COMMENT ON COLUMN public.professions.name IS
  'Admin / UI display label only.';
COMMENT ON COLUMN public.professions.category IS
  'healthcare | non_clinical (FSD).';
COMMENT ON COLUMN public.professions.needs_license_packet IS
  'Hint that credential / license steps may differ for this profession.';
COMMENT ON COLUMN public.professions.example_titles IS
  'Example job titles shown as help under the profession dropdown.';

-- ---------------------------------------------------------------------------
-- 1b) Rename legacy codes that collide with FSD on lower(code)
--     Unique index is on lower(code), so ALLIED_HEALTH blocks insert of allied_health.
--     Keep the same UUID (jobs/mappings stay valid); only normalize the code string.
-- ---------------------------------------------------------------------------
UPDATE public.professions
SET
  code = 'allied_health',
  name = 'Allied Health',
  updated_at = now()
WHERE tenant_id IS NULL
  AND code = 'ALLIED_HEALTH';

UPDATE public.professions
SET
  code = 'allied_health',
  name = 'Allied Health',
  updated_at = now()
WHERE tenant_id IS NOT NULL
  AND code = 'ALLIED_HEALTH'
  AND NOT EXISTS (
    SELECT 1
    FROM public.professions p2
    WHERE p2.tenant_id IS NOT DISTINCT FROM professions.tenant_id
      AND lower(p2.code) = 'allied_health'
      AND p2.id <> professions.id
  );

-- ---------------------------------------------------------------------------
-- 2) Seed FSD picklist (global rows). Idempotent upsert on lower(code).
-- ---------------------------------------------------------------------------
INSERT INTO public.professions AS p (
  tenant_id,
  code,
  name,
  description,
  category,
  needs_license_packet,
  example_titles,
  sort_order,
  is_active
)
VALUES
  -- 4.1 Healthcare
  (NULL, 'nursing', 'Nursing', NULL, 'healthcare', true,
    ARRAY['CNA', 'LPN/LVN', 'RN', 'Charge RN', 'NP'], 10, true),
  (NULL, 'allied_health', 'Allied Health', NULL, 'healthcare', true,
    ARRAY['MA', 'Phlebotomy', 'Surg Tech', 'Sterile Processing'], 20, true),
  (NULL, 'radiology', 'Radiology / Imaging', NULL, 'healthcare', true,
    ARRAY['X-Ray', 'CT', 'MRI', 'Ultrasound', 'Rad Tech'], 30, true),
  (NULL, 'therapy', 'Therapy', NULL, 'healthcare', true,
    ARRAY['PT', 'PTA', 'OT', 'COTA', 'SLP'], 40, true),
  (NULL, 'respiratory', 'Respiratory', NULL, 'healthcare', true,
    ARRAY['RT', 'CRT', 'RRT'], 50, true),
  (NULL, 'laboratory', 'Laboratory', NULL, 'healthcare', true,
    ARRAY['MLT', 'MLS', 'Lab Assistant'], 60, true),
  (NULL, 'pharmacy', 'Pharmacy', NULL, 'healthcare', true,
    ARRAY['Pharmacist', 'Pharmacy Tech'], 70, true),
  (NULL, 'behavioral_health', 'Behavioral Health', NULL, 'healthcare', true,
    ARRAY['Psych Tech', 'Counselor', 'Social Worker'], 80, true),
  (NULL, 'home_care', 'Home Care / Caregiving', NULL, 'healthcare', true,
    ARRAY['HHA', 'PCA', 'Companion', 'Caregiver'], 90, true),
  (NULL, 'healthcare_admin', 'Healthcare Admin', NULL, 'healthcare', false,
    ARRAY['Unit Clerk', 'Scheduler', 'Medical Records'], 100, true),
  -- 4.2 Non-clinical
  (NULL, 'information_technology', 'IT / Technology', NULL, 'non_clinical', false,
    ARRAY['Help Desk', 'Sysadmin', 'Developer', 'Network'], 110, true),
  (NULL, 'warehouse', 'Warehouse / Light Industrial', NULL, 'non_clinical', false,
    ARRAY['Picker', 'Packer', 'Receiver', 'General Labor'], 120, true),
  (NULL, 'public_works', 'Public Works', NULL, 'non_clinical', true,
    ARRAY['Roads', 'Parks', 'Sanitation', 'Utilities'], 130, true),
  (NULL, 'skilled_trades', 'Skilled Trades', NULL, 'non_clinical', true,
    ARRAY['Electrician', 'Plumber', 'HVAC'], 140, true),
  (NULL, 'hospitality', 'Hospitality / Food Service', NULL, 'non_clinical', false,
    ARRAY['Server', 'Cook', 'Housekeeping', 'Barista'], 150, true),
  (NULL, 'retail', 'Retail', NULL, 'non_clinical', false,
    ARRAY['Cashier', 'Sales Associate', 'Shift Lead'], 160, true),
  (NULL, 'cleaning', 'Cleaning / EVS', NULL, 'non_clinical', false,
    ARRAY['Janitor', 'Housekeeper', 'EVS Aide'], 170, true),
  (NULL, 'childcare', 'Childcare', NULL, 'non_clinical', true,
    ARRAY['Teacher', 'Aide', 'After-school staff'], 180, true),
  (NULL, 'customer_service', 'Customer Service', NULL, 'non_clinical', false,
    ARRAY['Call center', 'Front desk', 'CSR'], 190, true),
  (NULL, 'administrative', 'Administrative', NULL, 'non_clinical', false,
    ARRAY['Office Admin', 'Reception', 'Coordinator'], 200, true),
  (NULL, 'professional_services', 'Professional Services', NULL, 'non_clinical', false,
    ARRAY['Accounting', 'HR coordinator', 'Analyst'], 210, true)
ON CONFLICT DO NOTHING;

-- Refresh metadata if a global row with the same code already exists (e.g. re-run / partial seed).
UPDATE public.professions AS p
SET
  name = v.name,
  description = v.description,
  category = v.category,
  needs_license_packet = v.needs_license_packet,
  example_titles = v.example_titles,
  sort_order = v.sort_order,
  is_active = true,
  updated_at = now()
FROM (
  VALUES
    ('nursing', 'Nursing', NULL::text, 'healthcare', true,
      ARRAY['CNA', 'LPN/LVN', 'RN', 'Charge RN', 'NP']::text[], 10),
    ('allied_health', 'Allied Health', NULL, 'healthcare', true,
      ARRAY['MA', 'Phlebotomy', 'Surg Tech', 'Sterile Processing'], 20),
    ('radiology', 'Radiology / Imaging', NULL, 'healthcare', true,
      ARRAY['X-Ray', 'CT', 'MRI', 'Ultrasound', 'Rad Tech'], 30),
    ('therapy', 'Therapy', NULL, 'healthcare', true,
      ARRAY['PT', 'PTA', 'OT', 'COTA', 'SLP'], 40),
    ('respiratory', 'Respiratory', NULL, 'healthcare', true,
      ARRAY['RT', 'CRT', 'RRT'], 50),
    ('laboratory', 'Laboratory', NULL, 'healthcare', true,
      ARRAY['MLT', 'MLS', 'Lab Assistant'], 60),
    ('pharmacy', 'Pharmacy', NULL, 'healthcare', true,
      ARRAY['Pharmacist', 'Pharmacy Tech'], 70),
    ('behavioral_health', 'Behavioral Health', NULL, 'healthcare', true,
      ARRAY['Psych Tech', 'Counselor', 'Social Worker'], 80),
    ('home_care', 'Home Care / Caregiving', NULL, 'healthcare', true,
      ARRAY['HHA', 'PCA', 'Companion', 'Caregiver'], 90),
    ('healthcare_admin', 'Healthcare Admin', NULL, 'healthcare', false,
      ARRAY['Unit Clerk', 'Scheduler', 'Medical Records'], 100),
    ('information_technology', 'IT / Technology', NULL, 'non_clinical', false,
      ARRAY['Help Desk', 'Sysadmin', 'Developer', 'Network'], 110),
    ('warehouse', 'Warehouse / Light Industrial', NULL, 'non_clinical', false,
      ARRAY['Picker', 'Packer', 'Receiver', 'General Labor'], 120),
    ('public_works', 'Public Works', NULL, 'non_clinical', true,
      ARRAY['Roads', 'Parks', 'Sanitation', 'Utilities'], 130),
    ('skilled_trades', 'Skilled Trades', NULL, 'non_clinical', true,
      ARRAY['Electrician', 'Plumber', 'HVAC'], 140),
    ('hospitality', 'Hospitality / Food Service', NULL, 'non_clinical', false,
      ARRAY['Server', 'Cook', 'Housekeeping', 'Barista'], 150),
    ('retail', 'Retail', NULL, 'non_clinical', false,
      ARRAY['Cashier', 'Sales Associate', 'Shift Lead'], 160),
    ('cleaning', 'Cleaning / EVS', NULL, 'non_clinical', false,
      ARRAY['Janitor', 'Housekeeper', 'EVS Aide'], 170),
    ('childcare', 'Childcare', NULL, 'non_clinical', true,
      ARRAY['Teacher', 'Aide', 'After-school staff'], 180),
    ('customer_service', 'Customer Service', NULL, 'non_clinical', false,
      ARRAY['Call center', 'Front desk', 'CSR'], 190),
    ('administrative', 'Administrative', NULL, 'non_clinical', false,
      ARRAY['Office Admin', 'Reception', 'Coordinator'], 200),
    ('professional_services', 'Professional Services', NULL, 'non_clinical', false,
      ARRAY['Accounting', 'HR coordinator', 'Analyst'], 210)
) AS v(code, name, description, category, needs_license_packet, example_titles, sort_order)
WHERE p.tenant_id IS NULL
  AND lower(p.code) = lower(v.code);

-- ---------------------------------------------------------------------------
-- 3) Remap legacy profession codes → FSD codes (no deletes)
--    RN / LPN / CNA → nursing
--    ALLIED_HEALTH → allied_health
--    ADMIN → administrative
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_old record;
  v_new_id uuid;
  v_spec record;
  v_survivor_id uuid;
  v_loser_id uuid;
BEGIN
  FOR r IN
    SELECT *
    FROM (
      VALUES
        ('RN', 'nursing'),
        ('LPN', 'nursing'),
        ('CNA', 'nursing'),
        ('ALLIED_HEALTH', 'allied_health'),
        ('ADMIN', 'administrative')
    ) AS m(old_code, new_code)
  LOOP
    SELECT id INTO v_new_id
    FROM public.professions
    WHERE tenant_id IS NULL
      AND lower(code) = lower(r.new_code)
    LIMIT 1;

    IF v_new_id IS NULL THEN
      RAISE EXCEPTION 'Missing target FSD profession code: %', r.new_code;
    END IF;

    -- Remap every legacy row with this code (global + any tenant-scoped copies).
    FOR v_old IN
      SELECT id
      FROM public.professions
      WHERE lower(code) = lower(r.old_code)
        AND id <> v_new_id
        -- Exact legacy codes only (never the new snake_case FSD rows).
        AND code = r.old_code
    LOOP
      -- 3a) Specialties: move under new profession; merge duplicate codes.
      FOR v_spec IN
        SELECT s.id, s.code, s.tenant_id
        FROM public.specialties s
        WHERE s.profession_id = v_old.id
      LOOP
        SELECT s2.id INTO v_survivor_id
        FROM public.specialties s2
        WHERE s2.profession_id = v_new_id
          AND lower(s2.code) = lower(v_spec.code)
          AND s2.tenant_id IS NOT DISTINCT FROM v_spec.tenant_id
        LIMIT 1;

        IF v_survivor_id IS NOT NULL AND v_survivor_id <> v_spec.id THEN
          v_loser_id := v_spec.id;

          -- Update profession + specialty together so job integrity trigger stays happy.
          UPDATE public.job_requisitions
          SET profession_id = v_new_id,
              specialty_id = v_survivor_id,
              updated_at = now()
          WHERE specialty_id = v_loser_id;

          UPDATE public.workflow_mappings
          SET specialty_id = v_survivor_id,
              updated_at = now()
          WHERE specialty_id = v_loser_id;

          UPDATE public.specialties
          SET is_active = false,
              updated_at = now()
          WHERE id = v_loser_id;
        ELSE
          UPDATE public.specialties
          SET profession_id = v_new_id,
              updated_at = now()
          WHERE id = v_spec.id;
        END IF;
      END LOOP;

      -- 3b) Jobs: point at new profession (specialty already under new profession).
      UPDATE public.job_requisitions
      SET profession_id = v_new_id,
          updated_at = now()
      WHERE profession_id = v_old.id;

      -- 3c) Workflow mappings: deactivate colliding active rows, then remap.
      WITH candidates AS (
        SELECT
          wm.id,
          wm.tenant_id,
          wm.employment_type,
          COALESCE(wm.specialty_id::text, '') AS specialty_key,
          COALESCE(lower(btrim(wm.location)), '') AS location_key,
          COALESCE(lower(btrim(wm.location_type)), '') AS location_type_key,
          COALESCE(lower(btrim(wm.years_of_experience)), '') AS yoe_key
        FROM public.workflow_mappings wm
        WHERE wm.is_active = true
          AND wm.profession_id = v_old.id
      ),
      collisions AS (
        SELECT c.id AS old_mapping_id
        FROM candidates c
        JOIN public.workflow_mappings existing
          ON existing.is_active = true
         AND existing.tenant_id = c.tenant_id
         AND existing.employment_type = c.employment_type
         AND existing.profession_id = v_new_id
         AND COALESCE(existing.specialty_id::text, '') = c.specialty_key
         AND COALESCE(lower(btrim(existing.location)), '') = c.location_key
         AND COALESCE(lower(btrim(existing.location_type)), '') = c.location_type_key
         AND COALESCE(lower(btrim(existing.years_of_experience)), '') = c.yoe_key
      )
      UPDATE public.workflow_mappings wm
      SET is_active = false,
          updated_at = now()
      FROM collisions col
      WHERE wm.id = col.old_mapping_id;

      UPDATE public.job_requisitions
      SET workflow_mapping_id = NULL,
          updated_at = now()
      WHERE workflow_mapping_id IN (
        SELECT id
        FROM public.workflow_mappings
        WHERE profession_id = v_old.id
          AND is_active = false
      );

      UPDATE public.workflow_mappings
      SET profession_id = v_new_id,
          updated_at = now()
      WHERE profession_id = v_old.id
        AND is_active = true;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Soft-hide legacy codes (keep rows for FK history; hide from new dropdowns)
--     Exact legacy codes only. Never soft-hide FSD snake_case targets
--     (allied_health was renamed from ALLIED_HEALTH in step 1b and must stay active).
-- ---------------------------------------------------------------------------
UPDATE public.professions
SET
  is_active = false,
  updated_at = now()
WHERE code IN ('RN', 'LPN', 'CNA', 'ALLIED_HEALTH', 'ADMIN')
  AND lower(code) NOT IN (
    'nursing',
    'allied_health',
    'radiology',
    'therapy',
    'respiratory',
    'laboratory',
    'pharmacy',
    'behavioral_health',
    'home_care',
    'healthcare_admin',
    'information_technology',
    'warehouse',
    'public_works',
    'skilled_trades',
    'hospitality',
    'retail',
    'cleaning',
    'childcare',
    'customer_service',
    'administrative',
    'professional_services'
  );

-- ---------------------------------------------------------------------------
-- 5) Sanity guard: active global FSD codes must exist
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(required.code, ', ' ORDER BY required.code)
  INTO v_missing
  FROM (
    VALUES
      ('nursing'),
      ('allied_health'),
      ('radiology'),
      ('therapy'),
      ('respiratory'),
      ('laboratory'),
      ('pharmacy'),
      ('behavioral_health'),
      ('home_care'),
      ('healthcare_admin'),
      ('information_technology'),
      ('warehouse'),
      ('public_works'),
      ('skilled_trades'),
      ('hospitality'),
      ('retail'),
      ('cleaning'),
      ('childcare'),
      ('customer_service'),
      ('administrative'),
      ('professional_services')
  ) AS required(code)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.professions p
    WHERE p.tenant_id IS NULL
      AND lower(p.code) = required.code
      AND p.is_active = true
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'profession_catalog_fsd_seed_and_remap: missing active FSD codes: %', v_missing;
  END IF;
END $$;
