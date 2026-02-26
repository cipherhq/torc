import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';

let listenersAttached = false;
let registrationInFlight = null;
let currentUserId = null;
let currentRole = 'provider';
let currentToken = null;

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

  if (jobId && (screen === 'livetracking' || type === 'job_accepted' || type === 'provider_arrived' || type === 'job_completed')) {
    return `/tracking/${jobId}`;
  }
  if (screen === 'home' || type === 'job_cancelled') return '/customer/home';
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
    console.warn('Failed to upsert native push token:', error);
  }
}

async function attachListeners() {
  if (listenersAttached) return;
  const { PushNotifications } = await import('@capacitor/push-notifications');

  await PushNotifications.removeAllListeners().catch(() => {});

  await PushNotifications.addListener('registration', async (token) => {
    currentToken = token?.value || null;
    if (currentToken && currentUserId) {
      await upsertPushToken(currentToken, currentUserId);
    }
  });

  await PushNotifications.addListener('registrationError', (error) => {
    console.warn('Native push registration error:', error);
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

export async function registerNativePushForUser({ userId, role = 'provider' } = {}) {
  if (!isCapacitorNative() || !userId) return null;

  currentUserId = userId;
  currentRole = role;

  await attachListeners();

  const { PushNotifications } = await import('@capacitor/push-notifications');
  const permStatus = await PushNotifications.checkPermissions();

  if (permStatus.receive === 'denied') {
    console.warn('Native push permission denied');
    return null;
  }

  if (permStatus.receive === 'prompt') {
    const request = await PushNotifications.requestPermissions();
    if (request.receive !== 'granted') {
      console.warn('Native push permission not granted');
      return null;
    }
  }

  if (!registrationInFlight) {
    registrationInFlight = PushNotifications.register()
      .catch((error) => {
        console.warn('Native push register failed:', error);
      })
      .finally(() => {
        registrationInFlight = null;
      });
  }

  await registrationInFlight;

  if (currentToken) {
    await upsertPushToken(currentToken, userId);
  }

  return currentToken;
}

export async function deactivateNativePushToken(userId = currentUserId) {
  if (!isCapacitorNative() || !currentToken || !userId) return;
  const { error } = await supabase
    .from('device_tokens')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('push_token', currentToken);

  if (error) {
    console.warn('Failed to deactivate native push token:', error);
  }
}
