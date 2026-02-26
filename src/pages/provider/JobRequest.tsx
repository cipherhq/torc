import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router';
import { MapBackground } from '../../components/MapBackground';
import { X, MapPin, Clock, DollarSign, User, AlertCircle, Navigation, BellRing } from 'lucide-react';
import { useState, useEffect } from 'react';

const REQUEST_WINDOW_SECONDS = 60;
const URGENT_THRESHOLD_SECONDS = 20;
const CRITICAL_THRESHOLD_SECONDS = 8;

export function JobRequest() {
  const navigate = useNavigate();
  const { requestId } = useParams();
  const [timeLeft, setTimeLeft] = useState(REQUEST_WINDOW_SECONDS);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/provider/home');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  const requestData = {
    customer: 'Sarah Johnson',
    isThirdParty: false,
    service: 'Jump Start',
    location: '123 Market Street, San Francisco',
    distance: '2.3 mi',
    eta: '7 min',
    estimatedPayout: '$45',
    notes: 'Battery died in parking lot. Need help ASAP.',
  };
  const isUrgent = timeLeft <= URGENT_THRESHOLD_SECONDS;
  const isCritical = timeLeft <= CRITICAL_THRESHOLD_SECONDS;

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-b from-[#F8FCFF] via-[#F1F8FF] to-[#EAF4FF]">
      <MapBackground />
      <div className="pointer-events-none absolute -top-28 -left-20 h-72 w-72 rounded-full bg-[#008CE5]/20 blur-[110px]" />
      <div className="pointer-events-none absolute bottom-8 right-[-40px] h-72 w-72 rounded-full bg-[#0070B8]/20 blur-[120px]" />

      {/* Timer bar */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-[#DDE8F6] z-50">
        <motion.div
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: REQUEST_WINDOW_SECONDS, ease: 'linear' }}
          className="h-full"
          style={{ background: isUrgent ? 'linear-gradient(to right, #EF4444, #F97316)' : 'linear-gradient(to right, #008CE5, #0070B8)' }}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center justify-between" style={{ paddingTop: 'calc(env(safe-area-inset-top, 16px) + 10px)' }}>
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-2" style={{ backgroundColor: isUrgent ? 'rgba(239,68,68,0.12)' : 'rgba(0,140,229,0.12)' }}>
            <motion.span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: isUrgent ? '#EF4444' : '#008CE5' }}
              animate={{ scale: [1, 1.4, 1], opacity: [1, 0.35, 1] }}
              transition={{ duration: 1.1, repeat: Infinity }}
            />
            <BellRing className="w-3.5 h-3.5" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }} />
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }}>Incoming Request</p>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#1A1F2E' }}>
            Accept in <span style={{ color: isUrgent ? '#EF4444' : '#008CE5' }}>{timeLeft}s</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: isUrgent ? '#EF4444' : '#6B7280' }}>
            {isCritical ? 'Critical: final seconds to claim this request.' : isUrgent ? 'Urgent: this request may expire any moment.' : 'A nearby customer needs immediate help.'}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/provider/home')}
          className="rounded-full p-3 border bg-white/85"
          style={{ borderColor: isUrgent ? 'rgba(239,68,68,0.35)' : 'rgba(0,140,229,0.2)' }}
        >
          <X className="w-6 h-6" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }} />
        </motion.button>
      </div>

      {/* Request card */}
      <div className="relative z-10 px-6 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isCritical ? { opacity: 1, y: [0, -1.2, 0, 1.2, 0] } : { opacity: 1, y: 0 }}
          transition={isCritical ? { duration: 0.28, repeat: Infinity } : undefined}
          className="relative overflow-hidden rounded-[32px] p-6 mb-5 border bg-white/92"
          style={{
            borderColor: isUrgent ? 'rgba(239,68,68,0.35)' : 'rgba(0,140,229,0.22)',
            boxShadow: isUrgent ? '0 20px 42px rgba(239,68,68,0.12)' : '0 20px 42px rgba(0,112,184,0.12)',
          }}
        >
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-[32px] border-2"
            style={{ borderColor: isUrgent ? 'rgba(239,68,68,0.28)' : 'rgba(0,140,229,0.2)' }}
            animate={{ opacity: [0.25, 0.75, 0.25] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />

          <div className="relative z-10 rounded-2xl px-4 py-3 mb-5 flex items-center gap-2" style={{ backgroundColor: isUrgent ? 'rgba(239,68,68,0.1)' : 'rgba(0,140,229,0.08)' }}>
            <AlertCircle className="w-4 h-4" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }} />
            <p className="text-sm font-semibold" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }}>
              New roadside request just came in. Claim it before another provider does.
            </p>
          </div>

          {/* Live route preview */}
          <div className="relative z-10 rounded-2xl p-4 mb-5 border" style={{ backgroundColor: '#F4FAFF', borderColor: 'rgba(0,140,229,0.18)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#0070B8' }}>Live Route Preview</p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: '#1A1F2E' }}>{requestData.distance}</span>
                <span style={{ color: '#CBD5E1' }}>|</span>
                <span className="text-xs font-semibold" style={{ color: '#1A1F2E' }}>{requestData.eta}</span>
              </div>
            </div>
            <div className="relative h-24 rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #E5F3FF, #F8FCFF)' }}>
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                <path d="M20 78 C80 18, 150 92, 278 24" fill="none" stroke="#008CE5" strokeOpacity="0.45" strokeWidth="4" strokeDasharray="7 6" />
              </svg>
              <motion.div
                className="absolute rounded-full"
                style={{ top: '66%', left: '6%', width: 10, height: 10, backgroundColor: '#008CE5', boxShadow: '0 0 0 6px rgba(0,140,229,0.18)' }}
                animate={{ left: ['6%', '82%'], top: ['66%', '28%'] }}
                transition={{ duration: 2.8, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute rounded-full"
                style={{ top: '67%', left: '5.4%', width: 12, height: 12, backgroundColor: '#0EA5E9' }}
                animate={{ scale: [1, 1.5, 1], opacity: [0.8, 0.2, 0.8] }}
                transition={{ duration: 1.1, repeat: Infinity }}
              />
              <motion.div
                className="absolute rounded-full"
                style={{ top: '22%', left: '86%', width: 12, height: 12, backgroundColor: '#EF4444' }}
                animate={{ scale: [1, 1.55, 1], opacity: [0.9, 0.35, 0.9] }}
                transition={{ duration: 1.3, repeat: Infinity }}
              />
            </div>
          </div>

          {/* Customer info */}
          <div className="relative z-10 flex items-center gap-4 mb-6 pb-6" style={{ borderBottom: '1px solid #E7EEF8' }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center relative" style={{ background: 'linear-gradient(135deg, #008CE5, #0070B8)' }}>
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-[#008CE5]"
                animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0.05, 0.6] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
              <User className="w-8 h-8 text-white relative z-10" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg" style={{ color: '#1A1F2E' }}>{requestData.customer}</h3>
              {requestData.isThirdParty && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertCircle className="w-4 h-4 text-[#F59E0B]" />
                  <span className="text-[#F59E0B] text-sm">Requesting for someone else</span>
                </div>
              )}
            </div>
          </div>

          {/* Service details */}
          <div className="relative z-10 space-y-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(0,140,229,0.12)' }}>
                <MapPin className="w-5 h-5" style={{ color: '#008CE5' }} />
              </div>
              <div className="flex-1">
                <p className="text-sm" style={{ color: '#8A96A8' }}>Service</p>
                <p className="font-semibold" style={{ color: '#1A1F2E' }}>{requestData.service}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(0,112,184,0.12)' }}>
                <Navigation className="w-5 h-5" style={{ color: '#0070B8' }} />
              </div>
              <div className="flex-1">
                <p className="text-sm" style={{ color: '#8A96A8' }}>Location</p>
                <p className="font-semibold" style={{ color: '#1A1F2E' }}>{requestData.location}</p>
                <p className="text-sm mt-1" style={{ color: '#008CE5' }}>{requestData.distance} away</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(34,197,94,0.12)' }}>
                <DollarSign className="w-5 h-5" style={{ color: '#16A34A' }} />
              </div>
              <div className="flex-1">
                <p className="text-sm" style={{ color: '#8A96A8' }}>Estimated Payout</p>
                <p className="font-bold text-2xl" style={{ color: '#16A34A' }}>{requestData.estimatedPayout}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {requestData.notes && (
            <div className="relative z-10 rounded-2xl p-4 border" style={{ backgroundColor: '#F8FBFF', borderColor: 'rgba(0,140,229,0.18)' }}>
              <p className="text-sm mb-2" style={{ color: '#7A889F' }}>Customer Notes</p>
              <p style={{ color: '#1A1F2E' }}>{requestData.notes}</p>
            </div>
          )}
        </motion.div>

        <div className="flex items-center gap-2 mb-3 px-1">
          <Clock className="w-4 h-4" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }} />
          <p className="text-sm font-semibold" style={{ color: isUrgent ? '#EF4444' : '#0070B8' }}>
            {isUrgent ? 'Final seconds. Accept now to claim this job.' : 'Tap Accept to notify customer and begin navigation.'}
          </p>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/provider/home')}
            className="rounded-[24px] py-5 font-bold text-[#64748B] text-lg border bg-white/90"
            style={{ borderColor: '#D8E2EF' }}
          >
            Decline
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            animate={isCritical
              ? { scale: [1, 1.04, 1], boxShadow: ['0 12px 30px rgba(239,68,68,0.35)', '0 16px 36px rgba(239,68,68,0.55)', '0 12px 30px rgba(239,68,68,0.35)'] }
              : { scale: [1, 1.02, 1], boxShadow: ['0 10px 28px rgba(0,140,229,0.3)', '0 14px 34px rgba(0,112,184,0.48)', '0 10px 28px rgba(0,140,229,0.3)'] }
            }
            transition={{ duration: isCritical ? 0.8 : 1.25, repeat: Infinity }}
            onClick={() => navigate('/provider/job/demo-job-123')}
            className="rounded-[24px] py-5 font-bold text-white text-lg"
            style={{ background: isCritical ? 'linear-gradient(to right, #EF4444, #F97316)' : 'linear-gradient(to right, #008CE5, #0070B8)' }}
          >
            Accept Request
          </motion.button>
        </div>
      </div>
    </div>
  );
}
