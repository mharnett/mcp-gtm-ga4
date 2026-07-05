// ============================================
// Callback-classification parity: helper <-> runtime must not drift.
// ============================================
// The `auth` subcommand (src/index.ts via authFlow.classifyCallbackRequest) and
// the standalone get-refresh-token.cjs helper each handle the loopback redirect.
// A stray hit on /callback with NO code and NO error (browser preflight/HEAD,
// URL prefetch, tab refresh) must be IGNORED (204) by BOTH — never treated as a
// CSRF state mismatch, which would tear the server down before Google's real
// redirect arrives. This test asserts both classify identically for every case,
// so the ordering can't drift between the two copies again.

import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const helper = require("./get-refresh-token.cjs");

let rt; // runtime classifyCallbackRequest
beforeAll(async () => {
  rt = (await import("./dist/authFlow.js")).classifyCallbackRequest;
});

const EXPECTED = "expected-state";
const p = (params) => new URLSearchParams(params);

// Each case: [name, pathname, params]. Both copies must agree on `kind`.
const CASES = [
  ["wrong path (favicon)", "/favicon.ico", {}],
  ["error param (denied)", "/callback", { error: "access_denied" }],
  ["STRAY hit: no code, no error", "/callback", {}],
  ["STRAY hit: state only, no code", "/callback", { state: "whatever" }],
  ["code + mismatched state (csrf)", "/callback", { code: "abc", state: "wrong" }],
  ["code + matching state (success)", "/callback", { code: "abc", state: EXPECTED }],
];

describe("helper and runtime classify the loopback callback IDENTICALLY", () => {
  it("both expose classifyCallbackRequest", () => {
    expect(typeof helper.classifyCallbackRequest).toBe("function");
    expect(typeof rt).toBe("function");
  });

  for (const [name, pathname, params] of CASES) {
    it(`agree on: ${name}`, () => {
      const h = helper.classifyCallbackRequest(pathname, p(params), EXPECTED);
      const r = rt(pathname, p(params), EXPECTED);
      expect(h.kind).toBe(r.kind);
    });
  }

  it("a stray /callback hit (no code/error) is IGNORE for BOTH — not csrf", () => {
    const h = helper.classifyCallbackRequest("/callback", p({}), EXPECTED);
    const r = rt("/callback", p({}), EXPECTED);
    expect(h.kind).toBe("ignore");
    expect(r.kind).toBe("ignore");
  });

  it("success returns the code for BOTH", () => {
    const h = helper.classifyCallbackRequest("/callback", p({ code: "abc", state: EXPECTED }), EXPECTED);
    const r = rt("/callback", p({ code: "abc", state: EXPECTED }), EXPECTED);
    expect(h.kind).toBe("success");
    expect(r.kind).toBe("success");
    expect(h.code).toBe("abc");
    expect(r.code).toBe("abc");
  });
});
