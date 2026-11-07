import type {
  EvidenceCandidate,
  ProductResearchRequest,
  ProviderResult,
  ResearchProvider,
} from "../types";

export interface WebSearchProviderConfig {
  timeoutMs?: number;
  userAgent?: string;
}

export class WebSearchProvider implements ResearchProvider {
  id = "web-search";

  constructor(private readonly config: WebSearchProviderConfig = {}) {}

  async search(
    request: ProductResearchRequest,
    signal?: AbortSignal,
  ): Promise<ProviderResult> {
    const timeoutMs = this.config.timeoutMs ?? 15_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const combinedSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;

    try {
      const query = request.productName || request.amazonUrl || "product compliance";
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent":
            this.config.userAgent ||
            "Mozilla/5.0 (compatible; SentryBot/1.0)",
        },
        signal: combinedSignal,
      });

      if (!response.ok) {
        return {
          status: "failed",
          evidence: [],
          errors: [
            { code: "HTTP_ERROR", message: `Web search returned ${response.status}` },
          ],
          providerId: this.id,
        };
      }

      const html = await response.text();
      const evidence: EvidenceCandidate[] = [];

      // Simple regex-based extraction (basic implementation)
      const linkRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
      let match;
      let count = 0;

      while ((match = linkRegex.exec(html)) !== null && count < 10) {
        const sourceUrl = match[1];
        const title = match[2].replace(/<[^>]+>/g, "").trim();
        
        if (title && sourceUrl && sourceUrl.startsWith("http")) {
          evidence.push({
            sourceUrl,
            title: title.slice(0, 500),
            summary: null,
            checkType: request.checkType,
            publishedAt: null,
            officialSource: sourceUrl.includes(".gov") || sourceUrl.includes(".eu"),
            productMatch: false,
            providerId: this.id,
          });
          count += 1;
        }
      }

      if (evidence.length === 0) {
        return {
          status: "completed",
          evidence: [],
          errors: [],
          providerId: this.id,
        };
      }

      return {
        status: "completed",
        evidence,
        errors: [],
        providerId: this.id,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          status: "failed",
          evidence: [],
          errors: [{ code: "TIMEOUT", message: "Web search timed out" }],
          providerId: this.id,
        };
      }
      return {
        status: "failed",
        evidence: [],
        errors: [
          {
            code: "NETWORK_ERROR",
            message: error instanceof Error ? error.message : "Network error",
          },
        ],
        providerId: this.id,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createWebSearchProvider(
  config: WebSearchProviderConfig = {},
): ResearchProvider {
  return new WebSearchProvider(config);
}
