/** Who acts on a workflow step, as shown in the staff step drawer. */
export type WorkflowStepOwnershipCopy = {
  /** Short badge / footer label. */
  badge: string;
  /** "Step for" value in the overview. */
  stepFor: string;
  /** One-line hint under the badge. */
  note: string;
};

export function workflowStepOwnershipCopy(params: {
  kind: string | null | undefined;
  staffCanAct: boolean;
  displayStatus?: string | null;
  /** Candidate step with upload fields staff can fill for the candidate. */
  staffCanUpload?: boolean;
}): WorkflowStepOwnershipCopy {
  if (params.staffCanAct) {
    return {
      badge: "Recruiter step",
      stepFor: "Recruiter step",
      note: params.displayStatus === "rejected" || params.displayStatus === "blocked"
        ? "This step was rejected by a recruiter."
        : "Complete it here to unlock the candidate's next step.",
    };
  }
  if (params.kind === "resume") {
    return {
      badge: "Candidate or recruiter step",
      stepFor: "Candidate or recruiter can upload resume",
      note: "Read-only. The resume can be uploaded by the candidate or by a recruiter.",
    };
  }
  if (params.staffCanUpload) {
    return {
      badge: "Candidate step",
      stepFor: "Candidate step (recruiter can upload)",
      note: "The candidate uploads these documents, or you can upload them for the candidate and mark the step complete.",
    };
  }
  return {
    badge: "Candidate step",
    stepFor: "Candidate step",
    note: "Read-only submission from the candidate.",
  };
}
