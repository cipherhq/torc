# TORC Customer App — Store Readiness Source of Truth

**App Name:** TORC
**Bundle ID (iOS):** com.torc.customer
**Application ID (Android):** com.torc.customer
**Version:** 1.0.0 / Build 1
**Last Audit:** 2026-08-12

---

## Data Collection Summary

| Data Type | Collected | Linked to Identity | Used for Tracking | Purpose |
|---|---|---|---|---|
| Precise Location | Yes | Yes | No | Connecting with nearby providers, service address |
| Coarse Location | Yes | Yes | No | Approximate location for service area |
| Name | Yes | Yes | No | Account profile, service booking |
| Email Address | Yes | Yes | No | Account authentication, communications |
| Phone Number | Yes | Yes | No | Account profile, provider communication |
| Payment Info | Yes | Yes | No | Service payment via Stripe |
| Photos/Videos | Yes | Yes | No | Profile photo, service request photos |
| User ID | Yes | Yes | No | Account identification |
| Push Token | Yes | Yes | No | Push notifications for job updates |
| Device IP | Yes (Supabase) | No | No | Infrastructure / security |

## Device Permissions

| Permission | Requested | When | Denial Behavior |
|---|---|---|---|
| Location (When In Use) | Yes | Booking flow | Manual address entry available |
| Camera | Yes | Photo upload | Can select from library instead |
| Photo Library | Yes | Photo upload | Can use camera instead |
| Push Notifications | Yes | After onboarding | App works without, user misses updates |
| Internet | Yes (Android) | Always | App requires internet |
| Vibrate | Yes (Android) | Notification haptics | Non-critical |

## Permissions NOT Requested

| Permission | Reason Not Needed |
|---|---|
| Background Location | Customer does not need location when app is backgrounded |
| Microphone | No audio features |
| Contacts | No contact access needed |
| Calendar | No calendar integration |
| Bluetooth | No Bluetooth features |
| READ_MEDIA_IMAGES | Capacitor Camera plugin uses scoped Photo Picker |
| ATT/Tracking | No third-party tracking |
| Sign in with Apple | App uses own email/password auth only (no third-party social login) |

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
| @capacitor-community/keep-awake | Screen wake lock | None | N/A | N/A |
| capacitor-native-settings | Open device settings | None | N/A | N/A |
| @stripe/stripe-js | Payment processing | Payment card (via Stripe Elements) | N/A (web JS) | N/A |
| @supabase/supabase-js | Backend services | Auth tokens, user data | N/A (web JS) | N/A |
| @react-google-maps/api | Map display | None (display only) | N/A (web JS) | N/A |

## Apple App Privacy Answers

### Data Types Collected

1. **Contact Info — Name:** Collected, linked to identity, for app functionality
2. **Contact Info — Email Address:** Collected, linked to identity, for app functionality
3. **Contact Info — Phone Number:** Collected, linked to identity, for app functionality
4. **Financial Info — Payment Info:** Collected, linked to identity, for app functionality
5. **Location — Precise Location:** Collected, linked to identity, for app functionality
6. **Location — Coarse Location:** Collected, linked to identity, for app functionality
7. **Photos or Videos:** Collected, linked to identity, for app functionality
8. **Identifiers — User ID:** Collected, linked to identity, for app functionality

### Account Deletion

- **In-app:** Profile → Account Security → Request Account Deletion
- **Web:** https://www.torcapp.com/account-deletion (MUST BE VERIFIED)
- **Process:** User submits request → RPC marks `pending_deletion` → Admin reviews → Data anonymized/deleted
- **Deletion is reversible:** No, once processed

### Privacy Policy URL

https://www.torcapp.com/privacy

### Age Rating

- No objectionable content
- No gambling
- No alcohol/tobacco/drugs references
- No mature/suggestive themes
- No profanity
- No horror/fear themes
- **Recommended rating: 4+**

### Encryption / Export Compliance

- `ITSAppUsesNonExemptEncryption`: **false**
- App uses HTTPS (TLS) for data transit — this is exempt from export compliance documentation
- No proprietary encryption algorithms

### Sign in with Apple

- **Not required** — app uses its own email/password authentication only, no third-party social login services

### Physical Goods/Services

- TORC provides real-world auto services (physical services consumed outside the app)
- Per App Store Review Guideline 3.1.3(e): physical goods/services must use non-IAP payment
- TORC correctly uses Stripe for payment — compliant

---

## Google Play Data Safety Answers

### Data Types

| Category | Data Type | Collected | Shared | Purpose |
|---|---|---|---|---|
| Location | Approximate location | Yes | No | App functionality |
| Location | Precise location | Yes | No | App functionality |
| Personal info | Name | Yes | No | App functionality |
| Personal info | Email address | Yes | No | App functionality |
| Personal info | Phone number | Yes | No | App functionality |
| Financial info | Payment info | Yes | With Stripe | App functionality |
| Photos and videos | Photos | Yes | No | App functionality |
| App activity | In-app search history | No | No | — |
| App info | Crash logs | No | No | — |
| Device or other IDs | Device ID | No | No | — |

### Account Deletion

- **In-app path:** Profile → Account Security → Request Account Deletion
- **Web URL for Data Safety:** https://www.torcapp.com/account-deletion (MUST BE VERIFIED)
- **Deletion timeline:** Within review period (REVIEW REQUIRED — specific days TBD by business)

### Location Declaration

- Foreground location: Yes (service booking and provider finding)
- Background location: **No**
- Precise location: Yes

### Sensitive Permissions

- ACCESS_FINE_LOCATION: Service provider matching
- CAMERA: Profile and service photos
- POST_NOTIFICATIONS: Job status updates

### Content Rating

- IARC questionnaire: No violence, no sexual content, no drugs, no gambling
- **Expected rating: Everyone / PEGI 3**

### Privacy Policy URL

https://www.torcapp.com/privacy

---

## REVIEW REQUIRED Items

1. **Web deletion URL** (`https://www.torcapp.com/account-deletion`) — must be live and functional before store submission
2. **Privacy Policy URL** (`https://www.torcapp.com/privacy`) — must be live and accessible
3. **Terms of Service URL** (`https://www.torcapp.com/terms`) — must be live and accessible
4. **Deletion timeline** — specific number of days for Data Safety disclosure requires business decision
5. **Stripe Customer cleanup** — deletion removes DB records but does not call Stripe API to delete Customer object or detach PaymentMethods (see STORE_READINESS_STRIPE.md)
