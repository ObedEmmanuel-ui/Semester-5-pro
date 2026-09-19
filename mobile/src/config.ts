/**
 * Google OAuth "Web application" client ID, from Google Cloud Console
 * (APIs & Services > Credentials > Create Credentials > OAuth client ID).
 * Must match `GOOGLE_CLIENT_ID` in backend/.env.
 *
 * Setup:
 * 1. Create a project at https://console.cloud.google.com/ (or use an
 *    existing one) and configure the OAuth consent screen.
 * 2. Create an OAuth client ID of type "Web application".
 * 3. Run the app once and check the Metro/console log for a line like
 *    "Google Sign-In redirect URI: exp://172.x.x.x:8081" (logged by
 *    GoogleSignInButton) — add that exact URI under "Authorized redirect
 *    URIs" on the client you just created.
 * 4. Paste the client ID below, and the same value into backend/.env as
 *    GOOGLE_CLIENT_ID.
 *
 * Leave blank to disable the button — it'll explain what's missing
 * instead of failing with a confusing Google error page.
 */
export const GOOGLE_WEB_CLIENT_ID = '';
