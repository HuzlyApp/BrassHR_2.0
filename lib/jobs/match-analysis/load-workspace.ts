import type { SupabaseClient } from "@supabase/supabase-js";
import { loadWorkerNotesForWorkerId } from "@/lib/worker-notes";
import { loadApplicationScreeningContext } from "@/lib/jobs/screening-questions";
import { pickResumeForApplication } from "./pick-resume-for-application";
import { ensureApplicationResumeFromWorker } from "./ensure-application-resume";
import { getMatchAnalysisModelName } from "./service";
import { getMatchStepModels } from "./step-config";
import { isMatchCallPackStatus } from "./call-pack-status";
import { listScreeningUploads } from "./screening-uploads";
import {
  loadVerificationNoteAuditForApplication,
  loadVerificationNotesForApplication,
} from "./verification-notes-service";
import { summarizeRequirementNotes } from "./verification-notes";
import { loadAnalysisHistory } from "./versions";
import {
  aiScreeningQuestionKey,
  matchSavedAiScreeningAnswer,
  normalizeAnalysisScreeningQuestions,
  CALL_CONTEXT_QUESTION_KEY,
} from "./workspace";
import type { MatchAnalysisResponse } from "./schema";
import { publicJobDisplayTitle } from "@/lib/jobs/public-application-routing";
import { industryKeyFromLegacyLabel } from "@/lib/ai-catalog/industry-catalog";
import { PromptNotConfiguredError } from "@/lib/ai-catalog/errors";
import { resolvePromptVersion } from "@/lib/ai-catalog/resolve-prompt";
import type { AiVariantKey } from "@/lib/ai-catalog/types";
import { jobRequirementsSourceFingerprint } from "./build-job-requirements";
import { analysisPromptIsStale, storedAnalysisPromptStamp } from "./prompt-stamp";

function displayName(first: string | null | undefined, last: string | null | undefined, email?: string | null) {
  const name = `${first ?? ""} ${last ?? ""}`.trim();
  return name || email?.trim() || null;
}

function questionsWithAnswers(
  raw: unknown,
  stage: "call_pack" | "follow_up" | "deep",
  answersByKey: Map<string, { question_key: string; question_text?: string | null; answer_text?: string | null }>
) {
  return normalizeAnalysisScreeningQuestions(raw).map((question) => {
    const baseKey = aiScreeningQuestionKey(question.priority, question.question);
    const key = stage === "call_pack" ? baseKey : `${stage}:${baseKey}`;
    // Prefer the staged key, then fall back to exact question text so reworded
    // regenerations do not hide notes the recruiter already recorded.
    const saved =
      matchSavedAiScreeningAnswer(answersByKey, key, question.question) ??
      (stage === "call_pack"
        ? undefined
        : matchSavedAiScreeningAnswer(answersByKey, baseKey, question.question));
    return {
      key,
      priority: question.priority,
      question: question.question,
      reason: question.reason,
      relatedRequirement: question.relatedRequirement,
      answer: saved?.answer_text ?? "",
    };
  });
}

export async function loadMatchAnalysisWorkspace(
  supabase: SupabaseClient,
  tenantId: string,
  applicationId: string
) {
  const { data: application, error } = await supabase
    .from("job_applications")
    .select(
      "id, tenant_id, job_requisition_id, worker_id, status, status_id, created_at, updated_at, submitted_at, created_by_staff_user_id, assigned_recruiter_user_id, ai_match_status, ai_match_score, ai_match_category, ai_match_action, ai_match_readiness, ai_match_display_category, ai_match_stage, ai_analysis, ai_analyzed_at, ai_analyzed_by, ai_analysis_error, ai_analysis_progress, ai_analysis_version, ai_analysis_model, recruiter_decision, recruiter_decision_note, recruiter_decision_at, recruiter_decision_by, application_statuses(id, name, system_key)"
    )
    .eq("id", applicationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!application) return null;

  const analysis = (application.ai_analysis ?? null) as MatchAnalysisResponse | null;

  const jobId = String(application.job_requisition_id ?? "").trim();
  const jobPromise = jobId
    ? supabase
        .from("job_requisitions")
        .select(
          "id, public_title, location, facility, facility_name, public_description, qualifications, responsibilities, special_requirements, required_credentials, years_of_experience, years_experience_required, specialty, industry_key, msp_client, msp_name"
        )
        .eq("id", jobId)
        .eq("tenant_id", tenantId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [
    requirementsResult,
    screening,
    verifiedResult,
    aiAnswersResult,
    history,
    verificationNotes,
    verificationNoteAudit,
    screeningUploads,
    jobResult,
  ] = await Promise.all([
    supabase
      .from("job_application_match_requirements")
      .select(
        "id, requirement_text, requirement_type, status, requirement_outcome, candidate_evidence, evidence_source, impact, verification_required, confidence, sort_order, recruiter_verified, recruiter_note, recruiter_verified_at"
      )
      .eq("job_application_id", applicationId)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true }),
    loadApplicationScreeningContext(
      supabase,
      tenantId,
      applicationId,
      String(application.job_requisition_id)
    ).catch(() => ({
      questions: [],
      assessment: {
        answered: 0,
        total: 0,
        requiredAnswered: 0,
        requiredTotal: 0,
        summary: "Could not load screening answers.",
      },
    })),
    supabase
      .from("job_application_verified_information")
      .select("id, category, title, details, verified_by, verified_at, created_at")
      .eq("tenant_id", tenantId)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_application_ai_screening_answers")
      .select("id, question_key, question_text, reason, related_requirement, answer_text, updated_at")
      .eq("tenant_id", tenantId)
      .eq("application_id", applicationId),
    loadAnalysisHistory(supabase, tenantId, applicationId, true).catch(() => []),
    loadVerificationNotesForApplication(supabase, tenantId, applicationId).catch(() => []),
    loadVerificationNoteAuditForApplication(supabase, tenantId, applicationId, {
      limit: 100,
    }).catch(() => []),
    listScreeningUploads(supabase, tenantId, applicationId).catch(() => []),
    jobPromise,
  ]);

  const verificationNoteSummaries = summarizeRequirementNotes(verificationNotes);

  const userIds = [
    application.created_by_staff_user_id,
    application.assigned_recruiter_user_id,
    application.ai_analyzed_by,
    application.recruiter_decision_by,
    ...(verifiedResult.data ?? []).map((row) => row.verified_by),
  ].filter((id): id is string => Boolean(id));

  const usersById = new Map<string, { id: string; name: string; email: string }>();
  if (userIds.length) {
    const { data: users } = await supabase
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("tenant_id", tenantId)
      .in("id", Array.from(new Set(userIds)));
    for (const user of users ?? []) {
      usersById.set(String(user.id), {
        id: String(user.id),
        name: displayName(user.first_name, user.last_name, user.email) || "Team member",
        email: String(user.email ?? ""),
      });
    }
  }

  const notes = application.worker_id
    ? await loadWorkerNotesForWorkerId(supabase, String(application.worker_id), {
        applicationId,
      }).catch(() => [])
    : [];

  if (aiAnswersResult.error) throw aiAnswersResult.error;

  const aiAnswersByKey = new Map(
    (aiAnswersResult.data ?? []).map((row) => [String(row.question_key), row])
  );
  const callContext =
    String(aiAnswersByKey.get(CALL_CONTEXT_QUESTION_KEY)?.answer_text ?? "").trim() || "";
  const recommendedQuestions = questionsWithAnswers(
    analysis?.screening_questions,
    "call_pack",
    aiAnswersByKey
  );
  const followUpQuestions = questionsWithAnswers(
    analysis?.follow_up_questions,
    "follow_up",
    aiAnswersByKey
  );
  const deepQuestions = questionsWithAnswers(
    analysis?.deep_screening_questions,
    "deep",
    aiAnswersByKey
  );
  const questionSetsStale = {
    call_pack: analysis?.question_sets_stale?.call_pack === true,
    follow_up: analysis?.question_sets_stale?.follow_up === true,
    deep: analysis?.question_sets_stale?.deep === true,
  };

  let extractedResume: { text: string; fileName: string | null } | null = null;
  const { data: resumeRow } = await supabase
    .from("worker_resumes")
    .select("extracted_text, file_name, original_file_name, job_application_id, uploaded_at")
    .eq("tenant_id", tenantId)
    .eq("job_application_id", applicationId)
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false })
    .limit(5);
  const preferred = pickResumeForApplication(resumeRow, applicationId);
  if (preferred?.extracted_text || preferred?.original_file_name || preferred?.file_name) {
    extractedResume = {
      text: String(preferred.extracted_text ?? ""),
      fileName: String(preferred.original_file_name || preferred.file_name || "Resume"),
    };
  } else {
    // Imported / talent-pool candidates: attach the worker's existing résumé to this job.
    const ensured = await ensureApplicationResumeFromWorker({
      supabase,
      tenantId,
      applicationId,
      workerId:
        typeof application.worker_id === "string" ? application.worker_id : null,
    });
    if (ensured) {
      extractedResume = { text: ensured.text, fileName: ensured.fileName };
    }
  }

  const statusRel = Array.isArray(application.application_statuses)
    ? application.application_statuses[0]
    : application.application_statuses;
  const statusName =
    statusRel && typeof statusRel === "object" && typeof (statusRel as { name?: unknown }).name === "string"
      ? String((statusRel as { name: string }).name)
      : String(application.status ?? "");
  const statusSystemKey =
    statusRel &&
    typeof statusRel === "object" &&
    typeof (statusRel as { system_key?: unknown }).system_key === "string"
      ? String((statusRel as { system_key: string }).system_key)
      : null;
  const stepModels = getMatchStepModels();
  const jobRow = jobResult.data;
  const liveJobFingerprint = jobRow
    ? jobRequirementsSourceFingerprint({
        public_title: typeof jobRow.public_title === "string" ? jobRow.public_title : null,
        public_description:
          typeof jobRow.public_description === "string" ? jobRow.public_description : null,
        qualifications: typeof jobRow.qualifications === "string" ? jobRow.qualifications : null,
        responsibilities:
          typeof jobRow.responsibilities === "string" ? jobRow.responsibilities : null,
        special_requirements:
          typeof jobRow.special_requirements === "string" ? jobRow.special_requirements : null,
        required_credentials: jobRow.required_credentials,
        years_of_experience:
          typeof jobRow.years_of_experience === "string" ? jobRow.years_of_experience : null,
        years_experience_required:
          typeof jobRow.years_experience_required === "number"
            ? jobRow.years_experience_required
            : null,
        location: typeof jobRow.location === "string" ? jobRow.location : null,
        specialty: typeof jobRow.specialty === "string" ? jobRow.specialty : null,
      })
    : null;
  const storedFingerprint =
    analysis && typeof analysis.job_requirements_fingerprint === "string"
      ? analysis.job_requirements_fingerprint
      : null;
  const analysisStaleDueToJobUpdate = Boolean(
    application.ai_match_status === "ANALYZED" &&
      liveJobFingerprint &&
      storedFingerprint &&
      storedFingerprint !== liveJobFingerprint
  );
  const promptStamp = storedAnalysisPromptStamp(analysis);
  const analysisStaleDueToPrompt =
    !analysisStaleDueToJobUpdate &&
    application.ai_match_status === "ANALYZED" &&
    promptStamp.contentHash &&
    promptStamp.variantKey
      ? await publishedPromptHashDiffers({
          supabase,
          tenantId,
          variantKey: promptStamp.variantKey as AiVariantKey,
          storedHash: promptStamp.contentHash,
          jobIndustryKey:
            typeof jobRow?.industry_key === "string" ? jobRow.industry_key : null,
          clientName:
            typeof jobRow?.msp_client === "string" && jobRow.msp_client.trim()
              ? jobRow.msp_client
              : typeof jobRow?.msp_name === "string"
                ? jobRow.msp_name
                : null,
          sourceKey: typeof jobRow?.msp_name === "string" ? jobRow.msp_name : null,
        })
      : false;
  const analysisIsStale = analysisStaleDueToJobUpdate || analysisStaleDueToPrompt;
  const effectiveAnalysis = analysisIsStale ? null : analysis;
  const jobTitleFromRequisition = jobRow
    ? publicJobDisplayTitle({
        public_title: typeof jobRow.public_title === "string" ? jobRow.public_title : null,
      })
    : "";
  const jobTitle =
    (jobTitleFromRequisition && jobTitleFromRequisition !== "Untitled job"
      ? jobTitleFromRequisition
      : "") ||
    effectiveAnalysis?.job?.job_title?.trim() ||
    "";

  return {
    application: {
      ...application,
      ai_analysis: effectiveAnalysis,
      ai_match_status: analysisIsStale ? "READY" : application.ai_match_status,
      ai_match_score: analysisIsStale ? null : application.ai_match_score,
      ai_match_category: analysisIsStale ? null : application.ai_match_category,
      ai_match_action: analysisIsStale ? null : application.ai_match_action,
      ai_match_readiness: analysisIsStale ? null : application.ai_match_readiness,
      ai_match_display_category: analysisIsStale
        ? null
        : application.ai_match_display_category,
      ai_analysis_error: analysisStaleDueToJobUpdate
        ? "Job description changed since this analysis. Re-run match analysis."
        : analysisStaleDueToPrompt
          ? "The match prompt changed since this analysis. Re-run match analysis."
          : application.ai_analysis_error,
      ai_analysis_model: application.ai_analysis_model || getMatchAnalysisModelName(),
      ai_match_stage: analysisIsStale ? null : application.ai_match_stage ?? null,
      status_name: statusName,
      status_system_key: statusSystemKey,
    },
    analysisStaleDueToJobUpdate,
    job: jobId
      ? {
          id: jobId,
          title: jobTitle || null,
          location:
            (typeof jobRow?.location === "string" && jobRow.location.trim()) ||
            (typeof jobRow?.facility_name === "string" && jobRow.facility_name.trim()) ||
            (typeof jobRow?.facility === "string" && jobRow.facility.trim()) ||
            null,
        }
      : null,
    requirements: (requirementsResult.data ?? []).map((row) => {
      const summary = verificationNoteSummaries.get(String(row.id));
      return {
        ...row,
        verification_note_count: summary?.noteCount ?? 0,
        has_pending_verification_note: summary?.hasPending ?? false,
        has_verification_decision: summary?.hasDecision ?? false,
        latest_verification_note: summary?.latestNote ?? null,
      };
    }),
    screeningQuestions: screening.questions,
    screeningAssessment: screening.assessment,
    recommendedQuestions,
    followUpQuestions,
    deepQuestions,
    questionSetsStale,
    callContext,
    screeningUploads,
    verifiedInformation: (verifiedResult.data ?? []).map((row) => ({
      id: String(row.id),
      category: String(row.category),
      title: String(row.title),
      details: row.details ? String(row.details) : null,
      verifiedAt: String(row.verified_at),
      verifiedByName: row.verified_by ? usersById.get(String(row.verified_by))?.name ?? "Recruiter" : "Recruiter",
    })),
    verificationNotes,
    verificationNoteAudit,
    notes,
    analysisHistory: history,
    extractedResume,
    assignedRecruiter: application.assigned_recruiter_user_id
      ? usersById.get(String(application.assigned_recruiter_user_id)) ?? null
      : null,
    analyzedByName: application.ai_analyzed_by
      ? usersById.get(String(application.ai_analyzed_by))?.name ?? null
      : null,
    createdByName: application.created_by_staff_user_id
      ? usersById.get(String(application.created_by_staff_user_id))?.name ?? null
      : null,
    decisionByName: application.recruiter_decision_by
      ? usersById.get(String(application.recruiter_decision_by))?.name ?? null
      : null,
    modelName: application.ai_analysis_model || getMatchAnalysisModelName(),
    claudeAvailable: Boolean(process.env.CLAUDE_API_KEY?.trim()),
    matchProgression: {
      stage: analysisIsStale ? null : application.ai_match_stage ?? null,
      callPackUnlocked: isMatchCallPackStatus({
        statusName,
        systemKey: statusSystemKey,
      }),
      requireDeepConfirm: stepModels.requireRecruiterConfirm,
      deepModel: stepModels.step3Deep,
    },
  };
}

async function publishedPromptHashDiffers(args: {
  supabase: SupabaseClient;
  tenantId: string;
  variantKey: AiVariantKey;
  storedHash: string;
  jobIndustryKey: string | null;
  clientName: string | null;
  sourceKey: string | null;
}): Promise<boolean> {
  const { data: tenantRow } = await args.supabase
    .from("tenants")
    .select("primary_industry_key, industry")
    .eq("id", args.tenantId)
    .maybeSingle();
  const tenantPrimary =
    typeof tenantRow?.primary_industry_key === "string" && tenantRow.primary_industry_key.trim()
      ? String(tenantRow.primary_industry_key)
      : industryKeyFromLegacyLabel(
          typeof tenantRow?.industry === "string" ? tenantRow.industry : null
        );
  try {
    const resolved = await resolvePromptVersion(args.supabase, {
      tenantId: args.tenantId,
      featureKey: "candidate_match",
      variantKey: args.variantKey,
      industryKey: args.jobIndustryKey,
      tenantPrimaryIndustryKey: tenantPrimary,
      clientName: args.clientName,
      sourceKey: args.sourceKey,
    });
    return analysisPromptIsStale(args.storedHash, resolved.contentHash);
  } catch (error) {
    if (error instanceof PromptNotConfiguredError) return false;
    console.warn("[match-analysis] could not compare stored prompt hash", error);
    return false;
  }
}