# Mobile App Push Notification Setup

Complete guide for integrating push notifications into your Expo/React Native mobile apps (Provider and Customer).

---

## 📦 Step 1: Install Dependencies

```bash
cd mobile/provider-app  # or mobile/customer-app
npx expo install expo-notifications expo-device expo-constants
```

If using bare React Native (not Expo managed):
```bash
npm install expo-notifications expo-device expo-constants
npm install react-native-push-notification @react-native-firebase/messaging
```

---

## 🔔 Step 2: Configure app.json

Add notification configuration to your `app.json`:

```json
{
  "expo": {
    "notification": {
      "icon": "./assets/notification-icon.png",
      "color": "#2EFFAF",
      "androidMode": "default",
      "androidCollapsedTitle": "New request"
    },
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["remote-notification"]
      }
    },
    "android": {
      "permissions": [
        "POST_NOTIFICATIONS"
      ],
      "googleServicesFile": "./google-services.json"
    },
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#2EFFAF",
          "sounds": [
            "./assets/sounds/new-request.wav",
            "./assets/sounds/accepted.wav",
            "./assets/sounds/cancelled.wav"
          ]
        }
      ]
    ]
  }
}
```

---

## 🎵 Step 3: Add Custom Sounds

For the provider "ring" effect when a new job comes in.

### iOS
1. Create `assets/sounds/new-request.wav` (or `.caf`, `.m4a`)
2. Keep file under 30 seconds
3. Expo will bundle it automatically

### Android
1. Create `assets/sounds/new-request.wav`
2. For bare React Native: also put in `android/app/src/main/res/raw/new_request.wav`

### Sound files you should create:
- **`new-request.wav`** – Distinctive "ring" when provider gets a new job (provider app only)
- **`accepted.wav`** – Pleasant chime when customer's request is accepted
- **`cancelled.wav`** – Neutral sound when job is cancelled
- **`completed.wav`** – Success sound when job is done

**Tips:**
- Use short, pleasant sounds (1-3 seconds)
- Test on real devices (simulators don't play notification sounds)
- iOS: sound plays even when device is on silent IF user granted notification permission
- Android: sound honors device volume settings

---

## 📱 Step 4: Add Push Registration to Your App

### In `utils/supabaseClient.js` (or similar)
```js
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);
```

### In `App.js` (Root component)
```js
import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from './utils/supabaseClient';
import {
  registerForPushNotifications,
  setupNotificationListeners,
  unregisterPushToken,
} from './utils/pushNotifications';

// Your screens
import HomeScreen from './screens/HomeScreen';
import JobRequestScreen from './screens/JobRequestScreen';
import LiveTrackingScreen from './screens/LiveTrackingScreen';
import ActiveJobScreen from './screens/ActiveJobScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const navigationRef = useRef(null);
  const pushTokenRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Set up auth listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth event:', event);

        if (event === 'SIGNED_IN' && session?.user) {
          // Register for push on login
          const token = await registerForPushNotifications();
          pushTokenRef.current = token;
        }

        if (event === 'SIGNED_OUT') {
          // Unregister on logout
          if (pushTokenRef.current) {
            await unregisterPushToken(pushTokenRef.current);
            pushTokenRef.current = null;
          }
        }
      }
    );

    // Set up notification listeners (deep links)
    const removeNotificationListeners = setupNotificationListeners(
      navigationRef.current
    );

    // If user is already logged in, register push token
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        registerForPushNotifications().then((token) => {
          pushTokenRef.current = token;
        });
      }
      setIsReady(true);
    });

    // Cleanup
    return () => {
      authListener?.subscription?.unsubscribe();
      removeNotificationListeners();
    };
  }, []);

  if (!isReady) {
    // Optional: show splash screen
    return null;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="JobRequest" component={JobRequestScreen} />
        <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} />
        <Stack.Screen name="ActiveJob" component={ActiveJobScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

---

## 🎯 Step 5: Handle Notifications in Screens

### Provider App: JobRequestScreen

When provider taps "Accept", call the `accept_job` RPC:

```js
import { Alert } from 'react-native';
import { supabase } from '../utils/supabaseClient';

async function handleAcceptJob(jobId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase.rpc('accept_job', {
      p_job_id: jobId,
      p_provider_id: user.id
    });

    if (error) throw error;

    if (data.success) {
      // Navigate to active job screen
      navigation.replace('ActiveJob', { jobId });
      Alert.alert('Success!', 'You accepted the job.');
    } else if (data.error === 'JOB_ALREADY_ACCEPTED') {
      // Another provider was faster
      Alert.alert(
        'Job Taken',
        'Another provider accepted this job first. Better luck next time!',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } else {
      // Other error
      Alert.alert('Error', data.message || 'Could not accept job');
    }
  } catch (error) {
    console.error('Error accepting job:', error);
    Alert.alert('Error', 'Something went wrong. Please try again.');
  }
}
```

### Customer App: LiveTrackingScreen

Subscribe to job updates so the UI updates when provider accepts:

```js
import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';

function LiveTrackingScreen({ route }) {
  const { jobId } = route.params;
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!jobId) return;

    // Initial fetch
    fetchJob(jobId).then(() => setLoading(false));

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`job-updates-${jobId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` },
        () => {
          fetchJob(jobId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId]);

  async function fetchJob(id) {
    const { data, error } = await supabase
      .from('jobs')
      .select('*, service:services(*), provider:profiles(*)')
      .eq('id', id)
      .single();

    if (!error && data) setJob(data);
  }

  if (loading) return <Text>Loading...</Text>;

  // Show "Finding provider" until provider_id is set
  if (!job?.provider_id && job?.status === 'pending') {
    return <FindingProviderView job={job} />;
  }

  // Show live tracking with provider info
  return <TrackingView job={job} />;
}
```

---

## 🔊 Step 6: Test Notifications

### On real device (required):

1. **Build and install the app:**
   ```bash
   # Development build (includes dev tools)
   npx expo run:ios
   # or
   npx expo run:android
   ```

2. **Log in to the app** → push token should register automatically

3. **Check database:**
   ```sql
   SELECT * FROM device_tokens WHERE user_id = 'your-user-id';
   ```
   You should see a row with `push_token` starting with `ExponentPushToken[...]`

4. **Trigger a notification:**
   - Create a test job and accept it (using the test script)
   - Or manually trigger `pg_notify` in Supabase SQL Editor:
     ```sql
     SELECT pg_notify('job_accepted', '{"job_id":"test-123","provider_id":"provider-456","customer_id":"customer-789"}');
     ```

5. **Push should arrive** on your device within ~1-2 seconds

### What to verify:
- ✅ Notification appears on lock screen
- ✅ Sound plays (if device not on silent)
- ✅ Tapping notification opens the app and navigates to correct screen
- ✅ Database log shows `status = 'sent'` in `push_notifications` table

---

## 🐛 Troubleshooting

### "Notifications don't appear"
- **Check permissions:** Settings → [Your App] → Notifications → Allow Notifications
- **Check worker logs:** Is the push actually being sent?
- **Check token:** `SELECT * FROM device_tokens WHERE user_id = '...'` – is there a token?
- **Test with Expo Push Tool:** https://expo.dev/notifications (paste your token, send test)

### "Sound doesn't play"
- iOS: Check device is not on silent (push sounds play regardless, but test volume)
- Android: Check notification channel sound settings
- Verify sound file exists in `assets/sounds/` and is referenced in `app.json`

### "Deep link doesn't work"
- Check `setupNotificationListeners()` is called in App.js
- Verify screen names match your navigation stack (case-sensitive)
- Console.log the `data` in `handleDeepLink()` to see what's being passed

### "Token not saving to database"
- Check RLS policies on `device_tokens` (user should be able to INSERT own tokens)
- Verify `upsert_device_token` RPC exists and is granted to `authenticated` role
- Check console for errors in `registerForPushNotifications()`

---

## 📚 Additional Resources

- [Expo Notifications Docs](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Expo Push API](https://docs.expo.dev/push-notifications/overview/)
- [Testing Push on Device](https://docs.expo.dev/push-notifications/testing/)
- [Notification Sounds](https://docs.expo.dev/versions/latest/sdk/notifications/#notificationcontentinput)

---

## ✅ Checklist

- [ ] Install `expo-notifications`, `expo-device`, `expo-constants`
- [ ] Add notification config to `app.json`
- [ ] Copy `utils/pushNotifications.js` to your mobile app
- [ ] Integrate into `App.js` (register on login, set up listeners)
- [ ] Add custom sound files to `assets/sounds/`
- [ ] Test on a real device (iOS or Android)
- [ ] Verify token appears in `device_tokens` table
- [ ] Trigger test notification and verify it arrives
- [ ] Test deep linking (tap notification → opens correct screen)
- [ ] Deploy push worker (see `workers/README.md`)

Once this is done, your mobile apps will have production-ready push notifications with:
- Distinctive "ring" for provider when new job arrives
- Automatic delivery tracking and error handling
- Deep links to the right screen
- Reliable atomic job acceptance (no race conditions)
