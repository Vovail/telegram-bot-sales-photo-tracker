# Configuration Reference

All environment variables and config files in one place. For guides on how to obtain each value, see the linked docs.

## Polling Mode (local development)

Everything is stored locally. Nothing needs to be set in any cloud dashboard.

### `.env` file (project root)

| Variable                         | Required | Description                                                        | Guide                                                           |
| -------------------------------- | -------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`             | Yes      | Bot token                                                          | [Telegram setup](telegram-setup.md)                             |
| `GEMINI_API_KEY`                 | Yes      | Gemini API key                                                     | [Gemini setup](gemini-setup.md)                                 |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes      | Path to service account JSON file (e.g., `./service-account.json`) | [Google setup](google-setup.md#3-create-a-service-account)      |
| `ALLOWED_CHAT_ID`                | No       | Restrict bot to a single Telegram chat                             | [Telegram setup](telegram-setup.md#2-get-your-chat-id-optional) |
| `CONFIG_PATH`                    | No       | Path to stores config (defaults to `stores.json`)                  | [Google setup](google-setup.md#7-configure-storesjson)          |

### `stores.json` (project root)

Store configuration file. See [Google setup — stores.json](google-setup.md#7-configure-storesjson).

### Service account JSON file (project root)

The downloaded `.json` key file. Already gitignored by the `*.json` catch-all rule.

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

| Variable                  | Required | Description                                                                   | Guide                                                           |
| ------------------------- | -------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`      | Yes      | Bot token                                                                     | [Telegram setup](telegram-setup.md)                             |
| `GEMINI_API_KEY`          | Yes      | Gemini API key                                                                | [Gemini setup](gemini-setup.md)                                 |
| `GOOGLE_CREDENTIALS_JSON` | Yes      | Full service account JSON content as a string (not a file path)               | [Google setup](google-setup.md#3-create-a-service-account)      |
| `STORES_CONFIG_JSON`      | Yes\*    | Full `stores.json` content as a string                                        | [Google setup](google-setup.md#7-configure-storesjson)          |
| `ALLOWED_CHAT_ID`         | No       | Restrict bot to a single Telegram chat                                        | [Telegram setup](telegram-setup.md#2-get-your-chat-id-optional) |
| `CONFIG_PATH`             | No       | Fallback path to stores config file (only if `STORES_CONFIG_JSON` is not set) | [Google setup](google-setup.md#7-configure-storesjson)          |

\* You can either set `STORES_CONFIG_JSON` (recommended) or rely on `CONFIG_PATH` pointing to a committed file. The env var takes priority.

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
- [ ] Service account JSON file in project root
- [ ] `stores.json` in project root
- [ ] Webhook removed (`npm run remove-webhook`)

### Webhook mode

- [ ] 5 Vercel env vars set (`TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `GOOGLE_CREDENTIALS_JSON`, `STORES_CONFIG_JSON`, `ALLOWED_CHAT_ID`)
- [ ] 4 GitHub secrets set (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `TELEGRAM_BOT_TOKEN`)
- [ ] Push to `main` triggers deploy and auto-sets webhook
