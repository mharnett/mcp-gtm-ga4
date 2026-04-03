export class GtmAuthError extends Error {
  constructor(message: string, public readonly cause?: unknown) { super(message); this.name = "GtmAuthError"; }
}

export class GtmRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number, cause?: unknown) {
    super(`Rate limited, retry after ${retryAfterMs}ms`); this.name = "GtmRateLimitError"; this.cause = cause;
  }
}

export class GtmServiceError extends Error {
  constructor(message: string, public readonly cause?: unknown) { super(message); this.name = "GtmServiceError"; }
}

export class SafetyError extends Error {
  constructor(message: string) { super(message); this.name = "SafetyError"; }
}

export function classifyError(error: any): Error {
  const message = error?.message || String(error);
  const code = error?.code || error?.status;

  if (code === 401 || code === 403 || code === 7 || code === 16 ||
      message.includes("PERMISSION_DENIED") || message.includes("UNAUTHENTICATED") ||
      message.includes("invalid_grant")) {
    return new GtmAuthError(`Auth failed: ${message}`, error);
  }
  if (code === 429 || code === 8 || message.includes("rateLimitExceeded") || message.includes("RESOURCE_EXHAUSTED")) {
    return new GtmRateLimitError(60_000, error);
  }
  if (code >= 500 || code === 13 || code === 14 || message.includes("INTERNAL") || message.includes("UNAVAILABLE")) {
    return new GtmServiceError(`API server error: ${message}`, error);
  }
  return error;
}
