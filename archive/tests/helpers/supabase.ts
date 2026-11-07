import { createHash, randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RULES_VERSION } from "@/lib/scoring/rules/2026-01";

loadEnv({ path: process.env.SUPABASE_ENV_FILE ?? ".env.test", quiet: true });

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Week 1 integration tests.`);
  }
  return value;
}

export const testSupabaseUrl = requiredEnv("SUPABASE_URL");
export const testSupabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");
const testSupabaseServiceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

export const admin = createClient(testSupabaseUrl, testSupabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export type TestUser = {
  id: string;
  email: string;
  accessToken: string;
  client: SupabaseClient;
};

export async function createTestUser(label: string): Promise<TestUser> {
  const email = `sentry-${label}-${randomUUID()}@example.com`;
  const password = `Sentry!${randomUUID()}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw createError ?? new Error("User not created");

  const authClient = createClient(testSupabaseUrl, testSupabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !session.session) {
    throw signInError ?? new Error("Test user session was not returned");
  }

  const accessToken = session.session.access_token;
  const client = createClient(testSupabaseUrl, testSupabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  return { id: created.user.id, email, accessToken, client };
}

export async function destroyTestUser(user: TestUser): Promise<void> {
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
}

export type SeededScan = {
  productId: string;
  scanId: string;
  checkId: string;
  evidenceId: string;
  findingId: string;
};

export async function seedScan(userId: string): Promise<SeededScan> {
  const { data: product, error: productError } = await admin
    .from("products")
    .insert({ user_id: userId, name: "LED dog collar", target_country: "US" })
    .select("id")
    .single();
  if (productError) throw productError;

  const { data: scan, error: scanError } = await admin
    .from("scans")
    .insert({
      user_id: userId,
      product_id: product.id,
      scoring_config_version: RULES_VERSION,
    })
    .select("id")
    .single();
  if (scanError) throw scanError;

  const { data: check, error: checkError } = await admin
    .from("scan_checks")
    .insert({
      scan_id: scan.id,
      check_type: "legal",
      status: "completed",
      risk_score: 20,
      missing_weight: 0,
      summary: "Original check summary",
    })
    .select("id")
    .single();
  if (checkError) throw checkError;

  const fingerprint = createHash("sha256").update(randomUUID()).digest("hex");
  const { data: evidence, error: evidenceError } = await admin
    .from("evidence_sources")
    .insert({
      scan_id: scan.id,
      check_type: "legal",
      title: "Original evidence",
      summary: "Original evidence summary",
      source_url: `https://example.gov/evidence/${randomUUID()}`,
      publisher: "Example regulator",
      fingerprint,
    })
    .select("id")
    .single();
  if (evidenceError) throw evidenceError;

  const { data: finding, error: findingError } = await admin
    .from("risk_findings")
    .insert({
      scan_id: scan.id,
      check_type: "legal",
      title: "Original finding",
      summary: "Original finding summary",
      severity: "low",
      evidence_ids: [evidence.id],
    })
    .select("id")
    .single();
  if (findingError) throw findingError;

  return {
    productId: product.id,
    scanId: scan.id,
    checkId: check.id,
    evidenceId: evidence.id,
    findingId: finding.id,
  };
}

export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
