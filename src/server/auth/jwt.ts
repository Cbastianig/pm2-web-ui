import { SignJWT, jwtVerify } from "jose";
import { readEnv } from "@/lib/env";

function getSecretKey(): Uint8Array {
  const secret = readEnv("JWT_SECRET");
  return new TextEncoder().encode(secret);
}

export async function signToken(
  payload: Record<string, unknown>,
  ttlMs: number,
): Promise<string> {
  const secret = getSecretKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + Math.floor(ttlMs / 1000))
    .sign(secret);
}

export async function verifyToken<T>(token: string): Promise<T | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as T;
  } catch {
    return null;
  }
}
