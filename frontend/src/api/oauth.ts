import axios from 'axios';

// The default `services/api` axios instance has baseURL=`<host>/api`, but
// OAuth endpoints (consent, authorize, register, ...) live under `/oauth/...`
// directly — no `/api` prefix. Build a sibling axios instance pointing at the
// API host's *root*, derived from the same env var so dev/prod stay aligned.
const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const oauthBaseURL = apiBase.replace(/\/api\/?$/, '');

const oauthApi = axios.create({ baseURL: oauthBaseURL });

const ACCESS_KEY = 'curaciones_access_token';
const LEGACY_TOKEN_KEY = 'curaciones_token';

oauthApi.interceptors.request.use((config) => {
  const token =
    localStorage.getItem(ACCESS_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface ConsentClientInfo {
  name: string;
  logoUri: string | null;
  policyUri: string | null;
  tosUri: string | null;
  redirectUri: string | null;
  verified: boolean;
}

export interface ConsentScope {
  id: string;
  label: string;
  description: string;
}

export interface ConsentUser {
  id: number;
  username: string;
  fullName: string;
}

export interface ConsentOrganization {
  id: string;
  name: string;
  role: string;
}

export interface ConsentInteraction {
  client: ConsentClientInfo;
  scopes: ConsentScope[];
  user: ConsentUser;
  organizations: ConsentOrganization[];
  preselectedOrganizationId: string;
}

export async function fetchConsentInteraction(
  uid: string,
): Promise<ConsentInteraction> {
  const { data } = await oauthApi.get(`/oauth/consent/${uid}`);
  return data;
}

export async function submitConsent(
  uid: string,
  body: { approved: boolean; organizationId?: string },
): Promise<{ redirectTo: string }> {
  const { data } = await oauthApi.post(`/oauth/consent/${uid}`, body);
  return data;
}
