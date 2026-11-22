/**
 * Non-idempotent writes must not be retried.
 *
 * withResilience() retries any transient failure up to three more times. A
 * create (tag, variable, container version, GA4 custom dimension) that fails
 * with a 5xx after Google stored it would be created again on each retry.
 * Creates go out once. Updates re-read the fingerprint and reads change
 * nothing, so they still retry.
 *
 * Deletes go out once too: a delete retried after Google already removed the
 * variable comes back 404, an error that hides the success.
 *
 * There is a second retry layer inside the client libraries. googleapis turns
 * gaxios retry on by default, and gaxios retries DELETE (and GET, PUT) on a
 * 5xx up to three times; it does not retry POST. google-gax retries the GA4
 * Admin CreateCustomDimension call on UNKNOWN and UNAVAILABLE. So each
 * single-send write also passes the library's own no-retry option:
 * `{ retry: false }` for gaxios, `{ retry: null }` for gax.
 *
 * Containment: same recording Google fakes, fetch stub and update-check mock
 * as writeGate.callSite.test.ts. Nothing reaches Google.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { FAKE_ENV, recorder } from "../tests/helpers/fakeGoogle.js";
import { connectInMemory } from "../tests/helpers/connect.js";

vi.mock("googleapis", async () => (await import("../tests/helpers/fakeGoogle.js")).fakeGoogleapisModule);
vi.mock("@google-analytics/data", async () => ({
  BetaAnalyticsDataClient: (await import("../tests/helpers/fakeGoogle.js")).FakeBetaAnalyticsDataClient,
}));
vi.mock("@google-analytics/admin", async () => ({
  AnalyticsAdminServiceClient: (await import("../tests/helpers/fakeGoogle.js")).FakeAnalyticsAdminServiceClient,
}));
vi.mock("mcp-updatenotifier", () => ({ checkForUpdate: async () => undefined }));

let client: Client;

beforeAll(async () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("network is disabled in this test");
  });
  for (const [k, v] of Object.entries(FAKE_ENV)) vi.stubEnv(k, v);
  vi.stubEnv("GTM_GA4_MCP_WRITE", "true");
  const { server } = await import("./index.js");
  client = await connectInMemory(server!);
});

afterAll(async () => {
  await client?.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  // One successful call resets the shared circuit breaker's consecutive-failure
  // count, so a failure in one test cannot open the circuit for the next.
  recorder.reset();
  await client.callTool({ name: "gtm_list_tags", arguments: {} });
  recorder.reset();
  recorder.fail = () => Object.assign(new Error("Backend Error"), { code: 503 });
});

const CREATES: Array<[string, string, Record<string, unknown>]> = [
  ["gtm_create_tag", "gtm.tags.create", { tag_json: JSON.stringify({ name: "t", type: "html" }) }],
  ["gtm_create_variable", "gtm.variables.create", { variable_json: JSON.stringify({ name: "v", type: "c" }) }],
  ["gtm_create_version", "gtm.workspaces.create_version", { name: "v1" }],
  ["gtm_ga4_create_custom_dimension", "ga4.createCustomDimension", { parameter_name: "plan_tier", display_name: "Plan tier" }],
];

describe("a create that fails with a 5xx", () => {
  it.each(CREATES)("%s is sent exactly once", async (tool, method, args) => {
    const result: any = await client.callTool({ name: tool, arguments: args });

    expect(result.isError).toBe(true);
    expect(recorder.callsTo(method)).toHaveLength(1);
  }, 20_000);
});

describe("a delete that fails with a 5xx", () => {
  it("gtm_delete_variable is sent exactly once", async () => {
    const result: any = await client.callTool({ name: "gtm_delete_variable", arguments: { variable_id: "21" } });

    expect(result.isError).toBe(true);
    expect(recorder.callsTo("gtm.variables.delete")).toHaveLength(1);
  }, 20_000);
});

/** [tool, recorded method, args, the library call option that turns its own retry off] */
const SINGLE_SEND: Array<[string, string, Record<string, unknown>, Record<string, unknown>]> = [
  ...CREATES.filter(([, method]) => method.startsWith("gtm.")).map(
    ([tool, method, args]) => [tool, method, args, { retry: false }] as [string, string, Record<string, unknown>, Record<string, unknown>],
  ),
  ["gtm_delete_variable", "gtm.variables.delete", { variable_id: "21" }, { retry: false }],
  ["gtm_ga4_create_custom_dimension", "ga4.createCustomDimension", CREATES[3][2], { retry: null }],
];

describe("the client library's own retry", () => {
  it.each(SINGLE_SEND)("%s turns it off on the call", async (tool, method, args, option) => {
    recorder.fail = null;
    const result: any = await client.callTool({ name: tool, arguments: args });

    expect(result.isError).toBeFalsy();
    expect(recorder.callsTo(method)).toHaveLength(1);
    expect(recorder.callsTo(method)[0].options).toEqual(option);
  });
});

describe("a read that fails with a 5xx", () => {
  it("is still retried (the fake 503 drives the retry policy)", async () => {
    const result: any = await client.callTool({ name: "gtm_list_variables", arguments: {} });

    expect(result.isError).toBe(true);
    expect(recorder.callsTo("gtm.variables.list").length).toBeGreaterThan(1);
  }, 20_000);
});
