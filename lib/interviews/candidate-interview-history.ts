import type { SupabaseClient } from "@supabase/supabase-js";
import { interviewOrdinalTitle } from "@/lib/interviews/format";
import { scheduleRowToIso } from "@/lib/interviews/schedule-fields";
import {
  resolveCandidateInterviewStatus,
  type CandidateInterview,
  type CandidateInterviewer,
} from "@/lib/onboarding/interview-step";

export type CandidateInterviewRow = {
  id: string;
  title: string | null;
  status: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string | null;
  meeting_type: string | null;
  meeting_link: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
};

function asText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

/** Oldest first; cancelled interviews keep their place but don't take a sequence number. */
export function toCandidateInterviews(
  rows: readonly CandidateInterviewRow[],
  interviewersById: Map<string, CandidateInterviewer[]>,
  nowMs: number
): CandidateInterview[] {
  const items = rows
    .map((row) => {
      const { startsAt, endsAt } = scheduleRowToIso(row.scheduled_date, row.start_time, row.end_time);
      return { row, startsAt, endsAt };
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  let sequence = 0;
  return items.map(({ row, startsAt, endsAt }) => {
    const status = resolveCandidateInterviewStatus(row.status, startsAt, nowMs);
    const order = status === "cancelled" ? null : ++sequence;
    return {
      id: row.id,
      sequence: order,
      title: asText(row.title) ?? interviewOrdinalTitle(order ?? 1),
      status,
      startsAt,
      endsAt,
      meetingType: asText(row.meeting_type),
      meetingLink: asText(row.meeting_link),
      location: asText(row.location),
      notes: asText(row.notes),
      interviewers: interviewersById.get(row.id) ?? [],
      createdAt: row.created_at,
    };
  });
}

export async function loadCandidateInterviews(
  supabase: SupabaseClient,
  params: { tenantId: string; workerId: string; nowMs?: number }
): Promise<CandidateInterview[]> {
  const { tenantId, workerId } = params;

  const { data: applicantRows, error: applicantError } = await supabase
    .from("applicants")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("worker_id", workerId);
  if (applicantError) throw applicantError;
  const applicantIds = (applicantRows ?? []).map((row) => String(row.id));

  let query = supabase
    .from("interview_schedules")
    .select(
      "id, title, status, scheduled_date, start_time, end_time, meeting_type, meeting_link, location, notes, created_at"
    )
    .eq("tenant_id", tenantId);
  query = applicantIds.length
    ? query.or(`worker_id.eq.${workerId},applicant_id.in.(${applicantIds.join(",")})`)
    : query.eq("worker_id", workerId);

  const { data: scheduleRows, error: scheduleError } = await query;
  if (scheduleError) throw scheduleError;
  const rows = (scheduleRows ?? []) as CandidateInterviewRow[];
  if (!rows.length) return [];

  const { data: attendeeRows, error: attendeeError } = await supabase
    .from("interview_attendees")
    .select("interview_id, email, name")
    .eq("tenant_id", tenantId)
    .eq("attendee_type", "interviewer")
    .in(
      "interview_id",
      rows.map((row) => row.id)
    );
  if (attendeeError) throw attendeeError;

  const interviewersById = new Map<string, CandidateInterviewer[]>();
  for (const row of attendeeRows ?? []) {
    const email = String(row.email ?? "").trim().toLowerCase();
    if (!email) continue;
    const list = interviewersById.get(String(row.interview_id)) ?? [];
    list.push({ email, name: asText(row.name) ?? email });
    interviewersById.set(String(row.interview_id), list);
  }

  return toCandidateInterviews(rows, interviewersById, params.nowMs ?? Date.now());
}
