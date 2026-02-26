# Local Ports Setup (No Conflicts)

Use these fixed ports to avoid macOS port collisions and callback mismatches.

## Port map

- Customer app: `http://localhost:7010`
- Provider app: `http://localhost:7001`
- Admin app (separate): `http://localhost:8082/admin`
- Website: `http://localhost:8083`

## File defaults (already set)

- `apps/customer-web/package.json` -> dev/preview on `7010`
- `apps/customer-web/.env` -> `VITE_APP_URL=http://localhost:7010`
- `apps/provider-web/package.json` -> dev/preview on `7001`
- `apps/provider-web/.env` -> `VITE_APP_URL=http://localhost:7001`
- `apps/admin-web/package.json` -> dev on `8082`
- `apps/website/package.json` -> dev on `8083`

## Start commands

Run each app in a separate terminal:

```bash
cd /Users/bajideace/Desktop/torc
npm run dev:customer
npm run dev:provider
npm run dev:admin
npm run dev:website
```

## Supabase redirect URLs (required)

In Supabase Dashboard -> Authentication -> URL Configuration, ensure these are added:

- `http://localhost:7010/auth/callback`
- `http://localhost:7001/auth/callback`
- `http://localhost:8082/admin/login` (if testing admin-web auth flow)

If email links were generated before these changes, request a new link.

