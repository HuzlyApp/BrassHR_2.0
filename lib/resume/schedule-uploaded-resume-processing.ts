import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAutoQuickMatchForApplication } from "@/lib/jobs/match-analysis/auto-quick-match";
import type { AnalysisProvider } from "@/lib/jobs/match-analysis/schema";
import { softDeleteWorkerResumeRecord } from "@/lib/onboarding/persist-worker-resume-record";
import { syncWorkerPrimaryResumePath } from "@/lib/onboarding/sync-worker-primary-resume-path";
import { runResumeParseJob, type ResumeParseContinuationEmailParams } from "@/lib/resume/run-resume-parse-job";

export type ScheduleUploadedResumeProcessingArgs = {
  supabase: SupabaseClient;
  resumeId: string;
  text: string;
  fileHash?: string | null;
  workerId?: string | null;
  tenantId?: string | null;
  jobApplicationId?: string | null;
  analyzedByUserId?: string | null;
  analysisProvider?: AnalysisProvider;
  reason?: string;
  /** When the new parse succeeds, retire this older row. A failed parse leaves it in place. */
  supersedeResumeId?: string | null;
  skipParse?: boolean;
  skipMatch?: boolean;
  continuationEmail?: ResumeParseContinuationEmailParams;
};

/**
 * One background task for parse + Quick Match. Calling `after()` from inside
 * `after()` drops the second task on Vercel, so both run in this callback.
 */
export function scheduleUploadedResumeProcessing(args: ScheduleUploadedResumeProcessingArgs): void {
  try {
    after(async () => {
      await runUploadedResumeProcessing(args);
    });
  } catch {
    void runUploadedResumeProcessing(args);
  }
}

export async function runUploadedResumeProcessing(
  args: ScheduleUploadedResumeProcessingArgs
): Promise<void> {
  const text = args.text.trim();
  const resumeId = args.resumeId.trim();
  if (!resumeId) return;

  const skipParse = args.skipParse === true;
  const parsePromise =
    !skipParse && text
      ? runResumeParseJob({
          supabase: args.supabase,
          resumeId,
          text,
          fileHash: args.fileHash,
          workerId: args.workerId,
          tenantId: args.tenantId,
          continuationEmail: args.continuationEmail,
        })
      : Promise.resolve(null);

  const matchPromise =
    !args.skipMatch && args.jobApplicationId && args.tenantId
      ? runAutoQuickMatchForApplication({
          supabase: args.supabase,
          tenantId: args.tenantId,
          jobApplicationId: args.jobApplicationId,
          analyzedByUserId: args.analyzedByUserId ?? null,
          analysisProvider: args.analysisProvider,
          reason: args.reason,
        })
      : Promise.resolve(null);

  const [parseResult] = await Promise.all([parsePromise, matchPromise]);
  const supersedeId = args.supersedeResumeId?.trim() || "";
  const workerId = args.workerId?.trim() || "";
  if (
    supersedeId &&
    workerId &&
    supersedeId !== resumeId &&
    parseResult?.parsingStatus === "completed"
  ) {
    await softDeleteWorkerResumeRecord(args.supabase, workerId, supersedeId).catch((error) => {
      console.error("[resume-processing] could not retire previous resume", error);
    });
    await syncWorkerPrimaryResumePath(args.supabase, workerId).catch((error) => {
      console.error("[resume-processing] could not sync primary resume", error);
    });
  }
}
