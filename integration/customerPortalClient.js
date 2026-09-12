// Framework-agnostic client for the separate customer website.
// Set API_BASE_URL to the deployed CRM backend, e.g. https://your-api.onrender.com/api
export function createCustomerPortalClient(API_BASE_URL, tokenStore = {}) {
  let memoryToken = null;
  const getToken = () => tokenStore.get ? tokenStore.get() : memoryToken;
  const setToken = (value) => tokenStore.set ? tokenStore.set(value) : (memoryToken = value);
  async function call(path, options = {}) {
    const token = getToken();
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }
  return {
    async login(email, password) { const out = await call('/portal/auth/login', { method:'POST', body:JSON.stringify({email,password}) }); setToken(out.token); return out; },
    me: () => call('/portal/me'),
    dashboard: () => call('/portal/dashboard'),
    catalog: ({ q='', page=1, limit=24 }={}) => call(`/portal/catalog?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`),
    product: (id, qty=1) => call(`/portal/catalog/${id}?qty=${qty}`),
    orders: () => call('/portal/orders'),
    placeOrder: (payload) => call('/portal/orders', { method:'POST', body:JSON.stringify(payload) }),
    repeatOrder: (orderId, clientOrderRef) => call(`/portal/orders/${orderId}/repeat`, { method:'POST', body:JSON.stringify({clientOrderRef}) }),
    trackOrder: (orderId) => call(`/portal/orders/${orderId}/track`),
    invoices: () => call('/portal/invoices'),
    invoice: (id) => call(`/portal/invoices/${id}/pdf`),
    ageing: () => call('/portal/receivables-ageing'),
    setToken,
    getToken
  };
}
