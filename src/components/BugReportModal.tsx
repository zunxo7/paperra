import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2 } from 'lucide-react';
import { apiUrl } from '../lib/apiUrl';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: { token: string; tokens: number; tier: string } | null;
  onAlert: (msg: string) => void;
}

export function BugReportModal({ isOpen, onClose, user, onAlert }: BugReportModalProps) {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!description.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(apiUrl('user/request'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({
          type: 'BUG_FIX',
          description,
          metadata: { text: description }
        })
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setDescription('');
        }, 2000);
      } else {
        const data = await res.json();
        onAlert(data.error || "Failed to submit bug report");
      }
    } catch (e) {
      console.error(e);
      onAlert("Internal server error");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[230] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white border-2 border-[#141414] p-8 shadow-2xl w-full max-w-md relative"
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 text-[#141414] hover:opacity-60"
          >
            <X className="w-5 h-5" />
          </button>          <h2 className="text-xl font-bold uppercase tracking-widest mb-6 border-b-2 border-[#141414] pb-2">
            Report
          </h2>
          {success ? (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-xl font-bold uppercase mb-2">Bug Reported!</h3>
              <p className="text-sm opacity-60">We'll look into it right away.</p>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase opacity-50 tracking-wider">Issue Description</label>
                <textarea
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What went wrong?"
                  className="w-full h-40 p-4 border-2 border-[#141414] font-mono text-sm resize-none focus:outline-none focus:border-blue-600 transition-colors"
                />
              </div>

              <div className="flex justify-center pt-4 border-t border-[#141414]/10">
                <button
                  disabled={loading || !user || !description.trim()}
                  type="submit"
                  className="w-full px-8 py-4 bg-[#141414] text-white font-bold uppercase text-xs tracking-widest hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Submit'}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
