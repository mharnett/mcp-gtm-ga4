/**
 * gtmId() is the one check every Tag Manager id passes before it goes into a
 * REST path; the call-site suites (ids.callSite, ids.workspace.callSite,
 * ids.env) prove it is wired in. Here: what it accepts, and that each id the
 * tools take advertises the same rule in its input schema.
 */

import { describe, expect, it } from "vitest";

import { GTM_ID_PATTERN, gtmId } from "./ids.js";
import { tools } from "./tools.js";

describe("gtmId", () => {
  it.each(["0", "7", "13352304", "4703167440", "12345678901234567890"])("accepts %s", (id) => {
    expect(gtmId("tag", id)).toBe(id);
  });

  it("accepts a non-negative integer and returns it as a string", () => {
    expect(gtmId("variable", 21)).toBe("21");
  });

  it.each([
    "123/../456",
    "5?x=1",
    "",
    "abc",
    " 5",
    "-5",
    "1e3",
    "123456789012345678901", // 21 digits
    "٣", // Arabic-Indic digit three
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    null,
    undefined,
    true,
    ["5"],
  ])("refuses %j", (bad) => {
    expect(() => gtmId("container", bad)).toThrow(/^Invalid GTM container id /);
  });

  it("names the source in the message when one is given", () => {
    expect(() => gtmId("account", "x", "GTM_ACCOUNT_ID")).toThrow(/Invalid GTM account id "x" in GTM_ACCOUNT_ID/);
  });
});

describe("tool input schemas", () => {
  const idProps = tools.flatMap((t) =>
    Object.entries((t.inputSchema.properties ?? {}) as Record<string, any>)
      .filter(([prop]) => prop.endsWith("_id"))
      .map(([prop, schema]) => [t.name, prop, schema] as const),
  );

  it("cover the tag and variable id tools", () => {
    expect(idProps.map(([tool, prop]) => `${tool}.${prop}`).sort()).toEqual([
      "gtm_delete_variable.variable_id",
      "gtm_get_tag.tag_id",
      "gtm_get_variable.variable_id",
      "gtm_update_tag.tag_id",
      "gtm_update_variable.variable_id",
    ]);
  });

  it.each(idProps)("%s.%s carries the digits-only pattern", (_tool, _prop, schema) => {
    expect(schema.type).toBe("string");
    expect(schema.pattern).toBe(GTM_ID_PATTERN);
    expect(new RegExp(schema.pattern).test("123/../456")).toBe(false);
    expect(new RegExp(schema.pattern).test("123")).toBe(true);
  });
});
