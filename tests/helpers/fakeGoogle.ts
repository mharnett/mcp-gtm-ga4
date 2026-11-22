/**
 * Recording stand-ins for googleapis (Tag Manager) and the GA4 Data and Admin
 * API clients, so tests can drive src/index.ts in-process without Google.
 *
 * Wire them in with vi.mock("googleapis"), vi.mock("@google-analytics/data")
 * and vi.mock("@google-analytics/admin") (see writeGate.callSite.test.ts).
 * Every auth object, client and API call lands in `recorder`; a test sets
 * `recorder.fail` to make every API call reject.
 */

export const FAKE_ENV: Record<string, string> = {
  GTM_ACCOUNT_ID: "6000000001",
  GTM_CONTAINER_ID: "7000000002",
  GTM_SANDBOX_WORKSPACE_ID: "42",
  GA4_PROPERTY_ID: "999000111",
  GOOGLE_APPLICATION_CREDENTIALS: "/nonexistent/fake-gtm-ga4-credentials.json",
};

export const WORKSPACE_PATH = `accounts/${FAKE_ENV.GTM_ACCOUNT_ID}/containers/${FAKE_ENV.GTM_CONTAINER_ID}/workspaces/${FAKE_ENV.GTM_SANDBOX_WORKSPACE_ID}`;

export interface RecordedCall {
  method: string;
  params: any;
}

export const recorder = {
  calls: [] as RecordedCall[],
  constructed: 0,
  fail: null as null | (() => Error),
  reset() {
    this.calls.length = 0;
    this.constructed = 0;
    this.fail = null;
  },
  callsTo(method: string) {
    return this.calls.filter((c) => c.method === method);
  },
};

function call(method: string, params: any, data: unknown) {
  recorder.calls.push({ method, params });
  if (recorder.fail) return Promise.reject(recorder.fail());
  return Promise.resolve(data);
}

const gtm = (method: string, data: (p: any) => unknown) => (params: any) => call(`gtm.${method}`, params, { data: data(params) });

const fakeTagmanager = {
  accounts: {
    containers: {
      workspaces: {
        list: gtm("workspaces.list", () => ({ workspace: [] })),
        quick_preview: gtm("workspaces.quick_preview", () => ({})),
        create_version: gtm("workspaces.create_version", (p) => ({ containerVersion: { containerVersionId: "9", name: p.requestBody.name, path: `${p.path}/versions/9` } })),
        tags: {
          list: gtm("tags.list", () => ({ tag: [] })),
          get: gtm("tags.get", () => ({ tagId: "11", name: "Existing tag", fingerprint: "fp-1" })),
          create: gtm("tags.create", (p) => ({ tagId: "12", name: p.requestBody.name })),
          update: gtm("tags.update", (p) => ({ tagId: "11", name: p.requestBody.name })),
        },
        triggers: {
          list: gtm("triggers.list", () => ({ trigger: [] })),
        },
        variables: {
          list: gtm("variables.list", () => ({ variable: [] })),
          get: gtm("variables.get", () => ({ variableId: "21", name: "Existing var", fingerprint: "fp-2" })),
          create: gtm("variables.create", (p) => ({ variableId: "22", name: p.requestBody.name })),
          update: gtm("variables.update", (p) => ({ variableId: "21", name: p.requestBody.name })),
          delete: gtm("variables.delete", () => ({})),
        },
      },
    },
  },
};

class FakeGoogleAuth {
  constructor(_opts?: unknown) {
    recorder.constructed += 1;
  }
}

export const fakeGoogleapisModule = {
  google: {
    auth: { GoogleAuth: FakeGoogleAuth },
    tagmanager: () => {
      recorder.constructed += 1;
      return fakeTagmanager;
    },
  },
  tagmanager_v2: {},
};

export class FakeBetaAnalyticsDataClient {
  constructor(_opts?: unknown) {
    recorder.constructed += 1;
  }
  runReport(request: any) {
    return call("ga4.runReport", request, [{ rows: [], dimensionHeaders: [], metricHeaders: [] }]);
  }
  runRealtimeReport(request: any) {
    return call("ga4.runRealtimeReport", request, [{ rows: [], dimensionHeaders: [], metricHeaders: [] }]);
  }
}

export class FakeAnalyticsAdminServiceClient {
  constructor(_opts?: unknown) {
    recorder.constructed += 1;
  }
  listCustomDimensions(request: any) {
    return call("ga4.listCustomDimensions", request, [[]]);
  }
  createCustomDimension(request: any) {
    const d = request.customDimension;
    return call("ga4.createCustomDimension", request, [{ displayName: d.displayName, parameterName: d.parameterName, scope: d.scope }]);
  }
}
