#!/usr/bin/env bash
# Per-repo wrapper. Delegates to canonical MCP smoke test.
# This MCP requires env from ~/.claude.json mcpServers.neon-one-gtm.env
set -e
cd "$(dirname "$0")/.."
exec /Users/mark/claude-code/mcps/scripts/mcp-smoke.sh --mcp neon-one-gtm /Users/mark/claude-code/mcps/mcp-gtm-ga4/run-mcp.sh
