/**
 * Example App.js integration for push notifications
 * 
 * Copy the relevant parts into your actual App.js
 */

import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from './utils/supabaseClient';
import {
  registerForPushNotifications,
  setupNotificationListeners,
  unregisterPushToken,
} from './utils/pushNotifications';

const Stack = createNativeStackNavigator();

export default function App() {
  const navigationRef = useRef(null);
  const pushTokenRef = useRef(null);

  useEffect(() => {
    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          // User just logged in - register for push notifications
          const token = await registerForPushNotifications();
          pushTokenRef.current = token;
        }

        if (event === 'SIGNED_OUT') {
          // User logged out - unregister push token
          if (pushTokenRef.current) {
            await unregisterPushToken(pushTokenRef.current);
            pushTokenRef.current = null;
          }
        }
      }
    );

    // Set up notification listeners (deep links)
    const removeListeners = setupNotificationListeners(navigationRef.current);

    // On app start, register if user is already logged in
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        registerForPushNotifications().then((token) => {
          pushTokenRef.current = token;
        });
      }
    });

    // Cleanup
    return () => {
      authListener?.subscription?.unsubscribe();
      removeListeners();
    };
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator>
        {/* Your screens here */}
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="JobRequest" component={JobRequestScreen} />
        <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} />
        <Stack.Screen name="ActiveJob" component={ActiveJobScreen} />
        {/* ... more screens */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
