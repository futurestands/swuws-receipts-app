import { CapacitorConfig } from '@capacitor/cli';
import 'dotenv/config';

// This is the ONE place that decides which backend the Android app talks
// to. It used to be a hardcoded string here, which meant switching to a
// real production domain later required someone to remember to edit this
// exact file, rebuild, and get everyone to reinstall — easy to forget,
// and nothing would error if it was missed; the app would just keep
// silently talking to the old URL forever.
//
// Now it reads CAPACITOR_SERVER_URL from the environment (.env, or
// exported in the shell before running `npx cap sync android`). Falls
// back to the current Vercel URL if unset, so nothing breaks today.
const serverUrl = process.env.CAPACITOR_SERVER_URL || 'https://swuws-receipts-app-q2z9.vercel.app';

const config: CapacitorConfig = {
  appId: 'org.swuws.portal',
  appName: 'SWUWS',
  webDir: 'out',
  server: {
    url: serverUrl,
    cleartext: true
  },
  android: {
    allowMixedContent: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: "#ffffff",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    }
  }
};

export default config;
