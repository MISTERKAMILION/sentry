import {
  ForbiddenFieldError,
  InsufficientEvidenceError,
  InvalidEvidenceInputError,
  InvalidEvidenceReferenceError,
  resolveReportCitations,
  validateEvidenceReport,
} from "../lib/ai/validate-report";
import type { AIReport, EvidenceSource } from "../lib/ai/report-schema";

const sources: EvidenceSource[] = [
  {
    evidence_id: "ev-safety-001",
    title: "Synthetic recall notice",
    publisher: "Synthetic Safety Authority",
    source_url: "https://example.invalid/notices/ev-safety-001",
    summary:
      "Synthetic fixture only: a hypothetical notice concerning a fictional product.",
    check_type: "safety",
    published_at: "2026-01-15T00:00:00.000Z",
    retrieved_at: "2026-10-25T00:00:00.000Z",
  },
  {
    evidence_id: "ev-legal-001",
    title: "Synthetic legal guidance",
    publisher: "Synthetic Legal Publisher",
    source_url: "https://example.invalid/guidance/ev-legal-001",
    summary:
      "Synthetic fixture only: hypothetical guidance concerning labeling for a fictional product.",
    check_type: "legal",
    published_at: "2026-02-20T00:00:00.000Z",
    retrieved_at: "2026-10-25T00:00:00.000Z",
  },
];

function validReport(overrides: Partial<AIReport> = {}): AIReport {
  return {
    summary: "Synthetic validation fixture.",
    findings: [
      {
        title: "Synthetic labeling concern",
        description: "Synthetic fixture description grounded in the supplied record.",
        category: "legal",
        evidence_ids: ["ev-legal-001"],
        uncertainty: "The synthetic record may not reflect current requirements.",
      },
    ],
    limitations: ["This is a fabricated validation fixture."],
    manual_review_questions: ["Would a reviewer confirm the synthetic fixture?"],
    ...overrides,
  };
}

let failures = 0;

function record(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    const detail =
      error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
    console.error(`FAIL ${name} — ${detail}`);
  }
}

function expectReject(
  name: string,
  fn: () => void,
  predicate: (error: unknown) => boolean,
): void {
  record(name, () => {
    try {
      fn();
    } catch (error) {
      if (predicate(error)) return;
      const detail =
        error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error";
      throw new Error(`Expected a different rejection, received ${detail}`);
    }
    throw new Error("Expected rejection, but validation succeeded.");
  });
}

record("accepts a valid report with no findings", () => {
  validateEvidenceReport(validReport({ findings: [] }), sources);
});

record("accepts a valid report with citations", () => {
  validateEvidenceReport(validReport(), sources);
});

expectReject(
  "rejects a nonexistent evidence id",
  () => {
    const report = validReport();
    report.findings[0].evidence_ids = ["ev-missing"];
    validateEvidenceReport(report, sources);
  },
  (error) => error instanceof InvalidEvidenceReferenceError,
);

expectReject(
  "rejects an evidence id from another input set",
  () => {
    validateEvidenceReport(
      validReport({
        findings: [
          {
            title: "Cross-set citation",
            description: "Cites evidence that was not supplied.",
            category: "safety",
            evidence_ids: ["ev-other-scan-001"],
            uncertainty: "Unknown.",
          },
        ],
      }),
      sources,
    );
  },
  (error) => error instanceof InvalidEvidenceReferenceError,
);

expectReject(
  "rejects a top-level risk_score field",
  () => validateEvidenceReport({ ...validReport(), risk_score: 10 }, sources),
  (error) => error instanceof ForbiddenFieldError,
);

expectReject(
  "rejects a nested severity field",
  () => {
    const report = validReport();
    (report.findings[0] as unknown as Record<string, unknown>).severity = "high";
    validateEvidenceReport(report, sources);
  },
  (error) => error instanceof ForbiddenFieldError,
);

expectReject(
  "rejects a scoring_status field",
  () => validateEvidenceReport({ ...validReport(), scoring_status: "scored" }, sources),
  (error) => error instanceof ForbiddenFieldError,
);

expectReject(
  "rejects an unexpected top-level property",
  () => validateEvidenceReport({ ...validReport(), notes: "unexpected" }, sources),
  (error) =>
    error instanceof Error && error.name === "ReportValidationError",
);

expectReject(
  "rejects malformed JSON",
  () => validateEvidenceReport('{"summary":', sources),
  (error) =>
    error instanceof Error && error.name === "ReportValidationError",
);

expectReject(
  "rejects duplicate evidence ids inside one finding",
  () => {
    const report = validReport();
    report.findings[0].evidence_ids = ["ev-legal-001", "ev-legal-001"];
    validateEvidenceReport(report, sources);
  },
  (error) =>
    error instanceof Error && error.name === "DuplicateEvidenceReferenceError",
);

expectReject(
  "rejects an empty evidence reference array",
  () => {
    const report = validReport();
    report.findings[0].evidence_ids = [];
    validateEvidenceReport(report, sources);
  },
  (error) =>
    error instanceof Error && error.name === "ReportValidationError",
);

expectReject(
  "rejects deeply nested forbidden fields",
  () =>
    validateEvidenceReport(
      {
        ...validReport(),
        metadata: [{ nested: { compliance_risk_score: 0 } }],
      },
      sources,
    ),
  (error) => error instanceof ForbiddenFieldError,
);

expectReject(
  "rejects duplicate evidence ids in the supplied input",
  () => validateEvidenceReport(validReport(), [sources[0], sources[0]]),
  (error) => error instanceof InvalidEvidenceInputError,
);

expectReject(
  "rejects empty supplied evidence",
  () => validateEvidenceReport(validReport(), []),
  (error) => error instanceof InsufficientEvidenceError,
);

record("resolves citations from trusted evidence records", () => {
  const resolved = resolveReportCitations(validReport(), sources);
  const citation = resolved.findings[0].citations[0];
  if (citation.source_url !== sources[1].source_url) {
    throw new Error("Resolved citation did not come from the trusted source record.");
  }
});

expectReject(
  "rejects a model-generated source_url property",
  () => {
    const report = validReport();
    (report.findings[0] as unknown as Record<string, unknown>).source_url =
      "https://attacker.invalid/fabricated";
    validateEvidenceReport(report, sources);
  },
  (error) =>
    error instanceof Error && error.name === "ReportValidationError",
);

expectReject(
  "rejects camelCase riskScore as a forbidden field",
  () => validateEvidenceReport({ ...validReport(), riskScore: 1 }, sources),
  (error) => error instanceof ForbiddenFieldError,
);

if (failures > 0) {
  console.error(`Offline validation failed: ${failures} check(s) did not pass.`);
  process.exitCode = 1;
} else {
  console.log("Offline Groq report validation passed.");
}
