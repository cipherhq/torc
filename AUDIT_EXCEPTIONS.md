# npm Audit Exceptions

Last reviewed: 2026-08-04

## Summary

`npm audit --omit=dev` reports vulnerabilities primarily in two areas:

### 1. apps/mobile (Expo/React Native) — NOT web-deployed

The majority of high/critical vulnerabilities are in the Expo/React Native mobile
toolchain under `apps/mobile/node_modules/`. These packages (`expo`, `@expo/cli`,
`@expo/config-plugins`, `expo-splash-screen`, `fbjs`, `react-native-web`) are used
only for native mobile app builds, not for the web applications deployed to Vercel.

**Risk**: Low for production web deployment. These are build-time dependencies for
mobile releases and do not run in the web application bundles.

**Remediation**: Update Expo SDK when a compatible version is released. Currently
blocked by Expo SDK compatibility requirements.

### 2. ws (WebSocket library) — dev/build dependency

`ws@8.x` has memory disclosure and DoS vulnerabilities. It's used by Vite's dev
server and HMR, not in production client bundles.

**Risk**: None for production. Dev-server only.

### 3. react-router — CSRF bypass in RSC mode

The react-router vulnerability (CVE) applies to React Server Components mode which
TORC does not use (client-side SPA with Vite, no RSC).

**Risk**: Not applicable. TORC uses client-side routing only.

## Accepted exceptions

All remaining vulnerabilities are either:
- In mobile build tooling (not web-deployed)
- In dev-only dependencies (not in production bundles)
- In features not used by this application (RSC mode)

No runtime production web application vulnerabilities remain unaddressed.
