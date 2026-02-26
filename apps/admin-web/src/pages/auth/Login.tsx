import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { supabase } from '../../lib/supabase';
import { requireAdminSession } from '../../lib/adminAuth';

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    requireAdminSession()
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => {});
  }, [navigate]);

  const redirectTarget = `${window.location.origin}/admin/auth/callback`;

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      await requireAdminSession();
      const fromPath = (location.state as any)?.from || '/dashboard';
      navigate(fromPath, { replace: true });
    } catch (err: any) {
      await supabase.auth.signOut().catch(() => {});
      setError(err?.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      setError('Enter your admin email first.');
      return;
    }
    setError('');
    setMessage('');
    setMagicLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTarget },
      });
      if (otpError) throw otpError;
      setMessage('Magic link sent. Open your email and continue from the link.');
    } catch (err: any) {
      setError(err?.message || 'Could not send magic link.');
    } finally {
      setMagicLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: 'linear-gradient(180deg, #041033 0%, #020A21 100%)' }}
    >
      <div
        className="w-full max-w-md rounded-3xl p-8 shadow-xl"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <h1 className="text-2xl font-bold mb-2" style={{ color: '#111827' }}>Admin Sign In</h1>
        <p className="text-sm mb-6" style={{ color: '#6B7280' }}>
          Sign in with an account whose `profiles.role` is `admin`.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#B91C1C' }}>
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#BBF7D0', backgroundColor: '#F0FDF4', color: '#15803D' }}>
            {message}
          </div>
        )}

        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#374151' }}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 outline-none"
              style={{
                borderColor: '#D1D5DB',
                backgroundColor: '#FFFFFF',
                color: '#111827',
              }}
              placeholder="admin@yourcompany.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#374151' }}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border px-4 py-3 outline-none"
              style={{
                borderColor: '#D1D5DB',
                backgroundColor: '#FFFFFF',
                color: '#111827',
              }}
              placeholder="Your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl py-3 font-semibold disabled:opacity-60"
            style={{ backgroundColor: '#008CE5', color: '#FFFFFF' }}
          >
            {loading ? 'Signing in...' : 'Sign in with password'}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1" style={{ backgroundColor: '#E5E7EB' }} />
          <span className="text-xs" style={{ color: '#9CA3AF' }}>OR</span>
          <div className="h-px flex-1" style={{ backgroundColor: '#E5E7EB' }} />
        </div>

        <button
          type="button"
          onClick={handleMagicLink}
          disabled={magicLoading}
          className="w-full rounded-xl border py-3 font-semibold disabled:opacity-60"
          style={{ borderColor: '#D1D5DB', color: '#1F2937', backgroundColor: '#FFFFFF' }}
        >
          {magicLoading ? 'Sending link...' : 'Send magic link'}
        </button>
      </div>
    </div>
  );
}
