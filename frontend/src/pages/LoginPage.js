import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/App';
import { formatError } from '@/lib/api';
import { Radio, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg flex items-center justify-center p-4" data-testid="login-page">
      {/* Noise texture */}
      <div className="noise-bg fixed inset-0 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Radio className="w-8 h-8 text-[#c4841d] glow-amber" />
            <h1 className="font-heading text-5xl font-bold uppercase tracking-[0.2em] text-[#c4841d] glow-amber-text">
              Dead Signal
            </h1>
          </div>
          <p className="font-mono text-xs text-[#88837a] tracking-widest uppercase">
            Survival Command Terminal v1.0
          </p>
          <div className="mt-2 h-px bg-gradient-to-r from-transparent via-[#2a2520] to-transparent" />
        </div>

        {/* Auth Card */}
        <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          {/* Card Header */}
          <div className="border-b border-[#2a2520] bg-[#111111] p-4">
            <div className="flex gap-4">
              <button
                data-testid="login-tab"
                onClick={() => { setIsRegister(false); setError(''); }}
                className={`font-heading text-sm uppercase tracking-widest font-bold pb-1 border-b-2 transition-colors ${
                  !isRegister ? 'text-[#c4841d] border-[#c4841d]' : 'text-[#88837a] border-transparent hover:text-[#d4cfc4]'
                }`}
              >
                Authenticate
              </button>
              <button
                data-testid="register-tab"
                onClick={() => { setIsRegister(true); setError(''); }}
                className={`font-heading text-sm uppercase tracking-widest font-bold pb-1 border-b-2 transition-colors ${
                  isRegister ? 'text-[#c4841d] border-[#c4841d]' : 'text-[#88837a] border-transparent hover:text-[#d4cfc4]'
                }`}
              >
                Register
              </button>
            </div>
          </div>

          {/* Card Body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {error && (
              <div data-testid="auth-error" className="border border-[#8b3a3a] bg-[#8b3a3a]/10 p-3 text-xs font-mono text-[#a94442]">
                [ERROR] {error}
              </div>
            )}

            {isRegister && (
              <div>
                <label className="block text-xs font-mono uppercase tracking-[0.2em] text-[#88837a] mb-2">
                  Callsign
                </label>
                <input
                  data-testid="name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={isRegister}
                  placeholder="Enter callsign..."
                  className="w-full bg-[#111111] border border-[#2a2520] p-3 text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:ring-1 focus:ring-[#c4841d] focus:outline-none transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-mono uppercase tracking-[0.2em] text-[#88837a] mb-2">
                Frequency (Email)
              </label>
              <input
                data-testid="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="operator@signal.dead"
                className="w-full bg-[#111111] border border-[#2a2520] p-3 text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:ring-1 focus:ring-[#c4841d] focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-[0.2em] text-[#88837a] mb-2">
                Access Code
              </label>
              <div className="relative">
                <input
                  data-testid="password-input"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Enter access code..."
                  className="w-full bg-[#111111] border border-[#2a2520] p-3 pr-10 text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:ring-1 focus:ring-[#c4841d] focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#88837a] hover:text-[#c4841d] transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              data-testid="auth-submit-button"
              type="submit"
              disabled={loading}
              className="w-full border border-[#c4841d] bg-[#c4841d]/10 text-[#c4841d] font-heading text-sm uppercase tracking-widest font-bold p-3 hover:bg-[#c4841d] hover:text-[#111111] hover:shadow-[0_0_15px_rgba(196,132,29,0.5)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Transmitting...' : isRegister ? 'Establish Identity' : 'Authenticate'}
            </button>
          </form>

          {/* Footer */}
          <div className="border-t border-[#2a2520] p-3 text-center">
            <span className="text-xs font-mono text-[#88837a]">
              Signal Strength: <span className="text-[#6b7a3d]">STRONG</span> | Frequency: 91.7
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
