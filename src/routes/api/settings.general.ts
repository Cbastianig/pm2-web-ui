import { createFileRoute } from "@tanstack/react-router";
import { getSession } from "@/server/auth/store";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ENV_PATH = path.resolve(process.cwd(), ".env");

function readEnvFile(): Record<string, string> {
  try {
    const content = fs.readFileSync(ENV_PATH, "utf8");
    const result: Record<string, string> = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      // Never expose password hash/salt
      if (key === "AUTH_PASSWORD_SALT" || key === "AUTH_PASSWORD_HASH") continue;
      result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
}

function writeEnvFile(updates: Record<string, string>): void {
  let content: string;
  try {
    content = fs.readFileSync(ENV_PATH, "utf8");
  } catch {
    content = "";
  }

  const lines = content.split(/\r?\n/);
  const updatedKeys = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (updates[key] !== undefined) {
      lines[i] = `${key}=${updates[key]}`;
      updatedKeys.add(key);
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (!updatedKeys.has(key)) {
      lines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n", "utf8");
}

export const Route = createFileRoute("/api/settings/general")({
  server: {
    handlers: {
      GET: async ({}) => {
        const session = getSession();
        if (!session) return new Response("Unauthorized", { status: 401 });

        const settings = readEnvFile();
        return Response.json({ settings });
      },
      POST: async ({ request }) => {
        const session = getSession();
        if (!session) return new Response("Unauthorized", { status: 401 });

        const payload = (await request.json()) as {
          settings: Record<string, string>;
        };

        const settings = { ...payload.settings };
        const authPassword = settings.authPassword;
        delete settings.authPassword;

        if (authPassword && authPassword.trim()) {
          const salt = crypto.randomBytes(16);
          const hash = crypto.scryptSync(authPassword.trim(), salt, 64);
          settings["AUTH_PASSWORD_SALT"] = salt.toString("hex");
          settings["AUTH_PASSWORD_HASH"] = hash.toString("hex");
        }

        writeEnvFile(settings);
        return Response.json({ ok: true });
      },
    },
  },
});
