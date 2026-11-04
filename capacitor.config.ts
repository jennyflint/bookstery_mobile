import type { CapacitorConfig } from '@capacitor/cli';
import 'dotenv/config';

const googleClientId =
  process.env.VITE_GOOGLE_WEB_CLIENT_ID ||
  process.env.NUXT_PUBLIC_GOOGLE_WEB_CLIENT_ID;

const config: CapacitorConfig = {
  appId: 'com.bookstery.app',
  appName: 'Bookstery',
  webDir: '.output/public',
  bundledWebRuntime: false,
  plugins: {
    GoogleAuth: {
      scopes: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.appdata',
      ],
      serverClientId: googleClientId,
      forceCodeForRefreshToken: false,
    },
  },
};

export default config;
