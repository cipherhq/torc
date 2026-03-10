import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Clock, Zap } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { updateRequestContext } from '../../data/requestContext';
import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

export function ScheduleService() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [timing, setTiming] = useState<'now' | 'scheduled'>('now');
  const [dateTime, setDateTime] = useState('');

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  // Minimum datetime = now (rounded to next hour)
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const minDateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:00`;

  const handleContinue = () => {
    let scheduledFor = null;
    if (timing === 'scheduled' && dateTime) {
      // Parse manually to avoid UTC offset issues
      const [datePart, timePart] = dateTime.split('T');
      const [yr, mo, dy] = datePart.split('-').map(Number);
      const [hr, mn] = timePart.split(':').map(Number);
      scheduledFor = new Date(yr, mo - 1, dy, hr, mn);
    }
    updateRequestContext({ scheduledFor });
    navigate('/pricing');
  };

  // Format "2026-03-30T20:00" to readable string — parse manually to avoid UTC offset
  const formatDateTime = (dt: string) => {
    if (!dt) return '';
    // dt is "YYYY-MM-DDTHH:MM" from datetime-local input — parse parts directly
    const [datePart, timePart] = dt.split('T');
    const [yr, mo, dy] = datePart.split('-').map(Number);
    const [hr, mn] = timePart.split(':').map(Number);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    // Use local date constructor to get correct weekday
    const d = new Date(yr, mo - 1, dy);
    const period = hr >= 12 ? 'PM' : 'AM';
    const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
    return `${weekdays[d.getDay()]}, ${months[mo - 1]} ${dy} at ${h12}:${String(mn).padStart(2, '0')} ${period}`;
  };

  return (
    <div className="min-h-screen" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)', paddingBottom: 'calc(140px + env(safe-area-inset-bottom, 0px))' }}>
      <PageHeader title="When do you need help?" />

      <div className="relative z-10 px-6" style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }}>
        {/* Timing options */}
        <div className="space-y-4 mb-8">
          {/* Now */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setTiming('now')}
            className="w-full rounded-2xl p-5 flex items-center gap-4 transition-all active:opacity-80"
            style={{
              backgroundColor: timing === 'now' ? (isDark ? 'rgba(78,205,196,0.12)' : 'rgba(78,205,196,0.08)') : cardBg,
              border: `2px solid ${timing === 'now' ? '#008CE5' : cardBorder}`,
              boxShadow: timing === 'now' ? '0 4px 16px rgba(78,205,196,0.25)' : 'none',
            }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: timing === 'now' ? 'linear-gradient(135deg, #008CE5, #0070B8)' : (isDark ? 'rgba(255,255,255,0.05)' : '#E8F0FB'),
                boxShadow: timing === 'now' ? '0 6px 20px rgba(78,205,196,0.4)' : 'none',
              }}
            >
              <Zap className="w-7 h-7" style={{ color: timing === 'now' ? '#0A1626' : subColor }} />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-bold" style={{ color: textColor }}>Right Now</h3>
              <p className="text-sm" style={{ color: subColor }}>Get help as soon as possible</p>
              {timing === 'now' && (
                <p className="text-sm mt-1.5 font-semibold" style={{ color: '#008CE5' }}>
                  Avg arrival: 8-15 minutes
                </p>
              )}
            </div>
            <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center" style={{
              borderColor: timing === 'now' ? '#008CE5' : (isDark ? 'rgba(255,255,255,0.25)' : '#D1D5DB'),
              backgroundColor: timing === 'now' ? '#008CE5' : 'transparent',
            }}>
              {timing === 'now' && <div className="w-2.5 h-2.5 rounded-full bg-[#0A1626]" />}
            </div>
          </motion.button>

          {/* Scheduled */}
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setTiming('scheduled')}
            className="w-full rounded-2xl p-5 flex items-center gap-4 transition-all active:opacity-80"
            style={{
              backgroundColor: timing === 'scheduled' ? (isDark ? 'rgba(78,205,196,0.12)' : 'rgba(78,205,196,0.08)') : cardBg,
              border: `2px solid ${timing === 'scheduled' ? '#008CE5' : cardBorder}`,
              boxShadow: timing === 'scheduled' ? '0 4px 16px rgba(78,205,196,0.25)' : 'none',
            }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: timing === 'scheduled' ? 'linear-gradient(135deg, #008CE5, #0070B8)' : (isDark ? 'rgba(255,255,255,0.05)' : '#E8F0FB'),
                boxShadow: timing === 'scheduled' ? '0 6px 20px rgba(78,205,196,0.4)' : 'none',
              }}
            >
              <Clock className="w-7 h-7" style={{ color: timing === 'scheduled' ? '#0A1626' : subColor }} />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-bold" style={{ color: textColor }}>Schedule for Later</h3>
              <p className="text-sm" style={{ color: subColor }}>Choose a date and time</p>
            </div>
            <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center" style={{
              borderColor: timing === 'scheduled' ? '#008CE5' : (isDark ? 'rgba(255,255,255,0.25)' : '#D1D5DB'),
              backgroundColor: timing === 'scheduled' ? '#008CE5' : 'transparent',
            }}>
              {timing === 'scheduled' && <div className="w-2.5 h-2.5 rounded-full bg-[#0A1626]" />}
            </div>
          </motion.button>
        </div>

        {/* Schedule picker - single datetime input */}
        {timing === 'scheduled' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div className="rounded-2xl p-5" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
              <div className="flex items-center gap-3 mb-3">
                <Clock className="w-5 h-5" style={{ color: '#008CE5' }} />
                <p className="font-semibold" style={{ color: textColor }}>Pick Date & Time</p>
              </div>
              <input
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                min={minDateTime}
                className="w-full rounded-xl px-4 py-4"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF', border: `1px solid ${cardBorder}`, color: textColor }}
              />
            </div>

            {/* Summary */}
            {dateTime && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-5 text-center"
                style={{ background: 'linear-gradient(135deg, rgba(0,140,229,0.08), rgba(0,112,184,0.08))', border: '1px solid rgba(0,140,229,0.2)' }}
              >
                <p className="text-sm" style={{ color: subColor }}>Your service is scheduled for</p>
                <p className="text-lg font-bold mt-1" style={{ color: '#008CE5' }}>
                  {formatDateTime(dateTime)}
                </p>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-6" style={{ backgroundColor: isDark ? '#0A1626' : '#FFFFFF', borderTop: `1px solid ${cardBorder}`, paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))' }}>
        <button
          onClick={handleContinue}
          disabled={timing === 'scheduled' && !dateTime}
          className="torc-btn-primary"
        >
          Continue to Payment
        </button>
      </div>
    </div>
  );
}
