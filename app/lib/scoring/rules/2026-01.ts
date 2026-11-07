export const RULES_VERSION = "2026-01" as const;

export const MVP_WEIGHTS = {
  legal: 0.3,
  ip: 0.3,
  safety: 0.25,
  recalls: 0.15,
} as const;

export const MVP_REQUIRED = ["legal", "ip", "safety", "recalls"] as const;
export const MVP_CRITICAL = ["legal", "ip", "safety", "recalls"] as const;

export const COVERAGE_THRESHOLD = 0.6;

/**
 * Configuration contract only. The deterministic scorer is implemented in
 * Week 6; no adapter or LLM is permitted to assign these values at runtime.
 */
export const scoringRules = {
  version: RULES_VERSION,
  checks: {
    legal: { weight: MVP_WEIGHTS.legal, critical: true, required: true },
    ip: { weight: MVP_WEIGHTS.ip, critical: true, required: true },
    safety: { weight: MVP_WEIGHTS.safety, critical: true, required: true },
    recalls: { weight: MVP_WEIGHTS.recalls, critical: true, required: true },
  },
  minimumCoverage: COVERAGE_THRESHOLD,
  coverage: {
    totalRequiredWeight: 1,
    partialAssessedFraction: 0.5,
    partialMissingFraction: 0.5,
    unavailableRiskScore: null,
    failedRiskScore: null,
    unknownSourceDateIsFresh: false,
  },
  eligibility: {
    completed: "requires_sufficient_validated_evidence_and_risk_score",
    partial: "split_between_assessed_and_missing_weights",
    unavailable: "missing_weight",
    failed: "missing_weight",
    queued: "not_assessed",
    running: "not_assessed",
  },
  mvp: {
    allRequiredChecksMustBeEligible: true,
    criticalChecks: MVP_CRITICAL,
    requiredChecks: MVP_REQUIRED,
    strictCriticalRuleOverridesCoverageThreshold: true,
  },
  manualReview: {
    requiredWhenCriticalCheckIsUnavailable: true,
    requiredWhenAssessmentIsIncomplete: true,
    lowConfidenceDoesNotReduceRisk: true,
  },
  rounding: {
    precision: 0,
    mode: "half_up",
  },
  riskBands: [
    { min: 0, max: 19, label: "lower_identified_risk" },
    { min: 20, max: 39, label: "moderate" },
    { min: 40, max: 59, label: "high" },
    { min: 60, max: 79, label: "very_high" },
    { min: 80, max: 100, label: "critical" },
  ],
} as const;

export type CheckType = keyof typeof MVP_WEIGHTS;
