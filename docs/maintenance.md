# Maintenance & Troubleshooting

Common operations for managing the bot, webhook, and Vercel deployment.

## Webhook Management

### Check Current Webhook Status

```bash
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

Or in a browser — just paste the URL with your token. The response shows the current webhook URL, pending update count, and last error (if any).

### Pause the Webhook (stop receiving updates)

If you want to temporarily stop the bot from processing messages without deleting the Vercel deployment:

```bash
npm run remove-webhook
```

This calls `deleteWebhook` on the Telegram API. Telegram will stop sending updates to Vercel. Messages sent to the bot while the webhook is removed are **not queued** — they are silently dropped.

Also it is possible to remove-webhook with

```bash
curl https://api.telegram.org/bot<TOKEN>/deleteWebhook
```

To resume, re-set the webhook:

```bash
npm run set-webhook https://your-app.vercel.app
```

Also it is possible to set-webhook with

```bash
curl https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-app.vercel.app
```

### Remove the Webhook (switch to polling)

Same command as pausing — the webhook must be removed before you can use polling mode:

```bash
# 1. Remove webhook
npm run remove-webhook

# 2. Build and start locally
npm run build
npm run start:poll
```

Polling and webhook are mutually exclusive. If you try to start polling while a webhook is active, Telegram will reject `getUpdates` with a `409 Conflict` error.

### Re-set the Webhook After Local Development

When you're done with local dev and want to go back to the Vercel deployment:

```bash
npm run set-webhook https://your-app.vercel.app
```

If you use CI/CD, the webhook is automatically set after every production deploy to `main`, so you can also just push a commit.

## Vercel Deployment

### Delete a Deployment

To remove a specific deployment from the Vercel dashboard:

1. Go to [vercel.com](https://vercel.com) → your project
2. Open the **Deployments** tab
3. Click the **⋮** menu on the deployment you want to remove
4. Select **Delete**

Via CLI:

```bash
# List recent deployments
vercel ls

# Remove a specific deployment by URL
vercel rm <deployment-url>

# Example
vercel rm sales-photo-tracker-abc123.vercel.app
```

### Delete the Entire Vercel Project

This removes all deployments, environment variables, and the project itself:

1. Vercel dashboard → your project → **Settings** → **General**
2. Scroll to the bottom → **Delete Project**

Via CLI:

```bash
vercel project rm <project-name>
```

> After deleting the project or all deployments, remember to also remove the webhook so Telegram doesn't keep sending updates to a dead URL:
>
> ```bash
> npm run remove-webhook
> ```

### Redeploy

If you need to redeploy without code changes (e.g., after updating env vars in Vercel):

```bash
# Production
vercel --prod

# Or trigger via GitHub Actions by pushing an empty commit
git commit --allow-empty -m "redeploy"
git push
```

## Stopping the Bot Completely

To fully stop the bot so it doesn't process any messages:

1. Remove the webhook:
   ```bash
   npm run remove-webhook
   ```
2. (Optional) Delete the Vercel deployment or project if you no longer need it
3. (Optional) Revoke the bot token via @BotFather → `/revoke` if you want to permanently disable the bot

## Quick Reference

| Task                          | Command                                                   |
| ----------------------------- | --------------------------------------------------------- |
| Check webhook status          | `curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo` |
| Remove webhook (pause/switch) | `npm run remove-webhook`                                  |
| Set webhook                   | `npm run set-webhook https://your-app.vercel.app`         |
| List Vercel deployments       | `vercel ls`                                               |
| Delete a deployment           | `vercel rm <deployment-url>`                              |
| Delete Vercel project         | `vercel project rm <project-name>`                        |
| Redeploy (production)         | `vercel --prod`                                           |
