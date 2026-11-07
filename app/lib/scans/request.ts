import { createHash } from "node:crypto";
import { z } from "zod";

const scanRequestSchema = z
  .object({
    product_name: z.string().trim().min(1).max(500).nullable().optional(),
    amazon_url: z.string().trim().url().max(2048).nullable().optional(),
    marketplace: z.string().trim().min(1).max(100).default("amazon.com"),
    target_country: z
      .string()
      .trim()
      .length(2)
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase())
      .default("US"),
    monitor_weekly: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.product_name && !value.amazon_url) {
      context.addIssue({
        code: "custom",
        message: "Provide product_name or amazon_url.",
      });
    }
  });

export type ValidatedScanRequest = {
  product_name: string | null;
  amazon_url: string | null;
  marketplace: string;
  target_country: string;
  monitor_weekly: boolean;
};

export function validateScanRequest(input: unknown): ValidatedScanRequest {
  const value = scanRequestSchema.parse(input);
  return {
    product_name: value.product_name ?? null,
    amazon_url: value.amazon_url ?? null,
    marketplace: value.marketplace,
    target_country: value.target_country,
    monitor_weekly: value.monitor_weekly,
  };
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
  return `{${entries.join(",")}}`;
}

export function hashValidatedScanRequest(request: ValidatedScanRequest): string {
  return createHash("sha256").update(canonicalize(request)).digest("hex");
}

export const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[\x21-\x7E]+$/);
