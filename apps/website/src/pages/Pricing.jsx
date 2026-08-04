import { Link } from "react-router";
import {
  Truck, Fuel, BatteryCharging, KeyRound, CircleDot,
  Cable, Settings, Search, AlertTriangle, Bike, Zap, MessageCircle,
} from "lucide-react";
import { motion } from "motion/react";
import { WebsiteLayout } from "../components/WebsiteLayout";
import { AnimatedSection } from "../components/AnimatedSection";
import { websiteContent } from "../content/websiteContent";

const SERVICE_ICONS = {
  Towing: Truck,
  "Fuel Delivery": Fuel,
  "Jump Start & Battery": BatteryCharging,
  "Lockout Support": KeyRound,
  "Tire Assistance": CircleDot,
  "Winch Out": Cable,
  "Minor Repair": Settings,
  Diagnostic: Search,
  "Emergency Help": AlertTriangle,
  Motorcycle: Bike,
  "EV Charge": Zap,
  Consultation: MessageCircle,
};

const pricing = [
  { service: "Towing", range: "$75 – $250+", note: "Based on distance", popular: true },
  { service: "Fuel Delivery", range: "$45 – $75", note: "Plus fuel cost" },
  { service: "Jump Start & Battery", range: "$35 – $65", note: "On-site service" },
  { service: "Lockout Support", range: "$50 – $100", note: "No damage entry" },
  { service: "Tire Assistance", range: "$45 – $85", note: "Spare swap or patch" },
  { service: "Winch Out", range: "$75 – $200", note: "Varies by situation" },
  { service: "Minor Repair", range: "$60 – $150", note: "Parts extra" },
  { service: "Diagnostic", range: "$40 – $80", note: "Mobile inspection" },
  { service: "Emergency Help", range: "$50 – $150", note: "Depends on service" },
  { service: "Motorcycle", range: "$85 – $275", note: "Specialized transport" },
  { service: "EV Charge", range: "$55 – $100", note: "Portable charging" },
  { service: "Consultation", range: "$25 – $50", note: "Expert advice" },
];

const pricingFaq = [
  { q: "How is pricing determined?", a: "Pricing is based on the service type, your location, time of day, and distance. You'll always see an estimate before confirming your request." },
  { q: "Are there hidden fees?", a: "No. TORC believes in transparent pricing. The price you see is the price you pay. Any adjustments are clearly communicated before proceeding." },
  { q: "When do I pay?", a: "Payment is processed securely through the app after the service is completed. You'll receive an itemized digital receipt." },
  { q: "Do prices change at night?", a: "Some services may have a slight after-hours surcharge during late night/early morning hours. This will be reflected in your estimate." },
];

export function Pricing() {
  return (
    <WebsiteLayout>
      {/* Hero */}
      <section className="relative pt-32 pb-20 bg-gradient-to-br from-navy via-navy-light to-navy">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-brand/30 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <AnimatedSection>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
              Transparent Pricing
            </h1>
            <p className="mt-4 text-lg text-gray-300 max-w-2xl mx-auto">
              No hidden fees. No surprises. See estimated costs before you confirm your request.
            </p>
          </AnimatedSection>
        </div>
      </section>

      {/* Pricing Grid */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-navy tracking-tight">
              Service Pricing Estimates
            </h2>
            <p className="mt-3 text-gray-500 max-w-lg mx-auto">
              Actual prices may vary based on location, distance, and service conditions.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {pricing.map((item, i) => {
              const Icon = SERVICE_ICONS[item.service] || Settings;
              return (
                <AnimatedSection key={item.service} delay={i * 0.05}>
                  <motion.div
                    whileHover={{ y: -4 }}
                    className={`relative bg-white rounded-2xl p-6 border transition-all h-full ${
                      item.popular
                        ? "border-brand shadow-lg shadow-brand/10"
                        : "border-gray-100 hover:border-brand/20"
                    }`}
                  >
                    {item.popular && (
                      <span className="absolute -top-3 left-6 bg-brand text-white text-xs font-bold px-3 py-1 rounded-full">
                        Most Popular
                      </span>
                    )}
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-lg bg-brand-glow flex items-center justify-center flex-shrink-0">
                        <Icon size={22} className="text-brand" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-navy">{item.service}</h3>
                        <p className="text-xl font-extrabold text-navy mt-1">{item.range}</p>
                        <p className="text-sm text-gray-400 mt-0.5">{item.note}</p>
                      </div>
                    </div>
                  </motion.div>
                </AnimatedSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* How pricing works */}
      <section className="py-16 sm:py-24 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <AnimatedSection>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-navy text-center mb-10">
              How Pricing Works
            </h2>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { num: "1", title: "Get Estimate", desc: "See a clear price estimate based on your service and location before confirming." },
              { num: "2", title: "Service Delivered", desc: "Your provider arrives and completes the job. No payment until the work is done." },
              { num: "3", title: "Pay in App", desc: "Secure payment processed through the app with a detailed receipt sent instantly." },
            ].map((step, i) => (
              <AnimatedSection key={step.num} delay={i * 0.1}>
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-brand text-white flex items-center justify-center text-lg font-bold mx-auto mb-4 shadow-md shadow-brand/20">
                    {step.num}
                  </div>
                  <h3 className="font-bold text-navy mb-2">{step.title}</h3>
                  <p className="text-gray-500 text-sm">{step.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <AnimatedSection>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-navy text-center mb-8">
              Pricing FAQ
            </h2>
          </AnimatedSection>
          <AnimatedSection delay={0.1}>
            <div className="space-y-6">
              {pricingFaq.map((faq, i) => (
                <div key={i} className="bg-gray-50 rounded-2xl p-6">
                  <h3 className="font-bold text-navy mb-2">{faq.q}</h3>
                  <p className="text-gray-500 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24 bg-gradient-to-br from-navy via-navy-light to-navy overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-brand/20 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <AnimatedSection>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Get Help Now
            </h2>
            <p className="mt-4 text-lg text-gray-300">
              Download TORC and see exact pricing for your situation.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <motion.a
                href={websiteContent.links.downloadApp}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center px-8 py-3.5 bg-brand text-white font-semibold rounded-full text-lg hover:bg-brand-bright transition-colors shadow-lg shadow-brand/25"
              >
                Get The App
              </motion.a>
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link
                  to="/services"
                  className="inline-flex items-center px-8 py-3.5 border-2 border-white/30 text-white font-semibold rounded-full text-lg hover:bg-white/10 transition-colors"
                >
                  View All Services
                </Link>
              </motion.div>
            </div>
          </AnimatedSection>
        </div>
      </section>
    </WebsiteLayout>
  );
}
