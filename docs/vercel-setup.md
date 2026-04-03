# Vercel Deployment Setup

## 1. Create a Vercel Account & Project

1. Sign up at [vercel.com](https://vercel.com) (free tier is sufficient)
2. Install the Vercel CLI:
   ```bash
   npm install -g vercel
   ```
3. Link your project:
   ```bash
   vercel link
   ```
   This creates a `.vercel` folder and gives you the **Org ID** and **Project ID** (you'll need these for CI/CD)

## 2. Set Environment Variables in Vercel

Go to your project in the Vercel dashboard → **Settings** → **Environment Variables** and add:

| Variable                  | Value                                                                   |
| ------------------------- | ----------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`      | Bot token from @BotFather                                               |
| `GEMINI_API_KEY`          | Gemini API key                                                          |
| `GOOGLE_CREDENTIALS_JSON` | Full JSON content of your service account key file (as a single string) |
| `ALLOWED_CHAT_ID`         | (Optional) Chat ID to restrict the bot to                               |
| `CONFIG_PATH`             | `stores.json` (or leave unset for default)                              |

Make sure to set these for **Production**, **Preview**, and **Development** as needed.

## 3. Deploy Manually (optional)

You can deploy manually to test before setting up CI/CD:

```bash
# Preview deployment
vercel

# Production deployment
vercel --prod
```

After deploying, set the Telegram webhook:

```bash
npm run set-webhook https://your-app.vercel.app
```

## 4. Set Up GitHub Actions CI/CD

The project includes `.github/workflows/deploy.yml` which automates:

- Running tests on every push and PR
- Preview deployments on pull requests
- Production deployment on push to `main`
- Automatic Telegram webhook configuration after production deploy

### Required GitHub Secrets

Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions** and add:

| Secret               | How to get it                                                                |
| -------------------- | ---------------------------------------------------------------------------- |
| `VERCEL_TOKEN`       | Vercel dashboard → **Settings** → **Tokens** → Create a new token            |
| `VERCEL_ORG_ID`      | From `.vercel/project.json` after running `vercel link` (field: `orgId`)     |
| `VERCEL_PROJECT_ID`  | From `.vercel/project.json` after running `vercel link` (field: `projectId`) |
| `TELEGRAM_BOT_TOKEN` | Same bot token — used by the deploy step to auto-set the webhook             |

### How the Pipeline Works

```
Push to main ──→ Run tests ──→ Build ──→ Deploy to Vercel ──→ Set Telegram webhook
PR opened    ──→ Run tests ──→ Build ──→ Deploy preview
```

## 5. Verify the Deployment

After deployment, check that everything is working:

```bash
# Check webhook status
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

You should see:

```json
{
  "ok": true,
  "result": {
    "url": "https://your-app.vercel.app/api/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

Send a photo to your bot in Telegram — it should respond.

## 6. Important Notes

- The `stores.json` file must be committed to the repo (it's deployed with the serverless function)
- The free Vercel tier has a 10-second function timeout — this is usually enough for processing a single webhook update, but large batches may need the Pro plan (60s timeout)
- Serverless functions are stateless. The `BatchAccumulator` timer-based batching won't persist across invocations. In webhook mode, consider using the `/process` command or "Process Now" button immediately after sending photos
- If you need to switch back to polling mode for local development, always remove the webhook first:
  ```bash
  npm run remove-webhook
  npm run start:poll
  ```
