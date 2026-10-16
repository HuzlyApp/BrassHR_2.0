import { workflowStepIdFromMetadata } from "@/lib/onboarding/firma-step-settings";
import { hireLifecycleForPhase } from "@/lib/onboarding/hire-stage-catalog";
import type { TenantOnboardingStep } from "@/lib/onboarding/types";

/** Candidate screen families for Post-Hire library steps that the applicant completes. */
export type PostHireScreenKind =
  | "direct_deposit"
  | "tax_withholding"
  | "i9_attestation"
  | "acknowledgment"
  | "training";

export const POST_HIRE_SCREEN_KIND_BY_STEP_ID: Readonly<Record<string, PostHireScreenKind>> = {
  "direct-deposit-setup": "direct_deposit",
  "tax-forms": "tax_withholding",
  "i9-right-to-work-verification": "i9_attestation",
  "i9-section-1": "i9_attestation",
  "welcome-packet-esign": "acknowledgment",
  "policy-acknowledgment": "acknowledgment",
  "equipment-badge-acknowledgment": "acknowledgment",
  "safety-training": "training",
  "orientation-video": "training",
  "compliance-training": "training",
  "training-modules-quiz": "training",
  "training-modules": "training",
};

export const POST_HIRE_SCREEN_STEP_IDS: readonly string[] = Object.keys(POST_HIRE_SCREEN_KIND_BY_STEP_ID);

export function postHireScreenKindForStepId(stepId: string | null | undefined): PostHireScreenKind | null {
  if (!stepId) return null;
  return POST_HIRE_SCREEN_KIND_BY_STEP_ID[stepId] ?? null;
}

function rawWorkflowSettings(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const raw = metadata?.workflow_settings;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** Pre-Hire copies of these library steps keep their existing applicant screens. */
export function postHireScreenKindForStep(
  step: Pick<TenantOnboardingStep, "metadata"> | null | undefined
): PostHireScreenKind | null {
  if (!step) return null;
  const kind = postHireScreenKindForStepId(workflowStepIdFromMetadata(step.metadata));
  if (!kind) return null;
  return hireLifecycleForPhase(rawWorkflowSettings(step.metadata).phase) === "post_hire" ? kind : null;
}

/** Shown under the step title when the step has no description of its own. */
export const POST_HIRE_SCREEN_SUBTITLE: Readonly<Record<PostHireScreenKind, string>> = {
  direct_deposit: "Tell us where to deposit your pay.",
  tax_withholding: "Complete your federal tax withholding (Form W-4) so payroll withholds the right amount.",
  i9_attestation: "Complete Section 1 of Form I-9 to confirm your identity and eligibility to work in the U.S.",
  acknowledgment: "Review the material below and sign to acknowledge it.",
  training: "Complete the training below, then confirm you're done.",
};

const DEFAULT_ACKNOWLEDGMENT_BY_STEP_ID: Readonly<Record<string, string>> = {
  "employee-agreement":
    "I have reviewed the agreement and consent to sign it electronically.",
  "welcome-packet-esign":
    "I have received and reviewed the welcome packet and agree to the terms it describes.",
  "policy-acknowledgment":
    "I have read, understand, and agree to follow the company policies provided to me.",
  "equipment-badge-acknowledgment":
    "I acknowledge receipt of the equipment and badge issued to me and agree to return them when my assignment ends.",
  "safety-training": "I have completed the safety training and understand the safety procedures covered.",
  "orientation-video": "I have watched the orientation video in full.",
  "compliance-training": "I have completed the compliance training and understand my obligations.",
  "training-modules-quiz": "I have completed the training modules and quiz.",
  "training-modules": "I have completed the training modules and quiz.",
};

const DEFAULT_ACKNOWLEDGMENT_BY_KIND: Readonly<Record<PostHireScreenKind, string>> = {
  direct_deposit: "I authorize my employer to deposit my pay into the account above.",
  tax_withholding:
    "Under penalties of perjury, I declare that this certificate, to the best of my knowledge and belief, is true, correct, and complete.",
  i9_attestation:
    "I am aware that federal law provides for imprisonment and/or fines for false statements, or the use of false documents, in connection with the completion of this form. I attest, under penalty of perjury, that the information I have provided is true and correct.",
  acknowledgment: "I have read and acknowledge the material above.",
  training: "I have completed this training.",
};

export type PostHireScreenContent = {
  instructions: string | null;
  contentUrl: string | null;
  documentUrl: string | null;
  acknowledgmentText: string;
};

function readTrimmed(settings: Record<string, unknown>, key: string): string | null {
  const value = settings[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Only http(s) links are rendered to the applicant. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function readPostHireScreenContent(
  step: Pick<TenantOnboardingStep, "metadata"> & { title?: string }
): PostHireScreenContent {
  const settings = rawWorkflowSettings(step.metadata);
  const stepId = workflowStepIdFromMetadata(step.metadata);
  const kind = postHireScreenKindForStepId(stepId) ?? "acknowledgment";
  const dynamicAck = step.title ? `I confirm that I have completed ${step.title}.` : undefined;
  return {
    instructions: readTrimmed(settings, "applicantInstructions"),
    contentUrl: safeHttpUrl(readTrimmed(settings, "contentUrl")),
    documentUrl: safeHttpUrl(readTrimmed(settings, "documentUrl")),
    acknowledgmentText:
      readTrimmed(settings, "acknowledgmentText") ??
      (stepId ? DEFAULT_ACKNOWLEDGMENT_BY_STEP_ID[stepId] : undefined) ??
      dynamicAck ??
      DEFAULT_ACKNOWLEDGMENT_BY_KIND[kind],
  };
}

export type VideoEmbed =
  | { type: "iframe"; src: string }
  | { type: "video"; src: string };

/** Embeddable player for YouTube / Vimeo / Loom links or direct video files; null for anything else. */
export function videoEmbedForUrl(value: string | null | undefined): VideoEmbed | null {
  const safe = safeHttpUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = url.pathname.startsWith("/embed/")
      ? url.pathname.split("/")[2]
      : url.pathname.startsWith("/shorts/")
        ? url.pathname.split("/")[2]
        : url.searchParams.get("v");
    return id && /^[\w-]{6,}$/.test(id) ? { type: "iframe", src: `https://www.youtube.com/embed/${id}` } : null;
  }
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return id && /^[\w-]{6,}$/.test(id) ? { type: "iframe", src: `https://www.youtube.com/embed/${id}` } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.split("/").filter(Boolean).find((part) => /^\d+$/.test(part));
    return id ? { type: "iframe", src: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (host === "loom.com") {
    const match = url.pathname.match(/^\/(?:share|embed)\/([\w-]+)/);
    return match ? { type: "iframe", src: `https://www.loom.com/embed/${match[1]}` } : null;
  }
  if (/\.(mp4|webm|ogg)$/i.test(url.pathname)) return { type: "video", src: safe };
  return null;
}

/** ABA routing number: 9 digits with a valid 3-7-1 checksum. */
export function isValidRoutingNumber(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  const d = value.split("").map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

export function isValidBankAccountNumber(value: string): boolean {
  return /^\d{4,17}$/.test(value);
}

export function maskAccountNumber(value: string): string {
  const last4 = value.slice(-4);
  return `••••${last4}`;
}

export type DirectDepositInput = {
  accountHolderName: string;
  bankName: string;
  accountType: "checking" | "savings";
  routingNumber: string;
  accountNumber: string;
};

export function validateDirectDepositInput(
  raw: Partial<Record<keyof DirectDepositInput, unknown>>
): { ok: true; value: DirectDepositInput } | { ok: false; error: string } {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const accountHolderName = str(raw.accountHolderName);
  const bankName = str(raw.bankName);
  const accountType = str(raw.accountType);
  const routingNumber = str(raw.routingNumber).replace(/\s+/g, "");
  const accountNumber = str(raw.accountNumber).replace(/\s+/g, "");

  if (!accountHolderName || accountHolderName.length > 120) {
    return { ok: false, error: "Enter the account holder name." };
  }
  if (!bankName || bankName.length > 120) return { ok: false, error: "Enter your bank name." };
  if (accountType !== "checking" && accountType !== "savings") {
    return { ok: false, error: "Choose checking or savings." };
  }
  if (!isValidRoutingNumber(routingNumber)) {
    return { ok: false, error: "Enter a valid 9-digit routing number." };
  }
  if (!isValidBankAccountNumber(accountNumber)) {
    return { ok: false, error: "Enter a valid account number (4–17 digits)." };
  }
  return { ok: true, value: { accountHolderName, bankName, accountType, routingNumber, accountNumber } };
}

/** Labeled answers persisted on step progress so HR can review what the candidate submitted. */
export type PostHireSubmissionField = { label: string; value: string };

export type PostHireSubmission = {
  kind: PostHireScreenKind;
  fields: PostHireSubmissionField[];
  submittedAt: string | null;
};

export const POST_HIRE_SUBMISSION_DATA_KEY = "post_hire_submission";

export function buildPostHireSubmissionData(
  kind: PostHireScreenKind,
  fields: PostHireSubmissionField[],
  submittedAt: string = new Date().toISOString()
): Record<string, unknown> {
  return {
    [POST_HIRE_SUBMISSION_DATA_KEY]: {
      kind,
      fields: fields
        .map((field) => ({ label: field.label.trim(), value: field.value.trim() }))
        .filter((field) => field.label && field.value),
      submitted_at: submittedAt,
    },
  };
}

function isScreenKind(value: unknown): value is PostHireScreenKind {
  return (
    value === "direct_deposit" ||
    value === "tax_withholding" ||
    value === "i9_attestation" ||
    value === "acknowledgment" ||
    value === "training"
  );
}

export function readPostHireSubmission(data: unknown): PostHireSubmission | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = (data as Record<string, unknown>)[POST_HIRE_SUBMISSION_DATA_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (!isScreenKind(record.kind)) return null;
  const fields = Array.isArray(record.fields)
    ? record.fields.flatMap((field) => {
        if (!field || typeof field !== "object") return [];
        const { label, value } = field as Record<string, unknown>;
        return typeof label === "string" && typeof value === "string" && label && value
          ? [{ label, value }]
          : [];
      })
    : [];
  return {
    kind: record.kind,
    fields,
    submittedAt: typeof record.submitted_at === "string" ? record.submitted_at : null,
  };
}

/** Checkbox-style post-hire steps that must not show Completed without a candidate response. */
const CHECKBOX_EVIDENCE_KINDS: ReadonlySet<PostHireScreenKind> = new Set([
  "training",
  "acknowledgment",
  "i9_attestation",
  "direct_deposit",
]);

/** True when progress data includes a real candidate confirmation / submission. */
export function hasCandidatePostHireEvidence(
  kind: PostHireScreenKind | null | undefined,
  data: unknown
): boolean {
  const submission = readPostHireSubmission(data);
  if (submission && submission.fields.length > 0) return true;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const row = data as Record<string, unknown>;
  if (row.checkbox_confirmed === true) return true;
  if (kind === "tax_withholding") {
    return (
      row.firma_status === "completed" ||
      row.firma_status === "signed" ||
      typeof row.w4_filing_status === "string" ||
      Boolean(row.signing_request_id)
    );
  }
  return false;
}

/**
 * Downgrades a false "completed" status when a checkbox-style post-hire step has no
 * candidate confirmation. Prevents stepper/check UI from showing Completed incorrectly.
 */
export function effectivePostHireProgressStatus(
  kind: PostHireScreenKind | null | undefined,
  status: string | null | undefined,
  data: unknown
): string {
  const norm = String(status ?? "pending").trim().toLowerCase() || "pending";
  if (norm !== "completed") return norm;
  if (!kind || !CHECKBOX_EVIDENCE_KINDS.has(kind)) return norm;
  return hasCandidatePostHireEvidence(kind, data) ? norm : "pending";
}

export const W4_FILING_STATUS_OPTIONS = [
  { value: "single", label: "Single or Married filing separately" },
  { value: "married_jointly", label: "Married filing jointly or Qualifying surviving spouse" },
  { value: "head_of_household", label: "Head of household" },
] as const;

export const I9_CITIZENSHIP_OPTIONS = [
  { value: "citizen", label: "A citizen of the United States" },
  { value: "noncitizen_national", label: "A noncitizen national of the United States" },
  { value: "permanent_resident", label: "A lawful permanent resident" },
  { value: "authorized_alien", label: "A noncitizen authorized to work" },
] as const;

export type I9CitizenshipStatus = (typeof I9_CITIZENSHIP_OPTIONS)[number]["value"];

/** W-4 Step 3: $2,000 per qualifying child under 17 and $500 per other dependent. */
export function w4DependentsAmount(qualifyingChildren: number, otherDependents: number): number {
  const kids = Number.isFinite(qualifyingChildren) && qualifyingChildren > 0 ? Math.floor(qualifyingChildren) : 0;
  const others = Number.isFinite(otherDependents) && otherDependents > 0 ? Math.floor(otherDependents) : 0;
  return kids * 2000 + others * 500;
}
