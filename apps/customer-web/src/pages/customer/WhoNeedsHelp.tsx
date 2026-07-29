import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { User, UserPlus, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { updateRequestContext, resetRequestContext } from '../../data/requestContext';
import { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';

export function WhoNeedsHelp() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [showNewPersonForm, setShowNewPersonForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Reset stale data from any previous booking flow
  useEffect(() => { resetRequestContext(); }, []);

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.5)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';
  const mutedColor = isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF';
  const inputBg = isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';

  const handleSelect = (who: 'me' | 'new', personData?: any) => {
    updateRequestContext({
      whoNeedsHelp: who,
      personName: personData?.name,
      personPhone: personData?.phone,
    });
    navigate('/confirm-location');
  };

  const handleNewPerson = () => {
    handleSelect('new', { name: newName, phone: newPhone });
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      {/* Background */}
      {isDark && (
        <div className="absolute inset-0">
          <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#008CE5] opacity-10 blur-[120px] rounded-full" />
        </div>
      )}

      <PageHeader title="Who needs help?" onBack={() => navigate('/home')} />

      <div className="relative z-10 flex-1 px-6 pb-6" style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }}>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6"
          style={{ color: subColor }}
        >
          Select who the rescue is for
        </motion.p>

        <div className="space-y-4">
          {/* Me */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSelect('me')}
            className="w-full rounded-2xl p-6 flex items-center gap-4 group active:opacity-80 cursor-pointer"
            style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
          >
            <div
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center flex-shrink-0"
              style={{
                boxShadow: '0 8px 24px rgba(46, 255, 175, 0.3)',
              }}
            >
              <User className="w-8 h-8 text-[#081427]" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-semibold text-lg" style={{ color: textColor }}>Myself</h3>
              <p className="text-sm" style={{ color: subColor }}>I need help at my location</p>
            </div>
            <ChevronRight className="w-6 h-6 text-[#008CE5] group-hover:translate-x-2 transition-transform" />
          </motion.button>

          {/* New person */}
          {!showNewPersonForm ? (
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowNewPersonForm(true)}
              className="w-full rounded-2xl p-6 flex items-center gap-4 group active:opacity-80 cursor-pointer"
              style={{ backgroundColor: cardBg, border: `2px dashed ${cardBorder}` }}
            >
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }}>
                <UserPlus className="w-8 h-8" style={{ color: mutedColor }} />
              </div>
              <div className="flex-1 text-left">
                <h3 className="font-semibold text-lg" style={{ color: textColor }}>Someone else</h3>
                <p className="text-sm" style={{ color: subColor }}>Add a new person</p>
              </div>
              <ChevronRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" style={{ color: mutedColor }} />
            </motion.button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-6 space-y-4"
              style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
            >
              <h3 className="font-semibold text-lg mb-4" style={{ color: textColor }}>Add New Person</h3>
              <input
                type="text"
                placeholder="Full Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-2xl px-4 py-3 focus:outline-none focus:border-[#008CE5] transition-colors"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
              />
              <input
                type="tel"
                placeholder="Phone Number"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full rounded-2xl px-4 py-3 focus:outline-none focus:border-[#008CE5] transition-colors"
                style={{ backgroundColor: inputBg, border: `1px solid ${inputBorder}`, color: textColor }}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNewPersonForm(false)}
                  className="flex-1 rounded-2xl py-3 font-semibold"
                  style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, color: textColor }}
                >
                  Cancel
                </button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={handleNewPerson}
                  disabled={!newName || !newPhone}
                  className="flex-1 bg-gradient-to-r from-[#008CE5] to-[#0070B8] rounded-2xl py-3 text-[#081427] font-semibold disabled:opacity-50"
                  style={{ boxShadow: '0 8px 24px rgba(78,205,196,0.4)' }}
                >
                  Continue
                </motion.button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
