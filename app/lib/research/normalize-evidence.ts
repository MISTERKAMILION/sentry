import { createHash } from "node:crypto";
import { z } from "zod";
import type { CheckType, EvidenceCandidate } from "./types";

const urlSchema = z.string().url();

const evidenceCandidateSchema = z.object({
  sourceUrl: urlSchema,
  title: z.string().trim().min(1).max(500),
  summary: z.string().max(4000).nullish(),
  checkType: z.enum(["legal", "ip", "safety", "recalls"]),
  publishedAt: z.string().datetime().nullish().or(z.string().min(1).nullish()),
  officialSource: z.boolean().nullish(),
  productMatch: z.boolean().nullish(),
  providerId: z.string().trim().min(1).max(100),
  raw: z.unknown().optional(),
});

export type NormalizedEvidence = {
  scanId: string;
  checkType: CheckType;
  title: string;
  summary: string | null;
  sourceUrl: string;
  publisher: string | null;
  publishedAt: string | null;
  matchesOfficialSource: boolean | null;
  fingerprint: string;
  providerId: string;
};

export class EvidenceNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceNormalizationError";
  }
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname.endsWith("/") && parsed.pathname !== "/") {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    throw new EvidenceNormalizationError("Invalid URL");
  }
}

function normalizePublishedAt(publishedAt: string | null | undefined): string | null {
  if (!publishedAt || publishedAt.trim().length === 0) {
    return null;
  }
  const trimmed = publishedAt.trim();
  try {
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return trimmed;
    }
    return date.toISOString();
  } catch {
    return trimmed;
  }
}

function computeFingerprint(
  sourceUrl: string,
  title: string,
  publishedAt: string | null,
  checkType: CheckType,
): string {
  const published = publishedAt ?? "";
  const input = `${sourceUrl}|${title}|${published}|${checkType}`;
  return createHash("sha256").update(input).digest("hex");
}

function extractPublisher(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

export function normalizeEvidenceCandidate(
  candidate: EvidenceCandidate,
  scanId: string,
): NormalizedEvidence {
  const parsed = evidenceCandidateSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new EvidenceNormalizationError(
      `Invalid evidence candidate: ${parsed.error.issues
        .map((i) => i.message)
        .slice(0, 3)
        .join("; ")}`,
    );
  }

  const normalizedUrl = normalizeUrl(parsed.data.sourceUrl);
  const title = parsed.data.title.trim();
  const summary =
    parsed.data.summary && parsed.data.summary.trim().length > 0
      ? parsed.data.summary.trim().slice(0, 4000)
      : null;
  const publishedAt = normalizePublishedAt(parsed.data.publishedAt);
  const checkType = parsed.data.checkType;
  const fingerprint = computeFingerprint(
    normalizedUrl,
    title,
    publishedAt,
    checkType,
  );
  const publisher = extractPublisher(normalizedUrl);

  return {
    scanId,
    checkType,
    title,
    summary,
    sourceUrl: normalizedUrl,
    publisher,
    publishedAt,
    matchesOfficialSource:
      parsed.data.officialSource === undefined ? null : parsed.data.officialSource,
    fingerprint,
    providerId: parsed.data.providerId,
  };
}

export function normalizeEvidenceCandidates(
  candidates: EvidenceCandidate[],
  scanId: string,
): NormalizedEvidence[] {
  return candidates.map((candidate) => normalizeEvidenceCandidate(candidate, scanId));
}
