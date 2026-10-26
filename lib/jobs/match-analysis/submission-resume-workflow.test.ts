import { describe, expect, it } from "vitest";
import { filterSkillsByEvidence, applySkillEvidenceFilter } from "./submission-resume-evidence";
import { renderSubmissionResumeDocx } from "./submission-resume-docx";
import { renderSubmissionResumePdf } from "./submission-resume-pdf";
import { buildSubmissionImprovementSummary } from "./submission-resume-improvement";
import { formatVerifiedInfoForSubmission } from "./submission-enrichment";
import type { SubmissionResume } from "./submission-resume";

const ORIGINAL_RESUME = `
Annie Agarwal
IT Project Coordinator

Skills: Agile, Scrum, Jira, MS Project, Stakeholder Management

Experience
IT Project Coordinator — Acme Health
2019–2024
• Led cross-functional Agile delivery for EHR integrations using Jira and MS Project
• Coordinated stakeholder governance and status reporting

Education
Bachelor's degree in Information Systems
`;

function optimizedFixture(overrides?: Partial<SubmissionResume>): SubmissionResume {
  return {
    fullName: "Annie Agarwal",
    headline: "IT Project Coordinator / Project Manager",
    email: "annie@example.com",
    phone: "555-0100",
    location: "Prosper, TX",
    linkedin: "",
    summary: "IT project coordinator with Agile delivery experience.",
    summaryHeading: "",
    skillsHeading: "",
    experienceHeading: "",
    educationHeading: "",
    licensesHeading: "",
    skills: [
      "Agile",
      "Scrum",
      "Jira",
      "MS Project",
      "Stakeholder Management",
      "Kubernetes",
      "Terraform",
      "Snowflake",
      "Databricks",
      "Kafka",
      "Spark",
      "Airflow",
      "Redis",
      "GraphQL",
      "Rust",
      "Go",
      "Flutter",
      "Kotlin",
      "Swift",
      "Salesforce",
      "ServiceNow",
      "SAP",
      "Oracle",
      "MongoDB",
      "Cassandra",
    ],
    experience: [
      {
        title: "IT Project Coordinator",
        company: "Acme Health",
        location: "",
        dates: "2019–2024",
        bullets: [
          "Led cross-functional Agile delivery for EHR integrations using Jira and MS Project",
          "Coordinated stakeholder governance and status reporting",
        ],
      },
    ],
    education: [{ school: "State University", credential: "Bachelor's degree in Information Systems", year: "2017" }],
    licenses: ["PMP"],
    ...overrides,
  };
}

describe("submission resume evidence filter", () => {
  it("removes unsupported skills and flags keyword stuffing", () => {
    const result = filterSkillsByEvidence({
      skills: optimizedFixture().skills,
      resumeText: ORIGINAL_RESUME,
      experienceBullets: optimizedFixture().experience.flatMap((job) => job.bullets),
    });
    expect(result.keptSkills).toEqual(
      expect.arrayContaining(["Agile", "Scrum", "Jira", "MS Project", "Stakeholder Management"])
    );
    expect(result.keptSkills).not.toContain("Kubernetes");
    expect(result.keptSkills).not.toContain("Flutter");
    expect(result.removedSkills.length).toBeGreaterThan(10);
    expect(result.quality).toBe("keyword_stuffing");
  });

  it("keeps skills confirmed via screening enrichment or certifications", () => {
    const enrichment = [
      formatVerifiedInfoForSubmission([
        { category: "certification", title: "PMP", details: "Active PMP certification confirmed on call" },
      ]),
      "Screening Q&A:\nQ: Confirm Azure DevOps experience?\nA: Yes — used Azure DevOps Boards for the last 2 years at Acme Health.",
    ].join("\n\n");

    const { resume, evidence } = applySkillEvidenceFilter(
      optimizedFixture({
        skills: ["Agile", "Jira", "Azure DevOps", "Kubernetes", "PMP"],
        licenses: ["PMP"],
      }),
      {
        resumeText: ORIGINAL_RESUME,
        enrichmentNotes: enrichment,
        confirmedEvidence: ["Azure DevOps: Used Azure DevOps Boards for 2 years"],
      }
    );

    expect(resume.skills).toEqual(expect.arrayContaining(["Agile", "Jira", "Azure DevOps"]));
    expect(resume.skills).not.toContain("Kubernetes");
    expect(evidence.removedSkills).toContain("Kubernetes");
  });
});

describe("submission resume deliverables", () => {
  it("renders an editable docx and a pdf preview with grounded content", async () => {
    const enrichment = formatVerifiedInfoForSubmission([
      { category: "certification", title: "PMP", details: "Active" },
    ]);
    const { resume, evidence } = applySkillEvidenceFilter(
      optimizedFixture({
        skills: ["Agile", "Scrum", "Jira", "MS Project", "Kubernetes", "Flutter"],
        licenses: ["PMP"],
      }),
      { resumeText: ORIGINAL_RESUME, enrichmentNotes: enrichment }
    );
    const summary = buildSubmissionImprovementSummary({
      originalResumeText: ORIGINAL_RESUME,
      optimized: resume,
      enrichmentNotes: enrichment,
      skillQuality: evidence.quality,
      skillNote: evidence.qualityNote,
      removedSkills: evidence.removedSkills,
    });

    const [docx, pdf] = await Promise.all([
      renderSubmissionResumeDocx(resume),
      renderSubmissionResumePdf(resume),
    ]);

    expect(docx.subarray(0, 2).toString("utf8")).toBe("PK"); // zip/docx magic
    expect(docx.byteLength).toBeGreaterThan(1_000);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(resume.skills).not.toContain("Kubernetes");
    expect(resume.licenses).toContain("PMP");
    expect(summary.skillEvidenceQuality).not.toBe("strong");
    expect(summary.removed.some((line) => /Kubernetes|Flutter/i.test(line))).toBe(true);
    expect(summary.clarity.length).toBeGreaterThan(10);
    expect(summary.relevance.length).toBeGreaterThan(10);
    expect(summary.formatting.length).toBeGreaterThan(10);
  });
});
