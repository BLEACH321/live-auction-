import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Terminal } from 'lucide-react';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!username || !password) {
      setError('Please fill in all fields');
      setSubmitting(false);
      return;
    }

    const res = await login(username, password);
    setSubmitting(false);

    if (res.success) {
      // Decode user role from local storage to redirect
      const userStr = localStorage.getItem('ca_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.role === 'admin') {
          navigate('/admin');
        } else if (user.role === 'team') {
          navigate('/team');
        } else {
          navigate('/live');
        }
      }
    } else {
      setError(res.error || 'Invalid credentials');
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md p-8 bg-arena-panel rounded-lg border border-arena-border glow-border-orange">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-display font-black tracking-widest text-white flex items-center justify-center gap-2 uppercase">
            <Terminal className="text-arena-accent w-8 h-8 animate-pulse" />
            CIRCUIT <span className="text-arena-glow">ARENA</span>
          </h2>
          <p className="mt-2 text-xs text-arena-textMuted font-mono uppercase tracking-widest">
            Live Auction Portal
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/50 border border-red-500/50 text-red-200 text-sm rounded-md font-mono">
            {error}
          </div>
        )}

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-300">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-arena-bg border border-arena-border rounded text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-arena-accent focus:border-arena-accent text-sm font-mono"
              placeholder="e.g. admin or team1"
            />
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-slate-300">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-arena-bg border border-arena-border rounded text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-arena-accent focus:border-arena-accent text-sm font-mono"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 border border-transparent rounded shadow-md text-sm font-bold tracking-wider uppercase text-white bg-arena-accent hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 transition-colors shadow-[0_0_10px_rgba(255,107,0,0.2)] cursor-pointer"
          >
            {submitting ? 'Authenticating...' : 'Initialize Access'}
          </button>
        </form>


      </div>
    </div>
  );
};
