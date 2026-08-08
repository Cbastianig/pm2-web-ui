import type { HealthProvider, HealthStatus } from "../types";

export const httpHealthProvider: HealthProvider = {
  name: "http",

  async check(url: string): Promise<HealthStatus> {
    const startedAt = performance.now();
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(5000),
        redirect: "manual",
      });
      const elapsed = Math.round(performance.now() - startedAt);
      return {
        ok: res.ok,
        statusCode: res.status,
        responseTimeMs: elapsed,
        checkedAt: Date.now(),
      };
    } catch (err) {
      const elapsed = Math.round(performance.now() - startedAt);
      return {
        ok: false,
        statusCode: null,
        responseTimeMs: elapsed,
        checkedAt: Date.now(),
        error: err instanceof Error ? err.message : "Request failed",
      };
    }
  },
};
