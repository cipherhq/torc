import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.97.0';
import { getSupabaseSecretKey, getSupabasePublishableKey } from './supabaseKeys.ts';

const defaultAdminUrl = 'https://admin-web-black-eight.vercel.app';
const adminUrl = Deno.env.get('ADMIN_APP_URL') || defaultAdminUrl;
const allowedOrigins = new Set([new URL(adminUrl).origin, 'https://admin.torcapp.com', 'http://localhost:8082']);

function respond(body: Record<string, unknown>, status: number, origin: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
    headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (origin && !allowedOrigins.has(origin)) return respond({ error: 'Origin not allowed' }, 403, null);
  if (req.method === 'OPTIONS') return respond({}, 200, origin);
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405, origin);

  const url = Deno.env.get('SUPABASE_URL');
  const secretKey = getSupabaseSecretKey();
  const publishableKey = getSupabasePublishableKey();
  if (!url || !secretKey || !publishableKey) return respond({ error: 'Invitation service is not configured' }, 503, origin);

  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return respond({ error: 'Sign in required' }, 401, origin);

  const adminClient = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Validate the caller's JWT with Auth, then check the authoritative profile.
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) return respond({ error: 'Sign in required' }, 401, origin);

    const { data: actor, error: actorError } = await adminClient
      .from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (actorError) throw actorError;
    if (actor?.role !== 'admin') return respond({ error: 'Admin access required' }, 403, origin);

    let input: Record<string, unknown>;
    try {
      input = await req.json();
    } catch {
      return respond({ error: 'Invalid request body' }, 400, origin);
    }

    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const role = input.role === 'support' ? 'support' : 'admin';
    const firstName = typeof input.firstName === 'string' ? input.firstName.trim() : '';
    const lastName = typeof input.lastName === 'string' ? input.lastName.trim() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        firstName.length > 100 || lastName.length > 100) {
      return respond({ error: 'Enter a valid email and names under 100 characters' }, 400, origin);
    }

    const { data: existing, error: existingError } = await adminClient
      .from('profiles').select('id, role').ilike('email', email).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.role === role) {
      return respond({ error: 'This user is already an admin team member' }, 409, origin);
    }

    let memberId: string;
    let action: string;
    let message: string;
    if (existing) {
      // The role-protection trigger requires auth.uid() to be an admin, so
      // this update must run with the caller's JWT, not the service key.
      const { data: updated, error: updateError } = await userClient
        .from('profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('id, role')
        .single();
      if (updateError || updated?.role !== role) throw updateError || new Error('Could not assign team role');
      memberId = existing.id;
      action = 'promote_to_admin';
      message = 'Existing user promoted to admin. They can sign in with their current credentials.';
    } else {
      // Auth admin methods use the server key here, never the browser client.
      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${adminUrl.replace(/\/$/, '')}/auth/callback`,
        data: { first_name: firstName, last_name: lastName },
      });
      if (inviteError) return respond({ error: inviteError.message }, 400, origin);
      if (!invited.user?.id) throw new Error('Invitation did not return a user ID');

      memberId = invited.user.id;
      const profileValues = {
        email,
        role,
        first_name: firstName || null,
        last_name: lastName || null,
        updated_at: new Date().toISOString(),
      };
      const { data: invitedProfile, error: lookupError } = await adminClient
        .from('profiles').select('id').eq('id', memberId).maybeSingle();
      if (lookupError) throw lookupError;
      const { error: profileError } = invitedProfile
        ? await userClient.from('profiles').update(profileValues).eq('id', memberId)
        : await adminClient.from('profiles').insert({ id: memberId, ...profileValues });
      if (profileError) {
        console.error('Admin invitation sent but profile update failed:', profileError);
        return respond({ error: 'Invitation email was sent, but admin access could not be assigned. Check this user in Supabase before retrying.' }, 500, origin);
      }
      const { data: confirmedProfile, error: confirmError } = await adminClient
        .from('profiles').select('role').eq('id', memberId).single();
      if (confirmError || confirmedProfile?.role !== role) {
        console.error('Admin invitation sent but role was not assigned:', confirmError);
        return respond({ error: 'Invitation email was sent, but admin access could not be verified. Check this user in Supabase before retrying.' }, 500, origin);
      }
      action = 'invite_admin';
      message = 'Invitation email sent. The new admin can sign in after accepting it.';
    }

    const { error: auditError } = await adminClient.from('admin_audit_logs').insert({
      actor_id: user.id,
      action,
      entity_type: 'profile',
      entity_id: memberId,
      details: { email, previous_role: existing?.role || null },
    });
    if (auditError) console.error('Admin membership changed but audit insert failed:', auditError);

    return respond({ message, warning: auditError ? 'Audit logging failed; contact support.' : undefined }, 200, origin);
  } catch (error) {
    console.error('Admin invitation failed:', error);
    return respond({ error: 'Could not update the admin team. Please try again or contact support.' }, 500, origin);
  }
});
