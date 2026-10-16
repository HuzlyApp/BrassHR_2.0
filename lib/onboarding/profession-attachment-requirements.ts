import type { AdminAttachmentRequirement, LegacyDocumentUrls } from "@/lib/onboarding/build-admin-attachment-requirements";
import type { ProfessionUploadDocument } from "@/lib/professions/profession-documents";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProfessionAttachmentFile = {
  id: string;
  signedUrl: string | null;
  originalFileName: string | null;
  status: string | null;
  fileCount?: number;
  issuedDate?: string | null;
  expiryDate?: string | null;
};

function isResumeAttachmentRow(row: AdminAttachmentRequirement): boolean {
  return row.step_type === "resume_upload" || row.id === "resume";
}

function documentNameKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function fileNameFromUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "—";
  const path = url.split("?")[0] ?? url;
  const segment = path.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(segment) || "—";
  } catch {
    return segment || "—";
  }
}

function legacyFileForDocument(
  name: string,
  legacy: LegacyDocumentUrls
): { url: string | null; key: string | null } {
  const title = name.trim().toLowerCase();
  if (title.includes("nursing") && title.includes("license")) {
    return { url: legacy.nursing_license_url, key: "nursing_license_url" };
  }
  if (title.includes("cpr")) {
    return { url: legacy.cpr_certification_url, key: "cpr_certification_url" };
  }
  if (title.includes("tb") || title.includes("tuberculosis")) {
    return { url: legacy.tb_test_url, key: "tb_test_url" };
  }
  if (title.includes("driver") && title.includes("license")) {
    return { url: legacy.drivers_license_url ?? null, key: "drivers_license_url" };
  }
  return { url: null, key: null };
}

/**
 * Documents on the attachments page come from profession settings.
 * Workflow rows such as Nursing License or SSN Card stay only when that name is in settings,
 * and an existing upload with the same name is mapped onto that settings row.
 */
export function applyProfessionDocumentsToAttachments(
  rows: AdminAttachmentRequirement[],
  documents: ProfessionUploadDocument[],
  filesByDocumentId: Map<string, ProfessionAttachmentFile[]>,
  legacy: LegacyDocumentUrls
): AdminAttachmentRequirement[] {
  const resumeRows = rows.filter(isResumeAttachmentRow);
  const previousByName = new Map<string, AdminAttachmentRequirement>();
  for (const row of rows) {
    if (isResumeAttachmentRow(row) || !row.url) continue;
    previousByName.set(documentNameKey(row.title), row);
  }

  const professionRows: AdminAttachmentRequirement[] = [...documents]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((doc, index) => {
      const uploads = filesByDocumentId.get(doc.id) ?? [];
      const latest = uploads[uploads.length - 1];
      const mapped = previousByName.get(documentNameKey(doc.name));
      const legacyFile = legacyFileForDocument(doc.name, legacy);
      const files =
        uploads.length > 0
          ? uploads.map((upload) => ({
              id: upload.id,
              url: upload.signedUrl,
              filename: upload.originalFileName?.trim() || fileNameFromUrl(upload.signedUrl),
              status: upload.status,
            }))
          : mapped?.url
            ? [
                {
                  id: mapped.submitted_document_id || `legacy-${doc.id}`,
                  url: mapped.url,
                  filename:
                    mapped.filename && mapped.filename !== "—"
                      ? mapped.filename
                      : fileNameFromUrl(mapped.url),
                  status: mapped.status,
                },
              ]
            : legacyFile.url
              ? [
                  {
                    id: `legacy-file-${doc.id}`,
                    url: legacyFile.url,
                    filename: fileNameFromUrl(legacyFile.url),
                    status: "uploaded",
                  },
                ]
              : [];
      const url = files[0]?.url ?? null;
      return {
        id: `profession-doc-${doc.id}`,
        title: doc.name,
        step_key: "professional_license",
        step_title: "Upload documents",
        step_type: "professional_license" as const,
        phase: "pre_hire" as const,
        required_document_id: doc.id,
        submitted_document_id: uploads.length ? null : mapped?.submitted_document_id ?? null,
        legacy_document_key: uploads.length ? null : mapped?.legacy_document_key ?? legacyFile.key,
        status: latest?.status ?? mapped?.status ?? (url ? "uploaded" : null),
        url,
        filename: files[0]?.filename ?? "—",
        files,
        sort_order: resumeRows.length + index,
        is_required: doc.isRequired,
        document_kind: doc.documentKind,
        has_expiration: doc.hasExpiration,
        issued_date: latest?.issuedDate ?? null,
        expiry_date: latest?.expiryDate ?? null,
      };
    });

  return [...resumeRows, ...professionRows];
}

async function professionIdForFlows(
  supabase: SupabaseClient,
  tenantId: string,
  flowIds: string[]
): Promise<string | null> {
  const ids = [...new Set(flowIds.filter(Boolean))];
  if (!ids.length) return null;
  const { data: flows, error } = await supabase
    .from("onboarding_flows")
    .select("id, profession_id")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (error) throw error;
  const professionByFlow = new Map(
    (flows ?? []).map((flow) => [String(flow.id), flow.profession_id ? String(flow.profession_id) : ""])
  );
  for (const id of ids) {
    const professionId = professionByFlow.get(id);
    if (professionId) return professionId;
  }
  return null;
}

function professionNameFromJob(row: { professions?: { name?: string | null } | { name?: string | null }[] | null }): string {
  const embedded = row.professions;
  const record = Array.isArray(embedded) ? embedded[0] : embedded;
  return typeof record?.name === "string" ? record.name.trim() : "";
}

export async function resolveWorkerTenantProfessionId(
  supabase: SupabaseClient,
  tenantId: string,
  workerId: string
): Promise<string | null> {
  const { data: applications, error } = await supabase
    .from("job_applications")
    .select("workflow_id, job_requisition_id, tenant_profession_id")
    .eq("tenant_id", tenantId)
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw error;

  const linked = (applications ?? []).find((row) => row.tenant_profession_id);
  if (linked?.tenant_profession_id) return String(linked.tenant_profession_id);

  const workflowIds = [
    ...new Set(
      (applications ?? [])
        .map((row) => (row.workflow_id ? String(row.workflow_id) : ""))
        .filter(Boolean)
    ),
  ];
  const fromApplicationWorkflow = await professionIdForFlows(supabase, tenantId, workflowIds);
  if (fromApplicationWorkflow) return fromApplicationWorkflow;

  const { data: instances, error: instanceError } = await supabase
    .from("applicant_workflow_instances")
    .select("workflow_id, onboarding_flow_id")
    .eq("tenant_id", tenantId)
    .eq("worker_id", workerId)
    .order("created_at", { ascending: false })
    .limit(8);
  if (instanceError) throw instanceError;
  const instanceFlowIds = (instances ?? []).flatMap((row) =>
    [row.workflow_id, row.onboarding_flow_id]
      .map((id) => (id ? String(id) : ""))
      .filter(Boolean)
  );
  const fromAssignedWorkflow = await professionIdForFlows(supabase, tenantId, instanceFlowIds);
  if (fromAssignedWorkflow) return fromAssignedWorkflow;

  const jobIds = [
    ...new Set(
      (applications ?? [])
        .map((row) => (row.job_requisition_id ? String(row.job_requisition_id) : ""))
        .filter(Boolean)
    ),
  ];
  if (!jobIds.length) return null;

  const { data: jobs, error: jobError } = await supabase
    .from("job_requisitions")
    .select("id, professions(name)")
    .in("id", jobIds);
  if (jobError) throw jobError;

  const names = (jobs ?? [])
    .map((job) => professionNameFromJob(job as { professions?: { name?: string | null } | { name?: string | null }[] | null }))
    .filter(Boolean);
  if (!names.length) return null;

  const { data: professions, error: professionError } = await supabase
    .from("tenant_professions")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);
  if (professionError) throw professionError;

  const rows = (professions ?? []).map((profession) => ({
    id: String(profession.id),
    name: String(profession.name ?? "").trim().toLowerCase(),
  }));
  for (const name of names) {
    const key = name.toLowerCase();
    const exact = rows.find((row) => row.name === key);
    if (exact) return exact.id;
  }
  for (const name of names) {
    const key = name.toLowerCase();
    const fuzzy = rows.find((row) => key.includes(row.name) || row.name.includes(key));
    if (fuzzy) return fuzzy.id;
  }
  return null;
}
