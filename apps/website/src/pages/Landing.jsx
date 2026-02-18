import { motion } from 'motion/react';
import { Battery, Fuel, Truck, Wrench, Shield, Clock } from 'lucide-react';

export function Landing() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4">
        <div className="max-w-6xl mx-auto text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-6xl md:text-8xl font-bold mb-6"
            style={{
              background: 'linear-gradient(135deg, #2EFFAF 0%, #007AFF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Torc
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-2xl md:text-3xl text-white/90 mb-8"
          >
            On-Demand Roadside Assistance
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-white/70 mb-12 max-w-2xl mx-auto"
          >
            Get help on the road instantly. Battery jump, fuel delivery, towing, and more. Professional providers ready 24/7.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex gap-4 justify-center"
          >
            <a
              href="https://apps.apple.com"
              className="px-8 py-4 bg-[#2EFFAF] text-[#1A1F2E] rounded-full font-semibold hover:bg-[#2EFFAF]/90 transition-colors"
            >
              Download App
            </a>
            <a
              href="/become-provider"
              className="px-8 py-4 glass-bright text-white rounded-full font-semibold hover:bg-white/20 transition-colors"
            >
              Become a Provider
            </a>
          </motion.div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12 text-white">Our Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Battery, title: 'Jump Start', desc: 'Dead battery? We\'ll get you running' },
              { icon: Fuel, title: 'Fuel Delivery', desc: 'Emergency fuel delivery to your location' },
              { icon: Truck, title: 'Towing', desc: 'Safe and reliable towing services' },
              { icon: Wrench, title: 'Minor Repairs', desc: 'On-the-spot fixes for common issues' },
              { icon: Shield, title: 'Lockout Service', desc: 'Locked out? We can help' },
              { icon: Clock, title: '24/7 Support', desc: 'Help available anytime, anywhere' },
            ].map((service, i) => (
              <motion.div
                key={service.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                viewport={{ once: true }}
                className="glass-bright p-8 rounded-3xl"
              >
                <service.icon className="w-12 h-12 text-[#2EFFAF] mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">{service.title}</h3>
                <p className="text-white/70">{service.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-black/20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-12 text-white">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { num: '1', title: 'Request Help', desc: 'Select your service and location' },
              { num: '2', title: 'Get Matched', desc: 'Connect with nearby providers' },
              { num: '3', title: 'Get Fixed', desc: 'Professional help arrives quickly' },
            ].map((step) => (
              <div key={step.num} className="text-center">
                <div className="w-16 h-16 bg-[#2EFFAF] rounded-full flex items-center justify-center text-2xl font-bold text-[#1A1F2E] mx-auto mb-4">
                  {step.num}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{step.title}</h3>
                <p className="text-white/70">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
