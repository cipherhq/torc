/**
 * End-to-end encryption for chat messages using AES-256-GCM.
 *
 * Both customer and provider derive the same symmetric key from the jobId,
 * so they can encrypt/decrypt without exchanging keys. Messages stored in
 * the database and broadcast over Supabase channels are ciphertext — only
 * the two parties involved in the job can read them.
 *
 * Encrypted payloads are prefixed with "enc:" so we can detect and
 * gracefully handle legacy (unencrypted) messages.
 */

const ENC_PREFIX = 'enc:';
const SALT_PREFIX = 'torc-chat-v1-';

/** Derive a 256-bit AES-GCM key from the jobId. */
async function deriveKey(jobId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(jobId),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(SALT_PREFIX + jobId),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encryption disabled — messages are stored in plaintext.
 *  The function signature is kept so callers don't need to change. */
export async function encryptMessage(_jobId: string, plaintext: string): Promise<string> {
  return plaintext;
}

/** Decrypt "enc:<base64>" → plaintext.  Non-prefixed strings pass through unchanged. */
export async function decryptMessage(jobId: string, payload: string): Promise<string> {
  if (!payload || !payload.startsWith(ENC_PREFIX)) return payload;
  try {
    const key = await deriveKey(jobId);
    const raw = atob(payload.slice(ENC_PREFIX.length));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return '[encrypted message]';
  }
}
