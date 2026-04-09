#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { google, tagmanager_v2 } from "googleapis";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { AnalyticsAdminServiceClient } from "@google-analytics/admin";
import { GtmAuthError, GtmRateLimitError, GtmServiceError, SafetyError, classifyError } from "./errors.js";
import { classifyTag } from "./consent.js";
import { tools } from "./tools.js";
import { withResilience, safeResponse, logger } from "./resilience.js";
import { createServer } from "http";
import { URL } from "url";

// ============================================
// AUTH SUBCOMMAND
// ============================================

const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/tagmanager.edit.containers",
  "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
  "https://www.googleapis.com/auth/tagmanager.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/analytics.edit",
];

// OAuth client for the "auth" subcommand.
// Set via env vars or pass a GCP OAuth keys JSON file via --keys.
const OAUTH_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const OAUTH_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

async function runAuth(): Promise<void> {
  const args = process.argv.slice(3); // after "auth"
  let outputPath = "";
  let keysPath = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--output" || args[i] === "-o") outputPath = args[++i];
    if (args[i] === "--keys" || args[i] === "-k") keysPath = args[++i];
  }
  if (!outputPath) {
    console.error("Usage: node dist/index.js auth --output <path> [--keys <oauth-keys.json>]");
    console.error("Example: node dist/index.js auth --output ~/.config/google-oauth/bluerose-gtm.json --keys ~/.config/google-oauth/gcp-oauth.keys.json");
    console.error("\nOAuth client credentials can be provided via:");
    console.error("  --keys <file>          GCP OAuth keys JSON (has installed.client_id/client_secret)");
    console.error("  GOOGLE_CLIENT_ID       Environment variable");
    console.error("  GOOGLE_CLIENT_SECRET   Environment variable");
    process.exit(1);
  }

  // Resolve OAuth client credentials: --keys file > env vars
  let clientId = OAUTH_CLIENT_ID;
  let clientSecret = OAUTH_CLIENT_SECRET;
  if (keysPath) {
    try {
      const keysJson = JSON.parse(readFileSync(keysPath, "utf-8"));
      const installed = keysJson.installed || keysJson.web;
      if (!installed?.client_id || !installed?.client_secret) {
        console.error("Keys file must contain installed.client_id and installed.client_secret");
        process.exit(1);
      }
      clientId = installed.client_id;
      clientSecret = installed.client_secret;
    } catch (err: any) {
      console.error(`Failed to read keys file: ${err.message}`);
      process.exit(1);
    }
  }
  if (!clientId || !clientSecret) {
    console.error("OAuth client credentials required. Provide --keys <file> or set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, "http://localhost:8095/oauth2callback");

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: OAUTH_SCOPES,
    prompt: "consent", // Force consent to ensure refresh token is issued
  });

  // Start local server to catch the redirect
  return new Promise((resolve, reject) => {
    const srv = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:8095`);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("No authorization code received");
        return;
      }
      try {
        const { tokens } = await oauth2Client.getToken(code);
        const credentialJson = {
          type: "authorized_user",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokens.refresh_token,
        };

        // Ensure output directory exists
        const outDir = dirname(outputPath);
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

        writeFileSync(outputPath, JSON.stringify(credentialJson, null, 2));
        console.log(`\n✓ Credentials saved to: ${outputPath}`);
        console.log(`  Use this in your .mcp.json as GOOGLE_APPLICATION_CREDENTIALS`);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h2>Authentication successful!</h2><p>You can close this tab and return to your terminal.</p>");
        srv.close();
        resolve();
      } catch (err: any) {
        console.error("Token exchange failed:", err.message);
        res.writeHead(500);
        res.end("Token exchange failed: " + err.message);
        srv.close();
        reject(err);
      }
    });

    srv.listen(8095, () => {
      console.log("\nOpening browser for Google authentication...");
      console.log(`If the browser doesn't open, visit:\n${authUrl}\n`);
      // Open browser cross-platform
      const open = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      import("child_process").then(cp => cp.exec(`${open} "${authUrl}"`));
    });
  });
}

// Handle auth subcommand before anything else
if (process.argv[2] === "auth") {
  runAuth().then(() => process.exit(0)).catch(() => process.exit(1));
} else {

// Log build fingerprint
try {
  const d = dirname(new URL(import.meta.url).pathname);
  const bi = JSON.parse(readFileSync(join(d, "build-info.json"), "utf-8"));
  console.error(`[build] SHA: ${bi.sha} (${bi.builtAt})`);
} catch { /* dev mode */ }

// CLI flags
const __cliPkg = JSON.parse(readFileSync(join(dirname(new URL(import.meta.url).pathname), "..", "package.json"), "utf-8"));
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`${__cliPkg.name} v${__cliPkg.version}\n`);
  console.log(`Usage: ${__cliPkg.name} [options]\n`);
  console.log("MCP server communicating via stdio. Configure in your .mcp.json.\n");
  console.log("Options:");
  console.log("  --help, -h       Show this help message");
  console.log("  --version, -v    Show version number");
  console.log(`\nDocumentation: https://github.com/mharnett/mcp-gtm-ga4`);
  process.exit(0);
}
if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(__cliPkg.version);
  process.exit(0);
}

// ============================================
// CONFIGURATION (all via env vars)
// ============================================

const GTM_ACCOUNT_ID = process.env.GTM_ACCOUNT_ID || "";
const GTM_CONTAINER_ID = process.env.GTM_CONTAINER_ID || "";
const GTM_CONTAINER_PATH = `accounts/${GTM_ACCOUNT_ID}/containers/${GTM_CONTAINER_ID}`;
const GTM_WORKSPACE_ID_OVERRIDE = process.env.GTM_SANDBOX_WORKSPACE_ID || "";
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || "";
const SERVER_NAME = process.env.MCP_SERVER_NAME || "neon-one-gtm";
const CREDS_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";

// ============================================
// GTM + GA4 MANAGER
// ============================================

class GtmGa4Manager {
  private gtmService: tagmanager_v2.Tagmanager | null = null;
  private dataClient: InstanceType<typeof BetaAnalyticsDataClient> | null = null;
  private adminClient: InstanceType<typeof AnalyticsAdminServiceClient> | null = null;
  private resolvedWorkspaceId: string | null = null;

  private getGtmService(): tagmanager_v2.Tagmanager {
    if (!this.gtmService) {
      const auth = new google.auth.GoogleAuth({
        keyFile: CREDS_FILE || undefined,
        scopes: [
          "https://www.googleapis.com/auth/tagmanager.edit.containers",
          "https://www.googleapis.com/auth/tagmanager.edit.containerversions",
        ],
      });
      this.gtmService = google.tagmanager({ version: "v2", auth });
    }
    return this.gtmService;
  }

  private getDataClient(): InstanceType<typeof BetaAnalyticsDataClient> {
    if (!this.dataClient) {
      const opts: any = {};
      if (CREDS_FILE) opts.keyFile = CREDS_FILE;
      opts.scopes = ["https://www.googleapis.com/auth/analytics.readonly"];
      this.dataClient = new BetaAnalyticsDataClient(opts);
    }
    return this.dataClient;
  }

  private getAdminClient(): InstanceType<typeof AnalyticsAdminServiceClient> {
    if (!this.adminClient) {
      const opts: any = {};
      if (CREDS_FILE) opts.keyFile = CREDS_FILE;
      opts.scopes = [
        "https://www.googleapis.com/auth/analytics.readonly",
        "https://www.googleapis.com/auth/analytics.edit",
      ];
      this.adminClient = new AnalyticsAdminServiceClient(opts);
    }
    return this.adminClient;
  }

  async getWorkspaceId(): Promise<string> {
    if (this.resolvedWorkspaceId) return this.resolvedWorkspaceId;
    if (GTM_WORKSPACE_ID_OVERRIDE) {
      this.resolvedWorkspaceId = GTM_WORKSPACE_ID_OVERRIDE;
      return this.resolvedWorkspaceId;
    }
    // Auto-detect Default Workspace
    const svc = this.getGtmService();
    const resp = await svc.accounts.containers.workspaces.list({ parent: GTM_CONTAINER_PATH });
    const ws = (resp.data.workspace || []).find(w => w.name === "Default Workspace");
    if (!ws?.workspaceId) throw new Error(`No 'Default Workspace' found in ${GTM_CONTAINER_PATH}`);
    this.resolvedWorkspaceId = ws.workspaceId;
    return this.resolvedWorkspaceId;
  }

  private async getWorkspacePath(): Promise<string> {
    return `${GTM_CONTAINER_PATH}/workspaces/${await this.getWorkspaceId()}`;
  }

  private assertSandbox(workspaceId: string) {
    if (workspaceId !== this.resolvedWorkspaceId) {
      throw new SafetyError(
        `BLOCKED: Workspace ${workspaceId} is not the sandbox (${this.resolvedWorkspaceId}). ` +
        `This MCP server only writes to the sandbox workspace.`
      );
    }
  }

  // ── GTM Tags ──
  async listTags(): Promise<any> {
    const svc = this.getGtmService();
    const wp = await this.getWorkspacePath();
    return withResilience(async () => {
      const resp = await svc.accounts.containers.workspaces.tags.list({ parent: wp });
      const tags = (resp.data.tag || []).map(t => ({
        tagId: t.tagId, name: t.name, type: t.type,
        consentStatus: t.consentSettings?.consentStatus || "NONE",
        paused: t.paused || false,
        firingTriggerId: t.firingTriggerId || [],
      }));
      return { tags, count: tags.length };
    }, "gtm_list_tags");
  }

  async getTag(tagId: string): Promise<any> {
    const svc = this.getGtmService();
    const path = `${await this.getWorkspacePath()}/tags/${tagId}`;
    return withResilience(async () => {
      const resp = await svc.accounts.containers.workspaces.tags.get({ path });
      return resp.data;
    }, "gtm_get_tag");
  }

  async updateTag(tagId: string, updatesJson: string): Promise<any> {
    this.assertSandbox(await this.getWorkspaceId());
    const svc = this.getGtmService();
    const path = `${await this.getWorkspacePath()}/tags/${tagId}`;
    return withResilience(async () => {
      const current = (await svc.accounts.containers.workspaces.tags.get({ path })).data;
      const updates = JSON.parse(updatesJson);
      const merged = { ...current, ...updates };
      const resp = await svc.accounts.containers.workspaces.tags.update({
        path, requestBody: merged, fingerprint: current.fingerprint!,
      });
      return { updated: resp.data.name, tagId: resp.data.tagId };
    }, "gtm_update_tag");
  }

  async createTag(tagJson: string): Promise<any> {
    this.assertSandbox(await this.getWorkspaceId());
    const svc = this.getGtmService();
    const wp = await this.getWorkspacePath();
    return withResilience(async () => {
      const body = JSON.parse(tagJson);
      const resp = await svc.accounts.containers.workspaces.tags.create({ parent: wp, requestBody: body });
      return { created: resp.data.name, tagId: resp.data.tagId };
    }, "gtm_create_tag");
  }

  async listTriggers(): Promise<any> {
    const svc = this.getGtmService();
    const wp = await this.getWorkspacePath();
    return withResilience(async () => {
      const resp = await svc.accounts.containers.workspaces.triggers.list({ parent: wp });
      const triggers = (resp.data.trigger || []).map(t => ({ triggerId: t.triggerId, name: t.name, type: t.type }));
      return { triggers, count: triggers.length };
    }, "gtm_list_triggers");
  }

  async listVariables(): Promise<any> {
    const svc = this.getGtmService();
    const wp = await this.getWorkspacePath();
    return withResilience(async () => {
      const resp = await svc.accounts.containers.workspaces.variables.list({ parent: wp });
      const variables = (resp.data.variable || []).map(v => ({ variableId: v.variableId, name: v.name, type: v.type }));
      return { variables, count: variables.length };
    }, "gtm_list_variables");
  }

  async auditConsent(): Promise<any> {
    const rawTags = await this.listTags();
    const svc = this.getGtmService();
    const wp = await this.getWorkspacePath();
    // Need full tag data for consent classification
    const resp = await withResilience(
      async () => (await svc.accounts.containers.workspaces.tags.list({ parent: wp })).data,
      "gtm_audit_consent_fetch",
    );
    const tags = resp.tag || [];

    const noCons: any[] = [], notNeeded: any[] = [], configured: any[] = [];
    for (const tag of tags) {
      const entry = classifyTag(tag);
      const s = entry.currentStatus;
      if (s === "notSet" || s === "NONE" || s === "NOT_SET") noCons.push(entry);
      else if (s === "notNeeded" || s === "NOT_NEEDED") notNeeded.push(entry);
      else configured.push(entry);
    }
    const total = tags.length;
    return {
      summary: {
        total_tags: total, consent_configured: configured.length,
        no_consent: noCons.length, not_needed: notNeeded.length,
        compliance_pct: Math.round(configured.length / Math.max(total, 1) * 1000) / 10,
      },
      no_consent_configured: noCons, marked_not_needed: notNeeded,
      properly_configured: configured.map(t => ({ tagId: t.tagId, name: t.name, currentStatus: t.currentStatus })),
    };
  }

  async preview(): Promise<any> {
    this.assertSandbox(await this.getWorkspaceId());
    const svc = this.getGtmService();
    const wp = await this.getWorkspacePath();
    return withResilience(async () => {
      const resp = await svc.accounts.containers.workspaces.quick_preview({ path: wp });
      return resp.data;
    }, "gtm_preview");
  }

  async createVersion(name: string, notes?: string): Promise<any> {
    this.assertSandbox(await this.getWorkspaceId());
    const svc = this.getGtmService();
    const wp = await this.getWorkspacePath();
    return withResilience(async () => {
      const resp = await svc.accounts.containers.workspaces.create_version({
        path: wp, requestBody: { name, notes: notes || "" },
      });
      const v = resp.data.containerVersion || {};
      return { versionId: v.containerVersionId, name: v.name, path: v.path };
    }, "gtm_create_version");
  }

  // ── GA4 Reports ──
  private responseToRows(response: any): Record<string, string>[] {
    return (response.rows || []).map((row: any) => {
      const r: Record<string, string> = {};
      for (let i = 0; i < (response.dimensionHeaders || []).length; i++) {
        r[response.dimensionHeaders[i].name] = row.dimensionValues[i].value;
      }
      for (let i = 0; i < (response.metricHeaders || []).length; i++) {
        r[response.metricHeaders[i].name] = row.metricValues[i].value;
      }
      return r;
    });
  }

  async ga4RunReport(options: { dimensions?: string; metrics?: string; startDate?: string; endDate?: string; dimensionFilter?: string; limit?: number }): Promise<any> {
    const client = this.getDataClient();
    const dims = (options.dimensions || "eventName").split(",").map(d => ({ name: d.trim() })).filter(d => d.name);
    const mets = (options.metrics || "eventCount").split(",").map(m => ({ name: m.trim() })).filter(m => m.name);
    const startDate = options.startDate || "7daysAgo";
    const endDate = options.endDate || "today";
    const request: any = { property: `properties/${GA4_PROPERTY_ID}`, dimensions: dims, metrics: mets, dateRanges: [{ startDate, endDate }], limit: options.limit || 100 };
    if (options.dimensionFilter?.includes("==")) {
      const [f, v] = options.dimensionFilter.split("==", 2);
      request.dimensionFilter = { filter: { fieldName: f.trim(), stringFilter: { value: v.trim() } } };
    }
    return withResilience(async () => {
      const [resp] = await client.runReport(request);
      const rows = this.responseToRows(resp);
      return { rows, row_count: rows.length, date_range: `${startDate} to ${endDate}` };
    }, "ga4_run_report");
  }

  async ga4RealtimeReport(options: { dimensions?: string; metrics?: string; dimensionFilter?: string }): Promise<any> {
    const client = this.getDataClient();
    const dims = (options.dimensions || "eventName").split(",").map(d => ({ name: d.trim() })).filter(d => d.name);
    const mets = (options.metrics || "eventCount").split(",").map(m => ({ name: m.trim() })).filter(m => m.name);
    const request: any = { property: `properties/${GA4_PROPERTY_ID}`, dimensions: dims, metrics: mets };
    if (options.dimensionFilter?.includes("==")) {
      const [f, v] = options.dimensionFilter.split("==", 2);
      request.dimensionFilter = { filter: { fieldName: f.trim(), stringFilter: { value: v.trim() } } };
    }
    return withResilience(async () => {
      const [resp] = await client.runRealtimeReport(request);
      const rows = this.responseToRows(resp);
      return { rows, row_count: rows.length };
    }, "ga4_realtime_report");
  }

  async ga4ListCustomDimensions(): Promise<any> {
    const client = this.getAdminClient();
    return withResilience(async () => {
      const [dims] = await client.listCustomDimensions({ parent: `properties/${GA4_PROPERTY_ID}` });
      const items = (dims as any[]).map((d: any) => ({ name: d.displayName, parameter_name: d.parameterName, scope: String(d.scope), description: d.description || "" }));
      return { custom_dimensions: items, count: items.length };
    }, "ga4_list_custom_dimensions");
  }

  async ga4CreateCustomDimension(opts: { parameterName: string; displayName: string; scope?: string; description?: string }): Promise<any> {
    const client = this.getAdminClient();
    return withResilience(async () => {
      const [result] = await client.createCustomDimension({
        parent: `properties/${GA4_PROPERTY_ID}`,
        customDimension: { parameterName: opts.parameterName, displayName: opts.displayName, scope: (opts.scope?.toUpperCase() === "USER" ? "USER" : "EVENT") as any, description: opts.description || "" },
      });
      return { created: (result as any).displayName, parameter_name: (result as any).parameterName, scope: String((result as any).scope) };
    }, "ga4_create_custom_dimension");
  }
}

// ============================================
// MCP SERVER
// ============================================

const manager = new GtmGa4Manager();

const server = new Server({ name: SERVER_NAME, version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const ok = (data: any) => ({ content: [{ type: "text" as const, text: JSON.stringify(safeResponse(data, name), null, 2) }] });

  try {
    switch (name) {
      case "gtm_list_tags": return ok(await manager.listTags());
      case "gtm_get_tag": return ok(await manager.getTag(args?.tag_id as string));
      case "gtm_update_tag": return ok(await manager.updateTag(args?.tag_id as string, args?.updates_json as string));
      case "gtm_create_tag": return ok(await manager.createTag(args?.tag_json as string));
      case "gtm_list_triggers": return ok(await manager.listTriggers());
      case "gtm_list_variables": return ok(await manager.listVariables());
      case "gtm_audit_consent": return ok(await manager.auditConsent());
      case "gtm_preview": return ok(await manager.preview());
      case "gtm_create_version": return ok(await manager.createVersion(args?.name as string, args?.notes as string));
      case "ga4_run_report": return ok(await manager.ga4RunReport({ dimensions: args?.dimensions as string, metrics: args?.metrics as string, startDate: args?.start_date as string, endDate: args?.end_date as string, dimensionFilter: args?.dimension_filter as string, limit: args?.limit as number }));
      case "ga4_realtime_report": return ok(await manager.ga4RealtimeReport({ dimensions: args?.dimensions as string, metrics: args?.metrics as string, dimensionFilter: args?.dimension_filter as string }));
      case "ga4_list_custom_dimensions": return ok(await manager.ga4ListCustomDimensions());
      case "ga4_create_custom_dimension": return ok(await manager.ga4CreateCustomDimension({ parameterName: args?.parameter_name as string, displayName: args?.display_name as string, scope: args?.scope as string, description: args?.description as string }));
      default: throw new Error(`Unknown tool: ${name}`);
    }
  } catch (rawError: any) {
    if (rawError instanceof SafetyError) {
      return { content: [{ type: "text", text: JSON.stringify({ error: true, error_type: "SafetyError", message: rawError.message }, null, 2) }], isError: true };
    }
    const error = classifyError(rawError);
    logger.error({ error_type: error.name, message: error.message }, "Tool call failed");
    const response: Record<string, unknown> = { error: true, error_type: error.name, message: error.message };
    if (error instanceof GtmAuthError) response.action_required = "Check credentials and permissions.";
    else if (error instanceof GtmRateLimitError) { response.retry_after_ms = error.retryAfterMs; response.action_required = `Rate limited. Retry after ${Math.ceil(error.retryAfterMs / 1000)}s.`; }
    else if (error instanceof GtmServiceError) response.action_required = "API server error. Retry in a few minutes.";
    else response.details = rawError.stack;
    return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], isError: true };
  }
});

async function main() {
  try {
    const wsId = await manager.getWorkspaceId();
    console.error(`[startup] GTM workspace resolved: ${wsId} (${GTM_CONTAINER_PATH})`);
  } catch (err: any) {
    console.error(`[STARTUP WARNING] GTM workspace resolution failed: ${err.message}`);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[startup] MCP ${SERVER_NAME} server running`);
}

main().catch(console.error);

} // end else (non-auth mode)
