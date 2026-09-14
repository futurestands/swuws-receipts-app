import { CapacitorConfig } from '@capacitor/cli';
import 'dotenv/config';

// This is the ONE place that decides which backend the Android app talks
// to. Reuses NEXT_PUBLIC_APP_URL, the same env var the web app already
// uses for its own canonical URL, rather than a second one-off variable —
// one place to update when the domain changes. Falls back to the current
// Vercel URL if unset, so nothing breaks today.
//
// SAFETY: this check runs UNCONDITIONALLY — not gated behind
// NODE_ENV === 'production'. `npx cap sync android` does NOT set
// NODE_ENV=production on its own (only `next build` does), so a
// production-only guard here would silently do nothing on a plain
// `npx cap sync` run with a stray local .env still pointing at
// localhost — which is exactly how this broke before. This must fail
// no matter how or when the command is invoked, not just inside a
// full production build.
const PRODUCTION_FALLBACK = 'https://swuws-receipts-app-q2z9.vercel.app';

// CAPACITOR_SERVER_URL wins when you need to force a production sync while
// a local .env still has NEXT_PUBLIC_APP_URL=http://localhost:3000 for web
// development. Example:
//   CAPACITOR_SERVER_URL=https://swuws-receipts-app-q2z9.vercel.app npx cap sync android
let serverUrl =
  process.env.CAPACITOR_SERVER_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  PRODUCTION_FALLBACK;

serverUrl = serverUrl.trim().replace(/\/$/, '');

if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) {
  console.error('\x1b[31m%s\x1b[0m', '❌ CRITICAL: refusing to sync/build with a localhost server URL.');
  console.error('\x1b[31m%s\x1b[0m', `Resolved server URL: ${serverUrl}`);
  console.error('\x1b[31m%s\x1b[0m', 'Set CAPACITOR_SERVER_URL or NEXT_PUBLIC_APP_URL to your real production domain before running npx cap sync.');
  throw new Error('capacitor.config.ts: server URL resolved to localhost. Aborting.');
}

if (!serverUrl.startsWith('https://')) {
  throw new Error(`capacitor.config.ts: server URL must be https:// (got ${serverUrl})`);
}

console.log(`\x1b[32m[capacitor]\x1b[0m Android will load: ${serverUrl}`);

const config: CapacitorConfig = {
  appId: 'org.swuws.portal',
  appName: 'SWUWS',
  webDir: 'public',
  server: {
    url: serverUrl,
    cleartext: false,
    // Allow the WebView to follow same-site navigations on the production
    // host (login redirects, etc.) instead of trapping them.
    allowNavigation: [
      'swuws-receipts-app-q2z9.vercel.app',
      '*.vercel.app',
    ],
    // This was removed at some point (likely from bad advice in an
    // external report recommending output:'export' + no errorPath -- that
    // recommendation is wrong for this app: it runs on Server Components
    // and Server Actions extensively, which cannot work under a static
    // export build at all. Removing errorPath without replacing it with
    // anything is what turned "offline mode shows a helpful screen" back
    // into "offline mode shows a raw connection-refused error page."
    // webDir is 'public' now (was 'out'), so this resolves to
    // public/offline.html.
    //
    // NOTE: when the remote server.url cannot be reached, Capacitor serves
    // this file from its local asset origin (https://localhost). That is
    // intentional offline behaviour — not the app "pointing at localhost"
    // for normal online use.
    errorPath: 'offline.html'
  },
  android: {
    allowMixedContent: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true, // Show logo for 3s then show the app
      backgroundColor: "#ffffff",
      androidScaleType: "CENTER_CROP",
      showSpinner: true,
      splashFullScreen: true,
      splashImmersive: true,
    }
  }
};

export default config;
