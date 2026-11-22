/**
 * Tag and variable ids are checked before any Tag Manager call.
 *
 * The tools build a REST path by appending tag_id or variable_id to the
 * workspace path. An unchecked id such as "123/../../999/workspaces/1/tags/5"
 * reached another container on the wire, so every id must be digits only and
 * is refused before the request is built. This drives the real tools/call
 * handler, with writes on so the update and delete tools are reachable.
 *
 * Containment: same recording Google fakes, fetch stub and update-check mock
 * as writeGate.callSite.test.ts. Nothing reaches Google.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { FAKE_ENV, WORKSPACE_PATH, recorder } from "../tests/helpers/fakeGoogle.js";
import { bodyOf, connectInMemory } from "../tests/helpers/connect.js";

vi.mock("googleapis", async () => (await import("../tests/helpers/fakeGoogle.js")).fakeGoogleapisModule);
vi.mock("@google-analytics/data", async () => ({
  BetaAnalyticsDataClient: (await import("../tests/helpers/fakeGoogle.js")).FakeBetaAnalyticsDataClient,
}));
vi.mock("@google-analytics/admin", async () => ({
  AnalyticsAdminServiceClient: (await import("../tests/helpers/fakeGoogle.js")).FakeAnalyticsAdminServiceClient,
}));
vi.mock("mcp-updatenotifier", () => ({ checkForUpdate: async () => undefined }));

let client: Client;
let fetchCalls = 0;

beforeAll(async () => {
  vi.stubGlobal("fetch", async () => {
    fetchCalls += 1;
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

beforeEach(() => {
  recorder.reset();
  fetchCalls = 0;
});

/** [tool, id argument, the REST collection it is appended to, other required args] */
const ID_TOOLS: Array<[string, "tag_id" | "variable_id", "tags" | "variables", Record<string, unknown>]> = [
  ["gtm_get_tag", "tag_id", "tags", {}],
  ["gtm_update_tag", "tag_id", "tags", { updates_json: JSON.stringify({ name: "renamed" }) }],
  ["gtm_get_variable", "variable_id", "variables", {}],
  ["gtm_update_variable", "variable_id", "variables", { updates_json: JSON.stringify({ name: "renamed" }) }],
  ["gtm_delete_variable", "variable_id", "variables", {}],
];

const BAD_IDS: unknown[] = [
  "123/../../999/workspaces/1/tags/5", // path traversal into another container
  "5/../6",
  "5?fields=x", // query injection
  "5#x",
  "5%2F..%2F6", // encoded traversal
  "",
  "abc",
  " 5",
  "5 ",
  "-5",
  "1e3",
  "1.5",
  null,
  -1,
  1.5,
  { id: "5" },
];

describe.each(ID_TOOLS)("%s", (tool, idArg, collection, rest) => {
  const kind = idArg === "tag_id" ? "tag" : "variable";

  it.each(BAD_IDS.map((id) => [JSON.stringify(id), id]))(
    `refuses ${idArg} %s before any Tag Manager call`,
    async (_label, id) => {
      const result: any = await client.callTool({ name: tool, arguments: { ...rest, [idArg]: id } });

      expect(result.isError).toBe(true);
      expect(bodyOf(result).message).toMatch(new RegExp(`^Invalid GTM ${kind} id `));
      expect(recorder.calls).toEqual([]);
      expect(fetchCalls).toBe(0);
    },
  );

  it(`refuses a missing ${idArg} before any Tag Manager call`, async () => {
    const result: any = await client.callTool({ name: tool, arguments: { ...rest } });

    expect(result.isError).toBe(true);
    expect(bodyOf(result).message).toMatch(new RegExp(`^Invalid GTM ${kind} id `));
    expect(recorder.calls).toEqual([]);
  });

  it.each([["string", "11"], ["number", 11]])(`sends a numeric ${idArg} (%s) under the workspace path`, async (_t, id) => {
    const result: any = await client.callTool({ name: tool, arguments: { ...rest, [idArg]: id } });

    expect(result.isError).toBeFalsy();
    expect(recorder.calls.length).toBeGreaterThan(0);
    for (const c of recorder.calls) expect(c.params.path).toBe(`${WORKSPACE_PATH}/${collection}/11`);
  });
});
