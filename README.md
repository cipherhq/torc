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
- For Android: Java 21

## Setup

```bash
npm ci
cp .env.example .env
# Fill in required values
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key |
| `STRIPE_SECRET_KEY` | Stripe secret key (Edge Functions) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_MESSAGING_SERVICE_SID` | Twilio messaging service SID |
| `RESEND_API_KEY` | Resend email API key |

## Development

```bash
npm run dev:customer    # http://localhost:7002
npm run dev:provider    # http://localhost:7001
npm run dev:admin       # http://localhost:8082
npm run dev:website     # http://localhost:8083
npm run worker:push     # Push notification worker
```

## Testing

```bash
npm run test:customer
npm run test:provider
npm run test:admin
```

## Building

```bash
npm run build:all
```

## Edge Functions

| Function | Purpose |
|----------|---------|
| `create-payment-intent` | Server-authoritative checkout + Stripe PaymentIntent |
| `stripe-webhook` | Stripe webhook handler (cryptographic verification, idempotent) |
| `send-email` | Transactional email (template-based, authorized, rate-limited) |
| `send-sms` | SMS notifications (template-based, job-authorized, rate-limited) |

## Database Migrations

Apply via Supabase CLI: `supabase db push`

## CI/CD

GitHub Actions on PRs: unit tests, builds, migration validation, security scan.
