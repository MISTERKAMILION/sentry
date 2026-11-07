import { describe, expect, it } from "vitest";
import type { AIReport, EvidenceSource } from "@/lib/ai/report-schema";
import {
  DuplicateEvidenceReferenceError,
  ForbiddenFieldError,
  InsufficientEvidenceError,
  InvalidEvidenceInputError,
  InvalidEvidenceReferenceError,
  ReportValidationError,
  resolveReportCitations,
  validateEvidenceReport,
} from "@/lib/ai/validate-report";

const sources: EvidenceSource[] = [
  {
    evidence_id: "ev-safety-001",
    title: "Synthetic recall notice",
    publisher: "Synthetic Safety Authority",
    source_url: "https://example.invalid/notices/ev-safety-001",
    summary: "Synthetic fixture only: hypothetical notice for a fictional product.",
    check_type: "safety",
    published_at: "2026-01-15T00:00:00.000Z",
    retrieved_at: "2026-10-25T00:00:00.000Z",
  },
  {
    evidence_id: "ev-legal-001",
    title: "Synthetic legal guidance",
    publisher: "Synthetic Legal Publisher",
    source_url: "https://example.invalid/guidance/ev-legal-001",
    summary: "Synthetic fixture only: hypothetical labeling guidance.",
    check_type: "legal",
    published_at: "2026-02-20T00:00:00.000Z",
    retrieved_at: "2026-10-25T00:00:00.000Z",
  },
];

function validReport(): AIReport {
  return {
    summary: "Synthetic validation fixture.",
    findings: [
      {
        title: "Synthetic labeling concern",
        description: "Synthetic fixture grounded in the supplied record.",
        category: "legal",
        evidence_ids: ["ev-legal-001"],
        uncertainty: "The synthetic record may not reflect current requirements.",
      },
    ],
    limitations: ["This is a fabricated validation fixture."],
    manual_review_questions: ["Would a reviewer confirm the synthetic fixture?"],
  };
}

describe("AI report validation", () => {
  it("accepts a valid report, including an empty findings array", () => {
    expect(validateEvidenceReport(validReport(), sources)).toEqual(validReport());
    expect(
      validateEvidenceReport({ ...validReport(), findings: [] }, sources),
    ).toMatchObject({ findings: [] });
  });

  it("rejects a finding that cites a nonexistent evidence id", () => {
    const report = validReport();
    report.findings[0].evidence_ids = ["ev-missing"];
    expect(() => validateEvidenceReport(report, sources)).toThrow(
      InvalidEvidenceReferenceError,
    );
  });

  it("rejects a finding that cites evidence from another input set", () => {
    const report = validReport();
    report.findings[0].evidence_ids = ["ev-other-scan-001"];
    expect(() => validateEvidenceReport(report, sources)).toThrow(
      InvalidEvidenceReferenceError,
    );
  });

  it("rejects forbidden and unexpected properties", () => {
    expect(() =>
      validateEvidenceReport({ ...validReport(), risk_score: 10 }, sources),
    ).toThrow(ForbiddenFieldError);
    expect(() =>
      validateEvidenceReport({ ...validReport(), scoring_status: "scored" }, sources),
    ).toThrow(ForbiddenFieldError);
    expect(() =>
      validateEvidenceReport({ ...validReport(), riskScore: 10 }, sources),
    ).toThrow(ForbiddenFieldError);
    expect(() =>
      validateEvidenceReport({ ...validReport(), notes: "unexpected" }, sources),
    ).toThrow(ReportValidationError);
  });

  it("rejects forbidden fields nested inside findings and other objects", () => {
    const report = validReport();
    (report.findings[0] as unknown as Record<string, unknown>).severity = "high";
    expect(() => validateEvidenceReport(report, sources)).toThrow(ForbiddenFieldError);

    expect(() =>
      validateEvidenceReport(
        {
          ...validReport(),
          metadata: [{ deeper: { coverage: 0.5 } }],
        },
        sources,
      ),
    ).toThrow(ForbiddenFieldError);
  });

  it("rejects an unexpected nested property via strict schema parsing", () => {
    const report = validReport();
    (report.findings[0] as unknown as Record<string, unknown>).source_url =
      "https://attacker.invalid/fabricated";
    expect(() => validateEvidenceReport(report, sources)).toThrow(
      ReportValidationError,
    );
  });

  it("rejects missing and wrongly typed required fields", () => {
    expect(() =>
      validateEvidenceReport({ ...validReport(), summary: undefined }, sources),
    ).toThrow(ReportValidationError);
    expect(() =>
      validateEvidenceReport({ ...validReport(), findings: "not-an-array" }, sources),
    ).toThrow(ReportValidationError);
  });

  it("rejects malformed JSON and non-object output", () => {
    expect(() => validateEvidenceReport('{"summary":', sources)).toThrow(
      ReportValidationError,
    );
    expect(() => validateEvidenceReport("not json", sources)).toThrow(
      ReportValidationError,
    );
    expect(() => validateEvidenceReport(null, sources)).toThrow(
      ReportValidationError,
    );
  });

  it("rejects duplicate evidence ids inside one finding", () => {
    const report = validReport();
    report.findings[0].evidence_ids = ["ev-legal-001", "ev-legal-001"];
    expect(() => validateEvidenceReport(report, sources)).toThrow(
      DuplicateEvidenceReferenceError,
    );
  });

  it("rejects an empty evidence reference array", () => {
    const report = validReport();
    report.findings[0].evidence_ids = [];
    expect(() => validateEvidenceReport(report, sources)).toThrow(
      ReportValidationError,
    );
  });

  it("rejects duplicate evidence ids in the supplied input", () => {
    expect(() =>
      validateEvidenceReport(validReport(), [sources[0], sources[0]]),
    ).toThrow(InvalidEvidenceInputError);
  });

  it("rejects empty supplied evidence without model output", () => {
    expect(() => validateEvidenceReport(validReport(), [])).toThrow(
      InsufficientEvidenceError,
    );
  });

  it("resolves citation metadata only from trusted evidence records", () => {
    const resolved = resolveReportCitations(validReport(), sources);
    expect(resolved.findings[0].citations).toEqual([
      {
        evidence_id: "ev-legal-001",
        title: "Synthetic legal guidance",
        publisher: "Synthetic Legal Publisher",
        source_url: "https://example.invalid/guidance/ev-legal-001",
        check_type: "legal",
        published_at: "2026-02-20T00:00:00.000Z",
        retrieved_at: "2026-10-25T00:00:00.000Z",
      },
    ]);
  });
});
