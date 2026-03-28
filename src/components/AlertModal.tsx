import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertCircle, Download, Info, RefreshCw, Trash2 } from 'lucide-react';

interface AlertModalProps {
  message: string | null;
  onClose: () => void;
  onUpgrade?: () => void;
  onConfirm?: () => void;
  type?: 'error' | 'info' | 'export' | 'restore' | 'confirm';
}

export function AlertModal({ message, onClose, onUpgrade, onConfirm, type = 'error' }: AlertModalProps) {
  if (!message) return null;

  const isExport = type === 'export';
  const isRestore = type === 'restore';
  const isInfo = type === 'info';
  const isConfirm = type === 'confirm';

  const isBlue = isExport || isRestore || isInfo;

  const borderColor = isBlue ? 'border-blue-600' : 'border-red-600';
  const shadowClass = isBlue ? 'shadow-[8px_8px_0px_rgba(37,99,235,1)]' : 'shadow-[8px_8px_0px_rgba(220,38,38,1)]';
  const iconColor = isBlue ? 'text-blue-600' : 'text-red-600';

  let Icon = AlertCircle;
  if (isExport) Icon = Download;
  else if (isRestore) Icon = RefreshCw;
  else if (isInfo) Icon = Info;
  else if (isConfirm) Icon = Trash2;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[400] p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className={`bg-white border-2 p-8 max-w-sm w-full relative ${borderColor} ${shadowClass} text-center shadow-xl`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[#141414] hover:opacity-70 transition-opacity"
          >
            <X className="w-5 h-5" />
          </button>

          <Icon className={`w-12 h-12 mx-auto ${iconColor} mb-4 ${isRestore ? 'animate-spin-slow' : ''}`} />
          <h3 className="text-lg font-bold uppercase tracking-wider mb-4 border-b-2 border-[#141414] inline-block pb-1">
            {isExport ? 'Export' : isRestore ? 'Restore' : isConfirm ? 'Confirm' : 'Notice'}
          </h3>
          <p className="text-sm font-mono font-bold opacity-80 mb-6">{message}</p>

          <div className="flex flex-col gap-3">
            {isConfirm ? (
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 border-2 border-[#141414] bg-white text-[#141414] py-3 text-xs font-bold uppercase tracking-widest hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { onConfirm?.(); onClose(); }}
                  className="flex-1 border-2 border-red-600 bg-red-600 text-white py-3 text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all"
                >
                  Delete
                </button>
              </div>
            ) : onUpgrade ? (
              <button
                onClick={() => { onUpgrade(); onClose(); }}
                className="w-full bg-[#141414] text-white py-3 text-xs font-bold uppercase tracking-widest hover:bg-blue-600 transition-colors shadow-[4px_4px_0px_rgba(0,102,255,0.3)]"
              >
                Upgrade Plan
              </button>
            ) : (
              <button
                onClick={onClose}
                className="w-full border-2 border-[#141414] bg-white text-[#141414] py-3 text-xs font-bold uppercase tracking-widest hover:bg-[#141414] hover:text-white transition-all shadow-[4px_4px_0px_rgba(0,0,0,0.1)]"
              >
                {isExport || isRestore ? 'Processing...' : 'Acknowledge'}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
