import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BatchAccumulator } from "../src/components/BatchAccumulator.js";
import type { TelegramPhoto, PhotoBatch } from "../src/types/index.js";

function makePhoto(format: "jpeg" | "png" | "heic" = "jpeg"): TelegramPhoto {
  return {
    buffer: Buffer.from("fake-image-data"),
    format,
    receivedAt: new Date(),
  };
}

describe("BatchAccumulator", () => {
  let accumulator: BatchAccumulator;

  beforeEach(() => {
    vi.useFakeTimers();
    accumulator = new BatchAccumulator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("addPhoto", () => {
    it("accepts jpeg format", () => {
      expect(() =>
        accumulator.addPhoto("sender1", "+111", makePhoto("jpeg")),
      ).not.toThrow();
    });

    it("accepts png format", () => {
      expect(() =>
        accumulator.addPhoto("sender1", "+111", makePhoto("png")),
      ).not.toThrow();
    });

    it("accepts heic format", () => {
      expect(() =>
        accumulator.addPhoto("sender1", "+111", makePhoto("heic")),
      ).not.toThrow();
    });

    it("rejects invalid format", () => {
      const photo = { ...makePhoto(), format: "gif" as any };
      expect(() => accumulator.addPhoto("sender1", "+111", photo)).toThrow(
        /Invalid image format.*gif/,
      );
    });

    it("creates a pending batch on first photo", () => {
      accumulator.addPhoto("sender1", "+111", makePhoto());
      expect(accumulator.hasPendingBatch("sender1")).toBe(true);
    });

    it("adds to existing batch for same sender", () => {
      const callback = vi.fn();
      accumulator.onBatchReady(callback);

      accumulator.addPhoto("sender1", "+111", makePhoto());
      accumulator.addPhoto("sender1", "+111", makePhoto());
      accumulator.processNow("sender1");

      expect(callback).toHaveBeenCalledTimes(1);
      const batch: PhotoBatch = callback.mock.calls[0][0];
      expect(batch.photos).toHaveLength(2);
    });

    it("keeps separate batches for different senders", () => {
      accumulator.addPhoto("sender1", "+111", makePhoto());
      accumulator.addPhoto("sender2", "+222", makePhoto());

      expect(accumulator.hasPendingBatch("sender1")).toBe(true);
      expect(accumulator.hasPendingBatch("sender2")).toBe(true);
    });
  });

  describe("timer behavior", () => {
    it("finalizes batch after 5-minute timeout", () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      accumulator.onBatchReady(callback);

      accumulator.addPhoto("sender1", "+111", makePhoto());

      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(accumulator.hasPendingBatch("sender1")).toBe(false);
    });

    it("resets timer when new photo is added", () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      accumulator.onBatchReady(callback);

      accumulator.addPhoto("sender1", "+111", makePhoto());

      // Advance 4 minutes
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(callback).not.toHaveBeenCalled();

      // Add another photo — resets the timer
      accumulator.addPhoto("sender1", "+111", makePhoto());

      // Advance another 4 minutes (8 total from start, but only 4 from last photo)
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(callback).not.toHaveBeenCalled();

      // Advance 1 more minute (5 from last photo)
      vi.advanceTimersByTime(1 * 60 * 1000);
      expect(callback).toHaveBeenCalledTimes(1);

      const batch: PhotoBatch = callback.mock.calls[0][0];
      expect(batch.photos).toHaveLength(2);
    });

    it("does not fire callback before timeout", () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      accumulator.onBatchReady(callback);

      accumulator.addPhoto("sender1", "+111", makePhoto());
      vi.advanceTimersByTime(4 * 60 * 1000);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("processNow", () => {
    it("immediately finalizes the batch", () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      accumulator.onBatchReady(callback);

      accumulator.addPhoto("sender1", "+111", makePhoto());
      accumulator.processNow("sender1");

      expect(callback).toHaveBeenCalledTimes(1);
      expect(accumulator.hasPendingBatch("sender1")).toBe(false);
    });

    it("does nothing if no pending batch exists", () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      accumulator.onBatchReady(callback);

      accumulator.processNow("nonexistent");

      expect(callback).not.toHaveBeenCalled();
    });

    it("cancels the timer so it does not fire again", () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      accumulator.onBatchReady(callback);

      accumulator.addPhoto("sender1", "+111", makePhoto());
      accumulator.processNow("sender1");

      // Advance past the original timeout
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Should only have been called once (from processNow)
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("onBatchReady callback", () => {
    it("passes a PhotoBatch with storeId as empty string", () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      accumulator.onBatchReady(callback);

      accumulator.addPhoto("sender1", "+111", makePhoto());
      accumulator.processNow("sender1");

      const batch: PhotoBatch = callback.mock.calls[0][0];
      expect(batch.storeId).toBe("");
      expect(batch.senderId).toBe("sender1");
      expect(batch.senderPhone).toBe("+111");
    });

    it("preserves senderPhone as undefined when not provided", () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      accumulator.onBatchReady(callback);

      accumulator.addPhoto("sender1", undefined, makePhoto());
      accumulator.processNow("sender1");

      const batch: PhotoBatch = callback.mock.calls[0][0];
      expect(batch.senderPhone).toBeUndefined();
    });
  });
});
