import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.torctechnologies.customer',
  appName: 'TORC',
  webDir: 'dist',
  server: {
    // Enable this during development to load from your dev server
    // url: 'http://YOUR_LOCAL_IP:7002',
    // cleartext: true,
    androidScheme: 'https',
    hostname: 'app.torcapp.com',
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'dark',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
