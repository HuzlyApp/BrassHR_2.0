import { NextRequest, NextResponse } from "next/server";
import { requireApprovedApplicant } from "@/lib/applicant-portal/request";
import {
  deleteWorkerResumeForApplicant,
  getWorkerResumeFileUrl,
  listWorkerResumesForApplicant,
  reuploadWorkerResumeForApplicant,
} from "@/lib/applicant-portal/worker-resume-service";
import { isResumeUploadValidationError } from "@/lib/resume/validate-resume-upload";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApprovedApplicant(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await context.params;
    const resumeId = id?.trim();
    if (!resumeId) {
      return NextResponse.json({ error: "Resume id is required." }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Choose a resume file to upload." }, { status: 400 });
    }

    const result = await reuploadWorkerResumeForApplicant(
      auth.supabase,
      auth.applicant,
      auth.user.id,
      resumeId,
      file
    );
    const resumes = await listWorkerResumesForApplicant(
      auth.supabase,
      auth.applicant.id,
      auth.applicant.tenant_id
    );
    return NextResponse.json({ ...result, resumes });
  } catch (err) {
    console.error("[applicant-portal/resumes:patch]", err);
    const status = isResumeUploadValidationError(err) ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reupload resume." },
      { status }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApprovedApplicant(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await context.params;
    const resumeId = id?.trim();
    if (!resumeId) {
      return NextResponse.json({ error: "Resume id is required." }, { status: 400 });
    }

    await deleteWorkerResumeForApplicant(auth.supabase, auth.applicant, resumeId);
    const resumes = await listWorkerResumesForApplicant(
      auth.supabase,
      auth.applicant.id,
      auth.applicant.tenant_id
    );
    return NextResponse.json({ ok: true, resumes });
  } catch (err) {
    console.error("[applicant-portal/resumes:delete]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete resume." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApprovedApplicant(req);
    if (auth instanceof NextResponse) return auth;

    const { id } = await context.params;
    const resumeId = id?.trim();
    if (!resumeId) {
      return NextResponse.json({ error: "Resume id is required." }, { status: 400 });
    }

    const url = await getWorkerResumeFileUrl(auth.supabase, auth.applicant.id, resumeId);
    if (!url) {
      return NextResponse.json({ error: "Resume file not found." }, { status: 404 });
    }

    return NextResponse.json({ url });
  } catch (err) {
    console.error("[applicant-portal/resumes:get-file]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not open resume." },
      { status: 500 }
    );
  }
}
