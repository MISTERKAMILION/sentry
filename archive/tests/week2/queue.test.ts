import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  claimJob,
  completeJob,
  failJob,
  heartbeatJob,
  recoverExpiredLeases,
  StaleLeaseError,
  type ClaimedJob,
  type JobCheckType,
} from "@/lib/queue/jobs";
import {
  admin,
  createTestUser,
  destroyTestUser,
  seedScan,
  type SeededScan,
  type TestUser,
} from "../helpers/supabase";

let user: TestUser;

beforeAll(async () => {
  user = await createTestUser("queue");
});

beforeEach(async () => {
  const { error } = await admin
    .from("scan_jobs")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
});

afterAll(async () => {
  await destroyTestUser(user);
});

async function seedJobs(
  scan: SeededScan,
  checkTypes: JobCheckType[],
  options: { maxAttempts?: number } = {},
): Promise<Array<{ id: string; checkType: JobCheckType }>> {
  const { data, error } = await admin
    .from("scan_jobs")
    .insert(
      checkTypes.map((checkType) => ({
        scan_id: scan.scanId,
        user_id: user.id,
        check_type: checkType,
        max_attempts: options.maxAttempts ?? 3,
      })),
    )
    .select("id, check_type");
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    checkType: row.check_type as JobCheckType,
  }));
}

async function forceExpiredLease(jobId: string): Promise<void> {
  const { error } = await admin
    .from("scan_jobs")
    .update({
      locked_at: new Date(Date.now() - 20_000).toISOString(),
      heartbeat_at: new Date(Date.now() - 10_000).toISOString(),
      lease_expires_at: new Date(Date.now() - 1_000).toISOString(),
    })
    .eq("id", jobId);
  if (error) throw error;
}

async function makeClaimable(jobId: string): Promise<void> {
  const { error } = await admin
    .from("scan_jobs")
    .update({ next_attempt_at: new Date(Date.now() - 1_000).toISOString() })
    .eq("id", jobId);
  if (error) throw error;
}

describe("Week 2 / durable queue", () => {
  it("claims exactly one due job and increments its attempt count", async () => {
    const scan = await seedScan(user.id);
    const [job] = await seedJobs(scan, ["legal"]);

    const claimed = await claimJob(admin, {
      workerId: "worker-a",
      leaseSeconds: 60,
    });
    if (!claimed) throw new Error("Expected a claimed job");

    expect(claimed).toMatchObject({
      job_id: job.id,
      scan_id: scan.scanId,
      user_id: user.id,
      check_type: "legal",
      attempts: 1,
      max_attempts: 3,
      lease_expires_at: expect.any(String),
      created_at: expect.any(String),
    });
    expect(claimed.lease_token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const persisted = await admin
      .from("scan_jobs")
      .select(
        "status, attempts, locked_by, lease_token, next_attempt_at, completed_at",
      )
      .eq("id", job.id)
      .single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toMatchObject({
      status: "running",
      attempts: 1,
      locked_by: "worker-a",
      next_attempt_at: null,
      completed_at: null,
    });
    expect(persisted.data?.lease_token).toBe(claimed.lease_token);
  });

  it("never hands the same job to two concurrent workers", async () => {
    const scan = await seedScan(user.id);
    await seedJobs(scan, ["legal", "ip"]);

    const results = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        claimJob(admin, { workerId: `worker-${index}` }),
      ),
    );
    const claimed = results.filter(
      (result): result is ClaimedJob => result !== null,
    );

    expect(claimed).toHaveLength(2);
    expect(new Set(claimed.map((job) => job.job_id)).size).toBe(2);
    expect(new Set(claimed.map((job) => job.check_type))).toEqual(
      new Set(["legal", "ip"]),
    );
  });

  it("extends a live lease and rejects a stale token", async () => {
    const scan = await seedScan(user.id);
    const [job] = await seedJobs(scan, ["safety"]);

    const claimed = await claimJob(admin, {
      workerId: "worker-heartbeat",
      leaseSeconds: 60,
    });
    if (!claimed) throw new Error("Expected a claimed job");

    const firstExpiry = Date.parse(claimed.lease_expires_at);
    const heartbeat = await heartbeatJob(admin, {
      jobId: claimed.job_id,
      leaseToken: claimed.lease_token,
      leaseSeconds: 120,
    });
    if (!heartbeat) throw new Error("Expected a heartbeat result");

    expect(Date.parse(heartbeat.lease_expires_at)).toBeGreaterThan(firstExpiry);

    const stale = await heartbeatJob(admin, {
      jobId: claimed.job_id,
      leaseToken: randomUUID(),
      leaseSeconds: 60,
    });
    expect(stale).toBeNull();

    const persisted = await admin
      .from("scan_jobs")
      .select("lease_token")
      .eq("id", job.id)
      .single();
    expect(persisted.data?.lease_token).toBe(claimed.lease_token);
  });

  it("fences expired workers and recovers the lease", async () => {
    const scan = await seedScan(user.id);
    const [job] = await seedJobs(scan, ["legal"], { maxAttempts: 1 });

    const claimed = await claimJob(admin, {
      workerId: "worker-expired",
      leaseSeconds: 60,
    });
    if (!claimed) throw new Error("Expected a claimed job");
    await forceExpiredLease(job.id);

    expect(
      await heartbeatJob(admin, {
        jobId: job.id,
        leaseToken: claimed.lease_token,
      }),
    ).toBeNull();

    await expect(
      completeJob(admin, {
        jobId: job.id,
        leaseToken: claimed.lease_token,
      }),
    ).rejects.toBeInstanceOf(StaleLeaseError);

    await expect(
      failJob(admin, {
        jobId: job.id,
        leaseToken: claimed.lease_token,
        errorCode: "WORKER_ERROR",
      }),
    ).rejects.toBeInstanceOf(StaleLeaseError);

    const recovered = await recoverExpiredLeases(admin, { limit: 10 });
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      job_id: job.id,
      scan_id: scan.scanId,
      status: "failed",
      attempts: 1,
      next_attempt_at: null,
    });
    expect(recovered[0]?.completed_at).toEqual(expect.any(String));

    const persisted = await admin
      .from("scan_jobs")
      .select("status, lease_token, lease_expires_at, error_code, completed_at")
      .eq("id", job.id)
      .single();
    expect(persisted.data).toMatchObject({
      status: "failed",
      lease_token: null,
      lease_expires_at: null,
      error_code: "LEASE_EXPIRED",
    });
    expect(persisted.data?.completed_at).toEqual(expect.any(String));
  });

  it("returns an expired lease to retry_wait with backoff", async () => {
    const scan = await seedScan(user.id);
    const [job] = await seedJobs(scan, ["safety"]);

    const claimed = await claimJob(admin, {
      workerId: "worker-expired-retry",
      leaseSeconds: 60,
    });
    if (!claimed) throw new Error("Expected a claimed job");
    await forceExpiredLease(job.id);

    const recovered = await recoverExpiredLeases(admin, { limit: 10 });
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      job_id: job.id,
      status: "retry_wait",
      attempts: 1,
      completed_at: null,
    });
    expect(recovered[0]?.next_attempt_at).toEqual(expect.any(String));

    const persisted = await admin
      .from("scan_jobs")
      .select("status, lease_token, lease_expires_at, error_code, completed_at")
      .eq("id", job.id)
      .single();
    expect(persisted.data).toMatchObject({
      status: "retry_wait",
      lease_token: null,
      lease_expires_at: null,
      error_code: "LEASE_EXPIRED",
      completed_at: null,
    });
  });

  it("completes a job only with its live lease token", async () => {
    const scan = await seedScan(user.id);
    const [job] = await seedJobs(scan, ["ip"]);

    const claimed = await claimJob(admin, {
      workerId: "worker-complete",
      leaseSeconds: 60,
    });
    if (!claimed) throw new Error("Expected a claimed job");

    await expect(
      completeJob(admin, {
        jobId: job.id,
        leaseToken: randomUUID(),
      }),
    ).rejects.toBeInstanceOf(StaleLeaseError);

    const completed = await completeJob(admin, {
      jobId: job.id,
      leaseToken: claimed.lease_token,
    });
    expect(completed).toMatchObject({ job_id: job.id, status: "completed" });
    expect(completed.completed_at).toEqual(expect.any(String));

    const persisted = await admin
      .from("scan_jobs")
      .select("status, lease_token, completed_at")
      .eq("id", job.id)
      .single();
    expect(persisted.data).toMatchObject({
      status: "completed",
      lease_token: null,
    });
  });

  it("denies queue RPCs to authenticated users", async () => {
    const { error } = await user.client.rpc("claim_job", {
      p_worker_id: "attacker",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission denied/i);
  });

  it("retries failed jobs with backoff and fails after the attempt budget", async () => {
    const scan = await seedScan(user.id);
    const [job] = await seedJobs(scan, ["recalls"], { maxAttempts: 2 });

    const first = await claimJob(admin, {
      workerId: "worker-retry-1",
      leaseSeconds: 60,
    });
    if (!first) throw new Error("Expected a claimed job");

    const retry = await failJob(admin, {
      jobId: job.id,
      leaseToken: first.lease_token,
      errorCode: "SOURCE_TIMEOUT",
      errorMessage: "Synthetic timeout",
      retryAfterSeconds: 1,
    });
    expect(retry).toMatchObject({
      job_id: job.id,
      status: "retry_wait",
      attempts: 1,
    });
    expect(retry.next_attempt_at).toEqual(expect.any(String));
    expect(retry.completed_at).toBeNull();

    await makeClaimable(job.id);

    const second = await claimJob(admin, {
      workerId: "worker-retry-2",
      leaseSeconds: 60,
    });
    if (!second) throw new Error("Expected a second claim");
    expect(second.attempts).toBe(2);

    const failed = await failJob(admin, {
      jobId: job.id,
      leaseToken: second.lease_token,
      errorCode: "SOURCE_TIMEOUT",
    });
    expect(failed).toMatchObject({
      job_id: job.id,
      status: "failed",
      attempts: 2,
      next_attempt_at: null,
    });
    expect(failed.completed_at).toEqual(expect.any(String));

    const persisted = await admin
      .from("scan_jobs")
      .select(
        "status, attempts, lease_token, lease_expires_at, error_code, last_error",
      )
      .eq("id", job.id)
      .single();
    expect(persisted.data).toMatchObject({
      status: "failed",
      attempts: 2,
      lease_token: null,
      lease_expires_at: null,
      error_code: "SOURCE_TIMEOUT",
      last_error: null,
    });
  });
});
