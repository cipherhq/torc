import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { Search, MessageCircle, Phone, Mail, ChevronDown, ChevronRight, HelpCircle, Shield, CreditCard, MapPin, Users, FileText, Zap, Send } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
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
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [ticketReplies, setTicketReplies] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const helpCategories = [
    {
      icon: Zap,
      title: 'Getting Started',
      color: 'from-[#008CE5] to-[#0070B8]',
      articles: [
        { title: 'How to request roadside assistance', content: 'Open the TORC app and tap "Get Help Now" on the home screen. Select the service you need (towing, jump start, tire change, etc.), confirm your service location, add any special notes, and tap "Request Service". A nearby provider will be matched to you within minutes.' },
        { title: 'Understanding service pricing', content: 'Each service has a base price shown before you confirm your request. Additional fees may include a Torc fee (percentage of base price), applicable taxes, a scheduling fee for pre-booked services, and a hazard location surcharge if applicable. The total estimate is displayed on the confirmation screen before you submit.' },
        { title: 'Service area coverage', content: 'TORC is available in major metropolitan areas and surrounding regions. When you open the app, your location is detected automatically. If service is unavailable in your area, you will see a notification. We are continuously expanding our coverage — check back regularly for updates.' },
        { title: 'Payment methods accepted', content: 'We accept all major credit and debit cards (Visa, Mastercard, American Express, Discover), Apple Pay, and Google Pay. You can manage your saved payment methods from your profile. Payment is processed automatically after your service is completed.' },
      ],
    },
    {
      icon: Shield,
      title: 'Safety & Trust',
      color: 'from-green-400 to-emerald-500',
      articles: [
        { title: 'Provider background checks', content: 'Every TORC provider undergoes a comprehensive screening process before being approved. This includes a criminal background check, driving record review, identity verification, and credential validation. Providers must also maintain valid insurance and professional licensing for the services they offer.' },
        { title: 'Insurance and liability coverage', content: 'All services performed through TORC are covered by provider liability insurance. Providers are required to maintain active commercial auto insurance and general liability coverage. In the event of any damage during service, our support team will assist with the claims process.' },
        { title: 'Emergency safety features', content: 'During an active service, you can call 911 directly from the app using the emergency button. Your real-time location is shared with your provider for accurate arrival. You can also share your live tracking link with a friend or family member so they can monitor your service in real time.' },
        { title: 'Report a safety concern', content: 'If you ever feel unsafe during a service, tap the emergency button in the app to call 911 immediately. After a service, you can report safety concerns through the rating screen or by creating a support ticket marked as "Urgent" priority. Our safety team reviews all reports within 24 hours.' },
      ],
    },
    {
      icon: CreditCard,
      title: 'Payments & Billing',
      color: 'from-purple-400 to-pink-500',
      articles: [
        { title: 'How charges are calculated', content: 'Your total is calculated as: Base Price (set per service type) + Torc Fee (percentage of base price) + Tax (applied to subtotal). Optional add-ons include a hazard location fee for dangerous roadside locations and a scheduling fee for pre-booked appointments. The full breakdown is shown on your receipt after service completion.' },
        { title: 'Managing payment methods', content: 'Go to your Profile and tap "Payment Methods" to add, edit, or remove cards. You can set a default payment method that will be used for all future requests. We support adding multiple cards so you can switch between them when placing a request.' },
        { title: 'Receipts and invoices', content: 'After every completed service, a detailed receipt is emailed to your registered email address. You can also view past receipts in the app by going to your job history. Each receipt includes the service type, base price, fees, taxes, total amount, provider name, and date of service.' },
        { title: 'Refund and cancellation policy', content: 'You can cancel a request at no charge before a provider accepts it. If you cancel after a provider has been dispatched, a cancellation fee (percentage of the base price) may apply. Refund requests for completed services can be submitted through our support ticket system and are reviewed on a case-by-case basis within 3-5 business days.' },
      ],
    },
    {
      icon: MapPin,
      title: 'Services',
      color: 'from-blue-400 to-cyan-500',
      articles: [
        { title: 'Available services explained', content: 'TORC offers a range of roadside assistance services including: Towing (transport your vehicle to a shop or destination), Jump Start (battery boost), Lockout (unlock your vehicle), Fuel Delivery (gas or diesel brought to you), Tire Change (swap to your spare), Winch Out (vehicle extraction), Minor Repair (basic on-site fixes), and EV Charge (mobile charging for electric vehicles).' },
        { title: 'Service time estimates', content: 'Average provider arrival time is 15-30 minutes depending on your location, time of day, and provider availability. After you confirm a request, the app shows a real-time ETA based on the matched provider\'s current distance. Most standard services (jump start, tire change, lockout) are completed in 15-45 minutes. Towing times vary based on destination distance.' },
        { title: 'Tracking your provider', content: 'Once a provider accepts your request, you can track their live location on the map in real time. The app shows their ETA, vehicle details, name, and rating. You will receive notifications when the provider is en route, has arrived, and when service is complete. You can also call or message the provider directly through the app.' },
        { title: 'Special requests and notes', content: 'When creating a service request, use the "Notes" field to provide helpful details for your provider. Examples: "Vehicle is in the parking garage, level 3", "Flat tire is on the rear driver side", or "I am waiting inside the gas station." Clear notes help your provider find you faster and come prepared with the right tools.' },
      ],
    },
    {
      icon: Users,
      title: 'Account & Settings',
      color: 'from-orange-400 to-red-500',
      articles: [
        { title: 'Managing your account', content: 'Access your account settings from the Profile tab. Here you can update your name, email, phone number, and profile photo. You can also change your password from the Account Security section. To delete your account, please contact our support team through a support ticket.' },
        { title: 'Requesting service for someone else', content: 'When creating a request, select "Someone Else" as the requester type. Enter the person\'s name and phone number so the provider can contact them directly. This is useful when requesting help for a family member, friend, or employee who is stranded. The bill is charged to your payment method.' },
        { title: 'Managing saved contacts', content: 'Frequently request help for someone else? Save their contact details in the "Someone Else" flow so you can quickly select them next time. Saved contacts include name and phone number. You can add, edit, or remove saved contacts at any time.' },
        { title: 'Privacy and data settings', content: 'TORC takes your privacy seriously. Your location is only shared with a provider during an active service request. Personal information is encrypted and never sold to third parties. You can request a copy of your data or request account deletion by contacting support. For full details, see our Privacy Policy at torcapp.com/privacy.' },
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

  async function loadReplies(ticketId: string) {
    try {
      const { data, error } = await supabase
        .from('ticket_replies')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });
      if (error) {
        if (error.code === '42P01') { setTicketReplies([]); return; }
        throw error;
      }
      setTicketReplies(data || []);
    } catch {
      setTicketReplies([]);
    }
  }

  async function sendTicketReply(ticketId: string) {
    if (!user || !replyText.trim()) return;
    try {
      setSendingReply(true);
      const { error } = await supabase.from('ticket_replies').insert({
        ticket_id: ticketId,
        sender_id: user.id,
        sender_role: profile?.role || 'customer',
        message: replyText.trim(),
      });
      if (error) throw error;
      setReplyText('');
      await loadReplies(ticketId);
    } catch (e: any) {
      console.warn('Failed to send reply:', e);
    } finally {
      setSendingReply(false);
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
    <div className="min-h-screen"
      style={{ background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)' , paddingBottom: 'calc(96px + var(--safe-bottom, 0px))' }}>
      <PageHeader title="Help Center" onBack={() => navigate('/profile')} />

      <div className="max-w-2xl mx-auto px-6 space-y-8" style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }}>
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
                <div key={ticket.id} className="rounded-[20px] overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${expandedTicket === ticket.id ? '#008CE5' : cardBorder}` }}>
                  <button
                    className="w-full text-left p-4"
                    onClick={() => {
                      if (expandedTicket === ticket.id) {
                        setExpandedTicket(null);
                        setTicketReplies([]);
                      } else {
                        setExpandedTicket(ticket.id);
                        loadReplies(ticket.id);
                      }
                      setReplyText('');
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <p className="font-semibold" style={{ color: textColor }}>{ticket.subject}</p>
                      <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: subColor }}>{ticket.status}</span>
                    </div>
                    <p className="text-sm" style={{ color: subColor }}>Priority: {ticket.priority}</p>
                    <p className="text-xs mt-1" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>{new Date(ticket.created_at).toLocaleString()}</p>
                  </button>

                  {expandedTicket === ticket.id && (
                    <div className="px-4 pb-4 pt-0" style={{ borderTop: `1px solid ${cardBorder}` }}>
                      {/* Replies thread */}
                      <div className="mt-3 space-y-2 max-h-[250px] overflow-y-auto">
                        {ticketReplies.length === 0 ? (
                          <p className="text-xs text-center py-3" style={{ color: subColor }}>No replies yet — our team will respond soon.</p>
                        ) : (
                          ticketReplies.map((r: any) => {
                            const isMe = r.sender_id === user?.id;
                            return (
                              <div key={r.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${isMe ? '' : ''}`}
                                  style={{
                                    backgroundColor: isMe ? '#008CE5' : (isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6'),
                                    color: isMe ? '#FFFFFF' : textColor,
                                  }}
                                >
                                  <p className="text-[10px] font-semibold mb-0.5" style={{ color: isMe ? 'rgba(255,255,255,0.7)' : '#008CE5' }}>
                                    {isMe ? 'You' : 'TORC Support'}
                                  </p>
                                  <p className="text-sm">{r.message}</p>
                                  <p className="text-[10px] mt-1" style={{ color: isMe ? 'rgba(255,255,255,0.5)' : (isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF') }}>
                                    {new Date(r.created_at).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* Reply input */}
                      {ticket.status !== 'closed' && (
                        <div className="flex items-center gap-2 mt-3">
                          <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Type a reply..."
                            className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none"
                            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6', color: textColor, border: `1px solid ${cardBorder}` }}
                            onKeyDown={(e) => { if (e.key === 'Enter') sendTicketReply(ticket.id); }}
                          />
                          <button
                            disabled={sendingReply || !replyText.trim()}
                            onClick={() => sendTicketReply(ticket.id)}
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                            style={{ backgroundColor: '#008CE5' }}
                          >
                            <Send className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      )}
                    </div>
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
            {helpCategories.filter((cat) => {
              if (!searchQuery.trim()) return true;
              const q = searchQuery.toLowerCase();
              return cat.title.toLowerCase().includes(q) || cat.articles.some(a => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q));
            }).map((category, index) => {
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
                  <div className="space-y-1">
                    {category.articles.map((article) => {
                      const articleKey = `${category.title}-${article.title}`;
                      const isOpen = expandedArticle === articleKey;
                      return (
                        <div key={article.title}>
                          <button
                            onClick={() => setExpandedArticle(isOpen ? null : articleKey)}
                            className="w-full flex items-center justify-between p-3 rounded-[12px] transition-colors text-left"
                            style={{ backgroundColor: isOpen ? (isDark ? 'rgba(0,140,229,0.08)' : 'rgba(0,140,229,0.05)') : 'transparent' }}
                          >
                            <span className="text-sm font-medium" style={{ color: isOpen ? '#008CE5' : subColor }}>{article.title}</span>
                            {isOpen
                              ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#008CE5' }} />
                              : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
                            }
                          </button>
                          {isOpen && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="px-3 pb-3"
                            >
                              <p className="text-sm leading-relaxed" style={{ color: subColor }}>{article.content}</p>
                            </motion.div>
                          )}
                        </div>
                      );
                    })}
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
            {faqs.filter((f) => {
              if (!searchQuery.trim()) return true;
              const q = searchQuery.toLowerCase();
              return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q);
            }).map((faq, index) => (
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
