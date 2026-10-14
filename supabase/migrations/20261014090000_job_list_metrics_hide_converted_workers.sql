-- Jobs dashboard card counts must match the Job candidates list. staff_application_list_page
-- hides applications of candidates who became employment workers (worker.status = 'converted',
-- or a public.workers row for the candidate or hired from this application), so the per-job
-- metrics apply the same rule.

CREATE OR REPLACE FUNCTION public.job_list_application_metrics(p_tenant_id uuid)
RETURNS TABLE (
  job_requisition_id uuid,
  applicant_count integer,
  new_count integer,
  in_process_count integer,
  analyzed_count integer,
  strong_count integer,
  ready_count integer,
  hired_count integer,
  in_process_redirect_tab text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH rows AS (
    SELECT
      ja.job_requisition_id,
      CASE lower(btrim(coalesce(ja.status, '')))
        WHEN 'submitted' THEN 'new'
        WHEN 'in_progress' THEN 'reviewing'
        WHEN 'withdrawn' THEN 'undecided'
        WHEN 'new' THEN 'new'
        WHEN 'reviewing' THEN 'reviewing'
        WHEN 'interviewing' THEN 'interviewing'
        WHEN 'rejected' THEN 'rejected'
        WHEN 'hired' THEN 'hired'
        WHEN 'shortlisted' THEN 'shortlisted'
        WHEN 'undecided' THEN 'undecided'
        WHEN 'archived' THEN 'archived'
        ELSE 'reviewing'
      END AS pipeline,
      ja.ai_match_status,
      ja.ai_match_score,
      ja.ai_match_readiness,
      ja.ai_analyzed_at,
      coalesce(nullif(lower(btrim(st.system_key)), ''), NULL) AS system_key
    FROM public.job_applications ja
    LEFT JOIN public.application_statuses st ON st.id = ja.status_id
    LEFT JOIN public.worker w ON w.id = ja.worker_id
    WHERE ja.tenant_id = p_tenant_id
      AND lower(btrim(coalesce(w.status, ''))) <> 'converted'
      AND NOT EXISTS (
        SELECT 1 FROM public.workers emp WHERE emp.candidate_id = ja.worker_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.workers emp WHERE emp.source_job_application_id = ja.id
      )
  ),
  flagged AS (
    SELECT
      rows.*,
      (pipeline IN ('reviewing', 'shortlisted', 'interviewing')) AS in_process,
      (
        ai_match_status = 'ANALYZED'
        OR ai_match_score IS NOT NULL
        OR ai_analyzed_at IS NOT NULL
      ) AS analyzed
    FROM rows
  ),
  redirect_counts AS (
    SELECT
      job_requisition_id,
      coalesce(system_key, pipeline) AS tab,
      count(*) AS n
    FROM flagged
    WHERE in_process
    GROUP BY job_requisition_id, coalesce(system_key, pipeline)
  ),
  redirect AS (
    SELECT DISTINCT ON (job_requisition_id)
      job_requisition_id,
      tab
    FROM redirect_counts
    ORDER BY job_requisition_id, n DESC, tab ASC
  )
  SELECT
    f.job_requisition_id,
    count(*)::integer AS applicant_count,
    count(*) FILTER (WHERE f.pipeline = 'new')::integer AS new_count,
    count(*) FILTER (WHERE f.in_process)::integer AS in_process_count,
    count(*) FILTER (WHERE f.analyzed)::integer AS analyzed_count,
    count(*) FILTER (WHERE f.ai_match_score >= 90)::integer AS strong_count,
    count(*) FILTER (
      WHERE f.analyzed AND f.ai_match_readiness = 'READY_TO_SUBMIT'
    )::integer AS ready_count,
    count(*) FILTER (WHERE f.pipeline = 'hired')::integer AS hired_count,
    max(r.tab) AS in_process_redirect_tab
  FROM flagged f
  LEFT JOIN redirect r ON r.job_requisition_id = f.job_requisition_id
  GROUP BY f.job_requisition_id;
$$;

COMMENT ON FUNCTION public.job_list_application_metrics(uuid) IS
  'Per-job candidate counts for the jobs list. Excludes candidates converted to employment workers, like staff_application_list_page.';

REVOKE ALL ON FUNCTION public.job_list_application_metrics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.job_list_application_metrics(uuid) TO service_role;
