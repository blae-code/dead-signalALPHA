import { useState } from 'react';
import { Radio, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';

export default function LoginPage({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [callsign, setCallsign] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!callsign.trim() || callsign.trim().length < 2) {
          setError('Callsign must be at least 2 characters');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setLoading(false);
          return;
        }
        const { data } = await api.post('/auth/register', {
          callsign: callsign.trim(),
          email: email.trim(),
          password,
        });
        onAuth(data.user);
      } else {
        const { data } = await api.post('/auth/login', {
          email: email.trim(),
          password,
        });
        onAuth(data.user);
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Authentication failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 noise-bg">
      {/* Scanline overlay */}
      <div className="pointer-events-none fixed inset-0 z-50" style={{
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
      }} />

      {/* Logo / Header */}
      <div className="text-center mb-8 relative" data-testid="auth-header">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Radio className="w-6 h-6 text-[#c4841d] animate-pulse" />
          <h1 className="font-heading text-4xl sm:text-5xl uppercase tracking-[0.3em] text-[#c4841d]" style={{
            textShadow: '0 0 20px rgba(196,132,29,0.3)',
          }}>
            Dead Signal
          </h1>
        </div>
        <p className="text-xs font-mono uppercase tracking-[0.4em] text-[#88837a]">
          AI-Narrated Companion // HumanitZ Operations
        </p>
        <div className="mt-4 h-px bg-gradient-to-r from-transparent via-[#c4841d]/40 to-transparent" />
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-md" data-testid="auth-card">
        <div className="border border-[#2a2520] bg-[#111111]/95 panel-inset">
          {/* Mode tabs */}
          <div className="flex border-b border-[#2a2520]">
            <button
              data-testid="auth-tab-login"
              onClick={() => { setMode('login'); setError(''); }}
              className={`flex-1 py-3 text-xs font-heading uppercase tracking-[0.3em] transition-all ${
                mode === 'login'
                  ? 'text-[#c4841d] bg-[#c4841d]/5 border-b-2 border-[#c4841d]'
                  : 'text-[#88837a] hover:text-[#d4cfc4]'
              }`}
            >
              Sign In
            </button>
            <button
              data-testid="auth-tab-register"
              onClick={() => { setMode('register'); setError(''); }}
              className={`flex-1 py-3 text-xs font-heading uppercase tracking-[0.3em] transition-all ${
                mode === 'register'
                  ? 'text-[#c4841d] bg-[#c4841d]/5 border-b-2 border-[#c4841d]'
                  : 'text-[#88837a] hover:text-[#d4cfc4]'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Callsign (register only) */}
            {mode === 'register' && (
              <div>
                <label className="block text-[10px] font-heading uppercase tracking-[0.3em] text-[#88837a] mb-1.5">
                  Callsign
                </label>
                <input
                  data-testid="auth-callsign"
                  type="text"
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value)}
                  placeholder="Your operator name"
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#2a2520] text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none focus:ring-1 focus:ring-[#c4841d]/30 transition-all"
                  required
                />
                <p className="mt-1 text-[9px] font-mono text-[#88837a]/60">
                  Your public identity in the wasteland
                </p>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-[10px] font-heading uppercase tracking-[0.3em] text-[#88837a] mb-1.5">
                Email
              </label>
              <input
                data-testid="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@example.com"
                className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#2a2520] text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none focus:ring-1 focus:ring-[#c4841d]/30 transition-all"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[10px] font-heading uppercase tracking-[0.3em] text-[#88837a] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  data-testid="auth-password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Min 6 characters' : 'Enter password'}
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#2a2520] text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none focus:ring-1 focus:ring-[#c4841d]/30 transition-all pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#88837a] hover:text-[#c4841d] transition-colors"
                  data-testid="auth-toggle-password"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-2.5 border border-[#8b3a3a]/60 bg-[#8b3a3a]/10" data-testid="auth-error">
                <AlertTriangle className="w-4 h-4 text-[#8b3a3a] shrink-0" />
                <span className="text-xs font-mono text-[#d4cfc4]">{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              data-testid="auth-submit"
              className="w-full py-3 bg-[#c4841d] hover:bg-[#e8b84d] text-[#0a0a0a] font-heading text-sm uppercase tracking-[0.3em] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
                  {mode === 'register' ? 'Registering...' : 'Authenticating...'}
                </span>
              ) : (
                mode === 'register' ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-4 text-center">
          <p className="text-[10px] font-mono text-[#88837a]/60">
            Secure connection // End-to-end encrypted
          </p>
        </div>
      </div>
    </div>
  );
}
