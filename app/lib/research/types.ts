export type CheckType = "legal" | "ip" | "safety" | "recalls";

export type ProviderStatus = "completed" | "partial" | "unavailable" | "failed";

export interface ProductResearchRequest {
  scanId: string;
  jobId: string;
  checkType: CheckType;
  productName?: string | null;
  amazonUrl?: string | null;
  marketplace?: string | null;
  targetCountry?: string | null;
  deadlineAt: string;
  lease_token: string;
}

export interface EvidenceCandidate {
  sourceUrl: string;
  title: string;
  summary?: string | null;
  checkType: CheckType;
  publishedAt?: string | null;
  officialSource?: boolean | null;
  productMatch?: boolean | null;
  providerId: string;
  raw?: unknown;
}

export interface ProviderError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ProviderResult {
  status: ProviderStatus;
  evidence: EvidenceCandidate[];
  errors: ProviderError[];
  providerId: string;
}

export interface ResearchProvider {
  id: string;
  search(
    request: ProductResearchRequest,
    signal?: AbortSignal,
  ): Promise<ProviderResult>;
}
