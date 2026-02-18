# 📱 TORC Mobile App - Setup Guide

## ✅ What's Been Built

### 1. **Core Infrastructure**
- ✅ Supabase client (`lib/supabase.ts`)
- ✅ AuthContext with fixed profile fetching (`contexts/AuthContext.tsx`)
- ✅ JobContext with atomic RPCs (`contexts/JobContext.tsx`)
- ✅ Push notification utilities (`utils/pushNotifications.ts`)

### 2. **Screens Created**
- ✅ Auth screens: Login, Signup
- ✅ Provider screens: Job Request, Active Job
- ✅ Customer screens: Matching, Live Tracking

### 3. **Key Features Implemented**
- ✅ Race-safe job acceptance using `accept_job` RPC
- ✅ Atomic job cancellation using `cancel_job` RPC
- ✅ Real-time job updates via `subscribeToJobUpdates`
- ✅ Dynamic provider stats fetching
- ✅ Push notification registration and handling
- ✅ Deep linking for notification taps
- ✅ Provider arrival confirmation
- ✅ Job completion confirmation
- ✅ Customer rating system

---

## 🚀 Setup Instructions

### Step 1: Install Dependencies

```bash
cd apps/mobile
npm install @supabase/supabase-js expo-notifications expo-device expo-location react-native-maps
```

### Step 2: Configure App.json

Add Expo project ID to `app.json`:

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "YOUR_EAS_PROJECT_ID_HERE"
      },
      "supabaseUrl": "https://apojatplmfsbimgcyjoo.supabase.co",
      "supabaseAnonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
}
```

Get your EAS project ID:
```bash
npx eas init
```

### Step 3: Configure Google Maps (React Native Maps)

**For iOS:**
Add to `app.json`:
```json
{
  "ios": {
    "config": {
      "googleMapsApiKey": "YOUR_IOS_GOOGLE_MAPS_API_KEY"
    }
  }
}
```

**For Android:**
Add to `app.json`:
```json
{
  "android": {
    "config": {
      "googleMaps": {
        "apiKey": "YOUR_ANDROID_GOOGLE_MAPS_API_KEY"
      }
    }
  }
}
```

### Step 4: Test on Device

**iOS:**
```bash
npm run ios
```

**Android:**
```bash
npm run android
```

**Expo Go (Quick Test):**
```bash
npm start
```
Then scan QR code with Expo Go app

---

## 📋 Testing Checklist

### Provider Flow
1. ✅ Sign up as provider
2. ✅ Receive push notification for new job
3. ✅ Accept job (race-safe)
4. ✅ View active job details
5. ✅ Start job
6. ✅ Complete job

### Customer Flow
1. ✅ Sign up as customer
2. ✅ Create job request
3. ✅ See "Finding Provider..." screen
4. ✅ Get notified when provider accepts
5. ✅ Track provider in real-time
6. ✅ Confirm provider arrival
7. ✅ Confirm job completion
8. ✅ Rate provider

### Push Notifications
1. ✅ Token registers on login
2. ✅ Notifications arrive when app is backgrounded
3. ✅ Tapping notification opens correct screen
4. ✅ Token unregisters on logout

---

## 🔧 Integration with Backend

### Required Database Migrations
All migrations in `database/migrations/` must be run:
- ✅ `001_job_events_table.sql`
- ✅ `002_accept_job_rpc.sql`
- ✅ `003_cancel_job_rpc.sql`
- ✅ `004_device_tokens_table.sql`
- ✅ `005_push_notifications_log.sql`
- ✅ `006_add_cancelled_by.sql`

### Push Notification Worker
The worker in `workers/push-notification-worker.js` must be running:

```bash
cd workers
npm install
node push-notification-worker.js
```

This listens to PostgreSQL `NOTIFY` events and sends push notifications.

---

## 🎯 Next Steps

### 1. **Update Home Screens**
Modify `app/(tabs)/index.tsx` to show:
- For customers: "Request Service" button
- For providers: "Go Online" toggle + incoming jobs list

### 2. **Add Location Tracking**
Use `expo-location` to track provider's real-time location and update customer map.

### 3. **Add Chat/Messaging**
Implement in-app messaging between customer and provider.

### 4. **Add Payment Integration**
Integrate Stripe or Paystack for in-app payments.

### 5. **Add Job History**
Show past jobs for both customers and providers.

### 6. **Deploy Push Worker**
Deploy to Heroku, Railway, or Render for 24/7 push notification delivery.

---

## 🐛 Troubleshooting

### Push Notifications Not Working
1. Ensure worker is running: `node workers/push-notification-worker.js`
2. Check device token is registered in `device_tokens` table
3. Verify `pg_notify` events are firing (check worker logs)
4. Test on physical device (not simulator)

### Job Not Updating in Real-time
1. Check Supabase Realtime is enabled for `jobs` table
2. Verify `subscribeToJobUpdates` is being called
3. Check browser/app console for subscription errors

### Maps Not Showing
1. Verify Google Maps API keys are set in `app.json`
2. Ensure Maps API is enabled in Google Cloud Console
3. Check API key restrictions allow your app bundle ID

---

## 📚 Architecture Overview

```
Mobile App
├── lib/
│   └── supabase.ts          # Supabase client
├── contexts/
│   ├── AuthContext.tsx      # Authentication state
│   └── JobContext.tsx       # Job state + RPCs
├── utils/
│   └── pushNotifications.ts # Push setup & handling
└── app/
    ├── auth/                # Login, Signup
    ├── provider/            # Job Request, Active Job
    └── customer/            # Matching, Tracking
```

**Data Flow:**
1. Customer creates job → `pending` status
2. Provider accepts → `accept_job` RPC → `accepted` status + `pg_notify`
3. Worker receives notify → sends push to customer
4. Customer app navigates to tracking screen
5. Real-time updates keep both apps in sync

---

## 🎉 All Set!

Your mobile foundation is ready! Test the flow end-to-end and iterate from there.

**Questions?** Check the web app implementations in:
- `apps/customer-web/src/context/JobContext.jsx`
- `apps/provider-web/src/context/JobContext.jsx`

They use the same RPCs and patterns! 🚀
