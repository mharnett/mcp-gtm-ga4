# Changelog

## [1.0.11] - 2026-04-04

### Breaking Changes
- Tools renamed from `ga4_*` to `gtm_ga4_*` prefix to avoid collision with standalone mcp-ga4 server

### Security
- Error responses now pass through `safeResponse` to prevent oversized error payloads
- `safeResponse` deep-clones before truncation to avoid mutating original data

## [1.0.7] - 2026-04-09

### Added
- Rewritten from Python to TypeScript
- CLI flags (--help, --version)
- SIGTERM/SIGINT graceful shutdown
- Env var trimming and validation

### Security
- All logging to stderr (stdout reserved for MCP protocol)
- Auth errors not retried (fail fast on 401/403)
