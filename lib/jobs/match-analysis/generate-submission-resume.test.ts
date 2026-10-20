import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import {
  buildSubmissionResumeUserPrompt,
  composeSubmissionResumePrompt,
  ensureSubmissionSystemPrompt,
  SUBMISSION_RESUME_CONTENT_RULES,
  SUBMISSION_RESUME_SOURCE_CHARS,
} from "./generate-submission-resume";
import { applySkillEvidenceFilter } from "./submission-resume-evidence";
import { renderSubmissionResumeDocx } from "./submission-resume-docx";
import {
  mergeSubmissionResume,
  parseSubmissionResume,
  submissionResumeToPlainText,
  type SubmissionResume,
} from "./submission-resume";
import {
  FOLLOW_UP_QA_HEADING,
  SCREENING_RESPONSES_HEADING,
  buildSubmissionEnrichmentFromRows,
  formatVerifiedInfoForSubmission,
  submissionEvidenceCorpus,
} from "./submission-enrichment";
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

describe("Step 5 submission résumé enrichment", () => {
  it("formats verified information for the draft prompt", () => {
    expect(
      formatVerifiedInfoForSubmission([
        { category: "license", title: "RN", details: "Nursys confirmed" },
        { category: "availability", title: null, details: "Starts Monday" },
        { category: "", title: "", details: "" },
      ])
    ).toBe(
      "Verified information:\n- license · RN: Nursys confirmed\n- availability: Starts Monday"
    );
  });

  it("includes Steps 2–4 enrichment in the draft user prompt", () => {
    const prompt = buildSubmissionResumeUserPrompt({
      identity: {
        fullName: "Maya Ellison",
        email: "maya@example.com",
        phone: "555-0100",
        location: "Illinois City, IL",
        jobTitle: "Test Professional",
      },
      analysis: analysisFixture(),
      resumeText: "Maya Ellison\nRN with Illinois City experience.",
      enrichmentNotes: [
        "Call context:\nOpen to travel.",
        "Screening call answers:\nQ: Earliest start?\nA: Next Monday",
        "Verified information:\n- license · RN: Nursys confirmed",
      ].join("\n\n"),
    });

    expect(prompt).toContain("Recruiter enrichment from Verifications / Follow-Up / Deep Match:");
    expect(prompt).toContain("Call context:\nOpen to travel.");
    expect(prompt).toContain("Q: Earliest start?\nA: Next Monday");
    expect(prompt).toContain("Nursys confirmed");
    expect(prompt).toContain("Confirmed evidence:");
    expect(prompt).toContain("Illinois City");
    expect(prompt).toContain("Original résumé:");
  });

  it("omits the enrichment section when Steps 2–3 are empty", () => {
    const prompt = buildSubmissionResumeUserPrompt({
      identity: {
        fullName: "Maya Ellison",
        email: "",
        phone: "",
        location: "",
        jobTitle: "Test Professional",
      },
      analysis: analysisFixture(),
      resumeText: "Résumé text",
      enrichmentNotes: "   ",
    });

    expect(prompt).not.toContain("Recruiter enrichment");
  });

  it("sends a long source résumé through instead of cutting it at 12,000 characters", () => {
    const resumeText = `EARLY ROLE marker ${"detail ".repeat(3_000)} LATER ROLE still on the source.`;
    expect(resumeText.length).toBeGreaterThan(12_000);
    expect(resumeText.length).toBeLessThan(SUBMISSION_RESUME_SOURCE_CHARS);

    const prompt = buildSubmissionResumeUserPrompt({
      identity: {
        fullName: "Jordan Hale",
        email: "",
        phone: "",
        location: "",
        jobTitle: "Observability Architect",
      },
      analysis: null,
      resumeText,
    });

    expect(prompt).toContain("EARLY ROLE marker");
    expect(prompt).toContain("LATER ROLE still on the source.");
  });
});

const LIVE_USER_TEMPLATE = `Target job: {{job_title}}
Candidate: {{candidate_name}}
Contact: {{candidate_contact}}

Recruiter summary: {{recruiter_summary}}

Confirmed evidence:
{{confirmed_evidence}}

Strengths:
{{strengths}}

Recruiter enrichment from Verifications / Follow-Up / Deep Match:
{{enrichment_notes}}

Original résumé:
{{candidate_resume}}`;

const SCREENING_FACT = "Used Azure DevOps Boards daily for the EHR program at Acme Health.";
const FOLLOW_UP_FACT = "Led weekly Python production deployments on the market-risk data pipeline.";
const ORIGINAL_RESUME = "Maya Ellison\nRN with Illinois City experience.\nLed EHR integrations at Acme Health.";

function mayaIdentity() {
  return {
    fullName: "Maya Ellison",
    email: "maya@example.com",
    phone: "555-0100",
    location: "Illinois City, IL",
    jobTitle: "Test Professional",
  };
}

describe("Step 5 model input", () => {
  it("sends the original résumé, screening responses, and follow-up answers to the model", () => {
    const enrichment = buildSubmissionEnrichmentFromRows({
      analysis: {
        screening_questions: [
          {
            priority: 1,
            question: "Which tools did you use on the EHR program?",
            reason: "",
            related_requirement: "Tools",
          },
        ],
        follow_up_questions: [
          {
            priority: 1,
            question: "What did the weekly production work include?",
            reason: "",
            related_requirement: "Production",
          },
        ],
      },
      jobScreeningAnswers: [
        {
          question_text: "What degree did you complete?",
          answer: { value: "Bachelor of Science in Computer Science, 2016." },
        },
      ],
      aiAnswers: [
        {
          question_key: "1:which tools did you use on the ehr program?",
          question_text: "Which tools did you use on the EHR program?",
          answer_text: SCREENING_FACT,
        },
        {
          question_key: "follow_up:1:what did the weekly production work include?",
          question_text: "What did the weekly production work include?",
          answer_text: FOLLOW_UP_FACT,
        },
      ],
    });

    const { system, user } = composeSubmissionResumePrompt({
      systemPrompt: "PRIMARY DUTY\nPreserve the source résumé. Reorganize and tighten.",
      userPromptTemplate: LIVE_USER_TEMPLATE,
      identity: mayaIdentity(),
      analysis: analysisFixture(),
      resumeText: ORIGINAL_RESUME,
      enrichmentNotes: enrichment.promptNotes,
    });

    expect(user).toContain(ORIGINAL_RESUME);
    expect(user).toContain(SCREENING_RESPONSES_HEADING);
    expect(user).toContain("Bachelor of Science in Computer Science, 2016.");
    expect(user).toContain(SCREENING_FACT);
    expect(user).toContain(FOLLOW_UP_QA_HEADING);
    expect(user).toContain(FOLLOW_UP_FACT);
    expect(user).toContain("Do not only reformat the layout or change the font.");
    expect(system.indexOf("CONTENT RULES")).toBeLessThan(system.indexOf("PRIMARY DUTY"));
    expect(system).toContain("Concrete screening and follow-up facts");
    expect(system).toContain(SUBMISSION_RESUME_CONTENT_RULES);
    expect(system).toContain("Do not invent employers");
    expect(system).not.toContain("Preserve the source résumé. Reorganize and tighten.");
    expect(enrichment.evidenceNotes).toContain(SCREENING_FACT);
    expect(enrichment.evidenceNotes).toContain(FOLLOW_UP_FACT);
    expect(enrichment.evidenceNotes).not.toContain("Which tools did you use");
  });

  it("puts CONTENT RULES ahead of a catalog PRIMARY DUTY preserve-only block", () => {
    const system = ensureSubmissionSystemPrompt(
      "PRIMARY DUTY\nPreserve the source résumé. Reorganize and tighten.\n\nANTI-SHRINK\nKeep bullets."
    );
    expect(system.indexOf("CONTENT RULES")).toBeLessThan(system.indexOf("PRIMARY DUTY"));
    expect(system).toContain("must change the résumé content");
    expect(system).toContain("ANTI-SHRINK");
  });

  it("still includes screening and follow-up when the catalog template drops the enrichment placeholder", () => {
    const enrichment = buildSubmissionEnrichmentFromRows({
      analysis: null,
      aiAnswers: [
        {
          question_key: "2:describe your ehr tools",
          question_text: "Describe your EHR tools",
          answer_text: SCREENING_FACT,
        },
        {
          question_key: "follow_up:4:describe the pipeline",
          question_text: "Describe the pipeline",
          answer_text: FOLLOW_UP_FACT,
        },
      ],
    });
    const { user } = composeSubmissionResumePrompt({
      systemPrompt: "Rewrite the résumé.",
      userPromptTemplate: "Original résumé:\n{{candidate_resume}}",
      identity: mayaIdentity(),
      analysis: null,
      resumeText: ORIGINAL_RESUME,
      enrichmentNotes: enrichment.promptNotes,
    });

    expect(user).toContain(ORIGINAL_RESUME);
    expect(user).toContain(SCREENING_FACT);
    expect(user).toContain(FOLLOW_UP_FACT);
  });

  it("keeps generation instructions honest when screening and follow-up answers are empty", () => {
    const enrichment = buildSubmissionEnrichmentFromRows({
      analysis: {
        screening_questions: [
          {
            priority: 1,
            question: "Do you have Snowflake experience?",
            reason: "",
            related_requirement: "Snowflake",
          },
        ],
        follow_up_questions: [
          {
            priority: 1,
            question: "The résumé mentions Snowflake. Describe it.",
            reason: "",
            related_requirement: "Snowflake",
          },
        ],
      },
      aiAnswers: [
        {
          question_key: "1:do you have snowflake experience?",
          question_text: "Do you have Snowflake experience?",
          answer_text: "   ",
        },
        {
          question_key: "follow_up:1:the résumé mentions snowflake. describe it.",
          question_text: "The résumé mentions Snowflake. Describe it.",
          answer_text: "",
        },
      ],
    });
    const { system, user } = composeSubmissionResumePrompt({
      systemPrompt: "Rewrite the résumé.",
      userPromptTemplate: LIVE_USER_TEMPLATE,
      identity: mayaIdentity(),
      analysis: null,
      resumeText: ORIGINAL_RESUME,
      enrichmentNotes: enrichment.promptNotes,
    });

    expect(user).toContain(ORIGINAL_RESUME);
    expect(user).toContain(`${SCREENING_RESPONSES_HEADING}\n(none)`);
    expect(user).toContain(`${FOLLOW_UP_QA_HEADING}\n(none)`);
    expect(user).not.toContain("Snowflake");
    expect(system).toContain("do not fabricate content");
    expect(enrichment.evidenceNotes).toBe("");
    expect(
      submissionEvidenceCorpus({
        evidenceNotes: enrichment.evidenceNotes,
        enrichmentNotes: enrichment.promptNotes,
      })
    ).toBe("");
  });
});

describe("Step 5 generated résumé content", () => {
  function draftedResume(): SubmissionResume {
    const parsed = parseSubmissionResume({
      fullName: "Maya Ellison",
      headline: "RN",
      summary: "RN who led EHR integrations.",
      skills: ["EHR", "Azure DevOps", "Kubernetes"],
      experience: [
        {
          title: "RN",
          company: "Acme Health",
          location: "Illinois City, IL",
          dates: "2019–2024",
          bullets: [
            "Led EHR integrations at Acme Health.",
            FOLLOW_UP_FACT,
          ],
        },
      ],
      education: [],
      licenses: [],
    });
    const fallback = parseSubmissionResume({
      fullName: "Maya Ellison",
      headline: "RN",
      summary: ORIGINAL_RESUME,
      skills: ["EHR"],
      experience: [
        {
          title: "RN",
          company: "Acme Health",
          dates: "2019–2024",
          bullets: ["Led EHR integrations at Acme Health."],
        },
      ],
    });
    return mergeSubmissionResume(parsed, fallback!);
  }

  it("keeps supported screening and follow-up details in the Word résumé and drops invented skills", async () => {
    const enrichment = buildSubmissionEnrichmentFromRows({
      analysis: null,
      aiAnswers: [
        {
          question_key: "1:tools",
          question_text: "Which tools?",
          answer_text: SCREENING_FACT,
        },
        {
          question_key: "follow_up:1:pipeline",
          question_text: "What was the pipeline work?",
          answer_text: FOLLOW_UP_FACT,
        },
      ],
    });
    const { resume } = applySkillEvidenceFilter(draftedResume(), {
      resumeText: ORIGINAL_RESUME,
      enrichmentNotes: enrichment.evidenceNotes,
    });
    const text = submissionResumeToPlainText(resume);
    expect(resume.skills).toContain("Azure DevOps");
    expect(resume.skills).not.toContain("Kubernetes");
    expect(text).toContain(FOLLOW_UP_FACT);
    expect(text).toContain("Led EHR integrations at Acme Health.");

    const docx = await renderSubmissionResumeDocx(resume);
    const extracted = await mammoth.extractRawText({ buffer: docx });
    expect(extracted.value).toContain("Azure DevOps");
    expect(extracted.value).toContain(FOLLOW_UP_FACT);
    expect(extracted.value).not.toContain("Kubernetes");
  });

  it("does not add skills from unanswered question text when responses are empty", () => {
    const enrichment = buildSubmissionEnrichmentFromRows({
      analysis: {
        follow_up_questions: [
          {
            priority: 1,
            question: "Confirm Snowflake and Kubernetes production ownership.",
            reason: "",
            related_requirement: "Tools",
          },
        ],
      },
      aiAnswers: [],
    });
    const { resume } = applySkillEvidenceFilter(
      {
        ...draftedResume(),
        skills: ["EHR", "Snowflake", "Kubernetes"],
      },
      {
        resumeText: ORIGINAL_RESUME,
        enrichmentNotes: submissionEvidenceCorpus({
          evidenceNotes: enrichment.evidenceNotes,
          enrichmentNotes: enrichment.promptNotes,
        }),
      }
    );
    expect(resume.skills).toEqual(["EHR"]);
    expect(submissionResumeToPlainText(resume)).not.toContain("Snowflake");
  });
});
