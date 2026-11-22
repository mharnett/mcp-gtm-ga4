/**
 * GA4_PROPERTY_ID is checked when the server loads, and the GA4 tools refuse
 * to run without it.
 *
 * The id is spliced into every GA4 request as `properties/<id>`. A
 * measurement ID (G-...), a typo or a value that already carries
 * `properties/` used to reach Google and come back as an opaque
 * INVALID_ARGUMENT, or as `properties/properties/<id>`. An unset id went out
 * as `properties/`. The variable stays optional (GTM-only setups leave it
 * unset), so the server still starts without it; the GA4 tools then refuse
 * before any client is built. This mirrors mcp-ga4's check (mcp-ga4#29).
 *
 * Containment: googleapis and the GA4 Data and Admin clients are the
 * recording fakes in tests/helpers/fakeGoogle.ts, the credential path does
 * not exist, fetch throws, and the npm update check is mocked out. A rejected
 * id throws before any client exists. Nothing reaches Google.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FAKE_ENV } from "../tests/helpers/fakeGoogle.js";
import { bodyOf, connectInMemory } from "../tests/helpers/connect.js";
import { parsePropertyId } from "./propertyId.js";

vi.mock("googleapis", async () => (await import("../tests/helpers/fakeGoogle.js")).fakeGoogleapisModule);
// The data mock also hands out the recorder its fakes write to (see below).
vi.mock("@google-analytics/data", async () => {
  const fakes = await import("../tests/helpers/fakeGoogle.js");
  return { BetaAnalyticsDataClient: fakes.FakeBetaAnalyticsDataClient, fakeRecorder: fakes.recorder };
});
vi.mock("@google-analytics/admin", async () => ({
  AnalyticsAdminServiceClient: (await import("../tests/helpers/fakeGoogle.js")).FakeAnalyticsAdminServiceClient,
}));
vi.mock("mcp-updatenotifier", () => ({ checkForUpdate: async () => undefined }));

const PROPERTY_ID = FAKE_ENV.GA4_PROPERTY_ID;

/** Every GA4 tool, with arguments that pass the write gate and the schema. */
const GA4_TOOL_CALLS: Array<[string, Record<string, unknown>]> = [
  ["gtm_ga4_run_report", {}],
  ["gtm_ga4_realtime_report", {}],
  ["gtm_ga4_list_custom_dimensions", {}],
  ["gtm_ga4_create_custom_dimension", { parameter_name: "plan_tier", display_name: "Plan tier" }],
];

type Recorder = (typeof import("../tests/helpers/fakeGoogle.js"))["recorder"];

// vi.resetModules() makes the test's own import of the fakes a fresh copy,
// while the mocks keep writing to the copy they first loaded. The recorder is
// read from the mocked module, so every "nothing was built or sent" check
// watches the fakes index.ts actually uses instead of passing vacuously.
let recorder: Recorder;
const ga4Calls = () => recorder.calls.filter((c) => c.method.startsWith("ga4."));

describe("parsePropertyId", () => {
  it.each([
    ["123456789", "123456789"],
    ["properties/123456789", "123456789"],
  ])("accepts %s as %s", (raw, id) => {
    expect(parsePropertyId(raw)).toBe(id);
  });

  it.each([
    "G-ABC123XYZ",
    "UA-12345-1",
    "abc",
    "123abc",
    "12.34",
    "-123",
    "123 456",
    "properties/",
    "properties/abc",
    "properties/properties/123",
    "Properties/123",
    "accounts/1/properties/123",
    "123/../456",
    "123?x=1",
  ])("rejects %s, naming the variable and the value", (raw) => {
    expect(() => parsePropertyId(raw)).toThrow(/GA4_PROPERTY_ID/);
    expect(() => parsePropertyId(raw)).toThrow(JSON.stringify(raw));
    expect(() => parsePropertyId(raw)).toThrow(/numeric/);
  });

  it("says a G- value is a measurement ID", () => {
    expect(() => parsePropertyId("G-ABC123XYZ")).toThrow(/measurement ID/);
    expect(() => parsePropertyId("abc")).not.toThrow(/measurement ID/);
  });
});

describe("server with GA4_PROPERTY_ID", () => {
  beforeEach(async () => {
    vi.resetModules();
    recorder = ((await import("@google-analytics/data")) as unknown as { fakeRecorder: Recorder }).fakeRecorder;
    recorder.reset();
    vi.stubGlobal("fetch", async () => {
      throw new Error("network is disabled in this test");
    });
    for (const [k, v] of Object.entries(FAKE_ENV)) vi.stubEnv(k, v);
    vi.stubEnv("GTM_GA4_MCP_WRITE", "true");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(["G-ABC123XYZ", "123/../456", "properties/properties/1"])("refuses %s at startup, before any client is built", async (bad) => {
    vi.stubEnv("GA4_PROPERTY_ID", bad);

    await expect(import("./index.js")).rejects.toThrow(
      new RegExp(`GA4_PROPERTY_ID must be a numeric GA4 property ID.*${JSON.stringify(bad).replace(/[.?*+()[\]/]/g, "\\$&")}`),
    );
    expect(recorder.constructed).toBe(0);
    expect(recorder.calls).toEqual([]);
  });

  it("drops a properties/ prefix, so every GA4 request names properties/<id> once", async () => {
    vi.stubEnv("GA4_PROPERTY_ID", `properties/${PROPERTY_ID}`);
    const { server } = await import("./index.js");
    const client = await connectInMemory(server!);
    try {
      const context = bodyOf(await client.callTool({ name: "gtm_get_client_context", arguments: {} }));
      expect(context.ga4_property_id).toBe(PROPERTY_ID);

      for (const [name, args] of GA4_TOOL_CALLS) {
        const result: any = await client.callTool({ name, arguments: args });
        expect(result.isError, `${name}: ${result.content[0].text}`).toBeFalsy();
      }
      const sent = ga4Calls().map((c) => [c.method, c.params.property ?? c.params.parent]);
      expect(sent).toEqual([
        ["ga4.runReport", `properties/${PROPERTY_ID}`],
        ["ga4.runRealtimeReport", `properties/${PROPERTY_ID}`],
        ["ga4.listCustomDimensions", `properties/${PROPERTY_ID}`],
        ["ga4.createCustomDimension", `properties/${PROPERTY_ID}`],
      ]);
    } finally {
      await client.close();
    }
  });

  it("still starts without it, and every GA4 tool then refuses before building a client", async () => {
    vi.stubEnv("GA4_PROPERTY_ID", undefined);
    const { server } = await import("./index.js");
    const client = await connectInMemory(server!);
    try {
      const context = bodyOf(await client.callTool({ name: "gtm_get_client_context", arguments: {} }));
      expect(context.ga4_property_id).toBe("not configured");

      for (const [name, args] of GA4_TOOL_CALLS) {
        const result: any = await client.callTool({ name, arguments: args });
        expect(result.isError, name).toBe(true);
        expect(bodyOf(result).message, name).toMatch(/GA4_PROPERTY_ID is not set/);
      }
      expect(ga4Calls()).toEqual([]);
      expect(recorder.constructed).toBe(0);
    } finally {
      await client.close();
    }
  });
});
