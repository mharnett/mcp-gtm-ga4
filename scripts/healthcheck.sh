#!/usr/bin/env bash
# Per-repo wrapper. Delegates to canonical MCP smoke test.
# This MCP requires env from ~/.claude.json mcpServers.<MCP_NAME>.env
# Usage: MCP_NAME=<your mcpServers key> scripts/healthcheck.sh
set -e
: "${MCP_NAME:?set MCP_NAME to the mcpServers key in ~/.claude.json}"
cd "$(dirname "$0")/.."
exec /Users/mark/claude-code/mcps/scripts/mcp-smoke.sh --mcp "$MCP_NAME" /Users/mark/claude-code/mcps/mcp-gtm-ga4/run-mcp.sh
