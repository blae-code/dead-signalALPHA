import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/App';
import api, { formatError } from '@/lib/api';
import { Radio, ShieldCheck, Copy, Check } from 'lucide-react';

export default function SetupPage() {
  const { user, checkAuth } = useAuth();
  const [callsign, setCallsign] = useState('');
  const [setupSecret, setSetupSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const handleSetup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/setup', {
        callsign: callsign.trim(),
        setup_secret: setupSecret.trim(),
      });
      setResult(data);
      // Auth cookies are set, refresh auth state
      await checkAuth();
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyKey = () => {
    navigator.clipboard.writeText(result?.auth_key || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="login-bg flex items-center justify-center p-4" data-testid="setup-page">
      <div className="noise-bg fixed inset-0 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Radio className="w-8 h-8 text-[#c4841d] glow-amber" />
            <h1 className="font-heading text-5xl font-bold uppercase tracking-[0.2em] text-[#c4841d] glow-amber-text">
              Dead Signal
            </h1>
          </div>
          <p className="font-mono text-xs text-[#88837a] tracking-widest uppercase">
            First-Time System Setup
          </p>
          <div className="mt-2 h-px bg-gradient-to-r from-transparent via-[#2a2520] to-transparent" />
        </div>

        <div className="border border-[#2a2520] bg-[#1a1a1a]/95 panel-inset noise-bg">
          <div className="border-b border-[#2a2520] bg-[#111111] p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#c4841d]" />
              <span className="font-heading text-sm uppercase tracking-widest font-bold text-[#c4841d]">
                Initialize Command Terminal
              </span>
            </div>
          </div>

          {!result ? (
            <form onSubmit={handleSetup} className="p-6 space-y-5">
              <p className="text-xs font-mono text-[#88837a] leading-relaxed">
                No system admin detected. Enter your callsign and the setup secret from your server configuration to establish command authority.
              </p>

              {error && (
                <div data-testid="setup-error" className="border border-[#8b3a3a] bg-[#8b3a3a]/10 p-3 text-xs font-mono text-[#a94442]">
                  [ERROR] {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-mono uppercase tracking-[0.2em] text-[#88837a] mb-2">
                  Your Callsign
                </label>
                <input
                  data-testid="setup-callsign-input"
                  type="text"
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value)}
                  required
                  minLength={2}
                  placeholder="Commander, Ghost, Overwatch..."
                  className="w-full bg-[#111111] border border-[#2a2520] p-3 text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:ring-1 focus:ring-[#c4841d] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-[0.2em] text-[#88837a] mb-2">
                  Setup Secret
                </label>
                <input
                  data-testid="setup-secret-input"
                  type="password"
                  value={setupSecret}
                  onChange={(e) => setSetupSecret(e.target.value)}
                  required
                  placeholder="From server .env configuration"
                  className="w-full bg-[#111111] border border-[#2a2520] p-3 text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:ring-1 focus:ring-[#c4841d] focus:outline-none transition-colors"
                />
              </div>

              <button
                data-testid="setup-submit-button"
                type="submit"
                disabled={loading}
                className="w-full border border-[#c4841d] bg-[#c4841d]/10 text-[#c4841d] font-heading text-sm uppercase tracking-widest font-bold p-3 hover:bg-[#c4841d] hover:text-[#111111] hover:shadow-[0_0_15px_rgba(196,132,29,0.5)] transition-all disabled:opacity-50"
              >
                {loading ? 'Initializing...' : 'Establish Authority'}
              </button>
            </form>
          ) : (
            <div className="p-6 space-y-5">
              <div className="border border-[#4a5c3a] bg-[#4a5c3a]/10 p-4">
                <p className="text-sm font-heading uppercase tracking-widest text-[#6b7a3d] mb-2">
                  System Initialized Successfully
                </p>
                <p className="text-xs font-mono text-[#d4cfc4]">
                  Welcome, <span className="text-[#c4841d]">{result.callsign}</span>. You are now the system administrator.
                </p>
              </div>

              <div>
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-[#a94442] mb-2 font-bold">
                  YOUR AUTH KEY — SAVE THIS NOW
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-[#111111] border border-[#c4841d] p-3 font-mono text-sm text-[#c4841d] tracking-[0.15em] select-all" data-testid="generated-auth-key">
                    {result.auth_key}
                  </div>
                  <button
                    data-testid="copy-key-button"
                    onClick={copyKey}
                    className="border border-[#c4841d] text-[#c4841d] p-3 hover:bg-[#c4841d] hover:text-[#111111] transition-all"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] font-mono text-[#a94442] mt-2">
                  This key will NOT be shown again. Store it securely.
                </p>
              </div>

              <a
                href="/"
                data-testid="enter-dashboard-button"
                className="block w-full text-center border border-[#4a5c3a] bg-[#4a5c3a]/10 text-[#6b7a3d] font-heading text-sm uppercase tracking-widest font-bold p-3 hover:bg-[#4a5c3a] hover:text-[#111111] transition-all"
              >
                Enter Command Terminal
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
