import crypto from "node:crypto";
import { readEnv } from "@/lib/env";

export function verifyCredentials(username: string, password: string): boolean {
  const expectedUsername = readEnv("AUTH_USERNAME");
  const saltHex = readEnv("AUTH_PASSWORD_SALT");
  const hashHex = readEnv("AUTH_PASSWORD_HASH");

  const usernameDigest = crypto
    .createHash("sha256")
    .update(String(username).trim().toLowerCase(), "utf8")
    .digest();

  const expectedUsernameDigest = crypto
    .createHash("sha256")
    .update(expectedUsername.trim().toLowerCase(), "utf8")
    .digest();

  const salt = Buffer.from(saltHex, "hex");
  const expectedHash = Buffer.from(hashHex, "hex");

  if (expectedHash.length !== 64) {
    return false;
  }

  const passwordHash = crypto.scryptSync(String(password), salt, 64);

  return (
    crypto.timingSafeEqual(usernameDigest, expectedUsernameDigest) &&
    crypto.timingSafeEqual(passwordHash, expectedHash)
  );
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function ensureMinimumResponseTime(startedAt: number, minimumMs: number): Promise<void> {
  const elapsed = Date.now() - startedAt;
  if (elapsed < minimumMs) {
    await delay(minimumMs - elapsed);
  }
}
