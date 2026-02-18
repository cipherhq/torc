/**
 * Push Notifications Setup for Expo (iOS & Android)
 * 
 * This module handles:
 * - Requesting push permissions
 * - Registering/updating device tokens in Supabase
 * - Listening for incoming notifications (foreground and background)
 * - Deep linking to the right screen when user taps a notification
 * 
 * Usage:
 * 1. Import in App.js
 * 2. Call registerForPushNotifications() when user logs in
 * 3. Call setupNotificationListeners(navigation) on app start
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabaseClient';

// Configure how notifications are displayed (foreground behavior)
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    
    // For provider "ring" notifications, always show prominently
    if (data.notificationType === 'new_job_request') {
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      };
    }

    // Default: show alert and play sound
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

/**
 * Request permission and register device push token
 * Call this when user logs in or app starts with authenticated user
 * 
 * @returns {Promise<string|null>} The Expo push token or null if permission denied
 */
export async function registerForPushNotifications() {
  // Only works on physical devices
  if (!Device.isDevice) {
    console.warn('Push notifications only work on physical devices, not simulators');
    return null;
  }

  try {
    // Check existing permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Push notification permission denied');
      return null;
    }

    // Get Expo push token
    const pushToken = (
      await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      })
    ).data;

    console.log('📱 Got push token:', pushToken);

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('No authenticated user, cannot register token');
      return null;
    }

    // Get device info
    const deviceInfo = {
      deviceId: Constants.deviceId || Constants.sessionId,
      deviceName: Device.deviceName,
      platform: Platform.OS,
      osVersion: Device.osVersion,
      appVersion: Constants.expoConfig?.version || '1.0.0',
      appBuild: Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || '1',
    };

    // Register token in database using RPC
    const { data, error } = await supabase.rpc('upsert_device_token', {
      p_user_id: user.id,
      p_platform: deviceInfo.platform,
      p_push_token: pushToken,
      p_device_id: deviceInfo.deviceId,
      p_device_name: deviceInfo.deviceName,
      p_app_version: deviceInfo.appVersion,
      p_app_build: deviceInfo.appBuild,
      p_os_version: deviceInfo.osVersion,
    });

    if (error) {
      console.error('Failed to register push token:', error);
      return null;
    }

    console.log('✅ Push token registered in database');
    return pushToken;
  } catch (error) {
    console.error('Error registering push token:', error);
    return null;
  }
}

/**
 * Unregister device token (call on logout)
 * 
 * @param {string} pushToken - The Expo push token to deactivate
 */
export async function unregisterPushToken(pushToken) {
  if (!pushToken) return;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Mark token as inactive
    await supabase
      .from('device_tokens')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('push_token', pushToken);

    console.log('✅ Push token unregistered');
  } catch (error) {
    console.error('Error unregistering push token:', error);
  }
}

/**
 * Set up notification listeners for foreground and tap handling
 * Call this once in your App.js root component
 * 
 * @param {object} navigation - React Navigation navigation object
 * @returns {function} Cleanup function to remove listeners
 */
export function setupNotificationListeners(navigation) {
  // Listener for notifications received while app is foregrounded
  const foregroundSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('📬 Notification received (foreground):', notification);
      
      const data = notification.request.content.data;
      
      // You can show an in-app banner, update badge, etc.
      // Or do nothing - the system will show the notification banner
    }
  );

  // Listener for when user taps a notification (deep link handling)
  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('👆 User tapped notification:', response);
      
      const data = response.notification.request.content.data;
      handleDeepLink(data, navigation);
    }
  );

  // Cleanup function
  return () => {
    foregroundSubscription.remove();
    responseSubscription.remove();
  };
}

/**
 * Handle deep linking based on notification data
 * 
 * @param {object} data - Notification data payload
 * @param {object} navigation - React Navigation navigation object
 */
function handleDeepLink(data, navigation) {
  if (!data || !navigation) return;

  const { screen, jobId, notificationType } = data;

  // Navigate based on notification type or explicit screen parameter
  if (screen === 'JobRequest' && jobId) {
    // Provider: new job request
    navigation.navigate('JobRequest', { jobId });
  } else if (screen === 'LiveTracking' && jobId) {
    // Customer: provider accepted, track live
    navigation.navigate('LiveTracking', { jobId });
  } else if (screen === 'ActiveJob' && jobId) {
    // Provider: active job screen
    navigation.navigate('ActiveJob', { jobId });
  } else if (screen === 'JobHistory') {
    // General: go to job history
    navigation.navigate('JobHistory');
  } else if (notificationType === 'job_cancelled') {
    // Job cancelled - go home or show modal
    navigation.navigate('Home');
  }
  // Add more cases as needed
}

/**
 * Schedule a local notification (for testing or app-generated notifications)
 * 
 * @param {object} options - Notification options
 * @param {string} options.title - Notification title
 * @param {string} options.body - Notification body
 * @param {object} options.data - Custom data payload
 * @param {number} options.seconds - Seconds until notification fires (default: 0 = immediate)
 */
export async function scheduleLocalNotification({
  title,
  body,
  data = {},
  seconds = 0,
}) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
    },
    trigger: seconds > 0 ? { seconds } : null,
  });
}

/**
 * Set notification badge count (iOS)
 * 
 * @param {number} count - Badge number to display
 */
export async function setBadgeCount(count) {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear all delivered notifications
 */
export async function clearAllNotifications() {
  await Notifications.dismissAllNotificationsAsync();
}
