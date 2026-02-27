import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Clock, Calendar, Zap } from 'lucide-react';
import { updateRequestContext } from '../../data/requestContext';
import { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

export function ScheduleService() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [timing, setTiming] = useState<'now' | 'scheduled'>('now');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  const handleContinue = () => {
    let scheduledFor = null;
    if (timing === 'scheduled' && selectedDate && selectedTime) {
      scheduledFor = new Date(`${selectedDate}T${selectedTime}`);
    }

    updateRequestContext({ scheduledFor });
    navigate('/pricing');
  };

  const timeSlots = [
    '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM',
    '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM',
    '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM',
  ];

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4" style={{ paddingTop: 'var(--safe-top)' }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: textColor }} />
        </motion.button>
        <h1 className="text-xl font-bold" style={{ color: textColor }}>When do you need help?</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-32 overflow-y-auto">
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

        {/* Schedule picker */}
        {timing === 'scheduled' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {/* Date */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="w-5 h-5" style={{ color: '#008CE5' }} />
                <p className="font-semibold" style={{ color: textColor }}>Select Date</p>
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full rounded-2xl px-4 py-4"
                style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: textColor }}
              />
            </div>

            {/* Time */}
            {selectedDate && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center gap-3 mb-3">
                  <Clock className="w-5 h-5" style={{ color: '#008CE5' }} />
                  <p className="font-semibold" style={{ color: textColor }}>Select Time</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {timeSlots.map((time) => (
                    <motion.button
                      key={time}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedTime(time)}
                      className="py-3 rounded-2xl font-semibold text-sm transition-all active:opacity-80"
                      style={{
                        background: selectedTime === time ? 'linear-gradient(135deg, #008CE5, #0070B8)' : cardBg,
                        color: selectedTime === time ? '#0A1626' : textColor,
                        border: `1px solid ${selectedTime === time ? '#008CE5' : cardBorder}`,
                        boxShadow: selectedTime === time ? '0 4px 12px rgba(78,205,196,0.3)' : 'none',
                      }}
                    >
                      {time}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>

      {/* Fixed bottom button */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-6" style={{ backgroundColor: isDark ? '#0A1626' : '#FFFFFF', borderTop: `1px solid ${cardBorder}` }}>
        <button
          onClick={handleContinue}
          disabled={timing === 'scheduled' && (!selectedDate || !selectedTime)}
          className="torc-btn-primary"
        >
          Continue to Payment
        </button>
      </div>
    </div>
  );
}
