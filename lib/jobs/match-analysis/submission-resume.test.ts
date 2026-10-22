import { describe, expect, it } from "vitest";
import {
  buildFallbackSubmissionResume,
  isSubmissionResumeFileName,
  mergeSubmissionResume,
  parseSubmissionResume,
  submissionResumeFileName,
  submissionResumeToPlainText,
  submissionSectionHeading,
  submissionSkillParagraphs,
  SUBMISSION_SECTION_DEFAULTS,
} from "./submission-resume";
import { renderSubmissionResumePdf } from "./submission-resume-pdf";
import type { MatchAnalysisResponse } from "./schema";

function analysisFixture(): MatchAnalysisResponse {
  return {
    analysis_version: "1.0",
    job: {
      job_id: "job-1",
      job_title: "test",
      msp_or_client: "MSP",
      specialty: "Test professional",
      location: "Illinois City, Illinois",
    },
    candidate_match: {
      recommended_overall_match_score: 94,
      match_category: "STRONG_MATCH",
      display_category: "Strong Match",
      confidence_score: 93,
      mandatory_requirement_override: false,
      recommended_action: "PRIORITIZE_AND_CALL",
      recruiter_decision_summary: "Strong on-site fit for Illinois City.",
    },
    subscores: {
      mandatory_requirements_score: 100,
      specialty_experience_score: 95,
      clinical_skills_score: 90,
      licenses_certifications_score: 88,
      work_setting_equipment_score: 96,
      preferred_qualifications_score: 80,
    },
    experience_analysis: {
      total_professional_experience_years: 8,
      relevant_specialty_experience_years: 7,
      recent_relevant_experience_years: 4,
      travel_experience_confirmed: true,
      required_work_setting_experience_confirmed: true,
      is_estimated: false,
      experience_calculation_notes: ["Lead Test Professional at River Bend Facility."],
    },
    mandatory_requirements: [
      {
        requirement: "Ability to work the assigned on-site schedule in Illinois City, Illinois.",
        requirement_type: "MANDATORY",
        status: "CONFIRMED",
        requirement_outcome: "MET",
        candidate_evidence: "Lives and works on-site in Illinois City.",
        evidence_source: "RESUME",
        impact: "",
        verification_required: false,
        confidence: 96,
      },
    ],
    preferred_requirements: [],
    strengths: ["Local Illinois City availability.", "Eight years of facility testing work."],
    gaps_and_risks: [],
    screening_questions: [],
    submission_readiness: {
      ready_to_submit: true,
      readiness_status: "READY_TO_SUBMIT",
      items_to_verify_before_submission: [],
      documents_or_credentials_needed: [],
      blocking_requirements: [],
    },
    alternative_fit: {
      redirect_recommended: false,
      redirect_reason: "",
      possible_job_types: [],
    },
    data_quality: {
      resume_completeness: "HIGH",
      job_description_completeness: "HIGH",
      job_description_conflicts: [],
      resume_conflicts: [],
      missing_information: [],
    },
    quick_match: {
      step: "quick_match",
      quick_route: "STRONG",
      extracted_resume: {
        headline: "Lead Test Professional",
        years_estimated: 8,
        recent_titles: ["Lead Test Professional", "Test Coordinator"],
        named_products_in_jobs: [],
        education: "B.S. Health Sciences, University of Illinois, 2017",
      },
      counts: {
        confirmed: 1,
        partial: 0,
        not_found: 0,
        conflicting: 0,
        preferred_confirmed: 0,
        preferred_total: 0,
      },
      mand_met: 1,
      pref_met: 0,
      weighted: 1,
    },
  };
}

describe("submission résumé pack", () => {
  it("names the exported file as a submission résumé PDF or DOCX", () => {
    expect(submissionResumeFileName("Maya Ellison")).toBe("Maya_Ellison_submission_resume.pdf");
    expect(submissionResumeFileName("Maya Ellison", ".docx")).toBe(
      "Maya_Ellison_submission_resume.docx"
    );
    expect(isSubmissionResumeFileName("Maya_Ellison_submission_resume.pdf")).toBe(true);
    expect(isSubmissionResumeFileName("Maya_Ellison_submission_resume.docx")).toBe(true);
    expect(isSubmissionResumeFileName("Maya_Ellison_resume.pdf")).toBe(false);
  });

  it("builds a job-aligned fallback from Deep Match evidence", () => {
    const resume = buildFallbackSubmissionResume({
      identity: {
        fullName: "Maya Ellison",
        email: "maya@example.com",
        phone: "309-555-0188",
        location: "Illinois City, IL",
        jobTitle: "test",
      },
      analysis: analysisFixture(),
      resumeText: "Lead Test Professional at River Bend Facility, Illinois City.",
    });

    expect(resume.fullName).toBe("Maya Ellison");
    expect(resume.headline).toContain("Lead Test Professional");
    expect(resume.summary).toContain("Illinois City");
    // Long requirement sentences are excluded from skills[] (anti-stuffing).
    expect(resume.skills.every((item) => item.length <= 60)).toBe(true);
    expect(resume.skills).toEqual(
      expect.arrayContaining(["Lead Test Professional", "Test Coordinator"])
    );
    expect(resume.experience[0]?.title).toBe("Lead Test Professional");
    expect(submissionResumeToPlainText(resume)).toContain("PROFESSIONAL SUMMARY");
  });

  it("truncates overlong skills instead of failing Zod validation", () => {
    const longSkill =
      "Lead implementation of customer-facing IT solutions from planning through final deployment across multi-vendor environments";
    expect(longSkill.length).toBeGreaterThan(80);

    const parsed = parseSubmissionResume({
      fullName: "Chris Onyekaba",
      headline: "IT Project Coordinator",
      email: "chris@example.com",
      phone: "",
      location: "Remote",
      summary: "Experienced PM.",
      skills: [longSkill, "PMP", longSkill + " again"],
      experience: [],
      education: [],
      licenses: [],
    });

    expect(parsed).not.toBeNull();
    expect(parsed!.skills[0]).toBe(longSkill);
    expect(parsed!.skills.every((item) => item.length <= 500)).toBe(true);

    const huge = parseSubmissionResume({
      fullName: "Chris Onyekaba",
      headline: "IT Project Coordinator",
      summary: "Experienced PM.",
      skills: ["S".repeat(600)],
      experience: [],
      education: [],
      licenses: [],
    });
    expect(huge!.skills[0]).toHaveLength(500);

    const withLongRequirements = analysisFixture();
    withLongRequirements.mandatory_requirements = [
      {
        requirement: longSkill,
        requirement_type: "MANDATORY",
        status: "CONFIRMED",
        requirement_outcome: "MET",
        candidate_evidence: "Resume bullets",
        evidence_source: "RESUME",
        impact: "",
        verification_required: false,
        confidence: 90,
      },
    ];

    const fallback = buildFallbackSubmissionResume({
      identity: {
        fullName: "Chris Onyekaba",
        email: "chris@example.com",
        phone: "",
        location: "Remote",
        jobTitle: "IT Project Coordinator / Project Manager",
      },
      analysis: withLongRequirements,
      resumeText: "Project manager with delivery ownership.",
    });
    expect(fallback.skills.every((item) => item.length <= 80)).toBe(true);
  });

  it("keeps a multi-page work history instead of rejecting it", () => {
    const bullets = Array.from({ length: 12 }, (_, index) => `Source bullet ${index + 1} with a real metric.`);
    const experience = Array.from({ length: 12 }, (_, index) => ({
      title: `Role ${index + 1}`,
      company: `Employer ${index + 1}`,
      location: "Austin, TX",
      dates: `${2010 + index}–${2011 + index}`,
      bullets,
    }));

    const parsed = parseSubmissionResume({
      fullName: "Jordan Hale",
      headline: "Observability Architect",
      summary: "Kept from the source résumé.",
      skills: Array.from({ length: 18 }, (_, index) => `Tool ${index + 1}`),
      experience,
      education: [],
      licenses: [],
    });

    expect(parsed).not.toBeNull();
    expect(parsed!.experience).toHaveLength(12);
    expect(parsed!.experience[0]?.bullets).toHaveLength(12);
    expect(parsed!.experience[11]?.company).toBe("Employer 12");
    expect(parsed!.skills).toHaveLength(18);
    expect(parsed!.experience[0]?.location).toBe("Austin, TX");
    expect(submissionResumeToPlainText(parsed!)).toContain("PROFESSIONAL EXPERIENCE");
    expect(submissionResumeToPlainText(parsed!)).not.toContain("RELEVANT EXPERIENCE");
  });

  it("keeps a long skill line, a source heading, and a long bullet list", () => {
    const skillLine =
      "Business Analysis: Lean Six Sigma Professional (Yellow Belt), PMP, Excel, Access, Visio, SQL, Data Mapping";
    const bullets = Array.from({ length: 30 }, (_, index) => `Original bullet ${index + 1} from the source résumé.`);
    const parsed = parseSubmissionResume({
      fullName: "Faihad Hassan",
      headline: "",
      summaryHeading: "SUMMARY",
      skillsHeading: "TECHNICAL SKILLS AND CERTIFICATES",
      experienceHeading: "EXPERIENCE",
      summary: "15 years of product management.",
      skills: ["Product Management", skillLine],
      experience: [
        {
          title: "Senior Product Manager",
          company: "Pacific Gas & Electric (PG&E)",
          location: "San Francisco, CA",
          dates: "December 2019 – November 2020",
          bullets,
        },
      ],
      education: [],
      licenses: [],
    });

    expect(parsed).not.toBeNull();
    expect(parsed!.skills[1]).toBe(skillLine);
    expect(parsed!.experience[0]?.bullets).toHaveLength(30);
    expect(submissionSectionHeading(parsed!.summaryHeading, SUBMISSION_SECTION_DEFAULTS.summary)).toBe("SUMMARY");
    expect(submissionSectionHeading("", SUBMISSION_SECTION_DEFAULTS.summary)).toBe("Professional summary");
    expect(submissionSkillParagraphs(["PMP", "Jira", "SQL"])).toEqual(["PMP  ·  Jira  ·  SQL"]);
    expect(submissionSkillParagraphs(["Product Management", skillLine])).toEqual([
      "Product Management",
      skillLine,
    ]);
    expect(submissionResumeToPlainText(parsed!)).toContain("SUMMARY");
    expect(submissionResumeToPlainText(parsed!)).toContain("TECHNICAL SKILLS AND CERTIFICATES");
  });

  it("keeps identity from the fallback when the model omits contact fields", () => {
    const fallback = buildFallbackSubmissionResume({
      identity: {
        fullName: "Maya Ellison",
        email: "maya@example.com",
        phone: "309-555-0188",
        location: "Illinois City, IL",
        jobTitle: "test",
      },
      analysis: analysisFixture(),
      resumeText: "",
    });
    const merged = mergeSubmissionResume(
      parseSubmissionResume({
        fullName: "",
        headline: "On-site Test Professional",
        email: "",
        summary: "Tailored summary.",
        skills: ["On-site facility assignments"],
        experience: [],
      }),
      fallback
    );
    expect(merged.fullName).toBe("Maya Ellison");
    expect(merged.email).toBe("maya@example.com");
    expect(merged.headline).toBe("On-site Test Professional");
    expect(merged.summary).toBe("Tailored summary.");
  });

  it("renders a PDF buffer", async () => {
    const resume = buildFallbackSubmissionResume({
      identity: {
        fullName: "Maya Ellison",
        email: "maya@example.com",
        phone: "309-555-0188",
        location: "Illinois City, IL",
        jobTitle: "test",
      },
      analysis: analysisFixture(),
      resumeText: "Lead Test Professional at River Bend Facility.",
    });
    const pdf = await renderSubmissionResumePdf(resume);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.byteLength).toBeGreaterThan(500);
  });
});
