// API Client — Dual mode: Server fetch with localStorage fallback
import { Platform, DeviceEventEmitter } from 'react-native';
import { authStorage } from './storage';
import type {
  Contact, Task, Activity, DashboardStats, Customer, Vendor, Product,
  ChallanItem, Challan, Payment, ProductQuery, Inventory, Warehouse,
  InventoryEntry, ConsolidatedInventory, StockLedger, InvoiceItem, Invoice,
  QuotationItem, Quotation, RawMaterial, RawMaterialEntry, BOMIngredient,
  BillOfMaterials, ManufacturingStage, BatchProductionIngredient, BatchProduction,
  Complaint, SampleItem, Sample, SalesTarget, CommissionReport, StockMovementItem,
  StockMovement, Dispatch, DeadStockItem, BMRReportIngredient, BMRReport,
  BatchGenealogyIngredient, BatchGenealogy, RawMaterialGenealogyBatch,
  RawMaterialGenealogy, TraceRawMaterialEntry, TraceProductionBatch, TraceFinishedGood,
  TraceChallan, TraceInvoice, TraceDispatch, TraceResult, RolePermissionConfig,
  RBACPermissionsResponse, PaymentOrderResponse, PaymentVerifyResponse,
  ManufacturingAnalytics, OrderItem, Order, MedicalRepresentative, MrDailyLog,
  MrVisit, MrAssignment, Doctor, MrExpense, MrDashboardSummary, Campaign, CampaignAnalytics,
  ManufacturingUnit, ExpiryAlert, MrSampleStock, MrpResponse
} from './api/types';

export * from './api/types';

import Constants from 'expo-constants';

// Dynamically determine the backend URL based on the environment
const getBaseUrl = () => {
  // Check if a hosted API URL is defined in the environment (useful for Vercel/production)
  const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envApiUrl) return envApiUrl;

  if (Platform.OS === 'web') { throw new Error('EXPO_PUBLIC_API_URL is required for the web build'); }

  // Try to use the Expo Host URI if running in Expo Go
  const hostUri = Constants?.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    // If it resolves to localhost (e.g. in some iOS simulators), map it correctly
    if (ip === 'localhost' || ip === '127.0.0.1') {
      return Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api';
    }
    return `http://${ip}:5000/api`;
  }

  // Fallback for Android Emulator
  if (Platform.OS === 'android' && !Constants.isDevice) return 'http://10.0.2.2:5000/api';

  // Fallback — user can configure the correct URL from Profile > Server URL
  throw new Error('EXPO_PUBLIC_API_URL is required when the backend URL cannot be inferred');
};

export let API_BASE = getBaseUrl();

export function getApiBaseUrl(): string {
  return API_BASE;
}

export function setApiBaseUrl(newUrl: string): void {
  API_BASE = newUrl;
}

export function createMutationKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export const getImageUrl = (imagePath: string | undefined): string => {
  if (!imagePath) return '';
  if (imagePath.startsWith('http') || imagePath.startsWith('data:')) return imagePath;
  const baseUrl = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE;
  const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${baseUrl}${cleanPath}`;
};

export interface CreditNote {
  _id: string;
  noteNo: string;
  type: 'credit_note' | 'debit_note';
  partyType: 'Customer' | 'Vendor';
  partyId?: string;
  partyName: string;
  invoiceNo?: string;
  baseAmount?: number;
  taxAmount?: number;
  gstRate?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  totalAmount: number;
  reason?: string;
  status: 'draft' | 'finalized' | 'cancelled';
  date: string;
}

const STORAGE_KEY = 'vp_crm_database';
class ApiClient {
  private authToken: string | null = null;
  currentUser: any = null;
  private refreshInFlight: Promise<string | null> | null = null;

  async refreshAccessToken(): Promise<string | null> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      try {
        const refreshToken = await authStorage.getItem('vp_crm_refresh_token');
        if (!refreshToken) return null;
        const base = API_BASE;
        const res = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.token) { this.authToken = data.token; await authStorage.setItem('vp_crm_token', data.token); }
        if (data.refreshToken) await authStorage.setItem('vp_crm_refresh_token', data.refreshToken);
        return data.token || null;
      } catch { return null; } finally { this.refreshInFlight = null; }
    })();
    return this.refreshInFlight;
  }

  setToken(token: string | null, user?: any) {
    this.authToken = token;
    this.currentUser = user || null;
  }

  getAuthToken(): string {
    return this.authToken || '';
  }

  async checkConnection(): Promise<boolean> {
    try { const base = API_BASE.replace(/\/api\/?$/, ''); const res = await fetch(`${base}/api/health`, { method: 'GET' }); return res.ok; } catch { return false; }
  }

  private activeRequests = 0;
  // Small in-memory SWR cache. Keep it bounded so a long admin session cannot
  // accumulate every URL ever visited. Socket events selectively invalidate it.
  private cacheStore: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly cacheTTL = 15000;
  private readonly maxCacheEntries = 80;
  private inFlightRequests: Map<string, Promise<Response>> = new Map();

  clearCache(pattern?: string) {
    if (!pattern) {
      this.cacheStore.clear();
      return;
    }
    const lowerPattern = pattern.toLowerCase();
    for (const key of this.cacheStore.keys()) {
      if (key.toLowerCase().includes(lowerPattern)) this.cacheStore.delete(key);
    }
  }

  private invalidateMutation(url: string) {
    const apiPath = url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/api\//, '');
    const firstSegment = apiPath.split(/[/?#]/)[0].toLowerCase();
    if (firstSegment) this.clearCache(firstSegment);
    // Dashboard aggregates depend on most business mutations. Invalidate only
    // those small, high-value aggregates rather than every cached endpoint.
    this.clearCache('/dashboard');
    this.clearCache('/activities');
  }

  private setCache(url: string, data: any) {
    if (this.cacheStore.has(url)) this.cacheStore.delete(url);
    this.cacheStore.set(url, { data, timestamp: Date.now() });
    while (this.cacheStore.size > this.maxCacheEntries) {
      const oldest = this.cacheStore.keys().next().value;
      if (oldest) this.cacheStore.delete(oldest); else break;
    }
  }

  private async request(url: string, options: RequestInit = {}): Promise<Response> {
    const method = options.method || 'GET';
    const isGet = method.toUpperCase() === 'GET';
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
    const hasCacheBust = url.includes('_cb=') || url.includes('_t=');

    // SWR memory cache lookup (skip if cache-bust param present)
    if (isGet && !hasCacheBust) {
      const cached = this.cacheStore.get(url);
      if (cached && (Date.now() - cached.timestamp < this.cacheTTL)) {
        // Touch the entry so the Map doubles as a tiny LRU cache.
        this.cacheStore.delete(url);
        this.cacheStore.set(url, cached);
        return {
          ok: true,
          status: 200,
          json: async () => JSON.parse(JSON.stringify(cached.data)),
          text: async () => JSON.stringify(cached.data),
          clone: () => ({
            json: async () => JSON.parse(JSON.stringify(cached.data))
          })
        } as any;
      }

      // Request deduplication: if request is already in flight, reuse its promise
      if (this.inFlightRequests.has(url)) {
        const inFlightRes = await this.inFlightRequests.get(url)!;
        return inFlightRes.clone();
      }
    } else if (isMutating) {
      // Do not flush the entire cache for every write. Invalidate the affected
      // domain plus dashboard aggregates, preserving unrelated screen data.
      this.invalidateMutation(url);
    }

    const promise = (async () => {
      const headers = {
        ...(options.headers || {}),
        'Content-Type': 'application/json',
      } as Record<string, string>;

      if (!this.authToken) {
        try {
          this.authToken = await authStorage.getItem('vp_crm_token');
        } catch (e) { }
      }

      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      // Let the server/browser cache policy work normally. The client SWR cache
      // above already handles freshness and socket-driven invalidation.
      const fetchUrl = url;

      let loaderStarted = false;
      let getLoaderTimer: ReturnType<typeof setTimeout> | null = null;
      const startLoader = () => {
        if (loaderStarted) return;
        loaderStarted = true;
        this.activeRequests++;
        DeviceEventEmitter.emit('global_loader', { isLoading: this.activeRequests > 0 });
      };
      if (isMutating) startLoader();
      else if (isGet) getLoaderTimer = setTimeout(startLoader, 300);

      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeout = setTimeout(() => controller?.abort(), 30000);
        let res: Response;
        try {
          res = await fetch(fetchUrl, { ...options, headers, ...(controller ? { signal: controller.signal } : {}) });
        } catch (netErr: any) {
          const message = netErr?.name === 'AbortError'
            ? 'The server took too long to respond. Please try again.'
            : `Connection Error: Unable to reach backend server (${netErr?.message || 'Network Failure'}). Please check your connection and try again.`;
          throw new Error(message);
        } finally {
          clearTimeout(timeout);
        }
        if (!res.ok && res.status === 401 && !url.includes('/auth/refresh') && !url.includes('/auth/login')) {
          const nextToken = this.authToken ? await this.refreshAccessToken() : null;
          if (nextToken) {
            headers['Authorization'] = `Bearer ${nextToken}`;
            const retry = await fetch(fetchUrl, { ...options, headers });
            if (retry.ok) return retry;
          }
          DeviceEventEmitter.emit('auth_error');
        }
        if (!res.ok) {
          let errMsg = 'API Error';
          try {
            const errData = await res.json();
            errMsg = errData.error || errData.message || res.statusText;
            if (res.status === 429) errMsg = 'Too many requests. Please wait a moment and try again.';
            if (errData.issues && Array.isArray(errData.issues) && errData.issues.length > 0) {
              const details = errData.issues.map((i: any) => `${i.path || 'field'}: ${i.message}`).join(', ');
              errMsg = `${errMsg} (${details})`;
            } else if (errData.fields && typeof errData.fields === 'object') {
              const details = Object.entries(errData.fields).map(([k, v]) => `${k}: ${v}`).join(', ');
              if (details) errMsg = `${errMsg} (${details})`;
            }
          } catch {
            errMsg = res.statusText;
          }
          throw new Error(errMsg);
        }

        // Populate memory cache on successful GET responses
        if (isGet) {
          try {
            const resClone = res.clone();
            const data = await resClone.json();
            this.setCache(url, data);
          } catch (e) {
            // If clone fails, read directly and return custom response
            try {
              const data = await res.json();
              this.setCache(url, data);
              return {
                ok: true,
                status: res.status,
                json: async () => data,
                text: async () => JSON.stringify(data),
                clone: () => ({
                  json: async () => data
                })
              } as any;
            } catch (errInner) { }
          }
        }

        return res;
      } finally {
        if (getLoaderTimer) clearTimeout(getLoaderTimer);
        if (loaderStarted) {
          this.activeRequests = Math.max(0, this.activeRequests - 1);
          DeviceEventEmitter.emit('global_loader', { isLoading: this.activeRequests > 0 });
        }
      }
    })();

    if (isGet && !hasCacheBust) {
      this.inFlightRequests.set(url, promise);
      try {
        return await promise;
      } finally {
        this.inFlightRequests.delete(url);
      }
    }

    return promise;
  }

  async requestJson<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const url = path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await this.request(url, options);
    return res.json();
  }

  // --- Auth ---
  async login(email: string, password: string): Promise<{ token?: string; refreshToken?: string; user?: any; mfaRequired?: boolean; mfaToken?: string }> {
    const res = await this.request(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return res.json();
  }

  async getUsers(): Promise<any[]> {
    const res = await this.request(`${API_BASE}/auth/users`);
    return res.json();
  }

  async register(data: any): Promise<any> {
    const res = await this.request(`${API_BASE}/auth/register`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async updateUserPermissions(id: string, data: { role?: string; canAccessCash?: boolean }): Promise<any> {
    const res = await this.request(`${API_BASE}/auth/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async deleteUser(id: string): Promise<any> {
    const res = await this.request(`${API_BASE}/auth/users/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  }

  async getMe(): Promise<any> {
    const res = await this.request(`${API_BASE}/auth/me`);
    return res.json();
  }

  async getSystemSettings(): Promise<any> {
    const res = await this.request(`${API_BASE}/system/settings`);
    return res.json();
  }

  async updateSystemSettings(data: any): Promise<any> {
    const res = await this.request(`${API_BASE}/system/settings`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async getFirms(): Promise<any[]> { const res = await this.request(`${API_BASE}/auth/firms`); return res.json(); }
  async switchFirm(firmId: string): Promise<any> { const res = await this.request(`${API_BASE}/auth/firms/switch`, { method: 'POST', body: JSON.stringify({ firmId }) }); return res.json(); }

  async logout(refreshToken?: string): Promise<any> {
    const res = await this.request(`${API_BASE}/auth/logout`, { method: 'POST', body: JSON.stringify({ refreshToken }) });
    return res.json();
  }

  // --- MFA (TOTP) ---
  async setupMfa(): Promise<{ secret: string; qrCode: string; otpauthUrl: string }> {
    const res = await this.request(`${API_BASE}/auth/mfa/setup`, { method: 'POST' });
    return res.json();
  }

  async verifyMfaSetup(token: string): Promise<any> {
    const res = await this.request(`${API_BASE}/auth/mfa/verify-setup`, {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    return res.json();
  }

  async verifyMfaLogin(mfaToken: string, totpCode: string): Promise<{ token: string; refreshToken?: string; user: any }> {
    const res = await this.request(`${API_BASE}/auth/mfa/verify`, {
      method: 'POST',
      body: JSON.stringify({ mfaToken, totpCode }),
    });
    return res.json();
  }

  async disableMfa(password: string, totpCode: string): Promise<any> {
    const res = await this.request(`${API_BASE}/auth/mfa/disable`, {
      method: 'POST',
      body: JSON.stringify({ password, totpCode }),
    });
    return res.json();
  }

  async adminDisableMfa(userId: string): Promise<any> {
    const res = await this.request(`${API_BASE}/auth/mfa/admin-disable/${userId}`, { method: 'PUT' });
    return res.json();
  }

  async getAuditLogs(search: string = '', page: number = 1, limit: number = 50, dateFrom?: string, dateTo?: string): Promise<any> {

    const params: Record<string, string> = {
      search,
      page: page.toString(),
      limit: limit.toString()
    };
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    const queryParams = new URLSearchParams(params);
    const res = await this.request(`${API_BASE}/system/audit-logs?${queryParams}`);
    return res.json();
  }

  async updateProfile(data: { name: string; email: string }): Promise<any> {
    const res = await this.request(`${API_BASE}/auth/update-profile`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  }

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<any> {
    const res = await this.request(`${API_BASE}/auth/change-password`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.json();
  }

  // --- Contacts ---
  async getContacts(search = '', stage = 'all', page?: number, limit?: number): Promise<any> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (stage && stage !== 'all') params.append('stage', stage);
    if (page !== undefined) params.append('page', page.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request(`${API_BASE}/contacts${query}`);
    return res.json();
  }
  async getContact(id: string): Promise<Contact | null> {
    const res = await this.request(`${API_BASE}/contacts/${id}`);
    return res.json();
  }
  async createContact(data: Partial<Contact>): Promise<Contact> {
    const res = await this.request(`${API_BASE}/contacts`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateContactStage(id: string, stage: string): Promise<Contact> {
    const res = await this.request(`${API_BASE}/contacts/${id}`, { method: 'PUT', body: JSON.stringify({ stage }) });
    return res.json();
  }
  async logInteraction(id: string, type: string, note: string): Promise<Contact> {
    const res = await this.request(`${API_BASE}/contacts/${id}/interactions`, { method: 'POST', body: JSON.stringify({ type, note }) });
    return res.json();
  }
  async deleteContact(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/contacts/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Tasks ---
  async getTasks(filter = 'all'): Promise<Task[]> {
    const res = await this.request(`${API_BASE}/tasks?filter=${filter}`);
    return res.json();
  }
  async createTask(data: Partial<Task>): Promise<Task> {
    const res = await this.request(`${API_BASE}/tasks`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async toggleTask(id: string): Promise<Task> {
    const res = await this.request(`${API_BASE}/tasks/${id}/toggle`, { method: 'PUT' });
    return res.json();
  }
  async deleteTask(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/tasks/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Dashboard ---
  async getStats(): Promise<DashboardStats> {
    const res = await this.request(`${API_BASE}/dashboard/stats`);
    return res.json();
  }
  async getActivities(): Promise<any[]> {
    const res = await this.request(`${API_BASE}/dashboard/activities`);
    return res.json();
  }
  async askAiAnalytics(prompt: string): Promise<any> {
    const res = await this.request(`${API_BASE}/analytics/ask`, { method: "POST", body: JSON.stringify({ prompt }) });
    return res.json();
  }


  // --- Customers ---
  async getCustomers(search = '', mode = 'all', page?: number, limit?: number): Promise<any> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (mode && mode !== 'all') params.append('mode', mode);
    if (page !== undefined) params.append('page', page.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request(`${API_BASE}/customers${query}`);
    return res.json();
  }
  async getCustomer(id: string): Promise<Customer | null> {
    const res = await this.request(`${API_BASE}/customers/${id}`);
    return res.json();
  }
  async createCustomer(data: Partial<Customer>): Promise<Customer> {
    const res = await this.request(`${API_BASE}/customers`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
    const res = await this.request(`${API_BASE}/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteCustomer(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/customers/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Vendors ---
  async getVendors(search = '', page?: number, limit?: number): Promise<any> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (page !== undefined) params.append('page', page.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request(`${API_BASE}/vendors${query}`);
    return res.json();
  }
  async getVendor(id: string): Promise<Vendor | null> {
    const res = await this.request(`${API_BASE}/vendors/${id}`);
    return res.json();
  }
  async createVendor(data: Partial<Vendor>): Promise<Vendor> {
    const res = await this.request(`${API_BASE}/vendors`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateVendor(id: string, data: Partial<Vendor>): Promise<Vendor> {
    const res = await this.request(`${API_BASE}/vendors/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteVendor(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/vendors/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  async verifyGSTIN(gstin: string): Promise<{ companyName: string; billingAddress: string; state: string; placeOfSupply: string }> {
    const res = await this.request(`${API_BASE}/parties/verify-gstin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ gstin })
    });
    return res.json();
  }

  // --- Products ---
  async getProducts(search = '', vendorId: string | number = '', page?: number, limit?: number): Promise<any> {
    let actualVendorId = '';
    let actualPage = page;
    let actualLimit = limit;
    if (typeof vendorId === 'number') {
      actualLimit = page;
      actualPage = vendorId;
      actualVendorId = '';
    } else {
      actualVendorId = vendorId;
    }

    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (actualVendorId) params.append('vendorId', actualVendorId);
    if (actualPage !== undefined) params.append('page', actualPage.toString());
    if (actualLimit !== undefined) params.append('limit', actualLimit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request(`${API_BASE}/products${query}`);
    return res.json();
  }
  async getProduct(id: string): Promise<Product | null> {
    const res = await this.request(`${API_BASE}/products/${id}`);
    return res.json();
  }
  async createProduct(data: Partial<Product>): Promise<Product> {
    const res = await this.request(`${API_BASE}/products`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    const res = await this.request(`${API_BASE}/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteProduct(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/products/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  async updateProductPricing(id: string, data: { price?: number; discount?: number; discountLabel?: string; websitePromoActive?: boolean }): Promise<Product> {
    const res = await this.request(`${API_BASE}/products/${id}/pricing`, { method: 'PATCH', body: JSON.stringify(data) });
    return res.json();
  }


  async uploadProductImage(id: string, imageUri: string): Promise<Product> {
    const formData = new FormData();
    let cleanFilename = 'image.jpg';
    let mimeType = 'image/jpeg';

    if (imageUri.startsWith('data:')) {
      const match = imageUri.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
      if (match) {
        mimeType = match[1];
        const ext = mimeType.split('/')[1] || 'jpg';
        cleanFilename = `image.${ext}`;
      }
    } else {
      const filename = imageUri.split('/').pop() || 'image.jpg';
      cleanFilename = filename.split('?')[0];
      const ext = cleanFilename.split('.').pop() || 'jpg';
      mimeType = `image/${ext.toLowerCase() === 'png' ? 'png' : 'jpeg'}`;
    }

    if (Platform.OS === 'web') {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      formData.append('image', blob, cleanFilename);
    } else {
      // Native React Native format
      formData.append('image', {
        uri: imageUri,
        name: cleanFilename,
        type: mimeType,
      } as any);
    }

    const headers: Record<string, string> = {};
    if (!this.authToken) {
      try { this.authToken = await authStorage.getItem('vp_crm_token'); } catch (e) { }
    }
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

    this.activeRequests++;
    DeviceEventEmitter.emit('global_loader', { isLoading: true });

    try {
      const res = await fetch(`${API_BASE}/products/${id}/image`, {
        method: 'POST',
        body: formData,
        headers
      });
      if (!res.ok) {
        let errMsg = 'API Error';
        try {
          const errData = await res.json();
          errMsg = errData.error || errData.message || res.statusText;
            if (res.status === 429) errMsg = 'Too many requests. Please wait a moment and try again.';
        } catch { errMsg = res.statusText; }
        throw new Error(errMsg);
      }
      return await res.json();
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      DeviceEventEmitter.emit('global_loader', { isLoading: this.activeRequests > 0 });
    }
  }

  async appendProductImage(id: string, imageUri: string): Promise<Product> {
    const formData = new FormData();
    let cleanFilename = 'image.jpg';
    let mimeType = 'image/jpeg';

    if (imageUri.startsWith('data:')) {
      const match = imageUri.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
      if (match) {
        mimeType = match[1];
        const ext = mimeType.split('/')[1] || 'jpg';
        cleanFilename = `image.${ext}`;
      }
    } else {
      const filename = imageUri.split('/').pop() || 'image.jpg';
      cleanFilename = filename.split('?')[0];
      const ext = cleanFilename.split('.').pop() || 'jpg';
      mimeType = `image/${ext.toLowerCase() === 'png' ? 'png' : 'jpeg'}`;
    }

    if (Platform.OS === 'web') {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      formData.append('image', blob, cleanFilename);
    } else {
      // Native React Native format
      formData.append('image', {
        uri: imageUri,
        name: cleanFilename,
        type: mimeType,
      } as any);
    }

    const headers: Record<string, string> = {};
    if (!this.authToken) {
      try { this.authToken = await authStorage.getItem('vp_crm_token'); } catch (e) { }
    }
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

    this.activeRequests++;
    DeviceEventEmitter.emit('global_loader', { isLoading: true });

    try {
      const res = await fetch(`${API_BASE}/products/${id}/image/append`, {
        method: 'POST',
        body: formData,
        headers
      });
      if (!res.ok) {
        let errMsg = 'API Error';
        try {
          const errData = await res.json();
          errMsg = errData.error || errData.message || res.statusText;
            if (res.status === 429) errMsg = 'Too many requests. Please wait a moment and try again.';
        } catch { errMsg = res.statusText; }
        throw new Error(errMsg);
      }
      return await res.json();
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      DeviceEventEmitter.emit('global_loader', { isLoading: this.activeRequests > 0 });
    }
  }

  async deleteProductImage(id: string, imageUrl: string): Promise<Product> {
    const res = await this.request(`${API_BASE}/products/${id}/image/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ imageUrl })
    });
    return res.json();
  }


  // --- Challans ---
  async getChallans(search = "", modeFilter = "all", customerId?: string): Promise<Challan[]> {
    const params = new URLSearchParams({ search, mode: modeFilter, page: '1', limit: '200' });
    if (customerId) params.set('customerId', customerId);
    const res = await this.request(`${API_BASE}/challans?${params.toString()}`);
    const body = await res.json();
    return Array.isArray(body) ? body : (body.data || []);
  }
  async getChallan(id: string): Promise<Challan | null> {
    const res = await this.request(`${API_BASE}/challans/${id}`);
    return res.json();
  }
  async createChallan(data: Partial<Challan>): Promise<Challan> {
    const res = await this.request(`${API_BASE}/challans`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateChallan(id: string, data: Partial<Challan>): Promise<Challan> {
    const res = await this.request(`${API_BASE}/challans/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async finalizeChallan(id: string): Promise<Challan> {
    const res = await this.request(`${API_BASE}/challans/${id}/finalize`, { method: 'PATCH', headers: { 'Idempotency-Key': `challan-finalize-${id}` } });
    return res.json();
  }
  async reverseChallan(id: string): Promise<Challan> {
    const res = await this.request(`${API_BASE}/challans/${id}/reverse`, { method: 'POST', headers: { 'Idempotency-Key': `challan-reverse-${id}` } });
    return res.json();
  }
  async convertChallanToInvoice(id: string, idempotencyKey?: string): Promise<{ message: string; invoice: Invoice; challan: Challan }> {
    const res = await this.request(`${API_BASE}/challans/${id}/convert`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey || createMutationKey(`challan-convert-${id}`) },
    });
    return res.json();
  }
  async deleteChallan(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/challans/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Inventories (Consolidated) ---
  async getInventories(search = ''): Promise<ConsolidatedInventory[]> {
    const res = await this.request(`${API_BASE}/inventories?search=${encodeURIComponent(search)}`);
    return res.json();
  }
  async getConsolidatedInventory(search = ''): Promise<ConsolidatedInventory[]> {
    const res = await this.request(`${API_BASE}/inventory-entries/consolidated?search=${encodeURIComponent(search)}`);
    return res.json();
  }
  async getInventoryReconciliation(filters: { warehouseId?: string; productId?: string; limit?: number } = {}): Promise<any> {
    const params = new URLSearchParams();
    if (filters.warehouseId) params.set('warehouseId', filters.warehouseId);
    if (filters.productId) params.set('productId', filters.productId);
    if (filters.limit) params.set('limit', String(filters.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request(`${API_BASE}/inventory/reconciliation${query}`);
    return res.json();
  }
  async addStock(data: any, idempotencyKey?: string) {
    const res = await this.request(`${API_BASE}/inventory-entries`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey || createMutationKey('inventory-receipt') }, body: JSON.stringify(data) });
    return res.json();
  }
  async adjustStock(id: string, data: any, idempotencyKey?: string) {
    const res = await this.request(`${API_BASE}/inventory-entries/${id}`, { method: 'PUT', headers: { 'Idempotency-Key': idempotencyKey || createMutationKey(`inventory-adjust-${id}`) }, body: JSON.stringify(data) });
    return res.json();
  }

  // --- Invoices ---
  async getSaleInvoices(search = '', mode = 'all', page?: number, limit?: number): Promise<any> {
    let url = `${API_BASE}/invoices/sales?search=${encodeURIComponent(search)}`;
    if (mode && mode !== 'all') url += `&mode=${encodeURIComponent(mode)}`;
    if (page !== undefined) url += `&page=${page}`;
    if (limit !== undefined) url += `&limit=${limit}`;
    const res = await this.request(url);
    return res.json();
  }
  async getPurchaseInvoices(search = '', mode = 'all', page?: number, limit?: number): Promise<any> {
    let url = `${API_BASE}/invoices/purchases?search=${encodeURIComponent(search)}`;
    if (mode && mode !== 'all') url += `&mode=${encodeURIComponent(mode)}`;
    if (page !== undefined) url += `&page=${page}`;
    if (limit !== undefined) url += `&limit=${limit}`;
    const res = await this.request(url);
    return res.json();
  }

  // No generic getInvoice as backend doesn't support it

  async createSaleInvoice(data: Partial<Invoice>): Promise<Invoice> {
    const res = await this.request(`${API_BASE}/invoices/sales`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async createPurchaseInvoice(data: Partial<Invoice>): Promise<Invoice> {
    const res = await this.request(`${API_BASE}/invoices/purchases`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }

  async updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice> {
    const res = await this.request(`${API_BASE}/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async updateSaleInvoice(id: string, data: Partial<Invoice>): Promise<Invoice> { return this.updateInvoice(id, data); }
  async updatePurchaseInvoice(id: string, data: Partial<Invoice>): Promise<Invoice> { return this.updateInvoice(id, data); }

  async finalizeSaleInvoice(id: string): Promise<Invoice> {
    const res = await this.request(`${API_BASE}/invoices/sales/${id}/finalize`, { method: 'PATCH' });
    return res.json();
  }
  async finalizePurchaseInvoice(id: string): Promise<Invoice> {
    const res = await this.request(`${API_BASE}/invoices/purchases/${id}/finalize`, { method: 'PATCH' });
    return res.json();
  }

  async deleteSaleInvoice(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/invoices/sales/${id}`, { method: 'DELETE' });
    return res.ok;
  }
  async deletePurchaseInvoice(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/invoices/purchases/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Quotations ---
  async getQuotations(search = "", filter = "all"): Promise<Quotation[]> {
    const res = await this.request(`${API_BASE}/quotations?search=${encodeURIComponent(search)}&filter=${encodeURIComponent(filter)}`);
    return res.json();
  }
  async getQuotation(id: string): Promise<Quotation | null> {
    const res = await this.request(`${API_BASE}/quotations/${id}`);
    return res.json();
  }
  async createQuotation(data: Partial<Quotation>): Promise<Quotation> {
    const res = await this.request(`${API_BASE}/quotations`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateQuotation(id: string, data?: Partial<Quotation>): Promise<Quotation> {
    if (!data) return this.request(`${API_BASE}/quotations/${id}/finalize`, { method: 'PATCH' }).then(r => r.json());
    const res = await this.request(`${API_BASE}/quotations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteQuotation(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/quotations/${id}`, { method: 'DELETE' });
    return res.ok;
  }
  async convertQuotationToChallan(id: string): Promise<any> {
    const res = await this.request(`${API_BASE}/quotations/${id}/convert-to-challan`, { method: 'POST' });
    return res.json();
  }

  // --- Credit / Debit Notes ---
  async getCreditNotes(search?: string, type?: string): Promise<CreditNote[]> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (type && type !== 'all') params.set('type', type);
    const res = await this.request(`${API_BASE}/credit-notes?${params}`);
    return res.json();
  }
  async createCreditNote(data: Partial<CreditNote>): Promise<CreditNote> {
    const res = await this.request(`${API_BASE}/credit-notes`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async finalizeCreditNote(id: string): Promise<CreditNote> {
    const res = await this.request(`${API_BASE}/credit-notes/${id}/finalize`, { method: 'PATCH' });
    return res.json();
  }
  async cancelCreditNote(id: string): Promise<CreditNote> {
    const res = await this.request(`${API_BASE}/credit-notes/${id}/cancel`, { method: 'PATCH' });
    return res.json();
  }

  // --- GST Returns ---
  async getGstReturn(view: string, month: number, year: number): Promise<any> {
    const res = await this.request(`${API_BASE}/gst/${view}?month=${month}&year=${year}`);
    return res.json();
  }

  // --- Warehouses ---
  async getWarehouses(): Promise<Warehouse[]> {
    const res = await this.request(`${API_BASE}/warehouses`);
    return res.json();
  }
  async createWarehouse(data: Partial<Warehouse>): Promise<Warehouse> {
    const res = await this.request(`${API_BASE}/warehouses`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateWarehouse(id: string, data: Partial<Warehouse>): Promise<Warehouse> {
    const res = await this.request(`${API_BASE}/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteWarehouse(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/warehouses/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Manufacturing Units ---
  async getManufacturingUnits(): Promise<ManufacturingUnit[]> {
    const res = await this.request(`${API_BASE}/manufacturing-units`);
    return res.json();
  }
  async createManufacturingUnit(data: Partial<ManufacturingUnit>): Promise<ManufacturingUnit> {
    const res = await this.request(`${API_BASE}/manufacturing-units`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateManufacturingUnit(id: string, data: Partial<ManufacturingUnit>): Promise<ManufacturingUnit> {
    const res = await this.request(`${API_BASE}/manufacturing-units/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteManufacturingUnit(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/manufacturing-units/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Social Media Integration ---
  async getSocialAccounts(): Promise<any[]> {
    const res = await this.request(`${API_BASE}/social/accounts`);
    return res.json();
  }
  async getSocialAuthUrl(): Promise<{ url: string }> {
    const res = await this.request(`${API_BASE}/social/auth-url`);
    return res.json();
  }
  async disconnectSocialAccount(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/social/accounts/${id}`, { method: 'DELETE' });
    return res.ok;
  }
  async publishSocialPost(platforms: string[], text: string, imageUrl?: string): Promise<{ results: any[]; errors: any[] }> {
    const res = await this.request(`${API_BASE}/social/publish`, {
      method: 'POST',
      body: JSON.stringify({ platforms, text, imageUrl }),
    });
    return res.json();
  }

  // --- Inventory Entries (Direct Stock adjustments) ---
  async getInventoryEntries(warehouseId?: string, search = "", showZero = false): Promise<InventoryEntry[]> {
    let url = `${API_BASE}/inventory-entries?search=${encodeURIComponent(search)}`;
    if (warehouseId && warehouseId !== "all") url += `&warehouseId=${encodeURIComponent(warehouseId)}`;
    if (showZero) url += `&showZero=true`;
    const res = await this.request(url);
    return res.json();
  }
  async getFinishedGoodsExpiryAlerts(days = 30): Promise<{ alerts: ExpiryAlert[]; total: number; expiredCount: number; expiringSoonCount: number }> {
    const res = await this.request(`${API_BASE}/inventory-entries/expiry-alerts?days=${days}`);
    return res.json();
  }
  async createInventoryEntry(data: Partial<InventoryEntry>, idempotencyKey?: string): Promise<InventoryEntry> {
    const res = await this.request(`${API_BASE}/inventory-entries`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey || createMutationKey('inventory-entry') }, body: JSON.stringify(data) });
    return res.json();
  }
  async getStockLedger(productId: string, warehouseId?: string, packing?: number, vendorId?: string, startDate?: string, endDate?: string): Promise<StockLedger[]> {
    let url = `${API_BASE}/inventory-entries/ledger/${productId}?`;
    const params = new URLSearchParams();
    if (warehouseId) params.append('warehouseId', warehouseId);
    if (packing) params.append('packing', packing.toString());
    if (vendorId) params.append('vendorId', vendorId);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    url += params.toString();
    const res = await this.request(url);
    return res.json();
  }

  // --- Payments ---
  async getPayments(partyId?: string, mode?: string, partyType?: string, type?: string): Promise<Payment[]> {
    let url = `${API_BASE}/payments?`;
    if (partyId) url += `partyId=${encodeURIComponent(partyId)}&`;
    if (mode) url += `mode=${encodeURIComponent(mode)}&`;
    if (partyType) url += `partyType=${encodeURIComponent(partyType)}&`;
    if (type) url += `type=${encodeURIComponent(type)}`;
    const res = await this.request(url);
    return res.json();
  }
  async createPayment(data: Partial<Payment>, idempotencyKey?: string): Promise<Payment> {
    const res = await this.request(`${API_BASE}/payments`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey || createMutationKey('payment') }, body: JSON.stringify(data) });
    return res.json();
  }
  async deletePayment(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/payments/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Product Queries ---
  async getQueries(): Promise<ProductQuery[]> {
    const res = await this.request(`${API_BASE}/queries`);
    return res.json();
  }
  async updateQueryStatus(id: string, status: string): Promise<ProductQuery> {
    const res = await this.request(`${API_BASE}/queries/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    return res.json();
  }
  async convertQueryToLead(id: string): Promise<{ message: string; lead: Contact; query: ProductQuery }> {
    const res = await this.request(`${API_BASE}/queries/${id}/convert`, {
      method: 'POST'
    });
    return res.json();
  }

  // --- E-commerce Orders ---
  async getOrders(page?: number, limit?: number, customerId?: string, status?: string): Promise<any> {
    const params = new URLSearchParams();
    if (page !== undefined) params.append('page', page.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    if (customerId) params.append('customerId', customerId);
    if (status) params.append('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request(`${API_BASE}/orders${query}`);
    return res.json();
  }
  async updateOrderStatus(id: string, status: 'pending' | 'processing' | 'shipped' | 'delivered'): Promise<Order> {
    const res = await this.request(`${API_BASE}/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    return res.json();
  }
  async updateOrderDetails(id: string, data: { name?: string; email?: string; phone?: string; shippingAddress?: string; status?: string; totalAmount?: number }): Promise<Order> {
    const res = await this.request(`${API_BASE}/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    return res.json();
  }
  // --- Leads ---
  async getLeads(search = '', stage = 'all', page?: number, limit?: number): Promise<any> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (stage && stage !== 'all') params.append('stage', stage);
    if (page !== undefined) params.append('page', page.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request(`${API_BASE}/leads${query}`);
    return res.json();
  }

  // --- Raw Materials ---
  async getRawMaterials(warehouseId?: string, simple?: boolean, search?: string, page?: number, limit?: number): Promise<any> {
    const params = new URLSearchParams();
    if (warehouseId) params.set('warehouseId', warehouseId);
    if (simple) params.set('simple', 'true');
    if (search) params.set('search', search);
    if (page !== undefined) params.set('page', page.toString());
    if (limit !== undefined) params.set('limit', limit.toString());
    const qs = params.toString();
    const url = qs ? `${API_BASE}/raw-materials?${qs}` : `${API_BASE}/raw-materials`;
    const res = await this.request(url);
    return res.json();
  }
  async getRawMaterialExpiryAlerts(): Promise<RawMaterialEntry[]> {
    const res = await this.request(`${API_BASE}/raw-materials/expiry-alerts`);
    return res.json();
  }
  async createRawMaterial(data: Partial<RawMaterial>): Promise<RawMaterial> {
    const res = await this.request(`${API_BASE}/raw-materials`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateRawMaterial(id: string, data: Partial<RawMaterial>): Promise<RawMaterial> {
    const res = await this.request(`${API_BASE}/raw-materials/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteRawMaterial(id: string): Promise<{ success: boolean; message?: string }> {
    const res = await this.request(`${API_BASE}/raw-materials/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Failed to delete raw material');
    }
    return { success: true, message: data.message };
  }

  // --- Raw Material Entries ---
  async getRawMaterialEntries(): Promise<RawMaterialEntry[]> {
    const res = await this.request(`${API_BASE}/raw-materials/entries`);
    return res.json();
  }
  async inwardRawMaterial(data: { rawMaterialId: string; batchNo: string; qty: number; purchaseRate: number; vendorId?: string; vendorName?: string; expiryDate?: string }, idempotencyKey?: string): Promise<RawMaterialEntry> {
    const res = await this.request(`${API_BASE}/raw-materials/entries`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey || createMutationKey('raw-material-entry') }, body: JSON.stringify(data) });
    return res.json();
  }
  async deleteRawMaterialEntry(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/raw-materials/entries/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  async adjustRawMaterialStock(id: string, newStockLevel: number, reason: string, idempotencyKey?: string): Promise<any> {
    const res = await this.request(`${API_BASE}/raw-materials/${id}/adjust-stock`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey || createMutationKey(`raw-material-adjust-${id}`) },
      body: JSON.stringify({ newStockLevel, reason })
    });
    return res.json();
  }

  // --- Bill of Materials (BOM) ---
  async getBOMs(page?: number, limit?: number): Promise<any> {
    const params = new URLSearchParams();
    if (page !== undefined) params.append('page', page.toString());
    if (limit !== undefined) params.append('limit', limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.request(`${API_BASE}/bom${query}`);
    return res.json();
  }
  async getBOMForProduct(productId: string): Promise<BillOfMaterials | null> {
    try {
      const res = await this.request(`${API_BASE}/bom/${productId}`);
      return res.json();
    } catch {
      return null;
    }
  }
  async configureBOM(data: { productId: string; batchYieldSize: number; ingredients: { rawMaterialId: string; qtyRequired: number; itemType?: string; stageName?: string }[]; isActive?: boolean; productionNotes?: string; overheadCost?: number; stages?: any[]; defaultProductionType?: string; defaultJobWorkMode?: string; defaultPackagingMode?: string; defaultJobWorkerId?: string | null; recipeName?: string; isDefault?: boolean }): Promise<BillOfMaterials> {
    const res = await this.request(`${API_BASE}/bom`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteBOM(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/bom/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Batch Production ---
  async getBatchProductions(page?: number, limit?: number): Promise<any> {
    const params = new URLSearchParams();
    if (page !== undefined && limit !== undefined) {
      params.append('limit', limit.toString());
      params.append('skip', ((page - 1) * limit).toString());
    }
    const qs = params.toString();
    const url = qs ? `${API_BASE}/batch-productions?${qs}` : `${API_BASE}/batch-productions`;
    const res = await this.request(url);
    return res.json();
  }
  async startBatchProduction(data: { productId: string; plannedQty: number; batchNo: string; manufacturingUnitId: string; productionType?: string; jobWorkMode?: string; packagingMode?: string; jobWorkerId?: string | null; jobWorkerName?: string; jobWorkerChallanRef?: string; bomId?: string; plannedYields?: { productId: string; plannedQty: number; size?: string }[] }): Promise<BatchProduction> {
    const res = await this.request(`${API_BASE}/batch-productions`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async advanceStage(id: string, stageIndex: number, data: { status?: string; notes?: string; completedBy?: string; lossReason?: string; actualYieldQty?: number; stageIngredients?: { rawMaterialId: string; qtyNeeded: number; wastage?: number; itemType?: string; lossReason?: string }[]; yields?: { productId: string; actualYieldQty: number; packing?: number; size?: string }[] }): Promise<BatchProduction> {
    const res = await this.request(`${API_BASE}/batch-productions/${id}/stage/${stageIndex}`, { method: 'PATCH', body: JSON.stringify(data) });
    return res.json();
  }
  async completeBatchProduction(id: string, data: { actualYieldQty: number; wasteQty?: number; wasteReason?: string; qcNotes: string; qcPassedBy: string; packing?: number; yields?: { productId: string; actualYieldQty: number; packing?: number; size?: string }[]; warehouseId: string; qcStatus?: string; organoleptic?: string; moistureContent?: number | null; ashValue?: number | null; pHValue?: number | null; disintegrationTime?: number | null; heavyMetals?: string; microbialLimit?: string; labReportRef?: string; jobWorkerCertificateRef?: string; coaDocumentRef?: string; jobWorkCharges?: number }): Promise<any> {
    const res = await this.request(`${API_BASE}/batch-productions/${id}/complete`, { method: 'PATCH', body: JSON.stringify(data) });
    return res.json();
  }
  async cancelBatchProduction(id: string): Promise<BatchProduction> {
    const res = await this.request(`${API_BASE}/batch-productions/${id}/cancel`, { method: 'PATCH', headers: { 'Idempotency-Key': createMutationKey(`batch-cancel-${id}`) } });
    return res.json();
  }
  async getBatchGenealogy(id: string): Promise<BatchGenealogy> {
    const res = await this.request(`${API_BASE}/batch-productions/${id}/genealogy`);
    return res.json();
  }
  async getRawMaterialGenealogy(id: string): Promise<RawMaterialGenealogy> {
    const res = await this.request(`${API_BASE}/raw-materials/${id}/genealogy`);
    return res.json();
  }
  async searchGenealogy(query: string): Promise<{ type: 'batch' | 'material_batch'; data: any }> {
    const res = await this.request(`${API_BASE}/batch-productions/genealogy/search?q=${encodeURIComponent(query)}`);
    return res.json();
  }
  async traceBatch(batchNo: string): Promise<TraceResult> {
    const res = await this.request(`${API_BASE}/trace/${encodeURIComponent(batchNo)}`);
    return res.json();
  }
  async getRBACPermissions(): Promise<RBACPermissionsResponse> {
    const res = await this.request(`${API_BASE}/rbac/permissions`);
    return res.json();
  }
  async updateRolePermissions(role: string, permissions: string[], mfaPermissions?: string[]): Promise<RolePermissionConfig> {
    const res = await this.request(`${API_BASE}/rbac/permissions/${role}`, {
      method: 'PUT',
      body: JSON.stringify({ permissions, mfaPermissions }),
    });
    return res.json();
  }
  async createRole(data: { role: string; permissions?: string[]; label?: string; description?: string }): Promise<RolePermissionConfig> {
    const res = await this.request(`${API_BASE}/rbac/permissions`, {
      method: 'POST', body: JSON.stringify(data)
    });
    return res.json();
  }
  async deleteRole(role: string): Promise<{ message: string }> {
    const res = await this.request(`${API_BASE}/rbac/permissions/${encodeURIComponent(role)}`, { method: 'DELETE' });
    return res.json();
  }
  async resetRolePermissions(role: string): Promise<RolePermissionConfig> {
    const res = await this.request(`${API_BASE}/rbac/permissions/${role}/reset`, { method: 'POST' });
    return res.json();
  }
  async getMyPermissions(): Promise<{ role: string; permissions: string[] }> {
    const res = await this.request(`${API_BASE}/rbac/my-permissions`);
    return res.json();
  }
  async createPaymentOrder(invoiceId: string): Promise<PaymentOrderResponse> {
    const res = await this.request(`${API_BASE}/payments/gateway/create-order`, {
      method: 'POST', body: JSON.stringify({ invoiceId })
    });
    return res.json();
  }
  async verifyPayment(data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string; invoiceId: string }): Promise<PaymentVerifyResponse> {
    const res = await this.request(`${API_BASE}/payments/gateway/verify`, {
      method: 'POST', headers: { 'Idempotency-Key': `gateway-verify-${data.razorpay_payment_id}` }, body: JSON.stringify(data)
    });
    return res.json();
  }
  async getBMRReport(id: string): Promise<BMRReport> {
    const res = await this.request(`${API_BASE}/batch-productions/${id}/bmr-report`);
    return res.json();
  }
  async getQualitySpecifications(productId?: string): Promise<any[]> {
    const q = productId ? `?productId=${encodeURIComponent(productId)}` : '';
    const res = await this.request(`${API_BASE}/manufacturing/quality-specifications${q}`); return res.json();
  }
  async createQualitySpecification(data: any): Promise<any> {
    const res = await this.request(`${API_BASE}/manufacturing/quality-specifications`, { method:'POST', body:JSON.stringify(data) }); return res.json();
  }
  async approveQualitySpecification(id: string): Promise<any> {
    const res = await this.request(`${API_BASE}/manufacturing/quality-specifications/${id}/approve`, { method:'PATCH' }); return res.json();
  }
  async getManufacturingEquipment(): Promise<any[]> { const res=await this.request(`${API_BASE}/manufacturing/equipment`); return res.json(); }
  async createManufacturingEquipment(data: any): Promise<any> {
    const res = await this.request(`${API_BASE}/manufacturing/equipment`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async calibrateEquipment(id: string, data: any): Promise<any> {
    const res = await this.request(`${API_BASE}/manufacturing/equipment/${id}/calibrate`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async getManufacturingDeviations(): Promise<any[]> { const res=await this.request(`${API_BASE}/manufacturing/deviations`); return res.json(); }
  async getStabilityStudies(): Promise<any[]> { const res=await this.request(`${API_BASE}/stability-studies`); return res.json(); }
  async getRecalls(): Promise<any[]> { const res=await this.request(`${API_BASE}/recalls`); return res.json(); }
  async getVendorQualifications(): Promise<any[]> { const res=await this.request(`${API_BASE}/vendor-qualifications`); return res.json(); }

  async getBatchCoA(id: string): Promise<any> {
    const res = await this.request(`${API_BASE}/batch-productions/${id}/coa`);
    return res.json();
  }
  async getPharmacopoeia(search?: string, standard?: string, options?: { all?: boolean; page?: number; limit?: number }): Promise<any[]> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (standard && standard !== 'all') params.set('standard', standard);
    if (options?.all) params.set('all', 'true');
    if (options?.page) params.set('page', String(options.page));
    if (options?.limit) params.set('limit', String(options.limit));
    const qs = params.toString();
    const url = qs ? `${API_BASE}/pharmacopoeia?${qs}` : `${API_BASE}/pharmacopoeia`;
    const res = await this.request(url);
    return res.json();
  }
  async lookupHerbDetails(name: string): Promise<any> {
    const res = await this.request(`${API_BASE}/raw-materials/botanical-lookup?name=${encodeURIComponent(name.trim())}`);
    return res.json();
  }

  async searchPharmacopoeia(query: string): Promise<any[]> {
    if (!query || !query.trim()) return [];
    const res = await this.request(`${API_BASE}/pharmacopoeia/search?q=${encodeURIComponent(query.trim())}`);
    return res.json();
  }
  async importPharmacopoeiaToRawMaterials(data: { monographId?: string; importAll?: boolean }): Promise<any> {
    const res = await this.request(`${API_BASE}/pharmacopoeia/import-to-raw-materials`, {
      method: 'POST', body: JSON.stringify(data)
    });
    return res.json();
  }
  async getUnverifiedPharmacopoeia(): Promise<any[]> {
    const res = await this.request(`${API_BASE}/pharmacopoeia/unverified`);
    return res.json();
  }
  async verifyPharmacopoeia(id: string, data?: any): Promise<any> {
    const res = await this.request(`${API_BASE}/pharmacopoeia/${id}/verify`, {
      method: 'PUT', body: JSON.stringify(data || {})
    });
    return res.json();
  }
  async issueSampleToDoctor(data: { mrId: string; doctorId: string; productId: string; qty: number; unitCost?: number; date?: string }): Promise<any> {
    const res = await this.request(`${API_BASE}/mr-sample-stock/issue-to-doctor`, {
      method: 'POST', headers: { 'Idempotency-Key': createMutationKey('sample-doctor') }, body: JSON.stringify(data)
    });
    return res.json();
  }
  async getDoctorSampleROI(doctorId: string): Promise<{ totalSampleCost: number; totalRxRevenue: number; roiRatio: number; invoiceCount: number }> {
    const res = await this.request(`${API_BASE}/doctors/${doctorId}/sample-roi`);
    return res.json();
  }
  async getMRSampleROI(mrId: string): Promise<{ mrId: string; mrName: string; doctorCount: number; totalSampleCost: number; totalRxRevenue: number; roiRatio: number; invoiceCount: number }> {
    const res = await this.request(`${API_BASE}/medical-reps/${mrId}/sample-roi`);
    return res.json();
  }
  async getTourPlanSuggestions(mrId: string, date: string, lat?: number, lng?: number): Promise<{ mrId: string; date: string; dayOfWeek: string; suggestedCount: number; doctors: any[] }> {
    const params = new URLSearchParams({ mrId, date });
    if (lat !== undefined) params.set('lat', lat.toString());
    if (lng !== undefined) params.set('lng', lng.toString());
    const res = await this.request(`${API_BASE}/mr-tour-plans/suggest?${params}`);
    return res.json();
  }
  async getManufacturingAnalytics(): Promise<ManufacturingAnalytics> {
    const res = await this.request(`${API_BASE}/analytics/manufacturing`);
    return res.json();
  }
  async getMaterialRequirementsPlan(): Promise<MrpResponse> {
    const res = await this.request(`${API_BASE}/analytics/material-requirements-plan`);
    return res.json();
  }
  async createProductionPlansFromMRP(productIds?: string[]): Promise<{ message: string; count: number; plans: any[] }> {
    const res = await this.request(`${API_BASE}/analytics/material-requirements-plan/create-production-plans`, {
      method: 'POST',
      body: JSON.stringify({ productIds })
    });
    return res.json();
  }

  async uploadFile(fileUri: string, filename = 'document.pdf'): Promise<{ name: string, url: string }> {
    let processedUri = fileUri;

    // Client-side image compression on web
    if (Platform.OS === 'web' && fileUri.startsWith('data:image/')) {
      try {
        processedUri = await new Promise<string>((resolve) => {
          const img = new Image();
          img.src = fileUri;
          img.onload = () => {
            let width = img.width;
            let height = img.height;
            const maxWidth = 1600;
            const maxHeight = 1600;

            if (width > height) {
              if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              }
            } else {
              if (height > maxHeight) {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(fileUri);

            ctx.drawImage(img, 0, 0, width, height);
            // Downscale and compress image to 70% quality JPEG
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          };
          img.onerror = () => resolve(fileUri);
        });
      } catch (e) {
        console.warn('Failed to compress image client-side:', e);
      }
    }

    const formData = new FormData();
    let cleanFilename = filename;
    let mimeType = 'application/pdf';

    if (processedUri.startsWith('data:')) {
      const match = processedUri.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-+.]+);base64,/);
      if (match) {
        mimeType = match[1];
        const ext = mimeType.split('/')[1] || 'pdf';
        cleanFilename = filename.endsWith('.pdf') ? `document.${ext}` : filename;
      }
    } else {
      const fname = processedUri.split('/').pop() || filename;
      cleanFilename = fname.split('?')[0];
      const ext = cleanFilename.split('.').pop() || 'pdf';
      mimeType = ext.toLowerCase() === 'pdf' ? 'application/pdf' : `image/${ext.toLowerCase() === 'png' ? 'png' : 'jpeg'}`;
    }

    if (Platform.OS === 'web') {
      const response = await fetch(processedUri);
      const blob = await response.blob();
      formData.append('file', blob, cleanFilename);
    } else {
      formData.append('file', {
        uri: processedUri,
        name: cleanFilename,
        type: mimeType,
      } as any);
    }

    const headers: Record<string, string> = {};
    if (!this.authToken) {
      try { this.authToken = await authStorage.getItem('vp_crm_token'); } catch (e) { }
    }
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

    this.activeRequests++;
    DeviceEventEmitter.emit('global_loader', { isLoading: true });

    try {
      const res = await fetch(`${API_BASE}/system/upload`, {
        method: 'POST',
        body: formData,
        headers
      });
      if (!res.ok) {
        let errMsg = 'File upload failed';
        try {
          const errData = await res.json();
          errMsg = errData.error || errData.message || res.statusText;
            if (res.status === 429) errMsg = 'Too many requests. Please wait a moment and try again.';
        } catch { errMsg = res.statusText; }
        throw new Error(errMsg);
      }
      return await res.json();
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      DeviceEventEmitter.emit('global_loader', { isLoading: this.activeRequests > 0 });
    }
  }

  async addDocument(type: 'batch' | 'invoice' | 'challan', id: string, doc: { name: string, url: string }): Promise<any> {
    const route = type === 'batch' ? 'batch-productions' : type === 'invoice' ? 'invoices' : 'challans';
    const res = await this.request(`${API_BASE}/${route}/${id}/documents`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc)
    });
    return res.json();
  }

  async deleteDocument(type: 'batch' | 'invoice' | 'challan', id: string, url: string): Promise<any> {
    const route = type === 'batch' ? 'batch-productions' : type === 'invoice' ? 'invoices' : 'challans';
    const res = await this.request(`${API_BASE}/${route}/${id}/documents`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return res.json();
  }

  async getReceivableAgeing(): Promise<{ summary: { b0_30: number, b31_60: number, b61_90: number, b90_plus: number }, customers: any[] }> {
    const res = await this.request(`${API_BASE}/payments/ageing`);
    return res.json();
  }

  async allocatePayment(paymentId: string, allocations: Array<{ invoiceId: string, amount: number }>): Promise<any> {
    const res = await this.request(`${API_BASE}/payments/allocate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId, allocations })
    });
    return res.json();
  }

  async getGstFilingStatus(period: string, returnType: 'gstr1' | 'gstr3b'): Promise<any> {
    const res = await this.request(`${API_BASE}/gst/filing-status?period=${period}&returnType=${returnType}`);
    return res.json();
  }

  async recordGstFiling(payload: { period: string, returnType: 'gstr1' | 'gstr3b', arn: string, url?: string, name?: string }): Promise<any> {
    const res = await this.request(`${API_BASE}/gst/filing-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  }

  // --- Complaints & Returns ---
  async getComplaints(status = 'all', type = 'all', search = ''): Promise<Complaint[]> {
    const res = await this.request(`${API_BASE}/complaints?status=${status}&type=${type}&search=${encodeURIComponent(search)}`);
    return res.json();
  }
  async createComplaint(data: Partial<Complaint>): Promise<Complaint> {
    const res = await this.request(`${API_BASE}/complaints`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateComplaint(id: string, data: Partial<Complaint>): Promise<Complaint> {
    const res = await this.request(`${API_BASE}/complaints/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteComplaint(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/complaints/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Samples ---
  async getSamples(status = 'all', search = ''): Promise<Sample[]> {
    const res = await this.request(`${API_BASE}/samples?status=${status}&search=${encodeURIComponent(search)}`);
    return res.json();
  }
  async createSample(data: Partial<Sample>): Promise<Sample> {
    const res = await this.request(`${API_BASE}/samples`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateSample(id: string, data: Partial<Sample>): Promise<Sample> {
    const res = await this.request(`${API_BASE}/samples/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteSample(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/samples/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Stock Movements ---
  async getStockMovements(params?: { direction?: string; type?: string; status?: string; search?: string }): Promise<StockMovement[]> {
    const q = new URLSearchParams();
    if (params?.direction) q.set('direction', params.direction);
    if (params?.type) q.set('type', params.type);
    if (params?.status) q.set('status', params.status);
    if (params?.search) q.set('search', params.search);
    const res = await this.request(`${API_BASE}/stock-movements?${q.toString()}`);
    return res.json();
  }
  async getStockMovement(id: string): Promise<StockMovement> {
    const res = await this.request(`${API_BASE}/stock-movements/${id}`);
    return res.json();
  }
  // --- Sales Targets & Commission ---
  async getSalesTargets(month?: number, year?: number): Promise<SalesTarget[]> {
    let url = `${API_BASE}/sales-targets?`;
    if (month) url += `month=${month}&`;
    if (year) url += `year=${year}`;
    const res = await this.request(url);
    return res.json();
  }
  async setSalesTarget(data: Partial<SalesTarget>): Promise<SalesTarget> {
    const res = await this.request(`${API_BASE}/sales-targets`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteSalesTarget(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/sales-targets/${id}`, { method: 'DELETE' });
    return res.ok;
  }
  async getCommissionReport(month?: number, year?: number, commissionRate = 5): Promise<CommissionReport> {
    let url = `${API_BASE}/sales-targets/commission?commissionRate=${commissionRate}`;
    if (month) url += `&month=${month}`;
    if (year) url += `&year=${year}`;
    const res = await this.request(url);
    return res.json();
  }

  // --- Dispatches ---
  async getDispatches(status = 'all', search = ''): Promise<Dispatch[]> {
    const res = await this.request(`${API_BASE}/dispatches?status=${status}&search=${encodeURIComponent(search)}`);
    return res.json();
  }
  async createDispatch(data: Partial<Dispatch>, idempotencyKey?: string): Promise<Dispatch> {
    const res = await this.request(`${API_BASE}/dispatches`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey || createMutationKey('dispatch') }, body: JSON.stringify(data) });
    return res.json();
  }
  async updateDispatch(id: string, data: Partial<Dispatch>): Promise<Dispatch> {
    const res = await this.request(`${API_BASE}/dispatches/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteDispatch(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/dispatches/${id}`, { method: 'DELETE' });
    return res.ok;
  }
  async getDeadStock(): Promise<DeadStockItem[]> {
    const res = await this.request(`${API_BASE}/dispatches/dead-stock`);
    return res.json();
  }

  // ─── Doctor API Methods ───
  async getDoctors(search?: string, category?: string, assignedMrId?: string, page?: number, limit?: number): Promise<any> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category) params.set('category', category);
    if (assignedMrId) params.set('assignedMrId', assignedMrId);
    if (page !== undefined && page > 0) params.set('page', page.toString());
    if (limit !== undefined) params.set('limit', limit.toString());
    const res = await this.request(`${API_BASE}/doctors?${params}`);
    return res.json();
  }
  async getDoctor(id: string): Promise<Doctor> {
    const res = await this.request(`${API_BASE}/doctors/${id}`);
    return res.json();
  }
  async createDoctor(data: Partial<Doctor>): Promise<Doctor> {
    const res = await this.request(`${API_BASE}/doctors`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateDoctor(id: string, data: Partial<Doctor>): Promise<Doctor> {
    const res = await this.request(`${API_BASE}/doctors/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteDoctor(id: string): Promise<void> {
    await this.request(`${API_BASE}/doctors/${id}`, { method: 'DELETE' });
  }
  async getDoctorEvents(): Promise<any[]> {
    const res = await this.request(`${API_BASE}/doctors/events`);
    return res.json();
  }
  async getDoctorMatrix(mrId?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (mrId) params.set('mrId', mrId);
    const res = await this.request(`${API_BASE}/doctors/matrix?${params}`);
    return res.json();
  }
  async getDoctorRxAnalytics(id: string): Promise<any> {
    const res = await this.request(`${API_BASE}/doctors/${id}/rx-analytics`);
    return res.json();
  }

  async getMrSampleStock(mrId: string): Promise<MrSampleStock[]> {
    const res = await this.request(`${API_BASE}/medical-reps/${mrId}/sample-stock`);
    return res.json();
  }
  async issueMrSampleStock(mrId: string, items: { productId: string; qty: number }[]): Promise<any> {
    const res = await this.request(`${API_BASE}/medical-reps/${mrId}/sample-stock/issue`, {
      method: 'POST',
      headers: { 'Idempotency-Key': createMutationKey(`sample-mr-${mrId}`) },
      body: JSON.stringify({ items })
    });
    return res.json();
  }

  // ─── Manufacturing Advanced API Methods ───
  async submitLabelReconciliation(batchId: string, items: any[]): Promise<any> {
    const res = await this.request(`${API_BASE}/batch-productions/${batchId}/label-reconciliation`, {
      method: 'POST',
      body: JSON.stringify({ items })
    });
    return res.json();
  }
  async getLabelReconciliationReport(batchId: string): Promise<any> {
    const res = await this.request(`${API_BASE}/batch-productions/${batchId}/label-reconciliation-report`);
    return res.json();
  }
  async getJobWorkSummary(): Promise<any> {
    const res = await this.request(`${API_BASE}/batch-productions/job-work-summary`);
    return res.json();
  }
  async dispatchJobWork(batchId: string, payload: any): Promise<any> {
    const res = await this.request(`${API_BASE}/batch-productions/${batchId}/job-work/dispatch`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return res.json();
  }
  async receiveJobWork(batchId: string, payload: any): Promise<any> {
    const res = await this.request(`${API_BASE}/batch-productions/${batchId}/job-work/receive`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return res.json();
  }
  async submitBmrDualEsign(batchId: string, stageIndex: number, payload: any): Promise<any> {
    const res = await this.request(`${API_BASE}/batch-productions/${batchId}/stages/${stageIndex}/dual-esign`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return res.json();
  }
  async getBatchComplaintClusters(): Promise<any> {
    const res = await this.request(`${API_BASE}/complaints/batch-clusters`);
    return res.json();
  }
  async getMrSalesPerformance(mrId: string): Promise<any> {
    const res = await this.request(`${API_BASE}/medical-reps/${mrId}/sales-performance`);
    return res.json();
  }
  async getTradeDiscountMatrix(): Promise<Record<string, number>> {
    const res = await this.request(`${API_BASE}/customer-pricing/trade-matrix`);
    return res.json();
  }
  async updateTradeDiscountMatrix(matrix: Record<string, number>): Promise<any> {
    const res = await this.request(`${API_BASE}/customer-pricing/trade-matrix`, {
      method: 'POST',
      body: JSON.stringify(matrix)
    });
    return res.json();
  }

  // ─── MR API Methods ───
  async getMRs(search?: string, active?: string): Promise<MedicalRepresentative[]> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (active !== undefined) params.set('active', active);
    const res = await this.request(`${API_BASE}/medical-reps?${params}`);
    return res.json();
  }
  async createMR(data: Partial<MedicalRepresentative>): Promise<MedicalRepresentative> {
    const res = await this.request(`${API_BASE}/medical-reps`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async getMR(id: string): Promise<MedicalRepresentative> {
    const res = await this.request(`${API_BASE}/medical-reps/${id}`);
    return res.json();
  }
  async updateMR(id: string, data: Partial<MedicalRepresentative>): Promise<MedicalRepresentative> {
    const res = await this.request(`${API_BASE}/medical-reps/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteMR(id: string): Promise<void> {
    await this.request(`${API_BASE}/medical-reps/${id}`, { method: 'DELETE' });
  }
  async getMrAssignments(mrId: string, entityType?: string, active: string = 'true'): Promise<MrAssignment[]> {
    const params = new URLSearchParams();
    if (entityType) params.set('entityType', entityType);
    params.set('active', active);
    const res = await this.request(`${API_BASE}/medical-reps/${mrId}/assignments?${params}`);
    return res.json();
  }
  async createMrAssignment(mrId: string, data: Partial<MrAssignment>): Promise<MrAssignment> {
    const res = await this.request(`${API_BASE}/medical-reps/${mrId}/assignments`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateMrAssignment(id: string, data: Partial<MrAssignment>): Promise<MrAssignment> {
    const res = await this.request(`${API_BASE}/medical-reps/assignments/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async endMrAssignment(id: string): Promise<void> {
    await this.request(`${API_BASE}/medical-reps/assignments/${id}`, { method: 'DELETE' });
  }

  async getMrAttendance(mrId: string, from?: string, to?: string): Promise<MrDailyLog[]> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await this.request(`${API_BASE}/medical-reps/${mrId}/attendance?${params}`);
    return res.json();
  }
  async mrCheckIn(mrId: string, data: { latitude?: number; longitude?: number; photo?: string; location?: string; startKmReading?: number }): Promise<MrDailyLog> {
    const res = await this.request(`${API_BASE}/medical-reps/${mrId}/checkin`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async mrCheckOut(mrId: string, data: { latitude?: number; longitude?: number; photo?: string; location?: string; endKmReading?: number }): Promise<MrDailyLog> {
    const res = await this.request(`${API_BASE}/medical-reps/${mrId}/checkout`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async getMrVisits(mrId: string, from?: string, to?: string): Promise<MrVisit[]> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await this.request(`${API_BASE}/medical-reps/${mrId}/visits?${params}`);
    return res.json();
  }
  async createMrVisit(mrId: string, data: Partial<MrVisit>): Promise<MrVisit> {
    const res = await this.request(`${API_BASE}/medical-reps/${mrId}/visits`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async updateMrVisit(visitId: string, data: Partial<MrVisit>): Promise<MrVisit> {
    const res = await this.request(`${API_BASE}/medical-reps/visits/${visitId}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteMrVisit(visitId: string): Promise<void> {
    await this.request(`${API_BASE}/medical-reps/visits/${visitId}`, { method: 'DELETE' });
  }
  async getAllMrVisits(mrId?: string, from?: string, to?: string): Promise<MrVisit[]> {
    const params = new URLSearchParams();
    if (mrId) params.set('mrId', mrId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await this.request(`${API_BASE}/medical-reps/visits/all?${params}`);
    return res.json();
  }
  async getMrExpenses(mrId: string, from?: string, to?: string, status?: string): Promise<MrExpense[]> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status) params.set('status', status);
    const res = await this.request(`${API_BASE}/medical-reps/${mrId}/expenses?${params}`);
    return res.json();
  }
  async createMrExpense(mrId: string, data: Partial<MrExpense>): Promise<MrExpense> {
    const res = await this.request(`${API_BASE}/medical-reps/${mrId}/expenses`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async approveMrExpense(expenseId: string, status: 'approved' | 'rejected', rejectionReason?: string): Promise<MrExpense> {
    const res = await this.request(`${API_BASE}/medical-reps/expenses/${expenseId}/approve`, { method: 'PUT', body: JSON.stringify({ status, rejectionReason }) });
    return res.json();
  }
  async deleteMrExpense(expenseId: string): Promise<void> {
    await this.request(`${API_BASE}/medical-reps/expenses/${expenseId}`, { method: 'DELETE' });
  }
  async getAllMrExpenses(from?: string, to?: string, status?: string): Promise<MrExpense[]> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (status) params.set('status', status);
    const res = await this.request(`${API_BASE}/medical-reps/expenses/all?${params}`);
    return res.json();
  }
  async getMrDashboard(from?: string, to?: string, mrId?: string): Promise<MrDashboardSummary> {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (mrId) params.set('mrId', mrId);
    const res = await this.request(`${API_BASE}/medical-reps/dashboard/summary?${params}`);
    return res.json();
  }

  // ─── Campaigns ───
  async getCampaigns(search?: string, status?: string, platform?: string): Promise<Campaign[]> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    if (platform) params.set('platform', platform);
    const res = await this.request(`${API_BASE}/campaigns?${params}`);
    return res.json();
  }
  async getCampaign(id: string): Promise<Campaign> {
    const res = await this.request(`${API_BASE}/campaigns/${id}`);
    return res.json();
  }
  async createCampaign(data: Partial<Campaign>): Promise<Campaign> {
    const res = await this.request(`${API_BASE}/campaigns`, {
      method: 'POST', body: JSON.stringify(data)
    });
    return res.json();
  }
  async updateCampaign(id: string, data: Partial<Campaign>): Promise<Campaign> {
    const res = await this.request(`${API_BASE}/campaigns/${id}`, {
      method: 'PUT', body: JSON.stringify(data)
    });
    return res.json();
  }
  async launchCampaign(id: string): Promise<Campaign> {
    const res = await this.request(`${API_BASE}/campaigns/${id}/launch`, { method: 'POST' });
    return res.json();
  }
  async pauseCampaign(id: string): Promise<Campaign> {
    const res = await this.request(`${API_BASE}/campaigns/${id}/pause`, { method: 'POST' });
    return res.json();
  }
  async completeCampaign(id: string): Promise<Campaign> {
    const res = await this.request(`${API_BASE}/campaigns/${id}/complete`, { method: 'POST' });
    return res.json();
  }
  async deleteCampaign(id: string): Promise<void> {
    await this.request(`${API_BASE}/campaigns/${id}`, { method: 'DELETE' });
  }

  // ─── Stock Transfers ───
  async getStockTransfers(): Promise<StockTransfer[]> {
    const res = await this.request(`${API_BASE}/inventory/transfers`);
    return res.json();
  }
  async createStockTransfer(data: Partial<StockTransfer>): Promise<StockTransfer> {
    const res = await this.request(`${API_BASE}/inventory/transfers`, {
      method: 'POST', body: JSON.stringify(data)
    });
    return res.json();
  }
  async shipStockTransfer(id: string): Promise<StockTransfer> {
    const res = await this.request(`${API_BASE}/inventory/transfers/${id}/ship`, { method: 'PATCH', headers: { 'Idempotency-Key': `stock-transfer-ship-${id}` } });
    return res.json();
  }
  async receiveStockTransfer(id: string): Promise<StockTransfer> {
    const res = await this.request(`${API_BASE}/inventory/transfers/${id}/receive`, { method: 'PATCH', headers: { 'Idempotency-Key': `stock-transfer-receive-${id}` } });
    return res.json();
  }
  async cancelStockTransfer(id: string): Promise<StockTransfer> {
    const res = await this.request(`${API_BASE}/inventory/transfers/${id}/cancel`, { method: 'PATCH', headers: { 'Idempotency-Key': `stock-transfer-cancel-${id}` } });
    return res.json();
  }
}

export interface StockTransfer {
  _id?: string;
  transferNo: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  items: {
    productId: string;
    productName: string;
    qtyBoxes: number;
    packing: number;
    batchNo: string;
  }[];
  status: 'pending' | 'in_transit' | 'completed' | 'cancelled';
  notes?: string;
  createdBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  challanId?: string;
  challanNo?: string;
  shippedAt?: string;
  receivedAt?: string;
  cancelledAt?: string;
  createdAt?: string;
}

export * from './api/types';

export const api = new ApiClient();
