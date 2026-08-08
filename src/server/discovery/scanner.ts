import fs from "node:fs";
import path from "node:path";
import { parseOpsConfig } from "./parser";
import type { OpsConfig } from "./types";

export interface DiscoveredApp {
  config: OpsConfig;
  appPath: string;
  dirName: string;
}

export interface UnconfiguredApp {
  dirName: string;
  appPath: string;
}

let cachedApps: DiscoveredApp[] = [];
let cachedUnconfigured: UnconfiguredApp[] = [];
let lastScan = 0;
const CACHE_TTL = 30_000;

export function scanApps(scanPath: string): DiscoveredApp[] {
  return scanAll(scanPath).apps;
}

export function scanAll(
  scanPath: string
): { apps: DiscoveredApp[]; unconfigured: UnconfiguredApp[] } {
  const now = Date.now();
  if (now - lastScan < CACHE_TTL) {
    return { apps: cachedApps, unconfigured: cachedUnconfigured };
  }

  const apps: DiscoveredApp[] = [];
  const unconfigured: UnconfiguredApp[] = [];

  try {
    if (!fs.existsSync(scanPath)) {
      console.log(`[OPS] Scan path does not exist: ${scanPath}`);
      cachedApps = apps;
      cachedUnconfigured = unconfigured;
      lastScan = now;
      return { apps, unconfigured };
    }

    if (!fs.statSync(scanPath).isDirectory()) {
      console.log(`[OPS] Path is not a directory: ${scanPath}`);
      cachedApps = apps;
      cachedUnconfigured = unconfigured;
      lastScan = now;
      return { apps, unconfigured };
    }

    const entries = fs.readdirSync(scanPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(scanPath, entry.name);
      const parsed = parseOpsConfig(fullPath);
      if (parsed) {
        apps.push({
          config: parsed.config,
          appPath: parsed.appPath,
          dirName: entry.name,
        });
      } else {
        unconfigured.push({ dirName: entry.name, appPath: fullPath });
      }
    }
  } catch (err) {
    console.log(`[OPS] Cannot read ${scanPath}: ${(err as Error).message}`);
  }

  if (apps.length > 0 || cachedApps.length > 0) {
    console.log(`[OPS] Scan: ${apps.length} app${apps.length !== 1 ? "s" : ""} found`);
  }

  cachedApps = apps;
  cachedUnconfigured = unconfigured;
  lastScan = now;
  return { apps, unconfigured };
}

export function invalidateScanCache(): void {
  lastScan = 0;
  cachedApps = [];
  cachedUnconfigured = [];
}
