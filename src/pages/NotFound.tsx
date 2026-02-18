import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Home, AlertCircle } from 'lucide-react';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 text-center max-w-md">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="w-32 h-32 rounded-full bg-gradient-to-br from-[#2EFFAF]/20 to-[#007AFF]/20 flex items-center justify-center mx-auto mb-8"
        >
          <AlertCircle className="w-16 h-16 text-[#2EFFAF]" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h1 className="text-6xl font-bold text-white mb-4">404</h1>
          <h2 className="text-2xl font-bold text-white mb-3">Page Not Found</h2>
          <p className="text-white/60 mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/home')}
            className="bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] px-8 py-4 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#2EFFAF]/30 inline-flex items-center gap-3"
          >
            <Home className="w-5 h-5" />
            Go to Home
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
