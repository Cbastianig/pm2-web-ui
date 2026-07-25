import { describe, it, expect, beforeEach } from "vitest";
import {
  checkLoginWindow,
  getPenalty,
  registerFailedAttempt,
  clearFailedAttempts,
  checkUnauthWindow,
} from "../src/server/auth/rateLimit";

describe("checkLoginWindow", () => {
  beforeEach(() => {
    process.env.LOGIN_WINDOW_MS = "600000";
    process.env.LOGIN_MAX_REQUESTS = "12";
  });

  it("allows first attempt", () => {
    const result = checkLoginWindow("test-identity", Date.now());
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  it("blocks after exceeding max requests", () => {
    const now = Date.now();
    for (let i = 0; i < 12; i++) {
      checkLoginWindow("blocked-identity", now);
    }
    const result = checkLoginWindow("blocked-identity", now);
    expect(result.allowed).toBe(false);
  });

  it("allows new window after expiration", () => {
    const now = Date.now();
    const windowMs = 500;
    for (let i = 0; i < 3; i++) {
      checkLoginWindow("expired-id", now);
    }
    const result = checkLoginWindow("expired-id", now + windowMs + 1);
    expect(result.allowed).toBe(true);
  });
});

describe("registerFailedAttempt / getPenalty", () => {
  beforeEach(() => {
    process.env.LOGIN_FAILURE_WINDOW_MS = "30000";
    process.env.LOGIN_MAX_LOCKOUT_MS = "60000";
  });

  it("no penalty on first failure", () => {
    const id = "first-fail";
    const lockout = registerFailedAttempt(id, Date.now());
    expect(lockout).toBe(0);
    expect(getPenalty(id, Date.now())).toBe(0);
  });

  it("no penalty on second failure", () => {
    const id = "second-fail";
    registerFailedAttempt(id, Date.now());
    const lockout = registerFailedAttempt(id, Date.now() + 1000);
    expect(lockout).toBe(0);
  });

  it("locks out on third failure", () => {
    const id = "third-fail";
    const now = Date.now();
    registerFailedAttempt(id, now);
    registerFailedAttempt(id, now + 1000);
    const lockout = registerFailedAttempt(id, now + 2000);
    expect(lockout).toBeGreaterThan(0);
    expect(getPenalty(id, now + 2000)).toBeGreaterThan(0);
  });

  it("clearFailedAttempts resets state", () => {
    const id = "clear-me";
    registerFailedAttempt(id, Date.now());
    registerFailedAttempt(id, Date.now() + 1000);
    clearFailedAttempts(id);
    expect(getPenalty(id, Date.now())).toBe(0);
  });
});

describe("checkUnauthWindow", () => {
  beforeEach(() => {
    process.env.UNAUTH_WINDOW_MS = "60000";
    process.env.UNAUTH_MAX_REQUESTS = "3";
  });

  it("allows requests under limit", () => {
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      const result = checkUnauthWindow("unauth", now + i);
      expect(result.limited).toBe(false);
    }
  });

  it("blocks requests over limit", () => {
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      checkUnauthWindow("overlimit", now + i);
    }
    const result = checkUnauthWindow("overlimit", now + 5);
    expect(result.limited).toBe(true);
  });
});
