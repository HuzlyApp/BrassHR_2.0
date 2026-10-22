import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sanitizeTextForPdfDrawing } from "@/lib/resume/resume-text-to-pdf";
import {
  normalizeResumeBulletGlyphs,
  stripLeadingListMarker,
} from "@/lib/resume/resume-glyphs";
import {
  submissionSectionHeading,
  submissionSkillParagraphs,
  SUBMISSION_SECTION_DEFAULTS,
  type SubmissionResume,
} from "./submission-resume";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const NAVY = rgb(0.004, 0.102, 0.275);
const SLATE = rgb(0.2, 0.25, 0.33);
const MUTED = rgb(0.4, 0.44, 0.52);
const RULE = rgb(0.9, 0.91, 0.93);

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safe = sanitizeTextForPdfDrawing(text);
  const words = safe.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderSubmissionResumePdf(resume: SubmissionResume): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensure = (height: number) => {
    if (y - height >= MARGIN) return;
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  const drawLines = (lines: string[], font: PDFFont, size: number, color: ReturnType<typeof rgb>, gap: number) => {
    for (const line of lines) {
      ensure(gap);
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= gap;
    }
  };

  const section = (title: string) => {
    y -= 6;
    ensure(22);
    page.drawText(title, { x: MARGIN, y, size: 10.5, font: bold, color: NAVY });
    y -= 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.8,
      color: RULE,
    });
    y -= 12;
  };

  const name = sanitizeTextForPdfDrawing(resume.fullName || "Candidate");
  ensure(28);
  page.drawText(name, { x: MARGIN, y, size: 18, font: bold, color: NAVY });
  y -= 18;

  if (resume.headline) {
    drawLines(wrap(resume.headline, regular, 11, maxWidth), regular, 11, SLATE, 14);
  }

  const contact = [resume.location, resume.email, resume.phone, resume.linkedin]
    .filter(Boolean)
    .join("   ·   ");
  if (contact) {
    drawLines(wrap(contact, regular, 9, maxWidth), regular, 9, MUTED, 12);
  }

  if (resume.summary) {
    section(submissionSectionHeading(resume.summaryHeading, SUBMISSION_SECTION_DEFAULTS.summary));
    drawLines(
      wrap(normalizeResumeBulletGlyphs(resume.summary), regular, 10, maxWidth),
      regular,
      10,
      SLATE,
      13
    );
  }

  const skillLines = submissionSkillParagraphs(resume.skills);
  if (skillLines.length) {
    section(submissionSectionHeading(resume.skillsHeading, SUBMISSION_SECTION_DEFAULTS.skills));
    const separate = skillLines.length > 1;
    for (const line of skillLines) {
      const text = separate ? `•  ${stripLeadingListMarker(line)}` : line;
      drawLines(wrap(text, regular, 10, maxWidth), regular, 10, SLATE, 13);
    }
  }

  if (resume.experience.length) {
    section(submissionSectionHeading(resume.experienceHeading, SUBMISSION_SECTION_DEFAULTS.experience));
    for (const job of resume.experience) {
      const heading = [job.title, job.company].filter(Boolean).join("  —  ");
      if (heading) {
        drawLines(wrap(heading, bold, 11, maxWidth), bold, 11, NAVY, 14);
      }
      const meta = [job.location, job.dates].filter(Boolean).join("  ·  ");
      if (meta) {
        drawLines(wrap(meta, regular, 11, maxWidth), regular, 11, MUTED, 14);
      }
      for (const bullet of job.bullets) {
        const text = stripLeadingListMarker(bullet);
        if (!text) continue;
        const wrapped = wrap(`•  ${text}`, regular, 10, maxWidth - 10);
        for (const line of wrapped) {
          ensure(13);
          page.drawText(line, { x: MARGIN + 8, y, size: 10, font: regular, color: SLATE });
          y -= 13;
        }
      }
      y -= 6;
    }
  }

  if (resume.education.length) {
    section(submissionSectionHeading(resume.educationHeading, SUBMISSION_SECTION_DEFAULTS.education));
    for (const item of resume.education) {
      const line = [item.credential, item.school, item.year].filter(Boolean).join("  —  ");
      if (line) drawLines(wrap(line, regular, 10, maxWidth), regular, 10, SLATE, 13);
    }
  }

  if (resume.licenses.length) {
    section(submissionSectionHeading(resume.licensesHeading, SUBMISSION_SECTION_DEFAULTS.licenses));
    for (const item of resume.licenses) {
      drawLines(wrap(`•  ${item}`, regular, 10, maxWidth), regular, 10, SLATE, 13);
    }
  }

  return Buffer.from(await pdf.save());
}
