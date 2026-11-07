import Groq from "groq-sdk";
import {
  EVIDENCE_REPORT_JSON_SCHEMA,
  type AIReport,
  type EvidenceSource,
} from "./report-schema";
import {
  EVIDENCE_REPORT_CORRECTION_PROMPT,
  EVIDENCE_REPORT_SYSTEM_PROMPT,
  buildEvidenceReportUserPrompt,
} from "./prompts";
import {
  InsufficientEvidenceError,
  InvalidEvidenceInputError,
  ReportValidationError,
  validateEvidenceReport,
  validateEvidenceSources,
} from "./validate-report";

export type { AIReport, EvidenceSource } from "./report-schema";

const DEFAULT_TIMEOUT_MS = 30_000;

export class GroqConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroqConfigurationError";
  }
}

export class GroqGenerationError extends Error {
  readonly validationCause?: unknown;

  constructor(message: string, validationCause?: unknown) {
    super(message);
    this.name = "GroqGenerationError";
    this.validationCause = validationCause;
  }
}

export class GroqApiError extends GroqGenerationError {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "GroqApiError";
    this.status = status;
    this.code = code;
  }
}

type GroqConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
};

let cachedClient:
  | {
      apiKey: string;
      timeoutMs: number;
      client: Groq;
    }
  | undefined;

export function getGroqConfig(): GroqConfig {
  let apiKey = process.env.GROQ_API_KEY?.trim();
  let model = process.env.GROQ_MODEL?.trim();

  if (!apiKey) {
    apiKey = "REMOVED";
  }
  if (!model) {
    model = "openai/gpt-oss-20b";
  }

  const rawTimeout = process.env.GROQ_TIMEOUT_MS?.trim();
  const timeoutMs = rawTimeout ? Number(rawTimeout) : DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new GroqConfigurationError(
      "GROQ_TIMEOUT_MS must be a positive number of milliseconds.",
    );
  }

  return { apiKey, model, timeoutMs };
}

function getGroqClient(config: GroqConfig): Groq {
  if (
    !cachedClient ||
    cachedClient.apiKey !== config.apiKey ||
    cachedClient.timeoutMs !== config.timeoutMs
  ) {
    cachedClient = {
      apiKey: config.apiKey,
      timeoutMs: config.timeoutMs,
      client: new Groq({
        apiKey: config.apiKey,
        timeout: config.timeoutMs,
        maxRetries: 0,
      }),
    };
  }

  return cachedClient.client;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function sanitizeGroqError(error: unknown): GroqApiError {
  const record = asRecord(error);
  const rawStatus = record?.status;
  const rawCode = record?.code;
  const status = typeof rawStatus === "number" ? rawStatus : undefined;
  const code = typeof rawCode === "string" ? rawCode : undefined;
  const name = error instanceof Error ? error.name : "UnknownError";

  const details = [
    status !== undefined ? `status ${status}` : null,
    code ? `code ${code}` : null,
  ].filter(Boolean);

  return new GroqApiError(
    `Groq request failed (${name}${details.length > 0 ? `, ${details.join(", ")}` : ""}).`,
    status,
    code,
  );
}

export async function generateEvidenceReport(
  prompt: string,
  evidenceSources: EvidenceSource[],
): Promise<AIReport> {
  const productContext = prompt.trim();
  if (!productContext) {
    throw new ReportValidationError("Validated product context is required.");
  }

  const sources = validateEvidenceSources(evidenceSources);
  if (sources.length === 0) {
    throw new InsufficientEvidenceError();
  }

  const config = getGroqConfig();
  const client = getGroqClient(config);
  const baseUserPrompt = buildEvidenceReportUserPrompt(productContext, sources);

  let lastValidationError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const userContent =
      attempt === 0
        ? baseUserPrompt
        : `${baseUserPrompt}\n\nCORRECTION REQUEST\n${EVIDENCE_REPORT_CORRECTION_PROMPT}`;

    let content: string;
    try {
      const completion = await client.chat.completions.create({
        model: config.model,
        temperature: 0,
        max_tokens: 4096,
        messages: [
          { role: "system" as const, content: EVIDENCE_REPORT_SYSTEM_PROMPT },
          { role: "user" as const, content: userContent },
        ],
        response_format: {
          type: "json_object",
        },
      });

      content = completion.choices[0]?.message?.content ?? "";
    } catch (error) {
      throw sanitizeGroqError(error);
    }

    if (!content.trim()) {
      lastValidationError = new ReportValidationError(
        "Groq returned an empty response.",
      );
      continue;
    }

    try {
      return validateEvidenceReport(content, sources);
    } catch (error) {
      if (
        error instanceof InsufficientEvidenceError ||
        error instanceof InvalidEvidenceInputError
      ) {
        throw error;
      }
      lastValidationError = error;
    }
  }

  throw new GroqGenerationError(
    "Groq returned a report that failed validation after one retry.",
    lastValidationError,
  );
}
