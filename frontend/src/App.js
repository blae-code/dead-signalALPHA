import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import api from '@/lib/api';
import LoginPage from '@/pages/LoginPage';
import SetupPage from '@/pages/SetupPage';
import DashboardPage from '@/pages/DashboardPage';
import CRTOverlay from '@/components/CRTOverlay';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // null = checking
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(null); // null = checking, true/false

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkSetup = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/setup-status');
      setSetupRequired(data.setup_required);
    } catch {
      setSetupRequired(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
    checkSetup();
  }, [checkAuth, checkSetup]);

  const login = async (callsign, authKey) => {
    const { data } = await api.post('/auth/login', { callsign, auth_key: authKey });
    setUser(data);
    return data;
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, setupRequired, login, logout, checkAuth, checkSetup }}>
      {children}
    </AuthContext.Provider>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading, setupRequired } = useAuth();
  if (loading || setupRequired === null) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center">
        <div className="font-heading text-2xl uppercase tracking-widest text-[#c4841d] glow-amber-text">
          Establishing Signal...
        </div>
      </div>
    );
  }
  if (setupRequired) return <Navigate to="/setup" replace />;
  if (user === false) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CRTOverlay />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
