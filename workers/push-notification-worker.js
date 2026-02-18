/**
 * Push Notification Worker
 * 
 * This worker:
 * 1. Connects to Postgres and listens for pg_notify events
 * 2. When a job is accepted/cancelled, sends push notifications to relevant users
 * 3. Logs all sent notifications to push_notifications table
 * 4. Handles Expo push ticket receipts to track delivery
 * 
 * Run: node workers/push-notification-worker.js
 * 
 * Environment variables required:
 * - DATABASE_URL: Postgres connection string (get from Supabase: Settings → Database)
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key (for inserting push logs)
 * - NODE_ENV: 'production' or 'development'
 */

require('dotenv').config();
const { Client } = require('pg');
const { Expo } = require('expo-server-sdk');
const { createClient } = require('@supabase/supabase-js');

// Initialize clients
const expo = new Expo();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Track pending tickets for delivery confirmation
const pendingTickets = new Map();

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
      : false
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
    .select('full_name, display_name')
    .eq('id', provider_id)
    .maybeSingle();

  const providerName = provider?.full_name || provider?.display_name || 'A provider';

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
  const { job_id, cancelled_by, actor_type, customer_id, provider_id, reason } = data;

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

/**
 * Send push notification to a specific user
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

    console.log(`📤 Sending push to user ${userId} (${tokens.length} device(s))`);

    // Build Expo push messages
    const messages = [];
    const tokenMap = new Map(); // Map push_token → device_token_id

    for (const token of tokens) {
      if (!Expo.isExpoPushToken(token.push_token)) {
        console.warn(`Invalid Expo push token: ${token.push_token}`);
        continue;
      }

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

    if (messages.length === 0) {
      console.log('No valid Expo push tokens to send to');
      return;
    }

    // Send push notifications in chunks
    const chunks = expo.chunkPushNotifications(messages);
    
    for (const chunk of chunks) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        
        // Log each push to database
        for (let i = 0; i < chunk.length; i++) {
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
            console.error(`❌ Push error for token ${message.to}:`, ticket);

            // Mark token as inactive if it's invalid
            if (errorCode === 'DeviceNotRegistered') {
              await supabase
                .from('device_tokens')
                .update({ is_active: false })
                .eq('id', deviceTokenId);
              console.log(`🔒 Deactivated invalid token ${deviceTokenId}`);
            }
          } else {
            ticketId = ticket.id;
            // Store ticket for receipt checking
            pendingTickets.set(ticketId, {
              deviceTokenId,
              notificationType,
              sentAt: new Date(),
            });
          }

          // Log to database
          await supabase.from('push_notifications').insert({
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
        }

        console.log(`✅ Sent ${chunk.length} push notification(s)`);
      } catch (error) {
        console.error('❌ Error sending push chunk:', error);
      }
    }
  } catch (error) {
    console.error(`❌ Error in sendPushToUser for ${userId}:`, error);
  }
}

/**
 * Check delivery status of pending push tickets
 * Called periodically to verify pushes were delivered
 */
async function checkTicketReceipts() {
  if (pendingTickets.size === 0) return;

  console.log(`🔍 Checking ${pendingTickets.size} pending ticket receipt(s)...`);

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
            await supabase
              .from('device_tokens')
              .update({ is_active: false })
              .eq('id', ticketInfo.deviceTokenId);
          }
        }

        // Update notification log
        await supabase
          .from('push_notifications')
          .update({
            status,
            delivered_at: status === 'delivered' ? new Date().toISOString() : null,
            error_message: errorMessage,
            error_code: errorCode,
          })
          .eq('expo_ticket_id', ticketId);

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
