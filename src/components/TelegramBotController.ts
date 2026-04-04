import { Bot, InlineKeyboard, webhookCallback } from "grammy";
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
  private allowedChatId: string | undefined;
  private replyDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly isServerless = process.env.VERCEL === "1";

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
    allowedChatId?: string,
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
    this.allowedChatId = allowedChatId;
  }

  /**
   * Initialize the bot instance and register all handlers.
   * Called by both start() (polling) and getWebhookHandler() (serverless).
   */
  private initBot(): Bot {
    if (this.bot) return this.bot;

    this.bot = new Bot(this.botToken);

    // Register batch callback
    this.batchAccumulator.onBatchReady((batch) => this.handlePhotoBatch(batch));

    this.registerHandlers();
    return this.bot;
  }

  /**
   * Try to identify the store for a sender by phone number.
   * Returns the storeId if found, undefined otherwise.
   */
  private identifyStoreForSender(
    senderPhone: string | undefined,
  ): string | undefined {
    if (senderPhone) {
      const result = this.storeIdentifier.identifyByPhone(senderPhone);
      if (result) return result.storeId;
    }
    // Auto-select if only one store configured
    if (this.config.stores.length === 1) {
      return this.config.stores[0].storeId;
    }
    return undefined;
  }

  /**
   * Build an InlineKeyboard with one button per store for store selection.
   */
  private buildStoreSelectionKeyboard(): InlineKeyboard {
    const keyboard = new InlineKeyboard();
    for (const store of this.config.stores) {
      keyboard.text(store.storeId, `store_select:${store.storeId}`).row();
    }
    return keyboard;
  }

  /**
   * Attempt to process the batch for a sender. If store can't be identified,
   * show store selection buttons instead.
   */
  private async triggerProcessing(
    senderId: string,
    chatId: string | number,
  ): Promise<void> {
    if (!this.batchAccumulator.hasPendingBatch(senderId)) {
      await this.sendMessage(
        String(chatId),
        "📭 No photos to process. Send some photos first!",
      );
      return;
    }

    // Try to identify store from phone (stored in pending batch)
    const pending = this.batchAccumulator.getPendingBatch(senderId);
    const storeId = this.identifyStoreForSender(pending?.senderPhone);

    if (storeId) {
      await this.batchAccumulator.processWithStore(senderId, storeId);
      await this.sendMessage(
        String(chatId),
        "⚡ Processing your photos now...",
      );
    } else {
      // Show store selection buttons
      if (!this.bot) return;
      const keyboard = this.buildStoreSelectionKeyboard();
      await this.bot.api.sendMessage(Number(chatId), "🏪 Виберіть магазин:", {
        reply_markup: keyboard,
      });
    }
  }

  /**
   * Register all message/command/callback handlers on the bot.
   */
  private registerHandlers(): void {
    if (!this.bot) return;

    // Shared photo handling logic
    const handlePhoto = async (
      ctx: {
        chat: { id: number };
        from?: { id: number; phone_number?: string };
        message?: { photo: { file_id: string }[] };
        api: { getFile: (id: string) => Promise<{ file_path?: string }> };
        reply: (text: string, options?: object) => Promise<unknown>;
      },
      photos: { file_id: string }[],
    ) => {
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

      const senderId = String(ctx.chat.id);
      const fromUser = ctx.from as unknown as
        | { phone_number?: string }
        | undefined;
      const senderPhone = fromUser?.phone_number;

      this.batchAccumulator.addPhoto(senderId, senderPhone, telegramPhoto);

      this.logger.info("photo_added", {
        senderId,
        details: {
          chatId: ctx.chat.id,
          fromId: ctx.from?.id,
          format: telegramPhoto.format,
        },
      });

      const pending = this.batchAccumulator.getPendingBatch(senderId);
      const photoCount = pending?.photos.length ?? 1;

      const sendReply = async () => {
        try {
          await ctx.reply(
            `📸 ${photoCount} ${photoCount === 1 ? "фотографія" : "фотографій"} отримано! Додайте ще або натисніть "Опрацювати зараз"`,
          );
          const keyboard = new InlineKeyboard().text(
            "⚡ Опрацювати зараз",
            "process_now",
          );
          await ctx.reply("Готово для опрацювання?", {
            reply_markup: keyboard,
          });
        } catch (err) {
          this.logger.info("reply_error", {
            senderId,
            details: {
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      };

      if (this.isServerless) {
        // Serverless: process exits after response, timers never fire — reply immediately
        await sendReply();
      } else {
        // Polling: process stays alive, debounce so burst uploads produce one prompt
        const existingTimer = this.replyDebounceTimers.get(senderId);
        if (existingTimer) clearTimeout(existingTimer);
        this.replyDebounceTimers.set(senderId, setTimeout(sendReply, 1500));
      }
    };

    // Photo handler — direct messages and groups
    this.bot.on("message:photo", async (ctx) => {
      if (!this.isChatAllowed(ctx.chat.id)) return;
      await handlePhoto(ctx, ctx.message.photo);
    });

    // Photo handler — channel posts
    this.bot.on("channel_post:photo", async (ctx) => {
      if (!this.isChatAllowed(ctx.chat.id)) return;
      await handlePhoto(ctx as any, ctx.channelPost.photo);
    });

    // "Process Now" command — direct messages and groups
    this.bot.command("process", async (ctx) => {
      if (!this.isChatAllowed(ctx.chat.id)) return;
      const senderId = String(ctx.chat.id);
      await this.triggerProcessing(senderId, ctx.chat.id);
    });

    // "Process Now" command — channel posts
    this.bot.on("channel_post:text", async (ctx) => {
      if (!this.isChatAllowed(ctx.chat.id)) return;
      const text = ctx.channelPost.text?.trim();
      if (text === "/process" || text?.startsWith("/process ")) {
        const senderId = String(ctx.chat.id);
        await this.triggerProcessing(senderId, ctx.chat.id);
      }
    });

    // Inline button handler for "Process Now" and store selection
    this.bot.on("callback_query:data", async (ctx) => {
      if (!this.isChatAllowed(ctx.chat?.id ?? 0)) return;
      const data = ctx.callbackQuery.data;

      if (data === "process_now") {
        const senderId = String(ctx.chat!.id);
        await ctx.answerCallbackQuery({ text: "Processing..." });
        await this.triggerProcessing(senderId, ctx.chat!.id);
      } else if (data.startsWith("store_select:")) {
        const storeId = data.substring("store_select:".length);
        const senderId = String(ctx.chat!.id);

        if (!this.batchAccumulator.hasPendingBatch(senderId)) {
          await ctx.answerCallbackQuery({ text: "No photos to process." });
          return;
        }

        await ctx.answerCallbackQuery({ text: `Store: ${storeId}` });
        await ctx.reply(`⚡ Опрацьовую фото продаж: ${storeId}...`);
        await this.batchAccumulator.processWithStore(senderId, storeId);
      }
    });

    // Text handler: respond with instructions if not a command
    this.bot.on("message:text", async (ctx) => {
      if (!this.isChatAllowed(ctx.chat.id)) return;
      const text = ctx.message.text;
      if (text.startsWith("/")) {
        return; // Let other handlers or grammY handle commands
      }
      await ctx.reply(
        "📷 Please send photos of your sales notes. I'll process them and record the data for you.",
      );
    });
  }

  private isChatAllowed(chatId: number | string): boolean {
    if (!this.allowedChatId) return true;
    return String(chatId) === this.allowedChatId;
  }

  /**
   * Start the bot in long-polling mode.
   * Use this for local development or non-serverless deployments.
   */
  async start(): Promise<void> {
    this.initBot();

    this.logger.info("bot_started", {
      details: { message: "Telegram bot started in polling mode" },
    });

    await this.bot!.start();
  }

  /**
   * Returns a webhook callback handler compatible with Vercel/Express.
   * Use this for serverless deployments (Vercel, AWS Lambda, etc.).
   */
  getWebhookHandler(): (req: Request) => Promise<Response> {
    const bot = this.initBot();

    this.logger.info("bot_started", {
      details: { message: "Telegram bot initialized in webhook mode" },
    });

    return webhookCallback(bot, "std/http");
  }

  /**
   * Returns the initialized bot instance for direct update handling.
   * Use this in serverless environments where you need to control
   * the response lifecycle independently of grammY's webhook callback.
   */
  getBot(): Bot {
    return this.initBot();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getExpressWebhookHandler(): (req: any, res: any) => Promise<void> {
    const bot = this.initBot();

    this.logger.info("bot_started", {
      details: { message: "Telegram bot initialized in webhook mode" },
    });

    const cb = webhookCallback(bot, "http");

    return async (req: any, res: any) => {
      // Vercel pre-parses req.body before the handler runs.
      // grammY's "http" adapter reads the raw stream, so we re-inject the
      // parsed body as a Readable stream to avoid a double-parse conflict.
      if (req.body && typeof req.body === "object") {
        const { Readable } = await import("stream");
        const bodyStr = JSON.stringify(req.body);
        const readable = new Readable({ read() {} });
        readable.push(bodyStr);
        readable.push(null);
        (readable as any).headers = req.headers;
        (readable as any).method = req.method;
        await cb(readable as any, res);
      } else {
        await cb(req, res);
      }
    };
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
      // 1. Validate store is set (should be pre-assigned by triggerProcessing or processWithStore)
      if (!batch.storeId) {
        this.logger.error("batch_missing_store", {
          senderId: batch.senderId,
          error: "Batch reached handlePhotoBatch without a storeId",
        });
        await this.sendMessage(
          batch.senderId,
          "❌ Processing failed: no store selected. Please try again.",
        );
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

      // Set photoLink on the first record from each photo PER MONTH.
      // When a single photo contains records spanning multiple months
      // (e.g. 31.03 and 01.04), each month's first record gets the link
      // so the photo appears in both month tabs.
      const photoMonthLinkSet = new Set<string>(); // "photoIdx:YYYY-MM"
      for (let ri = 0; ri < dateResult.records.length; ri++) {
        const origPhotoIdx = recordPhotoIndex[ri];
        if (origPhotoIdx === undefined) continue;

        const parseResultIdx = photoIndexMap.indexOf(origPhotoIdx);
        if (parseResultIdx === -1) continue;

        const uploadResult = uploadResults[parseResultIdx];
        if (!uploadResult) continue;

        const monthKey = dateResult.records[ri].date.substring(0, 7);
        const key = `${origPhotoIdx}:${monthKey}`;
        if (!photoMonthLinkSet.has(key)) {
          dateResult.records[ri].photoLink = uploadResult.shareableLink;
          photoMonthLinkSet.add(key);
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

      // 9. Send confirmation with detailed summary
      const summaryLines: string[] = [];
      summaryLines.push(
        `✅ Успішно збережено ${writtenCount} продаж для ${batch.storeId}.`,
      );

      // Build per-day breakdown and collect tabs (months)
      const perDay = new Map<string, number>();
      const tabsCreated = new Set<string>();
      for (const rec of dateResult.records) {
        perDay.set(rec.date, (perDay.get(rec.date) ?? 0) + 1);
        tabsCreated.add(rec.date.substring(0, 7));
      }

      // Day breakdown sorted chronologically
      const sortedDays = [...perDay.entries()].sort((a, b) =>
        a[0].localeCompare(b[0]),
      );
      summaryLines.push("");
      summaryLines.push("📅 По днях:");
      for (const [date, count] of sortedDays) {
        const [y, m, d] = date.split("-");
        summaryLines.push(`  ${d}.${m}.${y} — ${count} запис(ів)`);
      }

      // Tabs (month sheets)
      const sortedTabs = [...tabsCreated].sort();
      summaryLines.push("");
      summaryLines.push(`📑 Вкладки: ${sortedTabs.join(", ")}`);

      await this.sendMessage(batch.senderId, summaryLines.join("\n"));

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
          "❌ Обробка фото не вдалася через несподівану помилку. Спробуйте надіслати фотографії ще раз.",
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
