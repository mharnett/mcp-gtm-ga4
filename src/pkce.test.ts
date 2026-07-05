// ============================================
// Runtime PKCE (RFC 7636) + canonical loopback redirect form.
// ============================================
// The `auth` onboarding subcommand (src/index.ts runAuth) and the standalone
// get-refresh-token.cjs helper must use the SAME S256 PKCE and the SAME loopback
// redirect form, so a token minted by one path is valid for the other.

import { describe, it, expect } from "vitest";
import {
  base64url,
  generateCodeVerifier,
  computeCodeChallenge,
  buildLoopbackRedirectUri,
  LOOPBACK_HOST,
  LOOPBACK_PATH,
} from "./pkce.js";

describe("runtime PKCE (RFC 7636)", () => {
  it("code_verifier is 43–128 chars of the unreserved set", () => {
    for (let i = 0; i < 30; i++) {
      const v = generateCodeVerifier();
      expect(v.length).toBeGreaterThanOrEqual(43);
      expect(v.length).toBeLessThanOrEqual(128);
      expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
    }
  });

  it("code_challenge matches the RFC 7636 Appendix B vector (S256)", () => {
    expect(computeCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("code_challenge is url-safe with no padding", () => {
    const c = computeCodeChallenge(generateCodeVerifier());
    expect(c).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(c).not.toContain("=");
  });

  it("base64url strips padding and is url-safe", () => {
    const b = base64url(Buffer.from([251, 239, 190, 0, 1, 2, 3, 255]));
    expect(b).not.toContain("=");
    expect(b).not.toContain("+");
    expect(b).not.toContain("/");
  });
});

describe("canonical loopback redirect form (shared with the helper)", () => {
  it("uses host `localhost` and path `/callback`", () => {
    expect(LOOPBACK_HOST).toBe("localhost");
    expect(LOOPBACK_PATH).toBe("/callback");
  });

  it("builds http://localhost:<port>/callback", () => {
    expect(buildLoopbackRedirectUri(8123)).toBe("http://localhost:8123/callback");
    expect(buildLoopbackRedirectUri(8095)).toBe("http://localhost:8095/callback");
  });
});
