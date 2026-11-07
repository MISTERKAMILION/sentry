import type {
  EvidenceCandidate,
  ProductResearchRequest,
  ProviderResult,
  ResearchProvider,
} from "./types";

export interface PythonWorkerConfig {
  baseUrl: string;
  timeoutMs?: number;
  apiKey?: string;
}

export class PythonWorkerClient implements ResearchProvider {
  id = "python-worker";

  constructor(private readonly config: PythonWorkerConfig) {}

  async search(
    request: ProductResearchRequest,
    signal?: AbortSignal,
  ): Promise<ProviderResult> {
    const timeoutMs = this.config.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const combinedSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;

    try {
      const response = await fetch(`${this.config.baseUrl}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          scanId: request.scanId,
          jobId: request.jobId,
          checkType: request.checkType,
          productName: request.productName,
          amazonUrl: request.amazonUrl,
          marketplace: request.marketplace,
          targetCountry: request.targetCountry,
          deadlineAt: request.deadlineAt,
          lease_token: request.lease_token,
        }),
        signal: combinedSignal,
      });

      if (!response.ok) {
        return {
          status: "failed",
          evidence: [],
          errors: [
            {
              code: "HTTP_ERROR",
              message: `Python worker returned ${response.status}`,
            },
          ],
          providerId: this.id,
        };
      }

      const data = (await response.json()) as {
        status?: string;
        evidence?: EvidenceCandidate[];
        errors?: Array<{ code: string; message: string }>;
      };

      if (data.status === "timeout" || data.errors?.some((e) => e.code === "TIMEOUT")) {
        return {
          status: "failed",
          evidence: [],
          errors: [
            {
              code: "TIMEOUT",
              message: "Python worker exceeded deadline",
            },
          ],
          providerId: this.id,
        };
      }

      return {
        status: (data.status as ProviderResult["status"]) ?? "completed",
        evidence: (data.evidence ?? []) as EvidenceCandidate[],
        errors: data.errors ?? [],
        providerId: this.id,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          status: "failed",
          evidence: [],
          errors: [
            { code: "TIMEOUT", message: "Request timed out" },
          ],
          providerId: this.id,
        };
      }
      return {
        status: "failed",
        evidence: [],
        errors: [
          {
            code: "NETWORK_ERROR",
            message:
              error instanceof Error ? error.message : "Network error",
          },
        ],
        providerId: this.id,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createPythonWorkerClient(
  config: PythonWorkerConfig,
): ResearchProvider {
  return new PythonWorkerClient(config);
}
