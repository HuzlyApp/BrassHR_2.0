import type { SupabaseClient } from "@supabase/supabase-js";
import { easternDateString } from "@/lib/datetime/eastern";
import {
  createNotificationsForUsers,
  listTenantStaffUserIds,
} from "@/lib/notifications/create-notification";
import { isProfessionDocumentExpired } from "@/lib/onboarding/profession-step-uploads";

export const PROFESSION_DOCUMENT_EXPIRED_TYPE = "profession_document_expired";

export type ExpiredProfessionNotice = {
  uploadId: string;
  tenantId: string;
  workerId: string;
  title: string;
  expiryDate: string;
  candidateName: string;
};

type UploadRow = {
  id: string;
  tenantId: string;
  workerId: string;
  professionDocumentId: string;
  expiryDate: string | null;
  uploadedAt: string | null;
  title: string;
  candidateName: string;
};

export function professionDocumentExpiredLink(workerId: string, uploadId: string): string {
  return `/admin_recruiter/candidates/${encodeURIComponent(workerId)}/hire-journey?upload=${encodeURIComponent(uploadId)}`;
}

/** Keep the newest file for each profession document, and only when that file is expired. */
export function pickLatestExpiredUploads(rows: UploadRow[], today: string): ExpiredProfessionNotice[] {
  const ordered = [...rows].sort((a, b) => {
    const aTime = Date.parse(a.uploadedAt ?? "") || 0;
    const bTime = Date.parse(b.uploadedAt ?? "") || 0;
    return bTime - aTime;
  });
  const latest = new Map<string, UploadRow>();
  for (const row of ordered) {
    const key = `${row.tenantId}:${row.workerId}:${row.professionDocumentId}`;
    if (!latest.has(key)) latest.set(key, row);
  }
  return [...latest.values()]
    .filter((row) => isProfessionDocumentExpired(row.expiryDate, today))
    .map((row) => ({
      uploadId: row.id,
      tenantId: row.tenantId,
      workerId: row.workerId,
      title: row.title.trim() || "Document",
      expiryDate: String(row.expiryDate).slice(0, 10),
      candidateName: row.candidateName.trim() || "A candidate",
    }));
}

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function loadLatestExpiredProfessionUploads(
  supabase: SupabaseClient,
  today = easternDateString(new Date())
): Promise<ExpiredProfessionNotice[]> {
  const { data, error } = await supabase
    .from("worker_profession_document_uploads")
    .select("id, tenant_id, worker_id, profession_document_id, expiry_date, uploaded_at")
    .not("expiry_date", "is", null)
    .order("uploaded_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const uploads = (data ?? []) as Array<Record<string, unknown>>;
  if (!uploads.length) return [];

  const documentIds = [...new Set(uploads.map((row) => asText(row.profession_document_id)).filter(Boolean))];
  const workerIds = [...new Set(uploads.map((row) => asText(row.worker_id)).filter(Boolean))];
  const [documentsResult, workersResult] = await Promise.all([
    supabase.from("tenant_profession_documents").select("id, name").in("id", documentIds),
    supabase.from("worker").select("id, first_name, last_name").in("id", workerIds),
  ]);
  if (documentsResult.error) throw documentsResult.error;
  if (workersResult.error) throw workersResult.error;

  const titles = new Map(
    ((documentsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [
      asText(row.id),
      asText(row.name),
    ])
  );
  const names = new Map(
    ((workersResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [
      asText(row.id),
      [asText(row.first_name), asText(row.last_name)].filter(Boolean).join(" "),
    ])
  );

  return pickLatestExpiredUploads(
    uploads.map((row) => {
      const workerId = asText(row.worker_id);
      const professionDocumentId = asText(row.profession_document_id);
      return {
        id: asText(row.id),
        tenantId: asText(row.tenant_id),
        workerId,
        professionDocumentId,
        expiryDate: asText(row.expiry_date) || null,
        uploadedAt: asText(row.uploaded_at) || null,
        title: titles.get(professionDocumentId) || "Document",
        candidateName: names.get(workerId) || "A candidate",
      };
    }),
    today
  );
}

/** One in-app notification per expired file. Opening the step again does not send another. */
export async function notifyExpiredProfessionDocuments(
  supabase: SupabaseClient,
  notices: ExpiredProfessionNotice[]
): Promise<number> {
  const pending = notices.filter((notice) => notice.uploadId && notice.tenantId && notice.workerId);
  if (!pending.length) return 0;

  const byTenant = new Map<string, ExpiredProfessionNotice[]>();
  for (const notice of pending) {
    const group = byTenant.get(notice.tenantId) ?? [];
    group.push(notice);
    byTenant.set(notice.tenantId, group);
  }

  let created = 0;
  for (const [tenantId, group] of byTenant) {
    const links = group.map((notice) => professionDocumentExpiredLink(notice.workerId, notice.uploadId));
    const { data, error } = await supabase
      .from("notifications")
      .select("link")
      .eq("tenant_id", tenantId)
      .eq("type", PROFESSION_DOCUMENT_EXPIRED_TYPE)
      .in("link", links);
    if (error) {
      console.warn("[profession-document-expired] lookup", error.message);
      continue;
    }
    const existing = new Set(
      ((data ?? []) as Array<{ link?: string | null }>).map((row) => String(row.link ?? ""))
    );
    const staffIds = await listTenantStaffUserIds(supabase, tenantId);
    if (!staffIds.length) continue;

    for (const notice of group) {
      const link = professionDocumentExpiredLink(notice.workerId, notice.uploadId);
      if (existing.has(link)) continue;
      const count = await createNotificationsForUsers(supabase, {
        tenantId,
        userIds: staffIds,
        type: PROFESSION_DOCUMENT_EXPIRED_TYPE,
        title: `Document expired: ${notice.title}`,
        body: `${notice.candidateName}'s ${notice.title} expired on ${notice.expiryDate}.`,
        link,
      });
      if (count > 0) {
        created += count;
        existing.add(link);
      }
    }
  }
  return created;
}
