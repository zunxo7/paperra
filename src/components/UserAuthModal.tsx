import React, { useState } from 'react';
import { X, UserCircle, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiUrl } from '../lib/apiUrl';

export function UserAuthModal({ 
  open, 
  onClose, 
  onLoginSuccess,
  mode = 'login'
}: { 
  open: boolean; 
  onClose: () => void;
  onLoginSuccess: (user: { username: string; token: string; tokens: number; isAdmin?: boolean; isNewUser?: boolean }) => void;
  mode?: 'login' | 'signup';
}) {
  const [isRegister, setIsRegister] = useState(mode === 'signup');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      setIsRegister(mode === 'signup');
      setError('');
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegister ? 'user/register' : 'user/login';
      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (isRegister) {
        setIsRegister(false);
        setPassword('');
        setJustRegistered(true);
        setError('Please login in');
      } else {
        onLoginSuccess({ 
          username: data.username, 
          token: data.token, 
          tokens: data.tokens, 
          isAdmin: data.isAdmin,
          isNewUser: justRegistered
        });
        onClose();
        setPassword('');
        setJustRegistered(false);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative w-full max-w-sm bg-white p-8 shadow-2xl border-2 border-[#141414]"
          >
            <button
              className="absolute top-6 right-6 text-[#141414] hover:opacity-60"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold uppercase tracking-widest mb-6 border-b-2 border-[#141414] pb-2">
              {isRegister ? 'Sign up' : 'Login'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-mono uppercase opacity-70 block mb-1">Username</label>
                <input 
                  type="text" 
                  required
                  className="w-full border border-[#141414] px-3 py-2 text-sm"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-mono uppercase opacity-70 block mb-1">Password</label>
                <input 
                  type="password" 
                  required
                  className="w-full border border-[#141414] px-3 py-2 text-sm"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && <p className={`text-xs font-mono ${(error.includes('Registered') || error.includes('login')) ? 'text-green-600' : 'text-red-600'}`}>{error}</p>}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full border border-[#141414] bg-[#141414] text-white py-2 font-bold uppercase disabled:opacity-50"
              >
                {loading ? 'Processing...' : (isRegister ? 'Sign up' : 'Login')}
              </button>
            </form>

            <p className="mt-4 text-center text-xs font-mono">
              {isRegister ? 'Already have an account? ' : 'Need an account? '}
              <button 
                type="button" 
                className="underline font-bold"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                }}
              >
                {isRegister ? 'Login' : 'Sign up'}
              </button>
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
