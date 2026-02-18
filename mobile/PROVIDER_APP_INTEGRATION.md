# Provider App: Push Notification Integration

How to integrate push notifications into the **Provider mobile app** so drivers get "ringed" when new jobs arrive.

---

## 🎯 Provider-Specific Flow

1. **Provider opens app** → registers push token
2. **Customer creates job** → broadcast to all nearby providers (or matching logic)
3. **Push arrives on provider's phone** → "New Request: Customer needs a tow at [location]"
4. **Provider taps notification** → app opens to JobRequest screen with job details
5. **Provider taps "Accept"** → calls `accept_job` RPC
6. **If first to accept** → navigates to ActiveJob screen
7. **If too slow** → sees "Job Taken" alert (another provider was faster)

---

## 📱 Implementation

### 1. Broadcasting New Jobs to Providers

When a customer creates a job, broadcast it to all eligible providers.

**Option A: Server-side (recommended)**

Add to your API or Edge Function that handles job creation:

```js
// After job is created in database
const job = await createJobInDB(jobData);

// Get eligible providers (nearby, available, etc.)
const eligibleProviders = await getEligibleProviders(job);

// Get push tokens for those providers
const { data: tokens } = await supabase
  .from('device_tokens')
  .select('push_token, user_id')
  .in('user_id', eligibleProviders.map(p => p.id))
  .eq('is_active', true)
  .eq('platform', ['ios', 'android']); // Exclude web

// Send push to each provider
for (const token of tokens) {
  await sendExpoPush({
    to: token.push_token,
    title: '🚗 New Request Nearby',
    body: `Customer needs ${job.service.name} at ${job.pickup_address}`,
    data: {
      screen: 'JobRequest',
      jobId: job.id,
      notificationType: 'new_job_request',
    },
    sound: 'new-request.wav',
    priority: 'high',
    badge: 1,
  });
}
```

**Option B: pg_notify on job INSERT**

Add a trigger on `jobs` table:

```sql
CREATE OR REPLACE FUNCTION notify_new_job()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM pg_notify('new_job_created', row_to_json(NEW)::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_job_created
  AFTER INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_job();
```

Then in your push worker, listen for `new_job_created`:

```js
await pgClient.query('LISTEN new_job_created');

pgClient.on('notification', async (msg) => {
  if (msg.channel === 'new_job_created') {
    const job = JSON.parse(msg.payload);
    await broadcastJobToProviders(job);
  }
});
```

### 2. JobRequest Screen

When provider taps "Accept":

```js
// screens/JobRequestScreen.js
import { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../utils/supabaseClient';

export default function JobRequestScreen({ route, navigation }) {
  const { jobId } = route.params;
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (jobId) loadJob(jobId);
  }, [jobId]);

  async function loadJob(id) {
    const { data } = await supabase
      .from('jobs')
      .select('*, service:services(*)')
      .eq('id', id)
      .single();
    setJob(data);
  }

  async function handleAccept() {
    if (loading) return;
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.rpc('accept_job', {
        p_job_id: jobId,
        p_provider_id: user.id
      });

      if (error) throw error;

      if (data.success) {
        // Success! Navigate to active job
        navigation.replace('ActiveJob', { jobId });
      } else if (data.error === 'JOB_ALREADY_ACCEPTED') {
        // Too slow
        Alert.alert(
          'Job Taken',
          'Another provider accepted this first.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Error', data.message || 'Could not accept job');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!job) return <Text>Loading...</Text>;

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 10 }}>
        New Request
      </Text>
      <Text style={{ fontSize: 18, marginBottom: 5 }}>
        Service: {job.service?.name}
      </Text>
      <Text style={{ color: '#666', marginBottom: 20 }}>
        Pickup: {job.pickup_address}
      </Text>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 20 }}>
        ${job.total_amount}
      </Text>

      <TouchableOpacity
        onPress={handleAccept}
        disabled={loading}
        style={{
          backgroundColor: '#2EFFAF',
          padding: 16,
          borderRadius: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#000', fontSize: 16, fontWeight: '600' }}>
          {loading ? 'Accepting...' : 'Accept Job'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={{
          marginTop: 10,
          padding: 16,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#666' }}>Decline</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### 3. Background Notification Handling

For the "ring" to work when app is killed/backgrounded:

**iOS:** Just works with `UIBackgroundModes: ["remote-notification"]` in `app.json`

**Android:** Add to `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.VIBRATE" />
```

And configure notification channel with sound:

```js
// In App.js or index.js (Android)
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'new-request.wav',
    lightColor: '#2EFFAF',
  });

  // High-priority channel for new job requests
  Notifications.setNotificationChannelAsync('new-request', {
    name: 'New Requests',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500],
    sound: 'new-request.wav',
    lightColor: '#FF0000',
    enableVibrate: true,
    enableLights: true,
  });
}
```

Then in push worker, send with channel:
```js
{
  to: token,
  title: 'New Request',
  body: '...',
  sound: 'new-request.wav',
  channelId: 'new-request',  // Android uses this channel
  priority: 'high',
}
```

---

## 🎵 Custom Vibration Pattern (Android)

For new job requests, use a distinctive vibration:

```js
vibrationPattern: [
  0,    // Delay
  500,  // Vibrate 500ms
  200,  // Pause 200ms
  500,  // Vibrate 500ms
  200,  // Pause 200ms
  500,  // Vibrate 500ms (total: 3 bursts)
]
```

This makes the "ring" more noticeable on silent devices.

---

## 🔒 Provider Availability Status

Consider adding a "Going Online / Going Offline" toggle so providers can control when they receive notifications:

```js
// Toggle provider availability
async function setProviderAvailability(isAvailable) {
  const { data: { user } } = await supabase.auth.getUser();
  
  await supabase
    .from('provider_profiles')
    .update({ is_available: isAvailable, last_seen_at: new Date().toISOString() })
    .eq('id', user.id);

  // Also update push token status if going offline
  if (!isAvailable) {
    await supabase
      .from('device_tokens')
      .update({ is_active: false })
      .eq('user_id', user.id);
  } else {
    // Re-register token when going online
    await registerForPushNotifications();
  }
}
```

Then when broadcasting jobs, only send to providers where `is_available = true`.

---

## 🧪 Testing on Real Device

### iOS
1. Build: `npx expo run:ios --device`
2. Select your connected iPhone
3. Log in to provider app
4. Keep app in background or lock screen
5. Create a test job from customer app (or use test script)
6. Push should arrive within 1-2 seconds
7. Tap notification → should open to JobRequest screen

### Android
1. Build: `npx expo run:android --device`
2. Connect Android device via USB (enable USB debugging)
3. Same flow as iOS

### Checklist
- [ ] Notification appears on lock screen
- [ ] Custom sound plays ("new-request.wav")
- [ ] Device vibrates (Android)
- [ ] Badge appears (iOS)
- [ ] Tapping opens app to JobRequest screen
- [ ] Job details are visible (pickup address, service, amount)
- [ ] "Accept" button works and calls `accept_job` RPC
- [ ] If another provider accepts first, current provider sees "Job Taken"

---

## ⚡ Performance Tips

### Reduce latency
- **Use indexes:** Ensure `device_tokens` has index on `(user_id, is_active)`
- **Batch pushes:** Worker already chunks them (Expo limit: ~600/sec)
- **Parallel sends:** For multiple providers, send in parallel

### Handle high volume
- **Multiple workers:** Run 2-3 instances listening to same channels (Postgres broadcasts to all)
- **Queue:** Use Bull/BullMQ if you have 1000s of jobs/hour
- **Rate limits:** Expo has per-app limits; for very high volume, use FCM directly

---

## 🚨 Critical: Test Race Conditions

**Scenario:** 5 providers get push at same time, all tap "Accept" within 1 second.

**Expected behavior:**
- Only 1 provider gets the job
- Other 4 get "Job Taken" alert
- No duplicate assignments

**How to test:**
1. Run the race test script: `cd scripts && npm run test:race`
2. Or manually: have 2-3 devices ready, send same job to all, tap Accept on all at once

The `accept_job` RPC uses `FOR UPDATE` lock so it's safe.

---

## 📚 Next Steps

After push notifications work:

1. **Add location tracking** so customer sees provider's real-time location on map
2. **Add in-app messaging** so provider/customer can chat
3. **Add push for provider location updates** (e.g. "Provider is 2 min away")
4. **Monitor push delivery rates** in `push_notifications` table
5. **Set up alerts** if delivery rate drops below 90%

See `../workers/README.md` for worker deployment and monitoring.
