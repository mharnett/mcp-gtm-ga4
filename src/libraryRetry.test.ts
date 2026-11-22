/**
 * The client libraries' own retry layer, checked against the real libraries.
 *
 * retry.callSite.test.ts proves src/index.ts passes `{ retry: false }` to
 * googleapis and `{ retry: null }` to google-gax on every single-send write,
 * but its fakes cannot show what those options do. These tests pin the
 * library behaviour the fix relies on, so an upgrade that changes it fails
 * here:
 *
 * - googleapis turns gaxios retry on by default, and gaxios resends a DELETE
 *   on a 503 (three retries) but not a POST. `{ retry: false }` stops it.
 * - google-gax's CallSettings.merge drops the configured retry when a call
 *   passes `{ retry: null }`. The GA4 Admin client config retries
 *   CreateCustomDimension on UNKNOWN and UNAVAILABLE, so without it a create
 *   could go out more than once.
 *
 * Containment: the Tag Manager client is real but has no auth client, so
 * googleapis sends straight through gaxios with no credential lookup, and
 * every call passes a gaxios `adapter` that answers 503 in-process. The
 * adapter never calls the default (network) adapter, so no request leaves the
 * process. The gax checks are pure function calls.
 */

import { readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";

import { describe, expect, it } from "vitest";
import { google } from "googleapis";
import { CallSettings, createBackoffSettings, createRetryOptions } from "google-gax";

function unavailable() {
  const seen: Array<{ method: string; url: string }> = [];
  const adapter = async (opts: any) => {
    seen.push({ method: String(opts.method), url: String(opts.url) });
    return { status: 503, statusText: "Service Unavailable", data: { error: { code: 503, message: "Backend Error" } }, headers: {}, config: opts };
  };
  return { seen, adapter };
}

const VAR_PATH = "accounts/1/containers/2/workspaces/3/variables/4";

describe("googleapis / gaxios", () => {
  const tagmanager = google.tagmanager({ version: "v2" });
  const variables = tagmanager.accounts.containers.workspaces.variables;

  it("resends a DELETE on a 503 by default (the layer under withResilience)", async () => {
    const { seen, adapter } = unavailable();
    await expect(variables.delete({ path: VAR_PATH }, { adapter } as any)).rejects.toThrow(/Backend Error/);
    expect(seen.map((s) => s.method)).toEqual(["DELETE", "DELETE", "DELETE", "DELETE"]);
    expect(seen[0].url).toContain(`/tagmanager/v2/${VAR_PATH}`);
  }, 20_000);

  it("sends a DELETE once with { retry: false }", async () => {
    const { seen, adapter } = unavailable();
    await expect(variables.delete({ path: VAR_PATH }, { adapter, retry: false } as any)).rejects.toThrow(/Backend Error/);
    expect(seen.map((s) => s.method)).toEqual(["DELETE"]);
  });

  it("sends a POST (a create) once even by default", async () => {
    const { seen, adapter } = unavailable();
    await expect(
      variables.create({ parent: "accounts/1/containers/2/workspaces/3", requestBody: { name: "v" } }, { adapter } as any),
    ).rejects.toThrow(/Backend Error/);
    expect(seen.map((s) => s.method)).toEqual(["POST"]);
  });
});

describe("google-gax", () => {
  it("the GA4 Admin client retries CreateCustomDimension unless told not to", () => {
    const require = createRequire(import.meta.url);
    const adminDir = dirname(require.resolve("@google-analytics/admin/package.json"));
    const config = JSON.parse(
      readFileSync(join(adminDir, "build/src/v1alpha/analytics_admin_service_client_config.json"), "utf8"),
    ).interfaces["google.analytics.admin.v1alpha.AnalyticsAdminService"];
    const codes = config.retry_codes[config.methods.CreateCustomDimension.retry_codes_name];
    expect(codes).toEqual(expect.arrayContaining(["UNAVAILABLE"]));
  });

  it("CallSettings.merge({ retry: null }) drops the configured retry", () => {
    const configured = new CallSettings({
      retry: createRetryOptions([14, 2], createBackoffSettings(1000, 1.3, 60000, 60000, 1, 60000, 600000)),
    });
    expect(configured.merge({}).retry?.retryCodes).toEqual([14, 2]);
    expect(configured.merge({ retry: null } as any).retry).toBeNull();
  });
});
