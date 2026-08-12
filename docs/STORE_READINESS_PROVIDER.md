# TORC Provider App — Store Readiness Source of Truth

**App Name:** TORC Pro (display), TORC Provider (bundle)
**Bundle ID (iOS):** com.torc.provider
**Application ID (Android):** com.torc.provider
**Version:** 1.0.0 / Build 1
**Last Audit:** 2026-08-12

---

## Data Collection Summary

| Data Type | Collected | Linked to Identity | Used for Tracking | Purpose |
|---|---|---|---|---|
| Precise Location | Yes | Yes | No | Nearby customer matching, active job tracking |
| Coarse Location | Yes | Yes | No | Approximate service area |
| Name | Yes | Yes | No | Account profile, customer visibility |
| Email Address | Yes | Yes | No | Account authentication, communications |
| Phone Number | Yes | Yes | No | Account profile, customer communication |
| Photos/Videos | Yes | Yes | No | Profile photo, verification documents, job photos |
| User ID | Yes | Yes | No | Account identification |
| Push Token | Yes | Yes | No | Job offer notifications |
| Device IP | Yes (Supabase) | No | No | Infrastructure / security |

## Device Permissions

| Permission | Requested | When | Denial Behavior |
|---|---|---|---|
| Location (When In Use) | Yes | Going online / accepting jobs | Cannot go online without location |
| Camera | Yes | Document upload, job photos | Can select from library instead |
| Photo Library | Yes | Document/photo upload | Can use camera instead |
| Push Notifications | Yes | After onboarding | Provider misses job offers |
| Internet | Yes (Android) | Always | App requires internet |
| Vibrate | Yes (Android) | Job notification haptics | Non-critical |

## Permissions NOT Requested

| Permission | Reason Not Needed |
|---|---|
| Background Location | Not implemented — current architecture uses foreground-only watchPosition. Future implementation requires separate decision. |
| Foreground Service | Removed — no background location service exists |
| Microphone | No audio features |
| Contacts | No contact access |
| READ_MEDIA_IMAGES | Capacitor Camera plugin uses scoped Photo Picker |
| ATT/Tracking | No third-party tracking |
| Sign in with Apple | App uses own email/password auth only |

## Background Location Status

**CURRENTLY NOT IMPLEMENTED.**

The provider app declares foreground-only location via `@capacitor/geolocation` `watchPosition`. When the app goes to background, location updates stop.

**Implications:**
- Provider location tracking pauses when app is backgrounded during active jobs
- This is a known limitation for the current release
- Background location implementation requires: native foreground service (Android), background mode (iOS), progressive permission flow, and Google Play background location declaration
- **Decision required:** Whether to implement background location before v1.0 launch

## Third-Party SDKs

| SDK | Purpose | Data Accessed | Privacy Manifest | Signature |
|---|---|---|---|---|
| Capacitor Core 8.1 | Native bridge | UserDefaults | Included | Signed |
| Capacitor Cordova Bridge | Plugin bridge | UserDefaults | Included | Signed |
| @capacitor/camera | Photo capture/selection | Camera, Photo Library | Via Capacitor | N/A |
| @capacitor/geolocation | Location services | Precise/Coarse Location | Via Capacitor | N/A |
| @capacitor/preferences | Key-value storage | UserDefaults | Via Capacitor | N/A |
| @capacitor/push-notifications | Push tokens | APNs/FCM token | Via Capacitor | N/A |
| @capacitor/haptics | Haptic feedback | None | Via Capacitor | N/A |
| @capacitor/splash-screen | Launch screen | None | Via Capacitor | N/A |
| @capacitor/status-bar | Status bar styling | None | Via Capacitor | N/A |
| @capacitor-community/keep-awake | Screen wake lock | None | N/A | N/A |
| capacitor-native-settings | Open device settings | None | N/A | N/A |
| @supabase/supabase-js | Backend services | Auth tokens, user data | N/A (web JS) | N/A |
| @react-google-maps/api | Map display | None (display only) | N/A (web JS) | N/A |

## Apple App Privacy Answers

### Data Types Collected

1. **Contact Info — Name:** Collected, linked to identity, for app functionality
2. **Contact Info — Email Address:** Collected, linked to identity, for app functionality
3. **Contact Info — Phone Number:** Collected, linked to identity, for app functionality
4. **Location — Precise Location:** Collected, linked to identity, for app functionality
5. **Location — Coarse Location:** Collected, linked to identity, for app functionality
6. **Photos or Videos:** Collected, linked to identity, for app functionality
7. **Identifiers — User ID:** Collected, linked to identity, for app functionality

### Account Deletion

- **In-app:** Profile → Account Security → Request Account Deletion
- **Web:** https://www.torcapp.com/account-deletion (MUST BE VERIFIED)
- **Process:** User submits request → RPC marks `pending_deletion` → Admin reviews → Data anonymized/deleted

### Privacy Policy URL

https://www.torcapp.com/privacy

### Age Rating

- No objectionable content
- **Recommended rating: 4+**

### Encryption / Export Compliance

- `ITSAppUsesNonExemptEncryption`: **false**
- HTTPS/TLS only — exempt

### Sign in with Apple

- **Not required** — own email/password auth only

### Physical Goods/Services

- TORC Pro is the provider-side app for delivering auto services
- Providers receive payouts through the platform, not through IAP
- Compliant with App Store physical-service rules

---

## Google Play Data Safety Answers

| Category | Data Type | Collected | Shared | Purpose |
|---|---|---|---|---|
| Location | Approximate location | Yes | No | App functionality |
| Location | Precise location | Yes | No | App functionality |
| Personal info | Name | Yes | No | App functionality |
| Personal info | Email address | Yes | No | App functionality |
| Personal info | Phone number | Yes | No | App functionality |
| Photos and videos | Photos | Yes | No | App functionality |
| App activity | In-app search history | No | No | — |
| App info | Crash logs | No | No | — |

### Account Deletion

- **In-app path:** Profile → Account Security → Request Account Deletion
- **Web URL:** https://www.torcapp.com/account-deletion (MUST BE VERIFIED)

### Location Declaration

- Foreground location: Yes (job tracking, customer proximity)
- Background location: **No** (not currently implemented)
- Precise location: Yes

### Content Rating

- **Expected rating: Everyone / PEGI 3**

### Privacy Policy URL

https://www.torcapp.com/privacy

---

## REVIEW REQUIRED Items

1. **Web deletion URL** — must be live before submission
2. **Privacy Policy / Terms** — must be live before submission
3. **Background location decision** — business must decide if v1.0 requires background location for active jobs
4. **Provider document retention** — verification documents (license, insurance) retention period after deletion requires legal decision
5. **Job photo retention** — photos uploaded during jobs may need retention for dispute resolution; duration requires legal decision
6. **Financial record retention** — payout records, earnings history retention duration requires legal/accounting decision
7. **Stripe Customer cleanup** — see STORE_READINESS_STRIPE.md
8. **Deletion timeline** — specific number of days for Data Safety disclosure requires business decision
