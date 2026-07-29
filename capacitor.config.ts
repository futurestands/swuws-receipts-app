import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.swuws.portal',
  appName: 'SWUWS',
  webDir: 'out',
  server: {
    url: 'https://swuws-receipts-app-q2z9.vercel.app',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
