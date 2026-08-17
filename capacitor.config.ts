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
const PRODUCTION_DOMAIN = 'https://swuws-receipts-app-q2z9.vercel.app';

// HARD-LOCKED FOR PRODUCTION: We always use the production Vercel URL
// in the Android shell to prevent "localhost" leakages.
const serverUrl = PRODUCTION_DOMAIN;

if (process.env.NODE_ENV === 'production') {
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.warn('\x1b[33m%s\x1b[0m', 'Capacitor: Production mode active. Forcing server.url to: ' + PRODUCTION_DOMAIN);
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
