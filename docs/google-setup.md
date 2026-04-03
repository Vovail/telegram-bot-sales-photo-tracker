# Google APIs Setup (Drive, Sheets, Gemini)

This project uses three Google services:

- **Google Drive** — stores uploaded photos
- **Google Sheets** — records sales data
- **Google Gemini** — parses photos via AI vision

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

## 3. Create a Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **Service account**
3. Name it (e.g., `sales-bot-sa`), click **Create and Continue**
4. Skip the optional role/access steps, click **Done**
5. Click on the newly created service account
6. Go to the **Keys** tab → **Add Key** → **Create new key** → **JSON**
7. A JSON file will download — this is your service account credentials

### For local development (polling mode)

Save the JSON file somewhere safe and set the path:

```env
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### For Vercel (webhook mode)

The serverless function reads credentials from an environment variable instead of a file. Copy the entire JSON content and set it as:

```
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"...","..."}
```

Set this in Vercel's dashboard under **Settings** → **Environment Variables**.

## 4. Set Up Google Drive

1. Create a folder in Google Drive where photos will be stored
2. Right-click the folder → **Share**
3. Share it with the service account email (found in the JSON file as `client_email`, looks like `sales-bot-sa@project-id.iam.gserviceaccount.com`)
4. Give it **Editor** access
5. Copy the folder ID from the URL — it's the long string after `/folders/`:
   ```
   https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   ```
6. Use this as `sharedDriveFolderId` in your `stores.json`

## 5. Set Up Google Sheets

For each store, create a Google Sheet:

1. Create a new Google Sheet
2. Share it with the service account email (Editor access)
3. Copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
   ```
4. Use this as `sheetDocumentId` in your `stores.json`

The bot will automatically create monthly tabs (e.g., `2026-04`) with these columns:
`Date | Item Name | Model | Size | Color | Price | Is Cashless | Photo Link`

## 6. Set Up Gemini API

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click **Get API key** → **Create API key**
3. Select your Google Cloud project
4. Copy the API key and set it as `GEMINI_API_KEY`

## 7. Configure stores.json

Create a `stores.json` file in the project root:

```json
{
  "sharedDriveFolderId": "your-drive-folder-id",
  "stores": [
    {
      "storeId": "STORE_A",
      "registeredPhone": "+1234567890",
      "sheetDocumentId": "your-sheet-id-for-store-a"
    },
    {
      "storeId": "STORE_B",
      "registeredPhone": "+0987654321",
      "sheetDocumentId": "your-sheet-id-for-store-b"
    }
  ]
}
```

Each store maps a phone number to a specific Google Sheet. The `registeredPhone` is used to auto-identify which store is sending photos.

## Environment Variables

| Variable                         | Mode    | Description                                       |
| -------------------------------- | ------- | ------------------------------------------------- |
| `GEMINI_API_KEY`                 | Both    | Gemini API key from AI Studio                     |
| `GOOGLE_APPLICATION_CREDENTIALS` | Polling | Path to service account JSON file                 |
| `GOOGLE_CREDENTIALS_JSON`        | Vercel  | Service account JSON as a string                  |
| `CONFIG_PATH`                    | Both    | Path to `stores.json` (defaults to `stores.json`) |
