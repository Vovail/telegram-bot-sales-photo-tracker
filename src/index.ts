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

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const googleCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  const useOAuth = googleClientId && googleClientSecret && googleRefreshToken;

  if (!useOAuth && !googleCredentialsPath) {
    logger.error("startup_failed", {
      error:
        "Set either GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN (OAuth) " +
        "or GOOGLE_APPLICATION_CREDENTIALS (service account)",
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

  // 4. Initialize Google APIs (Drive and Sheets)
  let auth;
  if (useOAuth) {
    const oauth2Client = new google.auth.OAuth2(
      googleClientId,
      googleClientSecret,
    );
    oauth2Client.setCredentials({ refresh_token: googleRefreshToken });
    auth = oauth2Client;
    logger.info("google_auth", { details: { method: "oauth2" } });
  } else {
    auth = new google.auth.GoogleAuth({
      keyFile: googleCredentialsPath!,
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    });
    logger.info("google_auth", { details: { method: "service_account" } });
  }

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
  const allowedChatId = process.env.ALLOWED_CHAT_ID || undefined;
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
    allowedChatId,
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
