import { signToken, verifyToken } from "./jwt";
import { readEnv } from "@/lib/env";
import { getRequest } from "@tanstack/react-start/server";

const SESSION_COOKIE = "pm2_session";

export interface JwtPayload {
  username: string;
}

export async function createSession(
  username: string,
): Promise<{ token: string }> {
  const token = await signToken({ username }, readEnv("SESSION_TTL_MS"));
  return { token };
}

function readSessionCookie(): string | null {
  const request = getRequest();
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === SESSION_COOKIE) {
      return part.slice(eq + 1);
    }
  }

  return null;
}

export async function getSession(): Promise<JwtPayload | null> {
  const token = readSessionCookie();
  if (!token) return null;
  return verifyToken<JwtPayload>(token);
}

export function destroySession(): void {}

export function purgeExpiredSessions(): void {}
