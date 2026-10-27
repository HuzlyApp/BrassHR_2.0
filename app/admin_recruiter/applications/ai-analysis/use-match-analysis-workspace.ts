"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type {
  AnalysisMode,
  AnalysisProvider,
  MatchAnalysisResponse,
  ReadinessStatus,
} from "@/lib/jobs/match-analysis/schema";
import { DEFAULT_ANALYSIS_PROVIDER } from "@/lib/jobs/match-analysis/schema";
import { matchWorkspaceIsAnalyzed } from "@/lib/jobs/match-analysis/match-stage";
import {
  RECRUITER_DECISIONS,
  CALL_CONTEXT_QUESTION_KEY,
  CALL_CONTEXT_QUESTION_TEXT,
  type QualificationRequirement,
  type RecruiterDecision,
  type VerifiedInfoCategory,
} from "@/lib/jobs/match-analysis/workspace";
import type { VerificationNote, VerificationNoteDraft } from "@/lib/jobs/match-analysis/verification-notes";
import { summarizeRequirementNotes } from "@/lib/jobs/match-analysis/verification-notes";
import { adminWorkerResumePreviewHref } from "@/lib/resume/worker-resume-file-name";
import {
  candidateProfileApiUrl,
  invalidateStaffDetailCache,
  workerProfileApiUrl,
} from "@/lib/admin/staff-detail-fetch-cache";

export type ScreeningQuestionView = {
  id: string;
  question: string;
  isRequired: boolean;
  answerDisplay: string;
  answered: boolean;
  answer: unknown;
};

export type MatchAnalysisWorkspacePayload = {
  application: {
    id: string;
    worker_id?: string | null;
    ai_match_status: string | null;
    ai_match_score: number | null;
    ai_match_category: string | null;
    ai_match_action: string | null;
    ai_match_display_category: string | null;
    ai_match_stage?: string | null;
    ai_analysis: Record<string, unknown> | null;
    ai_analysis_error: string | null;
    ai_analysis_version: number | null;
    ai_analysis_model: string | null;
    ai_analyzed_at?: string | null;
    recruiter_decision: string | null;
    recruiter_decision_note: string | null;
    recruiter_decision_at: string | null;
    status_name?: string | null;
    status_system_key?: string | null;
  };
  job?: {
    id: string;
    title: string | null;
    location?: string | null;
  } | null;
  requirements: QualificationRequirement[];
  screeningQuestions?: ScreeningQuestionView[];
  recommendedQuestions?: Array<{
    key: string;
    priority: number;
    question: string;
    reason: string;
    relatedRequirement: string;
    answer: string;
  }>;
  followUpQuestions?: Array<{
    key: string;
    priority: number;
    question: string;
    reason: string;
    relatedRequirement: string;
    answer: string;
  }>;
  deepQuestions?: Array<{
    key: string;
    priority: number;
    question: string;
    reason: string;
    relatedRequirement: string;
    answer: string;
  }>;
  questionSetsStale?: {
    call_pack?: boolean;
    follow_up?: boolean;
    deep?: boolean;
  };
  /** Step 2 call-pack context (optional); included in Deep Match notes when present. */
  callContext?: string;
  screeningUploads?: Array<{
    id: string;
    questionKey: string | null;
    fileName: string;
    mimeType: string | null;
    extractedText: string | null;
    createdAt: string;
  }>;
  matchProgression?: {
    stage?: string | null;
    callPackUnlocked?: boolean;
    requireDeepConfirm?: boolean;
    deepModel?: string;
  };
  verifiedInformation?: Array<{
    id: string;
    category: string;
    title: string;
    details: string | null;
    verifiedAt: string;
    verifiedByName: string;
  }>;
  notes?: Array<{ id: string; body: string; created_at: string; author_name: string }>;
  verificationNotes?: VerificationNote[];
  verificationNoteAudit?: Array<{
    id: string;
    noteId: string;
    requirementId: string;
    action: string;
    actorName: string;
    createdAt: string;
  }>;
  analysisHistory?: Array<{
    id: string;
    version: number;
    score: number | null;
    category: string | null;
    display_category: string | null;
    model: string | null;
    analyzed_at: string;
    quick_route?: string | null;
    analysis?: MatchAnalysisResponse | null;
  }>;
  extractedResume?: { text: string; fileName: string | null } | null;
  assignedRecruiter?: { id: string; name: string } | null;
  modelName?: string | null;
  claudeAvailable?: boolean;
};

export type WorkerProfileSummary = {
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  job_role?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export type TeamMember = { id: string; name: string; email: string };

export type UploadedResumeItem = {
  id: string;
  fileName: string;
  fileIconType?: "pdf" | "jpeg" | "docx";
  uploadedAt?: string;
  uploadedAtLabel?: string;
  improvementSummary?: unknown;
};

export type SubmissionImprovementSummaryView = {
  clarity: string;
  relevance: string;
  formatting: string;
  added: string[];
  removed: string[];
  needsVerification: string[];
  skillEvidenceQuality: "strong" | "adequate" | "keyword_stuffing";
  skillEvidenceNote: string;
  overall: string;
};

function asImprovementSummaryView(value: unknown): SubmissionImprovementSummaryView | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<SubmissionImprovementSummaryView>;
  return {
    clarity: String(parsed.clarity ?? ""),
    relevance: String(parsed.relevance ?? ""),
    formatting: String(parsed.formatting ?? ""),
    added: Array.isArray(parsed.added) ? parsed.added.map(String) : [],
    removed: Array.isArray(parsed.removed) ? parsed.removed.map(String) : [],
    needsVerification: Array.isArray(parsed.needsVerification)
      ? parsed.needsVerification.map(String)
      : [],
    skillEvidenceQuality:
      parsed.skillEvidenceQuality === "keyword_stuffing" ||
      parsed.skillEvidenceQuality === "strong" ||
      parsed.skillEvidenceQuality === "adequate"
        ? parsed.skillEvidenceQuality
        : "adequate",
    skillEvidenceNote: String(parsed.skillEvidenceNote ?? ""),
    overall: String(parsed.overall ?? ""),
  };
}

export type CandidateInfoState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialty: string;
  location: string;
};

export type MatchAnalysisParsed = {
  candidate_match?: {
    recruiter_decision_summary?: string;
    confidence_score?: number;
    display_category?: string | null;
    match_category?: string | null;
  };
  job?: { job_title?: string };
  strengths?: string[];
  gaps_and_risks?: string[];
  submission_readiness?: {
    readiness_status?: ReadinessStatus;
    items_to_verify_before_submission?: string[];
    blocking_requirements?: string[];
  };
  data_quality?: {
    resume_completeness?: string;
    job_description_completeness?: string;
    resume_conflicts?: string[];
    missing_information?: string[];
    job_description_conflicts?: string[];
  };
  experience_analysis?: {
    experience_calculation_notes?: string[];
  };
  quick_match?: {
    step?: "quick_match";
    quick_route?: "STRONG" | "REVIEW" | "LOW_MATCH";
    mand_met?: number;
    pref_met?: number;
    weighted?: number;
    extracted_resume?: {
      headline?: string;
      years_estimated?: number | null;
      recent_titles?: string[];
      named_products_in_jobs?: string[];
      education?: string;
    };
  };
};

export function parseMatchAnalysis(
  value: Record<string, unknown> | null | undefined
): MatchAnalysisParsed | null {
  if (!value || typeof value !== "object") return null;
  return value as MatchAnalysisParsed;
}

export function useMatchAnalysisWorkspace(applicationId: string, reloadToken = 0) {
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [data, setData] = useState<MatchAnalysisWorkspacePayload | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<WorkerProfileSummary | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [savingVerificationNote, setSavingVerificationNote] = useState(false);
  const [busyVerificationNoteId, setBusyVerificationNoteId] = useState<string | null>(null);
  const [jobAnswers, setJobAnswers] = useState<Record<string, string>>({});
  const [recommendedAnswers, setRecommendedAnswers] = useState<Record<string, string>>({});
  const [callContext, setCallContext] = useState("");
  const [savingAnswers, setSavingAnswers] = useState(false);
  const recommendedAnswersRef = useRef(recommendedAnswers);
  recommendedAnswersRef.current = recommendedAnswers;
  const callContextRef = useRef(callContext);
  callContextRef.current = callContext;
  const jobAnswersRef = useRef(jobAnswers);
  jobAnswersRef.current = jobAnswers;

  function updateRecommendedAnswer(key: string, value: string) {
    recommendedAnswersRef.current = { ...recommendedAnswersRef.current, [key]: value };
    setRecommendedAnswers(recommendedAnswersRef.current);
  }

  function updateCallContext(value: string) {
    callContextRef.current = value;
    setCallContext(value);
  }
  const [decision, setDecision] = useState<RecruiterDecision | "">("");
  const [decisionNote, setDecisionNote] = useState("");
  const [savingDecision, setSavingDecision] = useState(false);
  const [verifiedTitle, setVerifiedTitle] = useState("");
  const [verifiedDetails, setVerifiedDetails] = useState("");
  const [verifiedCategory, setVerifiedCategory] = useState<VerifiedInfoCategory>("note");
  const [savingVerified, setSavingVerified] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [assignedId, setAssignedId] = useState("");
  const [info, setInfo] = useState<CandidateInfoState>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    specialty: "",
    location: "",
  });
  const [savingInfo, setSavingInfo] = useState(false);
  const [extractedDraft, setExtractedDraft] = useState("");
  const [savingText, setSavingText] = useState(false);
  const [resumes, setResumes] = useState<UploadedResumeItem[]>([]);
  const [uploadingScreening, setUploadingScreening] = useState(false);
  const [draftingSubmissionResume, setDraftingSubmissionResume] = useState(false);
  const [improvementSummary, setImprovementSummary] =
    useState<SubmissionImprovementSummaryView | null>(null);

  const applyWorkspacePayload = useCallback((
    payload: MatchAnalysisWorkspacePayload,
    opts?: { preserveLocalAnswers?: boolean }
  ) => {
    setData(payload);
    setWorkerId(payload.application.worker_id ? String(payload.application.worker_id) : null);
    setDecision((payload.application.recruiter_decision as RecruiterDecision) || "");
    setDecisionNote(payload.application.recruiter_decision_note || "");
    setAssignedId(payload.assignedRecruiter?.id || "");
    const rec: Record<string, string> = {};
    for (const item of [
      ...(payload.recommendedQuestions ?? []),
      ...(payload.followUpQuestions ?? []),
      ...(payload.deepQuestions ?? []),
    ]) {
      rec[item.key] =
        item.answer ||
        (opts?.preserveLocalAnswers ? recommendedAnswersRef.current[item.key] ?? "" : "");
    }
    setRecommendedAnswers(rec);
    const nextContext =
      payload.callContext ||
      (opts?.preserveLocalAnswers ? callContextRef.current : "");
    callContextRef.current = nextContext;
    setCallContext(nextContext);
    const jobs: Record<string, string> = {};
    for (const item of payload.screeningQuestions ?? []) {
      jobs[item.id] = item.answered
        ? String(item.answer ?? "")
        : opts?.preserveLocalAnswers
          ? jobAnswersRef.current[item.id] ?? ""
          : "";
    }
    setJobAnswers(jobs);
    setExtractedDraft(payload.extractedResume?.text || "");
  }, []);

  const loadResumes = useCallback(async () => {
    const res = await fetch(
      `/api/admin/job-applications/${encodeURIComponent(applicationId)}/resume-history`,
      { cache: "no-store", credentials: "include" }
    );
    const json = (await res.json().catch(() => ({}))) as {
      resumes?: UploadedResumeItem[];
      error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Failed to load resumes");
    const rows = [...(json.resumes ?? [])].sort((a, b) => {
      const aTime = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const bTime = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return aTime - bTime;
    });
    setResumes(rows);
    const withSummary = [...rows]
      .reverse()
      .find(
        (row) =>
          /_submission_resume\.(pdf|docx)$/i.test(row.fileName) && row.improvementSummary
      );
    const parsed = asImprovementSummaryView(withSummary?.improvementSummary);
    if (parsed) setImprovementSummary(parsed);
  }, [applicationId]);

  const load = useCallback(async (opts?: { preserveLocalAnswers?: boolean; silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/match-analysis`,
        { cache: "no-store", credentials: "include" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load match analysis");
      applyWorkspacePayload(json as MatchAnalysisWorkspacePayload, {
        preserveLocalAnswers: opts?.preserveLocalAnswers,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load match analysis");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [applicationId, applyWorkspacePayload]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  useEffect(() => {
    void fetch("/api/admin/team-members", { credentials: "include" })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as { members?: TeamMember[] };
        if (res.ok) setTeamMembers(json.members ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    void fetch(`/api/admin/worker-profile?workerId=${encodeURIComponent(workerId)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as {
          worker?: WorkerProfileSummary;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Failed to load profile");
        setProfile(json.worker ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [workerId]);

  useEffect(() => {
    let cancelled = false;
    void loadResumes().catch(() => {
      if (!cancelled) setResumes([]);
    });
    return () => {
      cancelled = true;
    };
  }, [loadResumes, reloadToken]);

  useEffect(() => {
    if (!profile) return;
    setInfo({
      firstName: profile.first_name || "",
      lastName: profile.last_name || "",
      email: profile.email || "",
      phone: profile.phone || "",
      specialty: profile.job_role || "",
      location: [profile.city, profile.state].filter(Boolean).join(", "),
    });
  }, [profile]);

  const analysis = parseMatchAnalysis(data?.application.ai_analysis);
  const blocking = analysis?.submission_readiness?.blocking_requirements ?? [];
  const verifyItems = analysis?.submission_readiness?.items_to_verify_before_submission ?? [];
  const status = data?.application.ai_match_status ?? "READY";
  const isAnalyzed = matchWorkspaceIsAnalyzed({
    status,
    stage: data?.application.ai_match_stage ?? data?.matchProgression?.stage ?? null,
    hasAnalysis: Boolean(data?.application.ai_analysis),
  });

  async function runAnalyze(
    mode: AnalysisMode = "analyze",
    provider: AnalysisProvider = DEFAULT_ANALYSIS_PROVIDER
  ): Promise<boolean> {
    setAnalyzing(true);
    try {
      const res = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/match-analysis`,
        {
          method: "POST",
          cache: "no-store",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysisMode: mode, analysisProvider: provider }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Match analysis failed");
      toast.success(
        json.status === "NEEDS_REVIEW"
          ? "Needs résumé text before analysis"
          : mode === "deep"
            ? "Deep Match complete"
            : mode === "call_pack"
              ? "Verifications screening questions ready"
              : mode === "follow_up"
                ? "Follow-up screening questions refreshed"
                : "Quick Match complete"
      );
      await Promise.all([load(), loadResumes()]);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Match analysis failed");
      return false;
    } finally {
      setAnalyzing(false);
    }
  }

  function applyVerificationNotesToRequirements(
    requirements: QualificationRequirement[],
    notes: VerificationNote[]
  ): QualificationRequirement[] {
    const summaries = summarizeRequirementNotes(notes);
    return requirements.map((item) => {
      const summary = summaries.get(item.id);
      return {
        ...item,
        verification_note_count: summary?.noteCount ?? 0,
        has_pending_verification_note: summary?.hasPending ?? false,
        has_verification_decision: summary?.hasDecision ?? false,
        latest_verification_note: summary?.latestNote
          ? {
              id: summary.latestNote.id,
              noteBody: summary.latestNote.noteBody,
              candidateQuestion: summary.latestNote.candidateQuestion,
              dueDate: summary.latestNote.dueDate,
              verificationStatus: summary.latestNote.verificationStatus,
              candidateResponse: summary.latestNote.candidateResponse,
              createdByName: summary.latestNote.createdByName,
              updatedByName: summary.latestNote.updatedByName,
              createdAt: summary.latestNote.createdAt,
              updatedAt: summary.latestNote.updatedAt,
            }
          : null,
      };
    });
  }

  async function toggleVerified(req: QualificationRequirement) {
    if (!req.recruiter_verified && !req.has_verification_decision) {
      toast.error("Save a note first, then check Recruiter verified.");
      return;
    }
    setVerifyingId(req.id);
    try {
      const res = await fetch(
        `/api/admin/job-applications/${applicationId}/match-analysis/requirements/${req.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recruiterVerified: !req.recruiter_verified }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to update verification");
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          requirements: current.requirements.map((item) =>
            item.id === req.id
              ? {
                  ...item,
                  recruiter_verified: Boolean(json.requirement?.recruiter_verified),
                  recruiter_note: json.requirement?.recruiter_note ?? item.recruiter_note,
                }
              : item
          ),
        };
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification update failed");
    } finally {
      setVerifyingId(null);
    }
  }

  function notesUrl(requirementId: string, noteId?: string) {
    const base = `/api/admin/job-applications/${encodeURIComponent(applicationId)}/match-analysis/requirements/${encodeURIComponent(requirementId)}/notes`;
    return noteId ? `${base}/${encodeURIComponent(noteId)}` : base;
  }

  async function createVerificationNote(
    requirementId: string,
    draft: VerificationNoteDraft
  ): Promise<boolean> {
    setSavingVerificationNote(true);
    try {
      const res = await fetch(notesUrl(requirementId), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteBody: draft.noteBody,
          verificationStatus: draft.verificationStatus,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save verification note");
      const note = json.note as VerificationNote;
      setData((current) => {
        if (!current) return current;
        const verificationNotes = [
          note,
          ...(current.verificationNotes ?? []).filter(
            (item) => item.requirementId !== requirementId
          ),
        ];
        return {
          ...current,
          verificationNotes,
          requirements: applyVerificationNotesToRequirements(
            current.requirements,
            verificationNotes
          ),
        };
      });
      toast.success("Verification note saved");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save verification note");
      return false;
    } finally {
      setSavingVerificationNote(false);
    }
  }

  async function updateVerificationNote(
    requirementId: string,
    noteId: string,
    draft: VerificationNoteDraft
  ): Promise<boolean> {
    setBusyVerificationNoteId(noteId);
    setSavingVerificationNote(true);
    try {
      const res = await fetch(notesUrl(requirementId, noteId), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteBody: draft.noteBody,
          verificationStatus: draft.verificationStatus,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to update verification note");
      const note = json.note as VerificationNote;
      setData((current) => {
        if (!current) return current;
        const verificationNotes = (current.verificationNotes ?? []).map((item) =>
          item.id === noteId ? note : item
        );
        return {
          ...current,
          verificationNotes,
          requirements: applyVerificationNotesToRequirements(
            current.requirements,
            verificationNotes
          ),
        };
      });
      toast.success("Verification note updated");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update verification note");
      return false;
    } finally {
      setBusyVerificationNoteId(null);
      setSavingVerificationNote(false);
    }
  }

  async function deleteVerificationNote(requirementId: string, noteId: string): Promise<boolean> {
    if (!window.confirm("Delete this note?")) {
      return false;
    }
    setBusyVerificationNoteId(noteId);
    setSavingVerificationNote(true);
    try {
      const res = await fetch(notesUrl(requirementId, noteId), {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to delete verification note");
      setData((current) => {
        if (!current) return current;
        const verificationNotes = (current.verificationNotes ?? []).filter(
          (item) => item.id !== noteId
        );
        return {
          ...current,
          verificationNotes,
          requirements: applyVerificationNotesToRequirements(
            current.requirements,
            verificationNotes
          ),
        };
      });
      toast.success("Verification note deleted");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete verification note");
      return false;
    } finally {
      setBusyVerificationNoteId(null);
      setSavingVerificationNote(false);
    }
  }

  async function markNoteSentToCandidate(note: VerificationNote): Promise<boolean> {
    return updateVerificationNote(note.requirementId, note.id, {
      noteBody: note.noteBody,
      verificationStatus: "sent_to_candidate",
    });
  }

  async function saveScreeningAnswers(opts?: { silent?: boolean }): Promise<boolean> {
    setSavingAnswers(true);
    try {
      const currentRecommended = recommendedAnswersRef.current;
      const currentJob = jobAnswersRef.current;
      const currentContext = callContextRef.current;
      const questions = [
        ...(data?.recommendedQuestions ?? []),
        ...(data?.followUpQuestions ?? []),
        ...(data?.deepQuestions ?? []),
      ];
      const res = await fetch(`/api/admin/job-applications/${applicationId}/screening-answers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobAnswers: Object.entries(currentJob)
            .filter(([, answer]) => String(answer ?? "").trim() !== "")
            .map(([questionId, answer]) => ({ questionId, answer })),
          callContext: currentContext,
          recommendedAnswers: [
            ...questions.map((item) => ({
              key: item.key,
              question: item.question,
              priority: item.priority,
              answer: currentRecommended[item.key] ?? "",
            })),
            {
              key: CALL_CONTEXT_QUESTION_KEY,
              question: CALL_CONTEXT_QUESTION_TEXT,
              answer: currentContext,
            },
          ],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save screening notes");
      const saved = Array.isArray(json.recommendedAnswers)
        ? (json.recommendedAnswers as Array<{ key: string; answer: string }>)
        : [];
      if (!saved.length) {
        throw new Error("Nothing was saved to job_application_ai_screening_answers");
      }
      setRecommendedAnswers((current) => {
        const next = { ...current };
        for (const item of saved) {
          if (item.key === CALL_CONTEXT_QUESTION_KEY) continue;
          next[item.key] = item.answer ?? next[item.key] ?? "";
        }
        return next;
      });
      const savedContext = saved.find((item) => item.key === CALL_CONTEXT_QUESTION_KEY);
      if (savedContext) {
        callContextRef.current = savedContext.answer ?? "";
        setCallContext(callContextRef.current);
      } else {
        callContextRef.current = currentContext;
        setCallContext(currentContext);
      }
      setData((current) => {
        if (!current) return current;
        const byKey = new Map(saved.map((item) => [item.key, item.answer ?? ""]));
        return {
          ...current,
          callContext: byKey.get(CALL_CONTEXT_QUESTION_KEY) ?? currentContext,
          recommendedQuestions: (current.recommendedQuestions ?? []).map((item) => ({
            ...item,
            answer: byKey.get(item.key) ?? currentRecommended[item.key] ?? item.answer,
          })),
          followUpQuestions: (current.followUpQuestions ?? []).map((item) => ({
            ...item,
            answer: byKey.get(item.key) ?? currentRecommended[item.key] ?? item.answer,
          })),
          deepQuestions: (current.deepQuestions ?? []).map((item) => ({
            ...item,
            answer: byKey.get(item.key) ?? currentRecommended[item.key] ?? item.answer,
          })),
        };
      });
      if (!opts?.silent) {
        const count = typeof json.savedCount === "number" ? json.savedCount : saved.length;
        toast.success(`Saved ${count} screening answer${count === 1 ? "" : "s"} to Supabase`);
      }
      await load({ preserveLocalAnswers: true, silent: true });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save screening notes");
      return false;
    } finally {
      setSavingAnswers(false);
    }
  }

  async function uploadScreeningReply(file: File, questionKey?: string) {
    setUploadingScreening(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (questionKey) form.append("questionKey", questionKey);
      const res = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/match-analysis/screening-uploads`,
        { method: "POST", credentials: "include", body: form }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        extractedText?: string;
        uploads?: MatchAnalysisWorkspacePayload["screeningUploads"];
      };
      if (!res.ok) throw new Error(json.error || "Failed to upload reply");
      if (json.extractedText?.trim()) {
        const text = json.extractedText.trim();
        const key = questionKey || data?.recommendedQuestions?.[0]?.key;
        if (key) {
          const next = `${recommendedAnswersRef.current[key] ?? ""}\n\n${text}`.trim();
          recommendedAnswersRef.current = { ...recommendedAnswersRef.current, [key]: next };
          setRecommendedAnswers(recommendedAnswersRef.current);
        }
      }
      setData((current) =>
        current
          ? { ...current, screeningUploads: json.uploads ?? current.screeningUploads }
          : current
      );
      toast.success("Reply uploaded");
      await load({ preserveLocalAnswers: true, silent: true });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload reply");
      return false;
    } finally {
      setUploadingScreening(false);
    }
  }

  async function recordDecision() {
    if (!decision) {
      toast.error("Select a recruiter decision first.");
      return;
    }
    setSavingDecision(true);
    try {
      const res = await fetch(`/api/admin/job-applications/${applicationId}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: decisionNote }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to record decision");
      toast.success("Decision recorded");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record decision");
    } finally {
      setSavingDecision(false);
    }
  }

  function fileNameFromDisposition(header: string | null): string | null {
    const quoted = header?.match(/filename="([^"]+)"/i);
    if (quoted?.[1]) return quoted[1];
    const plain = header?.match(/filename=([^;]+)/i);
    return plain?.[1]?.trim() || null;
  }

  function parseImprovementSummaryHeader(header: string | null): SubmissionImprovementSummaryView | null {
    if (!header?.trim()) return null;
    try {
      return asImprovementSummaryView(JSON.parse(decodeURIComponent(header)));
    } catch {
      return null;
    }
  }

  function triggerBlobDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function draftSubmissionResume(): Promise<boolean> {
    setDraftingSubmissionResume(true);
    try {
      const res = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/match-analysis/submission-resume`,
        { method: "POST", credentials: "include" }
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "Could not draft the submission résumé.");
      }
      const summary = parseImprovementSummaryHeader(res.headers.get("X-Improvement-Summary"));
      if (summary) setImprovementSummary(summary);
      const blob = await res.blob();
      const fileName =
        fileNameFromDisposition(res.headers.get("Content-Disposition")) ||
        "submission-resume.docx";
      triggerBlobDownload(blob, fileName);
      toast.success("Optimized submission résumé (.docx) downloaded.");
      await Promise.all([load({ silent: true }), loadResumes()]);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not draft the submission résumé.");
      return false;
    } finally {
      setDraftingSubmissionResume(false);
    }
  }

  async function downloadSubmissionResume(resumeId: string, preferredName?: string) {
    const lower = String(preferredName ?? "").toLowerCase();
    const isPdf = lower.endsWith(".pdf");
    const isDocx = lower.endsWith(".docx") || lower.endsWith(".doc");
    const fallbackName = isPdf ? "submission-resume.pdf" : "submission-resume.docx";
    const label = isPdf ? "PDF" : "Word";
    try {
      const res = await fetch(
        `/api/admin/job-applications/${encodeURIComponent(applicationId)}/resumes/${encodeURIComponent(resumeId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error || `Could not download the ${label} résumé.`);
      }
      const fileRes = await fetch(json.url);
      if (!fileRes.ok) throw new Error(`Could not download the ${label} résumé.`);
      const blob = await fileRes.blob();
      const fileName =
        preferredName && (isPdf || isDocx)
          ? preferredName
          : preferredName
            ? `${preferredName}${isPdf ? ".pdf" : ".docx"}`
            : fallbackName;
      triggerBlobDownload(blob, fileName);
      toast.success(`${label} résumé downloaded.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not download the ${label} résumé.`);
    }
  }

  async function downloadSubmissionDocx(resumeId: string, preferredName?: string) {
    return downloadSubmissionResume(resumeId, preferredName);
  }

  async function advanceMatchProgress(
    progressStage: "call_pack" | "follow_up" | "submission",
    opts?: { analysisProvider?: AnalysisProvider }
  ) {
    const res = await fetch(
      `/api/admin/job-applications/${encodeURIComponent(applicationId)}/match-analysis`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progressStage,
          ...(opts?.analysisProvider ? { analysisProvider: opts.analysisProvider } : {}),
        }),
      }
    );
    const json = (await res.json().catch(() => ({}))) as { error?: string; stage?: string };
    if (!res.ok) throw new Error(json.error || "Could not advance this step.");
    await load({ silent: true });
    return json.stage ?? progressStage;
  }

  async function sendToTalentPool() {
    setSavingDecision(true);
    try {
      const decisionRes = await fetch(`/api/admin/job-applications/${applicationId}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "do_not_pursue",
          note: "Not a fit · Talent Pool",
        }),
      });
      const decisionJson = await decisionRes.json().catch(() => ({}));
      if (!decisionRes.ok) throw new Error(decisionJson.error || "Could not record Talent Pool.");
      const statusRes = await fetch(`/api/admin/job-applications/${applicationId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "rejected",
          note: "Not a fit · Talent Pool",
        }),
      });
      const statusJson = await statusRes.json().catch(() => ({}));
      if (!statusRes.ok) throw new Error(statusJson.error || "Could not set Not a Fit.");
      setDecision("do_not_pursue");
      toast.success("Moved to Talent Pool. Later AI steps will not run.");
      await load();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move to Talent Pool.");
      return false;
    } finally {
      setSavingDecision(false);
    }
  }

  async function addVerified() {
    if (!verifiedTitle.trim()) {
      toast.error("Add a title for verified information.");
      return;
    }
    setSavingVerified(true);
    try {
      const res = await fetch(`/api/admin/job-applications/${applicationId}/verified-information`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: verifiedCategory,
          title: verifiedTitle,
          details: verifiedDetails,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save verified information");
      setVerifiedTitle("");
      setVerifiedDetails("");
      toast.success("Verified information added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save verified information");
    } finally {
      setSavingVerified(false);
    }
  }

  async function saveDetails() {
    if (!workerId) {
      toast.error("This applicant is not linked to a worker profile yet.");
      return;
    }
    setSavingInfo(true);
    try {
      const assignRes = await fetch(`/api/admin/job-applications/${applicationId}/assignment`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedRecruiterUserId: assignedId || null }),
      });
      const assignJson = await assignRes.json().catch(() => ({}));
      if (!assignRes.ok) throw new Error(assignJson.error || "Failed to assign recruiter");
      const fields: Array<[string, string]> = [
        ["first_name", info.firstName],
        ["last_name", info.lastName],
        ["email", info.email],
        ["phone", info.phone],
        ["job_role", info.specialty],
      ];
      for (const [field, value] of fields) {
        const res = await fetch("/api/admin/worker-profile", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workerId, field, value }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Failed to save ${field}`);
      }
      invalidateStaffDetailCache(workerProfileApiUrl(workerId));
      invalidateStaffDetailCache(candidateProfileApiUrl(workerId));
      invalidateStaffDetailCache(`/api/admin/worker-profile?workerId=${encodeURIComponent(workerId)}`);
      setProfile((current) => ({
        ...(current ?? {}),
        first_name: info.firstName,
        last_name: info.lastName,
        email: info.email,
        phone: info.phone,
        job_role: info.specialty,
      }));
      toast.success("Candidate details saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save details");
    } finally {
      setSavingInfo(false);
    }
  }

  async function reextractContact() {
    try {
      const res = await fetch(`/api/admin/job-applications/${applicationId}/reextract-contact`, {
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        extracted?: CandidateInfoState;
      };
      if (!res.ok) throw new Error(json.error || "Could not extract contact details");
      if (!json.extracted) return;
      if (!window.confirm("Replace current contact fields with values extracted from the résumé?")) {
        return;
      }
      setInfo((current) => ({
        firstName: json.extracted?.firstName || current.firstName,
        lastName: json.extracted?.lastName || current.lastName,
        email: json.extracted?.email || current.email,
        phone: json.extracted?.phone || current.phone,
        specialty: json.extracted?.specialty || current.specialty,
        location: json.extracted?.location || current.location,
      }));
      toast.success("Extracted contact details. Review and save.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not extract contact details");
    }
  }

  async function viewResume(resumeId: string) {
    if (!workerId) {
      toast.error("Could not open resume.");
      return;
    }
    window.open(
      adminWorkerResumePreviewHref({
        workerId,
        resumeId,
        applicationId,
      }),
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function saveExtractedText() {
    setSavingText(true);
    try {
      const res = await fetch(`/api/admin/job-applications/${applicationId}/resume-text`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extractedText: extractedDraft }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        profile?: Record<string, string>;
        profileUpdated?: boolean;
        stage?: string | null;
      };
      if (!res.ok) throw new Error(json.error || "Failed to save extracted text");
      if (json.profile && Object.keys(json.profile).length) {
        setProfile((current) => ({
          ...(current ?? {}),
          first_name: json.profile?.first_name ?? current?.first_name,
          last_name: json.profile?.last_name ?? current?.last_name,
          email: json.profile?.email ?? current?.email,
          phone: json.profile?.phone ?? current?.phone,
          city: json.profile?.city ?? current?.city,
          state: json.profile?.state ?? current?.state,
        }));
        setInfo((current) => ({
          ...current,
          firstName: json.profile?.first_name ?? current.firstName,
          lastName: json.profile?.last_name ?? current.lastName,
          email: json.profile?.email ?? current.email,
          phone: json.profile?.phone ?? current.phone,
        }));
      }
      toast.success(
        json.profileUpdated
          ? "Extracted text saved. Candidate profile updated. This step was kept."
          : "Extracted text saved. This analysis step was kept."
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save extracted text");
    } finally {
      setSavingText(false);
    }
  }

  return {
    loading,
    analyzing,
    data,
    workerId,
    profile,
    analysis,
    blocking,
    verifyItems,
    status,
    isAnalyzed,
    verifyingId,
    savingVerificationNote,
    busyVerificationNoteId,
    jobAnswers,
    setJobAnswers,
    recommendedAnswers,
    setRecommendedAnswers,
    updateRecommendedAnswer,
    callContext,
    updateCallContext,
    savingAnswers,
    decision,
    setDecision,
    decisionNote,
    setDecisionNote,
    savingDecision,
    verifiedTitle,
    setVerifiedTitle,
    verifiedDetails,
    setVerifiedDetails,
    verifiedCategory,
    setVerifiedCategory,
    savingVerified,
    teamMembers,
    assignedId,
    setAssignedId,
    info,
    setInfo,
    savingInfo,
    extractedDraft,
    setExtractedDraft,
    savingText,
    resumes,
    viewResume,
    downloadSubmissionDocx,
    downloadSubmissionResume,
    improvementSummary,
    load,
    runAnalyze,
    toggleVerified,
    createVerificationNote,
    updateVerificationNote,
    deleteVerificationNote,
    markNoteSentToCandidate,
    saveScreeningAnswers,
    uploadScreeningReply,
    uploadingScreening,
    recordDecision,
    advanceMatchProgress,
    draftSubmissionResume,
    draftingSubmissionResume,
    sendToTalentPool,
    addVerified,
    saveDetails,
    reextractContact,
    saveExtractedText,
    decisionOptions: RECRUITER_DECISIONS,
  };
}
