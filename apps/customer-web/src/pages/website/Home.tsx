import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Zap, Shield, Clock, Star, ArrowRight, Menu } from 'lucide-react';

export function WebsiteHome() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#008CE5] to-[#0070B8] bg-clip-text text-transparent">
            TORC
          </h1>
          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => navigate('/website/services')} className="text-gray-700 hover:text-gray-900 font-medium">
              Services
            </button>
            <button onClick={() => navigate('/website/pricing')} className="text-gray-700 hover:text-gray-900 font-medium">
              Pricing
            </button>
            <button onClick={() => navigate('/website/become-provider')} className="text-gray-700 hover:text-gray-900 font-medium">
              Become a Provider
            </button>
            <button onClick={() => navigate('/website/help')} className="text-gray-700 hover:text-gray-900 font-medium">
              Help
            </button>
            <button 
              onClick={() => navigate('/')}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white font-semibold hover:shadow-lg transition-all"
            >
              Get Started
            </button>
          </div>
          <button className="md:hidden p-2">
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </nav>

      {/* Hero section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-6xl font-bold text-gray-900 mb-6">
                Roadside Help,<br />
                <span className="bg-gradient-to-r from-[#008CE5] to-[#0070B8] bg-clip-text text-transparent">
                  Uber Fast
                </span>
              </h1>
              <p className="text-xl text-gray-600 mb-8">
                Premium roadside assistance that combines Uber's speed with AAA's reliability. Help arrives in minutes, not hours.
              </p>
              <div className="flex gap-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/')}
                  className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white font-bold text-lg shadow-2xl shadow-[#008CE5]/30"
                >
                  Get Help Now
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate('/website/services')}
                  className="px-8 py-4 rounded-2xl border-2 border-gray-300 text-gray-900 font-bold text-lg hover:border-gray-400"
                >
                  Learn More
                </motion.button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <div className="w-full aspect-square rounded-[48px] bg-gradient-to-br from-[#008CE5]/20 to-[#0070B8]/20 flex items-center justify-center">
                <Zap className="w-64 h-64 text-[#008CE5]" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-16">Why Choose TORC?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Zap, title: 'Lightning Fast', description: 'Average arrival time under 15 minutes' },
              { icon: Shield, title: 'Trusted & Safe', description: 'All providers verified & insured' },
              { icon: Clock, title: '24/7 Available', description: 'Help whenever you need it' },
            ].map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.2 }}
                  className="bg-white rounded-3xl p-8 shadow-lg hover:shadow-xl transition-shadow"
                >
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#008CE5] to-[#0070B8] flex items-center justify-center mb-6">
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                  <p className="text-gray-600">{feature.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Ready to Get Started?</h2>
          <p className="text-xl text-gray-600 mb-8">Download the TORC app and get help in minutes</p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/')}
            className="px-12 py-5 rounded-3xl bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white font-bold text-xl shadow-2xl shadow-[#008CE5]/30 inline-flex items-center gap-3"
          >
            Launch App <ArrowRight className="w-6 h-6" />
          </motion.button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#14263D] text-white py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-2xl font-bold mb-4">TORC</h3>
              <p className="text-white/60">Premium roadside assistance, reimagined.</p>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Product</h4>
              <ul className="space-y-2 text-white/60">
                <li><button onClick={() => navigate('/website/services')}>Services</button></li>
                <li><button onClick={() => navigate('/website/pricing')}>Pricing</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Company</h4>
              <ul className="space-y-2 text-white/60">
                <li><button onClick={() => navigate('/website/become-provider')}>Become a Provider</button></li>
                <li><button onClick={() => navigate('/website/help')}>Help Center</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Legal</h4>
              <ul className="space-y-2 text-white/60">
                <li>Privacy Policy</li>
                <li>Terms of Service</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 mt-8 pt-8 text-center text-white/40">
            © 2026 TORC. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
