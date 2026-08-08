import fs from "node:fs";
import path from "node:path";
import { OpsConfigSchema, type OpsConfig } from "./types";

export function parseOpsConfig(dirPath: string): { config: OpsConfig; appPath: string } | null {
  const configPath = path.join(dirPath, "ops.config.json");

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const json = JSON.parse(raw);
    const config = OpsConfigSchema.parse(json);
    return { config, appPath: dirPath };
  } catch {
    return null;
  }
}
