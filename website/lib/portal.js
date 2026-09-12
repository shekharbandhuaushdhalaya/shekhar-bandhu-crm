import { API_BASE } from './products';

const TOKEN_KEY = 'sba_portal_token';
const CUSTOMER_KEY = 'sba_portal_customer';

export function getPortalToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function savePortalSession(token, customer) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer || {}));
}

export function clearPortalSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_KEY);
}

export function getSavedPortalCustomer() {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(CUSTOMER_KEY) || 'null'); } catch { return null; }
}

export async function portalFetch(path, options = {}) {
  const token = getPortalToken();
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(body.error || `Request failed (${res.status})`);
    error.status = res.status;
    error.code = body.code;
    throw error;
  }
  return body;
}

export const portalApi = {
  login: async (email, password) => {
    const out = await portalFetch('/portal/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    savePortalSession(out.token, out.customer);
    return out;
  },
  me: () => portalFetch('/portal/me'),
  dashboard: () => portalFetch('/portal/dashboard'),
  catalog: ({ q = '', page = 1, limit = 100 } = {}) => portalFetch(`/portal/catalog?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`),
  product: (id, qty = 1) => portalFetch(`/portal/catalog/${id}?qty=${qty}`),
  orders: () => portalFetch('/portal/orders'),
  placeOrder: (payload) => portalFetch('/portal/orders', { method: 'POST', body: JSON.stringify(payload) }),
  repeatOrder: (id) => portalFetch(`/portal/orders/${id}/repeat`, { method: 'POST', body: JSON.stringify({ clientOrderRef: `web-repeat-${id}-${Date.now()}` }) }),
  trackOrder: (id) => portalFetch(`/portal/orders/${id}/track`),
  invoices: () => portalFetch('/portal/invoices'),
  invoice: (id) => portalFetch(`/portal/invoices/${id}/pdf`),
  ageing: () => portalFetch('/portal/receivables-ageing')
};
