import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { setSessionCookie, clearSessionCookie } from "./cookies.server";
import { createSession, getSession } from "./store";
import { verifyCredentials, ensureMinimumResponseTime } from "./crypto";
import { checkLoginWindow, getPenalty, registerFailedAttempt, clearFailedAttempts } from "./rateLimit";
import { getRequest } from "@tanstack/react-start/server";
import { readEnv } from "@/lib/env";

export const loginFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    })
  )
  .handler(async ({ data }) => {
    const startedAt = Date.now();
    const request = getRequest();
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "127.0.0.1";
    const userAgent = request.headers.get("user-agent") ?? "unknown";
    const identity = `${ip}|${userAgent}`;
    const now = Date.now();

    const penalty = getPenalty(identity, now);
    if (penalty > 0) {
      const retryAfter = Math.ceil(penalty / 1000);
      throw new Error(`Too many failed attempts. Try again in ${retryAfter}s.`);
    }

    const window = checkLoginWindow(identity, now);
    if (!window.allowed) {
      const retryAfter = Math.ceil(window.retryAfterMs / 1000);
      throw new Error(`Too many login attempts. Try again in ${retryAfter}s.`);
    }

    const valid = verifyCredentials(data.username, data.password);

    if (valid) {
      clearFailedAttempts(identity);
      const { token } = await createSession(data.username);
      setSessionCookie(token);
      await ensureMinimumResponseTime(startedAt, readEnv("AUTH_MIN_RESPONSE_MS"));
      return { ok: true };
    }

    const lockout = registerFailedAttempt(identity, now);
    await ensureMinimumResponseTime(startedAt, readEnv("AUTH_MIN_RESPONSE_MS"));
    if (lockout > 0) {
      const retryAfter = Math.ceil(lockout / 1000);
      throw new Error(`Account locked due to repeated failed attempts.`);
    }
    throw new Error("Invalid credentials.");
  });

export const logoutFn = createServerFn({ method: "POST" })
  .handler(async () => {
    clearSessionCookie();
    return { ok: true };
  });

export const checkSessionFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const session = await getSession();
    if (!session) return null;
    return { username: session.username };
  });
