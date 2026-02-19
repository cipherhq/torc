import { useNavigate } from 'react-router';
import { Search, ArrowLeft, HelpCircle } from 'lucide-react';

export function WebsiteHelp() {
  const navigate = useNavigate();

  const faqs = [
    { q: 'How quickly will help arrive?', a: 'Average arrival time is under 15 minutes in most areas.' },
    { q: 'What areas do you cover?', a: 'We cover major metropolitan areas with 24/7 service.' },
    { q: 'Can I request help for someone else?', a: 'Yes. Choose "Someone else" during request setup and enter their details.' },
    { q: 'How do I pay?', a: 'We accept all major credit cards, debit cards, and digital wallets.' },
    { q: 'Are providers insured?', a: 'Yes, all providers are fully verified, insured, and background checked.' },
  ];

  return (
    <div className="min-h-screen bg-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/website')} className="p-2 hover:bg-gray-100 rounded-xl" title="Back to website home">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] bg-clip-text text-transparent">
            TORC
          </h1>
        </div>
      </nav>

      <div className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">Help Center</h1>
          <p className="text-xl text-gray-600 mb-12">Find answers to common questions</p>

          <div className="bg-gray-50 rounded-3xl p-6 mb-12">
            <div className="flex items-center gap-3">
              <Search className="w-6 h-6 text-gray-400" />
              <input
                type="text"
                placeholder="Search for help..."
                className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 focus:outline-none text-lg"
              />
            </div>
          </div>

          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white rounded-3xl p-8 shadow-lg border border-gray-100">
                <div className="flex items-start gap-4">
                  <HelpCircle className="w-6 h-6 text-[#007AFF] flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{faq.q}</h3>
                    <p className="text-gray-600">{faq.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center bg-gradient-to-br from-[#2EFFAF]/10 to-[#007AFF]/10 rounded-3xl p-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Still Need Help?</h2>
            <p className="text-gray-600 mb-6">Our support team is available 24/7</p>
            <button className="px-8 py-4 rounded-2xl bg-gradient-to-r from-[#2EFFAF] to-[#007AFF] text-white font-bold">
              Contact Support
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
