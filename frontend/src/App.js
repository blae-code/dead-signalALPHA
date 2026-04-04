import { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import api from '@/lib/api';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import OnboardingFlow from '@/components/OnboardingFlow';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = (userData) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch { /* ignore */ }
    setUser(null);
  };

  const completeOnboarding = () => {
    setUser((prev) => prev ? { ...prev, onboarded: true } : prev);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
}

function AppRoutes() {
  const { user, loading, login, logout, completeOnboarding } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center noise-bg">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#c4841d] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-mono uppercase tracking-widest text-[#88837a]">Establishing connection...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onAuth={login} />;
  }

  if (!user.onboarded) {
    return <OnboardingFlow user={user} onComplete={completeOnboarding} />;
  }

  return (
    <Routes>
      <Route path="/" element={<DashboardPage user={user} onLogout={logout} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
