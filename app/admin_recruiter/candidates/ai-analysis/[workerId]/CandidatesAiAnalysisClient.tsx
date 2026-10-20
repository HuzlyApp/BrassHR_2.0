"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AiAnalysisOverviewClient } from "@/app/admin_recruiter/applications/ai-analysis/AiAnalysisOverviewClient";
import {
  CANDIDATES_PAGE_TITLE_CLASS,
  CANDIDATES_PAGE_TITLE_STYLE,
} from "@/app/admin_recruiter/candidates/candidates-typography";
import { CandidatesBreadcrumb } from "@/app/admin_recruiter/jobs/JobsBreadcrumb";

type ApplicationListRow = {
  id?: string;
  job_requisition_id?: string | null;
  ai_match_status?: string | null;
  ai_match_score?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function rowTimestamp(row: ApplicationListRow): number {
  const raw = row.updated_at || row.created_at || 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Prefer listing match application, else highest ANALYZED score, else newest. */
function pickApplicationForAnalysis(
  rows: ApplicationListRow[],
  preferredApplicationId?: string | null
): ApplicationListRow | null {
  if (rows.length === 0) return null;
  const preferred = preferredApplicationId?.trim();
  if (preferred) {
    const match = rows.find((row) => row.id === preferred);
    if (match) return match;
  }

  const analyzed = rows.filter(
    (row) =>
      row.ai_match_status === "ANALYZED" &&
      row.ai_match_score != null &&
      Number.isFinite(Number(row.ai_match_score))
  );
  if (analyzed.length > 0) {
    return [...analyzed].sort((a, b) => {
      const scoreDiff = Number(b.ai_match_score) - Number(a.ai_match_score);
      if (scoreDiff !== 0) return scoreDiff;
      return rowTimestamp(b) - rowTimestamp(a);
    })[0];
  }

  return [...rows].sort((a, b) => rowTimestamp(b) - rowTimestamp(a))[0];
}

type CandidatesAiAnalysisClientProps = {
  workerId: string;
  backHref?: string;
  embedded?: boolean;
};

export function CandidatesAiAnalysisClient({
  workerId,
  backHref,
  embedded = false,
}: CandidatesAiAnalysisClientProps) {
  const searchParams = useSearchParams();
  const preferredApplicationId = searchParams.get("applicationId");
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = workerId.trim();
    if (!id) {
      setError("Missing candidate.");
      setLoading(false);
      return;
    }

    async function run() {
      try {
        const response = await fetch(
          `/api/admin/job-applications?workerId=${encodeURIComponent(id)}`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as {
          error?: string;
          applications?: ApplicationListRow[];
        };
        if (!response.ok) throw new Error(payload.error || "Failed to load applications");
        const rows = Array.isArray(payload.applications) ? payload.applications : [];
        const chosen = pickApplicationForAnalysis(rows, preferredApplicationId);
        if (cancelled) return;
        setApplicationId(typeof chosen?.id === "string" ? chosen.id : null);
        setJobId(
          typeof chosen?.job_requisition_id === "string" ? chosen.job_requisition_id : undefined
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load AI analysis.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [workerId, preferredApplicationId]);

  if (loading) {
    return (
      <div className="box-border w-full min-w-0 max-w-full px-3 pb-10 pt-4 sm:px-5 sm:pt-5 lg:px-8">
        <div className="mt-8 flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-6 text-sm text-[#667085]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading AI analysis…
        </div>
      </div>
    );
  }

  if (error || !applicationId) {
    return (
      <div className="box-border w-full min-w-0 max-w-full px-3 pb-10 pt-4 sm:px-5 sm:pt-5 lg:px-8">
        <CandidatesBreadcrumb currentLabel="AI Analysis" />
        <h1 className={CANDIDATES_PAGE_TITLE_CLASS} style={CANDIDATES_PAGE_TITLE_STYLE}>
          AI Analysis Overview
        </h1>
        <p className="mt-4 rounded-xl border border-[#E5E7EB] bg-white px-4 py-6 text-sm text-[#667085]">
          {error ||
            "This candidate does not have a job application to analyze yet. Add them to a job, then open AI Analysis."}
        </p>
      </div>
    );
  }

  const resolvedBackHref = backHref?.trim() || "/admin_recruiter/candidates";

  return (
    <AiAnalysisOverviewClient
      applicationId={applicationId}
      backHref={resolvedBackHref}
      jobId={jobId}
      embedded={embedded}
    />
  );
}
