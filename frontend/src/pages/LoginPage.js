import { useState, useEffect, useRef } from 'react';
import { Radio, AlertTriangle, Eye, EyeOff, ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';

/* ─── Animated radar ping background ─── */
function RadarBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Grid */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(196,132,29,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(196,132,29,0.4) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />
      {/* Concentric rings */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="absolute top-1/2 left-1/2 rounded-full border border-[#c4841d]"
          style={{
            width: `${i * 320}px`, height: `${i * 320}px`,
            transform: 'translate(-50%, -50%)',
            opacity: 0.04 + (0.02 * (3 - i)),
            animation: `pulse ${4 + i}s ease-in-out infinite`,
            animationDelay: `${i * 0.8}s`,
          }}
        />
      ))}
      {/* Sweep line */}
      <div className="absolute top-1/2 left-1/2 w-[400px] h-px origin-left" style={{
        background: 'linear-gradient(90deg, rgba(196,132,29,0.15), transparent)',
        animation: 'spin 8s linear infinite',
        transformOrigin: '0 50%',
      }} />
      {/* Floating particles */}
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={`p${i}`} className="absolute w-px h-px bg-[#c4841d] rounded-full"
          style={{
            left: `${10 + Math.random() * 80}%`,
            top: `${10 + Math.random() * 80}%`,
            opacity: 0.15 + Math.random() * 0.25,
            animation: `float ${6 + Math.random() * 8}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 5}s`,
            boxShadow: '0 0 4px rgba(196,132,29,0.4)',
          }}
        />
      ))}
      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-20px) scale(1.5)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

/* ─── Typewriter hook ─── */
function useTypewriter(text, speed = 50, delay = 600) {
  const [display, setDisplay] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    let i = 0;
    const t = setTimeout(() => {
      const iv = setInterval(() => {
        setDisplay(text.slice(0, ++i));
        if (i >= text.length) { clearInterval(iv); setDone(true); }
      }, speed);
      return () => clearInterval(iv);
    }, delay);
    return () => clearTimeout(t);
  }, [text, speed, delay]);
  return [display, done];
}

export default function LoginPage({ onAuth }) {
  const [mode, setMode] = useState('login'); // login | register | forgot | reset-inline
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [callsign, setCallsign] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [visible, setVisible] = useState(false);

  const [tagline] = useTypewriter('AI-Narrated Companion // HumanitZ Operations', 35, 400);

  useEffect(() => { setTimeout(() => setVisible(true), 100); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        if (!callsign.trim() || callsign.trim().length < 2) { setError('Callsign must be at least 2 characters'); setLoading(false); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return; }
        const { data } = await api.post('/auth/register', { callsign: callsign.trim(), email: email.trim(), password });
        onAuth(data.user);
      } else {
        const { data } = await api.post('/auth/login', { email: email.trim(), password });
        onAuth(data.user);
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: email.trim() });
      if (data.reset_token) {
        setResetToken(data.reset_token);
        setMode('reset-inline');
      } else {
        setError('If that email is registered, a reset link would be sent. Please contact your server admin.');
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token: resetToken, password: newPassword });
      setResetSuccess(true);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  const backToLogin = () => {
    setMode('login');
    setError('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setResetSuccess(false);
  };

  const stagger = (i) => ({ animationDelay: `${0.3 + i * 0.08}s` });

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      <RadarBg />

      {/* Scanline overlay */}
      <div className="pointer-events-none fixed inset-0 z-50" style={{
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
      }} />

      {/* Vignette */}
      <div className="pointer-events-none fixed inset-0 z-40" style={{
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%)',
      }} />

      {/* Logo / Header */}
      <div className={`text-center mb-8 relative z-10 transition-all duration-1000 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-6'}`} data-testid="auth-header">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Radio className="w-7 h-7 text-[#c4841d]" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl uppercase tracking-[0.3em] text-[#c4841d]" style={{
            textShadow: '0 0 30px rgba(196,132,29,0.25), 0 0 60px rgba(196,132,29,0.1)',
          }}>
            Dead Signal
          </h1>
        </div>
        <p className="text-xs font-mono uppercase tracking-[0.4em] text-[#88837a] h-4">
          {tagline}<span className="animate-pulse">_</span>
        </p>
        <div className="mt-5 h-px bg-gradient-to-r from-transparent via-[#c4841d]/40 to-transparent max-w-sm mx-auto" />
      </div>

      {/* Auth Card */}
      <div className={`w-full max-w-md relative z-10 transition-all duration-700 delay-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} data-testid="auth-card">
        <div className="ds-panel backdrop-blur-sm shadow-2xl shadow-black/40 glow-amber-soft">

          {/* ─── Inline Reset Form ─── */}
          {mode === 'reset-inline' && (
            <div>
              <div className="border-b border-[#2a2520] p-3 flex items-center gap-2">
                <button onClick={backToLogin} className="text-[#88837a] hover:text-[#c4841d] transition-colors" data-testid="reset-back"><ArrowLeft className="w-4 h-4" /></button>
                <span className="text-xs font-heading uppercase tracking-[0.3em] text-[#c4841d]">Set New Password</span>
              </div>
              {resetSuccess ? (
                <div className="p-8 text-center">
                  <div className="w-14 h-14 rounded-full border-2 border-[#6b7a3d] flex items-center justify-center mx-auto mb-4" style={{ animation: 'pulse 2s ease-in-out infinite' }}>
                    <ShieldCheck className="w-7 h-7 text-[#6b7a3d]" />
                  </div>
                  <h2 className="font-heading text-lg uppercase tracking-widest text-[#6b7a3d] mb-2">Password Updated</h2>
                  <p className="text-xs font-mono text-[#88837a] mb-6">Your credentials have been reset. You can now sign in.</p>
                  <button onClick={backToLogin} data-testid="back-to-login-after-reset"
                    className="px-8 py-2.5 bg-[#c4841d] hover:bg-[#e8b84d] text-[#0a0a0a] font-heading text-xs uppercase tracking-[0.2em] transition-all">
                    Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetPassword} className="p-6 space-y-4">
                  <p className="text-xs font-mono text-[#88837a] mb-1">Enter your new password below.</p>
                  <div>
                    <label className="block text-[10px] font-heading uppercase tracking-[0.3em] text-[#88837a] mb-1.5">New Password</label>
                    <div className="relative">
                      <input data-testid="reset-new-password" type={showPw ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min 6 characters" required
                        className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#2a2520] text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none focus:ring-1 focus:ring-[#c4841d]/30 transition-all pr-10" />
                      <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#88837a] hover:text-[#c4841d] transition-colors">
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-heading uppercase tracking-[0.3em] text-[#88837a] mb-1.5">Confirm Password</label>
                    <input data-testid="reset-confirm-password" type={showPw ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat password" required autoComplete="new-password"
                      className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#2a2520] text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none focus:ring-1 focus:ring-[#c4841d]/30 transition-all" />
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 p-2.5 border border-[#8b3a3a]/60 bg-[#8b3a3a]/10" data-testid="reset-error">
                      <AlertTriangle className="w-4 h-4 text-[#8b3a3a] shrink-0" />
                      <span className="text-xs font-mono text-[#d4cfc4]">{error}</span>
                    </div>
                  )}
                  <button type="submit" disabled={loading} data-testid="reset-submit"
                    className="w-full py-3 bg-[#c4841d] hover:bg-[#e8b84d] text-[#0a0a0a] font-heading text-sm uppercase tracking-[0.3em] transition-all disabled:opacity-50">
                    {loading ? 'Resetting...' : 'Set New Password'}
                  </button>
                  <button type="button" onClick={backToLogin} className="w-full py-2 text-xs font-mono text-[#88837a] hover:text-[#c4841d] transition-colors uppercase tracking-widest">
                    Back to Sign In
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ─── Forgot Password ─── */}
          {mode === 'forgot' && (
            <div>
              <div className="border-b border-[#2a2520] p-3 flex items-center gap-2">
                <button onClick={backToLogin} className="text-[#88837a] hover:text-[#c4841d] transition-colors" data-testid="forgot-back"><ArrowLeft className="w-4 h-4" /></button>
                <span className="text-xs font-heading uppercase tracking-[0.3em] text-[#c4841d]">Password Recovery</span>
              </div>
              <form onSubmit={handleForgot} className="p-6 space-y-4">
                <p className="text-xs font-mono text-[#88837a] mb-1">Enter the email associated with your account to reset your password.</p>
                <div>
                  <label className="block text-[10px] font-heading uppercase tracking-[0.3em] text-[#88837a] mb-1.5">Email</label>
                  <input data-testid="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@example.com" required autoComplete="email"
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#2a2520] text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none focus:ring-1 focus:ring-[#c4841d]/30 transition-all" />
                </div>
                {error && (
                  <div className="flex items-center gap-2 p-2.5 border border-[#8b3a3a]/60 bg-[#8b3a3a]/10" data-testid="auth-error">
                    <AlertTriangle className="w-4 h-4 text-[#8b3a3a] shrink-0" />
                    <span className="text-xs font-mono text-[#d4cfc4]">{error}</span>
                  </div>
                )}
                <button type="submit" disabled={loading} data-testid="forgot-submit"
                  className="w-full py-3 bg-[#c4841d] hover:bg-[#e8b84d] text-[#0a0a0a] font-heading text-sm uppercase tracking-[0.3em] transition-all disabled:opacity-50">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
                      Verifying...
                    </span>
                  ) : 'Recover Password'}
                </button>
                <button type="button" onClick={backToLogin} className="w-full py-2 text-xs font-mono text-[#88837a] hover:text-[#c4841d] transition-colors uppercase tracking-widest">
                  Back to Sign In
                </button>
              </form>
            </div>
          )}

          {/* ─── Login / Register ─── */}
          {(mode === 'login' || mode === 'register') && (
            <>
              <div className="flex border-b border-[#2a2520]">
                <button data-testid="auth-tab-login" onClick={() => { setMode('login'); setError(''); }}
                  className={`flex-1 py-3 text-xs font-heading uppercase tracking-[0.3em] transition-all ${mode === 'login' ? 'text-[#c4841d] bg-[#c4841d]/5 border-b-2 border-[#c4841d]' : 'text-[#88837a] hover:text-[#d4cfc4]'}`}>
                  Sign In
                </button>
                <button data-testid="auth-tab-register" onClick={() => { setMode('register'); setError(''); }}
                  className={`flex-1 py-3 text-xs font-heading uppercase tracking-[0.3em] transition-all ${mode === 'register' ? 'text-[#c4841d] bg-[#c4841d]/5 border-b-2 border-[#c4841d]' : 'text-[#88837a] hover:text-[#d4cfc4]'}`}>
                  Register
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {mode === 'register' && (
                  <div className="form-field-enter" style={stagger(0)}>
                    <label className="block text-[10px] font-heading uppercase tracking-[0.3em] text-[#88837a] mb-1.5">Callsign</label>
                    <input data-testid="auth-callsign" type="text" value={callsign} onChange={(e) => setCallsign(e.target.value)}
                      placeholder="Your operator name" required autoComplete="nickname"
                      className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#2a2520] text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none focus:ring-1 focus:ring-[#c4841d]/30 transition-all" />
                    <p className="mt-1 text-[9px] font-mono text-[#88837a]/60">Your public identity in the wasteland</p>
                  </div>
                )}
                <div className="form-field-enter" style={stagger(mode === 'register' ? 1 : 0)}>
                  <label className="block text-[10px] font-heading uppercase tracking-[0.3em] text-[#88837a] mb-1.5">Email</label>
                  <input data-testid="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@example.com" required autoComplete="email"
                    className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#2a2520] text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none focus:ring-1 focus:ring-[#c4841d]/30 transition-all" />
                </div>
                <div className="form-field-enter" style={stagger(mode === 'register' ? 2 : 1)}>
                  <label className="block text-[10px] font-heading uppercase tracking-[0.3em] text-[#88837a] mb-1.5">Password</label>
                  <div className="relative">
                    <input data-testid="auth-password" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'register' ? 'Min 6 characters' : 'Enter password'} required autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      className="w-full px-3 py-2.5 bg-[#0a0a0a] border border-[#2a2520] text-sm font-mono text-[#d4cfc4] placeholder-[#88837a]/50 focus:border-[#c4841d] focus:outline-none focus:ring-1 focus:ring-[#c4841d]/30 transition-all pr-10" />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#88837a] hover:text-[#c4841d] transition-colors" data-testid="auth-toggle-password">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {mode === 'login' && (
                  <div className="text-right form-field-enter" style={stagger(2)}>
                    <button type="button" onClick={() => { setMode('forgot'); setError(''); }}
                      className="text-[10px] font-mono text-[#88837a] hover:text-[#c4841d] transition-colors uppercase tracking-widest" data-testid="forgot-password-link">
                      Forgot password?
                    </button>
                  </div>
                )}
                {error && (
                  <div className="flex items-center gap-2 p-2.5 border border-[#8b3a3a]/60 bg-[#8b3a3a]/10" data-testid="auth-error">
                    <AlertTriangle className="w-4 h-4 text-[#8b3a3a] shrink-0" />
                    <span className="text-xs font-mono text-[#d4cfc4]">{error}</span>
                  </div>
                )}
                <button type="submit" disabled={loading} data-testid="auth-submit"
                  className="w-full py-3 bg-[#c4841d] hover:bg-[#e8b84d] text-[#0a0a0a] font-heading text-sm uppercase tracking-[0.3em] transition-all disabled:opacity-50 disabled:cursor-not-allowed form-field-enter" style={stagger(3)}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-[#0a0a0a] border-t-transparent rounded-full animate-spin" />
                      {mode === 'register' ? 'Registering...' : 'Authenticating...'}
                    </span>
                  ) : (mode === 'register' ? 'Create Account' : 'Sign In')}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 text-center">
          <p className="text-[10px] font-mono text-[#88837a]/50 tracking-wider">
            Secure connection // End-to-end encrypted
          </p>
        </div>
      </div>
    </div>
  );
}
