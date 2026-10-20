import { describe, expect, it, vi } from "vitest";
import {
  candidateIdentityKey,
  candidatePhoneNameKey,
  collapseWorkersToCandidateProfiles,
  findWorkerByPhoneAndName,
  normalizeCandidatePersonName,
  normalizeCandidatePhone,
  pickCandidateProfile,
  selectUniqueCandidateProfilesInOrder,
} from "./candidate-identity";

describe("candidate-identity", () => {
  it("never matches workers on a placeholder phone shared by resume-upload shells", async () => {
    const from = vi.fn();
    const match = await findWorkerByPhoneAndName({ from } as never, {
      tenantId: "tenant-1",
      phone: "0000000000",
      firstName: "Applicant",
      lastName: "User",
    });
    expect(match).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("normalizes phone to digits and name to lowercase", () => {
    expect(normalizeCandidatePhone("+1 (475) 224-8003")).toBe("14752248003");
    expect(normalizeCandidatePersonName(" Swetha ", " Reddy ")).toBe("swetha reddy");
  });

  it("prefers email identity key and falls back to phone+name", () => {
    expect(
      candidateIdentityKey({
        email: "swethareddy11r@gmail.com",
        phone: "+1 (475) 224-8003",
        first_name: "Swetha",
        last_name: "Reddy",
      })
    ).toBe("email:swethareddy11r@gmail.com");

    expect(
      candidateIdentityKey({
        email: "",
        phone: "+1 (475) 224-8003",
        first_name: "Swetha",
        last_name: "Reddy",
      })
    ).toBe("phone-name:4752248003:swetha reddy");

    expect(
      candidatePhoneNameKey({
        email: "a@b.com",
        phone: "+1 (475) 224-8003",
        first_name: "Swetha",
        last_name: "Reddy",
      })
    ).toBe("4752248003:swetha reddy");
  });

  it("picks the emailed worker as the candidate profile", () => {
    const profile = pickCandidateProfile([
      {
        id: "blank",
        email: null,
        applied_job_count: 2,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "emailed",
        email: "swethareddy11r@gmail.com",
        applied_job_count: 1,
        created_at: "2026-02-01T00:00:00.000Z",
      },
    ]);
    expect(profile.id).toBe("emailed");
  });

  it("collapses email + blank-email phone/name duplicates into one candidate profile", () => {
    const collapsed = collapseWorkersToCandidateProfiles(
      [
        {
          id: "w1",
          email: "swethareddy11r@gmail.com",
          phone: "+1 (475) 224-8003",
          first_name: "Swetha",
          last_name: "Reddy",
          applied_job_count: 1,
          application_job_titles_text: "Senior OT Cybersecurity Engineer",
          created_at: "2026-09-07T00:00:00.000Z",
        },
        {
          id: "w2",
          email: "",
          phone: "+1 (475) 224-8003",
          first_name: "Swetha",
          last_name: "Reddy",
          applied_job_count: 1,
          application_job_titles_text: "Information Security Platform Engineer",
          created_at: "2026-08-28T00:00:00.000Z",
        },
      ],
      {
        appliedJobCounts: new Map([
          ["w1", 1],
          ["w2", 1],
        ]),
        jobTitlesByWorker: new Map([
          ["w1", ["Senior OT Cybersecurity Engineer"]],
          ["w2", ["Information Security Platform Engineer"]],
        ]),
      }
    );

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].id).toBe("w1");
    expect(collapsed[0].email).toBe("swethareddy11r@gmail.com");
    expect(collapsed[0].applied_job_count).toBe(2);
    expect(String(collapsed[0].application_job_titles_text)).toContain(
      "Senior OT Cybersecurity Engineer"
    );
    expect(String(collapsed[0].application_job_titles_text)).toContain(
      "Information Security Platform Engineer"
    );
  });

  it("merges application fields from sibling when emailed profile has none", () => {
    const collapsed = collapseWorkersToCandidateProfiles(
      [
        {
          id: "emailed-empty",
          email: "swethareddy11r@gmail.com",
          phone: "+1 (475) 224-8003",
          first_name: "Swetha",
          last_name: "Reddy",
          applied_job_count: 0,
          created_at: "2026-09-07T00:00:00.000Z",
        },
        {
          id: "blank-with-app",
          email: "",
          phone: "+1 (475) 224-8003",
          first_name: "Swetha",
          last_name: "Reddy",
          applied_job_count: 1,
          application_id: "app-1",
          application_job_title: "Software Engineer",
          application_job_titles_text: "Software Engineer",
          application_client_name: "Cotiviti USA, LLC",
          application_status_name: "New / Not Contacted",
          match_application_id: "app-1",
          ai_match_status: "ANALYZED",
          ai_match_score: 88,
          created_at: "2026-08-28T00:00:00.000Z",
        },
      ],
      {
        appliedJobCounts: new Map([
          ["emailed-empty", 0],
          ["blank-with-app", 1],
        ]),
        jobTitlesByWorker: new Map([["blank-with-app", ["Software Engineer"]]]),
      }
    );

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].id).toBe("blank-with-app");
    expect(collapsed[0].email).toBe("swethareddy11r@gmail.com");
    expect(collapsed[0].application_job_title).toBe("Software Engineer");
    expect(collapsed[0].application_id).toBe("app-1");
    expect(collapsed[0].match_application_id).toBe("app-1");
    expect(collapsed[0].ai_match_score).toBe(88);
  });

  it("pages unique candidate profiles in first-seen order", () => {
    const unique = selectUniqueCandidateProfilesInOrder([
      {
        id: "blank",
        email: "",
        phone: "4752248003",
        first_name: "Swetha",
        last_name: "Reddy",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "other",
        email: "other@example.com",
        phone: "1111111111",
        first_name: "Other",
        last_name: "Person",
        created_at: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "emailed",
        email: "swethareddy11r@gmail.com",
        phone: "+1 (475) 224-8003",
        first_name: "Swetha",
        last_name: "Reddy",
        created_at: "2026-01-03T00:00:00.000Z",
      },
    ]);

    expect(unique).toHaveLength(2);
    expect(unique[0].id).toBe("emailed");
    expect(unique[0].email).toBe("swethareddy11r@gmail.com");
    expect(unique[1].id).toBe("other");
  });
});
