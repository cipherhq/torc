# 🚗 Customer App - Complete Build Plan

Building the complete Torc Customer App with all features and integrations.

## ✅ Completed

### 1. Core Infrastructure
- ✅ Auth Context (login, signup, session management)
- ✅ Location Context (GPS, geocoding, address lookup)
- ✅ Job Context (job state management)
- ✅ Protected Routes component
- ✅ Context providers integrated in main.jsx

### 2. Authentication Pages
- ✅ Splash screen with animations
- ✅ Login page with validation
- ✅ Signup page with validation
- ✅ Error handling and success states

## 🔄 In Progress

### 3. Home & Navigation
- Building HomeMap with real location
- Service selection interface
- Customer bottom navigation

### 4. Service Request Flow
- Who needs help selector
- Location confirmation with map
- Service details input
- Vehicle selection
- Hazard location toggle

### 5. Scheduling & Pricing
- Schedule service for now or later
- Date/time picker
- Dynamic pricing calculation
- Payment method selection

### 6. Matching & Tracking
- Provider matching animation
- Real-time provider location
- Live tracking map
- ETA calculation
- Provider details display

### 7. Service Completion
- Service summary
- Rating and review
- Receipt display
- Tip option

### 8. Activity & History
- Job list with filters
- Job detail view
- Timeline display
- Status tracking

### 9. Wallet & Payments
- Stripe integration
- Payment methods management
- Add/remove cards
- Transaction history
- Wallet balance

### 10. Profile & Settings
- User profile editing
- Vehicle management
- Notification preferences
- App settings
- Help center

### 11. Explore Feature
- Local shops/services
- Shop details
- Ratings and reviews
- Contact shop

### 12. Notifications
- Real-time notifications
- In-app notification center
- Push notification setup

## 📦 Dependencies to Install

```bash
cd apps/customer-web
npm install @stripe/stripe-js
npm install @googlemaps/js-api-loader
npm install date-fns
npm install react-datepicker
```

## 🎯 Features

### Core Features
1. **Authentication**
   - Email/password login
   - Phone number signup
   - Email verification
   - Password reset

2. **Location Services**
   - GPS location tracking
   - Address autocomplete
   - Location selection on map
   - Saved locations

3. **Service Requests**
   - 12 service types available
   - Request for self or others
   - Schedule for later
   - Add notes and photos

4. **Real-time Tracking**
   - Provider location updates
   - ETA calculation
   - Live chat (future)
   - Status notifications

5. **Payments**
   - Multiple payment methods
   - Stripe integration
   - Tipping
   - Transaction history

6. **User Management**
   - Profile editing
   - Vehicle management
   - Rating history
   - Preferences

## 🔐 Environment Variables Required

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GOOGLE_MAPS_API_KEY=your-maps-key
VITE_STRIPE_PUBLISHABLE_KEY=your-stripe-key
```

## 🎨 Design System

- **Colors**: Cyber-Mint (#2EFFAF), Deep Cobalt (#007AFF), Navy (#1A1F2E)
- **Corner Radius**: 32px
- **Glassmorphism**: glass, glass-bright, glass-light, glass-dark
- **Animations**: motion (Framer Motion)

## 📱 Screens

1. Auth Flow
   - Splash
   - Role Selection
   - Login
   - Signup
   - Permissions

2. Customer Flow
   - Home Map
   - Who Needs Help
   - Confirm Location
   - Service Selection
   - Service Details
   - Schedule Service
   - Pricing & Payment
   - Matching
   - Live Tracking
   - Service Completion
   - Activity
   - Job Detail
   - Wallet
   - Profile
   - Service History
   - Payment Methods
   - Notifications
   - Help Center
   - Explore
   - Shop Detail

## 🚀 Next Steps

1. Build remaining customer pages
2. Integrate Google Maps
3. Integrate Stripe payments
4. Add real-time subscriptions
5. Test complete flow
6. Add error boundaries
7. Add loading states
8. Optimize performance

---

**Status**: Building complete customer app with all features
**Progress**: 30% complete
