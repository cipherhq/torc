require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: allTokens } = await sb.from('device_tokens')
    .select('id, user_id, platform, push_token, is_active, updated_at')
    .eq('is_active', true);

  // Real APNs tokens are hex (64+ chars), FCM tokens are base64-ish (100+ chars)
  // Expo push tokens look like ExponentPushToken[...] or are UUIDs
  const suspicious = [];
  for (const t of (allTokens || [])) {
    const tok = t.push_token;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tok);
    const isExpo = tok.startsWith('ExponentPushToken[');
    if (isUUID || isExpo) {
      suspicious.push(t);
    }
  }
  console.log('Suspicious Expo/UUID tokens still active:', suspicious.length);

  for (const t of suspicious) {
    console.log('  Deactivating:', t.user_id.slice(0,8), t.platform, t.push_token.slice(0,20));
    await sb.from('device_tokens').update({ is_active: false }).eq('id', t.id);
  }
  if (suspicious.length > 0) {
    console.log('Deactivated', suspicious.length, 'stale tokens');
  }

  // Delete all inactive tokens
  const { error } = await sb.from('device_tokens').delete().eq('is_active', false);
  console.log('Cleaned up inactive tokens:', error ? 'FAILED' : 'OK');

  // Final count
  const { data: final } = await sb.from('device_tokens')
    .select('user_id, platform, push_token')
    .eq('is_active', true);

  console.log('\nFinal active tokens:', (final || []).length);
  const byUser = {};
  for (const t of (final || [])) {
    const key = t.user_id.slice(0,8);
    if (!byUser[key]) byUser[key] = [];
    byUser[key].push(t.platform + ':' + t.push_token.slice(0,15));
  }
  for (const [uid, tokens] of Object.entries(byUser)) {
    console.log(' ', uid, ':', tokens.length, 'token(s)');
    for (const tok of tokens) console.log('   ', tok);
  }
})();
