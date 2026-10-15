-- Candidates KPI metrics: unique-profile aggregation in one database round-trip.
--
-- Replaces the prior per-worker-row RPC so counts match the Candidates list /
-- JS fallback (email or phone+name identity collapse) without paging every
-- worker row into the application server.

CREATE OR REPLACE FUNCTION public.candidate_kpi_metrics(
  p_tenant_id uuid,
  p_pipeline_status text DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := coalesce(p_now, now());
  v_current_start timestamptz := v_now - interval '30 days';
  v_previous_start timestamptz := v_now - interval '60 days';
  v_status text := nullif(lower(btrim(coalesce(p_pipeline_status, ''))), '');
  round integer := 0;
  moved integer := 0;
  result jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'newCandidates', jsonb_build_object('value', 0, 'previous', 0),
      'activeCandidates', jsonb_build_object('value', 0, 'currentWindow', 0, 'previousWindow', 0),
      'analyzed', jsonb_build_object('value', 0, 'currentWindow', 0, 'previousWindow', 0),
      'hired', jsonb_build_object('value', 0, 'currentWindow', 0, 'previousWindow', 0),
      'totalCandidates', 0
    );
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS candidate_kpi_metric_nodes (
    rn integer PRIMARY KEY,
    worker_id uuid NOT NULL,
    created_at timestamptz,
    status_norm text NOT NULL,
    email_key text,
    phone_key text,
    comp integer NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE candidate_kpi_metric_nodes;

  INSERT INTO candidate_kpi_metric_nodes (
    rn, worker_id, created_at, status_norm, email_key, phone_key, comp
  )
  SELECT
    numbered.rn,
    numbered.id,
    numbered.created_at,
    numbered.status_norm,
    numbered.email_key,
    numbered.phone_key,
    numbered.rn
  FROM (
    SELECT
      row_number() OVER ()::integer AS rn,
      base.id,
      base.created_at,
      base.status_norm,
      base.email_key,
      base.phone_key
    FROM (
      SELECT
        w.id,
        w.created_at,
        lower(btrim(coalesce(w.status, ''))) AS status_norm,
        NULLIF(lower(btrim(coalesce(w.email, ''))), '') AS email_key,
        CASE
          WHEN length(regexp_replace(coalesce(w.phone, ''), '\D', '', 'g')) >= 10
           AND length(
             btrim(concat_ws(
               ' ',
               nullif(btrim(coalesce(w.first_name, '')), ''),
               nullif(btrim(coalesce(w.last_name, '')), '')
             ))
           ) > 0
          THEN right(regexp_replace(coalesce(w.phone, ''), '\D', '', 'g'), 10) || ':' ||
               regexp_replace(
                 lower(btrim(concat_ws(
                   ' ',
                   nullif(btrim(coalesce(w.first_name, '')), ''),
                   nullif(btrim(coalesce(w.last_name, '')), '')
                 ))),
                 '\s+',
                 ' ',
                 'g'
               )
          ELSE NULL
        END AS phone_key
      FROM public.worker w
      WHERE w.tenant_id = p_tenant_id
        AND (
          v_status IS NULL
          OR lower(btrim(coalesce(w.status, ''))) = v_status
          OR (
            v_status = 'pending'
            AND lower(btrim(coalesce(w.status, ''))) IN ('pending', 'under_review')
          )
          OR (
            v_status = 'new'
            AND (w.status IS NULL OR btrim(w.status) = '' OR lower(btrim(w.status)) = 'new')
          )
        )
        AND (
          v_status IS NOT NULL
          OR w.status IS NULL
          OR btrim(w.status) = ''
          OR lower(btrim(w.status)) IN (
            'new', 'pending', 'under_review', 'for_approval', 'approved', 'disapproved'
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.workers emp
          WHERE emp.candidate_id = w.id
        )
        AND lower(btrim(coalesce(w.status, ''))) <> 'converted'
    ) base
  ) numbered;

  CREATE INDEX IF NOT EXISTS candidate_kpi_metric_nodes_email_idx
    ON candidate_kpi_metric_nodes (email_key);
  CREATE INDEX IF NOT EXISTS candidate_kpi_metric_nodes_phone_idx
    ON candidate_kpi_metric_nodes (phone_key);
  CREATE INDEX IF NOT EXISTS candidate_kpi_metric_nodes_comp_idx
    ON candidate_kpi_metric_nodes (comp);

  -- Union-find collapse: shared email or phone+name merges into one profile.
  LOOP
    round := round + 1;
    EXIT WHEN round > 16;

    WITH email_min AS (
      SELECT email_key, min(comp) AS comp
      FROM candidate_kpi_metric_nodes
      WHERE email_key IS NOT NULL
      GROUP BY email_key
    ),
    phone_min AS (
      SELECT phone_key, min(comp) AS comp
      FROM candidate_kpi_metric_nodes
      WHERE phone_key IS NOT NULL
      GROUP BY phone_key
    ),
    next_comp AS (
      SELECT
        n.rn,
        LEAST(n.comp, COALESCE(e.comp, n.comp), COALESCE(p.comp, n.comp)) AS comp
      FROM candidate_kpi_metric_nodes n
      LEFT JOIN email_min e ON e.email_key = n.email_key
      LEFT JOIN phone_min p ON p.phone_key = n.phone_key
    )
    UPDATE candidate_kpi_metric_nodes n
    SET comp = next_comp.comp
    FROM next_comp
    WHERE n.rn = next_comp.rn
      AND n.comp IS DISTINCT FROM next_comp.comp;

    GET DIAGNOSTICS moved = ROW_COUNT;
    EXIT WHEN moved = 0;
  END LOOP;

  CREATE TEMP TABLE IF NOT EXISTS candidate_kpi_metric_profiles (
    comp integer PRIMARY KEY,
    created_at timestamptz,
    status_norm text NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE candidate_kpi_metric_profiles;

  -- Representative row matches list/KPI JS: prefer email, then newest created_at, then id.
  INSERT INTO candidate_kpi_metric_profiles (comp, created_at, status_norm)
  SELECT DISTINCT ON (n.comp)
    n.comp,
    n.created_at,
    n.status_norm
  FROM candidate_kpi_metric_nodes n
  ORDER BY
    n.comp,
    (n.email_key IS NOT NULL) DESC,
    n.created_at DESC NULLS LAST,
    n.worker_id ASC;

  CREATE TEMP TABLE IF NOT EXISTS candidate_kpi_metric_analyzed (
    comp integer PRIMARY KEY,
    analyzed_at timestamptz
  ) ON COMMIT DROP;

  TRUNCATE candidate_kpi_metric_analyzed;

  INSERT INTO candidate_kpi_metric_analyzed (comp, analyzed_at)
  SELECT
    n.comp,
    max(ja.ai_analyzed_at) AS analyzed_at
  FROM candidate_kpi_metric_nodes n
  INNER JOIN public.job_applications ja
    ON ja.worker_id = n.worker_id
   AND ja.tenant_id = p_tenant_id
  WHERE ja.ai_match_status = 'ANALYZED'
    AND lower(coalesce(ja.status, '')) NOT IN ('rejected', 'withdrawn')
  GROUP BY n.comp;

  SELECT jsonb_build_object(
    'newCandidates', jsonb_build_object(
      'value', (
        SELECT count(*)::int
        FROM candidate_kpi_metric_profiles p
        WHERE p.created_at >= v_current_start AND p.created_at < v_now
      ),
      'previous', (
        SELECT count(*)::int
        FROM candidate_kpi_metric_profiles p
        WHERE p.created_at >= v_previous_start AND p.created_at < v_current_start
      )
    ),
    'activeCandidates', jsonb_build_object(
      'value', (
        SELECT count(*)::int
        FROM candidate_kpi_metric_profiles p
        WHERE p.status_norm NOT IN ('disapproved', 'rejected')
      ),
      'currentWindow', (
        SELECT count(*)::int
        FROM candidate_kpi_metric_profiles p
        WHERE p.status_norm NOT IN ('disapproved', 'rejected')
          AND p.created_at >= v_current_start AND p.created_at < v_now
      ),
      'previousWindow', (
        SELECT count(*)::int
        FROM candidate_kpi_metric_profiles p
        WHERE p.status_norm NOT IN ('disapproved', 'rejected')
          AND p.created_at >= v_previous_start AND p.created_at < v_current_start
      )
    ),
    'analyzed', jsonb_build_object(
      'value', (SELECT count(*)::int FROM candidate_kpi_metric_analyzed),
      'currentWindow', (
        SELECT count(*)::int
        FROM candidate_kpi_metric_analyzed a
        WHERE a.analyzed_at IS NOT NULL
          AND a.analyzed_at >= v_current_start AND a.analyzed_at < v_now
      ),
      'previousWindow', (
        SELECT count(*)::int
        FROM candidate_kpi_metric_analyzed a
        WHERE a.analyzed_at IS NOT NULL
          AND a.analyzed_at >= v_previous_start AND a.analyzed_at < v_current_start
      )
    ),
    'hired', jsonb_build_object(
      'value', (
        SELECT count(*)::int
        FROM public.workers emp
        WHERE emp.tenant_id = p_tenant_id
          AND emp.candidate_id IS NOT NULL
      ),
      'currentWindow', (
        SELECT count(*)::int
        FROM public.workers emp
        WHERE emp.tenant_id = p_tenant_id
          AND emp.candidate_id IS NOT NULL
          AND emp.created_at >= v_current_start AND emp.created_at < v_now
      ),
      'previousWindow', (
        SELECT count(*)::int
        FROM public.workers emp
        WHERE emp.tenant_id = p_tenant_id
          AND emp.candidate_id IS NOT NULL
          AND emp.created_at >= v_previous_start AND emp.created_at < v_current_start
      )
    ),
    'totalCandidates', (SELECT count(*)::int FROM candidate_kpi_metric_profiles)
  )
  INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.candidate_kpi_metrics(uuid, text, timestamptz) IS
  'Tenant-scoped Candidates KPI aggregates (New/Active/Analyzed/Hired) with unique-profile dedupe. SECURITY INVOKER.';

REVOKE ALL ON FUNCTION public.candidate_kpi_metrics(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.candidate_kpi_metrics(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_kpi_metrics(uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.candidate_kpi_metrics(uuid, text, timestamptz) TO anon;

NOTIFY pgrst, 'reload schema';
