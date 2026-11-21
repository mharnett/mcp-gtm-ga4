/**
 * Write gate at the call site: drives the real tools/list and tools/call
 * handlers that src/index.ts registers, over an in-memory MCP transport.
 *
 * writeGate.test.ts proves assertWriteAllowed() and filterTools() work, but
 * it imports only tools.js, so deleting either call from src/index.ts left
 * every test green (review 2026-11-14). Here every WRITE_TOOLS name is called
 * through the server with GTM_GA4_MCP_WRITE unset and must be refused before
 * any Google auth object, client or API call is made.
 *
 * Containment: googleapis and the GA4 Data and Admin clients are recording
 * fakes (tests/helpers/fakeGoogle.ts), the credential path does not exist,
 * fetch throws, and the npm update check is mocked out. Nothing reaches
 * Google.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { FAKE_ENV, WORKSPACE_PATH, recorder } from "../tests/helpers/fakeGoogle.js";
import { bodyOf, connectInMemory } from "../tests/helpers/connect.js";
import { WRITE_TOOLS, WRITE_DISABLED_MESSAGE } from "./writeGate.js";
import { tools } from "./tools.js";

vi.mock("googleapis", async () => (await import("../tests/helpers/fakeGoogle.js")).fakeGoogleapisModule);
vi.mock("@google-analytics/data", async () => ({
  BetaAnalyticsDataClient: (await import("../tests/helpers/fakeGoogle.js")).FakeBetaAnalyticsDataClient,
}));
vi.mock("@google-analytics/admin", async () => ({
  AnalyticsAdminServiceClient: (await import("../tests/helpers/fakeGoogle.js")).FakeAnalyticsAdminServiceClient,
}));
vi.mock("mcp-updatenotifier", () => ({ checkForUpdate: async () => undefined }));

const WRITE_TOOL_NAMES = [...WRITE_TOOLS].sort();

/** The bare call, and one with every id and JSON body a write tool takes. */
const ARG_SHAPES: Array<[string, Record<string, unknown>]> = [
  ["bare", {}],
  [
    "loaded",
    {
      tag_id: "11",
      variable_id: "21",
      tag_json: JSON.stringify({ name: "Gate test tag", type: "html" }),
      variable_json: JSON.stringify({ name: "Gate test var", type: "c" }),
      updates_json: JSON.stringify({ name: "renamed" }),
      name: "Gate test version",
      notes: "gate test",
      parameter_name: "plan_tier",
      display_name: "Plan tier",
    },
  ],
];

let client: Client;
let fetchCalls = 0;
let googleTouchesDuringImport = -1;

beforeAll(async () => {
  vi.stubGlobal("fetch", async () => {
    fetchCalls += 1;
    throw new Error("network is disabled in this test");
  });
  for (const [k, v] of Object.entries(FAKE_ENV)) vi.stubEnv(k, v);
  vi.stubEnv("GTM_GA4_MCP_WRITE", undefined);
  const { server } = await import("./index.js");
  await new Promise((r) => setTimeout(r, 50));
  googleTouchesDuringImport = recorder.calls.length + recorder.constructed;
  client = await connectInMemory(server!);
});

afterAll(async () => {
  await client?.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  recorder.reset();
  fetchCalls = 0;
});

afterEach(() => {
  vi.stubEnv("GTM_GA4_MCP_WRITE", undefined);
});

it("importing index.js does not start the server or touch Google", () => {
  expect(googleTouchesDuringImport).toBe(0);
});

describe("write gate at the CallTool dispatch (GTM_GA4_MCP_WRITE unset)", () => {
  it("covers the tag, variable, version and custom dimension writes", () => {
    expect(WRITE_TOOL_NAMES.length).toBe(7);
  });

  describe.each(ARG_SHAPES)("%s arguments", (_shape, args) => {
    it.each(WRITE_TOOL_NAMES)("%s is refused before any Google call", async (name) => {
      const result: any = await client.callTool({ name, arguments: args });

      expect(result.isError).toBe(true);
      expect(bodyOf(result).message).toBe(`Tool "${name}" is a write operation. ${WRITE_DISABLED_MESSAGE}`);
      expect(recorder.calls).toEqual([]);
      expect(recorder.constructed).toBe(0);
      expect(fetchCalls).toBe(0);
    });
  });

  it("hides every write tool from tools/list and keeps every read tool", async () => {
    const { tools: listed } = await client.listTools();
    const names = listed.map((t) => t.name);
    expect(names.filter((n) => WRITE_TOOLS.has(n))).toEqual([]);
    expect(names.sort()).toEqual(tools.map((t) => t.name).filter((n) => !WRITE_TOOLS.has(n)).sort());
  });

  it("still lets a read tool through to Tag Manager (the fake is on the dispatch path)", async () => {
    const result: any = await client.callTool({ name: "gtm_list_tags", arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(recorder.calls).toEqual([{ method: "gtm.tags.list", params: { parent: WORKSPACE_PATH } }]);
  });
});

describe("write gate open (GTM_GA4_MCP_WRITE=true)", () => {
  beforeEach(() => {
    vi.stubEnv("GTM_GA4_MCP_WRITE", "true");
  });

  it("lists every tool, write tools included", async () => {
    const { tools: listed } = await client.listTools();
    expect(listed.map((t) => t.name).sort()).toEqual(tools.map((t) => t.name).sort());
  });

  it("lets a write tool through to Tag Manager", async () => {
    const result: any = await client.callTool({ name: "gtm_create_tag", arguments: ARG_SHAPES[1][1] });

    expect(result.isError).toBeFalsy();
    expect(recorder.callsTo("gtm.tags.create")).toEqual([
      { method: "gtm.tags.create", params: { parent: WORKSPACE_PATH, requestBody: { name: "Gate test tag", type: "html" } } },
    ]);
  });
});
