import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, CheckCircle2 } from 'lucide-react';
import { apiUrl } from '../lib/apiUrl';

interface RequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: { token: string; tokens: number; tier: string; isAdmin?: boolean } | null;
  onUpdateTokens: (newCount: number) => void;
  onAlert: (msg: string) => void;
  onAlertUpgrade: (msg: string) => void;
}

type RequestType = 'BUG_FIX' | 'NEW_FEATURE' | 'ADD_SUBJECT';

export function RequestModal({ isOpen, onClose, user, onUpdateTokens, onAlert, onAlertUpgrade }: RequestModalProps) {
  const [type, setType] = useState<RequestType>('NEW_FEATURE');
  const [description, setDescription] = useState('');
  const [metadata, setMetadata] = useState({ qualification: '', syllabusCode: '', syllabusName: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!user.isAdmin && type !== 'BUG_FIX' && (user.tier === 'free' || user.tier === 'starter')) {
      onAlertUpgrade("Feature requests and subject additions are only available for Pro and Elite plans.");
      return;
    }
    
    let cost = user.isAdmin ? 0 : 10;
    if (!user.isAdmin && user.tier === 'pro') cost = 10; 
    if (!user.isAdmin && user.tier === 'elite') cost = 5; 

    if (user.tokens < cost) {
      onAlert(`Insufficient tokens. Requests cost ${cost} tokens on your plan.`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl('user/request'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({
          type,
          description: type === 'ADD_SUBJECT' 
            ? `Request to add ${metadata.qualification} ${metadata.syllabusName} (${metadata.syllabusCode})`
            : description,
          metadata: type === 'ADD_SUBJECT' ? metadata : { text: description }
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.newTokens !== undefined) {
          onUpdateTokens(data.newTokens);
        }

        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setDescription('');
          setMetadata({ qualification: '', syllabusCode: '', syllabusName: '' });
          setType('NEW_FEATURE');
        }, 2000);
      } else {
        const data = await res.json();
        onAlert(data.error || "Failed to submit request");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white border-2 border-[#141414] p-8 shadow-2xl w-full max-w-md relative"
          >
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 text-[#141414] hover:opacity-60"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold uppercase tracking-widest mb-6 border-b-2 border-[#141414] pb-2">
              Request
            </h2>

            {success ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                <CheckCircle2 className="w-12 h-12 text-blue-600" />
                <div>
                  <p className="font-bold uppercase tracking-wider">Request Sent</p>
                  <p className="text-xs font-mono opacity-60">The admin will review it shortly.</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Category</p>
                  <div className="grid grid-cols-2 gap-1">
                    {(['NEW_FEATURE', 'ADD_SUBJECT'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setType(t)}
                        className={`py-2 text-[10px] font-bold uppercase border-2 transition-all ${
                          type === t 
                            ? 'bg-[#141414] border-[#141414] text-white' 
                            : 'bg-white border-[#141414]/10 text-[#141414] hover:border-[#141414]'
                        }`}
                      >
                        {t.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  {type === 'ADD_SUBJECT' ? (
                    <>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-50">Qualification</label>
                        <input
                          required
                          className="w-full border-2 border-[#141414] p-2 text-xs font-mono outline-none focus:border-blue-600"
                          value={metadata.qualification}
                          onChange={e => setMetadata({...metadata, qualification: e.target.value.toUpperCase()})}
                          placeholder="e.g. IGCSE"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-50">Syllabus Code</label>
                        <input
                          required
                          className="w-full border-2 border-[#141414] p-2 text-xs font-mono outline-none focus:border-blue-600"
                          value={metadata.syllabusCode}
                          onChange={e => setMetadata({...metadata, syllabusCode: e.target.value})}
                          placeholder="e.g. 0478"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-50">Subject Name</label>
                        <input
                          required
                          className="w-full border-2 border-[#141414] p-2 text-xs font-mono outline-none focus:border-blue-600"
                          value={metadata.syllabusName}
                          onChange={e => setMetadata({...metadata, syllabusName: e.target.value})}
                          placeholder="e.g. Computer Science"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-50">
                        {type === 'BUG_FIX' ? 'Issue description' : 'Feature description'}
                      </label>
                      <textarea
                        required
                        className="w-full border-2 border-[#141414] p-3 text-xs font-mono min-h-[120px] outline-none focus:border-blue-600 resize-none"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder={type === 'BUG_FIX' ? "What went wrong?" : "What's your idea?"}
                      />
                    </div>
                  )}
                </div>

                <div className="pt-6 border-t border-[#141414] border-opacity-10 text-center flex justify-center">
                  <button
                    disabled={loading || !user}
                    type="submit"
                    className="w-full sm:w-auto px-8 py-4 bg-[#141414] text-white font-bold uppercase text-xs tracking-widest flex items-center justify-center gap-3 hover:bg-blue-600 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Sending...' : (
                      !user ? 'Login Required' : (
                        type === 'BUG_FIX' ? 'Submit (Free)' : `Submit (${user.tier === 'elite' ? '5 Tokens' : user.tier === 'pro' ? '10 Tokens' : '10 Tokens'})`
                      )
                    )}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
