import type { CapacitorConfig } from '@capacitor/cli';

// `CAP_ALLOW_INSECURE=1 npx cap sync android` lets the Android app reach a plain http:// (ws://) game
// server, e.g. one running on your LAN while testing. Don't ship a build synced with it: production
// servers should use https:// (wss://).
const allowInsecure = process.env.CAP_ALLOW_INSECURE === '1';

const config: CapacitorConfig = {
  appId: 'com.dvlpralamin.shooterfree',
  appName: 'RimFire',
  webDir: 'dist',
  backgroundColor: '#000000',
  server: {
    cleartext: allowInsecure,
  },
  android: {
    allowMixedContent: allowInsecure,
  },
  plugins: {
    // Full-screen game: hide the status bar (and the Android navigation bar / iOS home indicator).
    SystemBars: {
      hidden: true,
      initialViewportFitValueHint: 'cover',
    },
    // Sign in with Google (src/net/account.js). Providers left out aren't bundled; Apple comes later.
    SocialLogin: {
      providers: { google: true, apple: false, facebook: false, twitter: false },
      logLevel: 1, // warnings and errors
    },
  },
};

export default config;
