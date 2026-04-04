import { useState } from 'react';
import { Radio, AlertTriangle, Check, Eye, EyeOff } from 'lucide-react';
import api from '@/lib/api';

export default function ResetPasswordPage({ token, onBack }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setSuccess(true);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 noise-bg">
      <div className="pointer-events-none fixed inset-0 z-50" style={{
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
      }} />

      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Radio className="w-6 h-6 text-[#c4841d] animate-pulse" />
          <h1 className="font-heading text-3xl uppercase tracking-[0.3em] text-[#c4841d]" style={{ textShadow: '0 0 20px rgba(196,132,29,0.3)' }}>
            Reset Password
          </h1>
        </div>
        <div className="mt-3 h-px bg-gradient-to-r from-transparent via-[#c4841d]/40 to-transparent" />
      </div>

      <div className="w-full max-w-md border border-[#2a2520] bg-[#111111]/95 panel-inset" data-testid="reset-password-card">
        {success ? (
          <div className="p-8 text-center">
            <Check className="w-10 h-10 text-[#6b7a3d] mx-auto mb-4" />
            <h2 className="font-heading text-lg uppercase tracking-widest text-[#6b7a3d] mb-2">Password Updated</h2>
            <p className="text-xs font-mono text-[#88837a] mb-6">You can now sign in with your new password.</p>
            <button
              onClick={onBack}
              data-testid="back-to-login"
              className="px-6 py-2.5 bg-[#c4841d] hover:bg-[#e8b84d] text-[#0a0a0a] font-heading text-xs uppercase tracking-[0.2em] transition-all"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-[10px] font-heading uppercase tracking-[0.3em] text-[#88837a] mb-1.5">New Password</label>
              <div className="relative">
                <input
                  data-testid="reset-new-password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#2a2520] text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none focus:ring-1 focus:ring-[#c4841d]/30 transition-all pr-10"
                  required
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#88837a] hover:text-[#c4841d] transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-heading uppercase tracking-[0.3em] text-[#88837a] mb-1.5">Confirm Password</label>
              <input
                data-testid="reset-confirm-password"
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#2a2520] text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none focus:ring-1 focus:ring-[#c4841d]/30 transition-all"
                required
                autoComplete="new-password"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 p-2.5 border border-[#8b3a3a]/60 bg-[#8b3a3a]/10" data-testid="reset-error">
                <AlertTriangle className="w-4 h-4 text-[#8b3a3a] shrink-0" />
                <span className="text-xs font-mono text-[#d4cfc4]">{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              data-testid="reset-submit"
              className="w-full py-3 bg-[#c4841d] hover:bg-[#e8b84d] text-[#0a0a0a] font-heading text-sm uppercase tracking-[0.3em] transition-all disabled:opacity-50"
            >
              {loading ? 'Resetting...' : 'Set New Password'}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full py-2 text-xs font-mono text-[#88837a] hover:text-[#c4841d] transition-colors uppercase tracking-widest"
            >
              Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
