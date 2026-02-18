# Integration Guide: Server RPCs → Mobile Push

This guide shows you how to integrate the server RPCs into your full Torc project and then add mobile push notifications.

---

## ✅ Step 1: Run the Migrations (Done First)

You now have atomic, race-safe job acceptance and cancellation.

**What to do:**
1. Go to your **Supabase project** → SQL Editor
2. Copy/paste and run each migration **in order**:
   - `database/migrations/001_job_events_table.sql`
   - `database/migrations/002_accept_job_rpc.sql`
   - `database/migrations/003_cancel_job_rpc.sql`

3. **Test it:**
   ```bash
   cd scripts
   npm install
   cp .env.example .env
   # Edit .env with your Supabase URL, service key, and test user IDs
   npm run test:race
   ```

   You should see:
   - Two providers race to accept a job
   - One wins, one gets `JOB_ALREADY_ACCEPTED`
   - Cancellation tests pass
   - `job_events` log shows all state changes

**Files to move to your full repo:**
- `database/` → put in your monorepo root or inside a `packages/database/` folder
- `scripts/` → put in your monorepo root or `packages/api/scripts/`

---

## 🔔 Step 2: Push Notifications (Next Priority)

Now that you have reliable `pg_notify` events when jobs are accepted/cancelled, you need:

### 2.1 Device Token Storage

Create a table to store push tokens from mobile devices:

```sql
-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'ios' or 'android'
  push_token TEXT NOT NULL, -- Expo push token or FCM token
  device_id TEXT, -- optional device identifier
  app_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, push_token)
);

CREATE INDEX idx_device_tokens_user_id ON public.device_tokens(user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Users can insert/update their own tokens
CREATE POLICY "Users can manage own tokens"
  ON public.device_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 2.2 Mobile App: Register Push Tokens

In your **Expo mobile apps** (customer and provider):

```js
// utils/pushNotifications.js
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications() {
  // Request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.warn('Push permission denied');
    return null;
  }

  // Get Expo push token
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  
  // Save to database
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  await supabase.from('device_tokens').upsert({
    user_id: user.id,
    platform: Platform.OS,
    push_token: token,
    app_version: '1.0.0', // from app.json
  }, {
    onConflict: 'user_id,push_token'
  });

  return token;
}

// Handle incoming notifications (foreground and background)
export function setupNotificationListeners(navigation) {
  // Foreground notifications
  Notifications.addNotificationReceivedListener(notification => {
    console.log('Received notification:', notification);
  });

  // User tapped notification (deep link to right screen)
  Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    
    if (data.screen === 'JobRequest' && data.jobId) {
      navigation.navigate('JobRequest', { jobId: data.jobId });
    } else if (data.screen === 'LiveTracking' && data.jobId) {
      navigation.navigate('LiveTracking', { jobId: data.jobId });
    }
  });
}
```

**In your app entry (App.js or similar):**
```js
import { registerForPushNotifications, setupNotificationListeners } from './utils/pushNotifications';

function App() {
  const navigationRef = useRef(null);

  useEffect(() => {
    // Register on login
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        registerForPushNotifications();
      }
    });

    // Set up listeners
    setupNotificationListeners(navigationRef.current);

    return () => authListener?.subscription?.unsubscribe();
  }, []);

  // ... rest of your app
}
```

### 2.3 Server: Push Notification Worker

Create a Node.js worker or Supabase Edge Function that listens to `pg_notify` and sends pushes.

**Option A: Node.js Worker (Recommended for flexibility)**

```js
// workers/push-notification-worker.js
const { Client } = require('pg');
const { Expo } = require('expo-server-sdk');
const { createClient } = require('@supabase/supabase-js');

const expo = new Expo();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const pgClient = new Client({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();

  // Listen to job events
  await pgClient.query('LISTEN job_accepted');
  await pgClient.query('LISTEN job_cancelled');

  console.log('🎧 Listening for job events...');

  pgClient.on('notification', async (msg) => {
    const data = JSON.parse(msg.payload);
    console.log(`📬 Received ${msg.channel}:`, data);

    if (msg.channel === 'job_accepted') {
      // Notify customer: "Provider X accepted your request!"
      await sendPushToUser(data.customer_id, {
        title: 'Provider Found!',
        body: 'A provider has accepted your request and is on the way.',
        data: { screen: 'LiveTracking', jobId: data.job_id }
      });
    }

    if (msg.channel === 'job_cancelled') {
      // Notify the other party
      const recipientId = data.actor_type === 'customer' ? data.provider_id : data.customer_id;
      if (recipientId) {
        await sendPushToUser(recipientId, {
          title: 'Job Cancelled',
          body: `The job has been cancelled. Reason: ${data.reason || 'None'}`,
          data: { screen: 'Home' }
        });
      }
    }
  });
}

async function sendPushToUser(userId, { title, body, data }) {
  // Get user's push tokens
  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('push_token')
    .eq('user_id', userId);

  if (error || !tokens.length) {
    console.warn(`No push tokens for user ${userId}`);
    return;
  }

  // Build Expo push messages
  const messages = tokens
    .filter(t => Expo.isExpoPushToken(t.push_token))
    .map(t => ({
      to: t.push_token,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high',
    }));

  // Send in chunks
  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      console.log('📤 Sent push tickets:', tickets);
    } catch (err) {
      console.error('❌ Push send error:', err);
    }
  }
}

main().catch(console.error);
```

**Deploy options:**
- Heroku/Railway/Render worker dyno
- AWS ECS/Fargate
- Docker container on any VPS
- Supabase Edge Function (with custom Postgres client)

**Option B: Supabase Edge Function + Database Webhooks**

1. Create Edge Function:
```bash
supabase functions new send-push-notification
```

2. In `supabase/functions/send-push-notification/index.ts`:
```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const { type, record } = await req.json();
  
  // Called when a row is inserted into job_events
  if (type === 'INSERT' && record.event_type === 'job_accepted') {
    // Fetch job details, get customer push tokens, send push
    // ...
  }

  return new Response('ok');
});
```

3. Set up Database Webhook in Supabase Dashboard → Database → Webhooks:
   - Table: `job_events`
   - Events: `INSERT`
   - Type: Edge Function
   - Function: `send-push-notification`

---

## 🎯 Step 3: Update Mobile App UX

### Provider App (when a new job comes in)
1. **Push arrives:** "New Request: Customer needs a tow at [location]"
2. **Play distinctive sound** (custom sound in `android/app/src/main/res/raw/` and iOS `Assets`)
3. **Vibrate**
4. **Tap → deep link to JobRequest screen** with job details pre-loaded

### Provider App (call accept_job RPC)
```js
// In JobRequest screen when provider taps "Accept"
async function handleAccept() {
  const { data, error } = await supabase.rpc('accept_job', {
    p_job_id: jobId,
    p_provider_id: currentUser.id
  });

  if (data.success) {
    // Navigate to active job / en route screen
    navigation.replace('ActiveJob', { jobId });
  } else if (data.error === 'JOB_ALREADY_ACCEPTED') {
    Alert.alert('Job Taken', 'Another provider accepted this job first.');
    navigation.goBack();
  } else {
    Alert.alert('Error', data.message);
  }
}
```

### Customer App (waiting for provider)
- Show "Finding provider..." with loading indicator
- Subscribe to `job_events` or job row updates
- When `status` changes to `accepted`, show provider details and map

---

## 📋 Summary & Checklist

### ✅ What you have now (after Step 1)
- [x] Atomic `accept_job(job_id, provider_id)` RPC
- [x] Atomic `cancel_job(job_id, actor_id, actor_type, reason)` RPC
- [x] `job_events` immutable log
- [x] `pg_notify` events when jobs are accepted/cancelled
- [x] Test script to verify race conditions are handled

### 🚧 What to do next (Step 2 & 3)
- [ ] Run migrations in your Supabase project
- [ ] Run test script to verify
- [ ] Create `device_tokens` table
- [ ] Add push token registration to mobile apps
- [ ] Deploy push notification worker (Node.js or Edge Function)
- [ ] Test push flow end-to-end on real device
- [ ] Add deep links for "tap notification → open screen"
- [ ] Add custom sounds for provider "ring"

### 🎉 End State
- Provider opens app → registers push token
- Customer creates job → broadcasts to all providers
- Multiple providers see push at same time → tap → see job details
- Provider A and B both tap "Accept" → **only one wins** (RPC handles race)
- Winner gets job, loser sees "Job Taken"
- Customer gets push "Provider found!" with ETA
- Either party can cancel → other party gets push notification
- All events logged in `job_events` for audit/debugging

---

## 🔗 Next Docs to Create

After you've integrated the RPCs and tested them, I can create:

1. **Mobile Push Integration Guide** – Full Expo setup, token management, deep links, custom sounds
2. **Push Worker Deployment Guide** – How to deploy the Node.js worker on Heroku/Railway/Docker
3. **E2E Test Suite** – Automated tests for the full flow (Playwright + device emulation)
4. **Production Checklist** – Monitoring, logging, error handling, rate limits, retry logic

Let me know when you've run the migrations and I'll create the next piece!
