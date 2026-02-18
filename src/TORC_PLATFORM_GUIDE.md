# TORC Platform - Complete Ecosystem

## Overview
TORC is a premium roadside assistance platform combining Uber's speed with AAA's reliability, featuring a "Liquid Precision" design language with Cyber-Mint (#2EFFAF) and Deep Cobalt (#007AFF) on lighter dark backgrounds (#1A1F2E).

## Platform Structure

### 1. **Customer Mobile App** (`/home` and related routes)
**Flow:** Auth → Request Service → Live Tracking → Completion → Activity Management

**Key Screens:**
- **Auth Flow:** Splash → App Selector → Role Selection → Login → Permissions
- **Request Flow:** 
  - Home Map (main screen)
  - Who Needs Help (self/family)
  - Location Confirmation (with hazard warnings)
  - Service Selection (12 services)
  - Service Details (vehicle info, notes)
  - Schedule Service (now/later)
  - Pricing & Payment
  - Matching (finding provider)
- **Live Tracking:** Provider card, ETA, arrival confirmation
- **Completion:** Photos, receipt, tip, rating
- **Activity:** Upcoming/Past/Family tabs
- **Wallet:** Payment methods, credits
- **Profile:** Settings, family management
- **Explore:** AAA-like nearby shops/gas stations (map/list view)

### 2. **Provider Mobile App** (`/provider/*`)
**Flow:** Onboarding → Verification → Go Online → Accept Jobs → Complete → Earnings

**Key Screens:**
- **Onboarding:**
  - Account type (Individual/Company)
  - Services offered (12 toggles)
  - Document upload (license, registration, insurance, towing)
  - Payout setup (Stripe/PayPal)
  - Verification pending
- **Dispatch:**
  - Provider Home (online toggle, stats)
  - Job Request (accept/decline with timer)
  - Job Active (navigation, checklist, photos)
  - Job Complete (earnings, rate customer)
- **Earnings:** Balance, charts, job history, payout options
- **Profile:** Documents, ratings, settings

### 3. **Admin Web Dashboard** (`/admin/*`)
**Purpose:** Operations monitoring and management

**Key Sections:**
- **Dashboard:** Active jobs, online providers, revenue, alerts
- **Jobs Console:** Active jobs table, SLA timers, reassign/override
- **Providers:** Verification workflows, performance, payout queue
- **Payments:** Transaction ledger, refunds, exports
- **Directory:** Manage explore listings (shops/gas stations)

### 4. **Public Website** (`/website/*`)
**Purpose:** Marketing and information

**Pages:**
- **Home:** Hero, features, CTA
- **Services:** All 12 services with descriptions
- **Pricing:** Pay-per-use vs Family plan
- **Become a Provider:** Benefits, requirements, application
- **Help Center:** FAQs, search, support

## Design System

### Colors
```css
--mint-electric: #2EFFAF (primary actions)
--blue-cerulean: #007AFF (secondary actions)
--navy-elevated: #1A1F2E (main background)
--glass-bg: rgba(255, 255, 255, 0.08)
--glass-border: rgba(255, 255, 255, 0.15)
```

### Key Features
- **Glassmorphism:** All cards use backdrop-blur and semi-transparent backgrounds
- **32px Corner Radius:** Consistent throughout all components
- **Gradient Buttons:** Primary CTAs use mint-to-blue gradients
- **Motion Animations:** Smooth transitions using Motion (formerly Framer Motion)
- **Responsive:** Mobile-first for customer/provider, desktop for admin/website

## Navigation Map

```
/ (Splash) → /apps (App Selector)
├── Customer: /home → /service-selection → /tracking → /completion
├── Provider: /provider/home → /provider/request → /provider/job → /provider/complete
├── Admin: /admin → /admin/jobs | /admin/providers | /admin/payments
└── Website: /website → /website/services | /website/pricing | /website/become-provider
```

## State Machines

### Service Request Flow
```
Requested → Matched → Accepted → En-route → 
Arrived (provider) → Arrived confirmed (customer) → 
In progress → Proof uploaded → Completed → Rated/Tipped
```

### Provider Status
```
Offline → Online → Request received → Accepted → 
En-route → Arrived → Working → Photos → Completed → Rating
```

## Key Technologies
- **React Router** (v7) - Navigation
- **Motion** - Animations
- **Recharts** - Data visualization (admin/provider)
- **Lucide React** - Icons
- **Tailwind CSS v4** - Styling

## Quick Access URLs
- **App Selector**: `/apps` (start here!)
- **Customer App**: `/home`
- **Provider App**: `/provider/home` (now with bottom nav!)
- **Admin Dashboard**: `/admin`
- **Public Website**: `/website`

## Bottom Navigation
- **Customer App**: Home | Activity | Explore | Wallet | Profile
- **Provider App**: Home | Earnings | Profile