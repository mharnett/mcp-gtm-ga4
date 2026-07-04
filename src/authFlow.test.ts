// ============================================
// Onboarding auth-flow builders + auth-mode selection.
// ============================================
// These are the pure, offline pieces of the `auth` subcommand: the auth URL must
// carry PKCE S256 + the config-resolved scope + the canonical loopback redirect;
// the token-exchange body must carry the code_verifier (PKCE proof); auth-mode
// selection decides between the user-OAuth onboarding path and the service-account
// runtime path; and env validation must produce a clear error when client creds
// are missing.

import { describe, it, expect } from "vitest";
import {
  buildAuthUrl,
  buildTokenExchangeBody,
  requireClientCreds,
  resolveAuthMode,
  classifyCallbackRequest,
  OAUTH_SCOPE,
} from "./authFlow.js";
import { buildLoopbackRedirectUri, computeCodeChallenge } from "./pkce.js";

const redirectUri = buildLoopbackRedirectUri(8095);

describe("buildAuthUrl carries PKCE + canonical redirect + config scope", () => {
  const url = new URL(
    buildAuthUrl({
      clientId: "cid.apps.googleusercontent.com",
      redirectUri,
      state: "state123",
      codeChallenge: "CHAL",
      scope: OAUTH_SCOPE,
    }),
  );

  it("targets Google's auth endpoint", () => {
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  });

  it("sends code_challenge + code_challenge_method=S256", () => {
    expect(url.searchParams.get("code_challenge")).toBe("CHAL");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("keeps access_type=offline + prompt=consent (required for a refresh token)", () => {
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("uses the canonical loopback redirect form (http://localhost:<port>/callback)", () => {
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:8095/callback");
  });

  it("requests the config-resolved scope", () => {
    expect(url.searchParams.get("scope")).toBe(OAUTH_SCOPE);
  });

  it("a real S256 challenge round-trips through the URL unchanged", () => {
    const challenge = computeCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
    const u = new URL(
      buildAuthUrl({ clientId: "c", redirectUri, state: "s", codeChallenge: challenge, scope: OAUTH_SCOPE }),
    );
    expect(u.searchParams.get("code_challenge")).toBe(challenge);
  });
});

describe("buildTokenExchangeBody carries code_verifier (PKCE) + client_secret", () => {
  it("body has grant_type, code, code_verifier, client_secret, redirect_uri", () => {
    const body = buildTokenExchangeBody({
      code: "AUTH_CODE",
      clientId: "cid",
      clientSecret: "secret",
      redirectUri,
      codeVerifier: "VERIFIER",
    });
    const p = new URLSearchParams(body);
    expect(p.get("grant_type")).toBe("authorization_code");
    expect(p.get("code")).toBe("AUTH_CODE");
    expect(p.get("code_verifier")).toBe("VERIFIER"); // PKCE proof
    expect(p.get("client_secret")).toBe("secret"); // confidential client — additive
    expect(p.get("client_id")).toBe("cid");
    expect(p.get("redirect_uri")).toBe(redirectUri);
  });
});

describe("requireClientCreds", () => {
  it("returns trimmed creds when both present", () => {
    expect(
      requireClientCreds({ GOOGLE_CLIENT_ID: "  id  ", GOOGLE_CLIENT_SECRET: "sec" }),
    ).toEqual({ clientId: "id", clientSecret: "sec" });
  });

  it("throws naming BOTH missing vars when neither is set", () => {
    expect(() => requireClientCreds({})).toThrow(/GOOGLE_CLIENT_ID/);
    expect(() => requireClientCreds({})).toThrow(/GOOGLE_CLIENT_SECRET/);
  });

  it("throws naming only the missing var", () => {
    expect(() => requireClientCreds({ GOOGLE_CLIENT_ID: "id" })).toThrow(
      /GOOGLE_CLIENT_SECRET/,
    );
    try {
      requireClientCreds({ GOOGLE_CLIENT_ID: "id" });
    } catch (e) {
      expect((e as Error).message).not.toMatch(/GOOGLE_CLIENT_ID\b(?!.*SECRET)/);
    }
  });
});

describe("classifyCallbackRequest — loopback redirect handling", () => {
  const EXPECTED = "expected-state";
  const p = (params: Record<string, string>) => new URLSearchParams(params);

  it("wrong path -> not-found (ignore favicon/etc)", () => {
    expect(classifyCallbackRequest("/favicon.ico", p({}), EXPECTED).kind).toBe("not-found");
  });

  it("error param -> denied (before any state check)", () => {
    const r = classifyCallbackRequest("/callback", p({ error: "access_denied" }), EXPECTED);
    expect(r.kind).toBe("denied");
  });

  it("a stray request to /callback with NO code/error -> ignore (204), NOT a CSRF reject", () => {
    // This is the bug the extraction fixes: a preflight/no-param hit on /callback
    // must not be treated as a state mismatch and tear the server down.
    expect(classifyCallbackRequest("/callback", p({}), EXPECTED).kind).toBe("ignore");
  });

  it("code present but state mismatched -> csrf", () => {
    const r = classifyCallbackRequest("/callback", p({ code: "abc", state: "wrong" }), EXPECTED);
    expect(r.kind).toBe("csrf");
  });

  it("code present with matching state -> success (returns the code)", () => {
    const r = classifyCallbackRequest("/callback", p({ code: "abc", state: EXPECTED }), EXPECTED);
    expect(r.kind).toBe("success");
    if (r.kind === "success") expect(r.code).toBe("abc");
  });
});

describe("resolveAuthMode — user-OAuth onboarding vs service-account runtime", () => {
  it("argv[0]==='auth' selects the OAuth onboarding path", () => {
    expect(resolveAuthMode(["auth", "--output", "x"])).toBe("oauth");
  });

  it("no 'auth' subcommand selects the service-account runtime path", () => {
    expect(resolveAuthMode([])).toBe("service-account");
    expect(resolveAuthMode(["--help"])).toBe("service-account");
  });

  it("'auth' must be the first arg (a later 'auth' token is not the subcommand)", () => {
    expect(resolveAuthMode(["--foo", "auth"])).toBe("service-account");
  });

  // The live dispatch in index.ts calls resolveAuthMode(process.argv.slice(2)).
  // Pin that contract: fed a process-style argv (node, script, ...user args),
  // the sliced result must select "oauth" iff the first USER arg is "auth" —
  // exactly what the old inline `process.argv[2] === "auth"` check did, so the
  // rewire through the tested abstraction is behavior-preserving.
  it("governs the live dispatch: process.argv.slice(2) selects oauth iff argv[2]==='auth'", () => {
    const asProcessArgv = (userArgs) => ["node", "/path/dist/index.js", ...userArgs];
    for (const userArgs of [["auth"], ["auth", "--output", "x"]]) {
      const argv = asProcessArgv(userArgs);
      expect(resolveAuthMode(argv.slice(2))).toBe("oauth");
      expect(resolveAuthMode(argv.slice(2)) === "oauth").toBe(argv[2] === "auth");
    }
    for (const userArgs of [[], ["--help"], ["-v"], ["--foo", "auth"]]) {
      const argv = asProcessArgv(userArgs);
      expect(resolveAuthMode(argv.slice(2))).toBe("service-account");
      expect(resolveAuthMode(argv.slice(2)) === "oauth").toBe(argv[2] === "auth");
    }
  });
});
