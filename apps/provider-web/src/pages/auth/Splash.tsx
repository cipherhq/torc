import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const INTRO_KEY = 'torc_provider_intro_seen_v1';

export function Splash() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { isAuthenticated, loading, user } = useAuth();

  useEffect(() => {
    if (loading) return;

    const timer = setTimeout(async () => {
      if (isAuthenticated && user) {
        // Check for active in-progress jobs first (crash recovery)
        // Only consider recent jobs (last 12h) — older stuck jobs are stale
        try {
          const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
          const { data } = await supabase
            .from('jobs')
            .select('id')
            .eq('provider_id', user.id)
            .in('status', ['accepted', 'en_route', 'enroute', 'arrived', 'in_progress', 'inprogress'])
            .gte('created_at', twelveHoursAgo)
            .limit(1)
            .maybeSingle();
          if (data) {
            navigate(`/job/${data.id}`, { replace: true });
            return;
          }
        } catch {
          // Fall through to home on error
        }
        navigate('/permissions', { replace: true });
      } else {
        const hasSeenIntro = localStorage.getItem(INTRO_KEY) === '1';
        navigate(hasSeenIntro ? '/login' : '/intro/provider', { replace: true });
      }
    }, isAuthenticated ? 500 : 3000);
    return () => clearTimeout(timer);
  }, [navigate, loading, isAuthenticated, user]);

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
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
          className="mb-4"
        >
          <img
            src="/logo.svg"
            alt="Torc"
            className="w-56 h-auto mx-auto object-contain"
          />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-lg font-semibold"
          style={{ color: '#008CE5' }}
        >
          Provider
        </motion.p>

        {/* Loading dots */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="mt-8 flex items-center justify-center gap-2"
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
