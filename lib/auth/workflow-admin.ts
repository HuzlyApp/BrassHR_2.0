import { NextResponse } from "next/server";
import type { ApiAuthContext } from "@/lib/auth/api-session";

export function requireWorkflowAdmin(auth: ApiAuthContext): NextResponse | null {
  if (auth.role === "admin" || auth.godAdmin) return null;
  return NextResponse.json(
    { error: "Forbidden", detail: "Administrator role required for workflow configuration" },
    { status: 403 }
  );
}

/**
 * Notes and reason codes added from the Follow Up dialog are pipeline writes.
 * Lane layout, group assignment, and the full reason-code list stay admin-only.
 */
export function isStaffStageCatalogAction(action: string): boolean {
  return action === "addReasonCode" || action === "findOrCreateNote";
}
