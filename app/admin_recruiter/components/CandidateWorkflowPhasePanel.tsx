"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import WorkflowPhaseBadge from "./WorkflowPhaseBadge";
import CandidateWorkflowStepModal from "./CandidateWorkflowStepModal";
import type {
  CandidateWorkflowAssignmentView,
  CandidateWorkflowDocumentView,
  CandidateWorkflowStepView,
} from "@/lib/onboarding/candidate-workflow-phase-view";
import type { WorkflowStepInspection } from "@/lib/onboarding/candidate-workflow-step-inspection";
import {
  assignmentSourceLabel,
  stepDisplayStatusLabel,
} from "@/lib/onboarding/assigned-workflow-steps";
import {
  lifecyclePhaseLabel,
  type EmploymentLifecyclePhase,
  type PhaseProgressCounts,
} from "@/lib/onboarding/workflow-phase-groups";

function documentStatusLabel(status: string | null | undefined, url: string | null): string {
  const value = String(status ?? "").trim().toLowerCase();
  if (value === "approved") return "Approved";
  if (value === "rejected") return "Rejected";
  if (value === "uploaded" || url) return "Uploaded";
  return "Not uploaded";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { timeZone: "America/New_York",  month: "short", day: "numeric", year: "numeric" });
}

export default function CandidateWorkflowPhasePanel({
  workerId,
  phase,
  assigned,
  loading,
  error,
  progress,
  steps,
  documents,
  assignment,
  emptyAssignedMessage,
  activationFailed,
  onWorkflowChanged,
}: {
  workerId?: string;
  phase: EmploymentLifecyclePhase;
  assigned: boolean;
  loading?: boolean;
  error?: string | null;
  progress: PhaseProgressCounts;
  steps: CandidateWorkflowStepView[];
  documents: CandidateWorkflowDocumentView[];
  assignment?: CandidateWorkflowAssignmentView | null;
  emptyAssignedMessage: string;
  activationFailed?: boolean;
  onWorkflowChanged?: () => void;
}) {
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<WorkflowStepInspection | null>(null);
  const [inspectionLoading, setInspectionLoading] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);

  async function fetchInspection(stepId: string, options?: { silent?: boolean }) {
    if (!workerId) return;
    if (!options?.silent) {
      setInspection(null);
      setInspectionError(null);
      setInspectionLoading(true);
    }
    try {
      const res = await fetch(
        `/api/admin/candidates/${encodeURIComponent(workerId)}/workflow-steps/${encodeURIComponent(stepId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as WorkflowStepInspection & { error?: string };
      if (!res.ok) {
        if (!options?.silent) setInspectionError(json.error || "Failed to load step details.");
        return;
      }
      setInspection(json);
    } catch (err) {
      if (!options?.silent) {
        setInspectionError(err instanceof Error ? err.message : "Failed to load step details.");
      }
    } finally {
      if (!options?.silent) setInspectionLoading(false);
    }
  }

  async function openStep(step: CandidateWorkflowStepView) {
    if (!workerId) return;
    setOpenStepId(step.id);
    await fetchInspection(step.id);
  }

  async function handleStepUpdated() {
    onWorkflowChanged?.();
    if (openStepId) await fetchInspection(openStepId, { silent: true });
  }

  if (loading) {
    return (
      <div className="rounded-md border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
        Loading {lifecyclePhaseLabel(phase)} workflow…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </div>
    );
  }

  const activationBanner = activationFailed ? (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
      This applicant is marked Hired, but Post-Hire activation did not complete. Retry the Hired
      status change or contact support. Pre-Hire history is unchanged.
    </div>
  ) : null;

  if (!assigned) {
    return (
      <div className="space-y-3">
        {activationBanner}
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
          {emptyAssignedMessage}
        </div>
      </div>
    );
  }

  const documentsByStep = new Map<string, CandidateWorkflowDocumentView[]>();
  for (const doc of documents) {
    const key = doc.step_key || "other";
    const list = documentsByStep.get(key) ?? [];
    list.push(doc);
    documentsByStep.set(key, list);
  }

  return (
    <div className="space-y-4">
      {activationBanner}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#111827]">{lifecyclePhaseLabel(phase)}</h2>
        <p className="text-sm font-medium text-slate-600">{progress.label}</p>
      </div>

      {assignment ? (
        <section
          className="rounded-md border border-slate-200 bg-white px-4 py-3"
          aria-label="Assigned workflow"
        >
          <dl className="grid grid-cols-1 gap-2 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="font-medium text-slate-500">Workflow</dt>
              <dd className="text-slate-800">{assignment.workflowName}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Phase</dt>
              <dd className="text-slate-800">{lifecyclePhaseLabel(assignment.phase)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Version</dt>
              <dd className="break-all text-slate-800">{assignment.version || "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Assigned</dt>
              <dd className="text-slate-800">{formatDate(assignment.assignedAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Assignment source</dt>
              <dd className="text-slate-800">{assignmentSourceLabel(assignment.assignmentSource)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Current step</dt>
              <dd className="text-slate-800">{assignment.currentStepTitle || "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Progress</dt>
              <dd className="text-slate-800">
                {assignment.completedCount} / {assignment.totalCount} completed
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="rounded-md border border-[#D1D5DB] bg-white">
        <h3 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-[#111827]">
          Steps
        </h3>
        {steps.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-600">
            This {lifecyclePhaseLabel(phase)} workflow has no configured steps.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {steps.map((step) => (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => void openStep(step)}
                  aria-label={`View ${step.title} submission`}
                  className="flex w-full cursor-pointer flex-wrap items-start justify-between gap-2 px-4 py-3 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--brand-primary)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium text-[#111827]">{step.title}</p>
                      <WorkflowPhaseBadge phase={step.phase} />
                      <span className="text-[11px] text-slate-500">
                        {step.required ? "Required" : "Optional"}
                      </span>
                      <span className="text-[11px] capitalize text-slate-400">
                        {step.stepType.replaceAll("_", " ").replaceAll("-", " ")}
                      </span>
                    </div>
                    {step.detail ? (
                      <p className="mt-1 text-[11px] text-amber-800">{step.detail}</p>
                    ) : null}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-600">
                    {stepDisplayStatusLabel(step)}
                    <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />
                    <span className="sr-only">View details</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-[#D1D5DB] bg-white">
        <h3 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-[#111827]">
          Documents
        </h3>
        {documents.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-600">
            No documents are required for this {lifecyclePhaseLabel(phase)} phase.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {steps.map((step) => {
              const stepDocs = documentsByStep.get(step.stepKey) ?? [];
              if (!stepDocs.length) return null;
              return (
                <li key={`docs-${step.id}`} className="px-4 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {step.title}
                  </p>
                  <ul className="space-y-3">
                    {stepDocs.map((doc) => (
                      <li key={doc.id} className="rounded-md border border-slate-100 px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="break-words text-sm font-medium text-[#111827]">{doc.title}</p>
                          <div className="flex items-center gap-1.5">
                            <WorkflowPhaseBadge phase={doc.phase} />
                            {doc.url ? (
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-semibold text-[color:var(--brand-primary)]"
                              >
                                View / download
                              </a>
                            ) : null}
                          </div>
                        </div>
                        <dl className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-slate-500 sm:grid-cols-2">
                          <div>Status: {documentStatusLabel(doc.status, doc.url)}</div>
                          <div>{doc.is_required === false ? "Optional" : "Required"}</div>
                          <div>Uploaded: {formatDate(doc.uploaded_at)}</div>
                          <div>Uploaded by: {doc.uploaded_by?.trim() || "Applicant"}</div>
                          <div>Verification: {documentStatusLabel(doc.status, doc.url)}</div>
                          <div>Reviewed by: {doc.reviewed_by?.trim() || "—"}</div>
                          {doc.status === "rejected" && doc.review_notes ? (
                            <div className="sm:col-span-2 text-rose-700">
                              Rejection reason: {doc.review_notes}
                            </div>
                          ) : null}
                        </dl>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <CandidateWorkflowStepModal
        open={openStepId != null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenStepId(null);
            setInspection(null);
            setInspectionError(null);
          }
        }}
        loading={inspectionLoading}
        error={inspectionError}
        inspection={inspection}
        workerId={workerId}
        onStepUpdated={handleStepUpdated}
      />
    </div>
  );
}
