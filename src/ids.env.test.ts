/**
 * The account, container and sandbox workspace ids in the environment are
 * checked at startup, before the server is built.
 *
 * Every Tag Manager path starts with accounts/<GTM_ACCOUNT_ID>/containers/
 * <GTM_CONTAINER_ID>, and GTM_SANDBOX_WORKSPACE_ID pins the workspace. A value
 * like "123/../456" would point every call somewhere else, so the module
 * refuses to load, the same way it refuses a missing id.
 *
 * Containment: googleapis and the GA4 clients are the recording fakes, and the
 * update check is mocked. The module throws before any client exists.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_ENV } from "../tests/helpers/fakeGoogle.js";

vi.mock("googleapis", async () => (await import("../tests/helpers/fakeGoogle.js")).fakeGoogleapisModule);
vi.mock("@google-analytics/data", async () => ({
  BetaAnalyticsDataClient: (await import("../tests/helpers/fakeGoogle.js")).FakeBetaAnalyticsDataClient,
}));
vi.mock("@google-analytics/admin", async () => ({
  AnalyticsAdminServiceClient: (await import("../tests/helpers/fakeGoogle.js")).FakeAnalyticsAdminServiceClient,
}));
vi.mock("mcp-updatenotifier", () => ({ checkForUpdate: async () => undefined }));

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", async () => {
    throw new Error("network is disabled in this test");
  });
  for (const [k, v] of Object.entries(FAKE_ENV)) vi.stubEnv(k, v);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const ENV_IDS: Array<[string, string]> = [
  ["GTM_ACCOUNT_ID", "account"],
  ["GTM_CONTAINER_ID", "container"],
  ["GTM_SANDBOX_WORKSPACE_ID", "workspace"],
];

describe.each(ENV_IDS)("%s", (key, kind) => {
  it.each(["123/../456", "GTM-ABC123", "12?x=1", "12 34"])("refuses %s at startup", async (bad) => {
    vi.stubEnv(key, bad);
    await expect(import("./index.js")).rejects.toThrow(new RegExp(`Invalid GTM ${kind} id .*${key}`));
  });
});

it("starts with numeric ids (the check is not refusing everything)", async () => {
  const mod = await import("./index.js");
  expect(mod.server).toBeDefined();
});
