# TORC Product Architecture

Locked as of August 2026.

## Products

### A. TORC Hybrid Mobile App

Roadside assistance platform for customers requesting service and providers fulfilling requests.

Currently implemented as **two production Capacitor binaries**:

| Binary | Source | iOS Bundle ID | Android Application ID | App Name |
|--------|--------|---------------|----------------------|----------|
| Customer | `apps/customer-web` | `com.torc.customer` | `com.torc.customer` | TORC |
| Provider | `apps/provider-web` | `com.torc.provider` | `com.torc.provider` | TORC Pro |

Both are React + Vite web apps wrapped in Capacitor native shells with shared Supabase backend.

**Future target**: One unified TORC hybrid binary with customer/provider role-based experience. See `docs/HYBRID_APP_UNIFICATION_PLAN.md`. This unification is a separate project and is NOT part of any current work.

### B. TORC Admin

Web-only admin dashboard for platform operations.

| Property | Value |
|----------|-------|
| Source | `apps/admin-web` |
| Framework | React + Vite SPA |
| Auth | Supabase + `requireAdminSession()` + RBAC |

### C. TORC Website

Public marketing website.

| Property | Value |
|----------|-------|
| Source | `apps/website` |
| Framework | React + Vite SPA |
| Domain | `www.torcapp.com` |

### D. apps/mobile (DEPRECATED)

Abandoned Expo/React Native prototype. **NOT the production mobile application.**

See `apps/mobile/DEPRECATED.md` for details. Excluded from workspace installs.

## Backend

| Component | Location |
|-----------|----------|
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Realtime | Supabase Realtime |
| Edge Functions | `supabase/functions/` (create-payment-intent, stripe-webhook, send-email, send-sms) |
| Payments | Stripe (PaymentIntents + Webhooks) |
| Push | Firebase Cloud Messaging + APNs |
| Email | Resend |
| SMS | Twilio |

## Shared Packages

| Package | Purpose |
|---------|---------|
| `packages/api` | Supabase client + service functions |
| `packages/types` | TypeScript type definitions |
| `packages/ui` | Shared UI components |
| `packages/utils` | Utility functions |
