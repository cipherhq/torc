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
 * Main worker loop
 */
async function main() {
  console.log('🚀 Starting push notification worker...');
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Connect to Postgres
  const pgClient = new Client({
    connectionString: process.env.DATABASE_URL,
    // SSL config for production (Supabase requires SSL)
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    await pgClient.connect();
    console.log('✅ Connected to Postgres');

    // Listen to job event channels
    await pgClient.query('LISTEN job_accepted');
    await pgClient.query('LISTEN job_cancelled');
    await pgClient.query('LISTEN job_completed');
    await pgClient.query('LISTEN provider_arrived');

    console.log('🎧 Listening for job events...\n');

    // Handle incoming notifications
    pgClient.on('notification', async (msg) => {
      try {
        const data = JSON.parse(msg.payload);
        console.log(`📬 Received ${msg.channel}:`, data);

        await handleJobEvent(msg.channel, data);
      } catch (error) {
        console.error(`❌ Error handling ${msg.channel}:`, error);
      }
    });

    // Periodically check ticket receipts (every 15 minutes)
    setInterval(checkTicketReceipts, 15 * 60 * 1000);

    // Keep alive - log heartbeat every 5 minutes
    setInterval(() => {
      console.log(`💓 Worker alive - ${new Date().toISOString()}`);
    }, 5 * 60 * 1000);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await pgClient.end();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await pgClient.end();
    process.exit(0);
  });
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

    case 'provider_arrived':
      await handleProviderArrived(data);
      break;

    default:
      console.warn(`Unknown channel: ${channel}`);
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
