"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTenantBranding } from "@/app/components/tenant/TenantBrandingContext";
import { brandingToCssVars, readableTextOnBrand } from "@/lib/tenant/tenant-branding";
import {
  STAFF_REVIEW_NOTE_MAX_LENGTH,
  type StaffStepAction,
  type StaffStepVariant,
} from "@/lib/onboarding/staff-step-review-shared";

type ActionCopy = { title: (step: string) => string; description: string; confirm: string; confirmClass: string };

const VERIFICATION_COPY: Partial<Record<StaffStepAction, ActionCopy>> = {
  complete: {
    title: () => "Mark references as verified?",
    description: "Confirms the candidate's references checked out. This step is optional and never blocks the next stage.",
    confirm: "Verified",
    confirmClass: "shadow-sm hover:brightness-[0.97]",
  },
  needs_review: {
    title: () => "Mark references as needing review?",
    description: "Flags the references for another look. The candidate can still move on to the next stage.",
    confirm: "Need to Review",
    confirmClass: "bg-amber-500 text-white hover:bg-amber-600",
  },
  reject: {
    title: () => "Reject references?",
    description: "Records that the references couldn't be verified. This doesn't block the candidate. Add the reason for the record.",
    confirm: "Reject",
    confirmClass: "bg-red-600 text-white hover:bg-red-700",
  },
};

const SELECTION_COPY: Partial<Record<StaffStepAction, ActionCopy>> = {
  complete: {
    title: () => "Mark this candidate as qualified?",
    description: "Records that your team marked this candidate as qualified to move forward.",
    confirm: "Mark as Qualified",
    confirmClass: "shadow-sm hover:brightness-[0.97]",
  },
  needs_review: {
    title: () => "Put this candidate on hold?",
    description: "Use this while your team decides, for example when comparing several candidates for the same job.",
    confirm: "On Hold",
    confirmClass: "bg-amber-500 text-white hover:bg-amber-600",
  },
  reject: {
    title: () => "Mark this candidate as not selected?",
    description: "Records that your team won't put this candidate forward. Add the reason for the record.",
    confirm: "Not Selected",
    confirmClass: "bg-red-600 text-white hover:bg-red-700",
  },
};

const INTERVIEW_COPY: Partial<Record<StaffStepAction, ActionCopy>> = {
  complete: {
    title: () => "Mark interview as completed?",
    description:
      "Records that the candidate passed the interview and moves them on to the next stage. Add your interview notes for the team.",
    confirm: "Mark Completed",
    confirmClass: "shadow-sm hover:brightness-[0.97]",
  },
  reject: {
    title: () => "Reject after interview?",
    description:
      "Records that the candidate didn't pass the interview. They stay at the Interview stage. Add the reason for the record.",
    confirm: "Reject",
    confirmClass: "bg-red-600 text-white hover:bg-red-700",
  },
};

const VARIANT_COPY: Record<Exclude<StaffStepVariant, "default">, Partial<Record<StaffStepAction, ActionCopy>>> = {
  verification: VERIFICATION_COPY,
  selection: SELECTION_COPY,
  interview: INTERVIEW_COPY,
};

const COPY: Record<StaffStepAction, ActionCopy> = {
  needs_review: {
    title: (step) => `Mark ${step} as needing review?`,
    description: "The step is flagged for another look and stays open.",
    confirm: "Need to Review",
    confirmClass: "bg-amber-500 text-white hover:bg-amber-600",
  },
  complete: {
    title: (step) => `Complete ${step}?`,
    description:
      "This marks the step as completed by you. If it was the only thing blocking the candidate, their next application step unlocks.",
    confirm: "Mark complete",
    confirmClass: "shadow-sm hover:brightness-[0.97]",
  },
  reject: {
    title: (step) => `Reject ${step}?`,
    description:
      "The step is marked as rejected and the candidate stays blocked at it. Add the reason for the record.",
    confirm: "Reject step",
    confirmClass: "bg-red-600 text-white hover:bg-red-700",
  },
  reopen: {
    title: (step) => `Reopen ${step}?`,
    description:
      "The step goes back to Not Started. The candidate is blocked again until someone completes it.",
    confirm: "Reopen step",
    confirmClass: "bg-slate-800 text-white hover:bg-slate-900",
  },
};

const ON_BEHALF_COMPLETE_COPY: ActionCopy = {
  title: (step) => `Complete ${step} for the candidate?`,
  description:
    "Marks this step completed with the documents uploaded here and approves them. The candidate won't need to do this step in their portal.",
  confirm: "Mark complete",
  confirmClass: "shadow-sm hover:brightness-[0.97]",
};

const VERIFY_SUBMISSION_COPY: ActionCopy = {
  title: (step) => `Mark ${step} as complete?`,
  description:
    "Confirms you reviewed the candidate's submission and it checks out. The step changes from Submitted to Completed. The candidate's progress isn't affected.",
  confirm: "Mark as complete",
  confirmClass: "shadow-sm hover:brightness-[0.97]",
};

export default function WorkflowStepStaffActionModal({
  action,
  variant = "default",
  optional = false,
  onBehalf = false,
  verifySubmission = false,
  stepTitle,
  submitting,
  error,
  onCancel,
  onConfirm,
}: {
  action: StaffStepAction | null;
  variant?: StaffStepVariant;
  /** Optional steps never block the candidate, so reject copy must not say they do. */
  optional?: boolean;
  /** Staff completing a candidate upload step after uploading the documents themselves. */
  onBehalf?: boolean;
  /** Recruiter verifying a candidate step the candidate already submitted. */
  verifySubmission?: boolean;
  stepTitle: string;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (input: { note: string; notifyCandidate: boolean }) => void;
}) {
  const branding = useTenantBranding();
  const [note, setNote] = useState("");
  const [notifyCandidate, setNotifyCandidate] = useState(false);

  // Portal content sits outside the branding wrapper, so re-declare the tenant palette here.
  const brandStyle = useMemo(
    () => ({
      ...brandingToCssVars(branding),
      "--step-modal-cta": `linear-gradient(90deg, ${branding.primaryHex} 0%, color-mix(in srgb, ${branding.primaryHex} 74%, white) 100%)`,
      "--step-modal-on-primary": readableTextOnBrand(branding.primaryHex),
      "--step-modal-on-secondary": readableTextOnBrand(branding.secondaryHex),
    }) as React.CSSProperties,
    [branding]
  );

  useEffect(() => {
    if (!action) return;
    setNote("");
    setNotifyCandidate(false);
  }, [action]);

  const baseCopy = action
    ? verifySubmission && action === "complete"
      ? VERIFY_SUBMISSION_COPY
      : onBehalf && action === "complete"
        ? ON_BEHALF_COMPLETE_COPY
        : (variant === "default" ? undefined : VARIANT_COPY[variant][action]) ?? COPY[action]
    : null;
  const copy =
    baseCopy && optional && action === "reject" && variant === "default"
      ? {
          ...baseCopy,
          description:
            "The step is marked as rejected. It's optional, so the candidate can still move to the next stage. Add the reason for the record.",
        }
      : baseCopy;
  const showNotify = action === "complete" && !verifySubmission;
  const noteRequired = action === "reject";
  const canSubmit = !submitting && (!noteRequired || note.trim().length > 0);

  return (
    <Dialog.Root
      open={Boolean(action)}
      onOpenChange={(open) => {
        if (!open && !submitting) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/40" />
        <Dialog.Content
          style={brandStyle}
          className="fixed left-1/2 top-1/2 z-[111] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-5 shadow-2xl outline-none"
          aria-describedby="workflow-step-staff-action-desc"
        >
          {copy ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!canSubmit) return;
                onConfirm({ note: note.trim(), notifyCandidate: showNotify && notifyCandidate });
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <Dialog.Title
                  className="text-base font-semibold"
                  style={{ color: "var(--brand-secondary)" }}
                >
                  {copy.title(stepTitle)}
                </Dialog.Title>
                <Dialog.Close
                  disabled={submitting}
                  style={{
                    backgroundColor: "var(--brand-secondary)",
                    color: "var(--step-modal-on-secondary)",
                  }}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full shadow-sm transition hover:brightness-110 disabled:opacity-50"
                  aria-label="Cancel"
                >
                  <X className="h-4 w-4" aria-hidden />
                </Dialog.Close>
              </div>
              <Dialog.Description id="workflow-step-staff-action-desc" className="mt-1 text-sm text-slate-600">
                {copy.description}
              </Dialog.Description>

              <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="workflow-step-staff-note">
                {noteRequired
                  ? "Reason (required)"
                  : variant === "interview"
                    ? "Interview notes (optional)"
                    : "Note (optional)"}
              </label>
              <textarea
                id="workflow-step-staff-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={STAFF_REVIEW_NOTE_MAX_LENGTH}
                rows={4}
                disabled={submitting}
                placeholder={
                  noteRequired
                    ? variant === "interview"
                      ? "Why didn't the candidate pass the interview?"
                      : "Why is this step rejected?"
                    : variant === "interview"
                      ? "Interview feedback, strengths, concerns, or next steps"
                      : onBehalf
                        ? "For example: documents received from the candidate by email"
                        : verifySubmission
                          ? "For example: reviewed answers, documents look valid"
                          : "Screening outcome, call summary, or anything the team should know"
                }
                className="mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[color:var(--brand-primary)]"
              />

              {showNotify ? (
                <label className="mt-3 flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyCandidate}
                    onChange={(event) => setNotifyCandidate(event.target.checked)}
                    disabled={submitting}
                    className="mt-0.5 h-[18px] w-[18px] rounded-[4px] cursor-pointer accent-[color:var(--brand-secondary)]"
                    style={{
                      accentColor: branding.secondaryHex,
                    }}
                  />
                  <span className="select-none">
                    Email the candidate a link to their next step
                    <span className="block text-xs text-slate-500">
                      Sent to the candidate only, and only if completing this step unlocks a step they
                      need to fill in.
                    </span>
                  </span>
                </label>
              ) : null}

              {error ? (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              ) : null}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={submitting}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={
                    action === "complete"
                      ? {
                          background: "var(--step-modal-cta)",
                          color: "var(--step-modal-on-primary)",
                        }
                      : undefined
                  }
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${copy.confirmClass}`}
                >
                  {submitting ? "Saving…" : copy.confirm}
                </button>
              </div>
            </form>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
