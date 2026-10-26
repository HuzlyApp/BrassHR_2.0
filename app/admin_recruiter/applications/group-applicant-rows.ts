import {
  resolveApplicationApplicantEmail,
  resolveApplicationApplicantName,
  type ApplicationApplicantSource,
} from "@/lib/jobs/application-applicant-display";

type GroupableRow = ApplicationApplicantSource & {
  id: string;
  worker_id?: string | null;
  created_at: string;
  submitted_at?: string | null;
  appliedJobCount?: number | null;
};

/** Same person = same email, otherwise the same worker, otherwise the same name. */
export function applicantGroupKey(row: GroupableRow): string {
  const email = resolveApplicationApplicantEmail(row).trim().toLowerCase();
  if (email) return `email:${email}`;
  const workerId = String(row.worker_id ?? "").trim();
  if (workerId) return `worker:${workerId}`;
  const name = resolveApplicationApplicantName(row).trim().toLowerCase();
  if (name && name !== "applicant") return `name:${name}`;
  return `id:${row.id}`;
}

function appliedAt(row: GroupableRow): number {
  const value = new Date(row.submitted_at || row.created_at).getTime();
  return Number.isFinite(value) ? value : 0;
}

/** One list row per applicant. The newest application stays on the row. */
export function groupApplicantRows<T extends GroupableRow>(
  rows: T[]
): Array<T & { groupedApplications: T[] }> {
  const order: string[] = [];
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = applicantGroupKey(row);
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else {
      groups.set(key, [row]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const group = groups.get(key) ?? [];
    const primary = [...group].sort((a, b) => appliedAt(b) - appliedAt(a))[0];
    const counted = Math.max(
      group.length,
      ...group.map((row) => Number(row.appliedJobCount ?? 1) || 1)
    );
    return {
      ...primary,
      appliedJobCount: counted,
      groupedApplications: group,
    };
  });
}
