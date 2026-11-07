import { z } from "zod";
import {
  FORBIDDEN_REPORT_KEYS,
  evidenceSourceSchema,
  reportSchema,
  type AIReport,
  type EvidenceSource,
} from "./report-schema";

export class ReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportValidationError";
  }
}

export class ForbiddenFieldError extends ReportValidationError {
  readonly fieldPath: string;

  constructor(fieldPath: string) {
    super(`Forbidden field present in model output: ${fieldPath}`);
    this.name = "ForbiddenFieldError";
    this.fieldPath = fieldPath;
  }
}

export class InvalidEvidenceReferenceError extends ReportValidationError {
  readonly evidenceId: string;

  constructor(evidenceId: string) {
    super(`Model cited evidence that was not supplied: ${evidenceId}`);
    this.name = "InvalidEvidenceReferenceError";
    this.evidenceId = evidenceId;
  }
}

export class DuplicateEvidenceReferenceError extends ReportValidationError {
  readonly evidenceId: string;

  constructor(path: string, evidenceId: string) {
    super(`Duplicate evidence reference at ${path}: ${evidenceId}`);
    this.name = "DuplicateEvidenceReferenceError";
    this.evidenceId = evidenceId;
  }
}

export class InvalidEvidenceInputError extends ReportValidationError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEvidenceInputError";
  }
}

export class InsufficientEvidenceError extends ReportValidationError {
  constructor() {
    super("No eligible evidence sources were supplied.");
    this.name = "InsufficientEvidenceError";
  }
}

const exactForbiddenKeys = new Set<string>(FORBIDDEN_REPORT_KEYS);
const compactForbiddenKeys = new Set<string>(
  FORBIDDEN_REPORT_KEYS.map((key) => key.replace(/_/g, "")),
);

function isForbiddenKey(key: string): boolean {
  const lower = key.toLowerCase();
  const compact = lower.replace(/[^a-z0-9]/g, "");
  return exactForbiddenKeys.has(lower) || compactForbiddenKeys.has(compact);
}

export function assertNoForbiddenFields(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenFields(item, `${path}[${index}]`));
    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isForbiddenKey(key)) {
      throw new ForbiddenFieldError(`${path}.${key}`);
    }
    assertNoForbiddenFields(child, `${path}.${key}`);
  }
}

export function validateEvidenceSources(sources: unknown): EvidenceSource[] {
  const parsed = z.array(evidenceSourceSchema).safeParse(sources);
  if (!parsed.success) {
    throw new InvalidEvidenceInputError(
      `Evidence sources failed validation: ${formatIssues(parsed.error)}`,
    );
  }

  const seen = new Set<string>();
  for (const source of parsed.data) {
    if (seen.has(source.evidence_id)) {
      throw new InvalidEvidenceInputError(
        `Duplicate evidence_id in supplied evidence: ${source.evidence_id}`,
      );
    }
    seen.add(source.evidence_id);
  }

  if (parsed.data.length === 0) {
    throw new InsufficientEvidenceError();
  }

  return parsed.data;
}

function formatIssues(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`)
    .join("; ");
}

function parseRawOutput(rawOutput: unknown): unknown {
  if (typeof rawOutput === "string") {
    try {
      return JSON.parse(rawOutput) as unknown;
    } catch {
      throw new ReportValidationError("Model output was not valid JSON.");
    }
  }

  if (rawOutput === null || typeof rawOutput !== "object") {
    throw new ReportValidationError("Model output must be a JSON object.");
  }

  return rawOutput;
}

export function validateEvidenceReport(
  rawOutput: unknown,
  evidenceSources: EvidenceSource[],
): AIReport {
  const sources = validateEvidenceSources(evidenceSources);
  const parsedRaw = parseRawOutput(rawOutput);

  assertNoForbiddenFields(parsedRaw);

  const parsed = reportSchema.safeParse(parsedRaw);
  if (!parsed.success) {
    throw new ReportValidationError(
      `Model report failed schema validation: ${formatIssues(parsed.error)}`,
    );
  }

  const allowedEvidenceIds = new Set(sources.map((source) => source.evidence_id));

  for (const [findingIndex, finding] of parsed.data.findings.entries()) {
    const seen = new Set<string>();
    for (const evidenceId of finding.evidence_ids) {
      if (seen.has(evidenceId)) {
        throw new DuplicateEvidenceReferenceError(
          `findings[${findingIndex}].evidence_ids`,
          evidenceId,
        );
      }
      seen.add(evidenceId);

      if (!allowedEvidenceIds.has(evidenceId)) {
        throw new InvalidEvidenceReferenceError(evidenceId);
      }
    }
  }

  return parsed.data;
}

export type TrustedEvidenceCitation = Pick<
  EvidenceSource,
  | "evidence_id"
  | "title"
  | "publisher"
  | "source_url"
  | "check_type"
  | "published_at"
  | "retrieved_at"
>;

export type ResolvedAIReport = Omit<AIReport, "findings"> & {
  findings: Array<
    AIReport["findings"][number] & {
      citations: TrustedEvidenceCitation[];
    }
  >;
};

export function resolveReportCitations(
  report: AIReport,
  evidenceSources: EvidenceSource[],
): ResolvedAIReport {
  const sources = validateEvidenceSources(evidenceSources);
  const validated = validateEvidenceReport(report, sources);
  const byId = new Map(sources.map((source) => [source.evidence_id, source]));

  return {
    ...validated,
    findings: validated.findings.map((finding) => ({
      ...finding,
      citations: finding.evidence_ids.map((evidenceId) => {
        const source = byId.get(evidenceId);
        if (!source) {
          throw new InvalidEvidenceReferenceError(evidenceId);
        }
        return {
          evidence_id: source.evidence_id,
          title: source.title,
          publisher: source.publisher,
          source_url: source.source_url,
          check_type: source.check_type,
          published_at: source.published_at,
          retrieved_at: source.retrieved_at,
        };
      }),
    })),
  };
}
