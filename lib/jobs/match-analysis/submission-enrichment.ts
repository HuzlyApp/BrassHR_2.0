import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchAnalysisResponse } from "./schema";
import {
  CALL_CONTEXT_QUESTION_KEY,
  aiScreeningQuestionKey,
  isCallContextQuestionKey,
  normalizeAnalysisScreeningQuestions,
  type AnalysisScreeningQuestion,
} from "./workspace";

/** Keep both Q&A blocks even when verified notes are long. */
const MAX_ENRICHMENT_CHARS = 24_000;

export const SCREENING_RESPONSES_HEADING = "Screening question responses:";
export const FOLLOW_UP_QA_HEADING = "Follow-up questions and answers:";
export const INTERVIEW_NOTES_HEADING = "Interview notes:";

export type SubmissionAiAnswerRow = {
  question_key: string;
  question_text?: string | null;
  answer_text?: string | null;
};

export type SubmissionInterviewNoteRow = {
  label?: string | null;
  body?: string | null;
};

export type SubmissionEnrichmentPack = {
  /** Full Q&A text sent to the résumé model. */
  promptNotes: string;
  /** Answer text, verified details, and notes only. Question stems are not evidence. */
  evidenceNotes: string;
};

export function formatVerifiedInfoForSubmission(
  items: Array<{ category?: string | null; title?: string | null; details?: string | null }>
): string {
  const lines = items
    .map((item) => {
      const label = [item.category, item.title]
        .map((part) => String(part ?? "").trim())
        .filter(Boolean)
        .join(" · ");
      const details = String(item.details ?? "").trim();
      if (!label && !details) return null;
      if (!label) return `- ${details}`;
      if (!details) return `- ${label}`;
      return `- ${label}: ${details}`;
    })
    .filter((line): line is string => Boolean(line));
  if (!lines.length) return "";
  return `Verified information:\n${lines.join("\n")}`;
}

export function formatStoredScreeningAnswer(answer: unknown): string {
  if (answer == null) return "";
  if (typeof answer === "boolean") return answer ? "Yes" : "No";
  if (typeof answer === "string" || typeof answer === "number") return String(answer).trim();
  if (Array.isArray(answer)) {
    return answer
      .map((item) => formatStoredScreeningAnswer(item))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof answer === "object") {
    const record = answer as Record<string, unknown>;
    if ("value" in record) return formatStoredScreeningAnswer(record.value);
  }
  return "";
}

type QaPair = { question: string; answer: string };

function qaSection(heading: string, pairs: QaPair[]): string {
  if (!pairs.length) return `${heading}\n(none)`;
  const body = pairs.map((pair) => `Q: ${pair.question}\nA: ${pair.answer}`).join("\n\n");
  return `${heading}\n${body}`;
}

function screeningSection(pairs: QaPair[], callContext: string): string {
  const lines = [SCREENING_RESPONSES_HEADING];
  if (callContext) lines.push(`Call context:\n${callContext}`);
  if (pairs.length) {
    lines.push(pairs.map((pair) => `Q: ${pair.question}\nA: ${pair.answer}`).join("\n\n"));
  } else if (!callContext) {
    lines.push("(none)");
  }
  return lines.join("\n");
}

function lookupStageAnswer(
  byKey: Map<string, SubmissionAiAnswerRow>,
  stage: "call_pack" | "follow_up",
  question: AnalysisScreeningQuestion
): SubmissionAiAnswerRow | undefined {
  const baseKey = aiScreeningQuestionKey(question.priority, question.question);
  const key = stage === "call_pack" ? baseKey : `${stage}:${baseKey}`;
  const direct = byKey.get(key);
  if (direct) return direct;
  const needle = question.question.trim().toLowerCase();
  if (!needle) return undefined;
  for (const [rowKey, row] of byKey) {
    if (stage === "follow_up" && !rowKey.startsWith("follow_up:")) continue;
    if (stage === "call_pack" && (rowKey.startsWith("follow_up:") || rowKey.startsWith("deep:"))) {
      continue;
    }
    if (isCallContextQuestionKey(rowKey)) continue;
    if (String(row.question_text ?? "").trim().toLowerCase() === needle) return row;
  }
  return undefined;
}

function pairsFromStage(
  questions: AnalysisScreeningQuestion[],
  byKey: Map<string, SubmissionAiAnswerRow>,
  stage: "call_pack" | "follow_up",
  usedKeys: Set<string>
): QaPair[] {
  const pairs: QaPair[] = [];
  for (const question of questions) {
    const row = lookupStageAnswer(byKey, stage, question);
    if (row) usedKeys.add(String(row.question_key));
    const answer = String(row?.answer_text ?? "").trim();
    if (!answer) continue;
    pairs.push({ question: question.question, answer });
  }
  return pairs;
}

function orphanPairs(
  byKey: Map<string, SubmissionAiAnswerRow>,
  stage: "call_pack" | "follow_up",
  usedKeys: Set<string>
): QaPair[] {
  const pairs: QaPair[] = [];
  for (const [key, row] of byKey) {
    if (usedKeys.has(key)) continue;
    const answer = String(row.answer_text ?? "").trim();
    if (!answer) continue;
    if (stage === "follow_up") {
      if (!key.startsWith("follow_up:")) continue;
    } else if (
      key.startsWith("follow_up:") ||
      key.startsWith("deep:") ||
      isCallContextQuestionKey(key)
    ) {
      continue;
    }
    const question = String(row.question_text ?? "").trim();
    if (!question) continue;
    usedKeys.add(key);
    pairs.push({ question, answer });
  }
  return pairs;
}

/** Hire-stage / calendar / AI-step interview notes for the Step 5 model. */
export function formatInterviewNotesForSubmission(
  rows: SubmissionInterviewNoteRow[] | null | undefined
): string {
  const lines = (rows ?? [])
    .map((row) => {
      const body = String(row.body ?? "").trim();
      if (!body) return null;
      const label = String(row.label ?? "").trim();
      return label ? `- [${label}] ${body}` : `- ${body}`;
    })
    .filter((line): line is string => Boolean(line));
  if (!lines.length) return "";
  return `${INTERVIEW_NOTES_HEADING}\n${lines.join("\n")}`;
}

function isInterviewRelatedStep(row: {
  title?: string | null;
  step_type?: string | null;
  phase?: string | null;
}): boolean {
  const haystack = [row.title, row.step_type, row.phase]
    .map((part) => String(part ?? "").toLowerCase())
    .join(" ");
  return /interview|screening|verif/.test(haystack);
}

/**
 * Build the Step 5 enrichment payload from the rows Step 5 actually has.
 * Screening responses and follow-up Q&A are separate so neither can be dropped
 * by reading only `screening_questions`.
 */
export function buildSubmissionEnrichmentFromRows(args: {
  analysis?: {
    screening_questions?: MatchAnalysisResponse["screening_questions"];
    follow_up_questions?: MatchAnalysisResponse["follow_up_questions"];
  } | null;
  aiAnswers?: SubmissionAiAnswerRow[] | null;
  jobScreeningAnswers?: Array<{ question_text?: string | null; answer?: unknown }> | null;
  verifiedItems?: Array<{ category?: string | null; title?: string | null; details?: string | null }> | null;
  interviewNotes?: SubmissionInterviewNoteRow[] | null;
  recruiterNotes?: string | null;
}): SubmissionEnrichmentPack {
  const byKey = new Map(
    (args.aiAnswers ?? [])
      .filter((row) => String(row.question_key ?? "").trim())
      .map((row) => [String(row.question_key), row])
  );
  const usedKeys = new Set<string>();
  const screeningPairs = [
    ...jobScreeningPairs(args.jobScreeningAnswers),
    ...pairsFromStage(
      normalizeAnalysisScreeningQuestions(args.analysis?.screening_questions),
      byKey,
      "call_pack",
      usedKeys
    ),
    ...orphanPairs(byKey, "call_pack", usedKeys),
  ];
  const followUpPairs = [
    ...pairsFromStage(
      normalizeAnalysisScreeningQuestions(args.analysis?.follow_up_questions),
      byKey,
      "follow_up",
      usedKeys
    ),
    ...orphanPairs(byKey, "follow_up", usedKeys),
  ];

  const callContext = String(byKey.get(CALL_CONTEXT_QUESTION_KEY)?.answer_text ?? "").trim();
  const interviewNotes = formatInterviewNotesForSubmission(args.interviewNotes);
  const blocks = [
    screeningSection(screeningPairs, callContext),
    qaSection(FOLLOW_UP_QA_HEADING, followUpPairs),
  ];
  if (interviewNotes) blocks.push(interviewNotes);
  const verified = formatVerifiedInfoForSubmission(args.verifiedItems ?? []);
  if (verified) blocks.push(verified);
  const notes = String(args.recruiterNotes ?? "").trim();
  if (notes) blocks.push(`Recruiter notes:\n${notes}`);

  const evidenceParts = [
    callContext,
    ...screeningPairs.map((pair) => pair.answer),
    ...followUpPairs.map((pair) => pair.answer),
    ...(args.interviewNotes ?? [])
      .map((row) => String(row.body ?? "").trim())
      .filter(Boolean),
    verified,
    notes,
  ].filter(Boolean);

  return {
    promptNotes: blocks.join("\n\n").slice(0, MAX_ENRICHMENT_CHARS).trim(),
    evidenceNotes: evidenceParts.join("\n").trim(),
  };
}

function jobScreeningPairs(
  rows: Array<{ question_text?: string | null; answer?: unknown }> | null | undefined
): QaPair[] {
  const pairs: QaPair[] = [];
  for (const row of rows ?? []) {
    const question = String(row.question_text ?? "").trim();
    const answer = formatStoredScreeningAnswer(row.answer);
    if (!question || !answer) continue;
    pairs.push({ question, answer });
  }
  return pairs;
}

/**
 * Facts the skill filter may treat as support.
 * Answer lines count. Unanswered question stems do not.
 */
export function submissionEvidenceCorpus(args: {
  evidenceNotes?: string | null;
  enrichmentNotes?: string | null;
}): string {
  if (args.evidenceNotes != null) return String(args.evidenceNotes).trim();
  const notes = String(args.enrichmentNotes ?? "").trim();
  if (!notes) return "";
  const answers = [...notes.matchAll(/^A:\s*(.+)$/gm)]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
  if (notes.includes("Q:")) return answers.join("\n");
  return notes;
}

export async function loadInterviewNotesForSubmission(args: {
  supabase: SupabaseClient;
  tenantId: string;
  applicationId: string;
  workerId?: string | null;
}): Promise<SubmissionInterviewNoteRow[]> {
  const { supabase, tenantId, applicationId } = args;
  const notes: SubmissionInterviewNoteRow[] = [];

  const { data: scheduleRows } = await supabase
    .from("interview_schedules")
    .select("notes")
    .eq("tenant_id", tenantId)
    .eq("application_id", applicationId)
    .order("updated_at", { ascending: false })
    .limit(10);
  for (const row of scheduleRows ?? []) {
    const body = String(row.notes ?? "").trim();
    if (body) notes.push({ label: "Interview schedule", body });
  }

  const { data: stageRows } = await supabase
    .from("stage_context_notes")
    .select("context_kind, context_key, body")
    .eq("tenant_id", tenantId)
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(30);
  for (const row of stageRows ?? []) {
    const body = String(row.body ?? "").trim();
    if (!body) continue;
    const kind = String(row.context_kind ?? "").trim();
    const key = String(row.context_key ?? "").trim();
    const label =
      kind === "ai_match_step"
        ? key || "AI Match note"
        : key
          ? `Workflow note (${key.slice(0, 8)})`
          : "Workflow note";
    notes.push({ label, body });
  }

  const { data: instances } = await supabase
    .from("applicant_workflow_instances")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("application_id", applicationId)
    .limit(5);
  const instanceIds = (instances ?? [])
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
  if (instanceIds.length) {
    const { data: stepRows } = await supabase
      .from("applicant_workflow_step_records")
      .select("title, step_type, phase, review_note")
      .in("workflow_instance_id", instanceIds)
      .order("updated_at", { ascending: false })
      .limit(40);
    for (const row of stepRows ?? []) {
      const body = String(row.review_note ?? "").trim();
      if (!body || !isInterviewRelatedStep(row)) continue;
      const label = String(row.title ?? row.step_type ?? "Interview step").trim() || "Interview step";
      notes.push({ label, body });
    }
  }

  // Dedupe identical bodies so schedule + review copies do not double-count.
  const seen = new Set<string>();
  return notes.filter((row) => {
    const key = `${String(row.label ?? "").trim().toLowerCase()}::${String(row.body ?? "").trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Step 5 sources: original résumé is loaded separately.
 * This loads screening-question responses, follow-up Q&A, interview notes,
 * verified info, and recruiter notes.
 */
export async function loadSubmissionEnrichment(args: {
  supabase: SupabaseClient;
  tenantId: string;
  applicationId: string;
  workerId?: string | null;
  analysis: MatchAnalysisResponse | null;
}): Promise<SubmissionEnrichmentPack> {
  const { supabase, tenantId, applicationId, analysis } = args;

  const [
    { data: screeningRows },
    { data: jobScreeningRows },
    { data: verifiedRows },
    interviewNotes,
  ] = await Promise.all([
    supabase
      .from("job_application_ai_screening_answers")
      .select("question_key, question_text, answer_text")
      .eq("tenant_id", tenantId)
      .eq("application_id", applicationId),
    supabase
      .from("application_screening_answers")
      .select("question_text, answer")
      .eq("tenant_id", tenantId)
      .eq("application_id", applicationId),
    supabase
      .from("job_application_verified_information")
      .select("category, title, details")
      .eq("tenant_id", tenantId)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(20),
    loadInterviewNotesForSubmission({
      supabase,
      tenantId,
      applicationId,
      workerId: args.workerId,
    }),
  ]);

  let recruiterNotes = "";
  if (args.workerId) {
    const { data: noteRows } = await supabase
      .from("worker_notes")
      .select("body")
      .eq("tenant_id", tenantId)
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(5);
    recruiterNotes = (noteRows ?? [])
      .map((note) => String(note.body ?? "").trim())
      .filter(Boolean)
      .join("\n---\n");
  }

  return buildSubmissionEnrichmentFromRows({
    analysis,
    aiAnswers: screeningRows ?? [],
    jobScreeningAnswers: jobScreeningRows ?? [],
    verifiedItems: verifiedRows ?? [],
    interviewNotes,
    recruiterNotes,
  });
}

export async function loadSubmissionEnrichmentNotes(args: {
  supabase: SupabaseClient;
  tenantId: string;
  applicationId: string;
  workerId?: string | null;
  analysis: MatchAnalysisResponse | null;
}): Promise<string> {
  const pack = await loadSubmissionEnrichment(args);
  return pack.promptNotes;
}
