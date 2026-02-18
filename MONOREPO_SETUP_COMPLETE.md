# 🎉 Monorepo Setup Complete!

Your Torc platform is now organized as a professional monorepo with separate applications!

## 📁 Directory Structure

```
torc/
├── apps/
│   ├── customer-web/     → Port 8080 (Customer App)
│   ├── provider-web/     → Port 8081 (Provider App)
│   ├── admin-web/        → Port 8082 (Admin Dashboard)
│   └── website/          → Port 8083 (Public Website)
│
└── packages/
    ├── api/              → Supabase client + services
    ├── ui/               → Shared UI components
    ├── types/            → TypeScript types
    └── utils/            → Utility functions
```

## 🚀 Quick Start

### 1. Install Dependencies

First, install all dependencies for the entire monorepo:

```bash
npm install
```

This will install dependencies for all apps and packages automatically!

### 2. Run Individual Apps

Run each app on its designated port:

```bash
# Customer App (Port 8080)
npm run dev:customer

# Provider App (Port 8081)
npm run dev:provider

# Admin Dashboard (Port 8082)
npm run dev:admin

# Public Website (Port 8083)
npm run dev:website
```

### 3. Run Multiple Apps (Optional)

Open multiple terminal windows/tabs and run different apps simultaneously:

**Terminal 1:**
```bash
npm run dev:customer
```

**Terminal 2:**
```bash
npm run dev:provider
```

**Terminal 3:**
```bash
npm run dev:admin
```

## 📦 Available Scripts

### Development
- `npm run dev:customer` - Start customer app on port 8080
- `npm run dev:provider` - Start provider app on port 8081
- `npm run dev:admin` - Start admin dashboard on port 8082
- `npm run dev:website` - Start public website on port 8083

### Build
- `npm run build:all` - Build all apps
- `npm run build:customer` - Build customer app only
- `npm run build:provider` - Build provider app only
- `npm run build:admin` - Build admin dashboard only
- `npm run build:website` - Build website only

## 🔄 How It Works

### Shared Packages

All apps can import from shared packages:

```javascript
// Import API functions
import { supabase, signIn, createJob } from '@torc/api';

// Import types
import type { Job, Provider, Customer } from '@torc/types';

// Import utilities
import { formatCurrency, calculateDistance } from '@torc/utils';

// Import UI components (when fully migrated)
import { Button, Card } from '@torc/ui';
```

### Port Allocation

| App              | Port  | URL                      | Purpose                  |
|------------------|-------|--------------------------|--------------------------|
| Customer Web     | 8080  | http://localhost:8080    | Customer mobile app      |
| Provider Web     | 8081  | http://localhost:8081    | Provider mobile app      |
| Admin Web        | 8082  | http://localhost:8082    | Admin dashboard          |
| Website          | 8083  | http://localhost:8083    | Public marketing site    |

## 🎯 What's Included

### Customer App (Port 8080)
- ✅ All customer pages (HomeMap, Service Selection, Live Tracking, etc.)
- ✅ Customer-specific components (CustomerBottomNav, ServiceCard, etc.)
- ✅ Auth pages (Login, Signup, Permissions)
- ✅ Full routing configured

### Provider App (Port 8081)
- ✅ All provider pages (Dashboard, Job List, Active Job, Earnings, etc.)
- ✅ Provider-specific components (ProviderBottomNav, etc.)
- ✅ Auth pages
- ✅ Full routing configured

### Admin Dashboard (Port 8082)
- ✅ All admin pages (Dashboard, Users, Providers, Jobs, Analytics)
- ✅ Admin-specific components
- ✅ Auth pages
- ✅ Full routing configured

### Public Website (Port 8083)
- ✅ Landing page with hero section
- ✅ Services showcase
- ✅ How it works section
- ✅ About, Contact, Become Provider pages
- ✅ Marketing-focused design

### Shared Packages
- ✅ **@torc/api**: Supabase client, auth services, job services, services management
- ✅ **@torc/types**: TypeScript types for all entities (Job, Provider, Customer, etc.)
- ✅ **@torc/utils**: Common utilities (formatCurrency, calculateDistance, validation, etc.)
- ✅ **@torc/ui**: Shared UI components (ready for component migration)

## 🔧 Configuration

Each app has its own:
- ✅ `package.json` with dependencies
- ✅ `vite.config.js` with port configuration
- ✅ `tailwind.config.js` for styling
- ✅ `.env` file (copied from root - update as needed)
- ✅ `index.html` entry point
- ✅ `src/` directory with pages, components, and routes

## 🏗️ Development Workflow

### Working on a Single App

1. Navigate to the app directory:
   ```bash
   cd apps/customer-web
   ```

2. Run the dev server:
   ```bash
   npm run dev
   ```

### Working on Shared Code

1. Edit files in `packages/`:
   ```bash
   # Edit API services
   vim packages/api/src/services/jobs.service.js
   
   # Edit types
   vim packages/types/src/index.ts
   
   # Edit utilities
   vim packages/utils/src/index.js
   ```

2. Changes are automatically available to all apps!

### Adding New Dependencies

For app-specific dependencies:
```bash
npm install [package] --workspace=customer-web
```

For shared dependencies (used by all apps):
```bash
npm install [package] --workspace=@torc/api
```

## 📱 Next Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Test Each App**
   ```bash
   npm run dev:customer    # Test on http://localhost:8080
   npm run dev:provider    # Test on http://localhost:8081
   npm run dev:admin       # Test on http://localhost:8082
   npm run dev:website     # Test on http://localhost:8083
   ```

3. **Set Up Supabase** (if not done already)
   - Run the SQL scripts from `SUPABASE_SETUP.md`
   - Verify `.env` files in each app have correct Supabase credentials

4. **Start Building!**
   - Each app is now independent and can be developed separately
   - Shared code is automatically synced across all apps
   - Add features to specific apps without affecting others

## 🎨 Design System

All apps share the "Liquid Precision" design system:
- **Colors**: Cyber-Mint (#2EFFAF), Deep Cobalt (#007AFF), Navy Elevated (#1A1F2E)
- **Corner Radius**: 32px
- **Glassmorphism**: Available via `.glass`, `.glass-bright`, `.glass-light`, `.glass-dark`
- **Animations**: Motion (Framer Motion) for smooth transitions

## 🔐 Environment Variables

Each app has its own `.env` file with:
- Supabase URL and keys
- Google Maps API key
- Stripe keys
- Resend API key

Update these as needed for each environment (development, staging, production).

## 🚢 Deployment

Each app can be deployed independently:
- **Customer/Provider/Admin**: Deploy to Vercel, Netlify, or any static host
- **Website**: Deploy to Vercel, Netlify, or Cloudflare Pages
- **Backend**: Supabase handles your backend automatically

## ✅ Verification Checklist

After running `npm install`, verify each app:

- [ ] Customer app runs on port 8080
- [ ] Provider app runs on port 8081
- [ ] Admin app runs on port 8082
- [ ] Website runs on port 8083
- [ ] All apps can import from `@torc/api`
- [ ] All apps can import from `@torc/types`
- [ ] All apps can import from `@torc/utils`
- [ ] Supabase connection works in all apps

## 🎉 Benefits of This Setup

1. **Separation of Concerns**: Each app is independent
2. **Code Reuse**: Shared packages eliminate duplication
3. **Easy Scaling**: Add new apps easily
4. **Independent Deployment**: Deploy each app separately
5. **Better Testing**: Test each app in isolation
6. **Team Collaboration**: Teams can work on different apps simultaneously
7. **Professional Architecture**: Industry-standard monorepo structure

---

**Ready to roll! 🚗💨**

Start with:
```bash
npm install
npm run dev:customer
```

Then open http://localhost:8080 in your browser!
