import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Clock, Calendar, Zap } from 'lucide-react';
import { updateRequestContext } from '../../data/requestContext';
import { useState } from 'react';

export function ScheduleService() {
  const navigate = useNavigate();
  const [timing, setTiming] = useState<'now' | 'scheduled'>('now');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

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
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">When do you need help?</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-32 overflow-y-auto">
        {/* Timing options */}
        <div className="space-y-4 mb-8">
          {/* Now */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setTiming('now')}
            className={`w-full rounded-[32px] p-6 flex items-center gap-4 transition-all ${
              timing === 'now'
                ? 'bg-gradient-to-r from-[#2EFFAF]/20 to-[#007AFF]/20 border-2 border-[#2EFFAF]'
                : 'glass'
            }`}
          >
            <div 
              className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                timing === 'now'
                  ? 'bg-gradient-to-br from-[#2EFFAF] to-[#007AFF]'
                  : 'bg-white/5'
              }`}
              style={timing === 'now' ? {
                boxShadow: '0 8px 24px rgba(46, 255, 175, 0.4)',
              } : {}}
            >
              <Zap className={`w-8 h-8 ${timing === 'now' ? 'text-[#0A0F1E]' : 'text-white/40'}`} />
            </div>
            <div className="flex-1 text-left">
              <h3 className={`text-xl font-bold mb-1 ${timing === 'now' ? 'text-white' : 'text-white/80'}`}>
                Right Now
              </h3>
              <p className="text-white/60 text-sm">Get help as soon as possible</p>
              {timing === 'now' && (
                <p className="text-[#2EFFAF] text-sm mt-2 font-semibold">
                  Avg arrival: 8-15 minutes
                </p>
              )}
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
              timing === 'now' ? 'border-[#2EFFAF]' : 'border-white/40'
            }`}>
              {timing === 'now' && (
                <div className="w-3 h-3 rounded-full bg-[#2EFFAF]" />
              )}
            </div>
          </motion.button>

          {/* Scheduled */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setTiming('scheduled')}
            className={`w-full rounded-[32px] p-6 flex items-center gap-4 transition-all ${
              timing === 'scheduled'
                ? 'bg-gradient-to-r from-[#2EFFAF]/20 to-[#007AFF]/20 border-2 border-[#2EFFAF]'
                : 'glass'
            }`}
          >
            <div 
              className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                timing === 'scheduled'
                  ? 'bg-gradient-to-br from-[#2EFFAF] to-[#007AFF]'
                  : 'bg-white/5'
              }`}
              style={timing === 'scheduled' ? {
                boxShadow: '0 8px 24px rgba(46, 255, 175, 0.4)',
              } : {}}
            >
              <Clock className={`w-8 h-8 ${timing === 'scheduled' ? 'text-[#0A0F1E]' : 'text-white/40'}`} />
            </div>
            <div className="flex-1 text-left">
              <h3 className={`text-xl font-bold mb-1 ${timing === 'scheduled' ? 'text-white' : 'text-white/80'}`}>
                Schedule for Later
              </h3>
              <p className="text-white/60 text-sm">Choose a date and time</p>
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
              timing === 'scheduled' ? 'border-[#2EFFAF]' : 'border-white/40'
            }`}>
              {timing === 'scheduled' && (
                <div className="w-3 h-3 rounded-full bg-[#2EFFAF]" />
              )}
            </div>
          </motion.button>
        </div>

        {/* Schedule picker */}
        {timing === 'scheduled' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Date */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="w-5 h-5 text-[#2EFFAF]" />
                <p className="text-white font-semibold">Select Date</p>
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full glass rounded-[24px] px-4 py-4 text-white focus:outline-none focus:border-[#2EFFAF] border-2 border-transparent transition-colors"
              />
            </div>

            {/* Time */}
            {selectedDate && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <Clock className="w-5 h-5 text-[#2EFFAF]" />
                  <p className="text-white font-semibold">Select Time</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {timeSlots.map((time) => (
                    <motion.button
                      key={time}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedTime(time)}
                      className={`py-3 rounded-2xl font-semibold transition-all ${
                        selectedTime === time
                          ? 'bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0A0F1E]'
                          : 'glass text-white/80'
                      }`}
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
      <div className="fixed bottom-0 left-0 right-0 z-20 p-6 glass border-t border-white/10">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleContinue}
          disabled={timing === 'scheduled' && (!selectedDate || !selectedTime)}
          className="w-full bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-[32px] py-5 font-bold text-[#0A0F1E] text-lg shadow-lg shadow-[#2EFFAF]/30 disabled:opacity-50"
        >
          Continue to Payment
        </motion.button>
      </div>
    </div>
  );
}
