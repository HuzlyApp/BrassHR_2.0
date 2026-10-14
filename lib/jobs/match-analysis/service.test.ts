import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedPromptVersion } from "@/lib/ai-catalog/types";
import {
  __setClaudeMessagesCreateForTests,
  __setGeminiFetchForTests,
  __setGrokClientForTests,
  generateMatchAnalysis,
  getMatchAnalysisModelName,
  isClaudeMatchAnalysisAvailable,
} from "./service";

const LEAN_ANALYSIS = {
  recommended_overall_match_score: 82,
  match_category: "GOOD_MATCH",
  recommended_action: "CALL_AND_VERIFY",
  mandatory_requirements: [
    {
      requirement: "Active TX RN license",
      status: "CONFIRMED",
      evidence: "Lists compact RN license.",
    },
  ],
  preferred_requirements: [],
  strengths: ["ICU experience at Memorial."],
  gaps_and_risks: ["Shift preference not listed."],
  resume_authenticity: "Low concern",
  screening_questions: ["Confirm compact license status."],
  items_to_verify: ["Work authorization"],
  blocking_requirements: [],
};

const resolved: ResolvedPromptVersion = {
  promptVersionId: "pv1",
  templateId: "t1",
  featureKey: "candidate_match",
  variantKey: "quick",
  requestedIndustryKey: "healthcare",
  resolvedVerticalKey: "healthcare",
  contentHash: "hash",
  systemPrompt: "You are an analyst.",
  userPromptTemplate: "Job:\n{{job_description}}\n\nResume:\n{{candidate_resume}}",
  responseSchema: {},
  modelConfig: {},
  status: "published",
  versionNumber: 1,
  source: "published_master",
  fallbackApplied: false,
};

const input = {
  jobId: "job-1",
  jobTitle: "ICU RN",
  structured: {
    mandatoryRequirements: ["Active TX RN license"],
    preferredRequirements: [],
    requiredLicenses: [],
    requiredCertifications: [],
    educationRequirements: [],
  },
  fullJobDescription: "ICU RN in Austin, TX",
  resumeText: "Jane Doe RN with 3 years ICU at Memorial.",
};

afterEach(() => {
  __setGeminiFetchForTests(null);
  __setGrokClientForTests(null);
  __setClaudeMessagesCreateForTests(null);
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MATCH_MODEL;
  delete process.env.XAI_MATCH_MODEL;
  delete process.env.CLAUDE_API_KEY;
  delete process.env.CLAUDE_MODEL_DEFAULT;
  delete process.env.CLAUDE_MATCH_MODEL;
});

describe("getMatchAnalysisModelName", () => {
  it("defaults to Grok", () => {
    expect(getMatchAnalysisModelName()).toBe("grok-4-fast");
    expect(getMatchAnalysisModelName("grok")).toBe("grok-4-fast");
  });

  it("returns the Gemini model when Gemini is selected", () => {
    expect(getMatchAnalysisModelName("gemini")).toBe("gemini-3.5-flash-lite");
  });

  it("returns Claude Haiku when Claude is selected", () => {
    expect(getMatchAnalysisModelName("claude")).toBe("claude-haiku-4-5-20251001");
  });
});

describe("isClaudeMatchAnalysisAvailable", () => {
  it("is false without CLAUDE_API_KEY and true when set", () => {
    expect(isClaudeMatchAnalysisAvailable()).toBe(false);
    process.env.CLAUDE_API_KEY = "test-claude-key";
    expect(isClaudeMatchAnalysisAvailable()).toBe(true);
  });
});

describe("generateMatchAnalysis", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  it("calls Grok by default", async () => {
    const create = vi.fn(async () => ({
      output_text: JSON.stringify(LEAN_ANALYSIS),
    }));
    __setGrokClientForTests({
      responses: { create },
    } as never);

    const result = await generateMatchAnalysis(input, resolved);

    expect(create).toHaveBeenCalledOnce();
    const grokArgs = create.mock.calls[0]?.[0] as { input?: Array<{ role?: string; content?: string }> };
    expect(grokArgs.input?.[0]?.content).toContain("You are an analyst.");
    expect(grokArgs.input?.[0]?.content).not.toContain("This is Step 1 Quick Match");
    expect(grokArgs.input?.[1]?.content).toContain("ICU RN in Austin, TX");
    expect(grokArgs.input?.[1]?.content).toContain("Jane Doe RN");
    expect(result.model).toBe("grok-4-fast");
    expect(result.analysis.mandatory_requirements).toHaveLength(1);
    expect(result.repaired).toBe(false);
  });

  it("sends the resolved prompt body, including a prompt that was updated after the previous run", async () => {
    const create = vi.fn(async () => ({
      output_text: JSON.stringify(LEAN_ANALYSIS),
    }));
    __setGrokClientForTests({
      responses: { create },
    } as never);

    await generateMatchAnalysis(input, resolved, "grok");
    await generateMatchAnalysis(
      input,
      {
        ...resolved,
        promptVersionId: "pv2",
        contentHash: "hash-v2",
        systemPrompt: "CORE SEAT updated prompt. Do not invent STRONG.",
      },
      "grok"
    );

    const first = create.mock.calls[0]?.[0] as { input?: Array<{ content?: string }> };
    const second = create.mock.calls[1]?.[0] as { input?: Array<{ content?: string }> };
    expect(first.input?.[0]?.content).toContain("You are an analyst.");
    expect(second.input?.[0]?.content).toContain("CORE SEAT updated prompt");
    expect(second.input?.[0]?.content).not.toContain("You are an analyst.");
    expect(second.input?.[1]?.content).toContain("ICU RN in Austin, TX");
  });

  it("calls Gemini when Gemini is selected", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("/models/gemini-3.5-flash-lite:generateContent");
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(LEAN_ANALYSIS) }] } }],
        }),
      };
    });
    __setGeminiFetchForTests(fetchMock as unknown as typeof fetch);

    const result = await generateMatchAnalysis(input, resolved, "gemini");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.model).toBe("gemini-3.5-flash-lite");
    expect(result.analysis.mandatory_requirements).toHaveLength(1);
    expect(result.repaired).toBe(false);
  });

  it("ignores a Grok catalog model when Gemini is selected", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("/models/gemini-3.5-flash-lite:generateContent");
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(LEAN_ANALYSIS) }] } }],
        }),
      };
    });
    __setGeminiFetchForTests(fetchMock as unknown as typeof fetch);

    const result = await generateMatchAnalysis(
      input,
      { ...resolved, modelConfig: { model: "grok-4-fast" } },
      "gemini"
    );

    expect(result.model).toBe("gemini-3.5-flash-lite");
  });

  it("calls Grok when Grok is selected", async () => {
    const create = vi.fn(async () => ({
      output_text: JSON.stringify(LEAN_ANALYSIS),
    }));
    __setGrokClientForTests({
      responses: { create },
    } as never);

    const result = await generateMatchAnalysis(input, resolved, "grok");

    expect(create).toHaveBeenCalledOnce();
    expect(result.model).toBe("grok-4-fast");
    expect(result.analysis.mandatory_requirements).toHaveLength(1);
  });

  it("uses the Step 3 deep Grok model and ignores catalog grok-4-fast", async () => {
    const create = vi.fn(async () => ({
      output_text: JSON.stringify(LEAN_ANALYSIS),
    }));
    __setGrokClientForTests({
      responses: { create },
    } as never);

    const result = await generateMatchAnalysis(
      { ...input, analysisMode: "deep" },
      {
        ...resolved,
        variantKey: "deep",
        modelConfig: { model: "grok-4-fast" },
      },
      "grok"
    );

    expect(create).toHaveBeenCalledOnce();
    const grokArgs = create.mock.calls[0]?.[0] as {
      model?: string;
      reasoning?: { effort?: string };
    };
    const requestOpts = create.mock.calls[0]?.[1] as { timeout?: number } | undefined;
    expect(grokArgs.model).toBe("grok-4.6");
    expect(grokArgs.reasoning).toEqual({ effort: "low" });
    expect(requestOpts?.timeout).toBe(120_000);
    expect(result.model).toBe("grok-4.6");
  });

  it("disables reasoning for Quick Match grok-4-fast", async () => {
    const create = vi.fn(async () => ({
      output_text: JSON.stringify(LEAN_ANALYSIS),
    }));
    __setGrokClientForTests({
      responses: { create },
    } as never);

    await generateMatchAnalysis(input, resolved, "grok");

    const grokArgs = create.mock.calls[0]?.[0] as { reasoning?: { effort?: string } };
    expect(grokArgs.reasoning).toEqual({ effort: "none" });
  });

  it("falls back to Gemini when Deep Match Grok times out", async () => {
    const create = vi.fn(async () => {
      const err = new Error("Request timed out.");
      err.name = "APIConnectionTimeoutError";
      throw err;
    });
    __setGrokClientForTests({
      responses: { create },
    } as never);

    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("/models/gemini-3.1-pro-preview:generateContent");
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(LEAN_ANALYSIS) }] } }],
        }),
      };
    });
    __setGeminiFetchForTests(fetchMock as unknown as typeof fetch);

    const result = await generateMatchAnalysis(
      { ...input, analysisMode: "deep" },
      {
        ...resolved,
        variantKey: "deep",
        modelConfig: { model: "grok-4-fast" },
      },
      "grok"
    );

    expect(create).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.model).toBe("gemini-3.1-pro-preview");
  });

  it("uses the Step 3 deep Gemini model when Gemini is selected for Deep Match", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("/models/gemini-3.1-pro-preview:generateContent");
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(LEAN_ANALYSIS) }] } }],
        }),
      };
    });
    __setGeminiFetchForTests(fetchMock as unknown as typeof fetch);

    const result = await generateMatchAnalysis(
      { ...input, analysisMode: "deep" },
      {
        ...resolved,
        variantKey: "deep",
        modelConfig: { model: "grok-4-fast" },
      },
      "gemini"
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.model).toBe("gemini-3.1-pro-preview");
  });

  it("parses Claude tool_use input as JSON", async () => {
    process.env.CLAUDE_API_KEY = "test-claude-key";
    const create = vi.fn(async () => ({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-haiku-4-5-20251001",
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "tool_1",
          name: "submit_analysis_json",
          input: LEAN_ANALYSIS,
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    }));
    __setClaudeMessagesCreateForTests(create as never);

    const result = await generateMatchAnalysis(input, resolved, "claude");

    expect(create).toHaveBeenCalledOnce();
    const args = create.mock.calls[0]?.[0] as {
      model?: string;
      system?: string;
      tool_choice?: { type?: string; name?: string };
    };
    expect(args.model).toBe("claude-haiku-4-5-20251001");
    expect(args.system).toContain("You are an analyst.");
    expect(args.tool_choice).toEqual({ type: "tool", name: "submit_analysis_json" });
    expect(result.model).toBe("claude-haiku-4-5-20251001");
    expect(result.analysis.mandatory_requirements).toHaveLength(1);
  });

  it("retries Claude once on 429", async () => {
    process.env.CLAUDE_API_KEY = "test-claude-key";
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValueOnce({
        id: "msg_2",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5-20251001",
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tool_2",
            name: "submit_analysis_json",
            input: LEAN_ANALYSIS,
          },
        ],
        usage: { input_tokens: 10, output_tokens: 20 },
      });
    __setClaudeMessagesCreateForTests(create as never);

    const result = await generateMatchAnalysis(input, resolved, "claude");
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.model).toBe("claude-haiku-4-5-20251001");
  });

  it("retries Claude once when stop_reason is max_tokens", async () => {
    process.env.CLAUDE_API_KEY = "test-claude-key";
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        id: "msg_cut",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5-20251001",
        stop_reason: "max_tokens",
        content: [{ type: "text", text: '{"partial":' }],
        usage: { input_tokens: 10, output_tokens: 16000 },
      })
      .mockResolvedValueOnce({
        id: "msg_ok",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5-20251001",
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "tool_ok",
            name: "submit_analysis_json",
            input: LEAN_ANALYSIS,
          },
        ],
        usage: { input_tokens: 10, output_tokens: 200 },
      });
    __setClaudeMessagesCreateForTests(create as never);

    const result = await generateMatchAnalysis(input, resolved, "claude");
    expect(create).toHaveBeenCalledTimes(2);
    const second = create.mock.calls[1]?.[0] as { max_tokens?: number };
    expect((second.max_tokens ?? 0) > 16000).toBe(true);
    expect(result.analysis.mandatory_requirements).toHaveLength(1);
  });

  it("fails clearly when Claude key is missing", async () => {
    delete process.env.CLAUDE_API_KEY;
    await expect(generateMatchAnalysis(input, resolved, "claude")).rejects.toMatchObject({
      name: "MatchAnalysisGenerationError",
      code: "MISSING_CONFIG",
      message: expect.stringContaining("Claude is temporarily unavailable"),
    });
  });
});
