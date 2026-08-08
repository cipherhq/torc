require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: allTokens } = await sb.from('device_tokens')
    .select('id, user_id, platform, push_token, updated_at, is_active')
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  // Keep only the newest entry per user_id + push_token combo
  const seen = new Set();
  const toDelete = [];
  for (const t of (allTokens || [])) {
    const key = t.user_id + ':' + t.push_token;
    if (seen.has(key)) {
      toDelete.push(t.id);
    } else {
      seen.add(key);
    }
  }

  console.log('Duplicate tokens to remove:', toDelete.length);
  for (const id of toDelete) {
    await sb.from('device_tokens').delete().eq('id', id);
  }
  if (toDelete.length > 0) {
    console.log('Removed', toDelete.length, 'duplicate tokens');
  }

  // Also keep only the 2 most recent tokens per user (one per platform)
  const { data: remaining } = await sb.from('device_tokens')
    .select('id, user_id, platform, push_token, updated_at')
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  const perUser = {};
  const oldToDelete = [];
  for (const t of (remaining || [])) {
    const key = t.user_id + ':' + t.platform;
    if (!perUser[key]) perUser[key] = 0;
    perUser[key]++;
    // Keep max 2 tokens per user per platform
    if (perUser[key] > 2) {
      oldToDelete.push(t.id);
    }
  }

  console.log('Old excess tokens to remove:', oldToDelete.length);
  for (const id of oldToDelete) {
    await sb.from('device_tokens').delete().eq('id', id);
  }

  // Final count
  const { data: final } = await sb.from('device_tokens')
    .select('user_id, platform, push_token')
    .eq('is_active', true);

  console.log('\nFinal active tokens:', (final || []).length);
  const byUser = {};
  for (const t of (final || [])) {
    const key = t.user_id.slice(0,8);
    if (!byUser[key]) byUser[key] = [];
    byUser[key].push(t.platform + ':' + t.push_token.slice(0,20));
  }
  for (const [uid, tokens] of Object.entries(byUser)) {
    console.log(' ', uid, ':', tokens.length, 'token(s)');
    for (const tok of tokens) console.log('   ', tok);
  }
})();
