# Google APIs Setup (Drive, Sheets, Gemini)

This project uses three Google services:

- **Google Drive** — stores uploaded photos
- **Google Sheets** — records sales data
- **Google Gemini** — parses photos via AI vision

## Authentication Methods

The bot supports two authentication methods for Drive and Sheets:

| Method              | Drive uploads | Sheets writes | Requires                          |
| ------------------- | ------------- | ------------- | --------------------------------- |
| **OAuth 2.0**       | ✅ Works      | ✅ Works      | Personal Google account           |
| **Service Account** | ❌ No quota   | ✅ Works      | Google Workspace (paid) for Drive |

**Recommendation:** Use OAuth 2.0. Service accounts have zero storage quota and cannot upload files to Google Drive unless you have a Google Workspace account with Shared Drives.

## 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Name it (e.g., `sales-photo-tracker`) and create it
4. Make sure the new project is selected in the top bar

## 2. Enable APIs

Enable these APIs in your project:

1. Go to **APIs & Services** → **Library**
2. Search for and enable each:
   - **Google Drive API**
   - **Google Sheets API**

## 3. Set Up OAuth 2.0 (recommended)

### 3a. Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** user type, click **Create**
3. Fill in the app name (e.g., `Sales Photo Tracker`) and your email
4. Add scopes: `Google Drive API (.../auth/drive)` and `Google Sheets API (.../auth/spreadsheets)`
5. Add your Google email as a test user
6. Save

### 3b. Create OAuth Client ID

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Desktop app**
4. Name it (e.g., `sales-bot-desktop`)
5. Copy the **Client ID** and **Client Secret**

### 3c. Get a Refresh Token

Add the client credentials to your `.env`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Then run the helper script:

```bash
npx tsx scripts/get-oauth-token.ts
```

1. Open the printed URL in your browser
2. Sign in with the Google account that owns the Drive folder and Sheets
3. Grant access
4. Paste the authorization code back into the terminal
5. Copy the printed `GOOGLE_REFRESH_TOKEN` value into your `.env`

### For Vercel (webhook mode)

Set these three variables in Vercel dashboard → **Settings** → **Environment Variables**:

```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
```

## 4. Create a Service Account (alternative)

> **Note:** Service accounts cannot upload files to Google Drive on personal Google accounts (zero storage quota). Use this method only if you have Google Workspace with Shared Drives, or if you only need Sheets access.

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service account**
3. Name it (e.g., `sales-bot-sa`), click **Create and Continue**
4. Skip the optional role/access steps, click **Done**
5. Click on the newly created service account
6. Go to the **Keys** tab → **Add Key** → **Create new key** → **JSON**
7. A JSON file will download — this is your service account credentials

### For local development (polling mode)

```env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### For Vercel (webhook mode)

```
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"...","..."}
```

## 5. Set Up Google Drive

1. Create a folder in Google Drive where photos will be stored
2. If using **OAuth**: no sharing needed — you own the folder
3. If using **Service Account** (Workspace only): share the folder with the service account email (`client_email` from the JSON) as **Editor**, and the folder must be inside a **Shared Drive**
4. Copy the folder ID from the URL:
   ```
   https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   ```
5. Use this as `sharedDriveFolderId` in your `stores.json`

## 6. Set Up Google Sheets

For each store, create a Google Sheet:

1. Create a new Google Sheet
2. If using **Service Account**: share it with the service account email (Editor access)
3. If using **OAuth**: no sharing needed — you own the sheet
4. Copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   ```
5. Use this as `sheetDocumentId` in your `stores.json`

The bot will automatically create monthly tabs (e.g., `2026-04`) with these columns:
`Дата | Тип | Назва | Розмір | Колір | Ціна | Безгот | Фото`

## 7. Set Up Gemini API

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click **Get API key** → **Create API key**
3. Select your Google Cloud project
4. Copy the API key and set it as `GEMINI_API_KEY`

## 8. Configure stores.json

Create a `stores.json` file in the project root:

```json
{
  "sharedDriveFolderId": "your-drive-folder-id",
  "stores": [
    {
      "storeId": "STORE_A",
      "registeredPhone": "+1234567890",
      "sheetDocumentId": "your-sheet-id-for-store-a"
    }
  ]
}
```

Each store maps a phone number to a specific Google Sheet.

## Environment Variables

| Variable                         | Mode    | Description                                       |
| -------------------------------- | ------- | ------------------------------------------------- |
| `GOOGLE_CLIENT_ID`               | Both    | OAuth client ID (recommended)                     |
| `GOOGLE_CLIENT_SECRET`           | Both    | OAuth client secret (recommended)                 |
| `GOOGLE_REFRESH_TOKEN`           | Both    | OAuth refresh token (recommended)                 |
| `GOOGLE_APPLICATION_CREDENTIALS` | Polling | Path to service account JSON file (alternative)   |
| `GOOGLE_CREDENTIALS_JSON`        | Vercel  | Service account JSON as a string (alternative)    |
| `GEMINI_API_KEY`                 | Both    | Gemini API key from AI Studio                     |
| `CONFIG_PATH`                    | Both    | Path to `stores.json` (defaults to `stores.json`) |
