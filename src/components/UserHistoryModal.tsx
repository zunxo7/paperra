import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Clock, RefreshCw, Trash2 } from 'lucide-react';
import { apiUrl } from '../lib/apiUrl';
import { AlertModal } from './AlertModal';

interface HistoryItem {
  id: number;
  qualificationLevel: string;
  syllabusCode: string;
  startYear: number;
  endYear: number;
  selectedSessions: string[];
  selectedVariants: string[];
  didFilter: boolean;
  createdAt: string;
}

interface UserHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string | undefined;
  onRestore: (item: HistoryItem) => void;
}

export function UserHistoryModal({ isOpen, onClose, token, onRestore }: UserHistoryModalProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      if (token) {
        setLoading(true);
        fetch(apiUrl('user/history'), {
          headers: { Authorization: `Bearer ${token}` }
        })
        .then(r => r.json())
        .then(data => {
          if (data.history) setHistory(data.history);
        })
        .catch(e => console.error(e))
        .finally(() => setLoading(false));
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, token]);

  const handleDelete = async (id: number) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('user/delete-history'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ historyId: id })
      });
      const data = await res.json();
      if (data.success) {
        setHistory(prev => prev.filter(h => h.id !== id));
      }
    } catch (e) {
      console.error('Failed to delete history:', e);
    }
  };


  return (
    <>
    <AlertModal
      message={confirmDeleteId !== null ? 'Delete this history record?' : null}
      type="confirm"
      onClose={() => setConfirmDeleteId(null)}
      onConfirm={() => { if (confirmDeleteId !== null) handleDelete(confirmDeleteId); }}
    />
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white border-2 border-[#141414] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col relative"
          >
            <button 
              onClick={onClose}
              className="absolute top-6 right-6 text-[#141414] hover:opacity-60 z-10"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8 pb-0">
              <h2 className="text-xl font-bold uppercase tracking-widest mb-6 border-b-2 border-[#141414] pb-2">
                Your History
              </h2>
            </div>

          <div className="p-6 overflow-y-auto bg-gray-50/50">
            {loading ? (
              <div className="text-center font-mono text-sm uppercase opacity-70 py-12">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="text-center font-mono text-sm uppercase opacity-70 py-12">No history found.</div>
            ) : (
              <div className="space-y-4">
                {history.map((h) => (
                  <div key={h.id} className="bg-white border text-sm border-[#141414] p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div>
                      <div className="font-bold text-[#141414] uppercase mb-1">
                        {h.qualificationLevel} {h.syllabusCode}
                      </div>
                      <div className="text-[#141414] font-mono text-xs opacity-80">
                        {h.startYear} - {h.endYear} • Sessions: {h.selectedSessions.join(',')} • Variants: {h.selectedVariants.join(',')}
                      </div>
                      <div className="text-xs font-mono text-[#141414] opacity-60 mt-2 flex items-center gap-2">
                        {(() => {
                          const d = new Date(h.createdAt);
                          const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                          const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
                          return `${datePart} ${timeStr}`;
                        })()} 
                        {h.didFilter && <span className="text-[#141414] border border-[#141414] px-1 py-0.5 ml-2 font-bold uppercase" style={{ fontSize: '10px' }}>Filtered</span>}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setConfirmDeleteId(h.id)}
                        className="p-2 border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete History"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          onRestore(h);
                          onClose();
                        }}
                        className="flex items-center gap-2 px-4 py-2 border border-[#141414] bg-[#141414] text-white font-bold uppercase text-xs hover:bg-white hover:text-[#141414] transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Restore
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
        </div>
      )}
    </AnimatePresence>
    </>
  );
}
