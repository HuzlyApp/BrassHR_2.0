import { createHash } from "node:crypto";

/** SHA-256 of the resume bytes. Same file → same hash, independent of the stored name. */
export function hashResumeBytes(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
