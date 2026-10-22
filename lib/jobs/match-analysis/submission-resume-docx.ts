import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
  BorderStyle,
  type IBorderOptions,
} from "docx";
import {
  submissionSectionHeading,
  submissionSkillParagraphs,
  SUBMISSION_SECTION_DEFAULTS,
  type SubmissionResume,
} from "./submission-resume";

const NAVY = "011C46";
const SLATE = "334155";
const MUTED = "667085";
const RULE: IBorderOptions = {
  style: BorderStyle.SINGLE,
  size: 6,
  color: "E5E7EB",
  space: 1,
};

function textParagraph(
  text: string,
  opts?: {
    bold?: boolean;
    size?: number;
    color?: string;
    spacingAfter?: number;
    spacingBefore?: number;
  }
): Paragraph {
  return new Paragraph({
    spacing: {
      after: opts?.spacingAfter ?? 120,
      before: opts?.spacingBefore ?? 0,
    },
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        size: opts?.size ?? 22,
        color: opts?.color ?? SLATE,
        font: "Tahoma",
      }),
    ],
  });
}

function sectionTitle(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: RULE },
    children: [
      new TextRun({
        text: title,
        bold: true,
        size: 22,
        color: NAVY,
        font: "Tahoma",
      }),
    ],
  });
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    indent: { left: 360 },
    children: [
      new TextRun({
        text: `•  ${text}`,
        size: 22,
        color: SLATE,
        font: "Tahoma",
      }),
    ],
  });
}

/** Editable Word deliverable for the optimized submission résumé. */
export async function renderSubmissionResumeDocx(resume: SubmissionResume): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: resume.fullName || "Candidate",
          bold: true,
          size: 36,
          color: NAVY,
          font: "Tahoma",
        }),
      ],
    })
  );

  if (resume.headline) {
    children.push(textParagraph(resume.headline, { size: 22, color: SLATE, spacingAfter: 60 }));
  }

  const contact = [resume.location, resume.email, resume.phone, resume.linkedin]
    .filter(Boolean)
    .join("   ·   ");
  if (contact) {
    children.push(textParagraph(contact, { size: 18, color: MUTED, spacingAfter: 160 }));
  }

  if (resume.summary) {
    children.push(sectionTitle(submissionSectionHeading(resume.summaryHeading, SUBMISSION_SECTION_DEFAULTS.summary)));
    children.push(textParagraph(resume.summary, { spacingAfter: 120 }));
  }

  const skillLines = submissionSkillParagraphs(resume.skills);
  if (skillLines.length) {
    children.push(sectionTitle(submissionSectionHeading(resume.skillsHeading, SUBMISSION_SECTION_DEFAULTS.skills)));
    for (const line of skillLines) {
      children.push(textParagraph(line, { spacingAfter: 80 }));
    }
  }

  if (resume.experience.length) {
    children.push(
      sectionTitle(submissionSectionHeading(resume.experienceHeading, SUBMISSION_SECTION_DEFAULTS.experience))
    );
    for (const job of resume.experience) {
      const heading = [job.title, job.company].filter(Boolean).join("  —  ");
      if (heading) {
        children.push(textParagraph(heading, { bold: true, size: 22, color: NAVY, spacingAfter: 40 }));
      }
      const meta = [job.location, job.dates].filter(Boolean).join("  ·  ");
      if (meta) {
        children.push(textParagraph(meta, { size: 22, color: MUTED, spacingAfter: 60 }));
      }
      for (const bullet of job.bullets) {
        if (bullet.trim()) children.push(bulletParagraph(bullet.trim()));
      }
      children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
    }
  }

  if (resume.education.length) {
    children.push(sectionTitle(submissionSectionHeading(resume.educationHeading, SUBMISSION_SECTION_DEFAULTS.education)));
    for (const item of resume.education) {
      const line = [item.credential, item.school, item.year].filter(Boolean).join("  —  ");
      if (line) children.push(textParagraph(line, { spacingAfter: 80 }));
    }
  }

  if (resume.licenses.length) {
    children.push(
      sectionTitle(submissionSectionHeading(resume.licensesHeading, SUBMISSION_SECTION_DEFAULTS.licenses))
    );
    for (const item of resume.licenses) {
      if (item.trim()) children.push(bulletParagraph(item.trim()));
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
