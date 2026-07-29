import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const INTRO_KEY = 'torc_user_intro_seen_v1';

export function Splash() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { isAuthenticated, loading, profile, user } = useAuth();

  useEffect(() => {
    // Wait for auth to finish loading before deciding where to go
    if (loading) return;

    const timer = setTimeout(async () => {
      if (isAuthenticated && user) {
        const role = profile?.role;
        if (role === 'admin') {
          navigate('/admin', { replace: true });
          return;
        }

        // Check for active in-progress jobs (crash recovery)
        try {
          const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

          // Auto-cancel stale jobs older than 12 hours
          await supabase
            .from('jobs')
            .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancellation_reason: 'auto_expired_stale' })
            .eq('customer_id', user.id)
            .in('status', ['accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress', 'pending', 'matching'])
            .is('customer_completed_at', null)
            .lt('created_at', twelveHoursAgo);

          const { data } = await supabase
            .from('jobs')
            .select('id')
            .eq('customer_id', user.id)
            .in('status', ['accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress', 'pending', 'matching'])
            .is('customer_completed_at', null)
            .gte('created_at', twelveHoursAgo)
            .limit(1)
            .maybeSingle();
          if (data) {
            navigate(`/tracking/${data.id}`, { replace: true });
            return;
          }
        } catch {
          // Fall through to home on error
        }

        navigate('/customer/home', { replace: true });
      } else {
        const hasSeenIntro = localStorage.getItem(INTRO_KEY) === '1';
        navigate(hasSeenIntro ? '/login' : '/intro/user', { replace: true });
      }
    }, isAuthenticated ? 500 : 3000);
    return () => clearTimeout(timer);
  }, [navigate, loading, isAuthenticated, profile, user]);

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        paddingTop: 'var(--safe-top)',
        background: isDark
          ? 'linear-gradient(135deg, #14263D 0%, #0A1626 100%)'
          : 'linear-gradient(135deg, #F8FAFB 0%, #FFFFFF 100%)',
      }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute top-1/3 left-1/3 w-80 h-80 rounded-full"
          style={{ backgroundColor: '#008CE5', filter: 'blur(140px)' }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.12, 0.2, 0.12] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full"
          style={{ backgroundColor: '#0070B8', filter: 'blur(140px)' }}
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.1, 0.18, 0.1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="relative z-10 text-center px-6">
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'backOut' }}
          className="mb-6"
        >
          <img
            src="/logo.svg"
            alt="Torc"
            className="w-56 h-auto mx-auto object-contain"
          />
        </motion.div>

        {/* Loading dots */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="flex items-center justify-center gap-2"
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-[#008CE5]"
              animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </motion.div>
      </div>
    </div>
  );
}
