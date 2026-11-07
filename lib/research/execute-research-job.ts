import type { SupabaseClient } from "@supabase/supabase-js";
import { completeJob, failJob, StaleLeaseError } from "@/lib/queue/jobs";
import { persistEvidenceCandidates } from "./evidence-service";
import { MockProvider } from "./providers/mock-provider";
import type { ProductResearchRequest, ProviderResult, ResearchProvider } from "./types";

export interface ExecuteResearchJobInput {
  scanId: string;
  jobId: string;
  userId: string;
  checkType: "legal" | "ip" | "safety" | "recalls";
  leaseToken: string;
  productName?: string | null;
  amazonUrl?: string | null;
  marketplace?: string | null;
  targetCountry?: string | null;
  deadlineAt?: string;
}

export interface ExecuteResearchJobResult {
  status: "completed" | "partial" | "failed";
  evidenceInserted: number;
  evidenceDuplicates: number;
  providers: Array<{ providerId: string; status: string; errorCount: number }>;
}

const DEFAULT_PROVIDERS: ResearchProvider[] = [new MockProvider()];

export function getResearchProviders(): ResearchProvider[] {
  return DEFAULT_PROVIDERS;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function executeResearchJob(
  serviceClient: SupabaseClient,
  input: ExecuteResearchJobInput,
  providers: ResearchProvider[] = getResearchProviders(),
): Promise<ExecuteResearchJobResult> {
  const deadlineAt =
    input.deadlineAt ?? new Date(Date.now() + 120_000).toISOString();
  const request: ProductResearchRequest = {
    scanId: input.scanId,
    jobId: input.jobId,
    checkType: input.checkType,
    productName: input.productName ?? null,
    amazonUrl: input.amazonUrl ?? null,
    marketplace: input.marketplace ?? null,
    targetCountry: input.targetCountry ?? null,
    deadlineAt,
    lease_token: input.leaseToken,
  };

  const results: ProviderResult[] = [];
  if (providers.length === 0) {
    try {
      await failJob(serviceClient, {
        jobId: input.jobId,
        leaseToken: input.leaseToken,
        errorCode: "NO_PROVIDERS",
        errorMessage: "No research providers configured",
      });
    } catch (error) {
      if (error instanceof StaleLeaseError) {
        throw error;
      }
    }
    return {
      status: "failed",
      evidenceInserted: 0,
      evidenceDuplicates: 0,
      providers: [],
    };
  }

  const settled = await Promise.allSettled(
    providers.map((provider) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      return provider
        .search(request, controller.signal)
        .finally(() => clearTimeout(timeout));
    }),
  );

  for (let i = 0; i < settled.length; i += 1) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      results.push(result.value);
    } else {
      const providerId = providers[i]?.id ?? "unknown";
      results.push({
        status: "failed",
        evidence: [],
        errors: [
          {
            code: "PROVIDER_EXCEPTION",
            message:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          },
        ],
        providerId,
      });
    }
  }

  let totalInserted = 0;
  let totalDuplicates = 0;
  const providerSummaries: Array<{
    providerId: string;
    status: string;
    errorCount: number;
  }> = [];

  for (const result of results) {
    providerSummaries.push({
      providerId: result.providerId,
      status: result.status,
      errorCount: result.errors.length,
    });

    if (result.evidence.length > 0) {
      try {
        const persisted = await persistEvidenceCandidates(
          serviceClient,
          input.scanId,
          result.evidence,
        );
        totalInserted += persisted.inserted;
        totalDuplicates += persisted.duplicates;
      } catch {
        // continue - don't fail job for persistence issues
      }
    }
  }

  const hasSuccess = results.some(
    (r) => r.status === "completed" || r.status === "partial",
  );
  const allFailed = results.every((r) => r.status === "failed" || r.evidence.length === 0);

  if (isProduction() && providers.some((p) => p.id === "mock")) {
    throw new Error("Mock provider cannot be used in production");
  }

  try {
    if (hasSuccess && !allFailed) {
      if (results.some((r) => r.status === "partial" || r.errors.length > 0)) {
        await completeJob(serviceClient, {
          jobId: input.jobId,
          leaseToken: input.leaseToken,
        });
        return {
          status: "partial",
          evidenceInserted: totalInserted,
          evidenceDuplicates: totalDuplicates,
          providers: providerSummaries,
        };
      }
      await completeJob(serviceClient, {
        jobId: input.jobId,
        leaseToken: input.leaseToken,
      });
      return {
        status: "completed",
        evidenceInserted: totalInserted,
        evidenceDuplicates: totalDuplicates,
        providers: providerSummaries,
      };
    } else {
      await failJob(serviceClient, {
        jobId: input.jobId,
        leaseToken: input.leaseToken,
        errorCode: "NO_EVIDENCE",
        errorMessage: "All providers failed to return evidence",
      });
      return {
        status: "failed",
        evidenceInserted: 0,
        evidenceDuplicates: 0,
        providers: providerSummaries,
      };
    }
  } catch (error) {
    if (error instanceof StaleLeaseError) {
      throw error;
    }
    throw error;
  }
}
