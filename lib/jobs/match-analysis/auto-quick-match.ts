import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import {
  runMatchAnalysisBulk,
  runMatchAnalysisForApplication,
  type RunMatchAnalysisResult,
} from "./pipeline";
import {
  DEFAULT_ANALYSIS_PROVIDER,
  type AnalysisProvider,
} from "./schema";

export type AutoQuickMatchResult = {
  status: RunMatchAnalysisResult["status"] | "FAILED";
  error: string | null;
  model: string | null;
  score: number | null;
  category: string | null;
  action: string | null;
  readiness: string | null;
  displayCategory: string | null;
  stage: string | null;
  requirementCounts: RunMatchAnalysisResult["requirementCounts"];
};

function emptyAutoResult(error: string | null): AutoQuickMatchResult {
  return {
    status: "FAILED",
    error,
    model: null,
    score: null,
    category: null,
    action: null,
    readiness: null,
    displayCategory: null,
    stage: null,
    requirementCounts: null,
  };
}

function toAutoResult(result: RunMatchAnalysisResult): AutoQuickMatchResult {
  const displayCategory =
    typeof result.analysis?.candidate_match?.display_category === "string"
      ? result.analysis.candidate_match.display_category
      : null;
  return {
    status: result.status,
    error: result.error,
    model: result.model,
    score: result.score,
    category: result.category,
    action: result.action,
    readiness: result.readiness,
    displayCategory,
    stage: result.status === "ANALYZED" ? "quick" : null,
    requirementCounts: result.requirementCounts,
  };
}

/**
 * Step 1 Quick Match after a résumé is attached to an application.
 * Failures are returned (or logged) so upload/import still succeeds and
 * recruiters can use Re-run Quick Match manually.
 */
export async function runAutoQuickMatchForApplication(args: {
  supabase: SupabaseClient;
  tenantId: string;
  jobApplicationId: string;
  analyzedByUserId?: string | null;
  analysisProvider?: AnalysisProvider;
  reason?: string;
}): Promise<AutoQuickMatchResult> {
  const applicationId = args.jobApplicationId.trim();
  const tenantId = args.tenantId.trim();
  if (!applicationId || !tenantId) {
    return emptyAutoResult("Missing application or tenant for auto Quick Match.");
  }

  try {
    const result = await runMatchAnalysisForApplication({
      supabase: args.supabase,
      tenantId,
      jobApplicationId: applicationId,
      analyzedByUserId: args.analyzedByUserId ?? null,
      analysisMode: "analyze",
      analysisProvider: args.analysisProvider ?? DEFAULT_ANALYSIS_PROVIDER,
    });
    if (result.status !== "ANALYZED") {
      console.warn("[auto-quick-match] finished without ANALYZED", {
        applicationId,
        reason: args.reason ?? null,
        status: result.status,
        error: result.error,
        provider: args.analysisProvider ?? DEFAULT_ANALYSIS_PROVIDER,
      });
    }
    return toAutoResult(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auto Quick Match failed";
    console.error("[auto-quick-match] failed", {
      applicationId,
      reason: args.reason ?? null,
      message,
      provider: args.analysisProvider ?? DEFAULT_ANALYSIS_PROVIDER,
    });
    return emptyAutoResult(message);
  }
}

/** Parallel Quick Match runs after a job-description edit. */
const JOB_DESCRIPTION_REANALYSIS_CONCURRENCY = 3;

/** Keep serverless invocations alive for background Quick Match (Vercel/Next). */
function runInRequestBackground(task: () => Promise<void>): void {
  try {
    after(async () => {
      await task();
    });
  } catch {
    // Outside a request context (tests/scripts) — still fire-and-forget.
    void task();
  }
}

/**
 * Fire-and-forget Quick Match after the HTTP response.
 * Uses Next.js `after()` so Vercel does not freeze the work when the response is sent.
 */
export function scheduleAutoQuickMatchForApplication(args: {
  supabase: SupabaseClient;
  tenantId: string;
  jobApplicationId: string;
  analyzedByUserId?: string | null;
  analysisProvider?: AnalysisProvider;
  reason?: string;
}): void {
  runInRequestBackground(async () => {
    await runAutoQuickMatchForApplication(args);
  });
}

/**
 * Await Step 1 Quick Match for many applications (import / bulk attach).
 * Prefer this over `schedule*` when the HTTP route has enough `maxDuration`.
 */
export async function runAutoQuickMatchForApplications(args: {
  supabase: SupabaseClient;
  tenantId: string;
  jobApplicationIds: string[];
  analyzedByUserId?: string | null;
  analysisProvider?: AnalysisProvider;
  reason?: string;
  concurrency?: number;
}): Promise<AutoQuickMatchResult[]> {
  const ids = [...new Set(args.jobApplicationIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return [];

  try {
    const results = await runMatchAnalysisBulk({
      supabase: args.supabase,
      tenantId: args.tenantId,
      jobApplicationIds: ids,
      analyzedByUserId: args.analyzedByUserId ?? null,
      analysisMode: "analyze",
      analysisProvider: args.analysisProvider ?? DEFAULT_ANALYSIS_PROVIDER,
      concurrency: args.concurrency,
    });
    const mapped = results.map((row) => {
      const result = row.result;
      if (!("analysis" in result)) {
        return emptyAutoResult(result.error || "Auto Quick Match failed");
      }
      return toAutoResult(result);
    });
    const failed = mapped.filter((row) => row.status !== "ANALYZED");
    if (failed.length) {
      console.warn("[auto-quick-match] bulk finished with failures", {
        reason: args.reason ?? null,
        total: mapped.length,
        failed: failed.length,
      });
    }
    return mapped;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[auto-quick-match] bulk failed", {
      reason: args.reason ?? null,
      message,
    });
    return ids.map(() => emptyAutoResult(message));
  }
}

export function scheduleAutoQuickMatchForApplications(args: {
  supabase: SupabaseClient;
  tenantId: string;
  jobApplicationIds: string[];
  analyzedByUserId?: string | null;
  analysisProvider?: AnalysisProvider;
  reason?: string;
  concurrency?: number;
}): void {
  const ids = [...new Set(args.jobApplicationIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return;
  runInRequestBackground(async () => {
    await runAutoQuickMatchForApplications({ ...args, jobApplicationIds: ids });
  });
}

/**
 * Re-run Quick Match for applications whose scores were cleared because the
 * job description (or other matching fields) changed.
 */
export function scheduleReanalysisAfterJobDescriptionChange(args: {
  supabase: SupabaseClient;
  tenantId: string;
  jobApplicationIds: string[];
  analyzedByUserId?: string | null;
}): number {
  const ids = [...new Set(args.jobApplicationIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return 0;
  scheduleAutoQuickMatchForApplications({
    supabase: args.supabase,
    tenantId: args.tenantId,
    jobApplicationIds: ids,
    analyzedByUserId: args.analyzedByUserId ?? null,
    reason: "job_description_changed",
    concurrency: JOB_DESCRIPTION_REANALYSIS_CONCURRENCY,
  });
  return ids.length;
}
