import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search, MessageCircle, Phone, Mail, ChevronRight, HelpCircle, Shield, CreditCard, MapPin, Users, FileText, Zap } from 'lucide-react';
import { useState } from 'react';

export function HelpCenter() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const helpCategories = [
    {
      icon: Zap,
      title: 'Getting Started',
      color: 'from-[#2EFFAF] to-[#007AFF]',
      articles: [
        'How to request roadside assistance',
        'Understanding service pricing',
        'Service area coverage',
        'Payment methods accepted',
      ],
    },
    {
      icon: Shield,
      title: 'Safety & Trust',
      color: 'from-green-400 to-emerald-500',
      articles: [
        'Provider background checks',
        'Insurance and liability coverage',
        'Emergency safety features',
        'Report a safety concern',
      ],
    },
    {
      icon: CreditCard,
      title: 'Payments & Billing',
      color: 'from-purple-400 to-pink-500',
      articles: [
        'How charges are calculated',
        'Managing payment methods',
        'Receipts and invoices',
        'Refund and cancellation policy',
      ],
    },
    {
      icon: MapPin,
      title: 'Services',
      color: 'from-blue-400 to-cyan-500',
      articles: [
        'Available services explained',
        'Service time estimates',
        'Tracking your provider',
        'Special requests and notes',
      ],
    },
    {
      icon: Users,
      title: 'Account & Family',
      color: 'from-orange-400 to-red-500',
      articles: [
        'Managing your account',
        'Family account features',
        'Adding family members',
        'Privacy and data settings',
      ],
    },
  ];

  const quickActions = [
    {
      icon: MessageCircle,
      title: 'Live Chat',
      description: '24/7 support chat',
      color: 'from-[#2EFFAF] to-[#007AFF]',
      action: () => {},
    },
    {
      icon: Phone,
      title: 'Call Us',
      description: '1-800-TORC-HELP',
      color: 'from-green-400 to-emerald-500',
      action: () => {},
    },
    {
      icon: Mail,
      title: 'Email',
      description: 'support@torc.com',
      color: 'from-purple-400 to-pink-500',
      action: () => {},
    },
  ];

  const faqs = [
    {
      question: 'How quickly can I get help?',
      answer: 'Average wait time is 15-30 minutes depending on your location and service type. We show estimated arrival time before you confirm.',
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit cards, debit cards, Apple Pay, and Google Pay. Payment is processed automatically after service completion.',
    },
    {
      question: 'Can I cancel after requesting service?',
      answer: 'Yes, you can cancel anytime before the provider arrives with no charge. Cancellations after provider arrival may incur a small fee.',
    },
    {
      question: 'Are providers background checked?',
      answer: 'Yes, all TORC providers undergo comprehensive background checks, driving record reviews, and insurance verification before approval.',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1E2433] via-[#252B3D] to-[#2F3548] pb-24">
      {/* Header */}
      <div className="glass-light border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto p-6">
          <div className="flex items-center gap-4 mb-4">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate('/profile')}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </motion.button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">Help Center</h1>
              <p className="text-white/70 text-sm">We're here to help 24/7</p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for help..."
              className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-[20px] text-white placeholder-white/40 focus:outline-none focus:border-[#2EFFAF]/50"
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Quick Actions */}
        <div>
          <h2 className="text-white font-bold text-lg mb-4">Contact Support</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <motion.button
                  key={action.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={action.action}
                  className="glass-light rounded-[20px] p-5 text-left"
                >
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-3`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-white font-bold mb-1">{action.title}</h3>
                  <p className="text-white/60 text-sm">{action.description}</p>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Help Categories */}
        <div>
          <h2 className="text-white font-bold text-lg mb-4">Browse Topics</h2>
          <div className="space-y-3">
            {helpCategories.map((category, index) => {
              const Icon = category.icon;
              return (
                <motion.div
                  key={category.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.05 }}
                  className="glass-light rounded-[20px] p-5"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${category.color} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-white font-bold text-lg">{category.title}</h3>
                  </div>
                  <div className="space-y-2">
                    {category.articles.map((article) => (
                      <motion.button
                        key={article}
                        whileHover={{ x: 4 }}
                        className="w-full flex items-center justify-between p-3 rounded-[12px] hover:bg-white/5 transition-colors"
                      >
                        <span className="text-white/70 text-sm">{article}</span>
                        <ChevronRight className="w-4 h-4 text-white/40" />
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* FAQs */}
        <div>
          <h2 className="text-white font-bold text-lg mb-4">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.05 }}
                className="glass-light rounded-[20px] p-5"
              >
                <div className="flex gap-3 mb-2">
                  <HelpCircle className="w-5 h-5 text-[#2EFFAF] flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-white font-bold mb-2">{faq.question}</h3>
                    <p className="text-white/70 text-sm leading-relaxed">{faq.answer}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Still Need Help */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="glass rounded-[24px] p-6 border border-[#2EFFAF]/30 text-center"
        >
          <h3 className="text-white font-bold text-lg mb-2">Still need help?</h3>
          <p className="text-white/70 text-sm mb-4">
            Our support team is available 24/7 to assist you
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-[#0F1419] font-bold"
          >
            Start Live Chat
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
