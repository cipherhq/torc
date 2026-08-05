# DEPRECATED — Do Not Use

**This is an abandoned Expo/React Native prototype. It is NOT the production TORC mobile application.**

## Production Mobile Sources

The production TORC hybrid mobile apps are built with **Capacitor** from these directories:

| App | Source | iOS Bundle ID | Android Application ID |
|-----|--------|---------------|----------------------|
| **TORC Customer** | `apps/customer-web` | `com.torc.customer` | `com.torc.customer` |
| **TORC Provider** | `apps/provider-web` | `com.torc.provider` | `com.torc.provider` |

## What This Directory Contains

An early Expo prototype with 12 screens (vs 98 production screens), incomplete booking/payment flows, no native build directories, no CI integration, and no App Store/Play Store connection.

## Rules

- **Do not** add new features here.
- **Do not** deploy or submit this to any app store.
- **Do not** copy production fixes into this directory unless a future migration project explicitly requires it.
- **Do not** treat this as the authoritative TORC mobile source.
- **Do not** install its dependencies in production CI unless specifically needed.

## History

This prototype was created to evaluate Expo/React Native as an alternative to Capacitor. The Capacitor approach (`apps/customer-web` + `apps/provider-web`) was chosen for production because it reuses the existing React web codebase directly.

This directory is retained for historical reference only and will be archived or removed in a future cleanup.
