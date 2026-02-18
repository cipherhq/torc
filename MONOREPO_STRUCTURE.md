# 🏗️ Torc Monorepo Structure

## Overview

Separate your Torc platform into independent apps that can be developed, deployed, and scaled separately while sharing common code.

## Structure

```
torc/
├── apps/
│   ├── customer-web/         # Customer web app (Port 8080)
│   ├── provider-web/         # Provider web app (Port 8081)
│   ├── admin-web/            # Admin dashboard (Port 8082)
│   ├── website/              # Public website (Port 8083)
│   ├── mobile-customer/      # Customer mobile (iOS/Android)
│   └── mobile-provider/      # Provider mobile (iOS/Android)
├── packages/
│   ├── ui/                   # Shared UI components
│   ├── api/                  # Supabase client & services
│   ├── types/                # TypeScript interfaces
│   ├── utils/                # Shared utilities
│   └── config/               # Shared configs
├── package.json              # Root package.json
├── .env                      # Shared environment variables
└── turbo.json               # Turborepo config (optional)
```

## Port Allocation

| App | Port | URL | Purpose |
|-----|------|-----|---------|
| Customer Web | 8080 | http://localhost:8080 | Customer booking & tracking |
| Provider Web | 8081 | http://localhost:8081 | Provider dashboard & jobs |
| Admin Web | 8082 | http://localhost:8082 | Admin operations |
| Public Website | 8083 | http://localhost:8083 | Marketing & info |
| Customer Mobile | - | Expo | iOS/Android customer app |
| Provider Mobile | - | Expo | iOS/Android provider app |

## Setup Instructions

### Step 1: Install Workspace Tool

We'll use **npm workspaces** (built into npm):

```bash
# No installation needed - npm 7+ has workspaces!
npm --version  # Should be 7 or higher
```

Or optionally use **Turborepo** for faster builds:

```bash
npm install turbo --global
```

### Step 2: Update Root package.json

```json
{
  "name": "torc-monorepo",
  "version": "1.0.0",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspaces --if-present",
    "dev:customer": "npm run dev -w customer-web",
    "dev:provider": "npm run dev -w provider-web",
    "dev:admin": "npm run dev -w admin-web",
    "dev:website": "npm run dev -w website",
    "dev:all": "concurrently \"npm run dev:customer\" \"npm run dev:provider\" \"npm run dev:admin\" \"npm run dev:website\"",
    "build": "npm run build --workspaces --if-present",
    "build:customer": "npm run build -w customer-web",
    "build:provider": "npm run build -w provider-web",
    "build:admin": "npm run build -w admin-web",
    "build:website": "npm run build -w website"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

### Step 3: Create Apps Structure

Each app will have its own package.json:

**apps/customer-web/package.json:**
```json
{
  "name": "customer-web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite --port 8080",
    "build": "vite build"
  },
  "dependencies": {
    "@torc/ui": "*",
    "@torc/api": "*",
    "@torc/types": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router": "*"
  }
}
```

**apps/provider-web/package.json:**
```json
{
  "name": "provider-web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite --port 8081",
    "build": "vite build"
  },
  "dependencies": {
    "@torc/ui": "*",
    "@torc/api": "*",
    "@torc/types": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router": "*"
  }
}
```

**apps/admin-web/package.json:**
```json
{
  "name": "admin-web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite --port 8082",
    "build": "vite build"
  },
  "dependencies": {
    "@torc/ui": "*",
    "@torc/api": "*",
    "@torc/types": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router": "*",
    "recharts": "^2.15.2"
  }
}
```

### Step 4: Create Shared Packages

**packages/api/package.json:**
```json
{
  "name": "@torc/api",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  }
}
```

**packages/ui/package.json:**
```json
{
  "name": "@torc/ui",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "react": "^18.3.1",
    "lucide-react": "^0.487.0",
    "class-variance-authority": "^0.7.1"
  }
}
```

**packages/types/package.json:**
```json
{
  "name": "@torc/types",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

## Benefits by App

### Customer Web (8080)
- Lightweight, fast loading
- Only customer-facing features
- Optimized for mobile web
- Can be a PWA

### Provider Web (8081)
- Provider-specific features
- GPS tracking focused
- Job management
- Can also be a PWA

### Admin Web (8082)
- Desktop-first design
- Rich data tables
- Analytics & charts
- Dashboard widgets

### Public Website (8083)
- Marketing pages
- SEO optimized
- Static generation
- Fast loading

## Migration Strategy

### Option 1: Quick Split (Recommended)
Keep current app as-is, add new apps gradually:
```bash
# Current app becomes customer-web
# Add provider and admin later
```

### Option 2: Full Restructure
Move everything to monorepo structure immediately

### Option 3: Hybrid
Current app for development, split before production

## Commands After Setup

```bash
# Run one app
npm run dev:customer    # Port 8080
npm run dev:provider    # Port 8081
npm run dev:admin       # Port 8082
npm run dev:website     # Port 8083

# Run all web apps simultaneously
npm run dev:all

# Build specific app
npm run build:customer
npm run build:provider

# Build all
npm run build
```

## Deployment Benefits

With separated apps, you can deploy to different services:

| App | Recommended Host | Why |
|-----|------------------|-----|
| Customer Web | Vercel | Fast, CDN, mobile-optimized |
| Provider Web | Vercel | Fast, CDN, mobile-optimized |
| Admin Web | Vercel/Railway | Desktop-focused, less traffic |
| Website | Vercel/Netlify | Static, SEO, marketing |

## Shared Code Example

**packages/api/src/index.ts:**
```typescript
export { supabase } from './supabase';
export * from './services/auth';
export * from './services/jobs';
export * from './services/providers';
```

**Use in any app:**
```typescript
// apps/customer-web/src/pages/Login.tsx
import { supabase, signIn } from '@torc/api';

// apps/provider-web/src/pages/Dashboard.tsx
import { supabase, getProviderJobs } from '@torc/api';

// Same code, different apps!
```

## Cost Implications

**Single App Deployment:**
- 1 Vercel instance
- All traffic to one server
- Larger bundle size

**Separate Apps Deployment:**
- 4 Vercel instances (all free tier!)
- Traffic distributed
- Smaller bundles (faster loading)
- More control

## Development Workflow

```bash
# Developer working on customer features
cd apps/customer-web
npm run dev  # Port 8080

# Developer working on admin
cd apps/admin-web
npm run dev  # Port 8082

# Testing integration
npm run dev:all  # Run all apps
```

## Next Steps

Would you like me to:
1. ✅ **Set up the monorepo structure now?**
2. ✅ **Migrate your current code to separate apps?**
3. ✅ **Keep current structure and just add port options?**
4. ❓ **Something else?**

Let me know your preference! 🚀
