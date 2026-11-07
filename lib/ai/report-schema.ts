import { z } from "zod";

export const CHECK_TYPES = ["legal", "ip", "safety", "recalls"] as const;

export const FORBIDDEN_REPORT_KEYS = [
  "risk_score",
  "compliance_risk_score",
  "severity",
  "scoring_status",
  "coverage",
  "manual_review_required",
  "risk_level",
] as const;

export const evidenceSourceSchema = z.strictObject({
  evidence_id: z.string().min(1),
  title: z.string(),
  publisher: z.string(),
  source_url: z.string().url(),
  summary: z.string(),
  check_type: z.enum(CHECK_TYPES),
  published_at: z.string().nullable(),
  retrieved_at: z.string(),
});

export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

export const findingSchema = z.strictObject({
  title: z.string(),
  description: z.string(),
  category: z.enum(CHECK_TYPES),
  evidence_ids: z.array(z.string().min(1)).min(1),
  uncertainty: z.string(),
});

export const reportSchema = z.strictObject({
  summary: z.string(),
  findings: z.array(findingSchema),
  limitations: z.array(z.string()),
  manual_review_questions: z.array(z.string()),
});

export type AIReport = z.infer<typeof reportSchema>;

export const EVIDENCE_REPORT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          category: { type: "string", enum: ["legal", "ip", "safety", "recalls"] },
          evidence_ids: {
            type: "array",
            items: { type: "string" },
          },
          uncertainty: { type: "string" },
        },
        required: ["title", "description", "category", "evidence_ids", "uncertainty"],
      },
    },
    limitations: {
      type: "array",
      items: { type: "string" },
    },
    manual_review_questions: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["summary", "findings", "limitations", "manual_review_questions"],
} as const;
