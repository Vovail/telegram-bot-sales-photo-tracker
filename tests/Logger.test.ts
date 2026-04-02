import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "../src/components/Logger.js";

describe("Logger", () => {
  let logger: Logger;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new Logger();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function parseOutput(
    spy: ReturnType<typeof vi.spyOn>,
  ): Record<string, unknown> {
    expect(spy).toHaveBeenCalledOnce();
    return JSON.parse(spy.mock.calls[0][0] as string);
  }

  it("info() logs to console.log with JSON format", () => {
    logger.info("batch_processed");
    const entry = parseOutput(logSpy);
    expect(entry.level).toBe("info");
    expect(entry.event).toBe("batch_processed");
    expect(entry.timestamp).toBeDefined();
  });

  it("warn() logs to console.warn with JSON format", () => {
    logger.warn("no_date_markers");
    const entry = parseOutput(warnSpy);
    expect(entry.level).toBe("warn");
    expect(entry.event).toBe("no_date_markers");
  });

  it("error() logs to console.error with JSON format", () => {
    logger.error("processing_failed", { error: "timeout" });
    const entry = parseOutput(errorSpy);
    expect(entry.level).toBe("error");
    expect(entry.event).toBe("processing_failed");
    expect(entry.error).toBe("timeout");
  });

  it("includes optional fields when provided", () => {
    logger.info("batch_processed", {
      senderId: "user123",
      storeId: "STORE_1",
      recordCount: 5,
      details: { photoCount: 2 },
    });
    const entry = parseOutput(logSpy);
    expect(entry.senderId).toBe("user123");
    expect(entry.storeId).toBe("STORE_1");
    expect(entry.recordCount).toBe(5);
    expect(entry.details).toEqual({ photoCount: 2 });
  });

  it("omits optional fields when not provided", () => {
    logger.info("startup");
    const entry = parseOutput(logSpy);
    expect(entry).not.toHaveProperty("senderId");
    expect(entry).not.toHaveProperty("storeId");
    expect(entry).not.toHaveProperty("recordCount");
    expect(entry).not.toHaveProperty("error");
    expect(entry).not.toHaveProperty("details");
  });

  it("timestamp is a valid ISO date string", () => {
    logger.info("test_event");
    const entry = parseOutput(logSpy);
    const parsed = new Date(entry.timestamp as string);
    expect(parsed.getTime()).not.toBeNaN();
  });
});
