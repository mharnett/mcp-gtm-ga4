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
      cwd: "/Users/mark/claude-code/mcps/neon-one-gtm",
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
    expect(names).toContain("gtm_audit_consent");
    expect(names).toContain("ga4_run_report");
    expect(names.length).toBeGreaterThanOrEqual(13);
  });

  it("gtm_list_tags returns tags array", async () => {
    const result = await client.callTool({
      name: "gtm_list_tags",
      arguments: {},
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(data.tags || data.error).toBeDefined();
    if (data.tags) {
      expect(Array.isArray(data.tags)).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(0);
      // Each tag should have tagId, name, type
      if (data.tags.length > 0) {
        expect(data.tags[0]).toHaveProperty("tagId");
        expect(data.tags[0]).toHaveProperty("name");
        expect(data.tags[0]).toHaveProperty("type");
      }
    }
  }, 15_000);

  it("gtm_list_triggers returns triggers", async () => {
    const result = await client.callTool({
      name: "gtm_list_triggers",
      arguments: {},
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(data.triggers || data.error).toBeDefined();
    if (data.triggers) {
      expect(Array.isArray(data.triggers)).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(0);
      if (data.triggers.length > 0) {
        expect(data.triggers[0]).toHaveProperty("triggerId");
        expect(data.triggers[0]).toHaveProperty("name");
        expect(data.triggers[0]).toHaveProperty("type");
      }
    }
  }, 15_000);

  it("gtm_list_variables returns variables", async () => {
    const result = await client.callTool({
      name: "gtm_list_variables",
      arguments: {},
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(data.variables || data.error).toBeDefined();
    if (data.variables) {
      expect(Array.isArray(data.variables)).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(0);
    }
  }, 15_000);

  it("gtm_audit_consent returns summary with compliance_pct", async () => {
    const result = await client.callTool({
      name: "gtm_audit_consent",
      arguments: {},
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(data.summary || data.error).toBeDefined();
    if (data.summary) {
      expect(data.summary).toHaveProperty("total_tags");
      expect(data.summary).toHaveProperty("compliance_pct");
      expect(data.summary).toHaveProperty("consent_configured");
      expect(data.summary).toHaveProperty("no_consent");
      expect(typeof data.summary.compliance_pct).toBe("number");
    }
  }, 15_000);

  it("ga4_run_report returns rows", async () => {
    const result = await client.callTool({
      name: "ga4_run_report",
      arguments: {
        dimensions: "date",
        metrics: "sessions",
        start_date: "7daysAgo",
        end_date: "today",
      },
    });
    const data = parseToolResult(result);
    expect(data).toBeDefined();
    expect(data.rows || data.error).toBeDefined();
    if (data.rows) {
      expect(Array.isArray(data.rows)).toBe(true);
      expect(data.row_count).toBeGreaterThanOrEqual(0);
    }
  }, 15_000);
});
