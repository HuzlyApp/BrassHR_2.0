-- Staging verification queries for profession_catalog_fsd_seed_and_remap.
-- Run in Supabase SQL Editor after applying the migration.
-- Expect: Query 1–4 show expected counts; Query 5–7 return 0 rows.

-- 1) Active FSD picklist (should be 21 rows)
SELECT code, name, category, needs_license_packet, sort_order, example_titles
FROM public.professions
WHERE tenant_id IS NULL
  AND is_active = true
ORDER BY sort_order, code;

-- 2) Legacy codes soft-hidden (RN, LPN, CNA, ADMIN).
--    ALLIED_HEALTH is renamed to allied_health (same UUID) and stays active — expect 0 rows for it.
SELECT code, name, is_active
FROM public.professions
WHERE code IN ('RN', 'LPN', 'CNA', 'ALLIED_HEALTH', 'ADMIN')
ORDER BY code;

-- 3) Jobs still on legacy profession codes (MUST be 0)
SELECT j.id, j.public_title, p.code AS profession_code
FROM public.job_requisitions j
JOIN public.professions p ON p.id = j.profession_id
WHERE p.code IN ('RN', 'LPN', 'CNA', 'ALLIED_HEALTH', 'ADMIN');

-- 4) Active workflow mappings still on legacy profession codes (MUST be 0)
SELECT wm.id, wm.tenant_id, wm.employment_type, p.code AS profession_code
FROM public.workflow_mappings wm
JOIN public.professions p ON p.id = wm.profession_id
WHERE wm.is_active = true
  AND p.code IN ('RN', 'LPN', 'CNA', 'ALLIED_HEALTH', 'ADMIN');

-- 5) Jobs whose specialty does not belong to the job profession (MUST be 0)
SELECT j.id, j.public_title, jp.code AS job_profession, sp.code AS specialty_code, spp.code AS specialty_profession
FROM public.job_requisitions j
JOIN public.professions jp ON jp.id = j.profession_id
JOIN public.specialties s ON s.id = j.specialty_id
JOIN public.professions spp ON spp.id = s.profession_id
LEFT JOIN public.specialties sp ON sp.id = j.specialty_id
WHERE j.specialty_id IS NOT NULL
  AND s.profession_id IS DISTINCT FROM j.profession_id;

-- 6) Nursing specialties that should have moved (spot-check)
SELECT s.code, s.name, s.is_active, p.code AS profession_code
FROM public.specialties s
JOIN public.professions p ON p.id = s.profession_id
WHERE p.code = 'nursing'
  AND s.tenant_id IS NULL
ORDER BY s.code;

-- 7) Counts by profession on jobs (spot-check remaps landed on nursing / allied_health / administrative)
SELECT p.code, p.name, count(*) AS job_count
FROM public.job_requisitions j
JOIN public.professions p ON p.id = j.profession_id
GROUP BY p.code, p.name
ORDER BY job_count DESC, p.code;
