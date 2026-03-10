/**
 * Push Notification Worker
 *
 * This worker:
 * 1. Connects to Postgres and listens for pg_notify events
 * 2. When a job is accepted/cancelled, sends push notifications to relevant users
 * 3. Logs all sent notifications to push_notifications table
 * 4. Handles Expo push ticket receipts to track delivery
 *
 * Delivery backends:
 * - Expo Push API (ExponentPushToken)
 * - Firebase Cloud Messaging (Android/iOS FCM tokens)
 * - APNs direct (iOS APNs device tokens)
 *
 * Run: node workers/push-notification-worker.js
 *
 * Required environment variables:
 * - DATABASE_URL
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional for FCM delivery:
 * - FIREBASE_SERVICE_ACCOUNT_JSON (JSON string)
 * - FIREBASE_SERVICE_ACCOUNT_PATH (path to JSON file)
 * - or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *
 * Optional for APNs direct delivery:
 * - APNS_TEAM_ID
 * - APNS_KEY_ID
 * - APNS_PRIVATE_KEY (raw PEM or single-line with \n)
 * - APNS_CUSTOMER_BUNDLE_ID (e.g. com.torc.customer)
 * - APNS_PROVIDER_BUNDLE_ID (e.g. com.torc.provider)
 * - APNS_USE_SANDBOX=true for development
 */

require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const http2 = require('http2');
const { Client } = require('pg');
const { Expo } = require('expo-server-sdk');
const { createClient } = require('@supabase/supabase-js');

// Initialize clients
const expo = new Expo();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Track pending Expo tickets for delivery confirmation
const pendingTickets = new Map();

let firebaseCredentialsCache = null;
let firebaseCredentialsInitAttempted = false;
let firebaseAccessTokenCache = {
  token: null,
  expiresAt: 0,
};
let apnsJwtCache = {
  token: null,
  expiresAt: 0,
};

function normalizePrivateKey(value) {
  if (!value) return '';
  return String(value).replace(/\\n/g, '\n');
}

function inferTokenType(pushToken, platform) {
  if (Expo.isExpoPushToken(pushToken)) return 'expo';

  const token = String(pushToken || '');
  const isApnsHex = /^[a-f0-9]{64,}$/i.test(token);
  if (platform === 'ios' && isApnsHex) return 'apns';

  // FCM tokens are typically long opaque strings; Android tokens are expected to be FCM.
  if (platform === 'android') return 'fcm';
  if (token.includes(':') || token.length > 100) return 'fcm';

  return 'unknown';
}

function loadFirebaseCredentials() {
  if (firebaseCredentialsInitAttempted) return firebaseCredentialsCache;
  firebaseCredentialsInitAttempted = true;

  try {
    let serviceAccount = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const raw = fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8');
      serviceAccount = JSON.parse(raw);
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      serviceAccount = {
        project_id: process.env.FIREBASE_PROJECT_ID,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
      };
    }

    if (!serviceAccount) {
      console.warn('FCM credentials are not configured. Skipping FCM delivery.');
      return null;
    }

    if (serviceAccount.private_key) {
      serviceAccount.private_key = normalizePrivateKey(serviceAccount.private_key);
    }

    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      console.warn('FCM credentials are incomplete (project_id/client_email/private_key required).');
      return null;
    }

    firebaseCredentialsCache = {
      project_id: serviceAccount.project_id,
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key,
    };

    console.log('✅ FCM credentials loaded');
    return firebaseCredentialsCache;
  } catch (error) {
    console.error('❌ Failed to parse FCM credentials:', error.message || error);
    return null;
  }
}

function createFirebaseJwtAssertion(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(credentials.private_key);
  return `${unsigned}.${base64Url(signature)}`;
}

async function getFirebaseAccessToken() {
  const credentials = loadFirebaseCredentials();
  if (!credentials) return null;

  const now = Date.now();
  if (firebaseAccessTokenCache.token && now < firebaseAccessTokenCache.expiresAt) {
    return {
      token: firebaseAccessTokenCache.token,
      projectId: credentials.project_id,
    };
  }

  try {
    const assertion = createFirebaseJwtAssertion(credentials);
    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) {
      const message = payload.error_description || payload.error || `HTTP ${response.status}`;
      throw new Error(`OAuth token request failed: ${message}`);
    }

    // Refresh slightly early to avoid edge expiry.
    const expiresInSeconds = Number(payload.expires_in || 3600);
    firebaseAccessTokenCache = {
      token: payload.access_token,
      expiresAt: now + Math.max(60, expiresInSeconds - 60) * 1000,
    };

    return {
      token: payload.access_token,
      projectId: credentials.project_id,
    };
  } catch (error) {
    console.error('❌ Failed to get FCM OAuth token:', error.message || error);
    return null;
  }
}

function base64Url(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function getApnsJwt() {
  const teamId = process.env.APNS_TEAM_ID;
  const keyId = process.env.APNS_KEY_ID;
  const privateKey = normalizePrivateKey(process.env.APNS_PRIVATE_KEY);

  if (!teamId || !keyId || !privateKey) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  // APNs allows JWTs up to 60 minutes old; refresh a little early.
  if (apnsJwtCache.token && now < apnsJwtCache.expiresAt) {
    return apnsJwtCache.token;
  }

  const header = { alg: 'ES256', kid: keyId };
  const payload = { iss: teamId, iat: now };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;

  const signer = crypto.createSign('sha256');
  signer.update(unsigned);
  signer.end();

  const signature = signer.sign(privateKey);
  const jwt = `${unsigned}.${base64Url(signature)}`;

  apnsJwtCache = {
    token: jwt,
    expiresAt: now + 50 * 60,
  };

  return jwt;
}

function getApnsHost() {
  if (String(process.env.APNS_USE_SANDBOX || '').toLowerCase() === 'true') {
    return 'https://api.sandbox.push.apple.com';
  }
  return 'https://api.push.apple.com';
}

function normalizeDataForFcm(data) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value === null || value === undefined) continue;
    out[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }
  return out;
}

function shouldDeactivateForFcmError(errorCode) {
  return (
    errorCode === 'UNREGISTERED' ||
    errorCode === 'INVALID_ARGUMENT' ||
    errorCode === 'messaging/registration-token-not-registered' ||
    errorCode === 'messaging/invalid-registration-token' ||
    errorCode === 'messaging/invalid-argument'
  );
}

function shouldDeactivateForApnsReason(reason) {
  return reason === 'BadDeviceToken' || reason === 'Unregistered';
}

async function deactivateToken(deviceTokenId, reason) {
  if (!deviceTokenId) return;
  const { error } = await supabase
    .from('device_tokens')
    .update({ is_active: false })
    .eq('id', deviceTokenId);

  if (error) {
    console.error(`Failed to deactivate token ${deviceTokenId}:`, error.message || error);
    return;
  }

  console.log(`🔒 Deactivated token ${deviceTokenId}${reason ? ` (${reason})` : ''}`);
}

async function logPushAttempt({
  userId,
  deviceTokenId,
  notificationType,
  title,
  body,
  data,
  status,
  ticketId = null,
  errorMessage = null,
  errorCode = null,
}) {
  const { error } = await supabase.from('push_notifications').insert({
    user_id: userId,
    device_token_id: deviceTokenId,
    notification_type: notificationType,
    title,
    body,
    data,
    status,
    expo_ticket_id: ticketId,
    error_message: errorMessage,
    error_code: errorCode,
    sent_at: status === 'sent' ? new Date().toISOString() : null,
  });

  if (error) {
    console.error('Failed to insert push log:', error.message || error);
  }
}

async function sendViaFcm(pushToken, notification) {
  const auth = await getFirebaseAccessToken();
  if (!auth) {
    return {
      ok: false,
      errorCode: 'FCM_NOT_CONFIGURED',
      errorMessage: 'FCM credentials are not configured',
      transport: 'fcm',
    };
  }

  const { title, body, data = {}, priority = 'default', sound = 'default' } = notification;

  try {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${auth.projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: pushToken,
            notification: { title, body },
            data: normalizeDataForFcm(data),
            android: {
              priority: priority === 'high' ? 'HIGH' : 'NORMAL',
              notification: {
                channelId: 'default',
                sound: sound || 'default',
              },
            },
            apns: {
              headers: {
                'apns-priority': priority === 'high' ? '10' : '5',
              },
              payload: {
                aps: {
                  sound: sound || 'default',
                },
              },
            },
          },
        }),
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const details = Array.isArray(payload?.error?.details) ? payload.error.details : [];
      const fcmErrorCode = details.find((item) => item?.errorCode)?.errorCode || payload?.error?.status;
      return {
        ok: false,
        errorCode: fcmErrorCode || `HTTP_${response.status}`,
        errorMessage: payload?.error?.message || `FCM request failed with HTTP ${response.status}`,
        transport: 'fcm',
      };
    }

    return { ok: true, ticketId: payload?.name || null, transport: 'fcm' };
  } catch (error) {
    return {
      ok: false,
      errorCode: 'FCM_SEND_ERROR',
      errorMessage: error.message || String(error),
      transport: 'fcm',
    };
  }
}

function sendSingleApns({ pushToken, topic, notification }) {
  const jwt = getApnsJwt();
  if (!jwt) {
    return Promise.resolve({
      ok: false,
      errorCode: 'APNS_NOT_CONFIGURED',
      errorMessage: 'APNs credentials are not configured',
      transport: 'apns',
    });
  }

  const { title, body, data = {}, priority = 'default', sound = 'default' } = notification;

  const payload = {
    aps: {
      alert: { title, body },
      sound: sound || 'default',
    },
    ...data,
  };

  return new Promise((resolve) => {
    const client = http2.connect(getApnsHost());
    let statusCode = 0;
    let apnsId = null;
    let responseBody = '';
    let resolved = false;

    function finish(result) {
      if (resolved) return;
      resolved = true;
      try {
        client.close();
      } catch {}
      resolve(result);
    }

    client.on('error', (error) => {
      finish({
        ok: false,
        errorCode: 'APNS_CONNECTION_ERROR',
        errorMessage: error.message || String(error),
        transport: 'apns',
      });
    });

    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${pushToken}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': topic,
      'apns-push-type': 'alert',
      'apns-priority': priority === 'high' ? '10' : '5',
      'content-type': 'application/json',
    });

    request.setEncoding('utf8');

    request.on('response', (headers) => {
      statusCode = Number(headers[':status'] || 0);
      apnsId = headers['apns-id'] ? String(headers['apns-id']) : null;
    });

    request.on('data', (chunk) => {
      responseBody += chunk;
    });

    request.on('end', () => {
      if (statusCode === 200) {
        finish({ ok: true, ticketId: apnsId, transport: 'apns' });
        return;
      }

      let reason = 'APNS_ERROR';
      try {
        const parsed = JSON.parse(responseBody || '{}');
        if (parsed.reason) reason = parsed.reason;
      } catch {}

      finish({
        ok: false,
        errorCode: reason,
        errorMessage: `APNs returned ${statusCode}${responseBody ? `: ${responseBody}` : ''}`,
        reason,
        ticketId: apnsId,
        transport: 'apns',
      });
    });

    request.on('error', (error) => {
      finish({
        ok: false,
        errorCode: 'APNS_REQUEST_ERROR',
        errorMessage: error.message || String(error),
        transport: 'apns',
      });
    });

    request.end(JSON.stringify(payload));
  });
}

async function sendViaApns(pushToken, notification, userRole) {
  const customerTopic = process.env.APNS_CUSTOMER_BUNDLE_ID || 'com.torc.customer';
  const providerTopic = process.env.APNS_PROVIDER_BUNDLE_ID || 'com.torc.provider';

  const preferred = userRole === 'provider' ? providerTopic : customerTopic;
  const topics = [preferred, customerTopic, providerTopic].filter(Boolean).filter((value, index, arr) => arr.indexOf(value) === index);

  if (!topics.length) {
    return {
      ok: false,
      errorCode: 'APNS_TOPIC_NOT_CONFIGURED',
      errorMessage: 'No APNs bundle IDs configured',
      transport: 'apns',
    };
  }

  for (let i = 0; i < topics.length; i += 1) {
    const topic = topics[i];
    const result = await sendSingleApns({ pushToken, topic, notification });
    if (result.ok) return result;

    // Try fallback topic if token isn't for this topic.
    if (result.errorCode === 'DeviceTokenNotForTopic' && i < topics.length - 1) {
      continue;
    }

    return result;
  }

  return {
    ok: false,
    errorCode: 'APNS_SEND_FAILED',
    errorMessage: 'Failed to deliver APNs notification',
    transport: 'apns',
  };
}

/**
 * Main worker loop — uses Supabase Realtime instead of direct pg connection.
 * No DATABASE_URL required; only SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
async function main() {
  console.log('🚀 Starting push notification worker...');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  try {
    // Subscribe to job changes via Supabase Realtime (INSERT + UPDATE)
    const channel = supabase
      .channel('job-status-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs' },
        async (payload) => {
          try {
            const newRow = payload.new;
            if (newRow.status === 'pending') {
              console.log(`📬 New job created: ${newRow.id} (pending)`);
              await handleNewJobRequest(newRow);
            }
          } catch (error) {
            console.error('❌ Error handling new job INSERT:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'jobs' },
        async (payload) => {
          try {
            const oldRow = payload.old;
            const newRow = payload.new;
            const oldStatus = oldRow?.status;
            const newStatus = newRow?.status;

            // Only react to actual status changes
            if (!newStatus || oldStatus === newStatus) return;

            const eventData = {
              job_id: newRow.id,
              customer_id: newRow.customer_id,
              provider_id: newRow.provider_id,
            };

            console.log(`📬 Job ${newRow.id}: ${oldStatus} -> ${newStatus}`);

            if (newStatus === 'accepted') {
              await handleJobEvent('job_accepted', eventData);
            } else if (newStatus === 'enroute' || newStatus === 'en_route') {
              await handleJobEvent('provider_enroute', eventData);
            } else if (newStatus === 'arrived') {
              await handleJobEvent('provider_arrived', eventData);
            } else if (newStatus === 'in_progress' || newStatus === 'inprogress') {
              await handleJobEvent('service_started', eventData);
            } else if (newStatus === 'completed') {
              await handleJobEvent('job_completed', eventData);
            } else if (newStatus === 'cancelled') {
              // Use cancelled_by field to determine who actually cancelled
              let actorType = 'customer';
              if (newRow.cancelled_by && newRow.provider_id && newRow.cancelled_by === newRow.provider_id) {
                actorType = 'provider';
              }
              await handleJobEvent('job_cancelled', {
                ...eventData,
                actor_type: actorType,
                reason: newRow.cancellation_reason || '',
              });
            }
          } catch (error) {
            console.error('❌ Error handling realtime event:', error);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        async (payload) => {
          try {
            const msg = payload.new;
            if (msg) {
              await handleNewChatMessage(msg);
            }
          } catch (error) {
            console.error('❌ Error handling chat message INSERT:', error);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Connected to Supabase Realtime');
          console.log('🎧 Listening for new jobs, status changes, and messages...\n');
        } else {
          console.log(`Realtime status: ${status}`);
        }
      });

    // Periodically check ticket receipts (every 15 minutes)
    setInterval(checkTicketReceipts, 15 * 60 * 1000);

    // Periodically expire stale pending jobs (every 5 minutes)
    setInterval(expireStaleJobs, 5 * 60 * 1000);
    // Run once on startup after a short delay
    setTimeout(expireStaleJobs, 10 * 1000);

    // Keep alive - log heartbeat every 5 minutes
    setInterval(() => {
      console.log(`💓 Worker alive - ${new Date().toISOString()}`);
    }, 5 * 60 * 1000);

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\n🛑 Shutting down gracefully...');
      await supabase.removeChannel(channel);
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

/**
 * Send push notifications to nearby providers when a new job is created.
 * This ensures providers receive alerts even when the app is backgrounded.
 */
async function handleNewJobRequest(job) {
  try {
    const pickupLat = job.pickup_latitude;
    const pickupLng = job.pickup_longitude;

    if (!pickupLat || !pickupLng) {
      console.warn(`⚠️ Job ${job.id} has no pickup coordinates, skipping provider push.`);
      return;
    }

    // Get customer name for notification
    const { data: customer } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', job.customer_id)
      .maybeSingle();

    const customerFirst = customer?.first_name || '';
    const customerLastInitial = customer?.last_name ? ` ${customer.last_name.charAt(0)}.` : '';
    const customerName = `${customerFirst}${customerLastInitial}`.trim() || 'A customer';

    // Get service name
    const { data: service } = await supabase
      .from('services')
      .select('name')
      .eq('id', job.service_id)
      .maybeSingle();

    const serviceName = service?.name || 'roadside assistance';
    const address = job.pickup_address || 'nearby';

    // Load providers who already declined/dismissed this job
    const { data: dismissals } = await supabase
      .from('provider_job_dismissals')
      .select('provider_id')
      .eq('job_id', job.id);
    const dismissedSet = new Set((dismissals || []).map((d) => d.provider_id));

    const { data: declines } = await supabase
      .from('job_declines')
      .select('provider_id')
      .eq('job_id', job.id);
    (declines || []).forEach((d) => dismissedSet.add(d.provider_id));

    // Query nearby providers using relaxed location freshness for push notifications.
    // The RPC (get_nearby_providers) requires location updated within 5 min, which
    // excludes providers who are offline/backgrounded — exactly who we need to push to.
    // Instead, query provider_locations directly with a 24-hour window.
    const radii = [15, 30, 50];
    const notifiedProviders = new Set();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (const radius of radii) {
      // Direct query: find online providers with a known location in the last 24 hours
      const { data: locations, error: locError } = await supabase
        .from('provider_locations')
        .select('provider_id, latitude, longitude')
        .eq('is_online', true)
        .gte('updated_at', twentyFourHoursAgo);

      if (locError) {
        console.error(`❌ Error querying provider_locations:`, locError.message);
        break;
      }

      if (!locations || locations.length === 0) break;

      // Filter by distance (Haversine) and service eligibility
      const toRad = (deg) => (deg * Math.PI) / 180;
      const haversine = (lat1, lng1, lat2, lng2) => {
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return 3958.8 * 2 * Math.asin(Math.sqrt(a));
      };

      const nearby = locations
        .map((loc) => ({
          ...loc,
          distance_miles: haversine(pickupLat, pickupLng, loc.latitude, loc.longitude),
        }))
        .filter((loc) => loc.distance_miles <= radius)
        .sort((a, b) => a.distance_miles - b.distance_miles);

      if (nearby.length === 0) continue;

      // Check service eligibility and online status in provider_profiles
      const providerIds = nearby.map((p) => p.provider_id);
      const { data: ppRows } = await supabase
        .from('provider_profiles')
        .select('id, is_online, services')
        .in('id', providerIds)
        .eq('is_online', true);

      const eligibleSet = new Set();
      (ppRows || []).forEach((pp) => {
        // If service filter applies, check it
        if (job.service_id && Array.isArray(pp.services) && !pp.services.includes(job.service_id)) return;
        eligibleSet.add(pp.id);
      });

      // Also skip providers who already have an active job
      const { data: activeJobs } = await supabase
        .from('jobs')
        .select('provider_id')
        .in('provider_id', providerIds)
        .in('status', ['accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress']);
      const busySet = new Set((activeJobs || []).map((j) => j.provider_id));

      for (const provider of nearby) {
        if (notifiedProviders.has(provider.provider_id)) continue;
        if (dismissedSet.has(provider.provider_id)) continue;
        if (!eligibleSet.has(provider.provider_id)) continue;
        if (busySet.has(provider.provider_id)) continue;
        notifiedProviders.add(provider.provider_id);

        const distStr = provider.distance_miles < 1
          ? 'less than a mile away'
          : `${Math.round(provider.distance_miles)} mi away`;

        await sendPushToUser(provider.provider_id, {
          notificationType: 'new_job_request',
          title: 'New Job Request!',
          body: `${customerName} needs ${serviceName} — ${distStr} at ${address}`,
          data: {
            screen: 'JobRequest',
            jobId: job.id,
            notificationType: 'new_job_request',
          },
          sound: 'incoming.wav',
          priority: 'high',
        });
      }

      // If we found providers, no need to widen the radius
      if (notifiedProviders.size > 0) break;
    }

    console.log(`📤 Notified ${notifiedProviders.size} provider(s) for job ${job.id}`);
  } catch (error) {
    console.error(`❌ Error in handleNewJobRequest for job ${job.id}:`, error);
  }
}

/**
 * Handle different job events
 */
async function handleJobEvent(channel, data) {
  switch (channel) {
    case 'job_accepted':
      await handleJobAccepted(data);
      break;

    case 'job_cancelled':
      await handleJobCancelled(data);
      break;

    case 'job_completed':
      await handleJobCompleted(data);
      break;

    case 'provider_enroute':
      await handleProviderEnroute(data);
      break;

    case 'provider_arrived':
      await handleProviderArrived(data);
      break;

    case 'service_started':
      await handleServiceStarted(data);
      break;

    default:
      console.warn(`Unknown channel: ${channel}`);
  }
}

/**
 * Send push notification when a new chat message is received.
 * Notifies the other party (customer or provider) if they're not in the app.
 */
async function handleNewChatMessage(msg) {
  try {
    const senderRole = msg.sender_role;
    const jobId = msg.job_id;

    if (!jobId || !senderRole || senderRole === 'system') return;

    // Look up the job to find customer_id and provider_id
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('customer_id, provider_id')
      .eq('id', jobId)
      .maybeSingle();

    if (jobErr || !job) return;

    // Determine recipient (the other party)
    const recipientId = senderRole === 'customer' ? job.provider_id : job.customer_id;
    if (!recipientId) return;

    // Get sender name
    const { data: sender } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', msg.sender_id)
      .maybeSingle();

    const senderFirst = sender?.first_name || '';
    const senderLastInitial = sender?.last_name ? ` ${sender.last_name.charAt(0)}.` : '';
    const senderName = `${senderFirst}${senderLastInitial}`.trim() || 'Someone';

    // Use preview text (already stored on the message, truncated)
    const preview = msg.message ? msg.message.slice(0, 80) : 'Sent you a message';

    console.log(`💬 Chat message in job ${jobId}: ${senderRole} -> ${senderRole === 'customer' ? 'provider' : 'customer'}`);

    await sendPushToUser(recipientId, {
      notificationType: 'new_message',
      title: `Message from ${senderName}`,
      body: preview,
      data: {
        screen: senderRole === 'customer' ? 'ActiveJob' : 'LiveTracking',
        jobId: jobId,
        notificationType: 'new_message',
      },
      sound: 'default',
      priority: 'high',
    });
  } catch (error) {
    console.error('❌ Error in handleNewChatMessage:', error);
  }
}

/**
 * Send push when a job is accepted by a provider
 */
async function handleJobAccepted(data) {
  const { job_id, provider_id, customer_id } = data;

  // Get provider name for the notification
  const { data: provider } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', provider_id)
    .maybeSingle();

  const fallbackName = `${provider?.first_name || ''} ${provider?.last_name || ''}`.trim();
  const providerName = provider?.full_name || fallbackName || 'A provider';

  // Send push to customer
  await sendPushToUser(customer_id, {
    notificationType: 'job_accepted',
    title: 'Provider Found! 🚗',
    body: `${providerName} accepted your request and is on the way.`,
    data: {
      screen: 'LiveTracking',
      jobId: job_id,
      notificationType: 'job_accepted',
    },
    sound: 'accepted.wav',
    priority: 'high',
  });
}

/**
 * Send push when a job is cancelled
 */
async function handleJobCancelled(data) {
  const { job_id, actor_type, customer_id, provider_id, reason } = data;

  // Notify the other party
  if (actor_type === 'customer' && provider_id) {
    // Customer cancelled - notify provider
    await sendPushToUser(provider_id, {
      notificationType: 'job_cancelled',
      title: 'Job Cancelled',
      body: `Customer cancelled the request. ${reason ? `Reason: ${reason}` : ''}`,
      data: {
        screen: 'Home',
        jobId: job_id,
        notificationType: 'job_cancelled',
      },
      sound: 'cancelled.wav',
    });
  } else if (actor_type === 'provider' && customer_id) {
    // Provider cancelled - notify customer
    await sendPushToUser(customer_id, {
      notificationType: 'job_cancelled',
      title: 'Provider Cancelled',
      body: `Provider cancelled the request. ${reason ? `Reason: ${reason}` : ''}`,
      data: {
        screen: 'Home',
        jobId: job_id,
        notificationType: 'job_cancelled',
      },
      sound: 'cancelled.wav',
    });
  }
}

/**
 * Send push when a job is completed
 */
async function handleJobCompleted(data) {
  const { job_id, customer_id } = data;

  // Send push to customer asking for rating
  await sendPushToUser(customer_id, {
    notificationType: 'job_completed',
    title: 'Service Completed ✅',
    body: 'How was your experience? Tap to rate your provider.',
    data: {
      screen: 'LiveTracking',
      jobId: job_id,
      notificationType: 'job_completed',
    },
    sound: 'default',
  });
}

/**
 * Send push when provider is en route
 */
async function handleProviderEnroute(data) {
  const { job_id, customer_id } = data;

  await sendPushToUser(customer_id, {
    notificationType: 'provider_enroute',
    title: 'Provider On The Way',
    body: 'Your provider is heading to your location now.',
    data: {
      screen: 'LiveTracking',
      jobId: job_id,
      notificationType: 'provider_enroute',
    },
    sound: 'default',
    priority: 'high',
  });
}

/**
 * Send push when provider arrives at location
 */
async function handleProviderArrived(data) {
  const { job_id, customer_id } = data;

  await sendPushToUser(customer_id, {
    notificationType: 'provider_arrived',
    title: 'Provider Arrived 📍',
    body: 'Your provider has arrived at your location.',
    data: {
      screen: 'LiveTracking',
      jobId: job_id,
      notificationType: 'provider_arrived',
    },
    sound: 'default',
    priority: 'high',
  });
}

/**
 * Send push when service has started (in progress)
 */
async function handleServiceStarted(data) {
  const { job_id, customer_id } = data;

  await sendPushToUser(customer_id, {
    notificationType: 'service_started',
    title: 'Service Started',
    body: 'Your provider has begun working on your vehicle.',
    data: {
      screen: 'LiveTracking',
      jobId: job_id,
      notificationType: 'service_started',
    },
    sound: 'default',
  });
}

async function sendExpoPushBatch({
  userId,
  tokenRows,
  notificationType,
  title,
  body,
  data,
  sound,
  priority,
}) {
  const messages = [];
  const tokenMap = new Map();

  for (const token of tokenRows) {
    messages.push({
      to: token.push_token,
      sound,
      title,
      body,
      data,
      priority,
      channelId: 'default',
    });
    tokenMap.set(token.push_token, token.id);
  }

  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);

      for (let i = 0; i < chunk.length; i += 1) {
        const message = chunk[i];
        const ticket = tickets[i];
        const deviceTokenId = tokenMap.get(message.to);

        let status = 'sent';
        let errorMessage = null;
        let errorCode = null;
        let ticketId = null;

        if (ticket.status === 'error') {
          status = 'error';
          errorMessage = ticket.message;
          errorCode = ticket.details?.error || 'UNKNOWN';
          console.error(`❌ Expo push error for token ${message.to}:`, ticket);

          if (errorCode === 'DeviceNotRegistered') {
            await deactivateToken(deviceTokenId, errorCode);
          }
        } else {
          ticketId = ticket.id;
          pendingTickets.set(ticketId, {
            deviceTokenId,
            notificationType,
            sentAt: new Date(),
          });
        }

        await logPushAttempt({
          userId,
          deviceTokenId,
          notificationType,
          title,
          body,
          data,
          status,
          ticketId,
          errorMessage,
          errorCode,
        });
      }

      console.log(`✅ Sent ${chunk.length} Expo notification(s)`);
    } catch (error) {
      console.error('❌ Error sending Expo push chunk:', error);
    }
  }
}

async function sendNativePushToken({
  userId,
  tokenRow,
  userRole,
  notificationType,
  title,
  body,
  data,
  sound,
  priority,
}) {
  const tokenType = inferTokenType(tokenRow.push_token, tokenRow.platform);
  const notification = { notificationType, title, body, data, sound, priority };

  let result;

  if (tokenType === 'apns') {
    result = await sendViaApns(tokenRow.push_token, notification, userRole);
  } else if (tokenType === 'fcm') {
    result = await sendViaFcm(tokenRow.push_token, notification);

    // If iOS token was mis-classified as FCM and FCM is unavailable, try APNs fallback.
    if (!result.ok && result.errorCode === 'FCM_NOT_CONFIGURED' && tokenRow.platform === 'ios') {
      result = await sendViaApns(tokenRow.push_token, notification, userRole);
    }
  } else {
    result = {
      ok: false,
      errorCode: 'UNKNOWN_TOKEN_FORMAT',
      errorMessage: 'Unsupported push token format',
      transport: 'unknown',
    };
  }

  const status = result.ok ? 'sent' : 'error';
  await logPushAttempt({
    userId,
    deviceTokenId: tokenRow.id,
    notificationType,
    title,
    body,
    data,
    status,
    ticketId: result.ticketId || null,
    errorMessage: result.ok ? null : result.errorMessage,
    errorCode: result.ok ? null : result.errorCode,
  });

  if (!result.ok) {
    const shouldDeactivate =
      (result.transport === 'fcm' && shouldDeactivateForFcmError(result.errorCode)) ||
      (result.transport === 'apns' && shouldDeactivateForApnsReason(result.errorCode));

    if (shouldDeactivate) {
      await deactivateToken(tokenRow.id, result.errorCode);
    }

    console.error(
      `❌ ${String(result.transport || 'push').toUpperCase()} push failed for token ${tokenRow.id}:`,
      result.errorCode,
      result.errorMessage
    );
    return;
  }

  // Mark token as recently used after successful delivery handoff.
  await supabase
    .from('device_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', tokenRow.id);
}

/**
 * Send push notification to a specific user.
 *
 * @param {string} userId - User UUID
 * @param {object} notification - Notification details
 */
async function sendPushToUser(userId, notification) {
  const {
    notificationType,
    title,
    body,
    data = {},
    sound = 'default',
    priority = 'default',
  } = notification;

  try {
    // Get user's active push tokens
    const { data: tokens, error } = await supabase
      .from('device_tokens')
      .select('id, push_token, platform')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) {
      console.error(`Error fetching tokens for user ${userId}:`, error);
      return;
    }

    if (!tokens || tokens.length === 0) {
      console.log(`No active push tokens for user ${userId}`);
      return;
    }

    // Determine user role for APNs topic selection.
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    const userRole = profile?.role || null;

    const expoTokenRows = [];
    const nativeTokenRows = [];

    for (const row of tokens) {
      const tokenType = inferTokenType(row.push_token, row.platform);
      if (tokenType === 'expo') {
        expoTokenRows.push(row);
      } else {
        nativeTokenRows.push(row);
      }
    }

    console.log(
      `📤 Sending push to user ${userId} (${tokens.length} device(s): ${expoTokenRows.length} Expo, ${nativeTokenRows.length} native)`
    );

    if (expoTokenRows.length > 0) {
      await sendExpoPushBatch({
        userId,
        tokenRows: expoTokenRows,
        notificationType,
        title,
        body,
        data,
        sound,
        priority,
      });
    }

    for (const tokenRow of nativeTokenRows) {
      await sendNativePushToken({
        userId,
        tokenRow,
        userRole,
        notificationType,
        title,
        body,
        data,
        sound,
        priority,
      });
    }
  } catch (error) {
    console.error(`❌ Error in sendPushToUser for ${userId}:`, error);
  }
}

/**
 * Expire pending jobs older than 2 hours that no provider accepted.
 * Cancels the job and sends a push notification to the customer.
 */
async function expireStaleJobs() {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // Find pending jobs older than 2 hours with no provider assigned
    const { data: staleJobs, error } = await supabase
      .from('jobs')
      .select('id, customer_id')
      .eq('status', 'pending')
      .is('provider_id', null)
      .lt('created_at', twoHoursAgo)
      .limit(50);

    if (error) {
      console.error('❌ Error querying stale jobs:', error.message);
      return;
    }

    if (!staleJobs || staleJobs.length === 0) return;

    console.log(`⏰ Expiring ${staleJobs.length} stale pending job(s)...`);

    for (const job of staleJobs) {
      // Cancel the job
      const { error: updateErr } = await supabase
        .from('jobs')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: 'request_expired',
        })
        .eq('id', job.id)
        .eq('status', 'pending'); // guard against race

      if (updateErr) {
        console.error(`❌ Failed to expire job ${job.id}:`, updateErr.message);
        continue;
      }

      // Notify the customer
      await sendPushToUser(job.customer_id, {
        notificationType: 'request_expired',
        title: 'Request Expired',
        body: 'No providers were available for your request. Please try again.',
        data: {
          screen: 'Home',
          jobId: job.id,
          notificationType: 'request_expired',
        },
        sound: 'default',
      });

      // Insert in-app notification
      await supabase.from('notifications').insert({
        user_id: job.customer_id,
        type: 'service',
        title: 'Request Expired',
        message: 'No providers were available for your request. You were not charged. Please try again when you\'re ready.',
        action_url: '/customer/home',
      });

      console.log(`⏰ Expired job ${job.id} and notified customer ${job.customer_id}`);
    }
  } catch (error) {
    console.error('❌ Error in expireStaleJobs:', error);
  }
}

/**
 * Check delivery status of pending Expo push tickets.
 * Called periodically to verify Expo pushes were delivered.
 */
async function checkTicketReceipts() {
  if (pendingTickets.size === 0) return;

  console.log(`🔍 Checking ${pendingTickets.size} pending Expo ticket receipt(s)...`);

  const ticketIds = Array.from(pendingTickets.keys());
  const chunks = expo.chunkPushNotificationReceiptIds(ticketIds);

  for (const chunk of chunks) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);

      for (const ticketId in receipts) {
        const receipt = receipts[ticketId];
        const ticketInfo = pendingTickets.get(ticketId);

        if (!ticketInfo) continue;

        let status = 'delivered';
        let errorMessage = null;
        let errorCode = null;

        if (receipt.status === 'error') {
          status = 'failed';
          errorMessage = receipt.message;
          errorCode = receipt.details?.error || 'UNKNOWN';
          console.error(`❌ Delivery failed for ticket ${ticketId}:`, receipt);

          // Deactivate token if device unregistered
          if (errorCode === 'DeviceNotRegistered') {
            await deactivateToken(ticketInfo.deviceTokenId, errorCode);
          }
        }

        const { error } = await supabase
          .from('push_notifications')
          .update({
            status,
            delivered_at: status === 'delivered' ? new Date().toISOString() : null,
            error_message: errorMessage,
            error_code: errorCode,
          })
          .eq('expo_ticket_id', ticketId);

        if (error) {
          console.error(`Failed to update receipt status for ${ticketId}:`, error.message || error);
        }

        // Remove from pending
        pendingTickets.delete(ticketId);
      }
    } catch (error) {
      console.error('❌ Error checking receipts:', error);
    }
  }

  console.log(`✅ Receipt check complete. ${pendingTickets.size} still pending.`);
}

// Start the worker
main().catch((error) => {
  console.error('💥 Worker crashed:', error);
  process.exit(1);
});
