import fs from "node:fs";
import path from "node:path";
import type { DeploymentProvider, Environment } from "../types";
import { pm2RuntimeProvider } from "../runtime/pm2";

export const blueGreenProvider: DeploymentProvider = {
  name: "blue-green",

  async getEnvironments(config: {
    blueName: string;
    greenName: string;
    currentFile: string;
    appPath: string;
  }): Promise<Environment[]> {
    const currentPath = path.resolve(config.appPath, config.currentFile);
    let current: "blue" | "green" | "unknown" = "unknown";

    try {
      const raw = fs.readFileSync(currentPath, "utf8").trim().toLowerCase();
      if (raw === "blue") current = "blue";
      else if (raw === "green") current = "green";
    } catch {
      // current file not found
    }

    const [blueProc, greenProc] = await Promise.all([
      pm2RuntimeProvider.getProcess(config.blueName),
      pm2RuntimeProvider.getProcess(config.greenName),
    ]);

    return [
      {
        name: config.blueName,
        color: "blue",
        active: current === "blue",
        runtime: blueProc,
        commit: null,
        health: null,
        port: blueProc?.env["PORT"] ? parseInt(blueProc.env["PORT"], 10) : null,
      },
      {
        name: config.greenName,
        color: "green",
        active: current === "green",
        runtime: greenProc,
        commit: null,
        health: null,
        port: greenProc?.env["PORT"] ? parseInt(greenProc.env["PORT"], 10) : null,
      },
    ];
  },
};
