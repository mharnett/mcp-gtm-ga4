export class GtmAuthError extends Error {
  constructor(message: string, public readonly cause?: unknown) { super(message); this.name = "GtmAuthError"; }
}

export class GtmRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number, cause?: unknown) {
    super(`GTM rate limited, retry after ${retryAfterMs}ms`); this.name = "GtmRateLimitError"; this.cause = cause;
  }
}

export class GtmServiceError extends Error {
  constructor(message: string, public readonly cause?: unknown) { super(message); this.name = "GtmServiceError"; }
}

export class SafetyError extends Error {
  constructor(message: string) { super(message); this.name = "SafetyError"; }
}

export function validateCredentials(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) missing.push("GOOGLE_APPLICATION_CREDENTIALS");
  if (!process.env.GTM_ACCOUNT_ID?.trim()) missing.push("GTM_ACCOUNT_ID");
  if (!process.env.GTM_CONTAINER_ID?.trim()) missing.push("GTM_CONTAINER_ID");
  // Basic format validation: credentials path should have reasonable length > 5 chars
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() && process.env.GOOGLE_APPLICATION_CREDENTIALS.trim().length > 0 && process.env.GOOGLE_APPLICATION_CREDENTIALS.trim().length < 5) {
    missing.push("GOOGLE_APPLICATION_CREDENTIALS (format: path too short, expected length > 5)");
  }
  return { valid: missing.length === 0, missing };
}

export function classifyError(error: any): Error {
  const message = error?.message || String(error);
  const code = error?.code || error?.status;
  // Check response body for error objects (gRPC/REST can return errors in body)
  const bodyError = error?.response?.body?.error || error?.data?.error || error?.errors?.[0];

  if (code === 401 || code === 403 || code === 7 || code === 16 ||
      message.includes("PERMISSION_DENIED") || message.includes("UNAUTHENTICATED") ||
      message.includes("invalid_grant") ||
      bodyError?.code === 7 || bodyError?.code === 16) {
    return new GtmAuthError(`GTM auth failed: ${message}`, error);
  }
  if (code === 429 || code === 8 || message.includes("rateLimitExceeded") || message.includes("RESOURCE_EXHAUSTED")) {
    return new GtmRateLimitError(60_000, error);
  }
  if (code >= 500 || code === 13 || code === 14 || message.includes("INTERNAL") || message.includes("UNAVAILABLE")) {
    return new GtmServiceError(`GTM API server error: ${message}`, error);
  }
  return error;
}
