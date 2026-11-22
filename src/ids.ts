/**
 * Tag Manager ids go into REST paths unescaped
 * (accounts/<a>/containers/<c>/workspaces/<w>/tags/<t>), so an id holding a
 * "/" or ".." would address a different container, and one holding "?" or "#"
 * would change the request. Every Tag Manager id is numeric, so each one is
 * checked here before a path is built or any call is made.
 */

export type GtmIdKind = "account" | "container" | "workspace" | "tag" | "variable";

/** Digits only. Also advertised as the `pattern` on each id in the tool input schemas. */
export const GTM_ID_PATTERN = "^[0-9]{1,20}$";
const GTM_ID_RE = new RegExp(GTM_ID_PATTERN);

function describeValue(value: unknown): string {
  if (value === undefined) return "(missing)";
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/**
 * Return `value` as a validated id string, or throw before anything is sent.
 * Accepts a digits-only string or a non-negative safe integer (some clients
 * send numbers). `source` names where the value came from, e.g. an env var.
 */
export function gtmId(kind: GtmIdKind, value: unknown, source?: string): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && GTM_ID_RE.test(value)) return value;
  throw new Error(
    `Invalid GTM ${kind} id ${describeValue(value)}${source ? ` in ${source}` : ""}: ` +
      "expected a numeric id (digits only). Nothing was sent.",
  );
}
