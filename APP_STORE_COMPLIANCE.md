# App Store & Play Store Compliance

This doc covers what’s configured for Apple App Store and Google Play and what to set in the store dashboards.

## Web apps (customer-web, provider-web)

- **PWA manifest** – `name`, `short_name`, `description`, `start_url`, `display`, `theme_color`, `background_color`, icons (192px, 512px), `categories`, `orientation`
- **Meta tags** – `theme-color`, `viewport`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`
- **Privacy & terms** – Pages at `https://www.torcapp.com/privacy` and `https://www.torcapp.com/terms`

## Mobile app (apps/mobile)

- **App name** – `Torc` (shown in stores)
- **iOS Info.plist** – `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`

## Native customer/provider apps (Capacitor)

- **Customer app ID** – `com.torc.customer`
- **Provider app ID** – `com.torc.provider`
- **Push permissions**
  - Android: `POST_NOTIFICATIONS` + `VIBRATE` declared
  - iOS: APNs entitlements files added (`App.debug.entitlements`, `App.release.entitlements`)
- **iOS usage descriptions**
  - Customer: location + camera + photo usage strings
  - Provider: location + camera + photo usage strings
- **Background remote notifications**
  - `UIBackgroundModes` includes `remote-notification` for both iOS apps
- **In-app account deletion initiation**
  - Customer: `apps/customer-web/src/pages/customer/AccountSecurity.tsx`
  - Provider: `apps/provider-web/src/pages/provider/AccountSecurity.tsx`
  - Both now include **Request Account Deletion** that opens a high-priority support ticket
- **In-app legal policy links**
  - Customer signup + account security link to `https://www.torcapp.com/privacy` and `https://www.torcapp.com/terms`
  - Provider signup + account security link to `https://www.torcapp.com/privacy` and `https://www.torcapp.com/terms`
- **iOS export compliance**
  - `ITSAppUsesNonExemptEncryption` is set to `false` in both native Info.plist files
- **iOS signing team**
  - `DEVELOPMENT_TEAM = 2968MARM74` is prefilled in both Xcode projects (customer/provider)
- **Push token registration**
  - Native push registration is now wired in app auth lifecycle and tokens are synced via `upsert_device_token`
- **Push delivery backends**
  - Worker supports Expo tokens, FCM tokens, and APNs tokens (`workers/push-notification-worker.js`)
- **Push log delivery status**
  - Migration `024_push_notifications_allow_delivered_status.sql` adds `delivered` to allowed `push_notifications.status` values

## Required in store dashboards

Use `STORE_DASHBOARD_CHECKLIST.md` for the exact manual submission checklist.

### Apple App Store Connect

1. **Privacy Policy URL** – `https://www.torcapp.com/privacy`
2. **Support URL** – `https://www.torcapp.com/contact` or `mailto:support@torcapp.com`
3. **App privacy** – Declare data types collected (location, contact info, payment, etc.) in App Privacy
4. **Age rating** – 4+ for roadside assistance (no restricted content)

### Google Play Console

1. **Privacy Policy** – `https://www.torcapp.com/privacy`
2. **Data safety** – Describe data collection, sharing, and security in Data safety
3. **App content** – Target audience, ads (if any), content rating

## Release blockers to clear (customer + provider)

- [x] Add `google-services.json` to:
  - `apps/customer-web/android/app/google-services.json`
  - `apps/provider-web/android/app/google-services.json`
- [ ] Configure Firebase projects for both bundle IDs/package names and verify FCM token delivery on physical devices
- [ ] Confirm signing certificates/provisioning profiles in Xcode for:
  - `com.torc.customer`
  - `com.torc.provider`
- [ ] Configure Android Play upload signing (release keystore/upload key) for both apps
  - Gradle now supports optional `keystore.properties` in each Android project root
  - Example files:
    - `apps/customer-web/android/keystore.properties.example`
    - `apps/provider-web/android/keystore.properties.example`
- [x] Set release versions/builds before upload:
  - Android `versionCode` and `versionName` in each `android/app/build.gradle`
  - iOS `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in each Xcode target
  - Current value: `1.0.0` / build `1` for customer + provider
  - Helper used: `scripts/set-native-version.sh <versionName> <buildNumber>`
- [ ] Upload APNs key/certs and verify push for both iOS apps on physical devices
- [ ] Complete App Privacy (Apple) + Data Safety (Google) questionnaires with your real production data flows
- [x] Add account deletion support runbook: `ACCOUNT_DELETION_RUNBOOK.md`
- [x] Run final production builds (web + Android release + iOS release compile)
- [ ] Run final smoke test on real iOS and Android devices

## Pre-launch checklist

- [ ] Deploy website with Privacy and Terms pages
- [ ] Set Privacy Policy URL in App Store Connect and Play Console
- [ ] Complete Data safety / App privacy for both stores
- [x] Add 192x192 and 512x512 icons where required
- [x] Set `VITE_APP_URL` for production (customer and provider web apps):
  - `apps/customer-web/.env.production`
  - `apps/provider-web/.env.production`
- [x] Add `google-services.json` to `apps/customer-web/android/app/` and `apps/provider-web/android/app/`
- [ ] Upload APNs auth key in Firebase (or your push provider) for both iOS bundle IDs
- [x] Add Android release signing config scaffolding (`keystore.properties` pattern)
- [ ] Set worker server envs for FCM/APNs credentials (`FIREBASE_*`, `APNS_*`) on your production host
- [ ] Run DB migrations through at least `024_push_notifications_allow_delivered_status.sql`
- [ ] Verify push worker deployment (`npm run worker:push`) with production env vars (local run currently failed with DNS resolution for Supabase DB host)

## Automated verification completed

- ✅ `npm run build --workspace=customer-web`
- ✅ `npm run build --workspace=provider-web`
- ✅ `npm run build --workspace=website`
- ✅ `cd apps/customer-web/android && JAVA_HOME=\"/Applications/Android Studio.app/Contents/jbr/Contents/Home\" ./gradlew assembleRelease`
- ✅ `cd apps/provider-web/android && JAVA_HOME=\"/Applications/Android Studio.app/Contents/jbr/Contents/Home\" ./gradlew assembleRelease`
- ✅ `cd apps/customer-web/android && JAVA_HOME=\"/Applications/Android Studio.app/Contents/jbr/Contents/Home\" ./gradlew bundleRelease`
- ✅ `cd apps/provider-web/android && JAVA_HOME=\"/Applications/Android Studio.app/Contents/jbr/Contents/Home\" ./gradlew bundleRelease`
- ✅ `cd apps/customer-web/ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphonesimulator -derivedDataPath ../../../../build/ios-customer CODE_SIGNING_ALLOWED=NO build`
- ✅ `cd apps/provider-web/ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Release -sdk iphonesimulator -derivedDataPath ../../../../build/ios-provider CODE_SIGNING_ALLOWED=NO build`
