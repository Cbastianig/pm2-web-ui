import crypto from "node:crypto";
import { readEnv } from "@/lib/env";
import { setResponseHeader, getRequest } from "@tanstack/react-start/server";

const SESSION_COOKIE = "pm2_session";

export function setSessionCookie(token: string): void {
  const ttlMs = readEnv("SESSION_TTL_MS");
  const secureMode = readEnv("COOKIE_SECURE");
  const trustProxy = readEnv("TRUST_PROXY");

  const request = getRequest();
  let secure = secureMode === "always";
  if (secureMode === "auto") {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    secure = trustProxy ? proto === "https" : request.url.startsWith("https:");
  }

  setResponseHeader(
    "Set-Cookie",
    [
      `${SESSION_COOKIE}=${token}`,
      "HttpOnly",
      secure ? "Secure" : "",
      "SameSite=Lax",
      "Path=/",
      `Max-Age=${Math.floor(ttlMs / 1000)}`,
    ]
      .filter(Boolean)
      .join("; ")
  );
}

export function clearSessionCookie(): void {
  setResponseHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  );
}
