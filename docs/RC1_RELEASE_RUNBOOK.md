# TORC RC1 Release Runbook

## Version Scheme

| App | Marketing Version | iOS Build | Android versionName | Android versionCode |
|---|---|---|---|---|
| Customer (com.torc.customer) | 1.0.0 | 1 | 1.0.0 | 1 |
| Provider (com.torc.provider) | 1.0.0 | 1 | 1.0.0 | 1 |

**Increment rules:**
- Marketing version: Semver (1.0.0 → 1.0.1 for patches)
- iOS build number: Monotonically increasing integer per app (1 → 2 → 3)
- Android versionCode: Monotonically increasing integer per app (1 → 2 → 3)
- On TestFlight/Play re-upload: increment build number/versionCode only

---

## Apple TestFlight Upload

### Prerequisites

| Item | Status | Action |
|---|---|---|
| Apple Developer Program membership | VERIFY | Must be active at developer.apple.com |
| Team ID: 2968MARM74 | CONFIGURED | Already in Xcode project |
| App Store Connect: com.torc.customer | NEEDED | Create App Record |
| App Store Connect: com.torc.provider | NEEDED | Create App Record |
| Apple Distribution certificate | NEEDED | Generate in Xcode or developer.apple.com |
| Provisioning profiles | AUTO | Xcode Automatic Signing handles this |
| APNs Key | NEEDED | Create in developer.apple.com > Keys |

### Steps — Customer App

1. **Build web assets:**
   ```bash
   cd apps/customer-web
   npx vite build --mode internal   # For internal testing
   npx cap sync ios
   ```

2. **Open in Xcode:**
   ```bash
   npx cap open ios
   ```

3. **Configure signing:**
   - Select App target > Signing & Capabilities
   - Team: 2968MARM74
   - Signing: Automatic
   - Bundle ID: com.torc.customer

4. **Set version/build:**
   - Marketing Version: 1.0.0
   - Build: 1 (increment for each upload)

5. **Archive:**
   - Product > Archive (ensure Release scheme, Generic iOS Device)
   - Wait for archive to complete

6. **Distribute:**
   - Organizer > Select archive > Distribute App
   - Select: App Store Connect (TestFlight & App Store)
   - Upload
   - Wait for App Store Connect processing (~15-30 min)

7. **TestFlight:**
   - App Store Connect > TestFlight
   - Add internal testers
   - Testers receive email/notification to install

8. **On retry/fix:**
   - Increment Build number: 1 → 2
   - Archive and upload again

### Steps — Provider App

Same process as Customer but:
- Bundle ID: com.torc.provider
- App name: TORC Pro

### TestFlight Checklist

- [ ] Apple Developer Program active
- [ ] App Store Connect apps created (customer + provider)
- [ ] Apple Distribution certificate available
- [ ] Archive succeeds for customer
- [ ] Archive succeeds for provider
- [ ] Upload succeeds for customer
- [ ] Upload succeeds for provider
- [ ] TestFlight build appears in App Store Connect
- [ ] Internal testers can install

---

## Google Play Internal Testing Upload

### Prerequisites

| Item | Status | Action |
|---|---|---|
| Google Play Console access | VERIFY | Must have developer account |
| App record: com.torc.customer | NEEDED | Create in Play Console |
| App record: com.torc.provider | NEEDED | Create in Play Console |
| Upload keystore (customer) | AVAILABLE | Local: keystores/customer-upload-key.jks |
| Upload keystore (provider) | AVAILABLE | Local: keystores/provider-upload-key.jks |
| Play App Signing enrollment | NEEDED | Enroll during first upload |

### Steps — Customer App

1. **Build web assets:**
   ```bash
   cd apps/customer-web
   npx vite build --mode internal   # For internal testing
   npx cap sync android
   ```

2. **Build signed AAB:**
   ```bash
   cd android
   JAVA_HOME=/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
     ./gradlew bundleRelease
   ```
   Output: `app/build/outputs/bundle/release/app-release.aab`

3. **Play Console:**
   - Open Play Console > Select app
   - Testing > Internal testing
   - Create new release
   - Upload `app-release.aab`
   - Opt into Play App Signing (first upload only)
   - Set release name: "1.0.0 (1)"
   - Add release notes
   - Review and roll out to internal testing

4. **Add testers:**
   - Internal testing > Testers
   - Create email list or use Google Group
   - Share opt-in link with testers

5. **On retry/fix:**
   - Increment versionCode in `build.gradle`: 1 → 2
   - Rebuild AAB
   - Upload new release to Internal Testing track

### Steps — Provider App

Same process as Customer but:
- Application ID: com.torc.provider
- Keystore: keystores/provider-upload-key.jks
- Key alias: torc-provider

### Play Console Checklist

- [ ] Google Play Console access
- [ ] App records created (customer + provider)
- [ ] Signed AAB builds for customer
- [ ] Signed AAB builds for provider
- [ ] Play App Signing enrolled
- [ ] Internal testing track release created
- [ ] Testers added
- [ ] Testers can install via opt-in link

---

## Push Notification Setup

### APNs (iOS)

| Item | Status |
|---|---|
| Push entitlement in Xcode | CONFIGURED (aps-environment: production) |
| APNs Key (.p8) | NEEDED — create at developer.apple.com > Keys |
| Key ID | NEEDED — comes with APNs Key |
| Team ID | 2968MARM74 |
| Bundle IDs registered | NEEDED — register in developer.apple.com |
| Push capability in App ID | NEEDED — enable in developer.apple.com |

**Steps to create APNs Key:**
1. Go to developer.apple.com > Certificates, Identifiers & Profiles > Keys
2. Create new key with "Apple Push Notifications service (APNs)" enabled
3. Download the .p8 file (one-time download)
4. Record the Key ID
5. Configure in push notification worker:
   - APNS_KEY_ID=<Key ID>
   - APNS_PRIVATE_KEY=<contents of .p8 file>
   - APNS_TEAM_ID=2968MARM74

### FCM (Android)

| Item | Status |
|---|---|
| google-services.json (customer) | AVAILABLE — Firebase project torc-app |
| google-services.json (provider) | AVAILABLE — Firebase project torc-app |
| Firebase project | CONFIGURED — torc-app (project 1073110036723) |
| FCM service account | NEEDED — for server-side push sending |

**Steps for FCM service account:**
1. Go to Firebase Console > Project Settings > Service accounts
2. Generate new private key
3. Configure in push notification worker:
   - FIREBASE_SERVICE_ACCOUNT_JSON=<service account JSON>

---

## Environment Configuration for RC1

For TestFlight/Internal Testing, use `--mode internal` which bundles:
- Test Supabase project (development)
- Test Stripe keys (pk_test_)
- Test Google Maps keys
- Vercel preview URLs for auth redirects

This is appropriate for internal testing — the apps are clearly marked as internal builds.

For production store release, use `--mode production` which requires injected production values and will fail-closed on any test/preview configuration.
