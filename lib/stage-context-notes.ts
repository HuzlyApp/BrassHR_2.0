import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aiMatchStatusStageName,
  isAiMatchStatusStageName,
  type AiMatchStatusStageName,
} from "@/lib/jobs/application-statuses/stage-assignments";

export const STAGE_NOTE_CONTEXT_KINDS = ["workflow_step", "ai_match_step"] as const;
export type StageNoteContextKind = (typeof STAGE_NOTE_CONTEXT_KINDS)[number];

export type StageContextNoteDto = {
  id: string;
  body: string;
  created_at: string;
  author_name: string;
  context_kind: StageNoteContextKind;
  context_key: string;
};

type NoteRow = {
  id: string;
  body: string;
  created_at: string;
  created_by_user_id: string | null;
  context_kind: StageNoteContextKind;
  context_key: string;
};

type UserNameRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export function isStageNoteContextKind(value: string): value is StageNoteContextKind {
  return (STAGE_NOTE_CONTEXT_KINDS as readonly string[]).includes(value);
}

/** AI step notes use the same stage name as the status-group assignment. */
export function aiMatchNoteContextKey(stepId: string): AiMatchStatusStageName | null {
  const stage = aiMatchStatusStageName(stepId);
  return stage && isAiMatchStatusStageName(stage) ? stage : null;
}

function authorName(user: UserNameRow | undefined): string {
  if (!user) return "Recruiter";
  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return name || "Recruiter";
}

export async function loadStageContextNotes(
  supabase: SupabaseClient,
  input: {
    tenantId: string;
    workerId: string;
    contextKind: StageNoteContextKind;
    contextKey: string;
    applicationId?: string | null;
  }
): Promise<StageContextNoteDto[]> {
  let query = supabase
    .from("stage_context_notes")
    .select("id, body, created_at, created_by_user_id, context_kind, context_key")
    .eq("tenant_id", input.tenantId)
    .eq("worker_id", input.workerId)
    .eq("context_kind", input.contextKind)
    .eq("context_key", input.contextKey)
    .order("created_at", { ascending: false });

  const applicationId = input.applicationId?.trim();
  if (applicationId) query = query.eq("application_id", applicationId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as NoteRow[];
  const authorIds = [
    ...new Set(rows.map((row) => row.created_by_user_id).filter(Boolean)),
  ] as string[];

  const usersById = new Map<string, UserNameRow>();
  if (authorIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, first_name, last_name")
      .in("id", authorIds);
    if (usersError) throw usersError;
    for (const user of (users ?? []) as UserNameRow[]) {
      usersById.set(user.id, user);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    author_name: authorName(
      row.created_by_user_id ? usersById.get(row.created_by_user_id) : undefined
    ),
    context_kind: row.context_kind,
    context_key: row.context_key,
  }));
}
