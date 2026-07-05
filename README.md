# mcp-gtm-ga4

MCP server for Google Tag Manager and GA4 -- tag management, consent auditing, workspace versioning, and analytics reporting via Claude.

## Features

- **14 tools** spanning GTM workspace management (tags, triggers, variables), consent compliance auditing, workspace preview/versioning, and GA4 reporting
- **Sandbox safety** -- all write operations verify they target the resolved workspace, refusing to write to non-sandbox workspaces
- **Multi-client support** -- configure per-client via environment variables
- **Auto-detects Default Workspace ID** -- no need to manually specify workspace IDs unless using a custom sandbox

## Installation

```bash
npm install mcp-gtm-ga4
```

Or clone and build:

```bash
git clone https://github.com/mharnett/mcp-gtm-ga4.git
cd mcp-gtm-ga4
npm install
npm run build
```

## Configuration

**Security:** Never share your `.mcp.json` file or commit it to git -- it may contain API credentials. Add `.mcp.json` to your `.gitignore`.

Runtime configuration is via environment variables.

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | Path to a Google credential JSON key file (service account **or** authorized-user — see Authentication below) |
| `GTM_ACCOUNT_ID` | Yes | GTM account ID |
| `GTM_CONTAINER_ID` | Yes | GTM container ID |
| `GA4_PROPERTY_ID` | Yes | GA4 property ID |
| `GTM_SANDBOX_WORKSPACE_ID` | No | Override workspace ID (auto-detects Default Workspace if omitted) |
| `MCP_SERVER_NAME` | No | Server name (defaults to package name `mcp-gtm-ga4`) |

See `config.example.json` for a reference template. The only value read from disk is `oauth.scope` (in an optional `config.json`) — the single source of truth for the OAuth scope the onboarding paths request. If no `config.json` is present, the committed minimum scope is used.

## Authentication

This MCP supports **two** auth models. Both feed the same `GOOGLE_APPLICATION_CREDENTIALS` runtime path.

### Precedence & mechanism

There is **no runtime service-account-vs-OAuth toggle**. Both models converge on a
single slot — `GOOGLE_APPLICATION_CREDENTIALS` — which the runtime hands to
`GoogleAuth({ keyFile })`. Whichever file you point that env var at *is* the
credential:

- a **service-account JSON key** (option 1 below), or
- the **`authorized_user` keyfile** the `auth` subcommand writes (option 2) — a
  file that plugs into the exact same slot.

So the only real precedence rule is failure handling: **an explicitly-configured
keyfile is used; when `GOOGLE_APPLICATION_CREDENTIALS` is unset the server fails
loudly at startup** with an onboarding error naming both the service-account path
and the `auth` OAuth helper. It deliberately does **not** fall back to Google's
Application Default Credentials (gcloud user creds / GCE metadata server) — no
silent machine-local default, no silent runtime failover.

### 1. Service account (primary, recommended for unattended/server use)

Create a service account in your GCP project, download its JSON key, grant it the
GTM container role (on the target GTM container) and GA4 property access, and
point `GOOGLE_APPLICATION_CREDENTIALS` at the key file. No OAuth flow, no browser,
no refresh token. **This is the recommended path for headless/server/unattended
deployments.**

### 2. User OAuth (interactive, for users without a service account)

If you can't use a service account, mint a user credential with your **own** Google OAuth client (a "Desktop app" OAuth 2.0 Client ID created in your own GCP project — enable the Tag Manager API and the Google Analytics Admin + Data APIs). Two equivalent onboarding commands, both hardened with PKCE (RFC 7636, S256) and both requesting the scope from `config.json` (`oauth.scope`) so they never drift:

```bash
export GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
export GOOGLE_CLIENT_SECRET=your-client-secret

# Option A: write an authorized_user credential file directly
node dist/index.js auth --output ./gtm-ga4-credentials.json
# then set GOOGLE_APPLICATION_CREDENTIALS=./gtm-ga4-credentials.json

# Option B: the standalone helper (prints GOOGLE_REFRESH_TOKEN + a ready-to-save
# authorized_user JSON you can write to a file for GOOGLE_APPLICATION_CREDENTIALS)
node get-refresh-token.cjs
```

The refresh token / credential is written by you and read from your environment only. Nothing is shared and no OAuth client keyfile is bundled. **Do not** run the helper with stdout redirected to a shared log — the refresh token is printed to stdout by design.

### OAuth scopes requested

The onboarding paths request exactly the scopes this MCP's tools use (from `config.example.json` → `oauth.scope`):

| Scope | Needed by |
|---|---|
| `tagmanager.edit.containers` | `gtm_create_tag`, `gtm_update_tag`, `gtm_create_variable`, `gtm_update_variable`, `gtm_delete_variable`, tag/trigger/variable reads |
| `tagmanager.edit.containerversions` | `gtm_create_version` |
| `tagmanager.publish` | `gtm_create_version`, `gtm_preview` (quick preview) |
| `analytics.readonly` | `gtm_ga4_run_report`, `gtm_ga4_realtime_report`, `gtm_ga4_list_custom_dimensions` |
| `analytics.edit` | `gtm_ga4_create_custom_dimension` |

`tagmanager.readonly` is intentionally **not** requested — the edit scopes already grant read access.

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

**Claude Desktop:** Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).

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
| `gtm_ga4_run_report` | Run a GA4 report with dimensions, metrics, date range, and filters |
| `gtm_ga4_realtime_report` | Run a GA4 realtime report (last 30 minutes) |

### GA4 Admin

| Tool | Description |
|---|---|
| `gtm_ga4_list_custom_dimensions` | List all custom dimensions for the property |
| `gtm_ga4_create_custom_dimension` | Create a new custom dimension |

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
