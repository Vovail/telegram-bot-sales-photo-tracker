# Telegram Bot Setup

## 1. Create the Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Follow the prompts — choose a display name and a username (must end in `bot`)
4. BotFather will reply with your **bot token** — looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
5. Save this token — you'll need it as `TELEGRAM_BOT_TOKEN`

## 2. Get Your Chat ID (optional)

If you want to restrict the bot to a specific chat (recommended for production):

1. Add the bot to your group chat, or start a private conversation with it
2. Send any message to the bot
3. Open this URL in your browser (replace `<TOKEN>` with your bot token):
   ```
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```
4. Look for `"chat":{"id": ...}` in the response — that number is your chat ID
5. Group chat IDs are negative numbers (e.g., `-1001234567890`)
6. Set this as `ALLOWED_CHAT_ID` in your environment

## 3. Configure the Webhook (Vercel deployment)

After deploying to Vercel, you need to tell Telegram where to send updates:

```bash
# Set the webhook
npm run set-webhook https://your-app.vercel.app

# Verify it's set
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

The webhook URL will be `https://your-app.vercel.app/api/webhook`.

## 4. Switch Back to Polling (local development)

If you want to switch back to polling mode (e.g., for local dev):

```bash
# Remove the webhook
npm run remove-webhook

# Start in polling mode
npm run start:poll
```

Polling and webhook modes are mutually exclusive — Telegram only delivers updates to one or the other. Always remove the webhook before using polling.

## 5. Bot Commands (optional)

You can register commands with BotFather for a nicer UX:

1. Send `/setcommands` to @BotFather
2. Select your bot
3. Send:
   ```
   process - Process all pending photos now
   ```

## Environment Variables

| Variable             | Description                             |
| -------------------- | --------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather                |
| `ALLOWED_CHAT_ID`    | (Optional) Restrict bot to this chat ID |
