import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, switchOrg as apiSwitchOrg } from '../services/api';

const ACCESS_KEY = 'curaciones_access_token';
const REFRESH_KEY = 'curaciones_refresh_token';
const USER_KEY = 'curaciones_user';
const ORGS_KEY = 'curaciones_orgs';
const CURRENT_ORG_KEY = 'curaciones_current_org';
// Legacy key kept so old tokens are migrated/cleared cleanly.
const LEGACY_TOKEN_KEY = 'curaciones_token';

export interface AuthUser {
  id: number;
  username: string;
  role?: string;
}

export interface OrgSummary {
  id: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  organizations: OrgSummary[];
  currentOrg: OrgSummary | null;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  switchOrg: (organizationId: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  // Backward-compatible aliases used throughout the app.
  token: string | null;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function isAdminRole(role?: string | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<OrgSummary[]>([]);
  const [currentOrg, setCurrentOrg] = useState<OrgSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const a = localStorage.getItem(ACCESS_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY);
    const r = localStorage.getItem(REFRESH_KEY);
    const u = localStorage.getItem(USER_KEY);
    const o = localStorage.getItem(ORGS_KEY);
    const co = localStorage.getItem(CURRENT_ORG_KEY);
    if (a && u) {
      setAccessToken(a);
      setRefreshToken(r);
      try {
        setUser(JSON.parse(u));
      } catch {
        // ignore parse errors
      }
      try {
        setOrganizations(JSON.parse(o ?? '[]'));
      } catch {
        setOrganizations([]);
      }
      try {
        setCurrentOrg(co ? JSON.parse(co) : null);
      } catch {
        setCurrentOrg(null);
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (usernameOrEmail: string, password: string) => {
    const data = await apiLogin(usernameOrEmail, password);

    // Support both new (multi-tenant) and legacy login response shapes so that
    // the frontend keeps working while the backend rolls out org-aware tokens.
    const access: string = data.accessToken ?? data.access_token;
    const refresh: string | null = data.refreshToken ?? null;
    const u: AuthUser = data.user;
    const orgs: OrgSummary[] = Array.isArray(data.organizations) ? data.organizations : [];
    const co: OrgSummary | null = orgs[0] ?? null;

    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    localStorage.setItem(ORGS_KEY, JSON.stringify(orgs));
    if (co) {
      localStorage.setItem(CURRENT_ORG_KEY, JSON.stringify(co));
    } else {
      localStorage.removeItem(CURRENT_ORG_KEY);
    }
    // Clear legacy key once new login flow is complete.
    localStorage.removeItem(LEGACY_TOKEN_KEY);

    setAccessToken(access);
    setRefreshToken(refresh);
    setUser(u);
    setOrganizations(orgs);
    setCurrentOrg(co);
  }, []);

  const switchOrg = useCallback(
    async (organizationId: string) => {
      const data = await apiSwitchOrg(organizationId);
      const access: string = data.accessToken ?? data.access_token;
      localStorage.setItem(ACCESS_KEY, access);
      setAccessToken(access);
      const co = organizations.find((o) => o.id === organizationId) ?? null;
      if (co) {
        localStorage.setItem(CURRENT_ORG_KEY, JSON.stringify(co));
        setCurrentOrg(co);
      }
    },
    [organizations],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ORGS_KEY);
    localStorage.removeItem(CURRENT_ORG_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setOrganizations([]);
    setCurrentOrg(null);
  }, []);

  const isAdmin = isAdminRole(currentOrg?.role) || isAdminRole(user?.role);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        refreshToken,
        organizations,
        currentOrg,
        login,
        switchOrg,
        logout,
        loading,
        token: accessToken,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
