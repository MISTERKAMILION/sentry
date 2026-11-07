import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  admin,
  createTestUser,
  destroyTestUser,
  seedScan,
  type SeededScan,
  type TestUser,
} from "../helpers/supabase";

let userA: TestUser;
let userB: TestUser;
let ownScan: SeededScan;
let otherScan: SeededScan;

beforeAll(async () => {
  [userA, userB] = await Promise.all([
    createTestUser("escalation-a"),
    createTestUser("escalation-b"),
  ]);
});

beforeEach(async () => {
  [ownScan, otherScan] = await Promise.all([
    seedScan(userA.id),
    seedScan(userB.id),
  ]);
});

afterAll(async () => {
  await Promise.all([destroyTestUser(userA), destroyTestUser(userB)]);
});

describe("Week 1 / RLS UPDATE escalation", () => {
  it("rejects changing a scan's user_id to another user", async () => {
    const result = await userA.client
      .from("scans")
      .update({ user_id: userB.id })
      .eq("id", ownScan.scanId);

    expect(result.error).not.toBeNull();
    const persisted = await admin
      .from("scans")
      .select("user_id")
      .eq("id", ownScan.scanId)
      .single();
    expect(persisted.data?.user_id).toBe(userA.id);
  });

  it("applies the same replacement-row protection to products", async () => {
    const result = await userA.client
      .from("products")
      .update({ user_id: userB.id })
      .eq("id", ownScan.productId);

    expect(result.error).not.toBeNull();
    const persisted = await admin
      .from("products")
      .select("user_id")
      .eq("id", ownScan.productId)
      .single();
    expect(persisted.data?.user_id).toBe(userA.id);
  });

  it("rejects reparenting a child row to another user's scan", async () => {
    const result = await userA.client
      .from("scan_checks")
      .update({ scan_id: otherScan.scanId })
      .eq("id", ownScan.checkId);

    expect(result.error).not.toBeNull();
    const persisted = await admin
      .from("scan_checks")
      .select("scan_id")
      .eq("id", ownScan.checkId)
      .single();
    expect(persisted.data?.scan_id).toBe(ownScan.scanId);
  });
});
