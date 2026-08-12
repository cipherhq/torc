# TORC Build Environment Architecture

## Build Modes

| Mode | Vite Command | Env File | VITE_APP_ENV | Purpose |
|---|---|---|---|---|
| **development** | `vite` / `vite build` | `.env` | `development` | Local development |
| **staging** | `vite build --mode staging` | `.env.staging` | `staging` | Staging environment |
| **internal** | `vite build --mode internal` | `.env.internal` | `internal` | Vercel preview deployment, internal testing |
| **production** | `vite build --mode production` | `.env.production` | `production` | Store release (TestFlight / Play Store) |

## Production Mode Fail-Closed

When `VITE_APP_ENV=production`, `configValidation.ts` runs additional checks at app startup:

**Required variables:**
- `VITE_APP_URL` — must be set
- `VITE_SUPABASE_URL` — must be set
- `VITE_SUPABASE_ANON_KEY` — must be set
- `VITE_STRIPE_PUBLISHABLE_KEY` — must be set (customer app)

**Prohibited patterns in any VITE_ variable:**
- `localhost` or `127.0.0.1`
- `*.vercel.app` preview deployment hosts
- `pk_test_` (Stripe test publishable key)
- `sk_test_` (Stripe test secret key)
- `sk_live_` (Stripe live secret key — must never be client-side)
- `service_role` (Supabase service-role key)

If any check fails, the app **refuses to mount** and shows a configuration error screen.

## Building for Each Mode

```bash
# Local development
npm run dev --workspace=apps/customer-web

# Internal/Vercel deployment
npx vite build --mode internal    # Uses .env.internal

# Production store release
npx vite build --mode production  # Uses .env.production
# Requires injecting real production values via environment or CI secrets
```

## CI Behavior

CI builds use inline environment variables (placeholder values) which override `.env.production`. CI does NOT set `VITE_APP_ENV=production`, so production-mode checks do not trigger in CI.

## Capacitor Native Builds

For native mobile release builds:
1. Build web assets: `vite build --mode internal` (for testing) or `--mode production` (for store)
2. Sync: `npx cap sync`
3. Build native: Xcode / Gradle

The web assets bundled into the native app contain the environment values baked at build time.

## What Goes Where

| Value | `.env` (dev) | `.env.internal` | `.env.production` |
|---|---|---|---|
| VITE_APP_URL | localhost:7010 | Vercel preview URL | Production domain (injected) |
| VITE_SUPABASE_URL | Dev project | Dev project | Production project (injected) |
| VITE_STRIPE_PUBLISHABLE_KEY | pk_test_xxx | pk_test_xxx | pk_live_xxx (injected) |
| VITE_APP_ENV | development | internal | production |
