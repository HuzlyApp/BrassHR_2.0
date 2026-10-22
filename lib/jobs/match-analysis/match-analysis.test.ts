import { describe, expect, it } from "vitest";
import { parseAndValidateMatchAnalysis } from "./parse";
import { applyFairnessOutcomes, rescoreMatchAnalysis } from "./score";
import { sanitizeResumeForMatchAnalysis } from "./sanitize-resume";
import {
  ANALYZE_RESPONSE_SCHEMA,
  ANALYZE_SYSTEM_PROMPT,
  DEEP_ANALYSIS_SYSTEM_PROMPT,
  buildMatchAnalysisUserPrompt,
  systemPromptForMode,
} from "./prompts";
import type { MatchAnalysisResponse, RequirementItem } from "./schema";
import { parseAnalysisProvider } from "./schema";

function baseAnalysis(
  overrides: Partial<MatchAnalysisResponse> = {}
): MatchAnalysisResponse {
  return {
    analysis_version: "1.0",
    job: {
      job_id: "job-1",
      job_title: "ICU RN",
      msp_or_client: "Acme",
      specialty: "ICU",
      location: "TX",
    },
    candidate_match: {
      recommended_overall_match_score: 95,
      match_category: "STRONG_MATCH",
      display_category: "Strong Match",
      confidence_score: 80,
      mandatory_requirement_override: false,
      recommended_action: "PRIORITIZE_AND_CALL",
      recruiter_decision_summary: "Looks strong",
    },
    subscores: {
      mandatory_requirements_score: 95,
      specialty_experience_score: 90,
      clinical_skills_score: 90,
      licenses_certifications_score: 95,
      work_setting_equipment_score: 80,
      preferred_qualifications_score: 70,
    },
    experience_analysis: {
      total_professional_experience_years: 5,
      relevant_specialty_experience_years: 3,
      recent_relevant_experience_years: 2,
      travel_experience_confirmed: true,
      required_work_setting_experience_confirmed: true,
      is_estimated: false,
      experience_calculation_notes: [],
    },
    mandatory_requirements: [],
    preferred_requirements: [],
    strengths: ["ICU experience"],
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
    ...overrides,
  };
}

function req(
  partial: Partial<RequirementItem> & Pick<RequirementItem, "requirement">
): RequirementItem {
  return {
    requirement_type: "MANDATORY",
    status: "CONFIRMED",
    requirement_outcome: "MET",
    candidate_evidence: "Worked 2 years ICU at Memorial",
    evidence_source: "RESUME",
    impact: "",
    verification_required: false,
    confidence: 90,
    ...partial,
  };
}

describe("parseAndValidateMatchAnalysis", () => {
  it("parses fenced JSON and validates schema", () => {
    const analysis = baseAnalysis({
      mandatory_requirements: [
        req({ requirement: "Active TX RN license" }),
      ],
    });
    const raw = "```json\n" + JSON.stringify(analysis) + "\n```";
    const parsed = parseAndValidateMatchAnalysis(raw);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.mandatory_requirements).toHaveLength(1);
      expect(parsed.data.candidate_match.match_category).toBe("STRONG_MATCH");
    }
  });

  it("parses Step 1 Quick Match JSON and recomputes the route without a match percent", () => {
    const parsed = parseAndValidateMatchAnalysis(
      JSON.stringify({
        step: "quick_match",
        quick_route: "STRONG",
        extracted_resume: {
          headline: "Java engineer",
          years_estimated: 8,
          recent_titles: ["SWE"],
          named_products_in_jobs: [],
          education: "BS CS",
        },
        mandatory_requirements: [
          {
            requirement: "Java",
            status: "PARTIAL",
            evidence: "skills list",
            evidence_source: "SKILLS_LIST",
          },
          { requirement: "SQL", status: "PARTIAL", evidence: "related", evidence_source: "SUMMARY" },
        ],
        preferred_requirements: [],
        blocking_requirements: [],
        items_to_verify: ["Confirm Java version"],
      })
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      // Nothing confirmed and weighted 0.50 → LOW_MATCH, not the model's STRONG.
      expect(parsed.data.quick_match?.quick_route).toBe("LOW_MATCH");
      expect(parsed.data.candidate_match.recommended_overall_match_score).toBe(0);
      expect(parsed.data.candidate_match.display_category).toBe("Low match");
      expect(parsed.data.screening_questions).toEqual([]);
      expect(parsed.data.strengths).toEqual([]);
      expect(parsed.data.mandatory_requirements[0].evidence_source).toBe("RESUME");
      expect(parsed.data.mandatory_requirements[0].requirement_outcome).toBe("VERIFY");
    }
  });

  it("rejects an unknown requirement status instead of saving it as Verify or Strong", () => {
    const parsed = parseAndValidateMatchAnalysis(
      JSON.stringify({
        step: "quick_match",
        quick_route: "STRONG",
        mandatory_requirements: [{ requirement: "Java", status: "YES", evidence: "maybe" }],
        preferred_requirements: [],
        blocking_requirements: [],
      })
    );
    expect(parsed.ok).toBe(false);

    const deep = parseAndValidateMatchAnalysis(
      JSON.stringify({
        ...baseAnalysis(),
        mandatory_requirements: [
          {
            requirement: "Java",
            requirement_type: "MANDATORY",
            status: "STRONG",
            requirement_outcome: "MET",
            candidate_evidence: "n/a",
            evidence_source: "RESUME",
            impact: "",
            verification_required: false,
            confidence: 90,
          },
        ],
      })
    );
    expect(deep.ok).toBe(false);
  });

  it("returns validation errors for invalid category", () => {
    const bad = {
      ...baseAnalysis(),
      candidate_match: {
        ...baseAnalysis().candidate_match,
        match_category: "SUPER_MATCH",
        recommended_action: "PRIORITIZE_AND_CALL",
      },
    };
    const parsed = parseAndValidateMatchAnalysis(JSON.stringify(bad));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.some((e) => e.includes("match_category"))).toBe(true);
    }
  });

  it("coerces Deep Match quirks: string screening questions, bad outcome, invalid confidence", () => {
    const deep = {
      ...baseAnalysis({
        mandatory_requirements: [
          {
            requirement: "3+ years React",
            requirement_type: "MANDATORY",
            status: "PARTIAL",
            requirement_outcome: "partial",
            candidate_evidence: "Skills list mentions React",
            evidence_source: "RESUME",
            impact: "",
            verification_required: true,
            confidence: "n/a",
          },
        ],
        screening_questions: [
          "Confirm React production experience.",
          "Verify TypeScript usage on last project.",
        ],
      }),
    };

    const parsed = parseAndValidateMatchAnalysis(JSON.stringify(deep));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.mandatory_requirements[0]?.requirement_outcome).toBe("VERIFY");
      expect(parsed.data.mandatory_requirements[0]?.confidence).toBe(50);
      expect(parsed.data.screening_questions).toHaveLength(2);
      expect(parsed.data.screening_questions[0]?.question).toContain("React");
      expect(parsed.data.screening_questions[0]?.priority).toBe(1);
    }
  });

  it("hydrates lean Analyze JSON into the full match-analysis shape", () => {
    const lean = {
      recommended_overall_match_score: 68,
      match_category: "POSSIBLE_MATCH",
      recommended_action: "CALL_AND_VERIFY",
      mandatory_requirements: [
        {
          requirement: "Active TX RN license",
          status: "PARTIAL",
          evidence: "Lists RN license without state or expiry.",
        },
        {
          requirement: "2 years ICU",
          status: "CONFIRMED",
          evidence: "ICU RN at Memorial 2022-2024.",
        },
      ],
      preferred_requirements: [
        {
          requirement: "Travel experience",
          status: "NOT_FOUND",
          evidence: "",
        },
      ],
      strengths: ["2 years ICU at Memorial with dated ownership evidence."],
      gaps_and_risks: ["TX RN license state/expiry not documented."],
      resume_authenticity: "Low concern",
      screening_questions: ["Confirm TX compact license status.", "Verify ICU unit type."],
      items_to_verify: ["Work authorization"],
      blocking_requirements: [],
    };
    const parsed = parseAndValidateMatchAnalysis(JSON.stringify(lean));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.candidate_match.match_category).toBe("POSSIBLE_MATCH");
      expect(parsed.data.candidate_match.recommended_action).toBe("CALL_AND_VERIFY");
      expect(parsed.data.candidate_match.recommended_overall_match_score).toBe(68);
      expect(parsed.data.candidate_match.recruiter_decision_summary).toContain("Low concern");
      expect(parsed.data.mandatory_requirements).toHaveLength(2);
      expect(parsed.data.mandatory_requirements[0]?.candidate_evidence).toContain("RN license");
      expect(parsed.data.mandatory_requirements[0]?.requirement_outcome).toBe("VERIFY");
      expect(parsed.data.mandatory_requirements[1]?.requirement_outcome).toBe("MET");
      expect(parsed.data.screening_questions).toHaveLength(2);
      expect(parsed.data.screening_questions[0]?.question).toContain("compact license");
      expect(parsed.data.submission_readiness.items_to_verify_before_submission).toEqual([
        "Work authorization",
      ]);
      expect(parsed.data.strengths).toEqual([
        "2 years ICU at Memorial with dated ownership evidence.",
      ]);
      expect(parsed.data.gaps_and_risks).toEqual([
        "TX RN license state/expiry not documented.",
      ]);
      expect(parsed.data.data_quality.resume_conflicts).toEqual(["Low concern"]);
    }
  });

  it("fills documented strengths from confirmed requirements when Analyze omits them", () => {
    const lean = {
      recommended_overall_match_score: 50,
      match_category: "WEAK_MATCH",
      recommended_action: "KEEP_AS_POSSIBLE",
      mandatory_requirements: [
        {
          requirement: "Extensive experience with Informatica IDMC",
          status: "CONFIRMED",
          evidence: "Implemented Informatica IDMC pipelines at Acme 2021-2024.",
        },
        {
          requirement: "8+ years hands-on data engineering",
          status: "PARTIAL",
          evidence: "Resume shows 6 years of dated data-engineering work.",
        },
      ],
      preferred_requirements: [],
      screening_questions: ["Confirm Informatica IDMC product modules used."],
      items_to_verify: ["Confirm Azure vs AWS data-stack experience"],
      blocking_requirements: [],
    };
    const parsed = parseAndValidateMatchAnalysis(JSON.stringify(lean));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.strengths).toEqual([
        "Implemented Informatica IDMC pipelines at Acme 2021-2024.",
      ]);
    }
  });

  it("maps Technology prompt output fields onto the Analyze schema", () => {
    const tech = {
      match_score: 54,
      recommendation: "Hold",
      hard_knockout: false,
      strengths: ["Sentinel listed on 2022-2024 SOC analyst role."],
      weaknesses: ["GKE appears only as a skills-list cousin of Kubernetes."],
      resume_authenticity: "Low concern",
      items_to_verify: ["Confirm Kubernetes vs GKE production ownership"],
      recruiter_questions: ["Which clusters did you run on GKE, and in which years?"],
      potential_score_after_verification: 71,
      mandatory_requirements: [
        {
          requirement: "Kubernetes",
          status: "PARTIAL",
          evidence: "Skills list includes Kubernetes; no dated cluster ownership bullet.",
        },
      ],
      preferred_requirements: [],
    };
    const parsed = parseAndValidateMatchAnalysis(JSON.stringify(tech));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.candidate_match.recommended_overall_match_score).toBe(54);
      expect(parsed.data.candidate_match.match_category).toBe("WEAK_MATCH");
      expect(parsed.data.candidate_match.recommended_action).toBe("KEEP_AS_POSSIBLE");
      expect(parsed.data.candidate_match.display_category).toBe("Hold");
      expect(parsed.data.candidate_match.recruiter_decision_summary).toContain("71");
      expect(parsed.data.gaps_and_risks[0]).toContain("GKE");
      expect(parsed.data.screening_questions[0]?.question).toContain("GKE");
    }
  });
});

describe("analyze vs deep prompts", () => {
  const sampleInput = {
    jobId: "job-1",
    jobTitle: "ICU RN",
    structured: {
      mandatoryRequirements: ["Active TX RN license"],
      preferredRequirements: ["Travel experience"],
      requiredLicenses: ["RN"],
      requiredCertifications: ["BLS"],
      educationRequirements: ["BSN"],
    },
    fullJobDescription: "Need an ICU RN in Texas.",
    resumeText: "ICU RN at Memorial 2022-2024.",
  };

  it("defaults to the hardcoded Quick Match prompt and JSON schema", () => {
    expect(systemPromptForMode("analyze")).toBe(ANALYZE_SYSTEM_PROMPT);
    expect(systemPromptForMode("deep")).toBe(DEEP_ANALYSIS_SYSTEM_PROMPT);
    const prompt = buildMatchAnalysisUserPrompt(sampleInput);
    expect(prompt).toContain(ANALYZE_RESPONSE_SCHEMA);
    expect(prompt).toContain("Do not score");
    expect(prompt).not.toContain("recruiter_decision_summary");
    expect(prompt).not.toContain("experience_calculation_notes");
    expect(ANALYZE_SYSTEM_PROMPT).toContain("This is Step 1 Quick Match");
    expect(ANALYZE_SYSTEM_PROMPT).toContain("The app recomputes quick_route");
    expect(ANALYZE_SYSTEM_PROMPT).not.toContain("REQUIREMENT LISTS");
  });

  it("uses the Verifications prompt when generating Step 2 screening questions", () => {
    expect(systemPromptForMode("call_pack")).toContain("Qualification Checklist");
    expect(systemPromptForMode("call_pack")).toContain("Verifications");
  });

  it("uses the deep schema only when analysisMode is deep", () => {
    const prompt = buildMatchAnalysisUserPrompt({ ...sampleInput, analysisMode: "deep" });
    expect(prompt).toContain("recruiter_decision_summary");
    expect(prompt).toContain("experience_calculation_notes");
    expect(prompt).toContain("no more than 5 focused screening questions");
  });
});

describe("sanitizeResumeForMatchAnalysis", () => {
  it("redacts SSN, DOB, age, marital status, street address", () => {
    const raw = `
Jane Doe
SSN: 123-45-6789
DOB: 01/02/1990
Age: 34
Marital Status: Married
123 Main Street Apt 4
Austin, TX 78701
ICU RN with 5 years experience
`;
    const sanitized = sanitizeResumeForMatchAnalysis(raw);
    expect(sanitized).not.toMatch(/123-45-6789/);
    expect(sanitized).toContain("[REDACTED_SSN]");
    expect(sanitized).toContain("[REDACTED_DOB]");
    expect(sanitized).toContain("[REDACTED_AGE]");
    expect(sanitized).toContain("[REDACTED_MARITAL_STATUS]");
    expect(sanitized).toContain("[REDACTED_STREET_ADDRESS]");
    expect(sanitized).toContain("ICU RN with 5 years experience");
  });

  it("does not treat ordinary uses of single as marital status", () => {
    const sanitized = sanitizeResumeForMatchAnalysis(
      "single item orders and single line order processing\nMarital Status: Single"
    );
    expect(sanitized).toContain("single item orders");
    expect(sanitized).toContain("single line order processing");
    expect(sanitized).toContain("[REDACTED_MARITAL_STATUS]");
    expect(sanitized).not.toContain("Marital Status: Single");
  });
});

describe("applyFairnessOutcomes", () => {
  it("downgrades CONFIRMED without evidence to VERIFY", () => {
    const [result] = applyFairnessOutcomes([
      req({
        requirement: "BLS",
        status: "CONFIRMED",
        requirement_outcome: "MET",
        candidate_evidence: "",
      }),
    ]);
    expect(result.status).toBe("PARTIAL");
    expect(result.requirement_outcome).toBe("VERIFY");
  });

  it("maps NOT_FOUND without clear negative evidence to VERIFY", () => {
    const [result] = applyFairnessOutcomes([
      req({
        requirement: "Epic charting",
        status: "NOT_FOUND",
        requirement_outcome: "NOT_MET",
        candidate_evidence: "",
      }),
    ]);
    expect(result.requirement_outcome).toBe("VERIFY");
  });

  it("does not treat 'not listed on résumé' as a hard NOT_MET knockout", () => {
    const [result] = applyFairnessOutcomes([
      req({
        requirement: "Active RN license",
        status: "NOT_FOUND",
        requirement_outcome: "NOT_MET",
        candidate_evidence: "No RN license listed; only CNA and BLS shown",
      }),
    ]);
    expect(result.requirement_outcome).toBe("VERIFY");
  });

  it("keeps NOT_MET only for explicit inability", () => {
    const [result] = applyFairnessOutcomes([
      req({
        requirement: "Must work onsite in Plano",
        status: "CONFLICTING",
        requirement_outcome: "NOT_MET",
        candidate_evidence: "Candidate stated they cannot work onsite and are unwilling to relocate.",
      }),
    ]);
    expect(result.requirement_outcome).toBe("CONFLICT");
  });

  it("maps location mismatch without inability to VERIFY instead of a conflict knockout", () => {
    const [result] = applyFairnessOutcomes([
      req({
        requirement: "Ability to work on-site in Richardson, TX",
        status: "CONFLICTING",
        requirement_outcome: "CONFLICT",
        candidate_evidence: "JD states McLean, VA on-site; candidate currently works in Richardson, TX.",
      }),
    ]);
    expect(result.status).toBe("PARTIAL");
    expect(result.requirement_outcome).toBe("VERIFY");
  });
});

describe("rescoreMatchAnalysis", () => {
  it("does not zero the score when a mandatory item is merely missing from the résumé", () => {
    const analysis = baseAnalysis({
      mandatory_requirements: [
        req({
          requirement: "Active TX RN license",
          status: "NOT_FOUND",
          requirement_outcome: "NOT_MET",
          candidate_evidence: "Candidate has no nursing license listed",
        }),
        req({
          requirement: "2 years ICU experience",
          status: "NOT_FOUND",
          requirement_outcome: "NOT_MET",
          candidate_evidence: "No ICU experience documented in résumé",
        }),
      ],
    });
    const rescored = rescoreMatchAnalysis(analysis);
    expect(rescored.candidate_match.match_category).not.toBe("NOT_CURRENTLY_SUBMITTABLE");
    expect(rescored.candidate_match.recommended_overall_match_score).toBeGreaterThan(0);
    expect(rescored.candidate_match.recommended_overall_match_score).toBeLessThanOrEqual(45);
    expect(rescored.mandatory_requirements.every((r) => r.requirement_outcome === "VERIFY")).toBe(
      true
    );
  });

  it("caps explicit inability as not currently submittable without collapsing to 0%", () => {
    const analysis = baseAnalysis({
      mandatory_requirements: [
        req({
          requirement: "Must work onsite in Dallas",
          status: "CONFLICTING",
          requirement_outcome: "CONFLICT",
          candidate_evidence: "Candidate stated they cannot work onsite.",
        }),
        req({
          requirement: "5 years CNA experience",
          status: "CONFIRMED",
          requirement_outcome: "MET",
          candidate_evidence: "CNA at Chatham Health 2020-current",
        }),
      ],
    });
    const rescored = rescoreMatchAnalysis(analysis);
    expect(rescored.candidate_match.match_category).toBe("NOT_CURRENTLY_SUBMITTABLE");
    expect(rescored.candidate_match.recommended_action).toBe("STOP_FOR_THIS_JOB");
    expect(rescored.candidate_match.mandatory_requirement_override).toBe(true);
    expect(rescored.candidate_match.recommended_overall_match_score).toBeGreaterThan(0);
    expect(rescored.candidate_match.recommended_overall_match_score).toBeLessThanOrEqual(45);
  });

  it("sets NEEDS_MORE_INFORMATION when resume completeness is LOW", () => {
    const analysis = baseAnalysis({
      data_quality: {
        resume_completeness: "LOW",
        job_description_completeness: "HIGH",
        job_description_conflicts: [],
        resume_conflicts: [],
        missing_information: ["employment dates"],
      },
      mandatory_requirements: [
        req({
          requirement: "2 years ICU",
          status: "PARTIAL",
          requirement_outcome: "VERIFY",
          candidate_evidence: "Mentions ICU briefly",
        }),
      ],
    });
    const rescored = rescoreMatchAnalysis(analysis);
    expect(rescored.candidate_match.match_category).toBe("NEEDS_MORE_INFORMATION");
    expect(rescored.candidate_match.recommended_action).toBe("CALL_AND_VERIFY");
    expect(rescored.candidate_match.recommended_overall_match_score).toBeGreaterThan(0);
  });

  it("downgrades STRONG to GOOD when mandatory items need verification", () => {
    const analysis = baseAnalysis({
      mandatory_requirements: [
        req({
          requirement: "Active TX RN license",
          status: "PARTIAL",
          requirement_outcome: "VERIFY",
          candidate_evidence: "Mentions RN role",
          verification_required: true,
        }),
        req({
          requirement: "2 years ICU experience",
          status: "CONFIRMED",
          requirement_outcome: "MET",
          candidate_evidence: "ICU RN 2022-2024 at Memorial",
        }),
      ],
      preferred_requirements: [
        req({
          requirement: "Travel experience",
          requirement_type: "PREFERRED",
          status: "CONFIRMED",
          candidate_evidence: "Two travel assignments",
        }),
      ],
    });
    const rescored = rescoreMatchAnalysis(analysis);
    expect(rescored.candidate_match.match_category).not.toBe("NOT_CURRENTLY_SUBMITTABLE");
    // High scores but unverified mandatory → not STRONG
    if (rescored.candidate_match.recommended_overall_match_score >= 90) {
      expect(rescored.candidate_match.match_category).toBe("GOOD_MATCH");
    } else {
      expect(["GOOD_MATCH", "POSSIBLE_MATCH", "WEAK_MATCH"]).toContain(
        rescored.candidate_match.match_category
      );
    }
  });

  it("does not use model score as final — recomputes from statuses", () => {
    const analysis = baseAnalysis({
      candidate_match: {
        ...baseAnalysis().candidate_match,
        recommended_overall_match_score: 99,
        match_category: "STRONG_MATCH",
      },
      mandatory_requirements: [
        req({
          requirement: "Epic EMR",
          status: "NOT_FOUND",
          requirement_outcome: "VERIFY",
          candidate_evidence: "",
        }),
        req({
          requirement: "BLS",
          status: "NOT_FOUND",
          requirement_outcome: "VERIFY",
          candidate_evidence: "",
        }),
      ],
    });
    const rescored = rescoreMatchAnalysis(analysis);
    expect(rescored.candidate_match.recommended_overall_match_score).toBeLessThan(99);
  });

  it("does not collapse score to 0 when license/specialty buckets are empty", () => {
    const analysis = baseAnalysis({
      subscores: {
        mandatory_requirements_score: 0,
        specialty_experience_score: 0,
        clinical_skills_score: 0,
        licenses_certifications_score: 0,
        work_setting_equipment_score: 0,
        preferred_qualifications_score: 0,
      },
      mandatory_requirements: [
        req({
          requirement: "5 years Microsoft Sentinel administration",
          status: "CONFIRMED",
          requirement_outcome: "MET",
          candidate_evidence: "Sentinel engineer at Contoso 2019-2024",
        }),
      ],
    });
    const rescored = rescoreMatchAnalysis(analysis);
    expect(rescored.candidate_match.recommended_overall_match_score).toBeGreaterThanOrEqual(75);
  });

  it("keeps the model score for Technology pack instead of parking at 45", () => {
    const analysis = baseAnalysis({
      candidate_match: {
        ...baseAnalysis().candidate_match,
        recommended_overall_match_score: 54,
        match_category: "WEAK_MATCH",
        display_category: "Hold",
        recommended_action: "KEEP_AS_POSSIBLE",
      },
      mandatory_requirements: [
        req({
          requirement: "Kubernetes",
          status: "PARTIAL",
          requirement_outcome: "VERIFY",
          candidate_evidence: "Skills list only",
        }),
        req({
          requirement: "Informatica IDMC",
          status: "NOT_FOUND",
          requirement_outcome: "VERIFY",
          candidate_evidence: "Not listed",
        }),
      ],
    });
    const rescored = rescoreMatchAnalysis(analysis, { preserveModelScore: true });
    expect(rescored.candidate_match.recommended_overall_match_score).toBe(54);
    expect(rescored.candidate_match.display_category).toBe("Hold");
    expect(rescored.candidate_match.match_category).toBe("WEAK_MATCH");
    expect(rescored.candidate_match.recommended_action).toBe("KEEP_AS_POSSIBLE");
  });

  it("does not cap a strong Java match at 45 for a location mismatch without inability", () => {
    const analysis = baseAnalysis({
      candidate_match: {
        ...baseAnalysis().candidate_match,
        recommended_overall_match_score: 82,
        match_category: "GOOD_MATCH",
        display_category: "Submit",
        recommended_action: "CALL_AND_VERIFY",
        mandatory_requirement_override: false,
      },
      submission_readiness: {
        ...baseAnalysis().submission_readiness,
        ready_to_submit: false,
        readiness_status: "VERIFY_BEFORE_SUBMISSION",
        blocking_requirements: [],
      },
      mandatory_requirements: [
        req({ requirement: "Java / J2EE", status: "CONFIRMED", requirement_outcome: "MET" }),
        req({ requirement: "Spring Boot", status: "CONFIRMED", requirement_outcome: "MET" }),
        req({ requirement: "Microservices", status: "CONFIRMED", requirement_outcome: "MET" }),
        req({ requirement: "REST APIs", status: "CONFIRMED", requirement_outcome: "MET" }),
        req({ requirement: "SQL", status: "CONFIRMED", requirement_outcome: "MET" }),
        req({ requirement: "AWS", status: "CONFIRMED", requirement_outcome: "MET" }),
        req({ requirement: "CI/CD", status: "CONFIRMED", requirement_outcome: "MET" }),
        req({ requirement: "Agile", status: "CONFIRMED", requirement_outcome: "MET" }),
        req({
          requirement: "Ability to work on-site in Richardson, TX",
          status: "CONFLICTING",
          requirement_outcome: "CONFLICT",
          candidate_evidence:
            "JD states McLean, VA on-site; candidate currently works in Richardson, TX.",
        }),
        req({
          requirement: "GenAI experience",
          status: "NOT_FOUND",
          requirement_outcome: "VERIFY",
          candidate_evidence: "Not listed on résumé",
        }),
      ],
    });
    const rescored = rescoreMatchAnalysis(analysis, { preserveModelScore: true });
    expect(rescored.candidate_match.recommended_overall_match_score).toBe(82);
    expect(rescored.candidate_match.match_category).not.toBe("NOT_CURRENTLY_SUBMITTABLE");
    expect(rescored.candidate_match.recommended_action).not.toBe("STOP_FOR_THIS_JOB");
    expect(rescored.mandatory_requirements.find((r) => /on-site/i.test(r.requirement))?.requirement_outcome).toBe(
      "VERIFY"
    );
  });

  it("unparks a Technology 45 when most mandatories are confirmed and the only conflict is onsite location", () => {
    const analysis = baseAnalysis({
      candidate_match: {
        ...baseAnalysis().candidate_match,
        recommended_overall_match_score: 45,
        match_category: "NOT_CURRENTLY_SUBMITTABLE",
        display_category: "Do Not Submit",
        recommended_action: "STOP_FOR_THIS_JOB",
        mandatory_requirement_override: true,
      },
      submission_readiness: {
        ...baseAnalysis().submission_readiness,
        ready_to_submit: false,
        readiness_status: "NOT_CURRENTLY_SUBMITTABLE",
        blocking_requirements: ["Ability to work on-site in Richardson, TX"],
      },
      mandatory_requirements: [
        req({ requirement: "Java / J2EE", status: "CONFIRMED", requirement_outcome: "MET" }),
        req({ requirement: "Spring Boot", status: "CONFIRMED", requirement_outcome: "MET" }),
        req({ requirement: "Microservices", status: "CONFIRMED", requirement_outcome: "MET" }),
        req({ requirement: "REST APIs", status: "CONFIRMED", requirement_outcome: "MET" }),
        req({ requirement: "SQL", status: "CONFIRMED", requirement_outcome: "MET" }),
        req({
          requirement: "Ability to work on-site in Richardson, TX",
          status: "CONFLICTING",
          requirement_outcome: "CONFLICT",
          candidate_evidence:
            "JD states McLean, VA on-site; candidate currently works in Richardson, TX.",
        }),
      ],
    });
    const rescored = rescoreMatchAnalysis(analysis, { preserveModelScore: true });
    expect(rescored.candidate_match.recommended_overall_match_score).toBeGreaterThan(45);
    expect(rescored.candidate_match.match_category).not.toBe("NOT_CURRENTLY_SUBMITTABLE");
    expect(rescored.candidate_match.recommended_action).not.toBe("STOP_FOR_THIS_JOB");
    expect(rescored.candidate_match.display_category).not.toBe("Do Not Submit");
  });

  it("keeps Technology hard knockouts instead of fairness-rescoring them to VERIFY", () => {
    const analysis = baseAnalysis({
      candidate_match: {
        ...baseAnalysis().candidate_match,
        recommended_overall_match_score: 54,
        match_category: "NOT_CURRENTLY_SUBMITTABLE",
        display_category: "Do Not Submit",
        mandatory_requirement_override: true,
        recommended_action: "STOP_FOR_THIS_JOB",
      },
      submission_readiness: {
        ...baseAnalysis().submission_readiness,
        ready_to_submit: false,
        readiness_status: "NOT_CURRENTLY_SUBMITTABLE",
        blocking_requirements: ["AWS Solutions Architect Professional"],
      },
      mandatory_requirements: [
        req({
          requirement: "AWS Solutions Architect Professional",
          status: "NOT_FOUND",
          requirement_outcome: "NOT_MET",
          candidate_evidence: "Not listed on resume",
        }),
      ],
    });
    const rescored = rescoreMatchAnalysis(analysis, { preserveModelScore: true });
    expect(rescored.candidate_match.recommended_overall_match_score).toBe(54);
    expect(rescored.candidate_match.match_category).toBe("NOT_CURRENTLY_SUBMITTABLE");
    expect(rescored.candidate_match.mandatory_requirement_override).toBe(true);
    expect(rescored.candidate_match.recommended_action).toBe("STOP_FOR_THIS_JOB");
  });
});

describe("parseAnalysisProvider", () => {
  it("defaults to grok", () => {
    expect(parseAnalysisProvider(undefined)).toBe("grok");
    expect(parseAnalysisProvider(null)).toBe("grok");
    expect(parseAnalysisProvider("")).toBe("grok");
    expect(parseAnalysisProvider("unknown")).toBe("grok");
    expect(parseAnalysisProvider("grok")).toBe("grok");
  });

  it("accepts gemini", () => {
    expect(parseAnalysisProvider("gemini")).toBe("gemini");
  });

  it("accepts claude", () => {
    expect(parseAnalysisProvider("claude")).toBe("claude");
  });
});
