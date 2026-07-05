// ============================================
// Onboarding auth-flow: pure builders + auth-mode selection.
// ============================================
// The `auth` subcommand (see src/index.ts runAuth) is the formalized user-OAuth
// onboarding path. It uses PKCE (RFC 7636, S256) via src/pkce.ts and the SAME
// scope source (config.json oauth.scope via src/oauthScope.ts) as the standalone
// get-refresh-token.cjs helper, so the two paths never drift.
//
// This module holds only the pure, offline pieces so they can be unit-tested
// without spinning up the loopback server or hitting Google.

import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { loadOAuthScopeFromFile } from "./oauthScope.js";

export const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Scope is read from config.json (oauth.scope) — the SAME source the standalone
// get-refresh-token.cjs helper uses — so the helper and this runtime never drift
// on what they ask Google to grant. config.json is gitignored/per-user; when
// absent, loadOAuthScopeFromFile returns the committed minimum GTM/GA4 default.
export const OAUTH_SCOPE = loadOAuthScopeFromFile(
  join(dirname(fileURLToPath(import.meta.url)), "..", "config.json"),
);

/** Which auth path to take: user-OAuth onboarding (`auth` subcommand) vs the
 * service-account runtime path (default). The `auth` token MUST be argv[0]. */
export function resolveAuthMode(argv: string[]): "oauth" | "service-account" {
  return argv[0] === "auth" ? "oauth" : "service-account";
}

/**
 * Resolve the runtime credential source from the environment.
 *
 * MECHANISM (read this before "fixing" it): there is NO runtime service-account
 * -vs-OAuth toggle to reorder. Both supported auth models converge on ONE slot,
 * `GOOGLE_APPLICATION_CREDENTIALS`, which the runtime feeds to
 * `GoogleAuth({ keyFile })`:
 *   - a service-account JSON key (the primary/recommended unattended path), and
 *   - the `authorized_user` keyfile the `auth` subcommand writes (interactive
 *     OAuth) — a file that plugs into the exact same slot.
 * Whichever file the operator points the env var at IS the credential. So the
 * only genuine precedence rule here is failure handling: an explicitly-configured
 * keyfile is used; when NONE is set we throw LOUDLY instead of letting GoogleAuth
 * silently fall through to Application Default Credentials (gcloud user creds /
 * GCE metadata server) — an ambient machine-local default nobody asked for and
 * the silent failover this guards against.
 *
 * Returns the trimmed keyfile path (quotes/whitespace stripped). Relative-path
 * resolution to absolute is the caller's job (CWD is unpredictable in MCP hosts).
 */
export function resolveCredentialSource(env: Record<string, string | undefined>): string {
  const path = (env.GOOGLE_APPLICATION_CREDENTIALS || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  if (!path) {
    throw new Error(
      "No credentials configured: GOOGLE_APPLICATION_CREDENTIALS is unset. Point it " +
        "at a Google credential JSON key file — there are two supported ways forward:\n" +
        "  1. Service account (recommended for unattended/server use): create a service " +
        "account, grant it your GTM container role + GA4 property access, download its " +
        "JSON key, and set GOOGLE_APPLICATION_CREDENTIALS to that file.\n" +
        "  2. User OAuth (interactive): run `node dist/index.js auth --output <path>` to " +
        "mint an authorized_user keyfile, then set GOOGLE_APPLICATION_CREDENTIALS to it.\n" +
        "Refusing to fall back to Application Default Credentials — no silent machine-local default.",
    );
  }
  return path;
}

export type CallbackDecision =
  | { kind: "not-found" }
  | { kind: "denied"; error: string }
  | { kind: "ignore" } // stray request (favicon/preflight) — no code, no error
  | { kind: "csrf" }
  | { kind: "success"; code: string };

/**
 * Classify an incoming loopback request. Ordering matters: a stray hit on the
 * callback path with neither `code` nor `error` (favicon/preflight/probe) must
 * be IGNORED (204), NOT treated as a state mismatch — otherwise the server would
 * tear down on the first stray request before the real redirect arrives. The
 * state (CSRF) check is only applied once we actually have a `code` to accept.
 */
export function classifyCallbackRequest(
  pathname: string,
  params: URLSearchParams,
  expectedState: string,
): CallbackDecision {
  if (pathname !== "/callback") return { kind: "not-found" };
  const error = params.get("error");
  if (error) return { kind: "denied", error };
  const code = params.get("code");
  if (!code) return { kind: "ignore" };
  if (params.get("state") !== expectedState) return { kind: "csrf" };
  return { kind: "success", code };
}

/** Require both OAuth client creds from an env-like object; throw a clear error
 * naming exactly the missing var(s). */
export function requireClientCreds(env: Record<string, string | undefined>): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = (env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET || "").trim();
  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (missing.length) {
    throw new Error(
      `Missing required env var(s): ${missing.join(", ")}.\n` +
        `Create a "Desktop app" OAuth client at https://console.cloud.google.com/apis/credentials, ` +
        `then export GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.`,
    );
  }
  return { clientId, clientSecret };
}

/** Build Google's OAuth consent URL with PKCE S256 + the config-resolved scope. */
export function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scope: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: opts.scope,
    access_type: "offline", // REQUIRED for Google to return a refresh_token
    prompt: "consent", // force a refresh_token even on re-consent
    state: opts.state,
    code_challenge: opts.codeChallenge, // PKCE (RFC 7636)
    code_challenge_method: "S256",
  });
  return `${OAUTH_AUTH_URL}?${params.toString()}`;
}

/** Build the token-exchange POST body, carrying the PKCE code_verifier. */
export function buildTokenExchangeBody(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier: string;
}): string {
  return new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret, // confidential Desktop client — PKCE is additive
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier, // PKCE proof — sent on exchange
  }).toString();
}
