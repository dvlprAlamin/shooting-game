import type { CapacitorConfig } from '@capacitor/cli';

// `CAP_ALLOW_INSECURE=1 npx cap sync android` lets the Android app reach a plain http:// (ws://) game
// server, e.g. one running on your LAN while testing. Don't ship a build synced with it: production
// servers should use https:// (wss://).
const allowInsecure = process.env.CAP_ALLOW_INSECURE === '1';

const config: CapacitorConfig = {
  appId: 'com.dvlpralamin.shooterfree',
  appName: 'Shooter Free',
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
  },
};

export default config;
