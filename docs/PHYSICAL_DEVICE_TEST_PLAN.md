# TORC Physical Device Acceptance Test Plan

**Status:** NOT YET EXECUTED — requires TestFlight / Google Play Internal Testing builds on physical devices

## Test Devices Required

- Real iPhone (iOS 15+)
- Real Android phone (API 24+)

---

## Customer App Test Matrix

| # | Scenario | Steps | Expected Result | iPhone | Android |
|---|---|---|---|---|---|
| C1 | Install | Install from TestFlight / Internal Testing | App installs cleanly | - | - |
| C2 | Cold start | Launch app from scratch | Splash → onboarding/login | - | - |
| C3 | Signup | Register with email/password | Account created, verification email sent | - | - |
| C4 | Login | Sign in with existing account | Dashboard loads | - | - |
| C5 | Email verification | Click verification link in email | Account verified, redirects to app | - | - |
| C6 | Location permission — grant | Accept location when prompted | Current position shown on map | - | - |
| C7 | Location permission — deny | Deny location permission | Manual address entry available, no crash | - | - |
| C8 | Location permission — device off | Turn off device location services | Graceful handling, manual entry | - | - |
| C9 | Address selection | Search and select service address | Address confirmed, proceed to booking | - | - |
| C10 | Current location | Use "Current Location" button | GPS position used as service address | - | - |
| C11 | Service booking | Select service category and details | Booking summary shown | - | - |
| C12 | Checkout | Enter payment details via Stripe | PaymentIntent created | - | - |
| C13 | Stripe payment | Complete payment with test card | Payment succeeds, matching starts | - | - |
| C14 | SCA payment | Use SCA test card (4000002500003155) | 3D Secure challenge shown, payment completes | - | - |
| C15 | Provider matching | Wait for provider match | Matched provider shown | - | - |
| C16 | Live tracking | Track provider approach | Map updates with provider location | - | - |
| C17 | Push — job update | Receive notification for job status change | Notification appears (foreground and background) | - | - |
| C18 | Push — tap routing | Tap on notification | App opens to correct job detail | - | - |
| C19 | Provider arrival | Provider marks "arrived" | Customer notified | - | - |
| C20 | Service completion | Provider completes service | Completion screen shown | - | - |
| C21 | Tip | Add tip after completion | Tip payment processed | - | - |
| C22 | Cancellation | Cancel active booking | Cancellation confirmed, refund if applicable | - | - |
| C23 | Refund states | Check refund status | Refund status visible in job detail | - | - |
| C24 | Photo upload | Upload photo for service request | Photo selected and uploaded | - | - |
| C25 | Camera — deny | Deny camera permission | App still functional, library fallback | - | - |
| C26 | Profile | View and edit profile | Changes saved | - | - |
| C27 | Account Security | Navigate to Account Security | Page loads with email, password, deletion sections | - | - |
| C28 | Delete Account | Submit deletion request | Confirmation dialog → request submitted → signed out | - | - |
| C29 | Privacy Policy | Tap Privacy Policy link | Opens in browser, page loads | - | - |
| C30 | Terms of Service | Tap Terms link | Opens in browser, page loads | - | - |
| C31 | Logout | Sign out | Returns to login screen | - | - |
| C32 | Reopen app | Close and reopen app | Session restored if logged in | - | - |
| C33 | Poor network | Use throttled connection | Loading states shown, no crash | - | - |
| C34 | Airplane mode | Enable airplane mode | Offline state shown, recovery on reconnect | - | - |
| C35 | Background/foreground | Background app, then return | App resumes correctly | - | - |
| C36 | Keyboard overlap | Tap input fields | Keyboard doesn't obscure inputs | - | - |
| C37 | Back navigation | Use back gesture/button | Navigates correctly, no trapped states | - | - |
| C38 | Dark mode | Toggle device dark mode | App theme matches | - | - |
| C39 | Large text | Increase system text size | Text scales without clipping | - | - |
| C40 | Orientation | Rotate device | Layout adapts (or locks correctly) | - | - |

---

## Provider App Test Matrix

| # | Scenario | Steps | Expected Result | iPhone | Android |
|---|---|---|---|---|---|
| P1 | Install | Install from TestFlight / Internal Testing | App installs cleanly | - | - |
| P2 | Cold start | Launch app | Splash → login | - | - |
| P3 | Signup/login | Register or sign in | Dashboard loads | - | - |
| P4 | Verification | Complete provider verification | Verification documents uploaded | - | - |
| P5 | Location permission — grant | Accept location permission | Position shown on map | - | - |
| P6 | Location permission — deny | Deny location | Cannot go online, clear explanation shown | - | - |
| P7 | Notification permission — grant | Accept notifications | Token registered | - | - |
| P8 | Notification permission — deny | Deny notifications | App warns about missed jobs | - | - |
| P9 | Go online | Toggle online status | Provider visible to customers | - | - |
| P10 | Go offline | Toggle offline | Provider hidden from matching | - | - |
| P11 | Job notification | Receive new job offer | Notification with job details | - | - |
| P12 | Accept job | Accept incoming job | Job started, customer notified | - | - |
| P13 | Conflicting accept | Two providers accept same job | One gets "already taken" error gracefully | - | - |
| P14 | Navigation/tracking | Track to customer location | Map with directions, location updates | - | - |
| P15 | App background during job | Background app during active job | Location updates pause (known limitation) | - | - |
| P16 | Return to foreground | Return to app during job | Location resumes, job state intact | - | - |
| P17 | Arrive | Mark arrival at customer | Status updated, customer notified | - | - |
| P18 | Start service | Begin service | Timer/tracking starts | - | - |
| P19 | Complete service | Complete service | Completion screen, earnings shown | - | - |
| P20 | Cancel job | Cancel active job | Cancellation confirmed | - | - |
| P21 | Earnings | View earnings dashboard | Accurate earnings, fees, tips shown | - | - |
| P22 | Cancellation compensation | Check compensation for customer-cancelled job | Compensation amount correct | - | - |
| P23 | Tips | Receive tip | Tip visible in earnings | - | - |
| P24 | Payout UI | View payout information | Payout status and history visible | - | - |
| P25 | Photo upload | Upload job completion photos | Photos uploaded successfully | - | - |
| P26 | Document upload | Upload verification documents | Documents uploaded | - | - |
| P27 | Account Security | Navigate to Account Security | Page loads correctly | - | - |
| P28 | Delete Account | Submit deletion request | Request submitted, signed out | - | - |
| P29 | Network interruption | Lose connection during active job | Graceful handling, recovery on reconnect | - | - |
| P30 | Push tap routing | Tap notification | Opens correct screen | - | - |
| P31 | Dark mode | Toggle dark mode | Theme matches | - | - |
| P32 | Back navigation | Use gestures/back button | No trapped states | - | - |
| P33 | Keyboard handling | Input fields with keyboard | No overlap, dismissal works | - | - |

---

## Notes

- All tests must be performed on PHYSICAL devices, not simulators/emulators
- Stripe test cards should be used for payment testing
- Push notification testing requires valid APNs/FCM configuration
- Background location limitation (P15) is a known issue documented in STORE_READINESS_PROVIDER.md
- Record pass/fail with device model and OS version
