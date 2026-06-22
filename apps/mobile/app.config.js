const IS_PROVIDER = process.env.APP_VARIANT === 'provider';

const name = IS_PROVIDER ? 'Torc Provider' : 'Torc';
const slug = IS_PROVIDER ? 'torcapp-provider' : 'torcapp-services';
const scheme = IS_PROVIDER ? 'torc-provider' : 'torc';
const bundleId = IS_PROVIDER ? 'com.torctechnologies.provider' : 'com.torctechnologies.customer';
const associatedDomain = IS_PROVIDER
  ? 'applinks:provider.torcservices.com'
  : 'applinks:app.torcservices.com';
const intentHost = IS_PROVIDER
  ? 'provider.torcservices.com'
  : 'app.torcservices.com';

// Each variant has its own EAS project ID
const easProjectId = IS_PROVIDER
  ? '1e9ac00d-b0b4-4947-b148-c62b2c76aa91'
  : '2bbbd9bb-d31a-48bb-a1b9-01e8fbedc01e';

module.exports = {
  expo: {
    name,
    slug,
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/torc-app-icon.png',
    scheme,
    owner: 'torcapp-services',
    description:
      'On-demand roadside assistance. Get help when you need it, where you need it.',
    privacy: 'https://www.torcapp.com/privacy',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: false,
      infoPlist: {
        UIBackgroundModes: ['remote-notification'],
        NSLocationWhenInUseUsageDescription:
          'Torc needs your location to connect you with nearby roadside assistance.',
        NSMicrophoneUsageDescription:
          'Torc needs microphone access for in-app provider and customer calls.',
        NSCameraUsageDescription:
          'Take photos of your vehicle for service requests.',
        NSPhotoLibraryUsageDescription:
          'Select photos of your vehicle for service requests.',
        ITSAppUsesNonExemptEncryption: false,
      },
      bundleIdentifier: bundleId,
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
      },
      associatedDomains: [associatedDomain],
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/torc-app-icon.png',
        monochromeImage: './assets/images/torc-app-icon.png',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: bundleId,
      permissions: [
        'POST_NOTIFICATIONS',
        'VIBRATE',
        'RECORD_AUDIO',
        'MODIFY_AUDIO_SETTINGS',
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'CAMERA',
      ],
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY || '',
        },
      },
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            { scheme },
            { scheme: 'https', host: intentHost },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-notifications',
        {
          icon: './assets/images/android-icon-monochrome.png',
          color: '#2EFFAF',
          defaultChannel: 'default',
        },
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/images/torc-splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            backgroundColor: '#000000',
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: false,
    },
    extra: {
      router: {},
      appVariant: IS_PROVIDER ? 'provider' : 'customer',
      supabaseUrl: 'https://apojatplmfsbimgcyjoo.supabase.co',
      supabaseAnonKey:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwb2phdHBsbWZzYmltZ2N5am9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NjcyMjQsImV4cCI6MjA4NjM0MzIyNH0.eWizHl9jMS-E-SZ_JMmmZooYN9nuEufxupWOXCOulv8',
      eas: {
        projectId: easProjectId,
      },
    },
  },
};
