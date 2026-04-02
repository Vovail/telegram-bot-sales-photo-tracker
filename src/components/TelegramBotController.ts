import { Bot, InlineKeyboard } from "grammy";
import type {
  StoreConfig,
  PhotoBatch,
  TelegramPhoto,
  PhotoParseResult,
  UploadResult,
} from "../types/index.js";
import type { BatchAccumulator } from "./BatchAccumulator.js";
import type { StoreIdentifier } from "./StoreIdentifier.js";
import type { VisionParser } from "./VisionParser.js";
import type { DateAssigner } from "./DateAssigner.js";
import { GoogleDriveUploader } from "./GoogleDriveUploader.js";
import type { GoogleSheetsWriter } from "./GoogleSheetsWriter.js";
import type { Logger } from "./Logger.js";

export class TelegramBotController {
  private config: StoreConfig;
  private batchAccumulator: BatchAccumulator;
  private storeIdentifier: StoreIdentifier;
  private visionParser: VisionParser;
  private dateAssigner: DateAssigner;
  private driveUploader: GoogleDriveUploader;
  private sheetsWriter: GoogleSheetsWriter;
  private logger: Logger;
  private botToken: string;
  private bot: Bot | undefined;

  constructor(
    config: StoreConfig,
    batchAccumulator: BatchAccumulator,
    storeIdentifier: StoreIdentifier,
    visionParser: VisionParser,
    dateAssigner: DateAssigner,
    driveUploader: GoogleDriveUploader,
    sheetsWriter: GoogleSheetsWriter,
    logger: Logger,
    botToken: string,
  ) {
    this.config = config;
    this.batchAccumulator = batchAccumulator;
    this.storeIdentifier = storeIdentifier;
    this.visionParser = visionParser;
    this.dateAssigner = dateAssigner;
    this.driveUploader = driveUploader;
    this.sheetsWriter = sheetsWriter;
    this.logger = logger;
    this.botToken = botToken;
  }

  async start(): Promise<void> {
    this.bot = new Bot(this.botToken);

    // Register batch callback
    this.batchAccumulator.onBatchReady((batch) => this.handlePhotoBatch(batch));

    // Photo handler
    this.bot.on("message:photo", async (ctx) => {
      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];

      const file = await ctx.api.getFile(largest.file_id);
      const filePath = file.file_path ?? "";
      const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;

      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const ext = filePath.split(".").pop()?.toLowerCase() ?? "jpeg";
      const format = (["jpeg", "png", "heic"].includes(ext) ? ext : "jpeg") as
        | "jpeg"
        | "png"
        | "heic";

      const telegramPhoto: TelegramPhoto = {
        buffer,
        format,
        receivedAt: new Date(),
      };

      const senderId = String(ctx.from?.id ?? ctx.message.chat.id);
      // grammY User type doesn't expose phone_number but Telegram API may provide it
      const fromUser = ctx.from as unknown as
        | { phone_number?: string }
        | undefined;
      const senderPhone = fromUser?.phone_number;

      this.batchAccumulator.addPhoto(senderId, senderPhone, telegramPhoto);

      await ctx.reply(
        "📸 Photo received! Send more or press Process Now when ready.",
      );

      const keyboard = new InlineKeyboard().text(
        "⚡ Process Now",
        "process_now",
      );
      await ctx.reply("Ready to process?", { reply_markup: keyboard });
    });

    // "Process Now" command
    this.bot.command("process", async (ctx) => {
      const senderId = String(ctx.from?.id ?? ctx.message?.chat.id);
      this.batchAccumulator.processNow(senderId);
      await ctx.reply("⚡ Processing your photos now...");
    });

    // Inline button handler for "Process Now"
    this.bot.on("callback_query:data", async (ctx) => {
      if (ctx.callbackQuery.data === "process_now") {
        const senderId = String(ctx.from.id);
        this.batchAccumulator.processNow(senderId);
        await ctx.answerCallbackQuery({ text: "Processing started!" });
        await ctx.reply("⚡ Processing your photos now...");
      }
    });

    // Text handler: respond with instructions if not a command
    this.bot.on("message:text", async (ctx) => {
      const text = ctx.message.text;
      if (text.startsWith("/")) {
        return; // Let other handlers or grammY handle commands
      }
      await ctx.reply(
        "📷 Please send photos of your sales notes. I'll process them and record the data for you.",
      );
    });

    this.logger.info("bot_started", {
      details: { message: "Telegram bot started and listening for messages" },
    });

    await this.bot.start();
  }

  /**
   * Send a text message to a Telegram chat using the bot API.
   */
  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.bot) {
      this.logger.error("send_message_failed", {
        error: "Bot not initialized",
        details: { chatId },
      });
      return;
    }
    await this.bot.api.sendMessage(chatId, text);
  }

  /**
   * Handle a finalized photo batch: identify store, parse photos, assign dates,
   * upload to Drive, write to Sheets, and send confirmation.
   */
  async handlePhotoBatch(batch: PhotoBatch): Promise<void> {
    this.logger.info("batch_received", {
      senderId: batch.senderId,
      storeId: batch.storeId || "unidentified",
      details: {
        photoCount: batch.photos.length,
        senderPhone: batch.senderPhone ?? "unknown",
      },
    });

    try {
      // 1. Identify store
      if (batch.senderPhone) {
        const result = this.storeIdentifier.identifyByPhone(batch.senderPhone);
        if (result) {
          batch.storeId = result.storeId;
        } else {
          // Unregistered phone — prompt for manual Store_ID
          const validIds = this.config.stores.map((s) => s.storeId).join(", ");
          await this.sendMessage(
            batch.senderId,
            `📋 Your phone number is not registered. Please provide your Store ID.\nValid Store IDs: ${validIds}`,
          );
          // TODO: Implement interactive flow where user replies with a Store_ID.
          // For now, we just prompt and return. The manual reply handling can be
          // added as a future enhancement via a conversation state machine.
          this.logger.warn("unregistered_phone", {
            senderId: batch.senderId,
            details: { senderPhone: batch.senderPhone },
          });
          return;
        }
      } else {
        // No phone available — prompt for manual Store_ID
        const validIds = this.config.stores.map((s) => s.storeId).join(", ");
        await this.sendMessage(
          batch.senderId,
          `📋 Could not detect your phone number. Please provide your Store ID.\nValid Store IDs: ${validIds}`,
        );
        // TODO: Implement interactive manual Store_ID flow as a future enhancement.
        this.logger.warn("no_phone_number", {
          senderId: batch.senderId,
        });
        return;
      }

      // 2. Parse photos
      const parseResults: PhotoParseResult[] = [];
      const photoIndexMap: number[] = []; // tracks which photo index each parseResult came from

      for (let i = 0; i < batch.photos.length; i++) {
        const photo = batch.photos[i];
        try {
          const result = await this.visionParser.parsePhoto(photo.buffer);
          parseResults.push(result);
          photoIndexMap.push(i);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          this.logger.warn("photo_unreadable", {
            senderId: batch.senderId,
            storeId: batch.storeId,
            error: message,
            details: { photoIndex: i },
          });
          await this.sendMessage(
            batch.senderId,
            `⚠️ Photo ${i + 1} is unreadable and was skipped. Please resend a clearer photo if needed.`,
          );
        }
      }

      // 3. Check if any photos were successfully parsed
      if (parseResults.length === 0) {
        await this.sendMessage(
          batch.senderId,
          "❌ None of the photos could be read. Please resend clearer photos.",
        );
        this.logger.warn("all_photos_unreadable", {
          senderId: batch.senderId,
          storeId: batch.storeId,
          details: { photoCount: batch.photos.length },
        });
        return;
      }

      // 4. Assign dates
      const today = new Date().toISOString().substring(0, 10);
      const dateResult = this.dateAssigner.assignDates(parseResults, today);

      if (dateResult.usedFallbackDate) {
        await this.sendMessage(
          batch.senderId,
          `ℹ️ No dates found in photos. Using today's date (${today}) for all records.`,
        );
      }

      if (dateResult.discardedPreDateCount > 0) {
        this.logger.info("pre_date_records_discarded", {
          senderId: batch.senderId,
          storeId: batch.storeId,
          details: { discardedCount: dateResult.discardedPreDateCount },
        });
      }

      // 5. Notify about incomplete records
      const incompleteCount = dateResult.records.filter(
        (r) => r.incomplete,
      ).length;
      if (incompleteCount > 0) {
        await this.sendMessage(
          batch.senderId,
          `⚠️ ${incompleteCount} record(s) are missing prices and were flagged as incomplete.`,
        );
      }

      // 6. Upload photos to Drive & 7. Set photoLink on first record per photo
      // Count how many records came from each parseResult to map records to photos
      const recordsPerParseResult: number[] = [];
      for (const pr of parseResults) {
        const salesCount = pr.elements.filter(
          (el) => el.type === "sales_record",
        ).length;
        recordsPerParseResult.push(salesCount);
      }

      // Build a mapping: for each record in dateResult.records, which parseResult index it came from
      // Note: dateAssigner may discard pre-date records from the first photo, so we need to
      // carefully track. We'll rebuild the mapping by walking through parseResults the same way
      // dateAssigner does, but only tracking the photo index for non-discarded records.
      const recordPhotoIndex: number[] = [];
      {
        let activeDate: string | null = null;
        const anyDateMarkerFound = parseResults.some((pr) =>
          pr.elements.some((el) => el.type === "date_marker"),
        );

        if (!anyDateMarkerFound) {
          // All records kept, in order across parseResults
          for (let pi = 0; pi < parseResults.length; pi++) {
            for (const el of parseResults[pi].elements) {
              if (el.type === "sales_record") {
                recordPhotoIndex.push(photoIndexMap[pi]);
              }
            }
          }
        } else {
          const pendingPhotoIndices: number[] = [];
          for (let pi = 0; pi < parseResults.length; pi++) {
            const isFirstPhoto = pi === 0;
            for (const element of parseResults[pi].elements) {
              if (element.type === "date_marker") {
                // Flush pending
                for (const idx of pendingPhotoIndices) {
                  recordPhotoIndex.push(idx);
                }
                pendingPhotoIndices.length = 0;
                activeDate = element.date;
              } else if (element.type === "sales_record") {
                if (activeDate !== null) {
                  recordPhotoIndex.push(photoIndexMap[pi]);
                } else if (isFirstPhoto) {
                  // Discarded — don't add to mapping
                } else {
                  pendingPhotoIndices.push(photoIndexMap[pi]);
                }
              }
            }
          }
        }
      }

      // Upload each photo to Drive
      const uploadResults: (UploadResult | null)[] = [];
      for (let pi = 0; pi < parseResults.length; pi++) {
        const originalPhotoIndex = photoIndexMap[pi];
        const photo = batch.photos[originalPhotoIndex];
        const date = today; // Use today for filename; could use first record date
        const sequenceNumber = pi + 1;
        const fileName = GoogleDriveUploader.generateFileName(
          batch.storeId,
          date,
          sequenceNumber,
          photo.format === "jpeg" ? "jpg" : photo.format,
        );
        const monthSubfolder = date.substring(0, 7);

        try {
          const result = await this.driveUploader.uploadPhoto(
            photo.buffer,
            fileName,
            this.config.sharedDriveFolderId,
            monthSubfolder,
          );
          uploadResults.push(result);
          if (!result) {
            this.logger.warn("drive_upload_returned_null", {
              senderId: batch.senderId,
              storeId: batch.storeId,
              details: { fileName },
            });
            await this.sendMessage(
              batch.senderId,
              `⚠️ Photo storage failed for ${fileName}. Records will be saved without photo link.`,
            );
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          this.logger.error("drive_upload_error", {
            senderId: batch.senderId,
            storeId: batch.storeId,
            error: message,
            details: { fileName },
          });
          await this.sendMessage(
            batch.senderId,
            `⚠️ Photo storage failed for ${fileName}. Records will be saved without photo link.`,
          );
          uploadResults.push(null);
        }
      }

      // Set photoLink on the first record from each photo
      const photoLinkSet = new Set<number>(); // track which photo indices already had their first record linked
      for (let ri = 0; ri < dateResult.records.length; ri++) {
        const origPhotoIdx = recordPhotoIndex[ri];
        if (origPhotoIdx === undefined) continue;

        // Find which parseResult index corresponds to this original photo index
        const parseResultIdx = photoIndexMap.indexOf(origPhotoIdx);
        if (parseResultIdx === -1) continue;

        const uploadResult = uploadResults[parseResultIdx];
        if (uploadResult && !photoLinkSet.has(origPhotoIdx)) {
          dateResult.records[ri].photoLink = uploadResult.shareableLink;
          photoLinkSet.add(origPhotoIdx);
        }
      }

      // 8. Write to Sheets
      const storeDef = this.config.stores.find(
        (s) => s.storeId === batch.storeId,
      );
      if (!storeDef) {
        this.logger.error("store_not_found_for_write", {
          senderId: batch.senderId,
          storeId: batch.storeId,
          error: `Store definition not found for storeId: ${batch.storeId}`,
        });
        await this.sendMessage(
          batch.senderId,
          "❌ Processing failed: store configuration not found. Please contact support.",
        );
        return;
      }

      let writtenCount: number;
      try {
        writtenCount = await this.sheetsWriter.writeRecords(
          storeDef.sheetDocumentId,
          dateResult.records,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        this.logger.error("sheets_write_failed", {
          senderId: batch.senderId,
          storeId: batch.storeId,
          error: message,
          recordCount: dateResult.records.length,
        });
        await this.sendMessage(
          batch.senderId,
          "❌ Failed to save records to the spreadsheet. Please try resending your photos.",
        );
        return;
      }

      // 9. Send confirmation
      await this.sendMessage(
        batch.senderId,
        `✅ Successfully recorded ${writtenCount} sales record(s) for store ${batch.storeId}.`,
      );

      // 10. Log successful processing
      this.logger.info("batch_processed", {
        senderId: batch.senderId,
        storeId: batch.storeId,
        recordCount: writtenCount,
        details: {
          photoCount: batch.photos.length,
          parsedPhotoCount: parseResults.length,
          incompleteRecords: incompleteCount,
          usedFallbackDate: dateResult.usedFallbackDate,
          discardedPreDateCount: dateResult.discardedPreDateCount,
        },
      });
    } catch (error) {
      // Catch-all for unexpected errors
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error("batch_processing_failed", {
        senderId: batch.senderId,
        storeId: batch.storeId || "unidentified",
        error: message,
      });
      try {
        await this.sendMessage(
          batch.senderId,
          "❌ Processing failed due to an unexpected error. Please try resending your photos.",
        );
      } catch {
        // If we can't even send the error message, just log it
        this.logger.error("error_notification_failed", {
          senderId: batch.senderId,
          error: "Failed to send error notification to user",
        });
      }
    }
  }
}
