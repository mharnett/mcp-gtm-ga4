import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const LIVE = process.env.LIVE_TEST === "true";

function parseToolResult(result: any): any {
  const text = result?.content?.[0]?.text;
  if (!text) return null;
  return JSON.parse(text);
}

describe.skipIf(!LIVE)("mcp-gtm-ga4 integration", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "bash",
      args: ["-c", "source ./run-mcp.sh"],
      cwd: "/Users/mark/claude-code/mcps/mcp-gtm-ga4",
      // StdioClientTransport defaults to a minimal env (PATH-only). We pass
      // the test-runner env through so the child inherits credentials and
      // GTM config required by index.ts startup validation.
      env: process.env as Record<string, string>,
    });
    client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client?.close();
  });

  it("lists tools and finds expected tool names", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("gtm_list_tags");
    expect(names).toContain("gtm_list_triggers");
    expect(names).toContain("gtm_list_variables");
    expect(names).toContain("gtm_get_variable");
    expect(names).toContain("gtm_create_variable");
    expect(names).toContain("gtm_update_variable");
    expect(names).toContain("gtm_audit_consent");
    expect(names).toContain("gtm_ga4_run_report");
    expect(names.length).toBeGreaterThanOrEqual(16);
  });

  it("gtm_list_tags returns tags array", async () => {
    const result = await client.callTool({
      name: "gtm_list_tags",
      arguments: {},
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(data.error).toBeUndefined();
    expect(Array.isArray(data.tags)).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(0);
    if (data.tags.length > 0) {
      expect(data.tags[0]).toHaveProperty("tagId");
      expect(data.tags[0]).toHaveProperty("name");
      expect(data.tags[0]).toHaveProperty("type");
    }
  }, 15_000);

  it("gtm_list_triggers returns triggers", async () => {
    const result = await client.callTool({
      name: "gtm_list_triggers",
      arguments: {},
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(data.error).toBeUndefined();
    expect(Array.isArray(data.triggers)).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(0);
    if (data.triggers.length > 0) {
      expect(data.triggers[0]).toHaveProperty("triggerId");
      expect(data.triggers[0]).toHaveProperty("name");
      expect(data.triggers[0]).toHaveProperty("type");
    }
  }, 15_000);

  it("gtm_list_variables returns variables", async () => {
    const result = await client.callTool({
      name: "gtm_list_variables",
      arguments: {},
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(data.error).toBeUndefined();
    expect(Array.isArray(data.variables)).toBe(true);
    expect(data.count).toBeGreaterThanOrEqual(0);
  }, 15_000);

  // Variable CRUD round-trip: create → get → update → (leave for cleanup).
  // Lives in one test so the test body owns the variable lifecycle and we
  // don't pollute the workspace with orphans on partial failures.
  it("variable CRUD round-trip: create, get, update", async () => {
    const uniqueName = `zz-test-crud-${Date.now()}`;
    const createBody = JSON.stringify({
      name: uniqueName,
      type: "c",
      parameter: [{ type: "TEMPLATE", key: "value", value: "initial" }],
    });

    // CREATE
    const createResult = parseToolResult(
      await client.callTool({ name: "gtm_create_variable", arguments: { variable_json: createBody } })
    );
    expect(createResult).toBeDefined();
    expect(createResult.error).toBeUndefined();
    expect(createResult.variableId).toBeDefined();
    expect(createResult.created).toContain(uniqueName);
    const newVarId = createResult.variableId;

    // GET
    const getResult = parseToolResult(
      await client.callTool({ name: "gtm_get_variable", arguments: { variable_id: newVarId } })
    );
    expect(getResult.error).toBeUndefined();
    expect(getResult.variableId).toBe(newVarId);
    expect(getResult.name).toBe(uniqueName);
    expect(getResult.type).toBe("c");

    // UPDATE
    const updateBody = JSON.stringify({
      parameter: [{ type: "TEMPLATE", key: "value", value: "updated" }],
    });
    const updateResult = parseToolResult(
      await client.callTool({ name: "gtm_update_variable", arguments: { variable_id: newVarId, updates_json: updateBody } })
    );
    expect(updateResult.error).toBeUndefined();
    expect(updateResult.variableId).toBe(newVarId);

    // GET again to verify update persisted
    const getResult2 = parseToolResult(
      await client.callTool({ name: "gtm_get_variable", arguments: { variable_id: newVarId } })
    );
    expect(getResult2.parameter[0].value).toBe("updated");

    // DELETE — cleanup so repeated test runs don't accumulate orphans
    const deleteResult = parseToolResult(
      await client.callTool({ name: "gtm_delete_variable", arguments: { variable_id: newVarId } })
    );
    expect(deleteResult.error).toBeUndefined();
    expect(deleteResult.deleted).toBe(newVarId);
  }, 30_000);

  it("gtm_audit_consent returns summary with compliance_pct", async () => {
    const result = await client.callTool({
      name: "gtm_audit_consent",
      arguments: {},
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(data.error).toBeUndefined();
    expect(data.summary).toHaveProperty("total_tags");
    expect(data.summary).toHaveProperty("compliance_pct");
    expect(data.summary).toHaveProperty("consent_configured");
    expect(data.summary).toHaveProperty("no_consent");
    expect(typeof data.summary.compliance_pct).toBe("number");
  }, 15_000);

  it("ga4_run_report returns rows", async () => {
    const result = await client.callTool({
      name: "gtm_ga4_run_report",
      arguments: {
        dimensions: "date",
        metrics: "sessions",
        start_date: "7daysAgo",
        end_date: "today",
      },
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(data.error).toBeUndefined();
    expect(Array.isArray(data.rows)).toBe(true);
    expect(data.row_count).toBeGreaterThanOrEqual(0);
  }, 15_000);
});
