import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/scans/route";
import {
  admin,
  createTestUser,
  destroyTestUser,
  type TestUser,
} from "../helpers/supabase";

let user: TestUser;

beforeAll(async () => {
  user = await createTestUser("idempotency");
});

afterAll(async () => {
  await destroyTestUser(user);
});

async function createScanRequest(body: unknown, key: string) {
  return POST(
    new Request("http://localhost/api/scans", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
    }),
  );
}

type ScanResponse = {
  scan_id?: string;
  status?: string;
  idempotent_replay?: boolean;
  error?: string;
};

describe("Week 1 / scan idempotency", () => {
  it("replays the same scan for the same canonical body and returns 409 for a changed body", async () => {
    const key = randomUUID();
    const body = {
      product_name: "LED dog collar",
      amazon_url: null,
      marketplace: "amazon.com",
      target_country: "US",
      monitor_weekly: true,
    };

    const first = await createScanRequest(body, key);
    const firstJson = (await first.json()) as ScanResponse;
    expect(first.status).toBe(201);
    expect(firstJson.scan_id).toBeTruthy();
    expect(firstJson.idempotent_replay).toBe(false);

    const reorderedBody = {
      monitor_weekly: true,
      target_country: "US",
      marketplace: "amazon.com",
      amazon_url: null,
      product_name: "LED dog collar",
    };
    const replay = await createScanRequest(reorderedBody, key);
    const replayJson = (await replay.json()) as ScanResponse;
    expect(replay.status).toBe(200);
    expect(replayJson.scan_id).toBe(firstJson.scan_id);
    expect(replayJson.idempotent_replay).toBe(true);

    const conflict = await createScanRequest(
      { ...body, product_name: "Different product" },
      key,
    );
    expect(conflict.status).toBe(409);

    const [scans, keys, subscriptions, jobs] = await Promise.all([
      admin.from("scans").select("id", { count: "exact", head: true }).eq("id", firstJson.scan_id),
      admin
        .from("idempotency_keys")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("key", key),
      admin
        .from("monitoring_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      admin
        .from("scan_jobs")
        .select("check_type, status, user_id, attempts, max_attempts")
        .eq("scan_id", firstJson.scan_id),
    ]);
    expect(scans.count).toBe(1);
    expect(keys.count).toBe(1);
    expect(subscriptions.count).toBe(1);
    expect(jobs.error).toBeNull();
    expect(jobs.data).toHaveLength(4);
    expect(new Set(jobs.data?.map((job) => job.check_type))).toEqual(
      new Set(["legal", "ip", "safety", "recalls"]),
    );
    expect(
      jobs.data?.every(
        (job) =>
          job.status === "queued" &&
          job.user_id === user.id &&
          job.attempts === 0 &&
          job.max_attempts === 3,
      ),
    ).toBe(true);
  });

  it("creates only one scan when identical requests race", async () => {
    const key = randomUUID();
    const body = { product_name: "Concurrent test product" };
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => createScanRequest(body, key)),
    );
    const payloads = (await Promise.all(
      responses.map((response) => response.json()),
    )) as ScanResponse[];

    expect(responses.every((response) => [200, 201].includes(response.status))).toBe(true);
    expect(new Set(payloads.map((payload) => payload.scan_id)).size).toBe(1);
    expect(payloads.filter((payload) => payload.idempotent_replay === false)).toHaveLength(1);

    const scans = await admin
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("idempotency_key", key);
    expect(scans.count).toBe(1);

    const scanId = payloads[0]?.scan_id;
    expect(scanId).toBeTruthy();
    const jobs = await admin
      .from("scan_jobs")
      .select("id", { count: "exact", head: true })
      .eq("scan_id", scanId);
    expect(jobs.error).toBeNull();
    expect(jobs.count).toBe(4);
  });
});
