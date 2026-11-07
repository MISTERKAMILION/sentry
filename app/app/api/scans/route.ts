import { RULES_VERSION } from "@/lib/scoring/rules/2026-01";
import {
  hashValidatedScanRequest,
  idempotencyKeySchema,
  validateScanRequest,
} from "@/lib/scans/request";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

const SCANS_ENDPOINT = "/api/scans";

type CreateScanRpcRow = {
  scan_id: string;
  scan_status: "queued" | "running" | "completed" | "failed";
  idempotent_replay: boolean;
};

export async function POST(request: Request): Promise<Response> {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!authorization || !accessToken) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const rawIdempotencyKey = request.headers.get("idempotency-key");
  const idempotencyKey = idempotencyKeySchema.safeParse(rawIdempotencyKey);
  if (!idempotencyKey.success) {
    return Response.json(
      { error: "A valid Idempotency-Key header is required." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const validated = validateScanRequestResult(body);
  if (!validated.success) {
    return Response.json({ error: validated.error }, { status: 400 });
  }

  try {
    const supabase = createRequestSupabaseClient(authorization);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }

    const requestHash = hashValidatedScanRequest(validated.value);
    const { data, error } = await supabase.rpc("create_scan_idempotent", {
      p_endpoint: SCANS_ENDPOINT,
      p_key: idempotencyKey.data,
      p_request_hash: requestHash,
      p_product_name: validated.value.product_name,
      p_amazon_url: validated.value.amazon_url,
      p_marketplace: validated.value.marketplace,
      p_target_country: validated.value.target_country,
      p_monitor_weekly: validated.value.monitor_weekly,
      p_scoring_config_version: RULES_VERSION,
    });

    if (error) {
      if (error.code === "P0409") {
        return Response.json(
          { error: "Idempotency key was already used with a different request." },
          { status: 409 },
        );
      }

      console.error("Scan creation RPC failed", {
        code: error.code,
        message: error.message,
      });
      return Response.json({ error: "Scan could not be created." }, { status: 500 });
    }

    const result = (data as CreateScanRpcRow[] | null)?.[0];
    if (!result) {
      console.error("Scan creation RPC returned no result");
      return Response.json({ error: "Scan could not be created." }, { status: 500 });
    }

    return Response.json(
      {
        scan_id: result.scan_id,
        status: result.scan_status,
        idempotent_replay: result.idempotent_replay,
      },
      { status: result.idempotent_replay ? 200 : 201 },
    );
  } catch (error) {
    console.error("Scan creation failed", error);
    return Response.json({ error: "Scan could not be created." }, { status: 500 });
  }
}

function validateScanRequestResult(body: unknown) {
  try {
    return { success: true as const, value: validateScanRequest(body) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid scan request.";
    return { success: false as const, error: message };
  }
}
