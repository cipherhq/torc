# TORC RC1 QA Results

**Build:** RC1 (1.0.0 build X)
**Date:** ____
**Tester:** ____

## Devices

| Role | OS | Device | OS Version | Build |
|---|---|---|---|---|
| iPhone | iOS | ____ | ____ | ____ |
| Android | Android | ____ | ____ | ____ |

---

## Customer App Results

| # | Scenario | Device | Expected | Actual | Result | Defect |
|---|---|---|---|---|---|---|
| C1 | Install | iPhone | Installs | | | |
| C1 | Install | Android | Installs | | | |
| C2 | Cold start | iPhone | Splash → login | | | |
| C2 | Cold start | Android | Splash → login | | | |
| C3 | Signup | iPhone | Account created | | | |
| C4 | Login | iPhone | Dashboard loads | | | |
| C5 | Email verification | iPhone | Account verified | | | |
| C6 | Location grant | iPhone | Position shown | | | |
| C6 | Location grant | Android | Position shown | | | |
| C7 | Location deny | iPhone | Manual entry works | | | |
| C7 | Location deny | Android | Manual entry works | | | |
| C8 | Location device off | iPhone | Graceful handling | | | |
| C9 | Address selection | iPhone | Address confirmed | | | |
| C10 | Current location | Android | GPS position used | | | |
| C11 | Service booking | iPhone | Summary shown | | | |
| C12 | Checkout | iPhone | PI created | | | |
| C13 | Stripe payment | iPhone | Payment succeeds | | | |
| C14 | SCA payment | iPhone | 3DS challenge works | | | |
| C15 | Provider matching | iPhone | Matched shown | | | |
| C16 | Live tracking | iPhone | Map updates | | | |
| C17 | Push job update | iPhone | Notification appears | | | |
| C17 | Push job update | Android | Notification appears | | | |
| C18 | Push tap routing | iPhone | Correct screen opens | | | |
| C19 | Provider arrival | iPhone | Customer notified | | | |
| C20 | Service completion | iPhone | Completion screen | | | |
| C21 | Tip | iPhone | Tip processed | | | |
| C22 | Cancellation | iPhone | Cancel confirmed | | | |
| C23 | Refund states | iPhone | Status visible | | | |
| C24 | Photo upload | iPhone | Photo uploaded | | | |
| C24 | Photo upload | Android | Photo uploaded | | | |
| C25 | Camera deny | iPhone | Library fallback | | | |
| C26 | Profile edit | iPhone | Changes saved | | | |
| C27 | Account Security | iPhone | Page loads | | | |
| C28 | Delete Account | iPhone | Request submitted | | | |
| C29 | Privacy Policy | iPhone | Opens in browser | | | |
| C30 | Terms | iPhone | Opens in browser | | | |
| C31 | Logout | iPhone | Returns to login | | | |
| C32 | Reopen app | iPhone | Session restored | | | |
| C33 | Poor network | iPhone | Loading states | | | |
| C34 | Airplane mode | iPhone | Offline state | | | |
| C35 | Background/foreground | iPhone | Resumes correctly | | | |
| C36 | Keyboard overlap | Android | No obscuring | | | |
| C37 | Back navigation | Android | Correct behavior | | | |
| C38 | Dark mode | iPhone | Theme matches | | | |

## Provider App Results

| # | Scenario | Device | Expected | Actual | Result | Defect |
|---|---|---|---|---|---|---|
| P1 | Install | iPhone | Installs | | | |
| P1 | Install | Android | Installs | | | |
| P2 | Cold start | iPhone | Splash → login | | | |
| P3 | Signup/login | iPhone | Dashboard loads | | | |
| P4 | Verification | iPhone | Docs uploaded | | | |
| P5 | Location grant | iPhone | Position shown | | | |
| P5 | Location grant | Android | Position shown | | | |
| P6 | Location deny | iPhone | Clear explanation | | | |
| P7 | Notification grant | iPhone | Token registered | | | |
| P8 | Notification deny | Android | Warning shown | | | |
| P9 | Go online | iPhone | Provider visible | | | |
| P10 | Go offline | iPhone | Provider hidden | | | |
| P11 | Job notification | iPhone | Job details shown | | | |
| P11 | Job notification | Android | Job details shown | | | |
| P12 | Accept job | iPhone | Job started | | | |
| P13 | Conflicting accept | iPhone | Graceful error | | | |
| P14 | Navigation/tracking | iPhone | Map with directions | | | |
| P15 | App background during job | iPhone | Location pauses | | | |
| P16 | Return to foreground | iPhone | Location resumes | | | |
| P17 | Arrive | iPhone | Status updated | | | |
| P18 | Start service | iPhone | Timer starts | | | |
| P19 | Complete service | iPhone | Earnings shown | | | |
| P20 | Cancel job | iPhone | Cancel confirmed | | | |
| P21 | Earnings | iPhone | Accurate values | | | |
| P22 | Cancellation compensation | iPhone | Amount correct | | | |
| P23 | Tips | iPhone | Tip visible | | | |
| P24 | Payout UI | iPhone | History visible | | | |
| P25 | Photo upload | iPhone | Photos uploaded | | | |
| P26 | Document upload | Android | Docs uploaded | | | |
| P27 | Account Security | iPhone | Page loads | | | |
| P28 | Delete Account | iPhone | Request submitted | | | |
| P29 | Network interruption | iPhone | Graceful recovery | | | |
| P30 | Push tap routing | Android | Correct screen | | | |
| P31 | Dark mode | iPhone | Theme matches | | | |
| P32 | Back navigation | Android | No trapped states | | | |
| P33 | Keyboard handling | Android | No overlap | | | |
