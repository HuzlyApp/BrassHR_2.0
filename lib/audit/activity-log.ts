import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type ActivityLogInput = {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Required for `activity_logs` table (NOT NULL tenant_id). */
  tenantId?: string | null;
  metadata?: Record<string, unknown> | null;
  request?: Request;
};

function resolveTenantId(input: ActivityLogInput): string | null {
  if (input.tenantId?.trim()) return input.tenantId.trim();
  const fromMeta = input.metadata?.tenant_id;
  if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  return null;
}

/**
 * Best-effort audit row (service role). Never throws; failures are logged to stderr.
 * Call after successful authorization for sensitive reads/writes.
 */
export async function writeActivityLog(input: ActivityLogInput): Promise<void> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    console.warn("[activity_log] service role not configured; skipping audit");
    return;
  }
  const headers = input.request?.headers;
  const ip =
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers?.get("x-real-ip") ||
    null;
  const userAgent = headers?.get("user-agent") || null;

  const tenantId = resolveTenantId(input);

  const payloadV1 = {
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    tenant_id: tenantId,
    metadata: input.metadata ?? {},
    ip,
    user_agent: userAgent,
  };

  const { error } = await supabase.from("activity_log").insert(payloadV1);
  if (!error) return;

  const isMissingActivityLogTable =
    /activity_log/i.test(error.message) &&
    /not find|does not exist|schema cache/i.test(error.message);

  const isMissingTenantColumn =
    /tenant_id/i.test(error.message) &&
    /column|schema cache/i.test(error.message);

  if (!isMissingActivityLogTable && !isMissingTenantColumn) {
    console.error("[activity_log] insert failed:", error.message);
    return;
  }

  // Backward compatibility: some environments use `activity_logs` schema.
  if (!tenantId) {
    console.warn("[activity_log] skipping activity_logs insert: missing tenant_id");
    return;
  }

  const entityId =
    typeof input.entityId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.entityId.trim(),
    )
      ? input.entityId.trim()
      : null;
  const payloadV0 = {
    user_id: input.actorUserId,
    tenant_id: tenantId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: entityId,
    details: {
      ...(input.metadata ?? {}),
      ip,
      user_agent: userAgent,
    },
  };

  const { error: fallbackError } = await supabase.from("activity_logs").insert(payloadV0);
  if (fallbackError) {
    console.error("[activity_log] insert failed:", fallbackError.message);
  }
}
