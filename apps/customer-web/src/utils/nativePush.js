import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/NotificationToast';
import { decryptMessage } from '../lib/chatEncryption';

let listenersAttached = false;
let registrationInFlight = null;
let currentUserId = null;
let currentRole = 'customer';
let currentToken = null;
let visibilityListenerAttached = false;

function isCapacitorNative() {
  return Capacitor.isNativePlatform();
}

function resolveRouteFromPayload(data, role) {
  const payload = data || {};
  const screen = String(payload.screen || '').toLowerCase();
  const type = String(payload.notificationType || payload.notification_type || '').toLowerCase();
  const jobId = payload.jobId || payload.job_id;

  if (role === 'provider') {
    if (jobId && (screen === 'jobrequest' || type === 'new_job_request')) return `/request/${jobId}`;
    if (jobId && (screen === 'activejob' || type === 'job_accepted')) return `/job/${jobId}`;
    if (screen === 'home' || type === 'job_cancelled') return '/home';
    return null;
  }

  if (jobId && (screen === 'livetracking' || type === 'job_accepted' || type === 'provider_enroute' || type === 'provider_arrived' || type === 'service_started' || type === 'job_completed' || type === 'new_message')) {
    return `/tracking/${jobId}`;
  }
  if (screen === 'home' || type === 'job_cancelled' || type === 'request_expired') return '/customer/home';
  return null;
}

async function upsertPushToken(pushToken, userId) {
  if (!pushToken || !userId) return;

  const platform = Capacitor.getPlatform();
  const deviceName = (typeof navigator !== 'undefined' ? navigator.userAgent : '') || `${platform}-device`;
  const appVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';
  const appBuild = import.meta.env.VITE_APP_BUILD || '1';
  const deviceId = `${platform}-${deviceName.slice(0, 64)}`;

  const { error } = await supabase.rpc('upsert_device_token', {
    p_user_id: userId,
    p_platform: platform,
    p_push_token: pushToken,
    p_device_id: deviceId,
    p_device_name: deviceName,
    p_app_version: appVersion,
    p_app_build: appBuild,
    p_os_version: typeof navigator !== 'undefined' ? navigator.platform : '',
  });

  if (error) {
    console.warn('[Push] Failed to upsert token:', error);
  } else {
    console.log('[Push] Token saved successfully');
  }
}

async function attachListeners() {
  if (listenersAttached) return;
  const { PushNotifications } = await import('@capacitor/push-notifications');

  await PushNotifications.removeAllListeners().catch(() => {});

  await PushNotifications.addListener('registration', async (token) => {
    console.log('[Push] Registration token received:', token?.value?.slice(0, 20) + '...');
    currentToken = token?.value || null;
    if (currentToken && currentUserId) {
      await upsertPushToken(currentToken, currentUserId);
    }
  });

  await PushNotifications.addListener('registrationError', (error) => {
    console.warn('[Push] Registration error:', error);
  });

  // Show banner when notification arrives while app is in the foreground
  await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
    console.log('[Push] Received in foreground:', notification);
    const title = notification?.title || 'TORC';
    let body = notification?.body || '';
    const data = notification?.data || {};
    const type = String(data.notificationType || data.notification_type || '').toLowerCase();
    const isMessage = type === 'new_message';
    const jobId = data.jobId || data.job_id;
    const targetPath = resolveRouteFromPayload(data, currentRole);

    // Decrypt encrypted message bodies
    if (body.startsWith('enc:') && jobId) {
      try {
        const decrypted = await decryptMessage(jobId, body);
        body = decrypted?.slice(0, 80) || 'Sent you a message';
      } catch {
        body = 'Sent you a message';
      }
    }

    showToast(
      isMessage ? 'message' : 'notification',
      title,
      body,
      5000,
      targetPath ? () => {
        if (window.location.pathname !== targetPath) {
          window.location.assign(targetPath);
        }
      } : undefined,
    );
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action?.notification?.data || {};
    const targetPath = resolveRouteFromPayload(data, currentRole);
    if (targetPath && typeof window !== 'undefined' && window.location.pathname !== targetPath) {
      window.location.assign(targetPath);
    }
  });

  listenersAttached = true;
}

export async function registerNativePushForUser({ userId, role = 'customer' } = {}) {
  if (!isCapacitorNative()) {
    console.log('[Push] Not native platform, skipping');
    return null;
  }
  if (!userId) {
    console.log('[Push] No userId, skipping');
    return null;
  }

  console.log('[Push] Registering for user:', userId.slice(0, 8) + '...', 'role:', role);

  currentUserId = userId;
  currentRole = role;

  await attachListeners();

  const { PushNotifications } = await import('@capacitor/push-notifications');

  let permStatus;
  try {
    permStatus = await PushNotifications.checkPermissions();
    console.log('[Push] Permission status:', permStatus.receive);
  } catch (err) {
    console.warn('[Push] checkPermissions failed:', err);
    return null;
  }

  if (permStatus.receive === 'denied') {
    console.warn('[Push] Permission denied — opening Settings');
    try {
      const { NativeSettings, IOSSettings, AndroidSettings } = await import('capacitor-native-settings');
      await NativeSettings.open({
        optionAndroid: AndroidSettings.AppNotification,
        optionIOS: IOSSettings.App,
      }).catch(() => {});
    } catch (err) {
      console.warn('[Push] Could not open settings:', err);
    }
    return null;
  }

  if (permStatus.receive !== 'granted') {
    console.log('[Push] Requesting permissions...');
    try {
      const request = await PushNotifications.requestPermissions();
      console.log('[Push] Permission request result:', request.receive);
      if (request.receive !== 'granted') {
        console.warn('[Push] Permission not granted');
        return null;
      }
    } catch (err) {
      console.warn('[Push] requestPermissions failed:', err);
      return null;
    }
  }

  console.log('[Push] Calling register()...');
  if (!registrationInFlight) {
    registrationInFlight = PushNotifications.register()
      .then(() => {
        console.log('[Push] register() succeeded');
      })
      .catch((error) => {
        console.warn('[Push] register() failed:', error);
      })
      .finally(() => {
        registrationInFlight = null;
      });
  }

  await registrationInFlight;

  if (currentToken) {
    await upsertPushToken(currentToken, userId);
  }

  // Re-check when app returns from background (user may enable in Settings)
  if (!visibilityListenerAttached) {
    visibilityListenerAttached = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && currentUserId && !currentToken) {
        console.log('[Push] App resumed without token — retrying registration');
        registerNativePushForUser({ userId: currentUserId, role: currentRole }).catch(() => {});
      }
    });
  }

  return currentToken;
}

export async function deactivateNativePushToken(userId = currentUserId) {
  const tokenToDeactivate = currentToken;
  const userToDeactivate = userId;

  // Reset module state immediately so next login starts clean
  currentUserId = null;
  currentToken = null;

  if (!isCapacitorNative() || !tokenToDeactivate || !userToDeactivate) return;
  const { error } = await supabase
    .from('device_tokens')
    .update({ is_active: false })
    .eq('user_id', userToDeactivate)
    .eq('push_token', tokenToDeactivate);

  if (error) {
    console.warn('[Push] Failed to deactivate token:', error);
  }
}
