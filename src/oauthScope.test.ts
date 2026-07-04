// ============================================
// Runtime OAuth-scope resolution tests.
// ============================================
// The scope requested at auth time must come from config.json's oauth.scope
// so the standalone get-refresh-token.cjs helper and the runtime auth path never
// drift. config.json is gitignored/per-user, so a committed default is the
// fallback when no config file / oauth.scope is present.

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  DEFAULT_GTM_GA4_SCOPE,
  resolveOAuthScope,
  loadOAuthScopeFromFile,
} from "./oauthScope.js";

describe("resolveOAuthScope", () => {
  it("returns oauth.scope from the config object when present", () => {
    expect(resolveOAuthScope({ oauth: { scope: "scope/from/config" } })).toBe(
      "scope/from/config",
    );
  });

  it("normalizes comma/space/newline-separated lists to space-separated", () => {
    expect(resolveOAuthScope({ oauth: { scope: "a, b ,c" } })).toBe("a b c");
  });

  it("falls back to the committed default when oauth.scope is absent", () => {
    expect(resolveOAuthScope({})).toBe(DEFAULT_GTM_GA4_SCOPE);
    expect(resolveOAuthScope(null)).toBe(DEFAULT_GTM_GA4_SCOPE);
  });

  it("config value wins over the default (helper + runtime share config.json)", () => {
    const fromConfig = resolveOAuthScope({ oauth: { scope: "override/scope" } });
    expect(fromConfig).toBe("override/scope");
    expect(fromConfig).not.toBe(DEFAULT_GTM_GA4_SCOPE);
  });
});

// ── Anchor tests: the committed default is the exact min-scope set the runtime
// actually uses. GTM has write tools (create/update tag/variable, create_version,
// quick_preview) so it legitimately needs the edit + publish scopes; GA4 admin
// has a write tool (create_custom_dimension) so it needs analytics.edit. These
// anchors fail if a needed edit/publish scope is ever dropped, or an unused one
// re-added.
describe("DEFAULT_GTM_GA4_SCOPE min-scope invariants", () => {
  const scopes = DEFAULT_GTM_GA4_SCOPE.split(" ");

  it("includes the GTM edit scopes required by the write tools", () => {
    expect(scopes).toContain("https://www.googleapis.com/auth/tagmanager.edit.containers");
    expect(scopes).toContain(
      "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
    );
  });

  it("includes tagmanager.publish — the runtime GTM client requests it (create_version / quick_preview)", () => {
    expect(scopes).toContain("https://www.googleapis.com/auth/tagmanager.publish");
  });

  it("includes analytics.readonly (GA4 reports) and analytics.edit (create_custom_dimension)", () => {
    expect(scopes).toContain("https://www.googleapis.com/auth/analytics.readonly");
    expect(scopes).toContain("https://www.googleapis.com/auth/analytics.edit");
  });

  it("does NOT request tagmanager.readonly — the edit scopes already grant read, and the runtime never asks for it", () => {
    expect(scopes).not.toContain("https://www.googleapis.com/auth/tagmanager.readonly");
  });

  it("requests exactly the 5 scopes the runtime uses — no over-grant", () => {
    expect(scopes).toHaveLength(5);
    expect(new Set(scopes).size).toBe(5); // no dupes
  });
});

describe("loadOAuthScopeFromFile", () => {
  it("reads oauth.scope from a config file on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "gtm-scope-"));
    try {
      const p = join(dir, "config.json");
      writeFileSync(p, JSON.stringify({ oauth: { scope: "disk/scope" } }));
      expect(loadOAuthScopeFromFile(p)).toBe("disk/scope");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("falls back to the default when the file is missing (gitignored config.json)", () => {
    expect(loadOAuthScopeFromFile(join(tmpdir(), "does-not-exist-xyz.json"))).toBe(
      DEFAULT_GTM_GA4_SCOPE,
    );
  });

  it("falls back to the default when the file is unparseable", () => {
    const dir = mkdtempSync(join(tmpdir(), "gtm-scope-bad-"));
    try {
      const p = join(dir, "config.json");
      writeFileSync(p, "{ not json");
      expect(loadOAuthScopeFromFile(p)).toBe(DEFAULT_GTM_GA4_SCOPE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
