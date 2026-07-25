import { readEnv } from "@/lib/env";

const loginRateWindow = new Map<string, { count: number; windowEndsAt: number }>();
const unauthRateWindow = new Map<string, { count: number; windowEndsAt: number }>();
const loginPenaltyState = new Map<
  string,
  { failures: number; lastFailureAt: number; lockedUntil: number }
>();

export function checkLoginWindow(
  identity: string,
  now: number
): { allowed: boolean; retryAfterMs: number } {
  const windowMs = readEnv("LOGIN_WINDOW_MS");
  const maxRequests = readEnv("LOGIN_MAX_REQUESTS");

  const entry = loginRateWindow.get(identity);

  if (!entry || entry.windowEndsAt <= now) {
    loginRateWindow.set(identity, { count: 1, windowEndsAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, retryAfterMs: Math.max(entry.windowEndsAt - now, 0) };
  }

  entry.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

export function getPenalty(identity: string, now: number): number {
  const entry = loginPenaltyState.get(identity);
  if (!entry) return 0;
  if (entry.lockedUntil <= now) return 0;
  return entry.lockedUntil - now;
}

export function registerFailedAttempt(identity: string, now: number): number {
  const failureWindowMs = readEnv("LOGIN_FAILURE_WINDOW_MS");
  const maxLockoutMs = readEnv("LOGIN_MAX_LOCKOUT_MS");

  const entry = loginPenaltyState.get(identity);
  const failures =
    entry && now - entry.lastFailureAt <= failureWindowMs ? entry.failures + 1 : 1;
  const lockoutMs = failures < 3 ? 0 : maxLockoutMs;

  loginPenaltyState.set(identity, {
    failures,
    lastFailureAt: now,
    lockedUntil: now + lockoutMs,
  });

  return lockoutMs;
}

export function clearFailedAttempts(identity: string): void {
  loginPenaltyState.delete(identity);
}

export function checkUnauthWindow(
  identity: string,
  now: number
): { limited: boolean } {
  const windowMs = readEnv("UNAUTH_WINDOW_MS");
  const maxRequests = readEnv("UNAUTH_MAX_REQUESTS");

  const entry = unauthRateWindow.get(identity);

  if (!entry || entry.windowEndsAt <= now) {
    unauthRateWindow.set(identity, { count: 1, windowEndsAt: now + windowMs });
    return { limited: false };
  }

  entry.count += 1;
  return { limited: entry.count > maxRequests };
}

export function purgeExpiredEntries(): void {
  const now = Date.now();
  const failureWindowMs = readEnv("LOGIN_FAILURE_WINDOW_MS");

  for (const [key, value] of loginRateWindow.entries()) {
    if (value.windowEndsAt <= now) loginRateWindow.delete(key);
  }
  for (const [key, value] of loginPenaltyState.entries()) {
    const lockExpired = value.lockedUntil <= now;
    const trackingExpired = now - value.lastFailureAt > failureWindowMs;
    if (lockExpired && trackingExpired) loginPenaltyState.delete(key);
  }
  for (const [key, value] of unauthRateWindow.entries()) {
    if (value.windowEndsAt <= now) unauthRateWindow.delete(key);
  }
}
