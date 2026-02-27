import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Home, AlertCircle } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export function NotFound() {
  const navigate = useNavigate();
  const { isDark } = useTheme();

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      {/* Background */}
      {isDark && (
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#008CE5] opacity-10 blur-[120px] rounded-full" />
        </div>
      )}

      <div className="relative z-10 text-center max-w-md">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="w-32 h-32 rounded-full bg-gradient-to-br from-[#008CE5]/20 to-[#0070B8]/20 flex items-center justify-center mx-auto mb-8"
        >
          <AlertCircle className="w-16 h-16 text-[#008CE5]" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h1 className="text-6xl font-bold mb-4" style={{ color: textColor }}>404</h1>
          <h2 className="text-2xl font-bold mb-3" style={{ color: textColor }}>Page Not Found</h2>
          <p className="mb-8" style={{ color: subColor }}>
            The page you're looking for doesn't exist or has been moved.
          </p>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/home')}
            className="bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-[32px] px-8 py-4 font-bold text-[#081427] text-lg inline-flex items-center gap-3"
            style={{ boxShadow: '0 8px 24px rgba(78,205,196,0.4)' }}
          >
            <Home className="w-5 h-5" />
            Go to Home
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
