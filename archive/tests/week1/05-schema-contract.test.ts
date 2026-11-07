import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  COVERAGE_THRESHOLD,
  MVP_CRITICAL,
  MVP_REQUIRED,
  MVP_WEIGHTS,
  RULES_VERSION,
  scoringRules,
} from "@/lib/scoring/rules/2026-01";
import {
  admin,
  createTestUser,
  destroyTestUser,
  fingerprint,
  seedScan,
  type TestUser,
} from "../helpers/supabase";

let user: TestUser;

beforeAll(async () => {
  user = await createTestUser("schema");
});

afterAll(async () => {
  await destroyTestUser(user);
});

describe("Week 1 / schema contract", () => {
  it("accepts all scoring statuses, rejects invalid values, and enforces score presence", async () => {
    const scan = await seedScan(user.id);
    const base = { user_id: user.id, product_id: scan.productId };

    const valid = await admin
      .from("scans")
      .insert([
        { ...base, scoring_status: "scored", compliance_risk_score: 42, coverage: 1 },
        { ...base, scoring_status: "incomplete", compliance_risk_score: null },
        { ...base, scoring_status: "failed", compliance_risk_score: null },
      ])
      .select("id, scoring_status");
    expect(valid.error).toBeNull();
    expect(valid.data).toHaveLength(3);

    const invalid = await admin
      .from("scans")
      .insert({ ...base, scoring_status: "not-a-status" });
    expect(invalid.error).not.toBeNull();

    const missingScore = await admin
      .from("scans")
      .insert({ ...base, scoring_status: "scored", compliance_risk_score: null });
    expect(missingScore.error).not.toBeNull();

    const unexpectedScore = await admin
      .from("scans")
      .insert({ ...base, scoring_status: "incomplete", compliance_risk_score: 50 });
    expect(unexpectedScore.error).not.toBeNull();
  });

  it("denies authenticated direct writes to scans and scan_jobs", async () => {
    const scan = await seedScan(user.id);

    const forgedInsert = await user.client.from("scans").insert({
      user_id: user.id,
      product_id: scan.productId,
      scoring_status: "scored",
      compliance_risk_score: 0,
    });
    expect(forgedInsert.error).not.toBeNull();
    expect(forgedInsert.error?.message).toMatch(/permission denied/i);

    const forgedUpdate = await user.client
      .from("scans")
      .update({ scoring_status: "scored", compliance_risk_score: 0 })
      .eq("id", scan.scanId)
      .select("id");
    expect(forgedUpdate.error).not.toBeNull();
    expect(forgedUpdate.error?.message).toMatch(/permission denied/i);

    const persistedScan = await admin
      .from("scans")
      .select("scoring_status, compliance_risk_score")
      .eq("id", scan.scanId)
      .single();
    expect(persistedScan.data).toMatchObject({
      scoring_status: null,
      compliance_risk_score: null,
    });

    const forgedJobInsert = await user.client.from("scan_jobs").insert({
      scan_id: scan.scanId,
      user_id: user.id,
      check_type: "ip",
    });
    expect(forgedJobInsert.error).not.toBeNull();
    expect(forgedJobInsert.error?.message).toMatch(/permission denied/i);

    const { data: job, error: jobError } = await admin
      .from("scan_jobs")
      .insert({ scan_id: scan.scanId, user_id: user.id, check_type: "ip" })
      .select("id")
      .single();
    expect(jobError).toBeNull();
    if (!job) throw new Error("Test job was not created");

    const forgedJobUpdate = await user.client
      .from("scan_jobs")
      .update({ status: "completed" })
      .eq("id", job.id)
      .select("id");
    expect(forgedJobUpdate.error).not.toBeNull();
    expect(forgedJobUpdate.error?.message).toMatch(/permission denied/i);

    const forgedJobDelete = await user.client
      .from("scan_jobs")
      .delete()
      .eq("id", job.id)
      .select("id");
    expect(forgedJobDelete.error).not.toBeNull();
    expect(forgedJobDelete.error?.message).toMatch(/permission denied/i);

    const persistedJob = await admin
      .from("scan_jobs")
      .select("status")
      .eq("id", job.id)
      .single();
    expect(persistedJob.data?.status).toBe("queued");
  });

  it("persists null for unknown risk and evidence values without coercing them to zero or false", async () => {
    const scan = await seedScan(user.id);

    const nullableScan = await admin
      .from("scans")
      .insert({
        user_id: user.id,
        product_id: scan.productId,
        scoring_status: null,
        compliance_risk_score: null,
        coverage: null,
      })
      .select("scoring_status, compliance_risk_score, coverage")
      .single();
    expect(nullableScan.error).toBeNull();
    expect(nullableScan.data).toMatchObject({
      scoring_status: null,
      compliance_risk_score: null,
      coverage: null,
    });

    const nullableCheck = await user.client
      .from("scan_checks")
      .insert({
        scan_id: scan.scanId,
        check_type: "ip",
        status: "unavailable",
        risk_score: null,
        missing_weight: 0.3,
      })
      .select("risk_score, missing_weight")
      .single();
    expect(nullableCheck.error).toBeNull();
    expect(nullableCheck.data?.risk_score).toBeNull();

    const nullableEvidence = await user.client
      .from("evidence_sources")
      .insert({
        scan_id: scan.scanId,
        check_type: "legal",
        title: "Unknown source metadata",
        source_url: "https://example.com/unknown-date",
        matches_official_source: null,
        published_at: null,
        fingerprint: fingerprint("nullable-evidence"),
      })
      .select("matches_official_source, published_at")
      .single();
    expect(nullableEvidence.error).toBeNull();
    expect(nullableEvidence.data).toMatchObject({
      matches_official_source: null,
      published_at: null,
    });
  });

  it("rejects invalid check and job enum values", async () => {
    const scan = await seedScan(user.id);

    const invalidCheck = await user.client.from("scan_checks").insert({
      scan_id: scan.scanId,
      check_type: "ip",
      status: "done",
    });
    expect(invalidCheck.error).not.toBeNull();

    const invalidJob = await admin.from("scan_jobs").insert({
      scan_id: scan.scanId,
      user_id: user.id,
      check_type: "legal",
      status: "claimed",
    });
    expect(invalidJob.error).not.toBeNull();
  });

  it("writes the scoring configuration version through the server path and reads it back", async () => {
    const scan = await seedScan(user.id);

    const readable = await user.client
      .from("scans")
      .select("scoring_config_version")
      .eq("id", scan.scanId)
      .single();
    expect(readable.error).toBeNull();
    expect(readable.data?.scoring_config_version).toBe(RULES_VERSION);

    const forged = await user.client
      .from("scans")
      .update({ scoring_config_version: "forged-version" })
      .eq("id", scan.scanId)
      .select("scoring_config_version");
    expect(forged.error).not.toBeNull();
    expect(forged.error?.message).toMatch(/permission denied/i);

    const persisted = await admin
      .from("scans")
      .select("scoring_config_version")
      .eq("id", scan.scanId)
      .single();
    expect(persisted.data?.scoring_config_version).toBe(RULES_VERSION);
  });

  it("keeps the versioned MVP configuration complete and internally consistent", () => {
    expect(RULES_VERSION).toBe("2026-01");
    expect(Object.values(MVP_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
    expect(MVP_REQUIRED).toEqual(["legal", "ip", "safety", "recalls"]);
    expect(MVP_CRITICAL).toEqual(MVP_REQUIRED);
    expect(COVERAGE_THRESHOLD).toBe(0.6);
    expect(scoringRules.coverage.partialAssessedFraction).toBe(0.5);
    expect(scoringRules.coverage.partialMissingFraction).toBe(0.5);
    expect(scoringRules.mvp.strictCriticalRuleOverridesCoverageThreshold).toBe(true);
    expect(scoringRules.riskBands[0]).toMatchObject({ min: 0, max: 19 });
    expect(scoringRules.riskBands.at(-1)).toMatchObject({ min: 80, max: 100 });
  });

  it("prevents cited evidence from being deleted", async () => {
    const scan = await seedScan(user.id);
    const result = await user.client
      .from("evidence_sources")
      .delete()
      .eq("id", scan.evidenceId);

    expect(result.error).not.toBeNull();
    const persisted = await admin
      .from("evidence_sources")
      .select("id")
      .eq("id", scan.evidenceId)
      .single();
    expect(persisted.error).toBeNull();
  });

  it("rejects a finding that cites evidence from another scan", async () => {
    const first = await seedScan(user.id);
    const second = await seedScan(user.id);
    const result = await user.client.from("risk_findings").insert({
      scan_id: first.scanId,
      check_type: "legal",
      title: "Cross-scan citation",
      summary: "This must not be stored.",
      severity: "high",
      evidence_ids: [second.evidenceId],
    });

    expect(result.error).not.toBeNull();
  });
});
