// ============================================
// OAuth scope resolution (single source of truth)
// ============================================
// The OAuth scope requested at auth time lives in config.json under
// `oauth.scope`, so the standalone get-refresh-token.cjs helper and the runtime
// `auth` subcommand never drift on what they ask Google to grant.
//
// config.json is gitignored / per-user, so it may be absent (fresh clone,
// published package). In that case we fall back to the committed minimum scope.
// When config.json IS present with an oauth.scope, that value WINS.
//
// MIN-SCOPE NOTE: this MCP has WRITE tools (gtm_create_tag / gtm_update_tag /
// gtm_create_variable / gtm_update_variable / gtm_delete_variable /
// gtm_create_version / gtm_preview and gtm_ga4_create_custom_dimension), so the
// default legitimately includes edit + publish scopes — dropping them would
// break those tools. The default is the EXACT union the runtime clients request
// (see GtmGa4Manager in index.ts): GTM edit.containers + edit.containerversions
// + publish, GA4 analytics.readonly + analytics.edit. tagmanager.readonly is
// deliberately NOT requested — the edit scopes already grant read, and the
// runtime GTM client never asks for it.

import { existsSync, readFileSync } from "fs";

/**
 * Minimum scope this MCP needs — the exact union its runtime clients request:
 *   - GTM edit.containers / edit.containerversions / publish  (getGtmService)
 *   - GA4 analytics.readonly                                   (getDataClient)
 *   - GA4 analytics.edit                                       (getAdminClient)
 * Nothing else. Space-separated.
 */
export const DEFAULT_GTM_GA4_SCOPE = [
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
  "https://www.googleapis.com/auth/tagmanager.publish",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/analytics.edit",
].join(" ");

/** Normalize a comma/space/newline-separated scope list to space-separated. */
export function normalizeScope(raw: string): string {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Resolve the OAuth scope from an already-parsed config object.
 * Falls back to DEFAULT_GTM_GA4_SCOPE when oauth.scope is absent/empty.
 */
export function resolveOAuthScope(config: unknown): string {
  const scope =
    config &&
    typeof config === "object" &&
    "oauth" in config &&
    (config as { oauth?: { scope?: unknown } }).oauth &&
    typeof (config as { oauth: { scope?: unknown } }).oauth.scope === "string"
      ? (config as { oauth: { scope: string } }).oauth.scope
      : "";
  const normalized = normalizeScope(scope);
  return normalized || DEFAULT_GTM_GA4_SCOPE;
}

/**
 * Read the OAuth scope from a config file on disk (config.json). Returns the
 * committed default if the file is missing or unparseable.
 */
export function loadOAuthScopeFromFile(filePath: string): string {
  if (!existsSync(filePath)) return DEFAULT_GTM_GA4_SCOPE;
  try {
    return resolveOAuthScope(JSON.parse(readFileSync(filePath, "utf-8")));
  } catch {
    return DEFAULT_GTM_GA4_SCOPE;
  }
}
