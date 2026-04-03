/**
 * One-time script to obtain a Google OAuth2 refresh token.
 *
 * Prerequisites:
 *   1. Go to https://console.cloud.google.com/apis/credentials
 *   2. Create an OAuth 2.0 Client ID (type: Desktop app)
 *   3. Download the JSON and note the client_id and client_secret
 *   4. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env
 *
 * Usage:
 *   npx tsx scripts/get-oauth-token.ts
 *
 * It will print a URL — open it in your browser, sign in with the Google
 * account that owns the Drive folder and Sheets, grant access, and paste
 * the authorization code back here. The script prints the refresh token
 * to add to your .env as GOOGLE_REFRESH_TOKEN.
 */
import "dotenv/config";
import { google } from "googleapis";
import * as readline from "readline";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  "urn:ietf:wg:oauth:2.0:oob",
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/spreadsheets",
  ],
});

console.log("\nOpen this URL in your browser:\n");
console.log(authUrl);
console.log(
  "\nSign in with the Google account that owns the Drive folder and Sheets.\n",
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Paste the authorization code here: ", async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log("\n--- Add this to your .env ---\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log("\n--- Done! ---");
  } catch (err) {
    console.error("Failed to exchange code for tokens:", err);
    process.exit(1);
  }
});
