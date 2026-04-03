import "dotenv/config";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { ConfigLoader } from "../src/components/ConfigLoader.js";
import { BatchAccumulator } from "../src/components/BatchAccumulator.js";
import { StoreIdentifier } from "../src/components/StoreIdentifier.js";
import { VisionParser } from "../src/components/VisionParser.js";
import { DateAssigner } from "../src/components/DateAssigner.js";
import { GoogleDriveUploader } from "../src/components/GoogleDriveUploader.js";
import { GoogleSheetsWriter } from "../src/components/GoogleSheetsWriter.js";
import { Logger } from "../src/components/Logger.js";
import { TelegramBotController } from "../src/components/TelegramBotController.js";

let handler: ((req: Request) => Promise<Response>) | undefined;

function getHandler(): (req: Request) => Promise<Response> {
  if (handler) return handler;

  const logger = new Logger();

  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const googleCredentials = process.env.GOOGLE_CREDENTIALS_JSON;
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  const useOAuth = googleClientId && googleClientSecret && googleRefreshToken;

  if (!telegramBotToken || !geminiApiKey || (!useOAuth && !googleCredentials)) {
    throw new Error(
      "Missing required env vars: TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, and either " +
        "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN (OAuth) " +
        "or GOOGLE_CREDENTIALS_JSON (service account)",
    );
  }

  const configLoader = new ConfigLoader();
  const storesJson = process.env.STORES_CONFIG_JSON;
  const configPath = process.env.CONFIG_PATH ?? "stores.json";
  const storeConfig = storesJson
    ? configLoader.loadFromJson(storesJson)
    : configLoader.load(configPath);

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Initialize Google auth — prefer OAuth, fall back to service account
  let auth;
  if (useOAuth) {
    const oauth2Client = new google.auth.OAuth2(
      googleClientId,
      googleClientSecret,
    );
    oauth2Client.setCredentials({ refresh_token: googleRefreshToken });
    auth = oauth2Client;
  } else {
    const credentials = JSON.parse(googleCredentials!);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
      ],
    });
  }

  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });

  const batchAccumulator = new BatchAccumulator();
  const storeIdentifier = new StoreIdentifier(storeConfig);
  const visionParser = new VisionParser(geminiModel);
  const dateAssigner = new DateAssigner();
  const driveUploader = new GoogleDriveUploader(drive);
  const sheetsWriter = new GoogleSheetsWriter(sheets);

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

  handler = controller.getWebhookHandler();
  return handler;
}

export default async function POST(req: Request): Promise<Response> {
  try {
    const handle = getHandler();
    return await handle(req);
  } catch (error) {
    console.error("Webhook error:", error);
    // Always return 200 to Telegram so it doesn't retry endlessly
    return new Response("OK", { status: 200 });
  }
}
