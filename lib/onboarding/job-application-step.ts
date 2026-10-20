import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadApplicationScreeningContext,
  type ApplicationScreeningQuestionView,
} from "@/lib/jobs/screening-questions";
import type { JobApplicationParameters } from "@/lib/onboarding/job-application-parameters";

export type JobApplicationStepView = {
  job: { id: string; title: string | null; jobNumber: string | null } | null;
  /** The job requisition's details. */
  values: JobApplicationParameters | null;
  screening: Array<
    Pick<ApplicationScreeningQuestionView, "id" | "question" | "isRequired" | "answered" | "answerDisplay">
  >;
};

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function loadApplicationJobId(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string | null
): Promise<string | null> {
  if (!applicationId) return null;
  const { data, error } = await supabase
    .from("job_applications")
    .select("job_requisition_id")
    .eq("tenant_id", tenantId)
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw error;
  return asText((data as { job_requisition_id?: string } | null)?.job_requisition_id);
}

async function lookupName(
  supabase: SupabaseClient,
  table: "professions" | "specialties",
  id: string | null
): Promise<string | null> {
  if (!id) return null;
  const { data } = await supabase.from(table).select("name").eq("id", id).maybeSingle();
  return asText((data as { name?: string } | null)?.name);
}

export async function loadJobRequisitionParameters(
  supabase: SupabaseClient,
  tenantId: string,
  jobId: string
): Promise<{ job: NonNullable<JobApplicationStepView["job"]>; values: JobApplicationParameters } | null> {
  const { data: job, error } = await supabase
    .from("job_requisitions")
    .select(
      "id, job_number, internal_requisition_number, external_requisition_id, public_title, source_job_title, profession, specialty, profession_id, specialty_id, location, city, employment_type, target_start_date"
    )
    .eq("tenant_id", tenantId)
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  if (!job) return null;
  const row = job as Record<string, unknown>;

  const [professionName, specialtyName] = await Promise.all([
    lookupName(supabase, "professions", asText(row.profession_id)),
    lookupName(supabase, "specialties", asText(row.specialty_id)),
  ]);
  const jobNumber =
    asText(row.job_number) ?? asText(row.internal_requisition_number) ?? asText(row.external_requisition_id);
  const startDate = asText(row.target_start_date);

  return {
    job: {
      id: String(row.id),
      title: asText(row.public_title) ?? asText(row.source_job_title),
      jobNumber,
    },
    values: {
      requisition: jobNumber ?? "",
      profession: professionName ?? asText(row.profession) ?? "",
      specialty: specialtyName ?? asText(row.specialty) ?? "",
      location: asText(row.location) ?? asText(row.city) ?? "",
      w2Classification: asText(row.employment_type) ?? "",
      expectedStartDate: startDate ? startDate.slice(0, 10) : "",
    },
  };
}

export async function loadJobApplicationStepView(
  supabase: SupabaseClient,
  params: { tenantId: string; applicationId: string | null }
): Promise<JobApplicationStepView> {
  const jobId = await loadApplicationJobId(supabase, params.tenantId, params.applicationId);
  const [requisition, screening] = await Promise.all([
    jobId ? loadJobRequisitionParameters(supabase, params.tenantId, jobId) : Promise.resolve(null),
    jobId && params.applicationId
      ? loadApplicationScreeningContext(supabase, params.tenantId, params.applicationId, jobId)
          .then((context) => context.questions)
          .catch((error) => {
            console.error("[job-application-step] screening answers unavailable", error);
            return [] as ApplicationScreeningQuestionView[];
          })
      : Promise.resolve([] as ApplicationScreeningQuestionView[]),
  ]);

  return {
    job: requisition?.job ?? null,
    values: requisition?.values ?? null,
    screening: screening.map((question) => ({
      id: question.id,
      question: question.question,
      isRequired: question.isRequired,
      answered: question.answered,
      answerDisplay: question.answerDisplay,
    })),
  };
}
