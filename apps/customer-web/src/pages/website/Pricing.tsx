import { useNavigate } from 'react-router';
import { Check, ArrowLeft } from 'lucide-react';

export function WebsitePricing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/website')} className="p-2 hover:bg-gray-100 rounded-xl" title="Back to website home">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#008CE5] to-[#0070B8] bg-clip-text text-transparent">
            TORC
          </h1>
        </div>
      </nav>

      <div className="pt-32 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">Simple, Transparent Pricing</h1>
          <p className="text-xl text-gray-600 mb-12">Pay only for what you need. No membership fees.</p>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-gray-50 rounded-3xl p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Pay Per Use</h3>
              <ul className="space-y-4 text-left">
                <li className="flex items-start gap-3">
                  <Check className="w-6 h-6 text-[#008CE5] flex-shrink-0" />
                  <span className="text-gray-700">No monthly fees</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-6 h-6 text-[#008CE5] flex-shrink-0" />
                  <span className="text-gray-700">Transparent pricing before booking</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-6 h-6 text-[#008CE5] flex-shrink-0" />
                  <span className="text-gray-700">Services start at $35</span>
                </li>
              </ul>
            </div>

            <div className="bg-gradient-to-br from-[#008CE5]/10 to-[#0070B8]/10 rounded-3xl p-8 border-2 border-[#008CE5]">
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Premium Support</h3>
              <ul className="space-y-4 text-left">
                <li className="flex items-start gap-3">
                  <Check className="w-6 h-6 text-[#008CE5] flex-shrink-0" />
                  <span className="text-gray-700">Priority provider matching</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-6 h-6 text-[#008CE5] flex-shrink-0" />
                  <span className="text-gray-700">Real-time trip updates</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-6 h-6 text-[#008CE5] flex-shrink-0" />
                  <span className="text-gray-700">Reduced platform fees on frequent use</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
