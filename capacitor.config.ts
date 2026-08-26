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

let serverUrl = process.env.NEXT_PUBLIC_APP_URL || PRODUCTION_FALLBACK;

if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) {
  console.error('\x1b[31m%s\x1b[0m', '❌ CRITICAL: refusing to sync/build with a localhost server URL.');
  console.error('\x1b[31m%s\x1b[0m', `Resolved NEXT_PUBLIC_APP_URL: ${serverUrl}`);
  console.error('\x1b[31m%s\x1b[0m', 'Set NEXT_PUBLIC_APP_URL to your real production domain before running npx cap sync or next build.');
  throw new Error('capacitor.config.ts: server URL resolved to localhost. Aborting.');
}

const config: CapacitorConfig = {
  appId: 'org.swuws.portal',
  appName: 'SWUWS',
  webDir: 'public',
  server: {
    url: serverUrl,
    cleartext: false,
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
