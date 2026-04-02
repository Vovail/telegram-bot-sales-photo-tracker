import type {
  TelegramPhoto,
  PhotoBatch,
  PendingBatch,
} from "../types/index.js";

const BATCH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const VALID_FORMATS = new Set(["jpeg", "png", "heic"]);

export class BatchAccumulator {
  private pendingBatches: Map<string, PendingBatch> = new Map();
  private callback: ((batch: PhotoBatch) => Promise<void>) | undefined;

  /**
   * Register a callback to be invoked when a batch is finalized.
   */
  onBatchReady(callback: (batch: PhotoBatch) => Promise<void>): void {
    this.callback = callback;
  }

  /**
   * Add a photo to the pending batch for the given sender.
   * Validates image format (jpeg, png, heic only).
   * Resets the 5-minute inactivity timer on each call.
   */
  addPhoto(
    senderId: string,
    senderPhone: string | undefined,
    photo: TelegramPhoto,
  ): void {
    this.validateFormat(photo.format);

    const existing = this.pendingBatches.get(senderId);

    if (existing) {
      clearTimeout(existing.timer);
      existing.photos.push(photo);
      existing.timer = this.createTimer(senderId);
    } else {
      const batch: PendingBatch = {
        senderId,
        senderPhone,
        photos: [photo],
        timer: this.createTimer(senderId),
        startedAt: new Date(),
      };
      this.pendingBatches.set(senderId, batch);
    }
  }

  /**
   * Immediately finalize the pending batch for the given sender
   * and trigger the registered callback.
   */
  processNow(senderId: string): void {
    const pending = this.pendingBatches.get(senderId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.finalizeBatch(senderId);
  }

  /**
   * Returns whether a pending batch exists for the given sender.
   */
  hasPendingBatch(senderId: string): boolean {
    return this.pendingBatches.has(senderId);
  }

  /**
   * Validate that the photo format is one of the accepted types.
   */
  private validateFormat(format: string): void {
    if (!VALID_FORMATS.has(format.toLowerCase())) {
      throw new Error(
        `Invalid image format: "${format}". Accepted formats: jpeg, png, heic.`,
      );
    }
  }

  private createTimer(senderId: string): NodeJS.Timeout {
    return setTimeout(() => {
      this.finalizeBatch(senderId);
    }, BATCH_TIMEOUT_MS);
  }

  private finalizeBatch(senderId: string): void {
    const pending = this.pendingBatches.get(senderId);
    if (!pending) {
      return;
    }

    this.pendingBatches.delete(senderId);

    const batch: PhotoBatch = {
      senderId: pending.senderId,
      senderPhone: pending.senderPhone,
      storeId: "", // Set later by the pipeline
      photos: pending.photos,
    };

    if (this.callback) {
      this.callback(batch);
    }
  }
}
