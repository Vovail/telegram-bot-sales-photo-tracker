import { describe, it, expect, vi, beforeEach } from "vitest";
import { TelegramBotController } from "../src/components/TelegramBotController.js";
import type {
  StoreConfig,
  PhotoBatch,
  PhotoParseResult,
  DateAssignmentResult,
  DatedSalesRecord,
  UploadResult,
} from "../src/types/index.js";

// ── Helpers ──

function makeConfig(): StoreConfig {
  return {
    sharedDriveFolderId: "shared-folder-id",
    stores: [
      {
        storeId: "STORE_1",
        registeredPhone: "+1111111111",
        sheetDocumentId: "sheet-doc-1",
      },
      {
        storeId: "STORE_2",
        registeredPhone: "+2222222222",
        sheetDocumentId: "sheet-doc-2",
      },
    ],
  };
}

function makeBatch(overrides: Partial<PhotoBatch> = {}): PhotoBatch {
  return {
    senderId: "user-123",
    senderPhone: "+1111111111",
    storeId: "STORE_1",
    photos: [
      { buffer: Buffer.from("photo1"), format: "jpeg", receivedAt: new Date() },
    ],
    ...overrides,
  };
}

function makeParseResult(
  elements: PhotoParseResult["elements"] = [],
): PhotoParseResult {
  return { elements, rawText: "raw" };
}

function makeDatedRecord(
  overrides: Partial<DatedSalesRecord> = {},
): DatedSalesRecord {
  return {
    date: "2026-03-20",
    name: "Футболка",
    price: 100,
    incomplete: false,
    ...overrides,
  };
}

// ── Mock factories ──

function createMocks() {
  const batchAccumulator = {
    onBatchReady: vi.fn(),
    addPhoto: vi.fn(),
    processNow: vi.fn(),
  };

  const storeIdentifier = {
    identifyByPhone: vi.fn(),
    validateStoreId: vi.fn(),
  };

  const visionParser = {
    parsePhoto: vi.fn(),
  };

  const dateAssigner = {
    assignDates: vi.fn(),
  };

  const driveUploader = {
    uploadPhoto: vi.fn(),
  };

  const sheetsWriter = {
    writeRecords: vi.fn(),
    ensureMonthTab: vi.fn(),
  };

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    batchAccumulator,
    storeIdentifier,
    visionParser,
    dateAssigner,
    driveUploader,
    sheetsWriter,
    logger,
  };
}

function createController(
  config: StoreConfig,
  mocks: ReturnType<typeof createMocks>,
  allowedChatId?: string,
) {
  const controller = new TelegramBotController(
    config,
    mocks.batchAccumulator as any,
    mocks.storeIdentifier as any,
    mocks.visionParser as any,
    mocks.dateAssigner as any,
    mocks.driveUploader as any,
    mocks.sheetsWriter as any,
    mocks.logger as any,
    "test-bot-token",
    allowedChatId,
  );
  // Inject a mock bot so sendMessage works
  (controller as any).bot = {
    api: {
      sendMessage: vi.fn(),
    },
  };
  return controller;
}

// ── Tests ──

describe("TelegramBotController.handlePhotoBatch", () => {
  let config: StoreConfig;
  let mocks: ReturnType<typeof createMocks>;
  let controller: TelegramBotController;

  beforeEach(() => {
    config = makeConfig();
    mocks = createMocks();
    controller = createController(config, mocks);
  });

  describe("Store identification", () => {
    it("processes batch when storeId is pre-set", async () => {
      mocks.visionParser.parsePhoto.mockResolvedValue(
        makeParseResult([
          { type: "date_marker", date: "2026-03-20", position: 1 },
          { type: "sales_record", name: "Item", price: 50, position: 2 },
        ]),
      );
      mocks.dateAssigner.assignDates.mockReturnValue({
        records: [makeDatedRecord()],
        discardedPreDateCount: 0,
        usedFallbackDate: false,
      } as DateAssignmentResult);
      mocks.driveUploader.uploadPhoto.mockResolvedValue({
        fileId: "f1",
        shareableLink: "https://drive.google.com/file/d/f1/view",
        fileName: "STORE_1_2026-03-20_01.jpg",
      } as UploadResult);
      mocks.sheetsWriter.writeRecords.mockResolvedValue(1);

      const batch = makeBatch({ storeId: "STORE_1" });
      await controller.handlePhotoBatch(batch);

      expect(batch.storeId).toBe("STORE_1");
      expect(mocks.sheetsWriter.writeRecords).toHaveBeenCalled();
    });

    it("returns early with error when storeId is empty", async () => {
      const batch = makeBatch({ storeId: "" });
      await controller.handlePhotoBatch(batch);

      const botApi = (controller as any).bot.api;
      expect(botApi.sendMessage).toHaveBeenCalledWith(
        "user-123",
        expect.stringContaining("no store selected"),
      );
      expect(mocks.visionParser.parsePhoto).not.toHaveBeenCalled();
    });
  });

  describe("Photo parsing", () => {
    it("skips unreadable photos and notifies user", async () => {
      mocks.storeIdentifier.identifyByPhone.mockReturnValue({
        storeId: "STORE_1",
        method: "phone",
      });
      // First photo fails, second succeeds
      mocks.visionParser.parsePhoto
        .mockRejectedValueOnce(new Error("Unreadable"))
        .mockResolvedValueOnce(
          makeParseResult([
            { type: "date_marker", date: "2026-03-20", position: 1 },
            { type: "sales_record", name: "Item", price: 50, position: 2 },
          ]),
        );
      mocks.dateAssigner.assignDates.mockReturnValue({
        records: [makeDatedRecord()],
        discardedPreDateCount: 0,
        usedFallbackDate: false,
      } as DateAssignmentResult);
      mocks.driveUploader.uploadPhoto.mockResolvedValue({
        fileId: "f1",
        shareableLink: "https://link",
        fileName: "file.jpg",
      });
      mocks.sheetsWriter.writeRecords.mockResolvedValue(1);

      const batch = makeBatch({
        photos: [
          { buffer: Buffer.from("p1"), format: "jpeg", receivedAt: new Date() },
          { buffer: Buffer.from("p2"), format: "jpeg", receivedAt: new Date() },
        ],
      });
      await controller.handlePhotoBatch(batch);

      const botApi = (controller as any).bot.api;
      // Should notify about unreadable photo
      expect(botApi.sendMessage).toHaveBeenCalledWith(
        "user-123",
        expect.stringContaining("Photo 1 is unreadable"),
      );
      // Should still process and confirm
      expect(mocks.sheetsWriter.writeRecords).toHaveBeenCalled();
    });

    it("returns early when all photos are unreadable", async () => {
      mocks.storeIdentifier.identifyByPhone.mockReturnValue({
        storeId: "STORE_1",
        method: "phone",
      });
      mocks.visionParser.parsePhoto.mockRejectedValue(new Error("Unreadable"));

      const batch = makeBatch();
      await controller.handlePhotoBatch(batch);

      const botApi = (controller as any).bot.api;
      expect(botApi.sendMessage).toHaveBeenCalledWith(
        "user-123",
        expect.stringContaining("None of the photos could be read"),
      );
      expect(mocks.dateAssigner.assignDates).not.toHaveBeenCalled();
    });
  });

  describe("Date assignment notifications", () => {
    it("notifies user when fallback date is used", async () => {
      mocks.storeIdentifier.identifyByPhone.mockReturnValue({
        storeId: "STORE_1",
        method: "phone",
      });
      mocks.visionParser.parsePhoto.mockResolvedValue(
        makeParseResult([
          { type: "sales_record", name: "Item", price: 50, position: 1 },
        ]),
      );
      mocks.dateAssigner.assignDates.mockReturnValue({
        records: [makeDatedRecord()],
        discardedPreDateCount: 0,
        usedFallbackDate: true,
      } as DateAssignmentResult);
      mocks.driveUploader.uploadPhoto.mockResolvedValue({
        fileId: "f1",
        shareableLink: "https://link",
        fileName: "file.jpg",
      });
      mocks.sheetsWriter.writeRecords.mockResolvedValue(1);

      await controller.handlePhotoBatch(makeBatch());

      const botApi = (controller as any).bot.api;
      expect(botApi.sendMessage).toHaveBeenCalledWith(
        "user-123",
        expect.stringContaining("No dates found"),
      );
    });

    it("notifies user about incomplete records", async () => {
      mocks.storeIdentifier.identifyByPhone.mockReturnValue({
        storeId: "STORE_1",
        method: "phone",
      });
      mocks.visionParser.parsePhoto.mockResolvedValue(
        makeParseResult([
          { type: "date_marker", date: "2026-03-20", position: 1 },
          { type: "sales_record", name: "Item", position: 2 },
        ]),
      );
      mocks.dateAssigner.assignDates.mockReturnValue({
        records: [makeDatedRecord({ incomplete: true, price: undefined })],
        discardedPreDateCount: 0,
        usedFallbackDate: false,
      } as DateAssignmentResult);
      mocks.driveUploader.uploadPhoto.mockResolvedValue({
        fileId: "f1",
        shareableLink: "https://link",
        fileName: "file.jpg",
      });
      mocks.sheetsWriter.writeRecords.mockResolvedValue(1);

      await controller.handlePhotoBatch(makeBatch());

      const botApi = (controller as any).bot.api;
      expect(botApi.sendMessage).toHaveBeenCalledWith(
        "user-123",
        expect.stringContaining("missing prices"),
      );
    });
  });

  describe("Drive upload", () => {
    it("continues processing when Drive upload fails", async () => {
      mocks.storeIdentifier.identifyByPhone.mockReturnValue({
        storeId: "STORE_1",
        method: "phone",
      });
      mocks.visionParser.parsePhoto.mockResolvedValue(
        makeParseResult([
          { type: "date_marker", date: "2026-03-20", position: 1 },
          { type: "sales_record", name: "Item", price: 50, position: 2 },
        ]),
      );
      mocks.dateAssigner.assignDates.mockReturnValue({
        records: [makeDatedRecord()],
        discardedPreDateCount: 0,
        usedFallbackDate: false,
      } as DateAssignmentResult);
      mocks.driveUploader.uploadPhoto.mockResolvedValue(null);
      mocks.sheetsWriter.writeRecords.mockResolvedValue(1);

      await controller.handlePhotoBatch(makeBatch());

      // Should still write to sheets
      expect(mocks.sheetsWriter.writeRecords).toHaveBeenCalled();
      // Should send confirmation
      const botApi = (controller as any).bot.api;
      expect(botApi.sendMessage).toHaveBeenCalledWith(
        "user-123",
        expect.stringContaining("Успішно збережено"),
      );
    });

    it("handles Drive upload throwing an error", async () => {
      mocks.storeIdentifier.identifyByPhone.mockReturnValue({
        storeId: "STORE_1",
        method: "phone",
      });
      mocks.visionParser.parsePhoto.mockResolvedValue(
        makeParseResult([
          { type: "date_marker", date: "2026-03-20", position: 1 },
          { type: "sales_record", name: "Item", price: 50, position: 2 },
        ]),
      );
      mocks.dateAssigner.assignDates.mockReturnValue({
        records: [makeDatedRecord()],
        discardedPreDateCount: 0,
        usedFallbackDate: false,
      } as DateAssignmentResult);
      mocks.driveUploader.uploadPhoto.mockRejectedValue(
        new Error("Network error"),
      );
      mocks.sheetsWriter.writeRecords.mockResolvedValue(1);

      await controller.handlePhotoBatch(makeBatch());

      expect(mocks.sheetsWriter.writeRecords).toHaveBeenCalled();
      const botApi = (controller as any).bot.api;
      expect(botApi.sendMessage).toHaveBeenCalledWith(
        "user-123",
        expect.stringContaining("Photo storage failed"),
      );
    });
  });

  describe("Sheets write", () => {
    it("sends confirmation with correct record count", async () => {
      mocks.storeIdentifier.identifyByPhone.mockReturnValue({
        storeId: "STORE_1",
        method: "phone",
      });
      mocks.visionParser.parsePhoto.mockResolvedValue(
        makeParseResult([
          { type: "date_marker", date: "2026-03-20", position: 1 },
          { type: "sales_record", name: "A", price: 10, position: 2 },
          { type: "sales_record", name: "B", price: 20, position: 3 },
        ]),
      );
      mocks.dateAssigner.assignDates.mockReturnValue({
        records: [
          makeDatedRecord({ name: "A" }),
          makeDatedRecord({ name: "B" }),
        ],
        discardedPreDateCount: 0,
        usedFallbackDate: false,
      } as DateAssignmentResult);
      mocks.driveUploader.uploadPhoto.mockResolvedValue({
        fileId: "f1",
        shareableLink: "https://link",
        fileName: "file.jpg",
      });
      mocks.sheetsWriter.writeRecords.mockResolvedValue(2);

      await controller.handlePhotoBatch(makeBatch());

      const botApi = (controller as any).bot.api;
      expect(botApi.sendMessage).toHaveBeenCalledWith(
        "user-123",
        expect.stringContaining("Успішно збережено 2 продаж"),
      );
    });

    it("notifies user when Sheets write fails", async () => {
      mocks.storeIdentifier.identifyByPhone.mockReturnValue({
        storeId: "STORE_1",
        method: "phone",
      });
      mocks.visionParser.parsePhoto.mockResolvedValue(
        makeParseResult([
          { type: "date_marker", date: "2026-03-20", position: 1 },
          { type: "sales_record", name: "Item", price: 50, position: 2 },
        ]),
      );
      mocks.dateAssigner.assignDates.mockReturnValue({
        records: [makeDatedRecord()],
        discardedPreDateCount: 0,
        usedFallbackDate: false,
      } as DateAssignmentResult);
      mocks.driveUploader.uploadPhoto.mockResolvedValue({
        fileId: "f1",
        shareableLink: "https://link",
        fileName: "file.jpg",
      });
      mocks.sheetsWriter.writeRecords.mockRejectedValue(new Error("API error"));

      await controller.handlePhotoBatch(makeBatch());

      const botApi = (controller as any).bot.api;
      expect(botApi.sendMessage).toHaveBeenCalledWith(
        "user-123",
        expect.stringContaining("Failed to save records"),
      );
    });
  });

  describe("Photo link assignment", () => {
    it("sets photoLink only on first record per photo", async () => {
      mocks.storeIdentifier.identifyByPhone.mockReturnValue({
        storeId: "STORE_1",
        method: "phone",
      });
      const records = [
        makeDatedRecord({ name: "A" }),
        makeDatedRecord({ name: "B" }),
      ];
      mocks.visionParser.parsePhoto.mockResolvedValue(
        makeParseResult([
          { type: "date_marker", date: "2026-03-20", position: 1 },
          { type: "sales_record", name: "A", price: 10, position: 2 },
          { type: "sales_record", name: "B", price: 20, position: 3 },
        ]),
      );
      mocks.dateAssigner.assignDates.mockReturnValue({
        records,
        discardedPreDateCount: 0,
        usedFallbackDate: false,
      } as DateAssignmentResult);
      mocks.driveUploader.uploadPhoto.mockResolvedValue({
        fileId: "f1",
        shareableLink: "https://drive.google.com/file/d/f1/view",
        fileName: "STORE_1_2026-03-20_01.jpg",
      } as UploadResult);
      mocks.sheetsWriter.writeRecords.mockResolvedValue(2);

      await controller.handlePhotoBatch(makeBatch());

      // First record should have photoLink, second should not
      expect(records[0].photoLink).toBe(
        "https://drive.google.com/file/d/f1/view",
      );
      expect(records[1].photoLink).toBeUndefined();
    });
  });

  describe("Error handling", () => {
    it("catches unexpected errors and notifies user", async () => {
      mocks.visionParser.parsePhoto.mockResolvedValue(
        makeParseResult([
          { type: "date_marker", date: "2026-03-20", position: 1 },
          { type: "sales_record", name: "Item", price: 50, position: 2 },
        ]),
      );
      mocks.dateAssigner.assignDates.mockImplementation(() => {
        throw new Error("Unexpected crash");
      });

      await controller.handlePhotoBatch(makeBatch());

      const botApi = (controller as any).bot.api;
      expect(botApi.sendMessage).toHaveBeenCalledWith(
        "user-123",
        expect.stringContaining("несподівану помилку"),
      );
      expect(mocks.logger.error).toHaveBeenCalledWith(
        "batch_processing_failed",
        expect.objectContaining({ error: "Unexpected crash" }),
      );
    });
  });

  describe("sendMessage", () => {
    it("sends message via bot API", async () => {
      await controller.sendMessage("chat-1", "Hello");

      const botApi = (controller as any).bot.api;
      expect(botApi.sendMessage).toHaveBeenCalledWith("chat-1", "Hello");
    });

    it("logs error when bot is not initialized", async () => {
      (controller as any).bot = undefined;
      await controller.sendMessage("chat-1", "Hello");

      expect(mocks.logger.error).toHaveBeenCalledWith(
        "send_message_failed",
        expect.objectContaining({ error: "Bot not initialized" }),
      );
    });
  });

  describe("Logging", () => {
    it("logs successful batch processing", async () => {
      mocks.storeIdentifier.identifyByPhone.mockReturnValue({
        storeId: "STORE_1",
        method: "phone",
      });
      mocks.visionParser.parsePhoto.mockResolvedValue(
        makeParseResult([
          { type: "date_marker", date: "2026-03-20", position: 1 },
          { type: "sales_record", name: "Item", price: 50, position: 2 },
        ]),
      );
      mocks.dateAssigner.assignDates.mockReturnValue({
        records: [makeDatedRecord()],
        discardedPreDateCount: 0,
        usedFallbackDate: false,
      } as DateAssignmentResult);
      mocks.driveUploader.uploadPhoto.mockResolvedValue({
        fileId: "f1",
        shareableLink: "https://link",
        fileName: "file.jpg",
      });
      mocks.sheetsWriter.writeRecords.mockResolvedValue(1);

      await controller.handlePhotoBatch(makeBatch());

      expect(mocks.logger.info).toHaveBeenCalledWith(
        "batch_processed",
        expect.objectContaining({
          senderId: "user-123",
          storeId: "STORE_1",
          recordCount: 1,
        }),
      );
    });
  });
});
