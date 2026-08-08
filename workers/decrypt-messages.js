/**
 * One-time script: decrypt all encrypted chat messages in the database
 * and update job preview fields.
 */
require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

const ENC_PREFIX = 'enc:';
const SALT_PREFIX = 'torc-chat-v1-';

async function deriveKey(jobId) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', Buffer.from(jobId), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: Buffer.from(SALT_PREFIX + jobId), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

async function decrypt(jobId, payload) {
  if (!payload || !payload.startsWith(ENC_PREFIX)) return payload;
  try {
    const key = await deriveKey(jobId);
    const raw = Buffer.from(payload.slice(ENC_PREFIX.length), 'base64');
    const iv = raw.slice(0, 12);
    const ciphertext = raw.slice(12);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return Buffer.from(plainBuf).toString('utf8');
  } catch {
    return null;
  }
}

async function main() {
  // 1. Decrypt all encrypted chat_messages
  const { data: msgs } = await sb.from('chat_messages')
    .select('id, job_id, message')
    .like('message', 'enc:%');

  console.log('Encrypted messages to decrypt:', (msgs || []).length);

  let decrypted = 0;
  let failed = 0;
  for (const msg of (msgs || [])) {
    const plain = await decrypt(msg.job_id, msg.message);
    if (plain) {
      await sb.from('chat_messages').update({ message: plain }).eq('id', msg.id);
      decrypted++;
    } else {
      failed++;
      console.log('  Failed to decrypt:', msg.id);
    }
  }
  console.log('Decrypted:', decrypted, '| Failed:', failed);

  // 2. Update job last_message_preview fields
  const { data: jobs } = await sb.from('jobs')
    .select('id, last_message_preview')
    .like('last_message_preview', 'enc:%');

  console.log('\nJobs with encrypted previews:', (jobs || []).length);
  for (const job of (jobs || [])) {
    const { data: lastMsg } = await sb.from('chat_messages')
      .select('message')
      .eq('job_id', job.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastMsg && lastMsg.message) {
      await sb.from('jobs')
        .update({ last_message_preview: lastMsg.message.substring(0, 80) })
        .eq('id', job.id);
      console.log('  Updated preview for job', job.id.substring(0, 12));
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
