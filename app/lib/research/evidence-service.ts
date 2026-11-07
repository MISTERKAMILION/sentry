import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  EvidenceNormalizationError,
  normalizeEvidenceCandidate,
  type NormalizedEvidence,
} from "./normalize-evidence";
import type { EvidenceCandidate } from "./types";

export class EvidenceServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceServiceError";
  }
}

const ownershipSchema = z.object({
  user_id: z.string().uuid(),
});

export async function verifyScanOwnership(
  client: SupabaseClient,
  scanId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await client
    .from("scans")
    .select("user_id")
    .eq("id", scanId)
    .single();

  if (error || !data) {
    throw new EvidenceServiceError("Scan not found or not accessible");
  }

  const parsed = ownershipSchema.safeParse(data);
  if (!parsed.success || parsed.data.user_id !== userId) {
    throw new EvidenceServiceError("Scan does not belong to user");
  }
}

export interface PersistEvidenceResult {
  inserted: number;
  duplicates: number;
  total: number;
}

export async function persistEvidenceCandidates(
  client: SupabaseClient,
  scanId: string,
  candidates: EvidenceCandidate[],
): Promise<PersistEvidenceResult> {
  if (candidates.length === 0) {
    return { inserted: 0, duplicates: 0, total: 0 };
  }

  const normalized: NormalizedEvidence[] = [];
  for (const candidate of candidates) {
    try {
      normalized.push(normalizeEvidenceCandidate(candidate, scanId));
    } catch (error) {
      if (error instanceof EvidenceNormalizationError) {
        continue;
      }
      throw error;
    }
  }

  if (normalized.length === 0) {
    return { inserted: 0, duplicates: 0, total: candidates.length };
  }

  const rows = normalized.map((n) => ({
    scan_id: n.scanId,
    check_type: n.checkType,
    title: n.title,
    summary: n.summary,
    source_url: n.sourceUrl,
    publisher: n.publisher,
    published_at: n.publishedAt,
    matches_official_source: n.matchesOfficialSource,
    fingerprint: n.fingerprint,
  }));

  const { data, error } = await client
    .from("evidence_sources")
    .upsert(rows, {
      onConflict: "scan_id,fingerprint",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    throw new EvidenceServiceError(`Failed to persist evidence: ${error.message}`);
  }

  const inserted = data?.length ?? 0;
  const duplicates = normalized.length - inserted;

  return {
    inserted,
    duplicates: duplicates > 0 ? duplicates : 0,
    total: candidates.length,
  };
}

export async function checkEvidenceExists(
  client: SupabaseClient,
  scanId: string,
  fingerprint: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("evidence_sources")
    .select("id")
    .eq("scan_id", scanId)
    .eq("fingerprint", fingerprint)
    .limit(1);

  if (error) {
    throw new EvidenceServiceError(`Failed to check evidence: ${error.message}`);
  }

  return (data?.length ?? 0) > 0;
}
