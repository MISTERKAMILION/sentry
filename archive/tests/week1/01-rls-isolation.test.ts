import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  admin,
  createTestUser,
  destroyTestUser,
  fingerprint,
  seedScan,
  type SeededScan,
  type TestUser,
} from "../helpers/supabase";

let userA: TestUser;
let userB: TestUser;
let otherScan: SeededScan;

beforeAll(async () => {
  [userA, userB] = await Promise.all([
    createTestUser("rls-a"),
    createTestUser("rls-b"),
  ]);
});

beforeEach(async () => {
  await seedScan(userA.id);
  otherScan = await seedScan(userB.id);
});

afterAll(async () => {
  await Promise.all([destroyTestUser(userA), destroyTestUser(userB)]);
});

async function assertCrossUserCrudBlocked(options: {
  table: string;
  otherRowId: string;
  insertValues: Record<string, unknown>;
  updateValues: Record<string, unknown>;
  verifyColumn: string;
  expectedValue: unknown;
  updateDenied?: boolean;
}) {
  const { table, otherRowId } = options;

  const selected = await userA.client
    .from(table)
    .select("id")
    .eq("id", otherRowId)
    .maybeSingle();
  expect(selected.error).toBeNull();
  expect(selected.data).toBeNull();

  const inserted = await userA.client.from(table).insert(options.insertValues);
  expect(inserted.error).not.toBeNull();

  const updated = await userA.client
    .from(table)
    .update(options.updateValues)
    .eq("id", otherRowId)
    .select("id");

  if (options.updateDenied) {
    expect(updated.error).not.toBeNull();
    expect(updated.error?.message).toMatch(/permission denied/i);
  } else {
    expect(updated.error).toBeNull();
    expect(updated.data).toEqual([]);
  }

  const deleted = await userA.client
    .from(table)
    .delete()
    .eq("id", otherRowId)
    .select("id");
  expect(deleted.error).toBeNull();
  expect(deleted.data).toEqual([]);

  const persisted = await admin
    .from(table)
    .select(options.verifyColumn)
    .eq("id", otherRowId)
    .single();
  expect(persisted.error).toBeNull();
  const persistedRow = persisted.data as Record<string, unknown> | null;
  expect(persistedRow?.[options.verifyColumn]).toEqual(options.expectedValue);
}

describe("Week 1 / RLS isolation", () => {
  it("blocks SELECT, INSERT, UPDATE, and DELETE on another user's scans", async () => {
    await assertCrossUserCrudBlocked({
      table: "scans",
      otherRowId: otherScan.scanId,
      insertValues: {
        user_id: userB.id,
        product_id: otherScan.productId,
        scoring_config_version: "2026-01",
      },
      updateValues: { status: "failed" },
      verifyColumn: "status",
      expectedValue: "queued",
      updateDenied: true,
    });
  });

  it("blocks SELECT, INSERT, UPDATE, and DELETE on another user's checks", async () => {
    await assertCrossUserCrudBlocked({
      table: "scan_checks",
      otherRowId: otherScan.checkId,
      insertValues: { scan_id: otherScan.scanId, check_type: "ip" },
      updateValues: { summary: "Unauthorized check change" },
      verifyColumn: "summary",
      expectedValue: "Original check summary",
    });
  });

  it("blocks SELECT, INSERT, UPDATE, and DELETE on another user's evidence", async () => {
    await assertCrossUserCrudBlocked({
      table: "evidence_sources",
      otherRowId: otherScan.evidenceId,
      insertValues: {
        scan_id: otherScan.scanId,
        check_type: "legal",
        title: "Unauthorized evidence",
        source_url: "https://example.com/unauthorized",
        fingerprint: fingerprint("unauthorized-evidence"),
      },
      updateValues: { title: "Unauthorized evidence change" },
      verifyColumn: "title",
      expectedValue: "Original evidence",
    });
  });

  it("blocks SELECT, INSERT, UPDATE, and DELETE on another user's findings", async () => {
    await assertCrossUserCrudBlocked({
      table: "risk_findings",
      otherRowId: otherScan.findingId,
      insertValues: {
        scan_id: otherScan.scanId,
        check_type: "legal",
        title: "Unauthorized finding",
        summary: "Unauthorized finding",
        severity: "low",
        evidence_ids: [otherScan.evidenceId],
      },
      updateValues: { summary: "Unauthorized finding change" },
      verifyColumn: "summary",
      expectedValue: "Original finding summary",
    });
  });
});
