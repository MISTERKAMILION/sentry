import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { heartbeatJob, StaleLeaseError } from "@/lib/queue/jobs";
import { persistEvidenceCandidates } from "@/lib/research/evidence-service";

const callbackSchema = z.object({
  scanId: z.string().uuid(),
  jobId: z.string().uuid(),
  lease_token: z.string().uuid(),
  evidence: z.array(
    z.object({
      sourceUrl: z.string().url(),
      title: z.string().min(1),
      summary: z.string().nullish(),
      checkType: z.enum(["legal", "ip", "safety", "recalls"]),
      publishedAt: z.string().nullish(),
      officialSource: z.boolean().nullish(),
      productMatch: z.boolean().nullish(),
      providerId: z.string().min(1),
    }),
  ),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = callbackSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid callback payload" },
        { status: 400 },
      );
    }

    const serviceClient = createServiceSupabaseClient();
    const { scanId, jobId, lease_token, evidence } = parsed.data;

    try {
      const heartbeat = await heartbeatJob(serviceClient, {
        jobId,
        leaseToken: lease_token,
        leaseSeconds: 60,
      });
      if (!heartbeat) {
        return NextResponse.json({ error: "Invalid lease" }, { status: 403 });
      }
    } catch (error) {
      if (error instanceof StaleLeaseError) {
        return NextResponse.json({ error: "Stale lease" }, { status: 403 });
      }
      return NextResponse.json({ error: "Lease validation failed" }, { status: 403 });
    }

    const result = await persistEvidenceCandidates(
      serviceClient,
      scanId,
      evidence as any,
    );

    return NextResponse.json({
      success: true,
      inserted: result.inserted,
      duplicates: result.duplicates,
    });
  } catch (error) {
    console.error("Python worker callback failed:", error);
    return NextResponse.json(
      { error: "Callback processing failed" },
      { status: 500 },
    );
  }
}
