/**
 * An auto-detected workspace id is checked before it is used in a path.
 *
 * With GTM_SANDBOX_WORKSPACE_ID unset, the server reads "Default Workspace"
 * from workspaces.list and appends its id to every path it builds. A
 * malformed id from that response must stop the call, not be sent.
 *
 * Containment: same recording Google fakes, fetch stub and update-check mock
 * as writeGate.callSite.test.ts. Nothing reaches Google.
 */

import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { FAKE_ENV, recorder } from "../tests/helpers/fakeGoogle.js";
import { bodyOf, connectInMemory } from "../tests/helpers/connect.js";

vi.mock("googleapis", async () => (await import("../tests/helpers/fakeGoogle.js")).fakeGoogleapisModule);
vi.mock("@google-analytics/data", async () => ({
  BetaAnalyticsDataClient: (await import("../tests/helpers/fakeGoogle.js")).FakeBetaAnalyticsDataClient,
}));
vi.mock("@google-analytics/admin", async () => ({
  AnalyticsAdminServiceClient: (await import("../tests/helpers/fakeGoogle.js")).FakeAnalyticsAdminServiceClient,
}));
vi.mock("mcp-updatenotifier", () => ({ checkForUpdate: async () => undefined }));

const CONTAINER_PATH = `accounts/${FAKE_ENV.GTM_ACCOUNT_ID}/containers/${FAKE_ENV.GTM_CONTAINER_ID}`;

let client: Client;

beforeAll(async () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("network is disabled in this test");
  });
  for (const [k, v] of Object.entries(FAKE_ENV)) vi.stubEnv(k, v);
  vi.stubEnv("GTM_SANDBOX_WORKSPACE_ID", undefined);
  const { server } = await import("./index.js");
  client = await connectInMemory(server!);
});

afterAll(async () => {
  await client?.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  recorder.reset();
});

it("refuses a malformed Default Workspace id from workspaces.list and sends nothing under it", async () => {
  recorder.workspaces = [{ name: "Default Workspace", workspaceId: "1/../../../containers/9/workspaces/2" }];

  const result: any = await client.callTool({ name: "gtm_list_tags", arguments: {} });

  expect(result.isError).toBe(true);
  expect(bodyOf(result).message).toMatch(/^Invalid GTM workspace id /);
  expect(recorder.calls.map((c) => c.method)).toEqual(["gtm.workspaces.list"]);
});

it("then uses a numeric Default Workspace id: the malformed one was not cached", async () => {
  recorder.workspaces = [{ name: "Default Workspace", workspaceId: "7" }];

  const result: any = await client.callTool({ name: "gtm_list_tags", arguments: {} });

  expect(result.isError).toBeFalsy();
  expect(recorder.callsTo("gtm.tags.list")).toEqual([
    { method: "gtm.tags.list", params: { parent: `${CONTAINER_PATH}/workspaces/7` } },
  ]);
});
