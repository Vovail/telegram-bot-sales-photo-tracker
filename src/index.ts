import "dotenv/config";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { ConfigLoader } from "./components/ConfigLoader.js";
import { BatchAccumulator } from "./components/BatchAccumulator.js";
import { StoreIdentifier } from "./components/StoreIdentifier.js";
import { VisionParser } from "./components/VisionParser.js";
import { DateAssigner } from "./components/DateAssigner.js";
import { GoogleDriveUploader } from "./components/GoogleDriveUploader.js";
import { GoogleSheetsWriter } from "./components/GoogleSheetsWriter.js";
import { Logger } from "./components/Logger.js";
import { TelegramBotController } from "./components/TelegramBotController.js";

async function main(): Promise<void> {
  const logger = new Logger();

  // 1. Read environment variables
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramBotToken) {
    logger.error("startup_failed", {
      error: "Missing required environment variable: TELEGRAM_BOT_TOKEN",
    });
    process.exit(1);
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    logger.error("startup_failed", {
      error: "Missing required environment variable: GEMINI_API_KEY",
    });
    process.exit(1);
  }

  const googleCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!googleCredentialsPath) {
    logger.error("startup_failed", {
      error:
        "Missing required environment variable: GOOGLE_APPLICATION_CREDENTIALS",
    });
    process.exit(1);
  }

  // 2. Load and validate store config
  const configPath = process.env.CONFIG_PATH ?? "stores.json";
  const configLoader = new ConfigLoader();

  let storeConfig;
  try {
    storeConfig = configLoader.load(configPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("config_load_failed", { error: message });
    process.exit(1);
  }

  // 3. Initialize Gemini client
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // 4. Initialize Google APIs (Drive and Sheets) using service account
  const auth = new google.auth.GoogleAuth({
    keyFile: googleCredentialsPath,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });

  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });

  // 5. Initialize all components
  const batchAccumulator = new BatchAccumulator();
  const storeIdentifier = new StoreIdentifier(storeConfig);
  const visionParser = new VisionParser(geminiModel);
  const dateAssigner = new DateAssigner();
  const driveUploader = new GoogleDriveUploader(drive);
  const sheetsWriter = new GoogleSheetsWriter(sheets);

  // 6. Create controller with all dependencies and start
  const controller = new TelegramBotController(
    storeConfig,
    batchAccumulator,
    storeIdentifier,
    visionParser,
    dateAssigner,
    driveUploader,
    sheetsWriter,
    logger,
    telegramBotToken,
  );

  logger.info("startup", {
    details: {
      configPath,
      storeCount: storeConfig.stores.length,
      storeIds: storeConfig.stores.map((s) => s.storeId),
    },
  });

  await controller.start();
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal startup error: ${message}`);
  process.exit(1);
});
