import React, { useState } from 'react';
import { X, UserCircle, LogOut } from 'lucide-react';
import { apiUrl } from '../lib/apiUrl';

export function UserAuthModal({ 
  open, 
  onClose, 
  onLoginSuccess 
}: { 
  open: boolean; 
  onClose: () => void;
  onLoginSuccess: (user: { username: string; token: string; filterLimit: number }) => void;
}) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        setError('Registered! Please log in.');
      } else {
        onLoginSuccess({ username: data.username, token: data.token, filterLimit: data.filterLimit });
        onClose();
        setPassword('');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-sm bg-white p-6 shadow-xl border border-[#141414]">
        <button
          className="absolute top-3 right-3 text-[#141414] hover:opacity-70"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold uppercase tracking-wider mb-2">
          {isRegister ? 'Register' : 'Login'}
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

          {error && <p className={`text-xs font-mono ${error.includes('Registered') ? 'text-green-600' : 'text-red-600'}`}>{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full border border-[#141414] bg-[#141414] text-white py-2 font-bold uppercase disabled:opacity-50"
          >
            {loading ? 'Processing...' : (isRegister ? 'Sign Up' : 'Log In')}
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
            {isRegister ? 'Log in' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  );
}
