/**
 * Sets the Telegram webhook URL for the bot.
 *
 * Usage:
 *   npx tsx scripts/set-webhook.ts <VERCEL_URL>
 *
 * Example:
 *   npx tsx scripts/set-webhook.ts https://my-app.vercel.app
 *
 * To remove the webhook (switch back to polling):
 *   npx tsx scripts/set-webhook.ts --remove
 */
import "dotenv/config";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set");
  process.exit(1);
}

const arg = process.argv[2];

if (arg === "--remove") {
  const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
  const data = await res.json();
  console.log("Webhook removed:", data);
} else if (arg) {
  const webhookUrl = `${arg.replace(/\/$/, "")}/api/webhook`;
  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
  );
  const data = await res.json();
  console.log(`Webhook set to ${webhookUrl}:`, data);
} else {
  console.error("Usage: npx tsx scripts/set-webhook.ts <VERCEL_URL>");
  console.error("       npx tsx scripts/set-webhook.ts --remove");
  process.exit(1);
}
