import { createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { purgeExpiredEntries } from "./auth/rateLimit";

export const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const securityMiddleware = createMiddleware().server(
  async ({ next }) => {
    const request = getRequest();
    const res = await next();

    if (res) {
      const isSecure =
        request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ===
        "https";

      const headers: Record<string, string> = {
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Resource-Policy": "same-origin",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
      };

      if (isSecure) {
        headers["Strict-Transport-Security"] =
          "max-age=63072000; includeSubDomains";
      }

      const responseHeaders = res.response.headers;

      for (const [key, value] of Object.entries(headers)) {
        if (!responseHeaders.has(key)) {
          responseHeaders.set(key, value);
        }
      }
    }

    return res;
  },
);

setInterval(() => {
  purgeExpiredEntries();
}, 60 * 1000).unref();
