import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestUser,
  destroyTestUser,
  seedScan,
  type TestUser,
} from "../helpers/supabase";

let userA: TestUser;
let userB: TestUser;

beforeAll(async () => {
  [userA, userB] = await Promise.all([
    createTestUser("child-a"),
    createTestUser("child-b"),
  ]);
});

afterAll(async () => {
  await Promise.all([destroyTestUser(userA), destroyTestUser(userB)]);
});

describe("Week 1 / child-table isolation", () => {
  it("returns no scan_checks when user A directly queries user B's parent scan", async () => {
    const otherScan = await seedScan(userB.id);
    const result = await userA.client
      .from("scan_checks")
      .select("id, scan_id")
      .eq("scan_id", otherScan.scanId);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
  });

  it("also isolates direct evidence and finding queries by parent scan", async () => {
    const otherScan = await seedScan(userB.id);

    const [evidence, findings] = await Promise.all([
      userA.client.from("evidence_sources").select("id").eq("scan_id", otherScan.scanId),
      userA.client.from("risk_findings").select("id").eq("scan_id", otherScan.scanId),
    ]);

    expect(evidence.error).toBeNull();
    expect(evidence.data).toEqual([]);
    expect(findings.error).toBeNull();
    expect(findings.data).toEqual([]);
  });
});
