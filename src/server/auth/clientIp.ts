import { readEnv } from "@/lib/env";
import { getRequest } from "@tanstack/react-start/server";

export function getClientIp(): string {
  const request = getRequest();
  const trustProxy = readEnv("TRUST_PROXY");

  if (trustProxy) {
    const forwarded = request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    if (forwarded) return forwarded;
  }

  const remote =
    (
      request as unknown as {
        runtime?: { node?: { req?: { socket?: { remoteAddress?: string } } } };
      }
    ).runtime?.node?.req?.socket?.remoteAddress ?? "";

  return remote || "127.0.0.1";
}
