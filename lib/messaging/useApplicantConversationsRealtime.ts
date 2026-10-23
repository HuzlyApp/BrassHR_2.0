"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { ApplicantMessageListRow } from "@/lib/messaging/staff-conversations";

function isApplicantMessageListRow(value: unknown): value is ApplicantMessageListRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.worker_id === "string" &&
    typeof row.tenant_id === "string" &&
    (row.sender_role === "applicant" || row.sender_role === "recruiter") &&
    (typeof row.body === "string" || typeof row.attachment_path === "string") &&
    typeof row.created_at === "string"
  );
}

export function useApplicantConversationsRealtime(
  tenantId: string | null | undefined,
  onInsert: (message: ApplicantMessageListRow) => void,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;

    // The header and the messages page both listen for the same tenant.
    // Supabase returns the existing channel for a repeated name, and calling
    // `.on()` after that channel has already subscribed throws and blanks the page.
    const channelName = tenantId
      ? `applicant-conversations-${tenantId}-${crypto.randomUUID()}`
      : `applicant-conversations-all-${crypto.randomUUID()}`;
    const channel = supabaseBrowser
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "applicant_messages",
          ...(tenantId ? { filter: `tenant_id=eq.${tenantId}` } : {}),
        },
        (payload) => {
          if (!isApplicantMessageListRow(payload.new)) return;
          onInsert(payload.new);
        }
      )
      .subscribe();

    return () => {
      void supabaseBrowser.removeChannel(channel);
    };
  }, [enabled, tenantId, onInsert]);
}
