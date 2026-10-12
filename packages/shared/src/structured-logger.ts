export type StructuredLogLevel = "debug" | "info" | "warn" | "error";

export type StructuredLogFields = Readonly<Record<string, unknown>>;

export type StructuredLogger = (
  level: StructuredLogLevel,
  event: string,
  fields?: StructuredLogFields,
) => void;

export type StructuredLogWriter = (
  level: StructuredLogLevel,
  line: string,
) => void;

export type StructuredLoggerOptions = {
  service: string;
  environment?: string;
  writer?: StructuredLogWriter;
  now?: () => Date;
};

const maximumStringLength = 4_000;
const maximumArrayItems = 20;
const maximumObjectFields = 50;
const maximumDepth = 4;

const sensitiveKeyPattern =
  /(?:password|passwd|passphrase|secret|token|api[_-]?key|authorization|cookie|credential|private[_-]?key|session|mongodb[_-]?uri|database[_-]?url)/i;
const urlKeyPattern = /(?:url|uri|href)$/i;

function safeIdentifier(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^a-z0-9_.-]+/gi, "_");
  return normalized.slice(0, 100) || fallback;
}

function redactText(value: string): string {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(authorization|cookie|set-cookie)\s*:\s*[^\r\n]+/gi,
      "$1: [REDACTED]",
    )
    .replace(
      /\b(password|passwd|passphrase|secret|token|api[_-]?key|credential)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi,
      "$1=[REDACTED]",
    )
    .replace(
      /([?&](?:password|passwd|passphrase|secret|token|api[_-]?key|credential)=)[^&#\s]*/gi,
      "$1[REDACTED]",
    )
    .slice(0, maximumStringLength);
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return redactText(url.href);
  } catch {
    return redactText(value);
  }
}

function sanitizeValue(
  value: unknown,
  key: string,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (sensitiveKeyPattern.test(key)) return "[REDACTED]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    return urlKeyPattern.test(key) ? redactUrl(value) : redactText(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    const error = value as Error & { code?: unknown };
    return {
      name: safeIdentifier(error.name, "Error"),
      message: redactText(error.message),
      ...(typeof error.code === "string"
        ? { code: safeIdentifier(error.code, "UNKNOWN") }
        : {}),
      ...(error.stack ? { stack: redactText(error.stack) } : {}),
    };
  }
  if (typeof value !== "object") return undefined;
  if (depth >= maximumDepth) return "[TRUNCATED]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, maximumArrayItems)
      .map((item) => sanitizeValue(item, key, depth + 1, seen));
  }

  const entries = Object.entries(value).slice(0, maximumObjectFields);
  return Object.fromEntries(
    entries.flatMap(([childKey, childValue]) => {
      const safeKey = safeIdentifier(childKey, "");
      if (!safeKey) return [];
      const safeValue = sanitizeValue(childValue, childKey, depth + 1, seen);
      return safeValue === undefined ? [] : [[safeKey, safeValue]];
    }),
  );
}

function safeFields(fields: StructuredLogFields): Record<string, unknown> {
  const seen = new WeakSet<object>();
  return Object.fromEntries(
    Object.entries(fields)
      .slice(0, maximumObjectFields)
      .flatMap(([key, value]) => {
        const safeKey = safeIdentifier(key, "");
        if (!safeKey) return [];
        const safeValue = sanitizeValue(value, key, 0, seen);
        return safeValue === undefined ? [] : [[safeKey, safeValue]];
      }),
  );
}

const consoleWriter: StructuredLogWriter = (level, line) => {
  console[level](line);
};

/** Writes one bounded, redacted JSON object per event for log aggregation. */
export function createStructuredLogger(
  options: StructuredLoggerOptions,
): StructuredLogger {
  const writer = options.writer ?? consoleWriter;
  const now = options.now ?? (() => new Date());
  const service = safeIdentifier(options.service, "application");
  const environment = safeIdentifier(
    options.environment ?? process.env.NODE_ENV ?? "development",
    "development",
  );

  return (level, event, fields = {}) => {
    try {
      writer(
        level,
        JSON.stringify({
          ...safeFields(fields),
          timestamp: now().toISOString(),
          level,
          service,
          environment,
          event: safeIdentifier(event, "application_event"),
        }),
      );
    } catch {
      // Observability must never interrupt application work.
    }
  };
}
