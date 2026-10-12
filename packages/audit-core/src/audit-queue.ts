export const AUDIT_QUEUE_NAME = "audit";
export const DEFAULT_AUDIT_MAX_ATTEMPTS = 3;
export const DEFAULT_AUDIT_TIMEOUT_MS = 90 * 60_000;
export const DEFAULT_AUDIT_POLL_INTERVAL_MS = 500;
export const DEFAULT_AUDIT_STALE_AFTER_MS = 60_000;
export const PUBLIC_AUDIT_MAXIMUM_PAGES = 5;
export const PUBLIC_AUDIT_MAXIMUM_DEPTH = 1;

export const AuditPreset = {
  QUICK: "QUICK",
  STANDARD: "STANDARD",
  FULL: "FULL",
} as const;

export type AuditPreset = (typeof AuditPreset)[keyof typeof AuditPreset];

export const ACCESSIBILITY_BROWSER_PAGE_LIMITS = Object.freeze({
  QUICK: 3,
  STANDARD: 10,
  FULL: 20,
}) satisfies Readonly<Record<AuditPreset, number>>;

export const MOBILE_BROWSER_PAGE_LIMITS = Object.freeze({
  QUICK: 1,
  STANDARD: 3,
  FULL: 5,
}) satisfies Readonly<Record<AuditPreset, number>>;

export function getAccessibilityBrowserPageLimit(
  preset: AuditPreset,
  maximumAuditPages: number,
): number {
  const auditPageLimit = Number.isFinite(maximumAuditPages)
    ? Math.max(0, Math.floor(maximumAuditPages))
    : 0;
  return Math.min(ACCESSIBILITY_BROWSER_PAGE_LIMITS[preset], auditPageLimit);
}

export function getMobileBrowserPageLimit(
  preset: AuditPreset,
  maximumAuditPages: number,
): number {
  const auditPageLimit = Number.isFinite(maximumAuditPages)
    ? Math.max(0, Math.floor(maximumAuditPages))
    : 0;
  return Math.min(MOBILE_BROWSER_PAGE_LIMITS[preset], auditPageLimit);
}

export type AuditSettings = {
  maximumPages: number;
  maximumDepth: number;
  respectRobotsTxt: boolean;
  checkExternalLinks: boolean;
  javascriptRendering: boolean;
  performanceAnalysis: boolean;
  accessibilityAnalysis: boolean;
  securityAnalysis: boolean;
  mobileAnalysis: boolean;
};

export type AuditPresetDefinition = {
  label: string;
  description: string;
  maximumPagesLimit: number;
  maximumDepthLimit: number;
  defaults: AuditSettings;
};

export const AUDIT_PRESET_DEFINITIONS: Record<
  AuditPreset,
  AuditPresetDefinition
> = {
  QUICK: {
    label: "Quick Audit",
    description: "A focused lifecycle check for a small website.",
    maximumPagesLimit: 10,
    maximumDepthLimit: 2,
    defaults: {
      maximumPages: 10,
      maximumDepth: 2,
      respectRobotsTxt: true,
      checkExternalLinks: false,
      javascriptRendering: false,
      performanceAnalysis: true,
      accessibilityAnalysis: true,
      securityAnalysis: true,
      mobileAnalysis: true,
    },
  },
  STANDARD: {
    label: "Standard Audit",
    description: "Balanced coverage for most business websites.",
    maximumPagesLimit: 100,
    maximumDepthLimit: 5,
    defaults: {
      maximumPages: 100,
      maximumDepth: 5,
      respectRobotsTxt: true,
      checkExternalLinks: true,
      javascriptRendering: false,
      performanceAnalysis: true,
      accessibilityAnalysis: true,
      securityAnalysis: true,
      mobileAnalysis: true,
    },
  },
  FULL: {
    label: "Full Audit",
    description: "The largest allowed crawl for detailed site coverage.",
    maximumPagesLimit: 500,
    maximumDepthLimit: 10,
    defaults: {
      maximumPages: 500,
      maximumDepth: 10,
      respectRobotsTxt: true,
      checkExternalLinks: true,
      javascriptRendering: false,
      performanceAnalysis: true,
      accessibilityAnalysis: true,
      securityAnalysis: true,
      mobileAnalysis: true,
    },
  },
};

const BASE_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

export function calculateAuditRetryDelay(attempt: number): number {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(
    BASE_RETRY_DELAY_MS * 2 ** (normalizedAttempt - 1),
    MAX_RETRY_DELAY_MS,
  );
}

export function sanitizeAuditErrorMessage(message: string): string {
  const withoutControlCharacters = message.replace(
    /[\u0000-\u001f\u007f]/g,
    " ",
  );
  const withoutUrlCredentials = withoutControlCharacters.replace(
    /\b(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi,
    "$1[credentials-redacted]@",
  );

  return withoutUrlCredentials.replace(/\s+/g, " ").trim().slice(0, 500);
}

export class AuditProcessingError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly stage: string | undefined;
  readonly step: string | undefined;

  constructor(
    message: string,
    options: {
      retryable: boolean;
      code?: string;
      stage?: string;
      step?: string;
    },
  ) {
    super(sanitizeAuditErrorMessage(message));
    this.name = "AuditProcessingError";
    this.code = options.code ?? "AUDIT_PROCESSING_FAILED";
    this.retryable = options.retryable;
    this.stage = options.stage;
    this.step = options.step;
  }
}

export function getSafeAuditFailure(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  stage?: string;
  step?: string;
} {
  if (error instanceof AuditProcessingError) {
    return {
      code: error.code,
      message: error.message || "Audit processing failed.",
      retryable: error.retryable,
      ...(error.stage ? { stage: error.stage } : {}),
      ...(error.step ? { step: error.step } : {}),
    };
  }

  return {
    code: "UNEXPECTED_ERROR",
    message: "Audit processing failed unexpectedly.",
    retryable: true,
  };
}
