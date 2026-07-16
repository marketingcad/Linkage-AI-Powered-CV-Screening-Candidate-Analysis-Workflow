import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { clearToken, getToken, setToken } from '../api/client';
import { fetchMe, login as loginRequest, loginMfa as loginMfaRequest } from '../api/endpoints';
import type { HrUser } from '../api/types';

interface AuthState {
  user: HrUser | null;
  loading: boolean;
  /** Returns whether a second (2FA) step is required before the session is active. */
  login: (email: string, password: string) => Promise<{ mfaRequired: boolean; mfaToken?: string }>;
  /** Complete the 2FA step with the authenticator code. */
  completeMfa: (mfaToken: string, code: string) => Promise<void>;
  logout: () => void;
  /** Persist a refreshed token + user (e.g. after a profile update). */
  applyAuth: (token: string, user: HrUser) => void;
  /** Update just the cached user (e.g. after toggling 2FA — no new token). */
  updateUser: (user: HrUser) => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<HrUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then((res) => setUser(res.user))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginRequest(email, password);
    if (res.mfaRequired) {
      return { mfaRequired: true, mfaToken: res.mfaToken };
    }
    setToken(res.token);
    setUser(res.user);
    return { mfaRequired: false };
  }, []);

  const completeMfa = useCallback(async (mfaToken: string, code: string) => {
    const res = await loginMfaRequest(mfaToken, code);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const applyAuth = useCallback((token: string, nextUser: HrUser) => {
    setToken(token);
    setUser(nextUser);
  }, []);

  const updateUser = useCallback((nextUser: HrUser) => setUser(nextUser), []);

  const value = useMemo(
    () => ({ user, loading, login, completeMfa, logout, applyAuth, updateUser }),
    [user, loading, login, completeMfa, logout, applyAuth, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
