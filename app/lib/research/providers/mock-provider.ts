import type {
  EvidenceCandidate,
  ProductResearchRequest,
  ProviderResult,
  ResearchProvider,
} from "../types";

export type MockScenario =
  | "success"
  | "empty"
  | "timeout"
  | "malformed"
  | "partial";

export interface MockProviderOptions {
  scenario?: MockScenario;
  delayMs?: number;
}

const FIXTURES: Record<string, EvidenceCandidate[]> = {
  legal: [
    {
      sourceUrl: "https://example.gov/legal/product-compliance",
      title: "Product Compliance Requirements",
      summary: "Mock legal compliance requirements for testing.",
      checkType: "legal",
      publishedAt: "2026-01-15T00:00:00Z",
      officialSource: true,
      productMatch: true,
      providerId: "mock",
    },
  ],
  ip: [
    {
      sourceUrl: "https://example.com/ip/trademark-check",
      title: "Trademark Search Results",
      summary: "Mock trademark information for testing.",
      checkType: "ip",
      publishedAt: "2026-02-10T00:00:00Z",
      officialSource: false,
      productMatch: true,
      providerId: "mock",
    },
  ],
  safety: [
    {
      sourceUrl: "https://example.gov/safety/product-recall",
      title: "Safety Standards and Recalls",
      summary: "Mock safety information for testing.",
      checkType: "safety",
      publishedAt: "2026-03-05T00:00:00Z",
      officialSource: true,
      productMatch: true,
      providerId: "mock",
    },
  ],
  recalls: [
    {
      sourceUrl: "https://example.gov/recalls/product-alert",
      title: "Product Recall Alert",
      summary: "Mock recall alert for testing.",
      checkType: "recalls",
      publishedAt: "2026-04-01T00:00:00Z",
      officialSource: true,
      productMatch: true,
      providerId: "mock",
    },
  ],
};

export class MockProvider implements ResearchProvider {
  id = "mock";

  constructor(private readonly options: MockProviderOptions = {}) {}

  async search(
    request: ProductResearchRequest,
    signal?: AbortSignal,
  ): Promise<ProviderResult> {
    const scenario = this.options.scenario ?? "success";
    const delayMs = this.options.delayMs ?? 10;

    if (signal?.aborted) {
      return {
        status: "failed",
        evidence: [],
        errors: [
          { code: "ABORTED", message: "Request was aborted" },
        ],
        providerId: this.id,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));

    if (signal?.aborted) {
      return {
        status: "failed",
        evidence: [],
        errors: [
          { code: "ABORTED", message: "Request was aborted" },
        ],
        providerId: this.id,
      };
    }

    if (scenario === "timeout") {
      throw new Error("MockProvider timeout");
    }

    if (scenario === "malformed") {
      return {
        status: "failed",
        evidence: [
          {
            sourceUrl: "not-a-url",
            title: "",
            checkType: request.checkType,
            providerId: this.id,
          } as unknown as EvidenceCandidate,
        ],
        errors: [
          { code: "MALFORMED", message: "Malformed response from mock provider" },
        ],
        providerId: this.id,
      };
    }

    if (scenario === "empty") {
      return {
        status: "completed",
        evidence: [],
        errors: [],
        providerId: this.id,
      };
    }

    if (scenario === "partial") {
      const all = FIXTURES[request.checkType] ?? [];
      return {
        status: "partial",
        evidence: all.slice(0, 1),
        errors: [
          { code: "PARTIAL", message: "Some results unavailable" },
        ],
        providerId: this.id,
      };
    }

    return {
      status: "completed",
      evidence: FIXTURES[request.checkType] ?? [],
      errors: [],
      providerId: this.id,
    };
  }
}

export function createMockProvider(
  options: MockProviderOptions = {},
): ResearchProvider {
  return new MockProvider(options);
}
