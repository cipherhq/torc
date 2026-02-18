# 📱 TORC Mobile App

**Your Roadside Companion - iOS & Android**

## 🎉 Status: Foundation Complete!

The mobile app foundation is fully built and ready for development. All core systems are in place:

✅ Authentication (login, signup, session management)  
✅ Job management with atomic RPCs (race-safe)  
✅ Push notifications (end-to-end)  
✅ Real-time updates  
✅ Provider & customer screens  
✅ Deep linking  

---

## 🚀 Quick Start

### Option 1: Run Quick Start Script
```bash
./quickstart.sh
```

### Option 2: Manual Start
```bash
# Install dependencies
npm install

# Start on iOS
npm run ios

# Start on Android
npm run android

# Start with Expo Go (scan QR code)
npm start
```

---

## 📁 Project Structure

```
apps/mobile/
├── lib/
│   └── supabase.ts                 # Supabase client
│
├── contexts/
│   ├── AuthContext.tsx             # Authentication state & methods
│   └── JobContext.tsx              # Job state & atomic RPCs
│
├── utils/
│   └── pushNotifications.ts        # Push notification system
│
├── app/
│   ├── _layout.tsx                 # Root layout with providers
│   ├── (tabs)/
│   │   └── index.tsx               # Home screen (role-based)
│   ├── auth/
│   │   ├── login.tsx               # Login screen
│   │   └── signup.tsx              # Signup screen
│   ├── provider/
│   │   ├── job-request.tsx         # Accept/decline job
│   │   └── active-job.tsx          # Manage active job
│   └── customer/
│       ├── matching.tsx            # "Finding Provider..." screen
│       └── tracking.tsx            # Live tracking screen
│
├── MOBILE_SETUP_GUIDE.md           # Detailed setup instructions
├── MOBILE_FOUNDATION_COMPLETE.md   # What's been built
├── quickstart.sh                   # Quick start script
└── package.json
```

---

## 🔑 Key Features

### 1. Race-Safe Job Acceptance
Uses `accept_job` RPC with PostgreSQL row-level locking - only ONE provider can accept a job.

```typescript
await acceptJob(jobId, providerId);
// ✅ First provider: Success
// ❌ Second provider: "Job already accepted"
```

### 2. Atomic Job Cancellation
Uses `cancel_job` RPC with authorization checks - only job participants can cancel.

```typescript
await cancelJob(jobId, 'Customer changed mind');
// ✅ Authorized: Success + notify other party
// ❌ Unauthorized: Error
```

### 3. Real-Time Updates
Subscribes to PostgreSQL changes for instant UI updates.

```typescript
const unsubscribe = subscribeToJobUpdates(jobId, () => {
  console.log('Job updated!');
});
```

### 4. Push Notifications
Full push notification system with deep linking.

```typescript
// On login
const token = await registerForPushNotifications();

// Notifications arrive even when app is backgrounded
// Tapping opens the correct screen
```

---

## 🛠️ Configuration

### 1. Install Required Dependencies
```bash
npm install @supabase/supabase-js expo-notifications expo-device expo-location react-native-maps
```

### 2. Get EAS Project ID
```bash
npx eas init
```

### 3. Update `app.json`
```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "YOUR_EAS_PROJECT_ID_HERE"
      },
      "supabaseUrl": "https://apojatplmfsbimgcyjoo.supabase.co",
      "supabaseAnonKey": "YOUR_ANON_KEY_HERE"
    },
    "ios": {
      "config": {
        "googleMapsApiKey": "YOUR_IOS_MAPS_API_KEY"
      }
    },
    "android": {
      "config": {
        "googleMaps": {
          "apiKey": "YOUR_ANDROID_MAPS_API_KEY"
        }
      }
    }
  }
}
```

### 4. Run Database Migrations
See `../../database/README.md` for migration instructions.

### 5. Start Push Notification Worker
```bash
cd ../../workers
npm install
node push-notification-worker.js
```

---

## 📱 Testing

### Test Customer Flow
1. Sign up as customer
2. Create job request (coming soon - needs UI)
3. See "Finding Provider..." screen
4. Provider accepts → navigate to tracking
5. Confirm arrival → confirm completion → rate provider

### Test Provider Flow
1. Sign up as provider
2. Receive push notification for new job
3. Accept job (race-safe)
4. View active job details
5. Start job → complete job

---

## 🎯 Next Features to Build

### Phase 1: Service Booking
- [ ] Service catalog UI
- [ ] Vehicle selection
- [ ] Location picker (map)
- [ ] Price estimation
- [ ] Create job flow

### Phase 2: Live Tracking
- [ ] Track provider's real-time location
- [ ] Show on customer's map
- [ ] ETA calculation

### Phase 3: Enhanced Features
- [ ] In-app messaging
- [ ] Payment integration (Stripe/Paystack)
- [ ] Job history UI
- [ ] Earnings dashboard (providers)
- [ ] Profile editing

---

## 📚 Documentation

- **`MOBILE_SETUP_GUIDE.md`** - Complete setup instructions
- **`MOBILE_FOUNDATION_COMPLETE.md`** - What's been built
- **`../../database/README.md`** - Database migration guide
- **`../../workers/README.md`** - Push worker deployment guide
- **`../../DEPLOYMENT_CHECKLIST.md`** - Production deployment

---

## 🐛 Troubleshooting

### Push Notifications Not Working
1. Ensure worker is running
2. Check device token in `device_tokens` table
3. Test on physical device (not simulator)

### Real-Time Updates Not Working
1. Check Supabase Realtime is enabled
2. Verify subscription is active
3. Check console for errors

### Maps Not Showing
1. Verify API keys in `app.json`
2. Enable Maps API in Google Cloud Console
3. Check bundle ID restrictions

---

## 🚀 Deploy to Production

### Build for iOS
```bash
eas build --platform ios
```

### Build for Android
```bash
eas build --platform android
```

### Submit to App Stores
```bash
eas submit --platform ios
eas submit --platform android
```

---

## 💡 Tech Stack

- **Expo** - React Native framework
- **TypeScript** - Type safety
- **Supabase** - Backend (auth, database, realtime)
- **PostgreSQL** - Database with RPCs
- **Expo Push Notifications** - Mobile notifications
- **React Native Maps** - Map integration
- **Expo Location** - GPS tracking
- **Expo Router** - File-based routing

---

## 🎉 You're All Set!

The mobile foundation is complete and ready to build on. Focus on:
1. Service booking UI
2. Live provider tracking
3. Payment integration

**Happy coding!** 🚀
