import { NextResponse } from "next/server";

export * from "./platform-shared";

/** Consistent API error body for auth failures. */
export function jsonUnauthorized(status: 401 | 403 = 401): NextResponse {
  return NextResponse.json(
    { error: status === 401 ? "Unauthorized" : "Forbidden" },
    { status }
  );
}
