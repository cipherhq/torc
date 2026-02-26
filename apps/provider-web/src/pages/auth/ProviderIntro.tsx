import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { DollarSign, MapPinned, Star, ChevronRight } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const INTRO_KEY = 'torc_provider_intro_seen_v1';

export function ProviderIntro() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [index, setIndex] = useState(0);

  const slides = useMemo(() => ([
    {
      icon: DollarSign,
      title: 'Earn on Your Schedule',
      body: 'Accept jobs when you are available and grow your income with consistent service demand.',
      accent: '#008CE5',
    },
    {
      icon: MapPinned,
      title: 'Smart Dispatch Nearby',
      body: 'Get matched with nearby requests, reduce downtime, and reach customers faster.',
      accent: '#0070B8',
    },
    {
      icon: Star,
      title: 'Build Your Reputation',
      body: 'Collect ratings and reviews after each completed job to win more requests over time.',
      accent: '#008CE5',
    },
  ]), []);

  const last = index === slides.length - 1;
  const current = slides[index];
  const Icon = current.icon;

  function finish() {
    localStorage.setItem(INTRO_KEY, '1');
    navigate('/login', { replace: true });
  }

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(180deg, #1A1F2E 0%, #0F1419 100%)'
          : 'linear-gradient(180deg, #FFFFFF 0%, #F0F4F8 100%)',
      }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-16 left-8 w-72 h-72 rounded-full blur-[120px]" style={{ backgroundColor: '#008CE5', opacity: isDark ? 0.1 : 0.06 }} />
        <div className="absolute bottom-20 right-8 w-72 h-72 rounded-full blur-[120px]" style={{ backgroundColor: '#0070B8', opacity: isDark ? 0.1 : 0.06 }} />
      </div>

      <div className="relative z-10 p-6 flex justify-between items-center" style={{ paddingTop: 'max(calc(16px + env(safe-area-inset-top, 0px)), 60px)' }}>
        <p className="text-sm font-semibold" style={{ color: isDark ? 'rgba(255,255,255,0.55)' : '#6B7280' }}>
          TORC for Providers
        </p>
        <button
          onClick={finish}
          className="text-sm font-semibold"
          style={{ color: '#008CE5' }}
        >
          Skip
        </button>
      </div>

      <div className="relative z-10 flex-1 flex flex-col justify-center px-6 pb-8">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="max-w-lg mx-auto w-full text-center"
        >
          <div
            className="w-24 h-24 rounded-3xl mx-auto mb-6 flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${current.accent}33, #0070B822)`,
              border: `1px solid ${current.accent}55`,
            }}
          >
            <Icon className="w-12 h-12" style={{ color: current.accent }} />
          </div>

          <h1 className="text-3xl font-bold mb-3" style={{ color: isDark ? '#FFFFFF' : '#1A1F2E' }}>
            {current.title}
          </h1>
          <p className="text-base leading-relaxed" style={{ color: isDark ? 'rgba(255,255,255,0.65)' : '#4B5563' }}>
            {current.body}
          </p>
        </motion.div>
      </div>

      <div className="relative z-10 p-6" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-center justify-center gap-2 mb-5">
          {slides.map((_, i) => (
            <div
              key={i}
              className="h-2 rounded-full transition-all"
              style={{
                width: i === index ? 30 : 10,
                backgroundColor: i === index ? '#008CE5' : (isDark ? 'rgba(255,255,255,0.2)' : '#D1D5DB'),
              }}
            />
          ))}
        </div>

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => (last ? finish() : setIndex((i) => i + 1))}
          className="w-full rounded-2xl py-4 font-bold text-white text-lg flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(90deg, #008CE5, #0070B8)' }}
        >
          {last ? 'Start Earning' : 'Next'}
          {!last && <ChevronRight className="w-5 h-5" />}
        </motion.button>
      </div>
    </div>
  );
}

