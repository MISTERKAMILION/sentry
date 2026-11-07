import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const jobCheckTypeSchema = z.enum(["legal", "ip", "safety", "recalls"]);
export type JobCheckType = z.infer<typeof jobCheckTypeSchema>;

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "retry_wait",
  "cancelled",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

const timestampSchema = z.string().min(1);

const claimJobRowSchema = z.strictObject({
  job_id: z.uuid(),
  scan_id: z.uuid(),
  user_id: z.uuid(),
  check_type: jobCheckTypeSchema,
  attempts: z.number().int().nonnegative(),
  max_attempts: z.number().int().positive(),
  lease_token: z.uuid(),
  lease_expires_at: timestampSchema,
  created_at: timestampSchema,
});
export type ClaimedJob = z.infer<typeof claimJobRowSchema>;

const heartbeatRowSchema = z.strictObject({
  job_id: z.uuid(),
  lease_expires_at: timestampSchema,
});
export type HeartbeatResult = z.infer<typeof heartbeatRowSchema>;

const recoveredLeaseRowSchema = z.strictObject({
  job_id: z.uuid(),
  scan_id: z.uuid(),
  status: z.enum(["retry_wait", "failed"]),
  attempts: z.number().int().nonnegative(),
  next_attempt_at: timestampSchema.nullable(),
  completed_at: timestampSchema.nullable(),
});
export type RecoveredLease = z.infer<typeof recoveredLeaseRowSchema>;

const completedJobRowSchema = z.strictObject({
  job_id: z.uuid(),
  status: z.literal("completed"),
  completed_at: timestampSchema,
});
export type CompletedJob = z.infer<typeof completedJobRowSchema>;

const failedJobRowSchema = z.strictObject({
  job_id: z.uuid(),
  status: z.enum(["retry_wait", "failed"]),
  attempts: z.number().int().nonnegative(),
  next_attempt_at: timestampSchema.nullable(),
  completed_at: timestampSchema.nullable(),
});
export type FailedJob = z.infer<typeof failedJobRowSchema>;

const leaseSecondsSchema = z.number().int().min(1).max(3600);

const claimJobInput = z.object({
  workerId: z.string().trim().min(1).max(200),
  leaseSeconds: leaseSecondsSchema.default(60),
});
export type ClaimJobParams = z.input<typeof claimJobInput>;

const heartbeatJobInput = z.object({
  jobId: z.uuid(),
  leaseToken: z.uuid(),
  leaseSeconds: leaseSecondsSchema.default(60),
});
export type HeartbeatJobParams = z.input<typeof heartbeatJobInput>;

const recoverExpiredLeasesInput = z.object({
  limit: z.number().int().min(1).max(1000).default(100),
});
export type RecoverExpiredLeasesParams = z.input<typeof recoverExpiredLeasesInput>;

const completeJobInput = z.object({
  jobId: z.uuid(),
  leaseToken: z.uuid(),
});
export type CompleteJobParams = z.input<typeof completeJobInput>;

const failJobInput = z.object({
  jobId: z.uuid(),
  leaseToken: z.uuid(),
  errorCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
  errorMessage: z.string().max(4000).nullish(),
  retryAfterSeconds: z.number().int().min(1).max(3600).nullish(),
});
export type FailJobParams = z.input<typeof failJobInput>;

export class QueueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueueError";
  }
}

export class QueueRpcError extends QueueError {
  readonly operation: string;
  readonly code?: string;

  constructor(operation: string, message: string, code?: string) {
    super(`${operation} failed: ${message}`);
    this.name = "QueueRpcError";
    this.operation = operation;
    this.code = code;
  }
}

export class StaleLeaseError extends QueueRpcError {
  constructor(operation: string) {
    super(
      operation,
      "The job lease is stale, expired, or no longer running.",
      "P0409",
    );
    this.name = "StaleLeaseError";
  }
}

export class QueueContractError extends QueueError {
  constructor(message: string) {
    super(message);
    this.name = "QueueContractError";
  }
}

function formatIssues(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`)
    .join("; ");
}

function raiseRpcError(
  operation: string,
  error: { code?: string; message: string },
): never {
  if (error.code === "P0409") {
    throw new StaleLeaseError(operation);
  }
  throw new QueueRpcError(operation, error.message, error.code);
}

function parseRows<T>(
  operation: string,
  schema: z.ZodType<T>,
  data: unknown,
): T[] {
  const result = z.array(schema).safeParse(data ?? []);
  if (!result.success) {
    throw new QueueContractError(
      `${operation} returned an invalid row: ${formatIssues(result.error)}`,
    );
  }
  return result.data;
}

export async function claimJob(
  client: SupabaseClient,
  params: ClaimJobParams,
): Promise<ClaimedJob | null> {
  const input = claimJobInput.parse(params);
  const { data, error } = await client.rpc("claim_job", {
    p_worker_id: input.workerId,
    p_lease_seconds: input.leaseSeconds,
  });

  if (error) raiseRpcError("claim_job", error);

  const rows = parseRows("claim_job", claimJobRowSchema, data);
  return rows[0] ?? null;
}

export async function heartbeatJob(
  client: SupabaseClient,
  params: HeartbeatJobParams,
): Promise<HeartbeatResult | null> {
  const input = heartbeatJobInput.parse(params);
  const { data, error } = await client.rpc("heartbeat_job", {
    p_job_id: input.jobId,
    p_lease_token: input.leaseToken,
    p_lease_seconds: input.leaseSeconds,
  });

  if (error) raiseRpcError("heartbeat_job", error);

  const rows = parseRows("heartbeat_job", heartbeatRowSchema, data);
  return rows[0] ?? null;
}

export async function recoverExpiredLeases(
  client: SupabaseClient,
  params: RecoverExpiredLeasesParams = {},
): Promise<RecoveredLease[]> {
  const input = recoverExpiredLeasesInput.parse(params);
  const { data, error } = await client.rpc("recover_expired_leases", {
    p_limit: input.limit,
  });

  if (error) raiseRpcError("recover_expired_leases", error);

  return parseRows("recover_expired_leases", recoveredLeaseRowSchema, data);
}

export async function completeJob(
  client: SupabaseClient,
  params: CompleteJobParams,
): Promise<CompletedJob> {
  const input = completeJobInput.parse(params);
  const { data, error } = await client.rpc("complete_job", {
    p_job_id: input.jobId,
    p_lease_token: input.leaseToken,
  });

  if (error) raiseRpcError("complete_job", error);

  const [row] = parseRows("complete_job", completedJobRowSchema, data);
  if (!row) {
    throw new QueueContractError("complete_job returned no row.");
  }
  return row;
}

export async function failJob(
  client: SupabaseClient,
  params: FailJobParams,
): Promise<FailedJob> {
  const input = failJobInput.parse(params);
  const { data, error } = await client.rpc("fail_job", {
    p_job_id: input.jobId,
    p_lease_token: input.leaseToken,
    p_error_code: input.errorCode,
    p_error: input.errorMessage ?? null,
    p_retry_after_seconds: input.retryAfterSeconds ?? null,
  });

  if (error) raiseRpcError("fail_job", error);

  const [row] = parseRows("fail_job", failedJobRowSchema, data);
  if (!row) {
    throw new QueueContractError("fail_job returned no row.");
  }
  return row;
}
