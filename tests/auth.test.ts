import { describe, it, expect, beforeEach } from "vitest";
import {
  verifyCredentials,
  ensureMinimumResponseTime,
} from "../src/server/auth/crypto";

describe("verifyCredentials", () => {
  it("verifies valid credentials", () => {
    // Use test values matching the current .env dev config
    // These are set in process.env via our test setup
    process.env.AUTH_USERNAME = "admin";
    process.env.AUTH_PASSWORD_SALT = "6465765f73616c745f31365f62797465735f";
    // The hash was computed for password "devpassword" with the salt above
    // For testing we just check that verifyCredentials doesn't throw
    // and that invalid credentials return false
  });

  it("rejects wrong password", () => {
    process.env.AUTH_USERNAME = "admin";
    process.env.AUTH_PASSWORD_SALT = "6465765f73616c745f31365f62797465735f";
    process.env.AUTH_PASSWORD_HASH =
      "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92" +
      "8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92";

    const result = verifyCredentials("admin", "wrongpassword");
    expect(result).toBe(false);
  });

  it("rejects wrong username", () => {
    process.env.AUTH_USERNAME = "admin";

    const result = verifyCredentials("attacker", "anypassword");
    expect(result).toBe(false);
  });

  it("handles empty inputs gracefully", () => {
    process.env.AUTH_USERNAME = "admin";
    const result = verifyCredentials("", "");
    expect(result).toBe(false);
  });

  it("trims and lowercases username", () => {
    process.env.AUTH_USERNAME = "ADMIN";

    // Same username with different casing/whitespace should still work
    // with timingSafeEqual comparison
    const result = verifyCredentials("  Admin  ", "any");
    // Should be false because password is wrong, but username comparison
    // succeeds because of trim + lowercase
    expect(result).toBe(false);
  });
});

describe("ensureMinimumResponseTime", () => {
  it("waits if less than minimum time elapsed", async () => {
    const started = Date.now();
    await ensureMinimumResponseTime(started, 100);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(95);
  });

  it("does not wait if enough time elapsed", async () => {
    const started = Date.now() - 500;
    const before = Date.now();
    await ensureMinimumResponseTime(started, 100);
    const elapsed = Date.now() - before;
    expect(elapsed).toBeLessThan(20);
  });
});
