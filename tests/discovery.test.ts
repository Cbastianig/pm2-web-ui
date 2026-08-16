import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  scanAll,
  scanApps,
  invalidateScanCache,
} from "../src/server/discovery/scanner";
import { parseOpsConfig } from "../src/server/discovery/parser";

const VALID_CONFIG = {
  name: "my-app",
  description: "Test app",
  git: { projectId: 123 },
  runtime: { blue: "my-app-blue", green: "my-app-green" },
  deployment: {},
  healthcheck: {},
  features: {},
};

let tmpDir: string;

function writeConfig(dir: string, content: unknown) {
  fs.writeFileSync(
    path.join(dir, "ops.config.json"),
    JSON.stringify(content),
  );
}

function mkdir(name: string): string {
  const p = path.join(tmpDir, name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ops-test-"));
  invalidateScanCache();
});

afterEach(() => {
  invalidateScanCache();
  fs.rmSync(tmpDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
});

describe("parseOpsConfig", () => {
  it("parses a valid ops.config.json", () => {
    const dir = mkdir("app-a");
    writeConfig(dir, VALID_CONFIG);

    const result = parseOpsConfig(dir);

    expect(result).not.toBeNull();
    expect(result!.config.name).toBe("my-app");
    expect(result!.config.git.projectId).toBe(123);
    expect(result!.appPath).toBe(dir);
  });

  it("applies schema defaults", () => {
    const dir = mkdir("app-a");
    writeConfig(dir, VALID_CONFIG);

    const result = parseOpsConfig(dir);

    expect(result!.config.version).toBe(1);
    expect(result!.config.provider).toBe("gitlab");
    expect(result!.config.deployment.strategy).toBe("blue-green");
    expect(result!.config.healthcheck.enabled).toBe(true);
  });

  it("returns null for invalid JSON", () => {
    const dir = mkdir("bad-json");
    fs.writeFileSync(path.join(dir, "ops.config.json"), "{ not json");

    expect(parseOpsConfig(dir)).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    const dir = mkdir("bad-schema");
    writeConfig(dir, { description: "no name or git" });

    expect(parseOpsConfig(dir)).toBeNull();
  });

  it("returns null when config file does not exist", () => {
    const dir = mkdir("no-config");

    expect(parseOpsConfig(dir)).toBeNull();
  });
});

describe("scanAll", () => {
  it("ignores dot-directories", () => {
    const hidden = mkdir(".git");
    writeConfig(hidden, VALID_CONFIG);
    const app = mkdir("app-a");
    writeConfig(app, VALID_CONFIG);

    const { apps, unconfigured } = scanAll(tmpDir);

    expect(apps.map((a) => a.dirName)).toEqual(["app-a"]);
    expect(unconfigured).toEqual([]);
  });

  it("separates configured apps from unconfigured directories", () => {
    const app = mkdir("app-a");
    writeConfig(app, VALID_CONFIG);
    mkdir("app-b");

    const { apps, unconfigured } = scanAll(tmpDir);

    expect(apps.map((a) => a.dirName)).toEqual(["app-a"]);
    expect(unconfigured.map((u) => u.dirName)).toEqual(["app-b"]);
  });

  it("skips regular files at the scan root", () => {
    const app = mkdir("app-a");
    writeConfig(app, VALID_CONFIG);
    fs.writeFileSync(path.join(tmpDir, "notes.txt"), "hello");

    const { apps, unconfigured } = scanAll(tmpDir);

    expect(apps.map((a) => a.dirName)).toEqual(["app-a"]);
    expect(unconfigured).toEqual([]);
  });

  it("returns empty for a nonexistent path", () => {
    const { apps, unconfigured } = scanAll(
      path.join(tmpDir, "does-not-exist"),
    );

    expect(apps).toEqual([]);
    expect(unconfigured).toEqual([]);
  });

  it("returns empty when the path is a file, not a directory", () => {
    const file = path.join(tmpDir, "some.log");
    fs.writeFileSync(file, "data");

    const { apps, unconfigured } = scanAll(file);

    expect(apps).toEqual([]);
    expect(unconfigured).toEqual([]);
  });

  it("caches results and invalidateScanCache forces a rescan", () => {
    const app = mkdir("app-a");
    writeConfig(app, VALID_CONFIG);

    const first = scanAll(tmpDir);
    expect(first.apps).toHaveLength(1);

    const added = mkdir("app-b");
    writeConfig(added, VALID_CONFIG);

    const cached = scanAll(tmpDir);
    expect(cached.apps).toHaveLength(1);

    invalidateScanCache();
    const refreshed = scanAll(tmpDir);
    expect(refreshed.apps).toHaveLength(2);
  });
});

describe("scanApps", () => {
  it("returns only configured apps", () => {
    const app = mkdir("app-a");
    writeConfig(app, VALID_CONFIG);
    mkdir("app-b");

    const apps = scanApps(tmpDir);

    expect(apps.map((a) => a.dirName)).toEqual(["app-a"]);
  });
});
