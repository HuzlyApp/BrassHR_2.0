import { NextRequest, NextResponse } from "next/server";
import { requireApprovedApplicant } from "@/lib/applicant-portal/request";
import {
  listAppliedJobsForWorker,
  listWorkerResumesForApplicant,
  uploadWorkerResumeForApplicant,
} from "@/lib/applicant-portal/worker-resume-service";

import { isResumeUploadValidationError } from "@/lib/resume/validate-resume-upload";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApprovedApplicant(req);
    if (auth instanceof NextResponse) return auth;

    const [resumes, appliedJobs] = await Promise.all([
      listWorkerResumesForApplicant(auth.supabase, auth.applicant.id, auth.applicant.tenant_id),
      listAppliedJobsForWorker(auth.supabase, auth.applicant.id, auth.applicant.tenant_id),
    ]);
    return NextResponse.json({ resumes, appliedJobs });
  } catch (err) {
    console.error("[applicant-portal/resumes:get]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load resumes." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireApprovedApplicant(req);
    if (auth instanceof NextResponse) return auth;

    const formData = await req.formData();
    const file = formData.get("file");
    const jobApplicationIdRaw = formData.get("jobApplicationId");
    const jobApplicationId =
      typeof jobApplicationIdRaw === "string" ? jobApplicationIdRaw.trim() : "";
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a resume file to upload." }, { status: 400 });
    }
    if (!jobApplicationId) {
      return NextResponse.json({ error: "Select a job before uploading your resume." }, { status: 400 });
    }

    const result = await uploadWorkerResumeForApplicant(
      auth.supabase,
      auth.applicant,
      auth.user.id,
      file,
      jobApplicationId
    );

    const [resumes, appliedJobs] = await Promise.all([
      listWorkerResumesForApplicant(auth.supabase, auth.applicant.id, auth.applicant.tenant_id),
      listAppliedJobsForWorker(auth.supabase, auth.applicant.id, auth.applicant.tenant_id),
    ]);
    return NextResponse.json({ ...result, resumes, appliedJobs });
  } catch (err) {
    console.error("[applicant-portal/resumes:post]", err);
    const status = isResumeUploadValidationError(err) ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not upload resume." },
      { status }
    );
  }
}
