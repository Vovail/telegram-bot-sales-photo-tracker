# Gemini API Setup

The bot uses Google Gemini (model `gemini-2.5-flash`) to parse sales data from photos via AI vision.

## 1. Get an API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **Create API key**
4. Select the Google Cloud project you created for this bot (or create a new one)
5. Copy the generated key

## 2. Configure

Add the key to your `.env` file:

```env
GEMINI_API_KEY=AIzaSy...your-key-here
```

For Vercel, add it in the dashboard under **Settings** → **Environment Variables**.

## 3. Pricing

Gemini API has a free tier that's generous enough for most small bots:

- **gemini-2.5-flash** — free tier includes rate-limited requests per minute
- For current limits and pricing, check [Google AI pricing](https://ai.google.dev/pricing)

If you hit rate limits, the bot will fail to parse that photo and notify the user to resend it.

## 4. Verify

You can quickly test that your key works:

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_API_KEY"
```

A successful response lists available models. A `403` or `401` means the key is invalid or disabled.
