/**
 * Sanitize résumé text before sending to the LLM.
 * Removes DOB, age, photo refs, SSN, marital status, and street addresses.
 * Does not strip city/state/zip needed for location matching.
 */

import { stripNullBytes } from "@/lib/resume/sanitize-postgres-text";
import { normalizeResumeBulletGlyphs } from "@/lib/resume/resume-glyphs";

const MULTILINE_WS = /\r\n?/g;

export function normalizeResumeWhitespace(text: string): string {
  return stripNullBytes(text)
    .replace(MULTILINE_WS, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const SSN_RE =
  /\b(?:SSN|Social\s*Security(?:\s*Number)?)\s*[:#]?\s*\d{3}[-\s]?\d{2}[-\s]?\d{4}\b|\b\d{3}-\d{2}-\d{4}\b/gi;

const DOB_RE =
  /\b(?:DOB|D\.O\.B\.|Date\s*of\s*Birth|Birth\s*Date)\s*[:\-]?\s*\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/gi;

const AGE_RE =
  /\b(?:Age|Years?\s*old)\s*[:\-]?\s*\d{1,3}\b|\b\d{1,3}\s*(?:years?\s*old|yo)\b/gi;

/**
 * Redact a marital-status field or a line that is only a status word.
 * Do not treat "single item" or "single line" as marital status.
 */
const MARITAL_RE =
  /\bMarital\s*Status\s*[:\-]?\s*(?:Married|Single|Divorced|Widowed|Separated|Unmarried)?\b|(?:^|\n)\s*(?:Married|Single|Divorced|Widowed|Separated|Unmarried)\s*(?=\n|$)/gi;

const PHOTO_RE =
  /\b(?:photo|photograph|headshot|profile\s*picture|passport\s*photo)\b[^\n]{0,80}/gi;

/** Street-like address lines (keep City, ST ZIP separately when possible). */
const STREET_ADDRESS_RE =
  /\b\d{1,6}\s+[A-Za-z0-9.'\-]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Dr|Drive|Ct|Court|Way|Pl|Place|Ter|Terrace|Hwy|Highway|Pkwy|Parkway)\.?(?:\s*(?:Apt|Unit|#)\s*[A-Za-z0-9\-]+)?\b/gi;

export function sanitizeResumeForMatchAnalysis(raw: string): string {
  let text = normalizeResumeWhitespace(normalizeResumeBulletGlyphs(raw));
  text = text
    .replace(SSN_RE, "[REDACTED_SSN]")
    .replace(DOB_RE, "[REDACTED_DOB]")
    .replace(AGE_RE, "[REDACTED_AGE]")
    .replace(MARITAL_RE, "[REDACTED_MARITAL_STATUS]")
    .replace(PHOTO_RE, "[REDACTED_PHOTO_REF]")
    .replace(STREET_ADDRESS_RE, "[REDACTED_STREET_ADDRESS]");
  return normalizeResumeWhitespace(text);
}
