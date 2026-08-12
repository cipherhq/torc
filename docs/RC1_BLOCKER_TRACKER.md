# TORC RC1 Release Blocker Tracker

**Target:** TestFlight + Google Play Internal Testing
**Date:** 2026-08-12

---

## CODE BLOCKERS

| # | Item | Status | Notes |
|---|---|---|---|
| C1 | Web builds pass | DONE | Customer + Provider |
| C2 | Capacitor sync passes | DONE | iOS + Android, both apps |
| C3 | Android AAB bundleRelease | DONE | Signed with local keystores |
| C4 | Android lint zero errors | DONE | Both apps |
| C5 | Unit tests pass | DONE | 398 customer + 43 provider |
| C6 | configValidation fail-closed | DONE | Production mode rejects unsafe config |
| C7 | Permission minimization | DONE | PR #22 merged |
| C8 | Privacy manifests | DONE | PrivacyInfo.xcprivacy both apps |
| C9 | No secrets in client code | DONE | Verified |

## SIGNING BLOCKERS

| # | Item | App | Status | Action Required |
|---|---|---|---|---|
| S1 | Apple Distribution certificate | Both | BLOCKED | Generate at developer.apple.com or via Xcode |
| S2 | iOS provisioning profiles | Both | BLOCKED | Automatic signing will resolve after S1 |
| S3 | Android upload keystore (customer) | Customer | AVAILABLE | Local: keystores/customer-upload-key.jks |
| S4 | Android upload keystore (provider) | Provider | AVAILABLE | Local: keystores/provider-upload-key.jks |
| S5 | Play App Signing enrollment | Both | BLOCKED | Enroll during first Play Console upload |

## PRODUCTION CONFIG BLOCKERS

| # | Item | Status | Notes |
|---|---|---|---|
| P1 | Production Supabase project URL | BLOCKED | Need production project credentials |
| P2 | Production Supabase anon key | BLOCKED | Need production anon key |
| P3 | Production Google Maps API key | BLOCKED | Need production-restricted API key |
| P4 | Production Stripe pk_live_ key | BLOCKED | Need live Stripe publishable key (customer only) |
| P5 | Production app URL (customer) | BLOCKED | Need approved production domain |
| P6 | Production app URL (provider) | BLOCKED | Need approved production domain |

**Note:** For RC1 TestFlight/Internal Testing, items P1-P6 are NOT required. Internal testing uses `--mode internal` with test configuration.

## PHYSICAL QA BLOCKERS

| # | Item | Status | Notes |
|---|---|---|---|
| Q1 | Real iPhone testing | NOT STARTED | Requires TestFlight build (S1, S2) |
| Q2 | Real Android testing | NOT STARTED | Requires signed AAB + Play Internal Testing |
| Q3 | Push notification testing (APNs) | BLOCKED | Requires APNs key setup |
| Q4 | Push notification testing (FCM) | BLOCKED | Requires FCM service account |
| Q5 | 73 test scenarios executed | NOT STARTED | docs/PHYSICAL_DEVICE_TEST_PLAN.md |

## STORE CONSOLE BLOCKERS

| # | Item | App | Status | Action |
|---|---|---|---|---|
| SC1 | App Store Connect app record | Customer | NEEDED | Create at appstoreconnect.apple.com |
| SC2 | App Store Connect app record | Provider | NEEDED | Create at appstoreconnect.apple.com |
| SC3 | Play Console app record | Customer | NEEDED | Create at play.google.com/console |
| SC4 | Play Console app record | Provider | NEEDED | Create at play.google.com/console |
| SC5 | App Privacy questionnaire | Both | DRAFT READY | docs/STORE_READINESS_*.md |
| SC6 | Data Safety form | Both | DRAFT READY | docs/STORE_READINESS_*.md |
| SC7 | Screenshots | Both | NEEDED | Design team |
| SC8 | App descriptions | Both | NEEDED | Marketing |
| SC9 | Reviewer test accounts | Both | NEEDED | Create test credentials |
| SC10 | Privacy Policy URL live | Both | VERIFY | torcapp.com/privacy |
| SC11 | Terms URL live | Both | VERIFY | torcapp.com/terms |
| SC12 | Account deletion URL live | Both | VERIFY | torcapp.com/account-deletion |

## BUSINESS/LEGAL BLOCKERS

| # | Item | Status | Owner |
|---|---|---|---|
| B1 | Stripe PaymentMethod deletion on account deletion | UNRESOLVED | Engineering + Legal |
| B2 | Provider document retention period | UNRESOLVED | Legal |
| B3 | Job photo retention period | UNRESOLVED | Legal |
| B4 | Financial record retention duration | UNRESOLVED | Legal + Accounting |
| B5 | Provider background location decision | UNRESOLVED | Product |
| B6 | Deletion processing timeline (Data Safety) | UNRESOLVED | Legal |

---

## WHAT YOU MUST PERSONALLY DO BEFORE RC1 ON REAL DEVICES

### For TestFlight (iOS):

1. **Open developer.apple.com** with your Apple Developer account
2. **Register App IDs** for `com.torc.customer` and `com.torc.provider` with Push Notifications capability
3. **Create APNs Key** (Keys section) — download the .p8 file
4. **Open App Store Connect** — create two app records (TORC, TORC Pro)
5. **Open Xcode** — ensure Automatic Signing resolves with your team. If "Apple Distribution" certificate is missing, Xcode will prompt to create one
6. **Archive** each app (Product > Archive) and upload to App Store Connect
7. **Add yourself as internal tester** in TestFlight

### For Play Internal Testing (Android):

1. **Open Google Play Console** — create two app records
2. **Upload** the signed AABs (already built locally)
3. **Enroll in Play App Signing** during first upload
4. **Create Internal Testing release** for each app
5. **Add tester email list** and share opt-in link

### For Push Notifications:

1. **APNs:** Use the .p8 key from step 3 above, configure push worker
2. **FCM:** Go to Firebase Console > torc-app > Service Accounts > Generate private key, configure push worker
