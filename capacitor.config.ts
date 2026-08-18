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
// HIERARCHY / DOMAIN WARNING:
// This domain is now hard-coded for the native Android shell to prevent
// accidents where a developer's local localhost:3000 gets baked into the APK.
//
// IMPORTANT: If the production Vercel URL changes, this string MUST be
// manually updated and the APK MUST be rebuilt. Setting the
// NEXT_PUBLIC_APP_URL environment variable alone will NOT update the
// Android shell anymore.
// HIERARCHY / DOMAIN WARNING:
// This domain is now hard-coded for the native Android shell to prevent
// accidents where a developer's local localhost:3000 gets baked into the APK.
//
// IMPORTANT: If the production Vercel URL changes, this string MUST be
// manually updated and the APK MUST be rebuilt. Setting the
// NEXT_PUBLIC_APP_URL environment variable alone will NOT update the
// Android shell anymore.
const PRODUCTION_FALLBACK = 'https://swuws-receipts-app-q2z9.vercel.app';

// DYNAMIC URL RESOLUTION:
// 1. Prioritize environment variable (for future domain changes)
// 2. SAFETY: If the env var is 'localhost' during a production sync,
//    we FAIL the build. We do not allow "Silent Fallbacks" for production shells.
let serverUrl = process.env.NEXT_PUBLIC_APP_URL || PRODUCTION_FALLBACK;

if (process.env.NODE_ENV === 'production' && serverUrl.includes('localhost')) {
  console.error('\x1b[31m%s\x1b[0m', '❌ CRITICAL BUILD FAILURE:');
  console.error('\x1b[31m%s\x1b[0m', 'You are attempting to build a PRODUCTION APK pointing to localhost.');
  console.error('\x1b[31m%s\x1b[0m', 'Please set NEXT_PUBLIC_APP_URL to your production domain before syncing.');
  throw new Error('Production build cannot point to localhost.');
}

const config: CapacitorConfig = {
  appId: 'org.swuws.portal',
  appName: 'SWUWS',
  webDir: 'out',
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
