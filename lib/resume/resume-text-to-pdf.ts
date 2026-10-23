import { PDFDocument, StandardFonts } from "pdf-lib";
import { mapResumeSymbol } from "@/lib/resume/resume-glyphs";
import { stripNullBytes } from "@/lib/resume/sanitize-postgres-text";

/**
 * Windows-1252 / WinAnsi code points above U+00FF that Helvetica can draw.
 * pdf-lib throws if drawText receives anything outside this set + Latin-1.
 */
const WIN_ANSI_EXTRAS = new Set([
  0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192, 0x02c6, 0x02dc, 0x2013, 0x2014,
  0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039,
  0x203a, 0x20ac, 0x2122,
]);

/** Map common Unicode lookalikes to WinAnsi-safe characters before the catch-all. */
function foldToWinAnsi(ch: string): string {
  const symbol = mapResumeSymbol(ch);
  if (symbol != null) return symbol;
  switch (ch) {
    case "\u25CF": // ●
    case "\u25E6": // ◦
    case "\u25AA": // ▪
    case "\u25AB": // ▫
    case "\u25B8": // ▸
    case "\u25BA": // ►
    case "\u2043": // ⁃
      return "\u2022"; // •
    case "\u2212": // −
    case "\u2010": // hyphen
    case "\u2011": // non-breaking hyphen
      return "-";
    case "\u2000":
    case "\u2001":
    case "\u2002":
    case "\u2003":
    case "\u2004":
    case "\u2005":
    case "\u2006":
    case "\u2007":
    case "\u2008":
    case "\u2009":
    case "\u200A":
    case "\u202F":
    case "\u205F":
      return " ";
    case "\u200B": // zero-width space
    case "\u200C":
    case "\u200D":
    case "\uFEFF":
    case "\u00AD": // soft hyphen
      return "";
    case "\uFB01": // ﬁ
      return "fi";
    case "\uFB02": // ﬂ
      return "fl";
    default: {
      const cp = ch.codePointAt(0);
      if (cp != null && WIN_ANSI_EXTRAS.has(cp)) return ch;
      return "?";
    }
  }
}

/** Strip control chars and map non–WinAnsi code points so pdf-lib can draw pasted resume text. */
export function sanitizeTextForPdfDrawing(text: string): string {
  return stripNullBytes(text)
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[^\t\n\r\x20-\xFF]/gu, foldToWinAnsi);
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const FONT_SIZE = 10;
const LINE_HEIGHT = FONT_SIZE * 1.35;

function wrapLine(line: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, maxWidth: number): string[] {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, FONT_SIZE) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) wrapped.push(current);
    current = word;
  }
  if (current) wrapped.push(current);
  return wrapped;
}

/** Store pasted resume text in worker-resumes bucket (PDF / DOCX only). */
export async function resumeTextToPdfBuffer(text: string): Promise<Buffer> {
  const safeText = sanitizeTextForPdfDrawing(text);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureSpace = () => {
    if (y >= MARGIN) return;
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  for (const rawLine of safeText.replace(/\r\n/g, "\n").split("\n")) {
    for (const line of wrapLine(rawLine, font, maxWidth)) {
      ensureSpace();
      page.drawText(line, { x: MARGIN, y, size: FONT_SIZE, font });
      y -= LINE_HEIGHT;
    }
  }

  return Buffer.from(await pdfDoc.save());
}
