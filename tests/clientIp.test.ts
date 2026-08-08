import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { _resetEnv } from "../src/lib/env";

const MOCK_REMOTE = "203.0.113.5";

function mockGetRequest(headers: Record<string, string>) {
  const request = {
    headers: new Map(Object.entries(headers)),
    runtime: {
      node: {
        req: {
          socket: { remoteAddress: MOCK_REMOTE },
        },
      },
    },
  };
  vi.doMock("@tanstack/react-start/server", () => ({
    getRequest: () => request,
  }));
}

async function getClientIpWith(env: Record<string, string>): Promise<string> {
  Object.assign(process.env, env);
  _resetEnv();
  const { getClientIp } = await import("../src/server/auth/clientIp");
  return getClientIp();
}

describe("getClientIp", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.JWT_SECRET ||= "0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    delete process.env.TRUST_PROXY;
    vi.doUnmock("@tanstack/react-start/server");
    _resetEnv();
  });

  it("ignores x-forwarded-for when TRUST_PROXY is off", async () => {
    mockGetRequest({ "x-forwarded-for": "6.6.6.6" });
    const ip = await getClientIpWith({ TRUST_PROXY: "0" });
    expect(ip).toBe(MOCK_REMOTE);
  });

  it("uses x-forwarded-for when TRUST_PROXY is on", async () => {
    mockGetRequest({ "x-forwarded-for": "6.6.6.6" });
    const ip = await getClientIpWith({ TRUST_PROXY: "1" });
    expect(ip).toBe("6.6.6.6");
  });

  it("falls back to socket remote address without headers", async () => {
    mockGetRequest({});
    const ip = await getClientIpWith({ TRUST_PROXY: "0" });
    expect(ip).toBe(MOCK_REMOTE);
  });

  it("falls back to localhost when no socket info", async () => {
    const request = {
      headers: new Map(),
      runtime: { node: { req: {} } },
    };
    vi.doMock("@tanstack/react-start/server", () => ({
      getRequest: () => request,
    }));
    const ip = await getClientIpWith({ TRUST_PROXY: "0" });
    expect(ip).toBe("127.0.0.1");
  });
});
