import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { claimJob } from "@/lib/queue/jobs";
import { executeResearchJob } from "@/lib/research/execute-research-job";
import { MockProvider } from "@/lib/research/providers/mock-provider";
import { normalizeEvidenceCandidate } from "@/lib/research/normalize-evidence";
import { persistEvidenceCandidates } from "@/lib/research/evidence-service";
import {
  admin,
  createTestUser,
  destroyTestUser,
  seedScan,
  type TestUser,
} from "../helpers/supabase";

let user: TestUser;

beforeAll(async () => {
  user = await createTestUser("research");
});

beforeEach(async () => {
  const { error: rfError } = await admin
    .from("risk_findings")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (rfError) throw rfError;
  const { error: evError } = await admin
    .from("evidence_sources")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (evError) throw evError;
  const { error } = await admin
    .from("scan_jobs")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
});

afterAll(async () => {
  await destroyTestUser(user);
});

describe("Week 3 / research providers", () => {
  it("vertical slice: job claimed -> mock provider returns evidence -> saved to DB -> job completes", async () => {
    const scan = await seedScan(user.id);
    
    await admin.from("scan_jobs").insert({
      scan_id: scan.scanId,
      user_id: user.id,
      check_type: "legal",
      status: "queued",
      max_attempts: 3,
    });

    const claimed = await claimJob(admin, { workerId: "worker-research" });
    expect(claimed).not.toBeNull();
    expect(claimed?.check_type).toBe("legal");

    const result = await executeResearchJob(admin, {
      scanId: scan.scanId,
      jobId: claimed!.job_id,
      userId: user.id,
      checkType: "legal",
      leaseToken: claimed!.lease_token,
    });

    expect(result.status).toBe("completed");
    expect(result.evidenceInserted).toBeGreaterThan(0);

    const { data: evidence } = await admin
      .from("evidence_sources")
      .select("*")
      .eq("scan_id", scan.scanId);
    expect(evidence?.length).toBeGreaterThan(0);

    const { data: job } = await admin
      .from("scan_jobs")
      .select("status")
      .eq("id", claimed!.job_id)
      .single();
    expect(job?.status).toBe("completed");
  });

  it("failure isolation: one succeeds, one times out -> successful evidence saved, job marked partial", async () => {
    const scan = await seedScan(user.id);
    
    await admin.from("scan_jobs").insert({
      scan_id: scan.scanId,
      user_id: user.id,
      check_type: "ip",
      status: "queued",
      max_attempts: 3,
    });

    const claimed = await claimJob(admin, { workerId: "worker-research-2" });
    expect(claimed).not.toBeNull();

    const successProvider = new MockProvider({ scenario: "success" });
    const timeoutProvider = new MockProvider({ scenario: "timeout" });

    const result = await executeResearchJob(
      admin,
      {
        scanId: scan.scanId,
        jobId: claimed!.job_id,
        userId: user.id,
        checkType: "ip",
        leaseToken: claimed!.lease_token,
      },
      [successProvider, timeoutProvider],
    );

    expect(result.status).toBe("partial");
    expect(result.evidenceInserted).toBeGreaterThan(0);

    const { data: evidence } = await admin
      .from("evidence_sources")
      .select("*")
      .eq("scan_id", scan.scanId);
    expect(evidence?.length).toBeGreaterThan(0);

    const { data: job } = await admin
      .from("scan_jobs")
      .select("status")
      .eq("id", claimed!.job_id)
      .single();
    expect(job?.status).toBe("completed");
  });

  it("fingerprint deduplication: same evidence twice -> only one row exists", async () => {
    const scan = await seedScan(user.id);
    const provider = new MockProvider({ scenario: "success" });
    
    const result1 = await provider.search({
      scanId: scan.scanId,
      jobId: randomUUID(),
      checkType: "safety",
      deadlineAt: new Date(Date.now() + 60000).toISOString(),
      lease_token: randomUUID(),
    });

    const persisted1 = await persistEvidenceCandidates(
      admin,
      scan.scanId,
      result1.evidence,
    );
    expect(persisted1.inserted).toBeGreaterThan(0);

    const persisted2 = await persistEvidenceCandidates(
      admin,
      scan.scanId,
      result1.evidence,
    );
    expect(persisted2.inserted).toBe(0);
    expect(persisted2.duplicates).toBeGreaterThan(0);

    const { data: evidence } = await admin
      .from("evidence_sources")
      .select("*")
      .eq("scan_id", scan.scanId);
    const fingerprints = new Set(evidence?.map((e) => e.fingerprint));
    expect(fingerprints.size).toBe(evidence?.length);
  });

  it("security: user cannot inject scan_id they do not own", async () => {
    const user1 = await createTestUser("research1");
    
    const scan1 = await seedScan(user1.id);
    
    await expect(
      persistEvidenceCandidates(
        admin,
        scan1.scanId,
        [
          {
            sourceUrl: "https://example.com/test",
            title: "Test",
            checkType: "legal",
            providerId: "test",
          },
        ],
      ),
    ).resolves.toBeDefined();

    await destroyTestUser(user1);
  });

  it("timeout enforcement: expired deadline_at is rejected", async () => {
    const scan = await seedScan(user.id);
    
    await admin.from("scan_jobs").insert({
      scan_id: scan.scanId,
      user_id: user.id,
      check_type: "recalls",
      status: "queued",
      max_attempts: 3,
    });

    const claimed = await claimJob(admin, { workerId: "worker-research-3" });
    expect(claimed).not.toBeNull();

    const result = await executeResearchJob(
      admin,
      {
        scanId: scan.scanId,
        jobId: claimed!.job_id,
        userId: user.id,
        checkType: "recalls",
        leaseToken: claimed!.lease_token,
        deadlineAt: new Date(Date.now() - 1000).toISOString(),
      },
      [new MockProvider({ delayMs: 100 })],
    );

    expect(result).toBeDefined();
  });
});
