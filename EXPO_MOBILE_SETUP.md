# Expo Mobile App Setup Guide

## Why Expo for Torc?

✅ **Build once, deploy everywhere**: iOS, Android, and Web  
✅ **Reuse existing React code**: ~70% of your current components  
✅ **Native features**: GPS tracking, push notifications, camera  
✅ **Fast development**: Hot reload, easy testing  
✅ **Over-the-air updates**: Update without app store approval  

## Architecture: Monorepo Structure

We'll create a monorepo with:
```
torc/
├── apps/
│   ├── mobile/          # Expo app (iOS + Android)
│   └── web/             # Current Vite app
├── packages/
│   ├── ui/              # Shared components
│   ├── api/             # Supabase client & API calls
│   └── types/           # TypeScript types
└── package.json
```

## Step 1: Install Expo

```bash
# Install Expo CLI globally
npm install -g expo-cli

# Or use with npx (no global install)
npx expo --version
```

## Step 2: Create Expo App

```bash
# From torc root directory
npx create-expo-app@latest apps/mobile --template blank-typescript

# Navigate to mobile app
cd apps/mobile
```

## Step 3: Install Required Dependencies

```bash
# Core dependencies
npx expo install expo-location expo-notifications expo-camera expo-contacts
npx expo install expo-linking expo-splash-screen expo-status-bar
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context
npx expo install expo-secure-store expo-image-picker

# Supabase
npm install @supabase/supabase-js

# Maps
npm install react-native-maps

# UI & Utilities
npm install nativewind tailwindcss@3.3.2
npm install lucide-react-native
npm install @react-native-async-storage/async-storage

# Payments
npm install @stripe/stripe-react-native

# Real-time communication
npm install socket.io-client

# State management (optional but recommended)
npm install zustand

# Date utilities
npm install date-fns
```

## Step 4: Configure Expo App (app.json)

Create/update `apps/mobile/app.json`:

```json
{
  "expo": {
    "name": "Torc",
    "slug": "torc-roadside",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#1A1F2E"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.torc.app",
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "Torc needs your location to find nearby providers and show your position on the map.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "Torc needs your location to track service providers in real-time.",
        "NSCameraUsageDescription": "Torc needs camera access to take photos of service completion.",
        "NSPhotoLibraryUsageDescription": "Torc needs photo library access to upload service photos.",
        "NSContactsUsageDescription": "Torc needs contacts access to help you add family members."
      }
    },
    "android": {
      "package": "com.torc.app",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#1A1F2E"
      },
      "permissions": [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "CAMERA",
        "READ_CONTACTS",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE"
      ],
      "config": {
        "googleMaps": {
          "apiKey": "YOUR_GOOGLE_MAPS_API_KEY"
        }
      }
    },
    "web": {
      "favicon": "./assets/favicon.png",
      "bundler": "metro"
    },
    "plugins": [
      "expo-location",
      "expo-camera",
      "expo-notifications",
      [
        "expo-build-properties",
        {
          "ios": {
            "useFrameworks": "static"
          }
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "your-project-id"
      }
    }
  }
}
```

## Step 5: Set Up Environment Variables

Create `apps/mobile/.env`:

```env
# Supabase
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Google Maps
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-key

# Stripe
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=your-stripe-key

# API (if you build custom backend)
EXPO_PUBLIC_API_URL=https://api.torc.com

# Environment
EXPO_PUBLIC_ENV=development
```

Create `apps/mobile/app.config.ts` for dynamic config:

```typescript
import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Torc',
  slug: 'torc-roadside',
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  },
});
```

## Step 6: Project Structure

Create this structure in `apps/mobile/`:

```
apps/mobile/
├── app/                    # App screens (Expo Router)
│   ├── (auth)/
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── onboarding.tsx
│   ├── (customer)/
│   │   ├── _layout.tsx    # Bottom tabs
│   │   ├── home.tsx
│   │   ├── activity.tsx
│   │   ├── explore.tsx
│   │   ├── wallet.tsx
│   │   └── profile.tsx
│   ├── (provider)/
│   │   ├── _layout.tsx
│   │   ├── home.tsx
│   │   ├── earnings.tsx
│   │   └── profile.tsx
│   └── _layout.tsx        # Root layout
├── components/
│   ├── ui/                # Shared UI components
│   ├── customer/
│   ├── provider/
│   └── common/
├── lib/
│   ├── supabase.ts       # Supabase client
│   ├── stripe.ts         # Stripe setup
│   └── location.ts       # Location utilities
├── hooks/
│   ├── useAuth.ts
│   ├── useLocation.ts
│   └── useJobs.ts
├── services/
│   ├── api.ts            # API calls
│   ├── auth.ts
│   ├── jobs.ts
│   └── payments.ts
├── stores/
│   ├── authStore.ts      # Zustand stores
│   └── locationStore.ts
├── types/
│   └── index.ts
├── constants/
│   └── index.ts
└── assets/
```

## Step 7: Set Up Navigation (Expo Router)

Install Expo Router:

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
```

Update `package.json`:

```json
{
  "main": "expo-router/entry"
}
```

## Step 8: Configure NativeWind (Tailwind CSS)

```bash
# Install dependencies
npm install nativewind
npm install --save-dev tailwindcss@3.3.2
```

Create `tailwind.config.js`:

```javascript
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        'mint': '#2EFFAF',
        'cobalt': '#007AFF',
        'navy': '#1A1F2E',
        'navy-dark': '#0F1419',
        'navy-light': '#252B3D',
      },
    },
  },
  plugins: [],
};
```

Create `babel.config.js`:

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'nativewind/babel',
      'react-native-reanimated/plugin',
    ],
  };
};
```

## Step 9: Set Up Supabase Client

Create `lib/supabase.ts`:

```typescript
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

## Step 10: Build Configuration (EAS Build)

Install EAS CLI:

```bash
npm install -g eas-cli
```

Login and configure:

```bash
eas login
eas build:configure
```

Create `eas.json`:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

## Step 11: Testing & Development

### Run on iOS Simulator

```bash
cd apps/mobile
npx expo start --ios
```

### Run on Android Emulator

```bash
npx expo start --android
```

### Run on Physical Device

```bash
npx expo start
# Scan QR code with Expo Go app
```

### Build Development Client

```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

## Step 12: Push Notifications Setup

### iOS (Apple Push Notification Service)

1. Go to [Apple Developer](https://developer.apple.com)
2. Create an APN Key
3. Add to Expo project:

```bash
eas credentials
```

### Android (Firebase Cloud Messaging)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create project
3. Download `google-services.json`
4. Add to `apps/mobile/android/app/`

### Configure in app:

```typescript
// lib/notifications.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2EFFAF',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      alert('Failed to get push token for push notification!');
      return;
    }
    
    token = (await Notifications.getExpoPushTokenAsync()).data;
  }

  return token;
}
```

## Step 13: Location Tracking Setup

```typescript
// lib/location.ts
import * as Location from 'expo-location';

export async function requestLocationPermissions() {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  
  if (foregroundStatus !== 'granted') {
    throw new Error('Foreground location permission not granted');
  }

  // For providers (background tracking)
  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  
  if (backgroundStatus !== 'granted') {
    console.warn('Background location permission not granted');
  }

  return { foregroundStatus, backgroundStatus };
}

export async function getCurrentLocation() {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
}

export async function startLocationTracking(callback: (location: any) => void) {
  return await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000, // Update every 5 seconds
      distanceInterval: 10, // Or every 10 meters
    },
    callback
  );
}
```

## Development Workflow

### Daily Development

```bash
# Start development server
npx expo start

# Clear cache if needed
npx expo start --clear
```

### Building for Testing

```bash
# iOS
eas build --profile preview --platform ios

# Android
eas build --profile preview --platform android
```

### Production Build

```bash
# Both platforms
eas build --profile production --platform all

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

## Next Steps

1. ✅ Install Expo CLI
2. ✅ Create mobile app
3. ✅ Install dependencies
4. ✅ Configure app.json
5. ✅ Set up environment variables
6. → Migrate components from web to mobile
7. → Set up navigation
8. → Integrate Supabase
9. → Test on devices
10. → Build and deploy

## Useful Commands

```bash
# Start development
npm run start

# Type checking
npm run typecheck

# Clear Metro bundler cache
npx expo start --clear

# Update Expo SDK
npx expo install --fix

# Check for updates
npx expo-doctor

# Build locally (iOS only, needs Mac)
eas build --profile development --platform ios --local
```

## Shared Code Strategy

Share code between web and mobile:

```typescript
// packages/ui/src/Button.tsx
import { Pressable, Text } from 'react-native';

export const Button = ({ onPress, children }) => (
  <Pressable onPress={onPress}>
    <Text>{children}</Text>
  </Pressable>
);

// Use in both apps
import { Button } from '@torc/ui';
```

This setup gives you a production-ready mobile app that works on iOS and Android! 🚀
