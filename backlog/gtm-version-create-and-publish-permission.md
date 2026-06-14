# GTM token scope blocks version-create + publish

**Status:** Backlog
**Discovered:** 2026-04-17 (sandbox version create) and confirmed 2026-04-22 (Survey Measure launch publish)
**Blocking:** any programmatic GTM publish flow

## Problem

`mcp__gtm-ga4__gtm_create_version` returns `"Not found or permission denied."` from the Google Tag Manager API. Read + edit operations on the same workspace work fine (`list_tags`, `create_tag`, `update_tag`, `audit_consent`, `preview`) — only version creation (and by extension, publish) is denied.

Likely cause: the OAuth credential the MCP uses (`/Users/mark/.config/google-oauth/bluerose-gtm.json` for the Survey Measure container) was minted with a token scope that includes `tagmanager.edit.containers` but not `tagmanager.publish` or `tagmanager.edit.containerversions`.

There's also no `gtm_publish_version` tool in the MCP — only `gtm_create_version` (which "Does NOT publish"). So the publish path needs a second tool too.

## Required scopes (per Google docs)

To create + publish container versions:
- `https://www.googletagmanager.com/auth/tagmanager.edit.containerversions`
- `https://www.googletagmanager.com/auth/tagmanager.publish`

## Fix sketch

1. **Re-auth** with the additional scopes for any container we want to publish from. Update the doctor CLI / install instructions accordingly.
2. **Add `gtm_publish_version` tool** with input `version_id` (from a prior `gtm_create_version`) — calls `accounts.containers.versions.publish`.
3. **Optional: add `gtm_create_and_publish` convenience tool** that chains both, since "create version + publish" is the common flow. Document that it's the only path that mutates production tracking and requires explicit user approval per `feedback_gtm_ask_before_publish.md`.

## TDD requirements

Strict red/green/refactor. TDD log it. Tests should mock the GTM API and verify:
- `gtm_create_version` requires `tagmanager.edit.containerversions` scope (sentinel test)
- `gtm_publish_version` requires `tagmanager.publish` scope
- The convenience tool calls create then publish in order; if create fails, publish is not attempted
- Permission errors surface with actionable messages mentioning the missing scope

## Estimated effort

Re-auth: 5 min. Tool additions: ~150 LOC, ~6 TDD cycles. ~2 hours total.

## Workaround until fixed

Publish via the GTM web UI: Submit → Publish. Mark did this for the Survey Measure v1.0 publish on 2026-04-22.
