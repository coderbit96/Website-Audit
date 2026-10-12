export type ApplicationErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PLAN_LIMIT_REACHED"
  | "AUDIT_ERROR"
  | "CRAWLER_ERROR"
  | "EXTERNAL_SERVICE_ERROR"
  | "INTERNAL_ERROR";

export type SafeErrorPayload = {
  error: string;
  code: ApplicationErrorCode;
};

type ApplicationErrorOptions = {
  code: ApplicationErrorCode;
  message: string;
  status: number;
  expose?: boolean;
  retryAfterSeconds?: number;
  cause?: unknown;
};

/**
 * Base error for expected application failures. It keeps an HTTP-safe public
 * message separate from internal causes so API responses never serialize a
 * stack trace or infrastructure detail.
 */
export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly status: number;
  readonly expose: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(options: ApplicationErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "ApplicationError";
    this.code = options.code;
    this.status = options.status;
    this.expose = options.expose ?? true;
    this.retryAfterSeconds =
      options.retryAfterSeconds === undefined
        ? null
        : Math.max(1, Math.ceil(options.retryAfterSeconds));
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends ApplicationError {
  constructor(message = "The request is invalid.", cause?: unknown) {
    super({ code: "VALIDATION_ERROR", message, status: 400, cause });
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends ApplicationError {
  constructor(message = "Authentication is required.") {
    super({ code: "AUTHENTICATION_ERROR", message, status: 401 });
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends ApplicationError {
  constructor(message = "You do not have permission to perform this action.") {
    super({ code: "AUTHORIZATION_ERROR", message, status: 403 });
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message = "The requested resource was not found.") {
    super({ code: "NOT_FOUND", message, status: 404 });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends ApplicationError {
  constructor(message = "The request conflicts with the current state.") {
    super({ code: "CONFLICT", message, status: 409 });
    this.name = "ConflictError";
  }
}

export class RateLimitError extends ApplicationError {
  constructor(retryAfterSeconds: number) {
    super({
      code: "RATE_LIMITED",
      message: "Too many requests. Please wait a moment and try again.",
      retryAfterSeconds,
      status: 429,
    });
    this.name = "RateLimitError";
  }
}

export class PlanLimitError extends ApplicationError {
  constructor(message = "Your current plan limit has been reached.") {
    super({ code: "PLAN_LIMIT_REACHED", message, status: 403 });
    this.name = "PlanLimitError";
  }
}

export class AuditError extends ApplicationError {
  constructor(message = "The audit could not be completed.", cause?: unknown) {
    super({ code: "AUDIT_ERROR", message, status: 422, cause });
    this.name = "AuditError";
  }
}

export class CrawlerError extends ApplicationError {
  constructor(cause?: unknown) {
    super({
      code: "CRAWLER_ERROR",
      message: "The website could not be analyzed safely.",
      status: 422,
      cause,
    });
    this.name = "CrawlerError";
  }
}

export class ExternalServiceError extends ApplicationError {
  constructor(cause?: unknown) {
    super({
      code: "EXTERNAL_SERVICE_ERROR",
      message: "A required external service is temporarily unavailable.",
      status: 503,
      cause,
    });
    this.name = "ExternalServiceError";
  }
}

export function toSafeErrorPayload(error: unknown): {
  status: number;
  payload: SafeErrorPayload;
  retryAfterSeconds: number | null;
} {
  if (error instanceof ApplicationError && error.expose) {
    return {
      status: error.status,
      payload: { error: error.message, code: error.code },
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }

  return {
    status: 500,
    payload: {
      error: "Something went wrong. Please try again.",
      code: "INTERNAL_ERROR",
    },
    retryAfterSeconds: null,
  };
}
