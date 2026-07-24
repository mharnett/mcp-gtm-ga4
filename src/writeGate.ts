import { createWriteGate } from "mcp-write-gate";

/**
 * Tools that mutate GTM/GA4 state. These are hidden from the tool list and
 * refused at call time unless GTM_GA4_MCP_WRITE=true.
 *
 * This server is launched by multiple client configs (flowspace-gtm,
 * neon-one-gtm, bluerose, imvu) — none of which set the flag — so every
 * session is read-only by default. Enabling writes is a deliberate,
 * per-session opt-in via the env var.
 *
 * Adding a new tool? Put it in this set if it creates, updates, deletes, or
 * publishes anything. The shape test in writeGate.test.ts enforces this by
 * name pattern.
 */
export const WRITE_TOOLS: ReadonlySet<string> = new Set([
  "gtm_create_tag",
  "gtm_update_tag",
  "gtm_create_variable",
  "gtm_update_variable",
  "gtm_delete_variable",
  "gtm_create_version",
  "gtm_ga4_create_custom_dimension",
]);

const gate = createWriteGate({
  writeTools: WRITE_TOOLS,
  envPrefix: "GTM_GA4",
});

export function isWriteTool(name: string): boolean {
  return gate.isWriteTool(name);
}

export function isWriteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return gate.isWriteEnabled(env);
}

export function filterTools<T extends { name: string }>(
  allTools: readonly T[],
  env: NodeJS.ProcessEnv = process.env,
): T[] {
  return gate.filterTools(allTools, env);
}

export const WRITE_DISABLED_MESSAGE =
  "Write operations are disabled. Set GTM_GA4_MCP_WRITE=true in the MCP server environment " +
  "to enable mutating tools (create/update/delete tags, variables, versions, custom dimensions).";

/**
 * Assert that a tool call is allowed under the current write-mode setting.
 * Throws a clear Error if the tool mutates state and writes are disabled.
 */
export function assertWriteAllowed(
  toolName: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  try {
    gate.assertWriteAllowed(toolName, env);
  } catch {
    throw new Error(
      `Tool "${toolName}" is a write operation. ${WRITE_DISABLED_MESSAGE}`,
    );
  }
}
