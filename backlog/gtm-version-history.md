# Backlog: gtm_list_versions / version history tool

## What
Add a `gtm_list_versions` tool that calls `GET /tagmanager/v2/accounts/{accountId}/containers/{containerId}/version_headers` and returns the N most recent published versions (containerVersionId, name, description, deleted flag, fingerprint).

## Why
Currently the only way to check whether a workspace change has been published to production is to hit the API directly with a service account token — there's no MCP tool for it. Came up when verifying Phase 1 (form_type cutover) was live.

## Shape
```
gtm_list_versions(limit?: number = 10) → [{ version_id, name, description, deleted }]
```

Readonly — no publish action, just the header list. Pairs well with `gtm_create_version`.

## Scope
Small. The endpoint is already authenticated via the same service account used by all other GTM tools.
