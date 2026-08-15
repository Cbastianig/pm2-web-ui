import { describe, it, expect } from "vitest";
import { detectLogLevel } from "../src/server/events/logBus";

describe("detectLogLevel", () => {
  describe("JSON level field", () => {
    it("detects error levels", () => {
      expect(detectLogLevel('{"level":"error","msg":"boom"}')).toBe("error");
      expect(detectLogLevel('{"level":"fatal"}')).toBe("error");
      expect(detectLogLevel('{"level":"critical"}')).toBe("error");
    });

    it("detects warn levels", () => {
      expect(detectLogLevel('{"level":"warn"}')).toBe("warn");
      expect(detectLogLevel('{"level":"warning"}')).toBe("warn");
    });

    it("detects info level", () => {
      expect(detectLogLevel('{"level":"info"}')).toBe("info");
    });

    it("detects debug levels", () => {
      expect(detectLogLevel('{"level":"debug"}')).toBe("debug");
      expect(detectLogLevel('{"level":"trace"}')).toBe("debug");
      expect(detectLogLevel('{"level":"verbose"}')).toBe("debug");
    });
  });

  describe("bracket / paren notation", () => {
    it("detects error levels", () => {
      expect(detectLogLevel("[ERROR] connection refused")).toBe("error");
      expect(detectLogLevel("(fatal) crash")).toBe("error");
      expect(detectLogLevel("[crit] memory low")).toBe("error");
    });

    it("detects warn levels", () => {
      expect(detectLogLevel("[warn] deprecated")).toBe("warn");
      expect(detectLogLevel("(WARN) risky")).toBe("warn");
    });

    it("detects info level", () => {
      expect(detectLogLevel("[info] started")).toBe("info");
    });

    it("detects debug levels", () => {
      expect(detectLogLevel("[debug] detail")).toBe("debug");
      expect(detectLogLevel("(trace) detail")).toBe("debug");
    });
  });

  describe("uppercase standalone labels", () => {
    it("detects error labels", () => {
      expect(detectLogLevel("ERROR: connection refused")).toBe("error");
      expect(detectLogLevel("FATAL")).toBe("error");
      expect(detectLogLevel("EXCEPTION thrown")).toBe("error");
      expect(detectLogLevel("CRIT: disk full")).toBe("error");
    });

    it("detects warn label", () => {
      expect(detectLogLevel("WARN: slow query")).toBe("warn");
      expect(detectLogLevel("something | WARNING | thing")).toBe("warn");
    });

    it("detects info label", () => {
      expect(detectLogLevel("INFO server started")).toBe("info");
    });

    it("detects debug labels", () => {
      expect(detectLogLevel("DEBUG: stack")).toBe("debug");
      expect(detectLogLevel("TRACE: frame")).toBe("debug");
    });
  });

  it("returns empty string when no level matches", () => {
    expect(detectLogLevel("hello world")).toBe("");
    expect(detectLogLevel("just a normal message")).toBe("");
    expect(detectLogLevel("GET /api/health 200")).toBe("");
  });

  it("does not confuse similar words with level labels", () => {
    expect(detectLogLevel("WARNING sign posted")).toBe("warn");
    expect(detectLogLevel("FAILED to connect")).toBe("");
  });
});
