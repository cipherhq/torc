import { useNavigate } from 'react-router';
import { DollarSign, Clock, Shield, TrendingUp, ArrowLeft, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

export function WebsiteBecomeProvider() {
  const navigate = useNavigate();

  const benefits = [
    { icon: DollarSign, title: 'Earn Great Money', description: 'Average $30-50/hour' },
    { icon: Clock, title: 'Flexible Schedule', description: 'Work when you want' },
    { icon: Shield, title: 'Insurance Covered', description: 'Full liability protection' },
    { icon: TrendingUp, title: 'Grow Your Business', description: 'Access to steady clientele' },
  ];

  return (
    <div className="min-h-screen bg-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/website')} className="p-2 hover:bg-gray-100 rounded-xl">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] bg-clip-text text-transparent">
            TORC
          </h1>
        </div>
      </nav>

      <div className="pt-32 pb-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">Become a TORC Provider</h1>
            <p className="text-xl text-gray-600 mb-8">
              Join our network of trusted roadside assistance professionals
            </p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/provider/onboarding')}
              className="px-12 py-5 rounded-3xl bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-white font-bold text-xl shadow-2xl shadow-[#2EFFAF]/30 inline-flex items-center gap-3"
            >
              Start Application <ArrowRight className="w-6 h-6" />
            </motion.button>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-16">
            {benefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <div key={benefit.title} className="bg-gray-50 rounded-3xl p-8">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2EFFAF] to-[#007AFF] flex items-center justify-center mb-6">
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{benefit.title}</h3>
                  <p className="text-gray-600">{benefit.description}</p>
                </div>
              );
            })}
          </div>

          <div className="bg-gradient-to-br from-[#2EFFAF]/10 to-[#007AFF]/10 rounded-3xl p-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Requirements</h2>
            <ul className="space-y-3 text-gray-700">
              <li>• Valid driver's license</li>
              <li>• Vehicle registration and insurance</li>
              <li>• Towing credentials (if offering towing services)</li>
              <li>• Pass background check</li>
              <li>• Must be 21 years or older</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
