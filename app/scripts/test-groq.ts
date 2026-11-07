import { generateEvidenceReport } from "../lib/ai/groq-client";
import {
  resolveReportCitations,
  validateEvidenceReport,
} from "../lib/ai/validate-report";
import type { EvidenceSource } from "../lib/ai/report-schema";

const evidence: EvidenceSource[] = [
  {
    evidence_id: "ev-safety-001",
    title: "Synthetic recall notice",
    publisher: "Synthetic Safety Authority",
    source_url: "https://example.invalid/notices/ev-safety-001",
    summary:
      "Synthetic fixture only: a hypothetical notice concerning a fictional product. It states that a fictional seller should verify labeling and contact the fictional authority if affected.",
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
      "Synthetic fixture only: hypothetical guidance concerning labeling for a fictional product. It states that sellers should verify applicable labeling requirements before offering the fictional product.",
    check_type: "legal",
    published_at: "2026-02-20T00:00:00.000Z",
    retrieved_at: "2026-10-25T00:00:00.000Z",
  },
];

const productContext = [
  "Synthetic product for integration testing only: a fictional LED dog collar.",
  "Marketplace: example.invalid. Target country: US.",
  "This is fabricated test data, not real-world compliance research.",
].join(" ");

async function main(): Promise<void> {
  const report = await generateEvidenceReport(productContext, evidence);
  console.log("Live Groq request: succeeded");

  const validated = validateEvidenceReport(report, evidence);
  console.log("Schema validation: passed");

  const resolved = resolveReportCitations(validated, evidence);
  console.log("Citation validation: passed");

  const citedIds = new Set(
    resolved.findings.flatMap((finding) =>
      finding.citations.map((citation) => citation.evidence_id),
    ),
  );

  console.log("Sanitized summary:");
  console.log(`- findings: ${resolved.findings.length}`);
  console.log(`- limitations: ${resolved.limitations.length}`);
  console.log(`- manual review questions: ${resolved.manual_review_questions.length}`);
  console.log(`- cited evidence ids: ${citedIds.size > 0 ? [...citedIds].join(", ") : "none"}`);
}

main().catch((error: unknown) => {
  console.error("Groq live test: FAILED");
  if (error instanceof Error) {
    console.error(`${error.name}: ${error.message}`);
  } else {
    console.error("Unknown error.");
  }
  process.exitCode = 1;
});
