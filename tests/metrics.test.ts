import { beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";

const mocks = vi.hoisted(() => ({
  execFile: vi.fn<
    (
      file: string,
      args: string[],
      options: Record<string, unknown>,
      callback: (err: Error | null, result?: { stdout: string; stderr: string }) => void,
    ) => void
  >(),
}));

vi.mock("node:child_process", () => ({
  execFile: mocks.execFile,
}));

import { collectHostMetrics } from "../src/server/host/metrics";

function dfOutput(total: string, used: string): string {
  return (
    `Filesystem     1-blocks       Used Available Capacity Mounted on\n` +
    `/dev/sda1 ${total} ${used}     123456 5% ${os.homedir()}\n`
  );
}

beforeEach(() => {
  mocks.execFile.mockReset();
  mocks.execFile.mockImplementation((_file, _args, _options, cb) => {
    cb(null, { stdout: dfOutput("1000000", "400000"), stderr: "" });
  });
});

describe("collectHostMetrics", () => {
  it("parses disk usage from df output", async () => {
    mocks.execFile.mockImplementation((_file, _args, _options, cb) => {
      cb(null, { stdout: dfOutput("2000000000", "750000000"), stderr: "" });
    });

    const snapshot = await collectHostMetrics();

    expect(snapshot.diskTotal).toBe(2000000000);
    expect(snapshot.diskUsed).toBe(750000000);
  });

  it("calls df with -B1 and the home directory, with a timeout", async () => {
    await collectHostMetrics();

    expect(mocks.execFile).toHaveBeenCalledWith(
      "df",
      ["-B1", os.homedir()],
      expect.objectContaining({ encoding: "utf8", timeout: 3000 }),
      expect.any(Function),
    );
  });

  it("returns zero disk metrics when df fails", async () => {
    mocks.execFile.mockImplementation((_file, _args, _options, cb) => {
      cb(new Error("ETIMEDOUT"));
    });

    const snapshot = await collectHostMetrics();

    expect(snapshot.diskUsed).toBe(0);
    expect(snapshot.diskTotal).toBe(0);
  });

  it("returns zero disk metrics on malformed df output", async () => {
    mocks.execFile.mockImplementation((_file, _args, _options, cb) => {
      cb(null, { stdout: "Filesystem     1-blocks       Used Available Capacity Mounted on\n", stderr: "" });
    });

    const snapshot = await collectHostMetrics();

    expect(snapshot.diskUsed).toBe(0);
    expect(snapshot.diskTotal).toBe(0);
  });

  it("still reports cpu and ram", async () => {
    const snapshot = await collectHostMetrics();

    expect(snapshot.cpuCount).toBeGreaterThan(0);
    expect(snapshot.ramTotal).toBeGreaterThan(0);
    expect(snapshot.ramUsed).toBeGreaterThanOrEqual(0);
    expect(snapshot.cpuPercent).toBeGreaterThanOrEqual(0);
  });
});
