# Store Dashboard Checklist (Manual Items)

Use this after code/build readiness is complete.

## Apple App Store Connect (customer + provider)

- [ ] Create app records for:
  - `com.torc.customer`
  - `com.torc.provider`
- [ ] Set **Privacy Policy URL** to `https://www.torcapp.com/privacy`
- [ ] Set **Support URL** to `https://www.torcapp.com/contact` (or `mailto:support@torcapp.com`)
- [ ] Complete **App Privacy** questionnaire with real production data flows
- [ ] Confirm age rating and content declarations
- [ ] In Xcode, set Release signing cert/profile for both bundle IDs and archive upload builds
- [ ] Upload builds and submit to TestFlight
- [ ] Validate push notifications on physical iOS devices from TestFlight

## Google Play Console (customer + provider)

- [ ] Create app records for:
  - `com.torc.customer`
  - `com.torc.provider`
- [ ] Set **Privacy Policy** to `https://www.torcapp.com/privacy`
- [ ] Complete **Data Safety** with real production data flows
- [ ] Complete **App Content** sections (audience, ads, content rating)
- [ ] Configure Play App Signing / upload key and sign release AABs with your upload key
- [ ] Fill `keystore.properties` from:
  - `apps/customer-web/android/keystore.properties.example`
  - `apps/provider-web/android/keystore.properties.example`
- [ ] Upload signed AABs for customer/provider
- [ ] Validate push notifications on physical Android devices from internal testing

## Firebase / Push provider dashboards

- [ ] Confirm Android package registration:
  - `com.torc.customer`
  - `com.torc.provider`
- [ ] Upload APNs auth key to Firebase project for iOS push delivery
- [ ] Confirm APNs key is mapped to both iOS bundle IDs

## Production backend/deployment checks

- [ ] Apply DB migrations through `database/migrations/024_push_notifications_allow_delivered_status.sql`
- [ ] Set production worker env vars (`FIREBASE_*`, `APNS_*`, `NODE_ENV=production`, `APNS_USE_SANDBOX=false`)
- [ ] Deploy/restart push worker and confirm it connects in production environment
- [ ] Send end-to-end push test on real devices for both roles (customer/provider)
