# Sales Photo Tracker Bot

Telegram bot that automates daily sales data collection from multiple offline stores. Store employees send photos of handwritten sales records to the bot, which uses AI vision (Google Gemini) to parse the data and automatically uploads photos to Google Drive and records sales entries into Google Sheets.

## How It Works

1. A store employee sends one or more photos of handwritten sales records to the Telegram bot
2. The bot identifies the store by the sender's phone number (or asks to select manually)
3. Photos are batched and processed together
4. Google Gemini AI parses each photo, extracting item names, sizes, colors, prices, and dates
5. Photos are uploaded to a shared Google Drive folder
6. Parsed sales records are written to the store's Google Sheet with auto-created monthly tabs

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Telegram:** [grammY](https://grammy.dev/) framework
- **AI Vision:** Google Gemini 2.5 Flash
- **Storage:** Google Drive API, Google Sheets API
- **Deployment:** Vercel (serverless) with GitHub Actions CI/CD
- **Testing:** Vitest

## Project Structure

```
├── api/
│   └── webhook.ts            # Vercel serverless entry point
├── src/
│   ├── index.ts              # Polling mode entry point
│   ├── components/
│   │   ├── BatchAccumulator.ts       # Groups photos into batches per sender
│   │   ├── ConfigLoader.ts           # Loads and validates stores.json
│   │   ├── DateAssigner.ts           # Assigns dates to parsed sales records
│   │   ├── GoogleDriveUploader.ts    # Uploads photos to Google Drive
│   │   ├── GoogleSheetsWriter.ts     # Writes sales data to Google Sheets
│   │   ├── Logger.ts                 # Structured logging
│   │   ├── StoreIdentifier.ts        # Maps phone numbers to stores
│   │   ├── TelegramBotController.ts  # Bot logic and command handling
│   │   └── VisionParser.ts           # Gemini AI photo parsing
│   └── types/
│       └── index.ts
├── scripts/
│   ├── get-oauth-token.ts    # Helper to obtain Google OAuth refresh token
│   └── set-webhook.ts        # Set/remove Telegram webhook
├── tests/
├── docs/
├── stores.json               # Store configuration
└── vercel.json               # Vercel deployment config
```

## Prerequisites

- Node.js 24+
- npm
- A Telegram bot token
- Google Cloud project with Drive and Sheets APIs enabled
- Gemini API key

## Setup

Follow these guides to configure each service:

1. [Telegram Bot Setup](docs/telegram-setup.md) — create the bot and get your token
2. [Google APIs Setup](docs/google-setup.md) — configure Drive, Sheets, and authentication (OAuth or service account)
3. [Gemini API Setup](docs/gemini-setup.md) — get your AI vision API key
4. [Configuration Reference](docs/configuration.md) — all environment variables and config files in one place

### Install Dependencies

```bash
npm install
```

### Configure Environment

Create a `.env` file in the project root:

```env
TELEGRAM_BOT_TOKEN=your-bot-token
GEMINI_API_KEY=your-gemini-key
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
```

See [Configuration Reference](docs/configuration.md) for all available variables and alternatives (e.g. service account auth).

### Configure Stores

Create a `stores.json` file mapping each store to a phone number and Google Sheet:

```json
{
  "sharedDriveFolderId": "your-drive-folder-id",
  "stores": [
    {
      "storeId": "Store Name",
      "registeredPhone": "+1234567890",
      "sheetDocumentId": "your-google-sheet-id"
    }
  ]
}
```

See [Google Setup — stores.json](docs/google-setup.md#8-configure-storesjson) for details.

## Running Locally (Polling Mode)

Polling mode connects directly to Telegram — no public URL needed.

```bash
# Build
npm run build

# Start in polling mode
npm run start:poll
```

Make sure the webhook is removed before using polling:

```bash
npm run remove-webhook
```

## Deployment (Vercel + Webhook Mode)

The bot runs as a Vercel serverless function that receives Telegram updates via webhook.

### Manual Deploy

```bash
vercel --prod
npm run set-webhook https://your-app.vercel.app
```

### CI/CD with GitHub Actions

The project includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically:

- Runs tests on every push and PR
- Deploys to Vercel on push to `main`
- Sets the Telegram webhook after production deploy

See [Vercel Deployment Setup](docs/vercel-setup.md) for full instructions including required GitHub secrets.

## Available Scripts

| Script                      | Description                                               |
| --------------------------- | --------------------------------------------------------- |
| `npm run build`             | Compile TypeScript                                        |
| `npm run start:poll`        | Start bot in polling mode                                 |
| `npm test`                  | Run tests                                                 |
| `npm run set-webhook <url>` | Set Telegram webhook to the given URL                     |
| `npm run remove-webhook`    | Remove Telegram webhook (switch to polling)               |
| `npm run get-oauth-token`   | Interactive helper to obtain a Google OAuth refresh token |

## Documentation

- [Telegram Bot Setup](docs/telegram-setup.md)
- [Google APIs Setup (Drive, Sheets)](docs/google-setup.md)
- [Gemini API Setup](docs/gemini-setup.md)
- [Vercel Deployment Setup](docs/vercel-setup.md)
- [Configuration Reference](docs/configuration.md)
- [Maintenance & Troubleshooting](docs/maintenance.md) — webhook management, pausing the bot, deleting Vercel deployments

## License

ISC
