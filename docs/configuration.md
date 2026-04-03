# Configuration Reference

All environment variables and config files in one place. For guides on how to obtain each value, see the linked docs.

## Polling Mode (local development)

Everything is stored locally. Nothing needs to be set in any cloud dashboard.

### `.env` file (project root)

| Variable                         | Required | Description                                                        | Guide                                                                  |
| -------------------------------- | -------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`             | Yes      | Bot token                                                          | [Telegram setup](telegram-setup.md)                                    |
| `GEMINI_API_KEY`                 | Yes      | Gemini API key                                                     | [Gemini setup](gemini-setup.md)                                        |
| `GOOGLE_CLIENT_ID`               | Yes\*    | OAuth client ID                                                    | [Google setup](google-setup.md#3-set-up-oauth-20-recommended)          |
| `GOOGLE_CLIENT_SECRET`           | Yes\*    | OAuth client secret                                                | [Google setup](google-setup.md#3-set-up-oauth-20-recommended)          |
| `GOOGLE_REFRESH_TOKEN`           | Yes\*    | OAuth refresh token                                                | [Google setup](google-setup.md#3c-get-a-refresh-token)                 |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes\*    | Path to service account JSON file (e.g., `./service-account.json`) | [Google setup](google-setup.md#4-create-a-service-account-alternative) |
| `ALLOWED_CHAT_ID`                | No       | Restrict bot to a single Telegram chat                             | [Telegram setup](telegram-setup.md#2-get-your-chat-id-optional)        |
| `CONFIG_PATH`                    | No       | Path to stores config (defaults to `stores.json`)                  | [Google setup](google-setup.md#8-configure-storesjson)                 |

\* Provide either the three OAuth variables (recommended) or `GOOGLE_APPLICATION_CREDENTIALS`. OAuth is preferred because service accounts cannot upload files to Google Drive on personal Google accounts.

### `stores.json` (project root)

Store configuration file. See [Google setup — stores.json](google-setup.md#8-configure-storesjson).

### Run

```bash
npm run build
npm run start:poll
```

---

## Webhook Mode (Vercel + GitHub Actions)

Variables are split across three places: Vercel dashboard, GitHub secrets, and a committed file.

### Vercel Environment Variables

Set in Vercel dashboard → **Settings** → **Environment Variables**.
These are the runtime variables your serverless function reads.

| Variable                  | Required | Description                                                                   | Guide                                                                  |
| ------------------------- | -------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`      | Yes      | Bot token                                                                     | [Telegram setup](telegram-setup.md)                                    |
| `GEMINI_API_KEY`          | Yes      | Gemini API key                                                                | [Gemini setup](gemini-setup.md)                                        |
| `GOOGLE_CLIENT_ID`        | Yes\*    | OAuth client ID                                                               | [Google setup](google-setup.md#3-set-up-oauth-20-recommended)          |
| `GOOGLE_CLIENT_SECRET`    | Yes\*    | OAuth client secret                                                           | [Google setup](google-setup.md#3-set-up-oauth-20-recommended)          |
| `GOOGLE_REFRESH_TOKEN`    | Yes\*    | OAuth refresh token                                                           | [Google setup](google-setup.md#3c-get-a-refresh-token)                 |
| `GOOGLE_CREDENTIALS_JSON` | Yes\*    | Full service account JSON content as a string (not a file path)               | [Google setup](google-setup.md#4-create-a-service-account-alternative) |
| `STORES_CONFIG_JSON`      | Yes\*\*  | Full `stores.json` content as a string                                        | [Google setup](google-setup.md#8-configure-storesjson)                 |
| `ALLOWED_CHAT_ID`         | No       | Restrict bot to a single Telegram chat                                        | [Telegram setup](telegram-setup.md#2-get-your-chat-id-optional)        |
| `CONFIG_PATH`             | No       | Fallback path to stores config file (only if `STORES_CONFIG_JSON` is not set) | [Google setup](google-setup.md#8-configure-storesjson)                 |

\* Provide either the three OAuth variables (recommended) or `GOOGLE_CREDENTIALS_JSON`.

\*\* You can either set `STORES_CONFIG_JSON` (recommended) or rely on `CONFIG_PATH` pointing to a committed file. The env var takes priority.

### GitHub Actions Secrets

Set in GitHub repo → **Settings** → **Secrets and variables** → **Actions**.
These are used only by the CI/CD pipeline, not by the bot at runtime.

| Secret               | Required | Description                                                | Guide                                                        |
| -------------------- | -------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| `VERCEL_TOKEN`       | Yes      | Vercel personal access token                               | [Vercel setup](vercel-setup.md#4-set-up-github-actions-cicd) |
| `VERCEL_ORG_ID`      | Yes      | From `.vercel/project.json` after `vercel link`            | [Vercel setup](vercel-setup.md#4-set-up-github-actions-cicd) |
| `VERCEL_PROJECT_ID`  | Yes      | From `.vercel/project.json` after `vercel link`            | [Vercel setup](vercel-setup.md#4-set-up-github-actions-cicd) |
| `TELEGRAM_BOT_TOKEN` | Yes      | Same bot token — used to auto-set the webhook after deploy | [Telegram setup](telegram-setup.md)                          |

### `stores.json`

Two options for providing store config in webhook mode:

1. **`STORES_CONFIG_JSON` env var (recommended)** — paste the full JSON content as a Vercel environment variable. No file needed in the repo.
2. **Committed file** — commit `stores.json` to the repo and use `CONFIG_PATH` (or the default). The serverless function reads it from the deployed files.

---

## Quick Checklist

### Polling mode

- [ ] `.env` filled in with all required variables
- [ ] OAuth credentials configured (or service account JSON file in project root)
- [ ] `stores.json` in project root
- [ ] Webhook removed (`npm run remove-webhook`)

### Webhook mode

- [ ] Vercel env vars set: `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, Google auth vars (OAuth or service account), `STORES_CONFIG_JSON`
- [ ] 4 GitHub secrets set (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `TELEGRAM_BOT_TOKEN`)
- [ ] Push to `main` triggers deploy and auto-sets webhook
