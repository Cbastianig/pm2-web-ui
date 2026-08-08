import type { GitLabProvider, PipelineInfo, CommitInfo } from "../types";
import { readEnv } from "@/lib/env";

function gitlabHeaders(): Record<string, string> {
  const token = readEnv("GITLAB_TOKEN");
  return {
    "PRIVATE-TOKEN": token,
    "Content-Type": "application/json",
  };
}

function apiUrl(path: string): string {
  const base = readEnv("GITLAB_URL").replace(/\/$/, "");
  return `${base}/api/v4${path}`;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

function ttlCache<T>(ttlMs: number) {
  const store = new Map<string, CacheEntry<T>>();
  return {
    get(key: string): T | undefined {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
  };
}

// Long-lived data: project and commit metadata barely change.
const projectCache = ttlCache<{ name: string; webUrl: string }>(10 * 60_000);
const commitCache = ttlCache<CommitInfo>(10 * 60_000);
// Pipelines change often; short TTL to keep status reasonably fresh.
const pipelineCache = ttlCache<PipelineInfo>(30_000);

export const gitlabProvider: GitLabProvider = {
  name: "gitlab",

  async getProject(projectId: number) {
    const key = String(projectId);
    const cached = projectCache.get(key);
    if (cached) return cached;

    try {
      const res = await fetch(apiUrl(`/projects/${projectId}`), {
        headers: gitlabHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { name: string; web_url: string };
      const value = { name: data.name, webUrl: data.web_url };
      projectCache.set(key, value);
      return value;
    } catch {
      return null;
    }
  },

  async getCommit(projectId: number, sha: string) {
    const key = `${projectId}:${sha}`;
    const cached = commitCache.get(key);
    if (cached) return cached;

    try {
      const res = await fetch(
        apiUrl(`/projects/${projectId}/repository/commits/${encodeURIComponent(sha)}`),
        { headers: gitlabHeaders(), signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return null;
      const c = (await res.json()) as { id: string; short_id: string; title: string; author_name: string; authored_date: string };
      const value: CommitInfo = { hash: c.id, shortHash: c.short_id, branch: "", author: c.author_name, message: c.title, date: c.authored_date };
      commitCache.set(key, value);
      return value;
    } catch {
      return null;
    }
  },

  async getBranch(projectId: number, branch: string) {
    try {
      const res = await fetch(
        apiUrl(`/projects/${projectId}/repository/branches/${encodeURIComponent(branch)}`),
        { headers: gitlabHeaders(), signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { name: string };
      return { name: data.name };
    } catch {
      return null;
    }
  },

  async getLastPipeline(projectId: number, branch: string) {
    const key = `${projectId}:${branch}`;
    const cached = pipelineCache.get(key);
    if (cached) return cached;

    try {
      const res = await fetch(
        apiUrl(`/projects/${projectId}/pipelines?ref=${encodeURIComponent(branch)}&per_page=1&order_by=id&sort=desc`),
        { headers: gitlabHeaders(), signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return null;
      const items = (await res.json()) as any[];
      if (!items.length) return null;
      const p = items[0];
      const value: PipelineInfo = {
        id: p.id,
        status: p.status,
        ref: p.ref,
        sha: p.sha,
        webUrl: p.web_url || "",
        createdAt: p.created_at || "",
        updatedAt: p.updated_at || "",
        duration: p.duration ?? null,
        author: (p.user && p.user.name) || "unknown",
      };
      pipelineCache.set(key, value);
      return value;
    } catch (err) {
      console.log(`[GITLAB] Pipeline error: ${(err as Error).message}`);
      return null;
    }
  },
};
