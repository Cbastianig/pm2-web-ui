import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { readEnv } from "@/lib/env";

const clientDir = resolve(process.cwd(), "dist", "client");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

export async function serveStatic(request: Request): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return null;
  }

  const url = new URL(request.url);
  const basePath = readEnv("BASE_PATH").replace(/\/+$/, "");

  let pathname = url.pathname;
  if (basePath && basePath !== "/") {
    if (pathname === basePath) {
      pathname = "/";
    } else if (pathname.startsWith(`${basePath}/`)) {
      pathname = pathname.slice(basePath.length);
    } else {
      return null;
    }
  }

  if (!extname(pathname)) {
    return null;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const filePath = resolve(clientDir, `.${decoded}`);
  if (filePath !== clientDir && !filePath.startsWith(clientDir + sep)) {
    return null;
  }

  try {
    const data = await readFile(filePath);
    return new Response(request.method === "HEAD" ? null : data, {
      headers: {
        "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
      },
    });
  } catch {
    return null;
  }
}
