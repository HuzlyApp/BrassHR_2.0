import { z } from "zod";
import {
  isSubmissionResumeFileName,
  sanitizeResumeNamePart,
} from "@/lib/resume/worker-resume-file-name";
import { normalizeResumeWhitespace } from "./sanitize-resume";
import { normalizeResumeBulletGlyphs, stripLeadingListMarker } from "@/lib/resume/resume-glyphs";
import type { MatchAnalysisResponse } from "./schema";

export { isSubmissionResumeFileName };

/** Trim and hard-cap length so LLM / requirement text never fails Zod `.max()`. */
const clipped = (max: number) =>
  z.preprocess((value) => {
    if (value == null) return "";
    return String(value).replace(/\s+/g, " ").trim().slice(0, max);
  }, z.string().max(max));

/** Keep a long source résumé. Slice overflow instead of failing the whole parse. */
function cappedList<T extends z.ZodTypeAny>(item: T, max: number) {
  return z.preprocess((value) => {
    if (value == null) return [];
    if (!Array.isArray(value)) return [];
    return value.slice(0, max);
  }, z.array(item).max(max));
}

export const submissionResumeSchema = z.object({
  fullName: clipped(120),
  headline: clipped(200),
  email: clipped(200).default(""),
  phone: clipped(40).default(""),
  location: clipped(200).default(""),
  linkedin: clipped(300).default(""),
  summary: clipped(4000).default(""),
  summaryHeading: clipped(80).default(""),
  skillsHeading: clipped(80).default(""),
  experienceHeading: clipped(80).default(""),
  educationHeading: clipped(80).default(""),
  licensesHeading: clipped(80).default(""),
  /** Skill lines can be a full labeled group from the source résumé, not only a short keyword. */
  skills: cappedList(clipped(500), 48).default([]),
  experience: cappedList(
    z.object({
      title: clipped(160).default(""),
      company: clipped(160).default(""),
      location: clipped(160).default(""),
      dates: clipped(80).default(""),
      bullets: cappedList(clipped(1800), 48).default([]),
    }),
    40
  ).default([]),
  education: cappedList(
    z.object({
      school: clipped(200).default(""),
      credential: clipped(200).default(""),
      year: clipped(40).default(""),
    }),
    12
  ).default([]),
  licenses: cappedList(clipped(200), 24).default([]),
});

export type SubmissionResume = z.infer<typeof submissionResumeSchema>;

export type SubmissionResumeIdentity = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  jobTitle: string;
};

function cleanList(items: unknown, max: number, maxItemLength = 80): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const text = String(item ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxItemLength);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function confirmedRequirementLines(analysis: MatchAnalysisResponse | null): string[] {
  if (!analysis) return [];
  const rows = [
    ...(analysis.mandatory_requirements ?? []),
    ...(analysis.preferred_requirements ?? []),
  ];
  return rows
    .filter(
      (row) =>
        row.requirement_outcome === "MET" ||
        row.status === "CONFIRMED" ||
        row.requirement_outcome === "VERIFY"
    )
    .map((row) => row.requirement.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function educationFromAnalysis(analysis: MatchAnalysisResponse | null): SubmissionResume["education"] {
  const raw = analysis?.quick_match?.extracted_resume?.education?.trim() ?? "";
  if (!raw) return [];
  return [{ school: raw, credential: "", year: "" }];
}

function experienceFromTitles(
  analysis: MatchAnalysisResponse | null,
  resumeText: string
): SubmissionResume["experience"] {
  const titles = analysis?.quick_match?.extracted_resume?.recent_titles ?? [];
  const notes = analysis?.experience_analysis?.experience_calculation_notes ?? [];
  const evidence = (analysis?.mandatory_requirements ?? [])
    .map((row) => row.candidate_evidence.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (titles.length) {
    return titles.slice(0, 6).map((title, index) => ({
      title,
      company: "",
      location: "",
      dates: "",
      bullets:
        index === 0
          ? evidence.length
            ? evidence
            : notes.slice(0, 3)
          : notes.slice(index, index + 2),
    }));
  }

  const compact = normalizeResumeWhitespace(resumeText).slice(0, 2400);
  if (!compact) return [];
  return [
    {
      title: analysis?.quick_match?.extracted_resume?.headline || "Professional experience",
      company: "",
      location: "",
      dates: "",
      bullets: compact
        .split(/\n+/)
        .map((line) => line.replace(/^[-•]\s*/, "").trim())
        .filter((line) => line.length > 20)
        .slice(0, 8),
    },
  ];
}

export function submissionResumeFileName(
  fullName: string,
  ext: ".pdf" | ".docx" = ".pdf"
): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = sanitizeResumeNamePart(parts[0] ?? "");
  const last = sanitizeResumeNamePart(parts.slice(1).join(" "));
  const base = [first, last].filter(Boolean).join("_") || "candidate";
  return `${base}_submission_resume${ext}`;
}

/** Prefer short skill/product labels; drop long requirement sentences from fallback dumps. */
export function shortSkillLabels(items: string[], max = 16): string[] {
  return cleanList(
    items.filter((item) => {
      const text = String(item ?? "").trim();
      if (!text) return false;
      if (text.length > 60) return false;
      if (/\b(must|required|ability to|years of)\b/i.test(text) && text.split(/\s+/).length > 8) {
        return false;
      }
      return true;
    }),
    max
  );
}

export function parseSubmissionResume(value: unknown): SubmissionResume | null {
  const parsed = submissionResumeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function mergeSubmissionResume(
  preferred: SubmissionResume | null,
  fallback: SubmissionResume
): SubmissionResume {
  if (!preferred) return fallback;
  return {
    fullName: preferred.fullName || fallback.fullName,
    headline: preferred.headline || fallback.headline,
    email: preferred.email || fallback.email,
    phone: preferred.phone || fallback.phone,
    location: preferred.location || fallback.location,
    linkedin: preferred.linkedin || fallback.linkedin,
    summary: preferred.summary || fallback.summary,
    summaryHeading: preferred.summaryHeading || fallback.summaryHeading,
    skillsHeading: preferred.skillsHeading || fallback.skillsHeading,
    experienceHeading: preferred.experienceHeading || fallback.experienceHeading,
    educationHeading: preferred.educationHeading || fallback.educationHeading,
    licensesHeading: preferred.licensesHeading || fallback.licensesHeading,
    skills: preferred.skills.length ? preferred.skills : fallback.skills,
    experience: preferred.experience.length ? preferred.experience : fallback.experience,
    education: preferred.education.length ? preferred.education : fallback.education,
    licenses: preferred.licenses.length ? preferred.licenses : fallback.licenses,
  };
}

export function buildFallbackSubmissionResume(args: {
  identity: SubmissionResumeIdentity;
  analysis: MatchAnalysisResponse | null;
  resumeText: string;
}): SubmissionResume {
  const { identity, analysis, resumeText } = args;
  const extracted = analysis?.quick_match?.extracted_resume;
  const years = extracted?.years_estimated;
  const headline =
    extracted?.headline?.trim() ||
    [identity.jobTitle, years ? `${years}+ years` : ""].filter(Boolean).join(" · ");
  const summary =
    analysis?.candidate_match?.recruiter_decision_summary?.trim() ||
    cleanList(analysis?.strengths, 3).join(" ") ||
    `Experienced ${headline || "professional"} available for ${identity.jobTitle || "this assignment"}.`;

  return submissionResumeSchema.parse({
    fullName: identity.fullName,
    headline,
    email: identity.email,
    phone: identity.phone,
    location: identity.location,
    linkedin: "",
    summary,
    skills: shortSkillLabels([
      ...confirmedRequirementLines(analysis),
      ...(extracted?.named_products_in_jobs ?? []),
      ...(extracted?.recent_titles ?? []),
    ]),
    experience: experienceFromTitles(analysis, resumeText),
    education: educationFromAnalysis(analysis),
    licenses: [],
  });
}

export const SUBMISSION_SECTION_DEFAULTS = {
  summary: "Professional summary",
  skills: "Core qualifications",
  experience: "Professional experience",
  education: "Education",
  licenses: "Licenses & certifications",
} as const;

/** The generated packet always uses these titles. Source résumé titles are not copied. */
export function submissionSectionHeading(_custom: string | undefined, fallback: string): string {
  return fallback;
}

/**
 * Short keyword lists stay on one line. Labeled or long source lines stay separate
 * so a skills section is not flattened.
 */
/** Keep the model headline. If it is empty, use the target job title. */
export function presentSubmissionResume(resume: SubmissionResume, jobTitle?: string): SubmissionResume {
  const headline = resume.headline.replace(/\s+/g, " ").trim() || String(jobTitle ?? "").replace(/\s+/g, " ").trim();
  return {
    ...resume,
    headline,
    summaryHeading: "",
    skillsHeading: "",
    experienceHeading: "",
    educationHeading: "",
    licensesHeading: "",
    summary: normalizeResumeBulletGlyphs(resume.summary),
    skills: resume.skills.map((skill) => stripLeadingListMarker(skill)).filter(Boolean),
    experience: resume.experience.map((job) => ({
      ...job,
      bullets: job.bullets.map((bullet) => stripLeadingListMarker(bullet)).filter(Boolean),
    })),
  };
}

export function submissionSkillParagraphs(skills: string[]): string[] {
  const clean = skills.map((item) => stripLeadingListMarker(item)).filter(Boolean);
  if (!clean.length) return [];
  const separate = clean.some((item) => item.length > 60 || item.includes(":"));
  return separate ? clean : [clean.join("  ·  ")];
}

export function submissionResumeToPlainText(resume: SubmissionResume): string {
  const lines: string[] = [resume.fullName];
  if (resume.headline) lines.push(resume.headline);
  const contact = [resume.location, resume.email, resume.phone, resume.linkedin].filter(Boolean).join("  |  ");
  if (contact) lines.push(contact);
  if (resume.summary) {
    lines.push(
      "",
      submissionSectionHeading(resume.summaryHeading, SUBMISSION_SECTION_DEFAULTS.summary),
      resume.summary
    );
  }
  if (resume.skills.length) {
    lines.push(
      "",
      submissionSectionHeading(resume.skillsHeading, SUBMISSION_SECTION_DEFAULTS.skills),
      resume.skills.map((item) => `• ${item}`).join("\n")
    );
  }
  if (resume.experience.length) {
    lines.push(
      "",
      submissionSectionHeading(resume.experienceHeading, SUBMISSION_SECTION_DEFAULTS.experience)
    );
    for (const job of resume.experience) {
      lines.push([job.title, job.company].filter(Boolean).join(" — "));
      const meta = [job.location, job.dates].filter(Boolean).join("  |  ");
      if (meta) lines.push(meta);
      for (const bullet of job.bullets) lines.push(`• ${bullet}`);
    }
  }
  if (resume.education.length) {
    lines.push("", submissionSectionHeading(resume.educationHeading, SUBMISSION_SECTION_DEFAULTS.education));
    for (const item of resume.education) {
      lines.push([item.credential, item.school, item.year].filter(Boolean).join(" — "));
    }
  }
  if (resume.licenses.length) {
    lines.push("", submissionSectionHeading(resume.licensesHeading, SUBMISSION_SECTION_DEFAULTS.licenses));
    for (const item of resume.licenses) lines.push(`• ${item}`);
  }
  return lines.join("\n");
}
