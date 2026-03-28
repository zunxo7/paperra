import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Zap, XCircle, Info } from 'lucide-react';

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: { token: string; tokens: number; tier: string } | null;
  onUpdateTokens: (newCount: number) => void;
  onOpenAuth: () => void;
  onAlert: (msg: string) => void;
  onOpenInfo: () => void;
}

export function ShopModal({ isOpen, onClose, user, onUpdateTokens, onOpenAuth, onAlert, onOpenInfo }: ShopModalProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  if (!isOpen) return null;

  const tiers = [
    {
      id: 'free',
      name: 'Free',
      tokens: '15',
      price: '0',
      period: 'day',
      type: 'trial',
      popular: false,
      features: [
        { text: 'Paper Search & Extraction', locked: false },
        { text: 'Topicwise AI Filter', locked: false },
        { text: 'Limited History Restore (3)', locked: false },
        { text: 'No Feature Requests', locked: true },
        { text: 'No Export as PDF', locked: true }
      ]
    },
    {
      id: 'starter',
      name: 'Starter',
      tokens: '25',
      price: billingCycle === 'monthly' ? '15' : '12',
      period: 'day',
      yearlyTotal: '144',
      savings: 'SAVE $36',
      popular: true,
      features: [
        { text: 'Paper Search & Extraction', locked: false },
        { text: 'Topicwise AI Filter', locked: false },
        { text: 'Limited History Restore (5)', locked: false },
        { text: 'Feature Requests', locked: false },
        { text: 'No Export as PDF', locked: true }
      ]
    },
    {
      id: 'pro',
      name: 'Pro',
      tokens: '50',
      price: billingCycle === 'monthly' ? '30' : '24',
      period: 'day',
      yearlyTotal: '288',
      savings: 'SAVE $72',
      popular: false,
      features: [
        { text: 'Paper Search & Extraction', locked: false },
        { text: 'Topicwise AI Filter', locked: false },
        { text: 'Full History Restore (50)', locked: false },
        { text: 'Feature Requests', locked: false },
        { text: 'Export as PDF', locked: false }
      ]
    }
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[220] p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white border-2 border-[#141414] p-8 w-full max-w-5xl relative shadow-xl overflow-y-auto max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[#141414] hover:opacity-70 transition-opacity"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="mb-12 relative text-left">
            <h2 className="text-xl font-bold uppercase tracking-wider mb-6 border-b-2 border-[#141414] pb-2">
              Pricing Plans
            </h2>

            <div className="flex items-center justify-center gap-4">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${billingCycle === 'monthly' ? 'text-[#141414]' : 'opacity-40'}`}>Monthly</span>
              <button
                onClick={() => setBillingCycle(prev => prev === 'monthly' ? 'annual' : 'monthly')}
                className="w-12 h-6 border-2 border-[#141414] relative p-0.5 bg-gray-100 transition-colors"
                aria-label="Toggle billing cycle"
              >
                <div className={`w-4 h-full bg-[#141414] transition-all duration-300 ${billingCycle === 'monthly' ? 'translate-x-0' : 'translate-x-6'}`} />
              </button>
              <span className={`text-[11px] font-bold uppercase tracking-wider ${billingCycle === 'annual' ? 'text-blue-600' : 'opacity-40'}`}>
                Annual <span className="text-[9px] bg-blue-100 px-1 ml-1">SAVE 20%+</span>
              </span>
              <button 
                onClick={onOpenInfo} 
                className="ml-2 hover:text-blue-600 transition-colors" 
                title="View Feature Pricing"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {tiers.map((tier) => (
              <div
                key={tier.id}
                className={`border-4 p-8 flex flex-col transition-all relative ${
                  user?.tier === tier.id ? 'border-gray-200 bg-gray-50 shadow-none' : 
                  tier.popular ? 'border-blue-600 bg-blue-50/10 shadow-[8px_8px_0px_rgba(37,99,235,0.1)]' : 'border-[#141414]'
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-1 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
                    Most Popular
                  </div>
                )}

                <div className="mb-4 border-b-2 border-[#141414] pb-4">
                  <h3 className="text-2xl font-black uppercase tracking-tight mb-2 italic">{tier.name}</h3>
                  <div className={`text-xl font-bold mb-4 ${user?.tier === tier.id ? 'text-gray-400' : 'text-blue-600'}`}>{tier.tokens} TOKENS / DAY</div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black italic">${tier.price}</span>
                    <span className="text-xs font-mono opacity-50 uppercase">/ MO</span>
                  </div>
                  {billingCycle === 'annual' && tier.id !== 'free' && (
                    <div className="mt-2 text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-100 inline-block px-2 py-0.5">
                      ${tier.yearlyTotal} billed annually ({tier.savings})
                    </div>
                  )}
                </div>

                <ul className="space-y-4 mb-8 mt-2 flex-grow">
                  {tier.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      {feat.locked
                        ? <XCircle className="w-3.5 h-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                        : <Zap className="w-3.5 h-3.5 mt-0.5 text-blue-600 flex-shrink-0" />
                      }
                      <span className={`text-[12px] font-bold uppercase tracking-tight leading-tight ${feat.locked ? 'opacity-40 line-through' : ''}`}>
                        {feat.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  disabled={user?.tier === tier.id}
                  onClick={() => {
                    if (!user) { onOpenAuth(); onClose(); return; }
                    onAlert('Connect Stripe to activate subscriptions.');
                  }}
                  className={`w-full py-4 text-[11px] font-bold uppercase tracking-widest transition-all ${
                    user?.tier === tier.id ? 'bg-gray-400 text-white cursor-not-allowed' :
                    tier.popular ? 'bg-blue-600 text-white hover:bg-[#141414]' : 'bg-[#141414] text-white hover:bg-blue-600'
                  }`}
                >
                  {user?.tier === tier.id ? 'Current Plan' : `Choose ${tier.name}`}
                </button>
              </div>
            ))}
          </div>

          <div className="mt-12 pt-6 border-t border-[#141414] border-opacity-10 text-center">
            <p className="text-[10px] font-mono opacity-40 uppercase tracking-widest">
              Flexible billing. Cancel anytime. Daily tokens reset every 24 hours.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
