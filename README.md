# mcp-gtm-ga4

MCP server for Google Tag Manager and GA4 -- tag management, consent auditing, workspace versioning, and analytics reporting via Claude.

## Features

- **13 tools** spanning GTM workspace management (tags, triggers, variables), consent compliance auditing, workspace preview/versioning, and GA4 reporting
- **Sandbox safety** -- all write operations verify they target the resolved workspace, refusing to write to non-sandbox workspaces
- **Multi-client support** -- configure per-client via environment variables
- **Auto-detects Default Workspace ID** -- no need to manually specify workspace IDs unless using a custom sandbox

## Installation

```bash
npm install mcp-gtm-ga4
```

Or clone and build:

```bash
git clone https://github.com/drak-marketing/mcp-gtm-ga4.git
cd mcp-gtm-ga4
npm install
npm run build
```

## Configuration

All configuration is via environment variables. No `config.json` file is needed.

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | Path to a GCP service account JSON key file |
| `GTM_ACCOUNT_ID` | Yes | GTM account ID |
| `GTM_CONTAINER_ID` | Yes | GTM container ID |
| `GA4_PROPERTY_ID` | Yes | GA4 property ID |
| `GTM_SANDBOX_WORKSPACE_ID` | No | Override workspace ID (auto-detects Default Workspace if omitted) |
| `MCP_SERVER_NAME` | No | Server name (defaults to `neon-one-gtm`) |

See `config.example.json` for a reference template.

## Usage

### Claude Code (.mcp.json)

```json
{
  "mcpServers": {
    "gtm-ga4": {
      "command": "node",
      "args": ["/path/to/mcp-gtm-ga4/dist/index.js"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/path/to/service-account.json",
        "GTM_ACCOUNT_ID": "1234567890",
        "GTM_CONTAINER_ID": "9876543",
        "GA4_PROPERTY_ID": "331956119"
      }
    }
  }
}
```

### npx

```bash
GTM_ACCOUNT_ID=1234567890 \
GTM_CONTAINER_ID=9876543 \
GA4_PROPERTY_ID=331956119 \
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
npx mcp-gtm-ga4
```

## Safety

### Workspace sandbox protection

All write operations (`gtm_update_tag`, `gtm_create_tag`, `gtm_preview`, `gtm_create_version`) verify they target the resolved workspace before executing. If a request attempts to write to a different workspace, the server returns a `SafetyError` and blocks the operation.

This prevents accidental production changes when the MCP server is configured against a sandbox workspace.

## Tools

### GTM Tags

| Tool | Description |
|---|---|
| `gtm_list_tags` | List all tags in the workspace with consent status and firing triggers |
| `gtm_get_tag` | Get full tag configuration by tag ID |
| `gtm_update_tag` | Update an existing tag (merge patch via JSON) |
| `gtm_create_tag` | Create a new tag from a JSON definition |

### GTM Structure

| Tool | Description |
|---|---|
| `gtm_list_triggers` | List all triggers (ID, name, type) |
| `gtm_list_variables` | List all variables (ID, name, type) |

### GTM Consent

| Tool | Description |
|---|---|
| `gtm_audit_consent` | Audit all tags for consent configuration compliance |

### GTM Workspace

| Tool | Description |
|---|---|
| `gtm_preview` | Generate a quick preview of the current workspace |
| `gtm_create_version` | Create a new container version from the workspace |

### GA4 Reports

| Tool | Description |
|---|---|
| `ga4_run_report` | Run a GA4 report with dimensions, metrics, date range, and filters |
| `ga4_realtime_report` | Run a GA4 realtime report (last 30 minutes) |

### GA4 Admin

| Tool | Description |
|---|---|
| `ga4_list_custom_dimensions` | List all custom dimensions for the property |
| `ga4_create_custom_dimension` | Create a new custom dimension |

## Architecture

- **GTM API**: `googleapis` (Tag Manager v2)
- **GA4 Data**: `@google-analytics/data` (BetaAnalyticsDataClient)
- **GA4 Admin**: `@google-analytics/admin` (AnalyticsAdminServiceClient)
- **Resilience**: `cockatiel` (retry, circuit breaker, timeout policies)
- **Logging**: `pino` with `pino-pretty`
- **Transport**: MCP SDK stdio transport

## License

MIT

## Author

Built by Mark Harnett / [drak-marketing](https://github.com/drak-marketing)
