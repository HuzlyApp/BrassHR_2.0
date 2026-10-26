import { requiredDocumentsForStep } from "@/lib/onboarding/professional-license-step";
import type {
  OnboardingStepType,
  TenantOnboardingConfig,
  TenantRequiredDocument,
} from "@/lib/onboarding/types";
import { readStepLifecyclePhase } from "@/lib/onboarding/workflow-phase";

export type AdminAttachmentRequirement = {
  id: string;
  title: string;
  step_key: string;
  step_title?: string;
  step_type: OnboardingStepType;
  phase: "pre_hire" | "post_hire";
  required_document_id: string | null;
  submitted_document_id: string | null;
  legacy_document_key: string | null;
  status: string | null;
  url: string | null;
  filename: string;
  sort_order: number;
  uploaded_at?: string | null;
  uploaded_by?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
  is_required?: boolean;
  document_kind?: "certificate" | "license" | "vaccination" | "other" | null;
  has_expiration?: boolean;
  issued_date?: string | null;
  expiry_date?: string | null;
  files?: Array<{
    id: string;
    url: string | null;
    filename: string;
    status: string | null;
  }>;
};

export type LegacyDocumentUrls = {
  nursing_license_url: string | null;
  tb_test_url: string | null;
  cpr_certification_url: string | null;
  authorization_document_url: string | null;
  ssn_url?: string | null;
  drivers_license_url?: string | null;
};

export type SubmittedDocumentRecord = {
  submitted_document_id: string | null;
  required_document_id: string;
  signed_url: string | null;
  original_file_name: string | null;
  status: string | null;
  uploaded_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
};

export type AdminAttachmentBuildInput = {
  config: TenantOnboardingConfig | null;
  resumeUrl: string | null;
  resumePath: string | null;
  resumePathRaw: string | null;
  legacyUrls: LegacyDocumentUrls;
  submittedByRequiredId: Map<string, SubmittedDocumentRecord>;
  /** When false, never emit the old fixed license/TB/CPR list (builder-only tenants). */
  useLegacyFallback: boolean;
};

const DOCUMENT_STEP_TYPES: OnboardingStepType[] = [
  "document_upload",
  "professional_license",
  "authorizations",
];

function basenameFromStoragePath(path: string | null | undefined): string {
  if (!path?.trim()) return "—";
  const parts = path.trim().split("/");
  return parts[parts.length - 1] || "—";
}

function fileNameFromHttpUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "—";
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : "—";
  } catch {
    return "—";
  }
}

function resumeFilename(
  resumePath: string | null,
  resumePathRaw: string | null,
  resumeUrl: string | null
): string {
  if (resumePath?.trim()) return basenameFromStoragePath(resumePath);
  const raw = resumePathRaw?.trim();
  if (raw?.startsWith("http://") || raw?.startsWith("https://")) {
    return fileNameFromHttpUrl(raw);
  }
  if (resumeUrl?.trim()) return fileNameFromHttpUrl(resumeUrl);
  return basenameFromStoragePath(raw ?? null);
}

/** Map legacy worker_documents columns by requirement title (pre-builder uploads). */
export function legacyUrlForDocumentTitle(
  title: string,
  legacy: LegacyDocumentUrls
): string | null {
  const t = title.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("resume")) return null;
  if (t.includes("nursing") && t.includes("license")) return legacy.nursing_license_url;
  if (t.includes("tb") || t.includes("tuberculosis")) return legacy.tb_test_url;
  if (t.includes("cpr") || t.includes("bls")) return legacy.cpr_certification_url;
  if (t.includes("authorization") || t.includes("agreement") || t.includes("w-2") || t.includes("i-9")) {
    return legacy.authorization_document_url;
  }
  if (t.includes("ssn") || t.includes("social security")) return legacy.ssn_url ?? null;
  if (t.includes("driver") && t.includes("license")) return legacy.drivers_license_url ?? null;
  if (t.includes("license")) return legacy.nursing_license_url;
  return null;
}

function resolveDocumentUrl(
  doc: TenantRequiredDocument,
  submittedByRequiredId: Map<string, SubmittedDocumentRecord>,
  legacy: LegacyDocumentUrls
): { url: string | null; filename: string } {
  const submitted = submittedByRequiredId.get(doc.id);
  if (submitted?.signed_url) {
    return {
      url: submitted.signed_url,
      filename: submitted.original_file_name?.trim() || doc.title,
    };
  }
  const legacyUrl = legacyUrlForDocumentTitle(doc.title, legacy);
  return {
    url: legacyUrl,
    filename: legacyUrl ? fileNameFromHttpUrl(legacyUrl) : "—",
  };
}

function stepAcceptsRequiredDocuments(stepType: OnboardingStepType): boolean {
  return (
    DOCUMENT_STEP_TYPES.includes(stepType) ||
    stepType === "custom_question"
  );
}

/** Rows for admin attachments / verified-documents UI from active onboarding config. */
export function buildAdminAttachmentRequirements(
  input: AdminAttachmentBuildInput
): AdminAttachmentRequirement[] {
  const { config } = input;
  const enabled =
    config?.steps.filter((s) => s.is_enabled).sort((a, b) => a.sort_order - b.sort_order) ?? [];

  if (enabled.length === 0) {
    return input.useLegacyFallback ? buildLegacyAttachmentRequirements(input) : [];
  }

  const rows: AdminAttachmentRequirement[] = [];
  let sortOrder = 0;

  for (const step of enabled) {
    const phase = readStepLifecyclePhase(step);
    if (step.step_type === "resume_upload") {
      rows.push({
        id: `step-${step.step_key}`,
        title: step.title.trim() || "Resume",
        step_key: step.step_key,
        step_title: step.title,
        step_type: step.step_type,
        phase,
        required_document_id: null,
        submitted_document_id: null,
        legacy_document_key: null,
        status: input.resumeUrl ? "uploaded" : null,
        url: input.resumeUrl,
        filename: resumeFilename(input.resumePath, input.resumePathRaw, input.resumeUrl),
        sort_order: sortOrder++,
        is_required: step.is_required !== false,
      });
      continue;
    }

    if (!stepAcceptsRequiredDocuments(step.step_type)) {
      continue;
    }

    const docs = requiredDocumentsForStep(config, step.id);
    if (docs.length === 0) {
      if (step.step_type === "authorizations" && input.legacyUrls.authorization_document_url) {
        const url = input.legacyUrls.authorization_document_url;
        rows.push({
          id: `step-${step.step_key}-authorization`,
          title: step.title.trim() || "Authorization Document",
          step_key: step.step_key,
          step_title: step.title,
          step_type: step.step_type,
          phase,
          required_document_id: null,
          submitted_document_id: null,
          legacy_document_key: "document_url",
          status: url ? "uploaded" : null,
          url,
          filename: fileNameFromHttpUrl(url),
          sort_order: sortOrder++,
          is_required: step.is_required !== false,
        });
      }
      continue;
    }

    for (const doc of docs) {
      const { url, filename } = resolveDocumentUrl(
        doc,
        input.submittedByRequiredId,
        input.legacyUrls
      );
      const submitted = input.submittedByRequiredId.get(doc.id);
      rows.push({
        id: `reqdoc-${doc.id}`,
        title: doc.title,
        step_key: step.step_key,
        step_title: step.title,
        step_type: step.step_type,
        phase,
        required_document_id: doc.id,
        submitted_document_id: submitted?.submitted_document_id ?? null,
        legacy_document_key: null,
        status: submitted?.status ?? (url ? "uploaded" : null),
        url,
        filename,
        sort_order: sortOrder++,
        is_required: doc.is_required !== false,
        uploaded_at: submitted?.uploaded_at ?? null,
        reviewed_at: submitted?.reviewed_at ?? null,
        reviewed_by: submitted?.reviewed_by ?? null,
        review_notes: submitted?.review_notes ?? null,
      });
    }
  }

  return rows;
}

/** Pre–onboarding-builder tenants: fixed license / TB / CPR / resume list. */
export function buildLegacyAttachmentRequirements(
  input: AdminAttachmentBuildInput
): AdminAttachmentRequirement[] {
  const { legacyUrls } = input;
  const items: Array<{
    id: string;
    title: string;
    url: string | null;
    step_key: string;
    step_type: OnboardingStepType;
    legacy_document_key: string | null;
  }> = [
    {
      id: "resume",
      title: "Resume",
      url: input.resumeUrl,
      step_key: "resume_upload",
      step_type: "resume_upload",
      legacy_document_key: null,
    },
    {
      id: "license",
      title: "Nursing License",
      url: legacyUrls.nursing_license_url,
      step_key: "professional_license",
      step_type: "professional_license",
      legacy_document_key: "nursing_license_url",
    },
    {
      id: "tb",
      title: "TB Test",
      url: legacyUrls.tb_test_url,
      step_key: "professional_license",
      step_type: "professional_license",
      legacy_document_key: "tb_test_url",
    },
    {
      id: "cpr",
      title: "CPR Certifications",
      url: legacyUrls.cpr_certification_url,
      step_key: "professional_license",
      step_type: "professional_license",
      legacy_document_key: "cpr_certification_url",
    },
    {
      id: "authorization",
      title: "Authorization Document",
      url: legacyUrls.authorization_document_url,
      step_key: "authorizations",
      step_type: "authorizations",
      legacy_document_key: "document_url",
    },
  ];

  return items.map((item, index) => ({
    id: item.id,
    title: item.title,
    step_key: item.step_key,
    step_title: item.title,
    step_type: item.step_type,
    phase: "pre_hire" as const,
    required_document_id: null,
    submitted_document_id: null,
    legacy_document_key: item.legacy_document_key,
    status: item.url ? "uploaded" : null,
    url: item.url,
    filename:
      item.id === "resume"
        ? resumeFilename(input.resumePath, input.resumePathRaw, input.resumeUrl)
        : fileNameFromHttpUrl(item.url),
    sort_order: index,
    is_required: true,
  }));
}

export function attachmentRequirementHasUpload(req: AdminAttachmentRequirement): boolean {
  return typeof req.url === "string" && req.url.trim().length > 0;
}

export function isResumeAttachmentRequirement(
  req: Pick<AdminAttachmentRequirement, "id" | "step_type">
): boolean {
  return req.step_type === "resume_upload" || req.id === "resume";
}
