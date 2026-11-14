/**
 * README ↔ registered tools. The README states a tool count and lists every
 * tool in tables; both must match what src/tools.ts registers, and the
 * read/write split must match WRITE_TOOLS. A stated "14 tools" when 18 were
 * registered went unnoticed until the install rollout (2026-11-13).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { tools } from "./tools.js";
import { WRITE_TOOLS } from "./writeGate.js";

const README = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "README.md"), "utf8");

describe("README matches the registered tools", () => {
  it("states the total, read and write-gated counts", () => {
    const total = tools.length;
    const write = tools.filter((t) => WRITE_TOOLS.has(t.name)).length;
    const m = /\*\*(\d+) tools\*\*\s*\((\d+) read, (\d+) write-gated\)/.exec(README);
    expect(m, "README must say '**N tools** (R read, W write-gated)'").not.toBeNull();
    expect([Number(m![1]), Number(m![2]), Number(m![3])]).toEqual([total, total - write, write]);
  });

  it("lists every registered tool in a table row, and no unregistered ones", () => {
    const listed = [...README.matchAll(/^\|\s*`(gtm_[a-z_0-9]+)`\s*\|/gm)].map((x) => x[1]).sort();
    expect(listed).toEqual(tools.map((t) => t.name).sort());
  });
});
