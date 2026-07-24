# Changelog

## [1.3.0](https://github.com/mharnett/mcp-gtm-ga4/compare/v1.2.0...v1.3.0) (2026-07-24)


### Features

* write gate via mcp-write-gate — read-only by default ([1908241](https://github.com/mharnett/mcp-gtm-ga4/commit/190824172e87831786e17c73a2e845c93ebc4082))

## [1.2.0](https://github.com/mharnett/mcp-gtm-ga4/compare/v1.1.0...v1.2.0) (2026-07-09)


### Features

* **oauth:** publishable PKCE + dual service-account/OAuth decouple ([#5](https://github.com/mharnett/mcp-gtm-ga4/issues/5)) ([55300e5](https://github.com/mharnett/mcp-gtm-ga4/commit/55300e5bd49a3b10295fb7f7dd2e7f303639a1da))


### Bug Fixes

* **ci:** regenerate lockfile to resolve mcp-updatenotifier from the registry ([#4](https://github.com/mharnett/mcp-gtm-ga4/issues/4)) ([efa11b2](https://github.com/mharnett/mcp-gtm-ga4/commit/efa11b266ba864158e98e1bb4fee67b93ba5891f))
* depend on mcp-updatenotifier from the registry (^1.0.0) ([#3](https://github.com/mharnett/mcp-gtm-ga4/issues/3)) ([a57d7d9](https://github.com/mharnett/mcp-gtm-ga4/commit/a57d7d9573c85439caf70609db8ab3a398ecbd42))

## [1.1.0](https://github.com/mharnett/mcp-gtm-ga4/compare/v1.0.0...v1.1.0) (2026-07-09)


### Features

* add variable CRUD (get / create / update / delete) ([67efaae](https://github.com/mharnett/mcp-gtm-ga4/commit/67efaae23b8a575371b3c569c8f2aa6b383ea975))
* **oauth:** publishable PKCE + dual service-account/OAuth decouple ([#5](https://github.com/mharnett/mcp-gtm-ga4/issues/5)) ([55300e5](https://github.com/mharnett/mcp-gtm-ga4/commit/55300e5bd49a3b10295fb7f7dd2e7f303639a1da))


### Bug Fixes

* add tagmanager.publish OAuth scope ([2075558](https://github.com/mharnett/mcp-gtm-ga4/commit/2075558b3b4ad4049aa376e784ffdcb01d107c51))
* **ci:** regenerate lockfile to resolve mcp-updatenotifier from the registry ([#4](https://github.com/mharnett/mcp-gtm-ga4/issues/4)) ([efa11b2](https://github.com/mharnett/mcp-gtm-ga4/commit/efa11b266ba864158e98e1bb4fee67b93ba5891f))
* depend on mcp-updatenotifier from the registry (^1.0.0) ([#3](https://github.com/mharnett/mcp-gtm-ga4/issues/3)) ([a57d7d9](https://github.com/mharnett/mcp-gtm-ga4/commit/a57d7d9573c85439caf70609db8ab3a398ecbd42))
* error server prefix, isError consistency, validateCredentials, CHANGELOG ([01f31d0](https://github.com/mharnett/mcp-gtm-ga4/commit/01f31d0f63709e1245cf68765b20b6a461b4ff6c))
* error size limits, safeResponse mutation, CHANGELOG, security warnings ([2ce9a7c](https://github.com/mharnett/mcp-gtm-ga4/commit/2ce9a7c17bf8d2cc45b5504b4e1b4fc405871cf7))
* ID validation, path resolution, health tools, descriptions ([dfd7679](https://github.com/mharnett/mcp-gtm-ga4/commit/dfd76798106c55913a10769fc42007fad6080d50))
* Node 18.18 minimum, env var trimming, unhandledRejection, TTY guard ([a62e2b8](https://github.com/mharnett/mcp-gtm-ga4/commit/a62e2b8c7c31ccb62586cc7071a0dba9f36a6b1f))
* README accuracy, env var docs, dependency cleanup ([7f09fef](https://github.com/mharnett/mcp-gtm-ga4/commit/7f09fef87381555e82c01c800c9e7228bc52f7a1))
* startup checks, credential redaction, schema hardening, format validation ([70caf6f](https://github.com/mharnett/mcp-gtm-ga4/commit/70caf6fd5abdb2ef97abd4d8e1e7ae979dd7eb0c))
* stderr logging, Linux/Docker compat, SIGPIPE, version fallback ([52b4577](https://github.com/mharnett/mcp-gtm-ga4/commit/52b4577950b2b105dbe69487e8a006e85f333368))
* version field, safeResponse loop, auth retry, SIGTERM handling ([4a6ca0b](https://github.com/mharnett/mcp-gtm-ga4/commit/4a6ca0b8f53a7d17b781f9c96ee84ae0f271b402))

## [1.0.14] - 2026-04-18

### Added
- **Startup npm outdated check.** At server boot, fires a fire-and-forget
  HTTP request to `registry.npmjs.org/mcp-gtm-ga4/latest` (2s timeout) and
  logs a stderr notice when a newer version is available. stdout stays
  reserved for MCP JSON-RPC. Silent on network error, timeout, or when
  installed matches registry. Opt out with `MCP_DISABLE_UPDATE_CHECK=1`.

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
