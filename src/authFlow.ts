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
