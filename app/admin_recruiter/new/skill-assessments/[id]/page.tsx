"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { jsPDF } from "jspdf";
import DetailedCandidateHeader from "../../../components/DetailedCandidateHeader";
import DetailedTabs from "../../../components/DetailedTabs";
import CandidateDetailLoader from "../../../components/CandidateDetailLoader";
import { useCandidateHeader } from "../../../hooks/useCandidateHeader";
import { dispatchCandidatePipelineRefresh } from "@/lib/admin/candidate-pipeline-events";
import BrandedStepperCompleteIcon from "../../../components/BrandedStepperCompleteIcon";
import BrandedFileTypeIcon from "../../../components/BrandedFileTypeIcon";
import {
  Briefcase,
  Calendar,
  Eye,
  LogOut,
  Menu,
  Settings,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  X,
} from "lucide-react";

type WorkerProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  job_role: string | null;
  status_label?: string;
};

type Assessment = {
  id: string;
  title: string | null;
  total_score: number | null;
  answered_count: number | null;
  result_status: string;
  completed: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

type AssessmentListResponse = {
  worker: WorkerProfile;
  skill_assessments: Assessment[];
};

type SkillAssessmentPdf = {
  id: string;
  fileName: string;
  hasFile: boolean;
};

type AssessmentQuestion = Record<string, unknown> & {
  selected_answer?: unknown;
};

type AssessmentDetailResponse = {
  worker: Record<string, unknown>;
  assessment: Record<string, unknown>;
  questions: AssessmentQuestion[];
  metadata?: Record<string, unknown>;
};

type PdfQuestionRow = {
  number: number;
  questionText: string;
  selectedAnswer: string;
  answerLabel: string | null;
  scoreValue: string | null;
};

type PdfDisplayData = {
  candidateName: string;
  assessmentTitle: string;
  categoryName: string;
  totalScore: string;
  resultStatus: string;
  submittedDate: string;
  questions: PdfQuestionRow[];
};

function asText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const s = value.trim();
    return s.length > 0 ? s : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function formatDate(value: unknown): string {
  const text = asText(value);
  if (!text) return "N/A";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York" });
}

function drawSectionTitle(doc: jsPDF, y: number, text: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(text, 14, y);
  return y + 6;
}

function buildPdfDisplayData(detail: AssessmentDetailResponse): PdfDisplayData {
  const worker = detail.worker ?? {};
  const assessment = detail.assessment ?? {};
  const firstName = asText(worker.first_name) ?? "";
  const lastName = asText(worker.last_name) ?? "";
  const candidateName = `${firstName} ${lastName}`.trim() || "N/A";
  const assessmentTitle = asText(assessment.assessment_title) ?? "Untitled Assessment";
  const categoryName = asText(assessment.assessment_title) ?? asText(assessment.category_slug) ?? "N/A";
  const totalScore = asText(assessment.total_score) ?? "0";
  const resultStatus = asText(assessment.result_status) ?? "N/A";
  const submittedDate = formatDate(assessment.submitted_at);
  const questions = (Array.isArray(detail.questions) ? detail.questions : []).map((q, index) => ({
    number: Number(q.quiz_number ?? index + 1),
    questionText: asText(q.question_text) ?? `Question ${index + 1}`,
    selectedAnswer: asText(q.selected_answer) ?? "N/A",
    answerLabel: asText(q.answer_label),
    scoreValue: asText(q.answer_value),
  }));

  return {
    candidateName,
    assessmentTitle,
    categoryName,
    totalScore,
    resultStatus,
    submittedDate,
    questions,
  };
}

function buildAssessmentPdf(pdfDisplayData: PdfDisplayData): jsPDF {
  const doc = new jsPDF();
  appendAssessmentPdfContent(doc, pdfDisplayData, { addPageBefore: false });
  return doc;
}

function appendAssessmentPdfContent(
  doc: jsPDF,
  pdfDisplayData: PdfDisplayData,
  options: { addPageBefore: boolean }
): void {
  let y = 14;

  if (options.addPageBefore) {
    doc.addPage();
    y = 14;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Skill Assessment Result", 14, y);
  y += 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Candidate:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(pdfDisplayData.candidateName, 45, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Assessment:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(pdfDisplayData.assessmentTitle, 150), 45, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Category:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(pdfDisplayData.categoryName, 150), 45, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Status:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(pdfDisplayData.resultStatus, 45, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Score:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(pdfDisplayData.totalScore, 45, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Submitted:", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(pdfDisplayData.submittedDate, 45, y);
  y += 10;

  if (y > 250) {
    doc.addPage();
    y = 14;
  }
  y = drawSectionTitle(doc, y, "Questions and Answers");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("#", 14, y);
  doc.text("Question", 24, y);
  doc.text("Selected Answer", 128, y);
  y += 4;
  doc.line(14, y, 195, y);
  y += 4;

  if (pdfDisplayData.questions.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("No question/answer data available for this assessment.", 14, y);
    return;
  }

  for (const row of pdfDisplayData.questions) {
    if (y > 250) {
      doc.addPage();
      y = 14;
    }

    const selectedAnswerText = row.answerLabel
      ? `${row.selectedAnswer} (${row.answerLabel})`
      : row.selectedAnswer;
    const withScore = row.scoreValue ? `${selectedAnswerText} [${row.scoreValue}]` : selectedAnswerText;
    const qWrapped = doc.splitTextToSize(row.questionText, 100);
    const aWrapped = doc.splitTextToSize(withScore, 62);
    const lines = Math.max(qWrapped.length, aWrapped.length);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(String(row.number), 14, y);
    doc.text(qWrapped, 24, y);
    doc.text(aWrapped, 128, y);
    y += lines * 5 + 2;
    doc.setDrawColor(235, 235, 235);
    doc.line(14, y - 1, 195, y - 1);
  }
}

function buildCombinedAssessmentsPdf(items: PdfDisplayData[]): jsPDF {
  const doc = new jsPDF();
  items.forEach((item, index) => {
    appendAssessmentPdfContent(doc, item, { addPageBefore: index > 0 });
  });
  return doc;
}

export default function NewApplicantSkillAssessmentsPage() {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const applicantId = params?.id;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [busyAssessmentId, setBusyAssessmentId] = useState<string | null>(null);
  const [busyAllDownload, setBusyAllDownload] = useState(false);
  const [applicant, setApplicant] = useState<WorkerProfile | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [skillPdfs, setSkillPdfs] = useState<SkillAssessmentPdf[]>([]);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const { profilePhotoUrl, email: candidateEmail } =
    useCandidateHeader(applicantId);

  const loadSkillPdfs = useCallback(async () => {
    if (!applicantId) return;
    const res = await fetch(
      `/api/admin/skill-assessment-pdf?workerId=${encodeURIComponent(applicantId)}`,
      { cache: "no-store" }
    );
    const json = (await res.json().catch(() => ({}))) as {
      files?: SkillAssessmentPdf[];
      error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Could not load skill assessment PDFs.");
    setSkillPdfs(Array.isArray(json.files) ? json.files : []);
  }, [applicantId]);

  useEffect(() => {
    if (!applicantId) return;
    void loadSkillPdfs().catch((error: unknown) => {
      setPdfError(error instanceof Error ? error.message : "Could not load skill assessment PDFs.");
    });
  }, [applicantId, loadSkillPdfs]);

  async function viewSkillPdf(fileId: string) {
    if (!applicantId) return;
    setPdfError(null);
    const res = await fetch(
      `/api/admin/worker-account-files?workerId=${encodeURIComponent(applicantId)}&source=portal&id=${encodeURIComponent(fileId)}`
    );
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !json.url) {
      setPdfError(json.error || "Could not open PDF.");
      return;
    }
    window.open(json.url, "_blank", "noopener,noreferrer");
  }

  async function handleSkillPdfSelected(selected: FileList | null) {
    const chosen = selected ? Array.from(selected) : [];
    if (pdfInputRef.current) pdfInputRef.current.value = "";
    if (!applicantId || chosen.length === 0) return;
    setUploadingPdf(true);
    setPdfError(null);
    try {
      for (const file of chosen) {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) throw new Error("Upload a PDF file.");
        const form = new FormData();
        form.append("workerId", applicantId);
        form.append("file", file);
        const res = await fetch("/api/admin/skill-assessment-pdf", { method: "POST", body: form });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error || `Could not upload ${file.name}.`);
      }
      await loadSkillPdfs();
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : "Could not upload PDF.");
      await loadSkillPdfs().catch(() => undefined);
    } finally {
      setUploadingPdf(false);
    }
  }

  useEffect(() => {
    async function fetchAssessmentList() {
      if (!applicantId) return;
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(
          `/api/admin/skill-assessment-results?workerId=${encodeURIComponent(applicantId)}`
        );
        const json = (await res.json()) as AssessmentListResponse & { error?: string };
        if (!res.ok) {
          throw new Error(json.error || `Failed to load skill assessments (${res.status})`);
        }
        setApplicant(json.worker ?? null);
        setAssessments(Array.isArray(json.skill_assessments) ? json.skill_assessments : []);
        if (applicantId) {
          dispatchCandidatePipelineRefresh(applicantId);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLoadError(msg);
        setApplicant(null);
        setAssessments([]);
      } finally {
        setLoading(false);
      }
    }

    void fetchAssessmentList();
  }, [applicantId]);

  async function fetchAssessmentDetail(assessmentId: string): Promise<AssessmentDetailResponse> {
    if (!applicantId) throw new Error("Missing worker ID");
    const res = await fetch(
      `/api/admin/skill-assessment-results?workerId=${encodeURIComponent(applicantId)}&assessmentId=${encodeURIComponent(assessmentId)}`
    );
    const json = (await res.json()) as AssessmentDetailResponse & { error?: string };
    if (!res.ok) {
      throw new Error(json.error || "Failed to load assessment result");
    }
    return json;
  }

  async function buildPdfForAssessment(assessmentId: string): Promise<jsPDF | null> {
    const detail = await fetchAssessmentDetail(assessmentId);
    const pdfDisplayData = buildPdfDisplayData(detail);
    const hasData = pdfDisplayData.questions.length > 0 || pdfDisplayData.assessmentTitle !== "Untitled Assessment";
    if (!hasData) {
      setResultError("No assessment data is available for this record.");
      return null;
    }
    return buildAssessmentPdf(pdfDisplayData);
  }

  async function handleSeeResults(assessmentId: string) {
    setResultError(null);
    setBusyAssessmentId(assessmentId);
    try {
      const doc = await buildPdfForAssessment(assessmentId);
      if (!doc) return;
      const blobUrl = doc.output("bloburl");
      window.open(blobUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setResultError(e instanceof Error ? e.message : "Failed to load assessment result");
    } finally {
      setBusyAssessmentId(null);
    }
  }

  async function handleDownload(assessmentId: string) {
    setResultError(null);
    setBusyAssessmentId(assessmentId);
    try {
      const doc = await buildPdfForAssessment(assessmentId);
      if (!doc) return;
      const namePart =
        assessments.find((a) => a.id === assessmentId)?.title?.replace(/\s+/g, "-").toLowerCase() ||
        "skill-assessment";
      doc.save(`${namePart}-${assessmentId}.pdf`);
    } catch (e) {
      setResultError(e instanceof Error ? e.message : "Failed to download assessment result");
    } finally {
      setBusyAssessmentId(null);
    }
  }

  const candidateName = useMemo(() => {
    const n = `${applicant?.first_name ?? ""} ${applicant?.last_name ?? ""}`.trim();
    return n || "Applicant";
  }, [applicant]);

  async function handleDownloadAll() {
    if (assessments.length === 0) {
      setResultError("No skill assessments available to download.");
      return;
    }

    setResultError(null);
    setBusyAllDownload(true);

    try {
      const pdfDataList: PdfDisplayData[] = [];

      for (const assessment of assessments) {
        const detail = await fetchAssessmentDetail(assessment.id);
        const pdfDisplayData = buildPdfDisplayData(detail);
        const hasData =
          pdfDisplayData.questions.length > 0 ||
          pdfDisplayData.assessmentTitle !== "Untitled Assessment";
        if (hasData) {
          pdfDataList.push(pdfDisplayData);
        }
      }

      if (pdfDataList.length === 0) {
        setResultError("No assessment data is available to download.");
        return;
      }

      const doc = buildCombinedAssessmentsPdf(pdfDataList);
      const namePart = candidateName.replace(/\s+/g, "-").toLowerCase() || "candidate";
      doc.save(`${namePart}-all-skill-assessments.pdf`);
    } catch (e) {
      setResultError(
        e instanceof Error ? e.message : "Failed to download all assessment results"
      );
    } finally {
      setBusyAllDownload(false);
    }
  }

  const candidateRole = applicant?.job_role || "N/A";
  const completedCount = useMemo(
    () => assessments.filter((assessment) => assessment.completed === true).length,
    [assessments]
  );

  return (
    <div className="flex min-h-screen bg-zinc-50 overflow-hidden">
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0A1F1C] text-white transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="px-6 py-8 flex items-center gap-3 border-b border-white/10">
            <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center">
              <span className="text-[#0A1F1C] font-bold text-3xl">N</span>
            </div>
            <div>
              <div className="font-semibold text-2xl tracking-tight">Nexus</div>
              <div className="text-xs text-teal-400 -mt-1">MedPro Staffing</div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-8 space-y-1">
            <div className="px-4 text-xs uppercase tracking-widest text-teal-400/70 mb-4">
              PERSONAL SETTINGS
            </div>
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/10 rounded-2xl"
            >
              Profile
            </a>
            <a
              href="#"
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/10 rounded-2xl"
            >
              Account
            </a>

            <div className="px-4 pt-8 text-xs uppercase tracking-widest text-teal-400/70 mb-4">
              TEAM MANAGEMENT
            </div>

            {[
              { label: "Candidates", href: "/admin_recruiter/candidates", icon: Users },
              { label: "New", href: "/admin_recruiter/new", icon: UserPlus },
              { label: "Pending", href: "/admin_recruiter/pending", icon: UserCheck },
              { label: "Approved", href: "/admin_recruiter/approved", icon: UserCheck },
              { label: "Disapproved", href: "/admin_recruiter/disapproved", icon: UserX },
              { label: "Workers", href: "/admin_recruiter/workers", icon: Briefcase },
              { label: "Schedule", href: "/admin_recruiter/schedule", icon: Calendar },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 text-sm rounded-2xl transition-all ${
                    isActive ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}

            <div className="px-4 pt-10">
              <a
                href="#"
                className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/10 rounded-2xl"
              >
                <Settings className="w-5 h-5" /> Settings
              </a>
            </div>
          </nav>

          <div className="p-6 border-t border-white/10">
            <button className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-white/10 rounded-2xl">
              <LogOut className="w-5 h-5" /> Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden lg:pl-72">
        <header className="h-16 border-b bg-white flex items-center px-6 justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="lg:hidden text-gray-600"
            >
              {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <div className="font-semibold text-2xl">New Applicant</div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-1 rounded-full text-sm">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Online
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-medium text-sm">Sean Smith</div>
                <div className="text-xs text-gray-600">Manager</div>
              </div>
              <img
                src="https://i.pravatar.cc/128?u=sean"
                alt="Sean Smith"
                className="w-9 h-9 rounded-full object-cover"
              />
            </div>
          </div>
        </header>

        <div className="flex-1 w-full min-w-0 overflow-auto admin-recruiter-page-pad">
          <div className="admin-recruiter-content-width">
            <DetailedTabs applicantId={applicantId} activeTab="Skill Assessments" />

            {loadError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {loadError}
              </div>
            ) : null}
            {resultError ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {resultError}
              </div>
            ) : null}
            {pdfError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {pdfError}
              </div>
            ) : null}

            {loading ? (
              <CandidateDetailLoader label="Loading skill assessments..." />
            ) : (
              <>
            <DetailedCandidateHeader
              name={candidateName}
              role={candidateRole}
              profilePhotoUrl={profilePhotoUrl}
              workerId={applicantId}
              candidateEmail={candidateEmail}
            />

            <div className="w-full min-w-0 admin-recruiter-content-width">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-[20px] font-semibold leading-7 text-[#1F2937]">Skill Assessment</h2>
                <div className="text-xs font-medium text-[#6B7280]">
                  Completed{" "}
                  <span className="font-semibold text-[#111827]">
                    {`${completedCount} of ${assessments.length}`}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {assessments.map((assessment) => (
                  <div key={assessment.id} className="@container/skillcard">
                    <div className="flex min-h-[84px] w-full flex-col items-start justify-between gap-4 rounded-[8px] border border-[color:color-mix(in_srgb,var(--brand-primary)_30%,white)] bg-[color:color-mix(in_srgb,var(--brand-primary)_8%,white)] px-4 py-5 @min-[480px]:h-[84px] @min-[480px]:flex-row @min-[480px]:items-center @min-[480px]:gap-5">
                      <div className="flex w-full min-w-0 items-center gap-4 @min-[480px]:w-auto">
                        <BrandedStepperCompleteIcon className="h-8 w-8 shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate text-[16px] font-semibold leading-6 text-[#1F2937]">
                            {assessment.title || "Untitled Assessment"}
                          </div>
                          <div className="mt-1 text-[14px] leading-5 text-[#475467]">
                            Score: {assessment.total_score ?? 0} | Answered: {assessment.answered_count ?? 0} |{" "}
                            {assessment.result_status}
                          </div>
                        </div>
                      </div>

                      <div className="flex w-full shrink-0 items-center gap-2.5 @min-[480px]:w-auto @min-[480px]:gap-3">
                        <button
                          onClick={() => handleSeeResults(assessment.id)}
                          disabled={busyAssessmentId === assessment.id}
                          className="inline-flex h-10 flex-1 items-center justify-center whitespace-nowrap rounded-lg border border-[color:var(--brand-primary)] px-3 text-[12.6px] font-semibold text-[color:var(--brand-primary)] disabled:opacity-50 @min-[480px]:flex-none @min-[480px]:px-6 @min-[480px]:text-sm"
                        >
                          See Results
                        </button>
                        <button
                          onClick={() => handleDownload(assessment.id)}
                          disabled={busyAssessmentId === assessment.id}
                          className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[color:var(--brand-primary)] px-3 text-[12.6px] font-semibold text-[color:var(--brand-primary)] disabled:opacity-50 @min-[480px]:flex-none @min-[480px]:gap-2 @min-[480px]:px-4 @min-[480px]:text-sm"
                        >
                          <BrandedFileTypeIcon type="pdf" className="h-5 w-5 shrink-0" />
                          Download
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {!loading && assessments.length === 0 ? (
                <div className="mt-5 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
                  No skill assessments found for this candidate.
                </div>
              ) : null}

              <div className="mt-8 rounded-md border border-[#D1D5DB] bg-white">
                <div className="flex flex-col gap-3 border-b border-[#E5E7EB] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-[16px] font-semibold leading-6 text-[#111827]">Skill assessment PDF</h3>
                    <p className="mt-1 text-sm text-[#6B7280]">
                      Upload one or more PDFs and open them from this view.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={uploadingPdf}
                    onClick={() => pdfInputRef.current?.click()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[color:var(--brand-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {uploadingPdf ? "Uploading..." : "Upload PDF"}
                  </button>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      void handleSkillPdfSelected(event.target.files);
                    }}
                  />
                </div>
                <div className="space-y-2 px-5 py-4">
                  {skillPdfs.length === 0 ? (
                    <p className="text-sm text-[#6B7280]">No PDF uploaded yet.</p>
                  ) : (
                    skillPdfs.map((file) => (
                      <div
                        key={file.id}
                        className="flex h-[50px] w-full max-w-[560px] items-center gap-2 rounded-[8px] border border-[color:color-mix(in_srgb,var(--brand-primary)_30%,white)] bg-[#F8FAFC] px-3"
                      >
                        <BrandedFileTypeIcon type="pdf" className="h-6 w-6 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-[color:var(--brand-primary)]">
                            {file.fileName}
                          </div>
                          <div className="text-xs text-[#6B7280]">Uploaded PDF</div>
                        </div>
                        <button
                          type="button"
                          disabled={!file.hasFile}
                          onClick={() => void viewSkillPdf(file.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[color:var(--brand-primary)] px-3 text-xs font-semibold text-[color:var(--brand-primary)] disabled:opacity-40"
                        >
                          <Eye className="h-4 w-4" />
                          View PDF
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => void handleDownloadAll()}
                  disabled={busyAllDownload || assessments.length === 0}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[color:var(--brand-primary)] px-6 py-2 text-center text-sm font-semibold text-[color:var(--brand-primary)] disabled:opacity-50 max-md:w-full md:h-10 md:py-0"
                >
                  <BrandedFileTypeIcon type="pdf" className="h-4 w-4" />
                  {busyAllDownload
                    ? "Preparing download..."
                    : "Download all skill assessment full results"}
                </button>
              </div>
            </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
