import { useNavigate } from 'react-router';
import { HelpCircle, ChevronDown, ChevronRight, Phone, Mail, MessageCircle, DollarSign, FileText, Wrench, Zap, Users, Send } from 'lucide-react';
import { motion } from 'motion/react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { supabase } from '../../lib/supabase';
import { useEffect, useState } from 'react';

export function HelpSupport() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user, profile } = useAuth();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [ticketReplies, setTicketReplies] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const textColor = isDark ? '#FFFFFF' : '#14263D';
  const subColor = isDark ? 'rgba(255,255,255,0.6)' : '#6B7280';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2';

  const helpCategories = [
    {
      icon: Zap,
      title: 'Getting Started',
      color: 'from-[#008CE5] to-[#0070B8]',
      articles: [
        { title: 'How to set up your provider account', content: 'After signing up and verifying your email, complete the three onboarding steps: select the services you can provide, upload required documents (license, insurance, credentials), and set up your payout method. Once your documents are verified by our team, you can go online and start receiving job requests.' },
        { title: 'Selecting your services', content: 'Go to the Services section from onboarding or your profile. Choose all the service types you are qualified and equipped to provide (towing, jump start, lockout, tire change, etc.). You can update your service selections at any time. Only jobs matching your selected services will be sent to you.' },
        { title: 'Going online and receiving jobs', content: 'From the Home screen, tap the power button to go online. Your location is shared with the system so nearby customers can be matched to you. When a job request comes in, you will receive an audio alert and a notification with the job details, distance, and payout. You have 30 seconds to accept or decline.' },
        { title: 'Understanding the job flow', content: 'When you accept a job: navigate to the customer (En Route) → tap "I\'ve Arrived" when on-site → tap "Start Service" to begin work → complete the service and take completion photos → tap "Complete Job". The customer is notified at each step. Payment is processed automatically after completion.' },
      ],
    },
    {
      icon: DollarSign,
      title: 'Earnings & Payouts',
      color: 'from-green-400 to-emerald-500',
      articles: [
        { title: 'How earnings are calculated', content: 'Your payout for each job is the total job amount minus the platform commission (shown in your app settings). The platform commission covers payment processing, insurance, customer support, and app operations. Your net earnings are displayed on the job completion screen and in your Earnings dashboard.' },
        { title: 'Setting up payout methods', content: 'Go to Profile → Bank Accounts to add your payout method. You can add a bank account using your routing and account numbers, or connect via supported payment providers. Payouts are sent to your default payout method. You can update or change your payout method at any time.' },
        { title: 'When do I get paid?', content: 'Earnings are accumulated in your balance as you complete jobs. Payouts are processed on a regular schedule (weekly or bi-weekly depending on platform settings). You can view your payout history, pending balance, and completed payouts from the Earnings section in your profile.' },
        { title: 'Understanding your earnings dashboard', content: 'The Earnings page shows your today\'s earnings, total completed jobs, your average rating, and a history of all completed jobs with individual payouts. You can track your daily, weekly, and monthly performance to plan your schedule and maximize your income.' },
      ],
    },
    {
      icon: FileText,
      title: 'Documents & Verification',
      color: 'from-purple-400 to-pink-500',
      articles: [
        { title: 'Required documents', content: 'To become an approved provider, you must upload: a valid driver\'s license, vehicle registration, proof of insurance (commercial auto liability), and any professional credentials or certifications for the services you offer (e.g., towing license). All documents are reviewed by our verification team.' },
        { title: 'Document verification process', content: 'After uploading your documents, our team reviews them within 1-3 business days. You will be notified when your documents are approved or if additional information is needed. You can check your verification status on the Documents page. Once all documents are approved, you can go online.' },
        { title: 'Updating expired documents', content: 'It is your responsibility to keep documents current. When a license, insurance policy, or credential expires, upload the renewed version through Profile → Documents. Expired documents may result in your account being temporarily suspended until updated documents are verified.' },
        { title: 'Background check information', content: 'TORC requires a background check as part of the provider approval process. This includes a criminal history check and driving record review. The background check is initiated after you submit your documents. Results are typically available within 3-5 business days.' },
      ],
    },
    {
      icon: Wrench,
      title: 'On the Job',
      color: 'from-blue-400 to-cyan-500',
      articles: [
        { title: 'Navigating to the customer', content: 'After accepting a job, tap "Navigate" to open turn-by-turn directions to the customer\'s pickup location. The app shows the customer\'s address and live distance. The customer can see your ETA in real time. Contact the customer via in-app call or message if you need clarification on their exact location.' },
        { title: 'Communicating with customers', content: 'Use the in-app Call or Message buttons on the active job screen to contact your customer. All communications are routed through the app for privacy. Common reasons to contact: clarify exact location, inform about delays, confirm vehicle details, or ask about the issue.' },
        { title: 'Completion photos', content: 'After completing a service, you are required to take at least one completion photo before marking the job as done. Photos serve as proof of service and help resolve any disputes. Take clear photos showing the completed work (e.g., changed tire, jump-started vehicle, delivered fuel).' },
        { title: 'Cancelling a job', content: 'If you need to cancel an accepted job, tap "Cancel Job" on the active job screen and select a reason. Valid reasons include vehicle breakdown, unsafe location, customer unreachable, wrong service type, or personal emergency. Excessive cancellations may affect your account standing.' },
      ],
    },
    {
      icon: Users,
      title: 'Account & Profile',
      color: 'from-orange-400 to-red-500',
      articles: [
        { title: 'Managing your profile', content: 'Access your profile settings by tapping the gear icon on the Home screen. You can update your personal information, phone number, profile photo, and account security settings. Keep your contact information current so customers and support can reach you.' },
        { title: 'Ratings and reviews', content: 'After each completed job, the customer can rate your service from 1-5 stars and leave a review. Your average rating is displayed on your profile and affects your job priority. Maintain high ratings by being prompt, professional, and communicative.' },
        { title: 'Managing your vehicles', content: 'Go to Profile → Vehicles to add or update your service vehicle details. Include your vehicle make, model, year, color, and license plate. This information is shared with customers so they can identify you on arrival.' },
        { title: 'Account security', content: 'Protect your account by using a strong password and keeping your login credentials private. You can change your password from Profile → Account Security. If you suspect unauthorized access, change your password immediately and contact support.' },
      ],
    },
  ];

  const faqs = [
    { question: 'How do I go online and start receiving jobs?', answer: 'From the Home screen, tap the power button to toggle your status to Online. Make sure location services are enabled so the system can match you with nearby customers. You must have at least one service selected and all documents verified to go online.' },
    { question: 'Why am I not receiving job requests?', answer: 'Check that you are online (green status), your location services are enabled, and your selected services match the jobs in your area. Jobs are sent to the closest available provider first. During slow periods, there may simply be fewer requests.' },
    { question: 'What happens if I decline or miss a request?', answer: 'Declining or letting a request timer expire will not penalize your account. The job will be offered to the next closest provider. However, consistently declining jobs may affect your priority in the matching system.' },
    { question: 'How do I contact a customer during a job?', answer: 'On the active job screen, use the Call or Message buttons to contact the customer through the app. All communications are private and routed through TORC — your personal phone number is never shared.' },
    { question: 'What if a customer is not at the location?', answer: 'Try contacting the customer via in-app call or message. Wait at least 5 minutes at the confirmed pickup location. If the customer is unreachable, you may cancel the job with the reason "Customer unreachable".' },
    { question: 'How do I update my services or documents?', answer: 'Go to Profile to access your services list and documents. You can add or remove services at any time. Upload new documents when existing ones expire. Document changes require re-verification (1-3 business days).' },
  ];

  useEffect(() => {
    if (!user) return;
    loadTickets();
  }, [user]);

  async function loadTickets() {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('support_tickets')
        .select('id, subject, status, priority, created_at, admin_note')
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.warn('Failed to load provider support tickets:', error);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  async function submitTicket() {
    if (!user) return;
    const cleanSubject = subject.trim();
    const cleanDescription = description.trim();
    if (!cleanSubject || !cleanDescription) {
      setMessage('Please add subject and description.');
      return;
    }
    try {
      setSubmitting(true);
      setMessage(null);
      const requesterRole = profile?.role === 'customer' ? 'customer' : 'provider';
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
      setMessage('Support request submitted successfully.');
      await loadTickets();
    } catch (error: any) {
      console.warn('Failed to submit provider support ticket:', error);
      setMessage(error?.message || 'Could not submit support request.');
    } finally {
      setSubmitting(false);
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
        sender_role: profile?.role || 'provider',
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

  return (
    <div
      className="min-h-screen"
      style={{
        background: isDark ? 'linear-gradient(180deg, #0A1626 0%, #081427 100%)' : 'linear-gradient(180deg, #F8FBFF 0%, #EAF2FF 100%)',
        paddingBottom: 'calc(120px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <PageHeader title="Help & Support" onBack={() => navigate('/profile')} />

      <div className="p-6 space-y-6" style={{ paddingTop: 'calc(var(--safe-top) + 64px)' }}>
        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: MessageCircle, title: 'Ticket', desc: 'Create request', color: 'from-[#008CE5] to-[#0070B8]', action: () => document.getElementById('provider-ticket-form')?.scrollIntoView({ behavior: 'smooth' }) },
            { icon: Phone, title: 'Call', desc: '1-800-TORC', color: 'from-green-400 to-emerald-500', action: () => { window.location.href = 'tel:+18008672435'; } },
            { icon: Mail, title: 'Email', desc: 'Support', color: 'from-purple-400 to-pink-500', action: () => { window.location.href = 'mailto:providers@torcapp.com'; } },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.title} onClick={action.action} className="rounded-2xl p-4 flex flex-col items-center gap-2" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <p className="text-xs font-semibold" style={{ color: textColor }}>{action.title}</p>
                <p className="text-[10px]" style={{ color: subColor }}>{action.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Help Topics */}
        <div>
          <h2 className="font-bold text-lg mb-3" style={{ color: textColor }}>Browse Topics</h2>
          <div className="space-y-3">
            {helpCategories.map((category, index) => {
              const Icon = category.icon;
              return (
                <motion.div
                  key={category.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-2xl p-5"
                  style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${category.color} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-bold" style={{ color: textColor }}>{category.title}</h3>
                  </div>
                  <div className="space-y-1">
                    {category.articles.map((article) => {
                      const key = `${category.title}-${article.title}`;
                      const isOpen = expandedArticle === key;
                      return (
                        <div key={article.title}>
                          <button
                            onClick={() => setExpandedArticle(isOpen ? null : key)}
                            className="w-full flex items-center justify-between p-3 rounded-xl transition-colors text-left"
                            style={{ backgroundColor: isOpen ? (isDark ? 'rgba(0,140,229,0.08)' : 'rgba(0,140,229,0.05)') : 'transparent' }}
                          >
                            <span className="text-sm font-medium" style={{ color: isOpen ? '#008CE5' : subColor }}>{article.title}</span>
                            {isOpen
                              ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#008CE5' }} />
                              : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
                            }
                          </button>
                          {isOpen && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="px-3 pb-3">
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
          <h2 className="font-bold text-lg mb-3" style={{ color: textColor }}>Frequently Asked Questions</h2>
          <div className="space-y-2">
            {faqs.map((faq) => {
              const isOpen = expandedFaq === faq.question;
              return (
                <div key={faq.question} className="rounded-2xl overflow-hidden" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
                  <button
                    onClick={() => setExpandedFaq(isOpen ? null : faq.question)}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <HelpCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#008CE5' }} />
                    <span className="flex-1 text-sm font-semibold" style={{ color: textColor }}>{faq.question}</span>
                    {isOpen
                      ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: '#008CE5' }} />
                      : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }} />
                    }
                  </button>
                  {isOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 pb-4 pl-12">
                      <p className="text-sm leading-relaxed" style={{ color: subColor }}>{faq.answer}</p>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Create ticket */}
        <div id="provider-ticket-form" className="rounded-2xl p-6" style={{ backgroundColor: cardBg, border: '1px solid rgba(0,140,229,0.2)' }}>
          <h2 className="text-lg font-bold mb-1" style={{ color: textColor }}>Create Support Request</h2>
          <p className="text-sm mb-4" style={{ color: subColor }}>Describe your issue and our team will respond shortly.</p>
          <div className="space-y-3">
            <div>
              <label className="text-sm block mb-1" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g., Payout not received"
                className="w-full px-4 py-3 rounded-xl focus:outline-none"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#D3E0F2'}`, color: textColor }}
              />
            </div>
            <div>
              <label className="text-sm block mb-1" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Priority</label>
              <select
                title="Ticket priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'normal' | 'high' | 'urgent')}
                className="w-full px-4 py-3 rounded-xl focus:outline-none"
                style={{ backgroundColor: isDark ? '#14263D' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#D3E0F2'}`, color: textColor }}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="text-sm block mb-1" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : '#374151' }}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue in detail..."
                rows={4}
                className="w-full px-4 py-3 rounded-xl focus:outline-none"
                style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F9FF', border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#D3E0F2'}`, color: textColor }}
              />
            </div>
            <button
              onClick={submitTicket}
              disabled={submitting}
              className="w-full py-3 rounded-xl font-bold text-white"
              style={{ background: 'linear-gradient(90deg, #008CE5 0%, #0070B8 100%)', opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Submitting...' : 'Submit Support Request'}
            </button>
            {message && <p className="text-sm" style={{ color: subColor }}>{message}</p>}
          </div>
        </div>

        {/* My support tickets */}
        <div className="rounded-2xl p-6" style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}` }}>
          <h2 className="text-lg font-bold mb-3" style={{ color: textColor }}>My Support Requests</h2>
          {loading ? (
            <p style={{ color: subColor }}>Loading requests...</p>
          ) : tickets.length === 0 ? (
            <p style={{ color: subColor }}>No support requests yet.</p>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F9FF', border: `1px solid ${expandedTicket === ticket.id ? '#008CE5' : (isDark ? 'rgba(255,255,255,0.08)' : '#D3E0F2')}` }}>
                  <button
                    className="w-full text-left p-3"
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
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold" style={{ color: textColor }}>{ticket.subject}</p>
                      <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#D3E0F2', color: textColor }}>{ticket.status}</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: subColor }}>Priority: {ticket.priority} · {new Date(ticket.created_at).toLocaleString()}</p>
                  </button>

                  {expandedTicket === ticket.id && (
                    <div className="px-3 pb-3 pt-0" style={{ borderTop: `1px solid ${cardBorder}` }}>
                      <div className="mt-3 space-y-2 max-h-[250px] overflow-y-auto">
                        {ticketReplies.length === 0 ? (
                          <p className="text-xs text-center py-3" style={{ color: subColor }}>No replies yet — our team will respond soon.</p>
                        ) : (
                          ticketReplies.map((r: any) => {
                            const isMe = r.sender_id === user?.id;
                            return (
                              <div key={r.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                <div className="max-w-[85%] rounded-2xl px-3 py-2"
                                  style={{
                                    backgroundColor: isMe ? '#008CE5' : (isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF'),
                                    color: isMe ? '#FFFFFF' : textColor,
                                    border: isMe ? 'none' : `1px solid ${cardBorder}`,
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

                      {ticket.status !== 'closed' && (
                        <div className="flex items-center gap-2 mt-3">
                          <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Type a reply..."
                            className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none"
                            style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF', color: textColor, border: `1px solid ${cardBorder}` }}
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
