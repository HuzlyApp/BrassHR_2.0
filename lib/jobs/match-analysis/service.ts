import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { assembleFollowUpPromptVariables, assembleMatchAnalysisVariables } from "@/lib/ai-catalog/assemble-match-variables";
import { renderPromptTemplate } from "@/lib/ai-catalog/render-prompt";
import { parseJsonObject, validateAgainstJsonSchema } from "@/lib/ai-catalog/validate-response";
import type { ResolvedPromptVersion } from "@/lib/ai-catalog/types";
import {
  buildMatchAnalysisRepairPrompt,
  truncateStrengthsAndGaps,
  type MatchAnalysisUserPromptInput,
} from "./prompts";
import {
  buildFollowUpNonEmptyRepairPrompt,
  buildFollowUpRepairPrompt,
  ensureFollowUpUserPrompt,
  parseFollowUpQuestions,
  systemPromptForQuestionStage,
  type ChecklistFollowUpRow,
} from "./follow-up-questions";
import { parseAndValidateMatchAnalysis } from "./parse";
import { rescoreMatchAnalysis } from "./score";
import {
  DEFAULT_ANALYSIS_PROVIDER,
  MATCH_ANALYSIS_ERROR,
  parseAnalysisProvider,
  type AnalysisProvider,
  type MatchAnalysisResponse,
} from "./schema";
import type { AnalysisScreeningQuestion } from "./workspace";
import {
  deepMatchModelForProvider,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_STEP1_FALLBACKS,
  getMatchStepModels,
  getStep2QuestionRoute,
  grokReasoningEffort,
  isBlockedStep1Model,
  isBlockedStep3Model,
  resolveClaudeMatchModel,
  sanitizeStep1Model,
  sanitizeStep3Model,
} from "./step-config";

const DEFAULT_GROK_MODEL = "grok-4-fast";
/** Quick Match Gemini default — FSD Step 1 Flash-Lite (gemini-3.5-flash-lite). */
const DEFAULT_GEMINI_MODEL = DEFAULT_STEP1_FALLBACKS[0];
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TEMPERATURE = 0;
const BASE_MAX_TOKENS = 16_000;
const LONG_RESUME_MAX_TOKENS = 24_000;
const LONG_RESUME_CHARS = 8_000;
const DEFAULT_API_TIMEOUT_MS = 90_000;
/** Flagship Deep Match (reasoning) often needs longer than Quick Match. */
const DEFAULT_DEEP_API_TIMEOUT_MS = 120_000;
const CLAUDE_SUBMIT_TOOL = "submit_analysis_json";
const CLAUDE_UNAVAILABLE_MESSAGE =
  "Claude is temporarily unavailable, try another model";
const CLAUDE_RETRYABLE_STATUS = new Set([429, 500, 529]);
const CLAUDE_MAX_TOKENS_CEILING = 64_000;

function readTimeoutMs(envName: string, fallback: number): number {
  const raw = Number(process.env[envName]);
  if (Number.isFinite(raw) && raw >= 5_000) return Math.floor(raw);
  return fallback;
}

function apiTimeoutMs(): number {
  return readTimeoutMs("MATCH_ANALYSIS_TIMEOUT_MS", DEFAULT_API_TIMEOUT_MS);
}

function deepApiTimeoutMs(): number {
  return Math.max(
    apiTimeoutMs(),
    readTimeoutMs("MATCH_ANALYSIS_DEEP_TIMEOUT_MS", DEFAULT_DEEP_API_TIMEOUT_MS)
  );
}

/**
 * Primary Grok Deep Match attempt. Default matches the deep-provider timeout (120s)
 * so grok-4.6 can finish. The match-analysis route allows 300s, which still leaves
 * a full Gemini fallback after this attempt.
 */
function deepGrokAttemptTimeoutMs(): number {
  return Math.min(
    deepApiTimeoutMs(),
    readTimeoutMs("MATCH_ANALYSIS_DEEP_GROK_TIMEOUT_MS", DEFAULT_DEEP_API_TIMEOUT_MS)
  );
}

export class MatchAnalysisGenerationError extends Error {
  readonly code:
    | "MISSING_CONFIG"
    | "TIMEOUT"
    | "AUTH"
    | "RATE_LIMIT"
    | "INVALID_RESPONSE"
    | "EMPTY"
    | "NETWORK"
    | "UNKNOWN"
    | "PROMPT_NOT_CONFIGURED";

  constructor(
    code: MatchAnalysisGenerationError["code"],
    message = MATCH_ANALYSIS_ERROR
  ) {
    super(message);
    this.name = "MatchAnalysisGenerationError";
    this.code = code;
  }
}

function resolveGrokApiKey(): string {
  return (
    process.env.XAI_API_KEY?.trim() ||
    process.env.GROK_API_KEY?.trim() ||
    ""
  );
}

function resolveGrokBaseUrl(): string {
  return (process.env.GROK_BASE_URL?.trim() || "https://api.x.ai/v1").replace(/\/$/, "");
}

function resolveGrokModel(): string {
  return (
    process.env.XAI_MATCH_MODEL?.trim() ||
    process.env.GROK_MATCH_MODEL?.trim() ||
    DEFAULT_GROK_MODEL
  );
}

function resolveGeminiApiKey(): string {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    ""
  );
}

function resolveGeminiBaseUrl(): string {
  return (process.env.GEMINI_BASE_URL?.trim() || GEMINI_API_BASE).replace(/\/$/, "");
}

function resolveGeminiModel(): string {
  const fromEnv = process.env.GEMINI_MATCH_MODEL?.trim() || "";
  if (fromEnv) return sanitizeStep1Model(fromEnv, DEFAULT_GEMINI_MODEL);
  // Step 1 catalog/env may pin Grok Fast; Gemini provider must still call a Gemini model.
  const fromConfig = getMatchStepModels().step1Extract.trim();
  if (fromConfig.toLowerCase().includes("gemini")) {
    return sanitizeStep1Model(fromConfig, DEFAULT_GEMINI_MODEL);
  }
  return DEFAULT_GEMINI_MODEL;
}

function resolveClaudeApiKey(): string {
  return process.env.CLAUDE_API_KEY?.trim() || "";
}

function resolveClaudeModel(): string {
  return resolveClaudeMatchModel() || DEFAULT_CLAUDE_MODEL;
}

function claudeMaxTokensCeiling(): number {
  const raw = Number(process.env.CLAUDE_MAX_TOKENS ?? process.env.MATCH_ANALYSIS_CLAUDE_MAX_TOKENS);
  if (Number.isFinite(raw) && raw >= 1_024) return Math.min(Math.floor(raw), CLAUDE_MAX_TOKENS_CEILING);
  return CLAUDE_MAX_TOKENS_CEILING;
}

/** True when CLAUDE_API_KEY is set (never exposes the key). */
export function isClaudeMatchAnalysisAvailable(): boolean {
  return Boolean(resolveClaudeApiKey());
}

let grokClient: OpenAI | null = null;
let geminiFetchImpl: typeof fetch | null = null;
let claudeClient: Anthropic | null = null;
let claudeMessagesCreateImpl:
  | ((
      params: Anthropic.MessageCreateParams,
      options?: Anthropic.RequestOptions
    ) => Promise<Anthropic.Message>)
  | null = null;

function getGrokClient(): OpenAI {
  if (grokClient) return grokClient;
  const apiKey = resolveGrokApiKey();
  if (!apiKey) {
    throw new MatchAnalysisGenerationError("MISSING_CONFIG");
  }
  grokClient = new OpenAI({
    apiKey,
    baseURL: resolveGrokBaseUrl(),
    timeout: apiTimeoutMs(),
    maxRetries: 0,
  });
  return grokClient;
}

function getClaudeClient(): Anthropic {
  if (claudeClient) return claudeClient;
  const apiKey = resolveClaudeApiKey();
  if (!apiKey) {
    throw new MatchAnalysisGenerationError("MISSING_CONFIG", CLAUDE_UNAVAILABLE_MESSAGE);
  }
  claudeClient = new Anthropic({
    apiKey,
    timeout: apiTimeoutMs(),
    maxRetries: 0,
  });
  return claudeClient;
}

/** Test hook: inject a mock OpenAI/Grok client. */
export function __setGrokClientForTests(mock: OpenAI | null): void {
  grokClient = mock;
}

/** Test hook: inject a mock fetch for Gemini requests. */
export function __setGeminiFetchForTests(mock: typeof fetch | null): void {
  geminiFetchImpl = mock;
}

/** Test hook: inject Claude messages.create (or null to reset). */
export function __setClaudeMessagesCreateForTests(
  mock:
    | ((
        params: Anthropic.MessageCreateParams,
        options?: Anthropic.RequestOptions
      ) => Promise<Anthropic.Message>)
    | null
): void {
  claudeMessagesCreateImpl = mock;
  if (!mock) claudeClient = null;
}

export function getMatchAnalysisModelName(
  provider: AnalysisProvider = DEFAULT_ANALYSIS_PROVIDER
): string {
  const selected = parseAnalysisProvider(provider);
  if (selected === "claude") return resolveClaudeModel();
  if (selected === "gemini") return resolveGeminiModel();
  return resolveGrokModel();
}

function modelForProvider(
  provider: AnalysisProvider,
  cfg: Record<string, unknown>,
  analysisMode: "analyze" | "deep" = "analyze"
): string {
  if (provider === "claude") {
    return analysisMode === "deep"
      ? deepMatchModelForProvider("claude")
      : resolveClaudeModel();
  }

  if (analysisMode === "deep") {
    const deepDefault = deepMatchModelForProvider(provider);
    const configured = typeof cfg.model === "string" ? cfg.model.trim() : "";
    if (!configured || isBlockedStep3Model(configured)) return deepDefault;
    const lower = configured.toLowerCase();
    if (provider === "gemini") {
      return lower.includes("gemini")
        ? sanitizeStep3Model(configured, deepDefault)
        : deepDefault;
    }
    return lower.includes("gemini")
      ? deepDefault
      : sanitizeStep3Model(configured, deepDefault);
  }

  const configured = typeof cfg.model === "string" ? cfg.model.trim() : "";
  const fallback = getMatchAnalysisModelName(provider);
  if (!configured) return fallback;
  const lower = configured.toLowerCase();
  if (provider === "gemini") {
    // Catalog may still pin Grok; keep Gemini Quick Match on Step 1 Flash-Lite.
    if (!lower.includes("gemini") || isBlockedStep1Model(configured)) return fallback;
    return sanitizeStep1Model(configured, fallback);
  }
  return lower.includes("gemini") ? fallback : configured;
}

function extractOutputText(response: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function extractGeminiText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }).candidates;
  const parts = candidates?.[0]?.content?.parts ?? [];
  const texts = parts
    .map((part) => (typeof part.text === "string" ? part.text.trim() : ""))
    .filter(Boolean);
  if (!texts.length) return "";
  // Prefer a part that looks like JSON (newer Gemini models may also emit thought text).
  const jsonLike = [...texts].reverse().find((t) => t.startsWith("{") || t.startsWith("["));
  return (jsonLike ?? texts[texts.length - 1] ?? "").trim();
}

export function matchAnalysisErrorCode(error: unknown): MatchAnalysisGenerationError["code"] | "UNKNOWN" {
  if (error instanceof MatchAnalysisGenerationError) return error.code;
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "MatchAnalysisGenerationError" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as MatchAnalysisGenerationError).code;
  }
  return "UNKNOWN";
}

function mapApiError(error: unknown, provider?: AnalysisProvider): MatchAnalysisGenerationError {
  if (error instanceof MatchAnalysisGenerationError) return error;
  const anyErr = error as { status?: number; message?: string; name?: string; code?: string; statusCode?: number };
  const status = anyErr?.status ?? anyErr?.statusCode;
  const code = String(anyErr?.code ?? "");
  const msg = (anyErr?.message || "").toLowerCase();
  const unavailable =
    provider === "claude" ? CLAUDE_UNAVAILABLE_MESSAGE : MATCH_ANALYSIS_ERROR;

  if (status === 401 || status === 403 || code === "invalid_api_key") {
    return new MatchAnalysisGenerationError(
      "AUTH",
      provider === "claude"
        ? "Claude API key is invalid. Check CLAUDE_API_KEY and try again."
        : unavailable
    );
  }
  if (status === 429) {
    return new MatchAnalysisGenerationError("RATE_LIMIT", unavailable);
  }
  if (
    status === 408 ||
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("aborted") ||
    anyErr?.name === "AbortError"
  ) {
    return new MatchAnalysisGenerationError("TIMEOUT", unavailable);
  }
  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econn")
  ) {
    return new MatchAnalysisGenerationError("NETWORK", unavailable);
  }
  // Gemini often returns 400/404 for retired or invalid model ids.
  if (status === 400 || status === 404) {
    return new MatchAnalysisGenerationError("INVALID_RESPONSE", unavailable);
  }
  if (status === 500 || status === 529) {
    return new MatchAnalysisGenerationError("UNKNOWN", unavailable);
  }
  return new MatchAnalysisGenerationError("UNKNOWN", unavailable);
}

async function callGrok(args: {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
  timeoutMs?: number;
}): Promise<string> {
  const openai = getGrokClient();
  const model = args.model || resolveGrokModel();
  const timeoutMs = args.timeoutMs ?? apiTimeoutMs();
  const startedAt = Date.now();
  try {
    const response = await openai.responses.create(
      {
        model,
        temperature: TEMPERATURE,
        max_output_tokens: args.maxTokens,
        reasoning: { effort: grokReasoningEffort(model) },
        input: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      },
      { timeout: timeoutMs }
    );
    const text = extractOutputText(response);
    if (!text) {
      throw new MatchAnalysisGenerationError("EMPTY");
    }
    return text;
  } catch (error) {
    if (error instanceof MatchAnalysisGenerationError) throw error;
    const anyErr = error as { status?: number; message?: string; code?: string; name?: string };
    console.error("[match-analysis] grok request failed", {
      model,
      timeoutMs,
      elapsedMs: Date.now() - startedAt,
      status: anyErr?.status ?? null,
      code: anyErr?.code ?? null,
      name: anyErr?.name ?? null,
      detail: String(anyErr?.message ?? error).slice(0, 500),
    });
    throw mapApiError(error);
  }
}

async function callGemini(args: {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
  timeoutMs?: number;
}): Promise<string> {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    throw new MatchAnalysisGenerationError("MISSING_CONFIG");
  }

  const model = args.model || resolveGeminiModel();
  const timeoutMs = args.timeoutMs ?? apiTimeoutMs();
  const url = `${resolveGeminiBaseUrl()}/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const doFetch = geminiFetchImpl ?? fetch;

  try {
    const response = await doFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: args.system }] },
        contents: [{ role: "user", parts: [{ text: args.user }] }],
        generationConfig: {
          temperature: TEMPERATURE,
          maxOutputTokens: args.maxTokens,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      let detail = `Gemini HTTP ${response.status}`;
      try {
        const errBody: unknown = await response.json();
        const message =
          errBody &&
          typeof errBody === "object" &&
          "error" in errBody &&
          errBody.error &&
          typeof errBody.error === "object" &&
          "message" in errBody.error &&
          typeof errBody.error.message === "string"
            ? errBody.error.message
            : null;
        if (message) detail = message.slice(0, 500);
      } catch {
        /* keep status-only detail */
      }
      console.error("[match-analysis] gemini request failed", {
        model,
        status: response.status,
        detail,
      });
      throw mapApiError({
        status: response.status,
        message: detail,
      });
    }

    const payload: unknown = await response.json().catch(() => null);
    const text = extractGeminiText(payload);
    if (!text) {
      throw new MatchAnalysisGenerationError("EMPTY");
    }
    return text;
  } catch (error) {
    if (error instanceof MatchAnalysisGenerationError) throw error;
    throw mapApiError(error);
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractClaudeToolInput(message: Anthropic.Message): Record<string, unknown> | null {
  for (const block of message.content ?? []) {
    if (block.type === "tool_use" && block.name === CLAUDE_SUBMIT_TOOL) {
      const input = block.input;
      if (input && typeof input === "object" && !Array.isArray(input)) {
        return input as Record<string, unknown>;
      }
    }
  }
  return null;
}

function extractClaudeText(message: Anthropic.Message): string {
  const chunks: string[] = [];
  for (const block of message.content ?? []) {
    if (block.type === "text" && typeof block.text === "string") {
      chunks.push(block.text);
    }
  }
  return chunks.join("\n").trim();
}

async function callClaudeOnce(args: {
  system: string;
  user: string;
  maxTokens: number;
  model: string;
  timeoutMs: number;
}): Promise<Anthropic.Message> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: args.model,
    max_tokens: args.maxTokens,
    temperature: TEMPERATURE,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    tools: [
      {
        name: CLAUDE_SUBMIT_TOOL,
        description:
          "Submit the complete analysis result as a JSON object matching the required schema from the instructions.",
        input_schema: {
          type: "object",
          properties: {},
          additionalProperties: true,
        },
      },
    ],
    tool_choice: { type: "tool", name: CLAUDE_SUBMIT_TOOL },
    stream: false,
  };
  const options = { timeout: args.timeoutMs };
  if (claudeMessagesCreateImpl) return claudeMessagesCreateImpl(params, options);
  // Call create directly. Binding messages.create drops the non-streaming overload.
  return getClaudeClient().messages.create(params, options);
}

async function callClaude(args: {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
  timeoutMs?: number;
  stepName?: string;
  applicationId?: string | null;
}): Promise<string> {
  if (!resolveClaudeApiKey() && !claudeMessagesCreateImpl) {
    throw new MatchAnalysisGenerationError("MISSING_CONFIG", CLAUDE_UNAVAILABLE_MESSAGE);
  }

  const model = args.model || resolveClaudeModel();
  const timeoutMs = args.timeoutMs ?? apiTimeoutMs();
  const stepName = args.stepName ?? "match_analysis";
  const startedAt = Date.now();
  let maxTokens = Math.min(Math.max(1_024, args.maxTokens), claudeMaxTokensCeiling());
  let attempt = 0;
  let raisedForTruncation = false;

  while (attempt < 2) {
    attempt += 1;
    try {
      const message = await callClaudeOnce({
        system: args.system,
        user: args.user,
        maxTokens,
        model,
        timeoutMs,
      });

      const usage = message.usage;
      console.info("[match-analysis] claude usage", {
        model,
        step: stepName,
        applicationId: args.applicationId ?? null,
        latencyMs: Date.now() - startedAt,
        inputTokens: usage?.input_tokens ?? null,
        outputTokens: usage?.output_tokens ?? null,
        stopReason: message.stop_reason ?? null,
        attempt,
      });

      if (message.stop_reason === "max_tokens") {
        if (!raisedForTruncation) {
          raisedForTruncation = true;
          const next = Math.min(maxTokens * 2, claudeMaxTokensCeiling());
          if (next > maxTokens) {
            maxTokens = next;
            continue;
          }
        }
        throw new MatchAnalysisGenerationError(
          "INVALID_RESPONSE",
          "Claude response was truncated. Try again or pick another model."
        );
      }

      const toolInput = extractClaudeToolInput(message);
      if (toolInput) {
        return JSON.stringify(toolInput);
      }

      const text = extractClaudeText(message);
      if (!text) {
        throw new MatchAnalysisGenerationError("EMPTY", CLAUDE_UNAVAILABLE_MESSAGE);
      }
      return text;
    } catch (error) {
      if (error instanceof MatchAnalysisGenerationError) throw error;
      const anyErr = error as {
        status?: number;
        statusCode?: number;
        message?: string;
        code?: string;
        name?: string;
      };
      const status = anyErr?.status ?? anyErr?.statusCode;
      console.error("[match-analysis] claude request failed", {
        model,
        step: stepName,
        applicationId: args.applicationId ?? null,
        timeoutMs,
        elapsedMs: Date.now() - startedAt,
        status: status ?? null,
        code: anyErr?.code ?? null,
        name: anyErr?.name ?? null,
        attempt,
      });

      if (status != null && CLAUDE_RETRYABLE_STATUS.has(status) && attempt < 2) {
        await sleep(400 * attempt);
        continue;
      }
      throw mapApiError(error, "claude");
    }
  }

  throw new MatchAnalysisGenerationError("UNKNOWN", CLAUDE_UNAVAILABLE_MESSAGE);
}

async function callProvider(
  provider: AnalysisProvider,
  args: {
    system: string;
    user: string;
    maxTokens: number;
    model: string;
    timeoutMs?: number;
    stepName?: string;
    applicationId?: string | null;
  }
): Promise<string> {
  if (provider === "grok") {
    return callGrok(args);
  }
  if (provider === "claude") {
    return callClaude(args);
  }
  return callGemini(args);
}

function shouldFallbackDeepProvider(error: unknown): boolean {
  const code = matchAnalysisErrorCode(error);
  return code === "TIMEOUT" || code === "NETWORK" || code === "UNKNOWN" || code === "RATE_LIMIT";
}

/**
 * Deep Match: try the selected provider, then fall back Grok → Gemini on transport failures.
 * Quick Match stays single-provider (volume routing is handled elsewhere).
 */
async function callProviderWithDeepFallback(args: {
  provider: AnalysisProvider;
  analysisMode: "analyze" | "deep";
  system: string;
  user: string;
  maxTokens: number;
  model: string;
  modelConfig: Record<string, unknown>;
}): Promise<{ text: string; provider: AnalysisProvider; model: string }> {
  const canFallbackToGemini = args.analysisMode === "deep" && args.provider === "grok";
  const timeoutMs =
    args.analysisMode === "deep"
      ? canFallbackToGemini
        ? deepGrokAttemptTimeoutMs()
        : deepApiTimeoutMs()
      : apiTimeoutMs();
  try {
    const text = await callProvider(args.provider, {
      system: args.system,
      user: args.user,
      maxTokens: args.maxTokens,
      model: args.model,
      timeoutMs,
    });
    return { text, provider: args.provider, model: args.model };
  } catch (error) {
    if (!canFallbackToGemini || !shouldFallbackDeepProvider(error)) {
      throw error;
    }
    const fallbackModel = modelForProvider("gemini", args.modelConfig, "deep");
    console.warn("[match-analysis] deep grok failed; falling back to gemini", {
      primaryModel: args.model,
      fallbackModel,
      code: matchAnalysisErrorCode(error),
    });
    const text = await callProvider("gemini", {
      system: args.system,
      user: args.user,
      maxTokens: args.maxTokens,
      model: fallbackModel,
      timeoutMs: deepApiTimeoutMs(),
    });
    return { text, provider: "gemini", model: fallbackModel };
  }
}

export type MatchAnalysisGenerationResult = {
  analysis: MatchAnalysisResponse;
  rawText: string;
  rawObject: Record<string, unknown> | null;
  repaired: boolean;
  model: string;
};

/** @deprecated Use MatchAnalysisGenerationResult. */
export type GrokMatchAnalysisResult = MatchAnalysisGenerationResult;

/**
 * Call the selected provider using a published AI prompt catalog version.
 * Quick Match and Deep Match both resolve from `ai_prompt_version` (no hardcoded bodies).
 */
export async function generateMatchAnalysis(
  input: MatchAnalysisUserPromptInput,
  resolved: ResolvedPromptVersion,
  provider: AnalysisProvider = DEFAULT_ANALYSIS_PROVIDER
): Promise<MatchAnalysisGenerationResult> {
  const selectedProvider = parseAnalysisProvider(provider);
  const resumeLen = input.resumeText.length;
  const analysisMode = input.analysisMode === "deep" || resolved.variantKey === "deep" ? "deep" : "analyze";
  const cfg = resolved.modelConfig ?? {};
  const longResumeChars = Number(cfg.long_resume_chars ?? LONG_RESUME_CHARS);
  const maxTokens =
    resumeLen > longResumeChars
      ? Number(cfg.long_resume_max_tokens ?? LONG_RESUME_MAX_TOKENS)
      : Number(cfg.base_max_tokens ?? BASE_MAX_TOKENS);

  const system = resolved.systemPrompt?.trim() ?? "";
  if (!system) {
    throw new MatchAnalysisGenerationError("PROMPT_NOT_CONFIGURED");
  }
  console.info("[match-analysis] prompt", {
    promptVersionId: resolved.promptVersionId,
    contentHash: resolved.contentHash.slice(0, 12),
    variant: resolved.variantKey,
    vertical: resolved.resolvedVerticalKey,
    source: resolved.source,
  });

  const userPrompt = renderPromptTemplate(
    resolved.userPromptTemplate ?? "",
    assembleMatchAnalysisVariables(input),
    { required: ["job_description", "candidate_resume"] }
  );
  const model = modelForProvider(selectedProvider, cfg, analysisMode);

  const primary = await callProviderWithDeepFallback({
    provider: selectedProvider,
    analysisMode,
    system,
    user: userPrompt,
    maxTokens,
    model,
    modelConfig: cfg,
  });
  let activeProvider = primary.provider;
  let activeModel = primary.model;
  const rawText = primary.text;

  let parsedJson = parseJsonObject(rawText);
  let parsed = parseAndValidateMatchAnalysis(rawText);
  let schemaErrors =
    analysisMode === "deep" && parsedJson.ok
      ? validateAgainstJsonSchema(parsedJson.value, resolved.responseSchema)
      : parsed.ok
        ? []
        : parsed.errors;
  let repaired = false;
  let finalRawText = rawText;

  if (!parsed.ok || schemaErrors.length) {
    const repairUser = buildMatchAnalysisRepairPrompt({
      badJson: rawText,
      validationErrors: [...schemaErrors, ...(parsed.ok ? [] : parsed.errors)],
      analysisMode,
      responseSchema: analysisMode === "deep" ? resolved.responseSchema : null,
    });
    const repairedCall = await callProviderWithDeepFallback({
      provider: activeProvider,
      analysisMode,
      system,
      user: repairUser,
      maxTokens,
      model: activeModel,
      modelConfig: cfg,
    });
    activeProvider = repairedCall.provider;
    activeModel = repairedCall.model;
    finalRawText = repairedCall.text;
    parsedJson = parseJsonObject(repairedCall.text);
    parsed = parseAndValidateMatchAnalysis(repairedCall.text);
    schemaErrors =
      analysisMode === "deep" && parsedJson.ok
        ? validateAgainstJsonSchema(parsedJson.value, resolved.responseSchema)
        : parsed.ok
          ? []
          : parsed.errors;
    repaired = true;
    if (!parsed.ok || schemaErrors.length) {
      console.error("[match-analysis] INVALID_RESPONSE after repair", {
        analysisMode,
        provider: activeProvider,
        model: activeModel,
        parseErrors: parsed.ok ? [] : parsed.errors.slice(0, 20),
        schemaErrors: schemaErrors.slice(0, 20),
      });
      throw new MatchAnalysisGenerationError("INVALID_RESPONSE");
    }
  }

  const truncated = truncateStrengthsAndGaps(parsed.data, resumeLen, analysisMode);
  const analysis = analysisMode === "deep" ? rescoreMatchAnalysis(truncated) : truncated;

  return {
    analysis,
    rawText: finalRawText,
    rawObject: parsed.rawObject,
    repaired,
    model: activeModel,
  };
}

export async function generateFollowUpQuestions(
  input: {
    jobTitle?: string | null;
    checklist: ChecklistFollowUpRow[];
    enrichmentNotes?: string | null;
    jobDescription?: string | null;
    resumeText?: string | null;
    quickMatchSummary?: string | null;
  },
  resolved: ResolvedPromptVersion,
  provider: AnalysisProvider = DEFAULT_ANALYSIS_PROVIDER,
  stage: "call_pack" | "follow_up" = "call_pack"
): Promise<{
  questions: AnalysisScreeningQuestion[];
  repaired: boolean;
  model: string;
  rawObject: Record<string, unknown> | null;
  promptVersionId: string;
  contentHash: string;
}> {
  const selectedProvider = parseAnalysisProvider(provider);
  const system = systemPromptForQuestionStage(stage, resolved.systemPrompt ?? "");
  if (!system) {
    throw new MatchAnalysisGenerationError("PROMPT_NOT_CONFIGURED");
  }
  const userPrompt = ensureFollowUpUserPrompt(
    renderPromptTemplate(
      resolved.userPromptTemplate ?? "",
      assembleFollowUpPromptVariables(input),
      { required: ["qualification_checklist"] }
    ),
    stage,
    {
      jobDescription: input.jobDescription,
      resumeText: input.resumeText,
      quickMatchSummary: input.quickMatchSummary,
    }
  );
  const cfg = resolved.modelConfig ?? {};
  const catalogModel =
    typeof cfg.model === "string" && cfg.model.trim() ? sanitizeStep1Model(cfg.model) : "";
  const route = getStep2QuestionRoute();
  const maxTokens = Number(cfg.base_max_tokens ?? BASE_MAX_TOKENS);

  let primaryProvider: AnalysisProvider;
  let primaryModel: string;
  if (selectedProvider === "claude") {
    primaryProvider = "claude";
    primaryModel = resolveClaudeModel();
  } else {
    primaryModel = catalogModel || route.primary.model;
    primaryProvider = catalogModel
      ? primaryModel.toLowerCase().includes("gemini")
        ? "gemini"
        : "grok"
      : route.primary.provider;
  }

  async function runOnce(provider: AnalysisProvider, model: string) {
    const rawText = await callProvider(provider, {
      system,
      user: userPrompt,
      maxTokens,
      model,
      stepName: stage,
    });

    let parsed = parseFollowUpQuestions(rawText);
    let repaired = false;
    if (!parsed.ok) {
      const repairedText = await callProvider(provider, {
        system,
        user: buildFollowUpRepairPrompt({
          badJson: rawText,
          validationErrors: parsed.errors,
        }),
        maxTokens,
        model,
        stepName: `${stage}_repair`,
      });
      parsed = parseFollowUpQuestions(repairedText);
      repaired = true;
    }
    if (parsed.ok && parsed.questions.length === 0) {
      const repairedText = await callProvider(provider, {
        system,
        user: buildFollowUpNonEmptyRepairPrompt({
          userPrompt,
          badJson: JSON.stringify(parsed.rawObject ?? { screening_questions: [] }),
          stage,
        }),
        maxTokens,
        model,
        stepName: stage === "follow_up" ? "follow_up_nonempty" : "call_pack_nonempty",
      });
      const repairedParsed = parseFollowUpQuestions(repairedText);
      repaired = true;
      if (repairedParsed.ok && repairedParsed.questions.length > 0) {
        parsed = repairedParsed;
      }
    }
    if (!parsed.ok) {
      throw new MatchAnalysisGenerationError("INVALID_RESPONSE");
    }
    return {
      questions: parsed.questions,
      repaired,
      model,
      rawObject: parsed.rawObject,
      promptVersionId: resolved.promptVersionId,
      contentHash: resolved.contentHash,
    };
  }

  try {
    return await runOnce(primaryProvider, primaryModel);
  } catch (primaryError) {
    if (selectedProvider === "claude") throw primaryError;
    const sameModel =
      primaryModel.toLowerCase() === route.fallback.model.toLowerCase() &&
      primaryProvider === route.fallback.provider;
    if (sameModel) throw primaryError;
    const code =
      primaryError instanceof MatchAnalysisGenerationError ? primaryError.code : "UNKNOWN";
    if (code === "INVALID_RESPONSE" || code === "PROMPT_NOT_CONFIGURED") {
      throw primaryError;
    }
    try {
      return await runOnce(route.fallback.provider, route.fallback.model);
    } catch {
      throw primaryError;
    }
  }
}

/** @deprecated Use generateMatchAnalysis(..., "grok"). */
export async function generateMatchAnalysisWithGrok(
  input: MatchAnalysisUserPromptInput,
  resolved: ResolvedPromptVersion
): Promise<MatchAnalysisGenerationResult> {
  return generateMatchAnalysis(input, resolved, "grok");
}
