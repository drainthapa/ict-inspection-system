import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/auth.service.js';
import { useToast } from './ToastContext.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();

  // Restore the session from the httpOnly cookie on first load
  useEffect(() => {
    authService.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // A 401 anywhere means the server ended the session
  useEffect(() => {
    const onExpired = () => {
      setUser((current) => {
        if (current) toast.error('Your session has ended. Please log in again.');
        return null;
      });
      navigate('/login', { replace: true });
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [navigate, toast]);

  const login = useCallback(async (username, password) => {
    const profile = await authService.login(username, password);
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    try { await authService.logout(); } catch { /* already signed out server-side */ }
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const refresh = useCallback(() => authService.me().then(setUser), []);

  const value = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    refresh,
    hasRole: (...roles) => !!user && roles.includes(user.role),
  }), [user, loading, login, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
