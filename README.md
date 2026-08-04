# TORC - Roadside Assistance Platform

Monorepo for the TORC roadside assistance platform: customer, provider, and admin web apps with native iOS/Android wrappers.

## Architecture

```
torc/
  apps/
    customer-web/   - Customer-facing React app (Capacitor iOS/Android)
    provider-web/   - Provider-facing React app (Capacitor iOS/Android)
    admin-web/      - Admin dashboard React app
    website/        - Marketing website
  packages/
    api/            - Shared Supabase client and services
    types/          - Shared TypeScript type definitions
    ui/             - Shared UI component library
    utils/          - Shared utility functions
  supabase/
    functions/      - Supabase Edge Functions (Deno)
    migrations/     - Supabase migration files
  database/
    migrations/     - SQL migration files
  workers/          - Background workers (push notifications)
  scripts/          - Utility scripts
```

## Tech Stack

- **Frontend**: React 18, React Router 7, Tailwind CSS 4, Radix UI
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **Payments**: Stripe (PaymentIntents, Webhooks)
- **Mobile**: Capacitor (iOS + Android native wrappers)
- **Build**: Vite, npm workspaces
- **Testing**: Vitest, React Testing Library
- **CI**: GitHub Actions

## Prerequisites

- Node.js >= 18
- npm >= 9
- For iOS: Xcode 15+, CocoaPods
- For Android: Java 21 (`JAVA_HOME=/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`)

## Setup

```bash
# Install dependencies
npm ci

# Copy environment variables
cp .env.example .env
# Fill in required values (see Environment Variables below)
```

## Environment Variables

Required in `.env`:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key (restricted to Maps JS API) |
| `STRIPE_SECRET_KEY` | Stripe secret key (Edge Functions only) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_MESSAGING_SERVICE_SID` | Twilio messaging service SID |
| `RESEND_API_KEY` | Resend email API key |

## Development

```bash
# Start individual apps
npm run dev:customer    # http://localhost:7002
npm run dev:provider    # http://localhost:7001
npm run dev:admin       # http://localhost:8082
npm run dev:website     # http://localhost:8083

# Background worker
npm run worker:push
```

## Testing

```bash
# Run all tests
npm run test:all

# Run tests for specific app
npm run test:customer
npm run test:provider
npm run test:admin

# Validate migrations
npm run validate:migrations
```

## Building

```bash
# Build all apps
npm run build:all

# Build specific app
npm run build:customer
npm run build:provider
npm run build:admin
npm run build:website
```

## Mobile Builds

### iOS (Provider)
```bash
cd apps/provider-web
npx cap sync ios
# Open in Xcode and build
```

### Android (Customer)
```bash
cd apps/customer-web
npx cap sync android
cd android
JAVA_HOME=/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew assembleDebug
```

## Database Migrations

Migration files are in `database/migrations/` (numbered) and `supabase/migrations/` (timestamped).

Apply via Supabase CLI:
```bash
supabase db push
```

## Edge Functions

Located in `supabase/functions/`:

| Function | Purpose |
|----------|---------|
| `create-payment-intent` | Server-authoritative checkout + Stripe PaymentIntent |
| `stripe-webhook` | Stripe webhook handler (signature verification, idempotent) |
| `byo-webhook` | Multi-gateway webhook handler (Paystack, Flutterwave, Stripe) |
| `send-email` | Transactional email via Resend (template-based, authorized) |
| `send-sms` | SMS via Twilio (template-based, rate-limited) |
| `manage-payment-credentials` | Encrypted payment credential storage |

## CI/CD

GitHub Actions runs on pull requests to `main` and `develop`:
- Unit tests (all three web apps)
- Build verification (all four web apps)
- Migration validation
- Security scan

## Release Process

1. Create feature branch from `develop`
2. Open PR to `develop` (CI must pass)
3. Merge to `develop` for staging
4. Create PR from `develop` to `main` for production
5. Deploy via Vercel (web) + Capacitor build (native)
6. Run `supabase db push` for database migrations
7. Deploy Edge Functions via `supabase functions deploy`
