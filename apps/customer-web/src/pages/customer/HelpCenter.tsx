import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Search, MessageCircle, Phone, Mail, ChevronRight, HelpCircle, Shield, CreditCard, MapPin, Users, FileText, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { CustomerBottomNav } from '../../components/CustomerBottomNav';

export function HelpCenter() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.6)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';
  const { user, profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [myTickets, setMyTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const helpCategories = [
    {
      icon: Zap,
      title: 'Getting Started',
      color: 'from-[#008CE5] to-[#0070B8]',
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
      title: 'Account & Settings',
      color: 'from-orange-400 to-red-500',
      articles: [
        'Managing your account',
        'Requesting service for someone else',
        'Managing saved contacts',
        'Privacy and data settings',
      ],
    },
  ];

  const quickActions = [
    {
      icon: MessageCircle,
      title: 'Create Ticket',
      description: 'Send a support request',
      color: 'from-[#008CE5] to-[#0070B8]',
      action: () => {
        const form = document.getElementById('support-ticket-form');
        form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    },
    {
      icon: Phone,
      title: 'Call Us',
      description: '1-800-TORC-HELP',
      color: 'from-green-400 to-emerald-500',
      action: () => { window.location.href = 'tel:+18008672435'; },
    },
    {
      icon: Mail,
      title: 'Email',
      description: 'support@torcapp.com',
      color: 'from-purple-400 to-pink-500',
      action: () => { window.location.href = 'mailto:support@torcapp.com'; },
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

  useEffect(() => {
    if (!user) return;
    loadMyTickets();
  }, [user]);

  async function loadMyTickets() {
    if (!user) return;
    try {
      setLoadingTickets(true);
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, subject, status, priority, created_at, admin_note')
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setMyTickets(data || []);
    } catch (error) {
      console.warn('Failed to load support tickets:', error);
      setMyTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  }

  async function submitSupportTicket() {
    if (!user) return;
    const cleanSubject = subject.trim();
    const cleanDescription = description.trim();
    if (!cleanSubject || !cleanDescription) {
      setSubmitMessage('Please enter both subject and description.');
      return;
    }

    try {
      setSubmitting(true);
      setSubmitMessage(null);
      const requesterRole = profile?.role === 'provider' ? 'provider' : 'customer';
      const { error } = await supabase.from('support_tickets').insert({
        requester_id: user.id,
        requester_role: requesterRole,
        subject: cleanSubject,
        description: cleanDescription,
        priority,
        status: 'open',
      });
      if (error) throw error;

      setSubject('');
      setDescription('');
      setPriority('normal');
      setSubmitMessage('Support request submitted. Our team will respond shortly.');
      await loadMyTickets();
    } catch (error: any) {
      console.warn('Failed to create support ticket:', error);
      setSubmitMessage(error?.message || 'Could not submit support request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen pb-24"
      style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' }}>
      {/* Header */}
      <div className="sticky top-0 z-10" style={{ backgroundColor: isDark ? 'rgba(10,22,38,0.85)' : 'rgba(248,251,255,0.85)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}` }}>
        <div className="max-w-2xl mx-auto p-6" style={{ paddingTop: 'var(--safe-top)' }}>
          <div className="flex items-center gap-4 mb-4">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate('/profile')}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}
            >
              <ArrowLeft className="w-5 h-5" style={{ color: isDark ? '#FFFFFF' : '#14263D' }} />
            </motion.button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Help Center</h1>
              <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>We're here to help 24/7</p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for help..."
              className="w-full pl-12 pr-4 py-3 rounded-[20px] focus:outline-none focus:border-[#008CE5]/50"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`, color: isDark ? '#FFFFFF' : '#14263D' }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Quick Actions */}
        <div>
          <h2 className="font-bold text-lg mb-4" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Contact Support</h2>
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
                  className="rounded-[20px] p-5 text-left"
                  style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2'}` }}
                >
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-3`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-bold mb-1" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>{action.title}</h3>
                  <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>{action.description}</p>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Create ticket */}
        <div id="support-ticket-form" className="rounded-[24px] p-6" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(0,140,229,0.2)' : 'rgba(0,140,229,0.15)'}` }}>
          <h2 className="font-bold text-lg mb-1" style={{ color: isDark ? '#FFFFFF' : '#14263D' }}>Create Support Request</h2>
          <p className="text-sm mb-4" style={{ color: isDark ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>Send an issue to support with details so we can help quickly.</p>

          <div className="space-y-3">
            <div>
              <label className="text-sm mb-1 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Charged twice for a completed job"
                className="w-full px-4 py-3 rounded-[14px] focus:outline-none focus:border-[#008CE5]/50"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`, color: isDark ? '#FFFFFF' : '#14263D' }}
              />
            </div>
            <div>
              <label className="text-sm mb-1 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Priority</label>
              <select
                title="Ticket priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'normal' | 'high' | 'urgent')}
                className="w-full px-4 py-3 rounded-[14px] focus:outline-none focus:border-[#008CE5]/50"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`, color: isDark ? '#FFFFFF' : '#14263D' }}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="text-sm mb-1 block" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your issue in detail..."
                rows={4}
                className="w-full px-4 py-3 rounded-[14px] focus:outline-none focus:border-[#008CE5]/50"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2'}`, color: isDark ? '#FFFFFF' : '#14263D' }}
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={submitSupportTicket}
              disabled={submitting}
              className="w-full py-3 rounded-[16px] bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white font-bold disabled:opacity-60"
            >
              {submitting ? 'Submitting...' : 'Submit Support Request'}
            </motion.button>
            {submitMessage && <p className="text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280' }}>{submitMessage}</p>}
          </div>
        </div>

        {/* My support tickets */}
        <div>
          <h2 className="font-bold text-lg mb-4" style={{ color: textColor }}>My Support Requests</h2>
          <div className="space-y-3">
            {loadingTickets ? (
              <div className="rounded-[20px] p-4" style={{ color: subColor }}>Loading tickets...</div>
            ) : myTickets.length === 0 ? (
              <div className="rounded-[20px] p-4" style={{ color: subColor }}>No support requests yet.</div>
            ) : (
              myTickets.map((ticket) => (
                <div key={ticket.id} className="rounded-[20px] p-4" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="font-semibold" style={{ color: textColor }}>{ticket.subject}</p>
                    <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: subColor }}>{ticket.status}</span>
                  </div>
                  <p className="text-sm" style={{ color: subColor }}>Priority: {ticket.priority}</p>
                  <p className="text-xs mt-1" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>{new Date(ticket.created_at).toLocaleString()}</p>
                  {ticket.admin_note && (
                    <p className="text-sm mt-2 pt-2" style={{ color: subColor, borderTop: `1px solid ${cardBorder}` }}>
                      Admin note: {ticket.admin_note}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Help Categories */}
        <div>
          <h2 className="font-bold text-lg mb-4" style={{ color: textColor }}>Browse Topics</h2>
          <div className="space-y-3">
            {helpCategories.map((category, index) => {
              const Icon = category.icon;
              return (
                <motion.div
                  key={category.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.05 }}
                  className="rounded-[20px] p-5"
                  style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${category.color} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-bold text-lg" style={{ color: textColor }}>{category.title}</h3>
                  </div>
                  <div className="space-y-2">
                    {category.articles.map((article) => (
                      <motion.button
                        key={article}
                        whileHover={{ x: 4 }}
                        className="w-full flex items-center justify-between p-3 rounded-[12px] transition-colors"
                        style={{ color: subColor }}
                      >
                        <span className="text-sm">{article}</span>
                        <ChevronRight className="w-4 h-4" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
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
          <h2 className="font-bold text-lg mb-4" style={{ color: textColor }}>Frequently Asked Questions</h2>
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <motion.div
                key={faq.question}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.05 }}
                className="rounded-[20px] p-5"
                style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
              >
                <div className="flex gap-3 mb-2">
                  <HelpCircle className="w-5 h-5 text-[#008CE5] flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold mb-2" style={{ color: textColor }}>{faq.question}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: subColor }}>{faq.answer}</p>
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
          className="rounded-[24px] p-6 text-center"
          style={{ backgroundColor: cardBg, border: '1px solid rgba(0,140,229,0.3)' }}
        >
          <h3 className="font-bold text-lg mb-2" style={{ color: textColor }}>Still need help?</h3>
          <p className="text-sm mb-4" style={{ color: subColor }}>
            Our support team is available 24/7 to assist you
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              const form = document.getElementById('support-ticket-form');
              form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className="px-6 py-3 rounded-[20px] bg-gradient-to-r from-[#008CE5] to-[#0070B8] text-white font-bold"
          >
            Create Support Ticket
          </motion.button>
        </motion.div>
      </div>
      <CustomerBottomNav />
    </div>
  );
}
