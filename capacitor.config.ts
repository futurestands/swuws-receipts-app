import { CapacitorConfig } from '@capacitor/cli';
import 'dotenv/config';

// This is the ONE place that decides which backend the Android app talks
// to. It used to be a hardcoded string here, which meant switching to a
// real production domain later required someone to remember to edit this
// exact file, rebuild, and get everyone to reinstall — easy to forget,
// and nothing would error if it was missed; the app would just keep
// silently talking to the old URL forever.
//
// Reuses NEXT_PUBLIC_APP_URL, the same env var the web app already uses
// for its own canonical URL (see lib/site-url.ts), rather than a second
// one-off variable — one place to update when the domain changes. Falls
// back to the current Vercel URL if unset, so nothing breaks today.
const DEFAULT_FALLBACK = 'https://swuws-receipts-app-q2z9.vercel.app';
const serverUrl = process.env.NEXT_PUBLIC_APP_URL || DEFAULT_FALLBACK;

if (process.env.NODE_ENV === 'production') {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.error('\x1b[31m%s\x1b[0m', 'CRITICAL WARNING: Production build detected but NEXT_PUBLIC_APP_URL is not set.');
    console.error('\x1b[31m%s\x1b[0m', 'The app will talk to the STALE fallback URL: ' + DEFAULT_FALLBACK);
  } else if (process.env.NEXT_PUBLIC_APP_URL === DEFAULT_FALLBACK) {
    console.warn('\x1b[33m%s\x1b[0m', 'WARNING: Production URL matches the fallback. Ensure this is the correct domain.');
  }
}

const config: CapacitorConfig = {
  appId: 'org.swuws.portal',
  appName: 'SWUWS',
  webDir: 'out',
  server: {
    url: serverUrl,
    cleartext: false
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
