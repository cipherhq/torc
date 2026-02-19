import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, User, UserPlus, ChevronRight } from 'lucide-react';
import { updateRequestContext } from '../../data/requestContext';
import { useState } from 'react';

export function WhoNeedsHelp() {
  const navigate = useNavigate();
  const [showNewPersonForm, setShowNewPersonForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

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
    <div className="min-h-screen bg-[#0A0F1E] flex flex-col relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#2EFFAF] opacity-10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <div className="relative z-10 p-6 flex items-center gap-4">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/home')}
          className="glass rounded-full p-3"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
        </motion.button>
        <h1 className="text-2xl font-bold text-white">Who needs help?</h1>
      </div>

      <div className="relative z-10 flex-1 px-6 pb-6">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-white/60 mb-6"
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
            className="w-full glass rounded-[32px] p-6 flex items-center gap-4 group"
          >
            <div 
              className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center flex-shrink-0"
              style={{
                boxShadow: '0 8px 24px rgba(46, 255, 175, 0.3)',
              }}
            >
              <User className="w-8 h-8 text-[#0A0F1E]" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-white font-semibold text-lg">Myself</h3>
              <p className="text-white/60 text-sm">I need help at my location</p>
            </div>
            <ChevronRight className="w-6 h-6 text-[#2EFFAF] group-hover:translate-x-2 transition-transform" />
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
              className="w-full glass rounded-[32px] p-6 flex items-center gap-4 group border-2 border-dashed border-white/20"
            >
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center flex-shrink-0">
                <UserPlus className="w-8 h-8 text-white/40" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-white font-semibold text-lg">Someone else</h3>
                <p className="text-white/60 text-sm">Add a new person</p>
              </div>
              <ChevronRight className="w-6 h-6 text-white/40 group-hover:translate-x-2 transition-transform" />
            </motion.button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-[32px] p-6 space-y-4"
            >
              <h3 className="text-white font-semibold text-lg mb-4">Add New Person</h3>
              <input
                type="text"
                placeholder="Full Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF] transition-colors"
              />
              <input
                type="tel"
                placeholder="Phone Number"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF] transition-colors"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNewPersonForm(false)}
                  className="flex-1 glass rounded-2xl py-3 text-white font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleNewPerson}
                  disabled={!newName || !newPhone}
                  className="flex-1 bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] rounded-2xl py-3 text-[#0A0F1E] font-semibold disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
