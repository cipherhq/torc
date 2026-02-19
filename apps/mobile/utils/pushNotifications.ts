import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

// Configure notification display behavior
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    
    // Provider "ring" notifications - show prominently
    if (data.notificationType === 'new_job_request') {
      return {
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      };
    }

    // Default
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  },
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Push notifications only work on physical devices');
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowAnnouncements: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Push notification permission denied');
      return null;
    }

    const pushToken = (
      await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      })
    ).data;

    console.log('📱 Got push token:', pushToken);

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 150, 250, 150, 250],
        lightColor: '#2EFFAF',
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('No authenticated user');
      return null;
    }

    const deviceInfo = {
      deviceId: Constants.deviceId || Constants.sessionId,
      deviceName: Device.deviceName,
      platform: Platform.OS,
      osVersion: Device.osVersion,
      appVersion: Constants.expoConfig?.version || '1.0.0',
      appBuild: String(Constants.expoConfig?.ios?.buildNumber || Constants.expoConfig?.android?.versionCode || '1'),
    };

    // Register in database using RPC
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

    console.log('✅ Push token registered');
    return pushToken;
  } catch (error) {
    console.error('Error registering push token:', error);
    return null;
  }
}

export async function unregisterPushToken(pushToken: string) {
  if (!pushToken) return;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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

export function setupNotificationListeners(navigation: any) {
  const foregroundSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('📬 Notification received (foreground):', notification);
    }
  );

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('👆 User tapped notification:', response);
      const data = response.notification.request.content.data;
      handleDeepLink(data, navigation);
    }
  );

  return () => {
    foregroundSubscription.remove();
    responseSubscription.remove();
  };
}

function handleDeepLink(data: any, navigation: any) {
  if (!data || !navigation) return;

  const { screen, jobId, notificationType } = data;

  if (screen === 'JobRequest' && jobId) {
    navigation.navigate('JobRequest', { jobId });
  } else if (screen === 'LiveTracking' && jobId) {
    navigation.navigate('LiveTracking', { jobId });
  } else if (screen === 'ActiveJob' && jobId) {
    navigation.navigate('ActiveJob', { jobId });
  } else if (notificationType === 'job_cancelled') {
    navigation.navigate('Home');
  }
}

export async function scheduleLocalNotification({
  title,
  body,
  data = {},
  seconds = 0,
}: {
  title: string;
  body: string;
  data?: any;
  seconds?: number;
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

export async function setBadgeCount(count: number) {
  await Notifications.setBadgeCountAsync(count);
}

export async function clearAllNotifications() {
  await Notifications.dismissAllNotificationsAsync();
}
