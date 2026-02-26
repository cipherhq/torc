import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

const INTRO_KEY = 'torc_user_intro_seen_v1';

export function Splash() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { isAuthenticated, loading, profile } = useAuth();

  useEffect(() => {
    // Wait for auth to finish loading before deciding where to go
    if (loading) return;

    const timer = setTimeout(() => {
      if (isAuthenticated) {
        // Already logged in — go straight to home
        const role = profile?.role;
        if (role === 'admin') {
          navigate('/admin', { replace: true });
        } else {
          navigate('/customer/home', { replace: true });
        }
      } else {
        const hasSeenIntro = localStorage.getItem(INTRO_KEY) === '1';
        navigate(hasSeenIntro ? '/login' : '/intro/user', { replace: true });
      }
    }, isAuthenticated ? 500 : 3000); // Shorter delay if already authenticated
    return () => clearTimeout(timer);
  }, [navigate, loading, isAuthenticated, profile]);

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        paddingTop: 'var(--safe-top)',
        background: isDark
          ? 'linear-gradient(135deg, #1A1F2E 0%, #0F1419 100%)'
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
