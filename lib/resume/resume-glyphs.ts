/**
 * Bullet and symbol-font characters that show up as "?" or an empty box
 * when a résumé is drawn with Helvetica or previewed in the browser.
 * Word often stores bullets in the private-use area (for example U+F0B7).
 */

const BULLET_CODE_POINTS = new Set([
  0x00b7, 0x2022, 0x2023, 0x2043, 0x2219, 0x25a0, 0x25a1, 0x25aa, 0x25ab, 0x25b8, 0x25ba,
  0x25cb, 0x25cf, 0x25e6, 0x2610, 0x2611, 0xf076, 0xf0a7, 0xf0a8, 0xf0b2, 0xf0b7, 0xf0d8,
  0xf0fc,
]);

/** "•" for a known bullet, "" for other symbol-font characters, or null to leave the character. */
export function mapResumeSymbol(ch: string): string | null {
  const cp = ch.codePointAt(0);
  if (cp == null) return null;
  if (BULLET_CODE_POINTS.has(cp)) return "\u2022";
  if (cp >= 0xe000 && cp <= 0xf8ff) return "";
  return null;
}

/** Turn symbol-font bullets into a normal bullet. Other private-use symbols are dropped. */
export function normalizeResumeBulletGlyphs(text: string): string {
  let out = "";
  for (const ch of text) {
    const mapped = mapResumeSymbol(ch);
    out += mapped == null ? ch : mapped;
  }
  return out
    .replace(/•(?:\s*•)+/g, "•")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Remove a list marker the renderer will draw itself.
 * A lone "o " before a capital is the letter bullet some résumés use.
 */
export function stripLeadingListMarker(text: string): string {
  return normalizeResumeBulletGlyphs(text)
    .replace(/^(?:[•·∙*\-–—]\s*)+/u, "")
    .replace(/^o\s+(?=[A-Z0-9])/u, "")
    .trim();
}
