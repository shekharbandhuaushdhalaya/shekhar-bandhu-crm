// API Client — Dual mode: Server fetch with localStorage fallback
import { Platform, DeviceEventEmitter } from 'react-native';
import { authStorage } from './storage';

import Constants from 'expo-constants';

// Dynamically determine the backend URL based on the environment
const getBaseUrl = () => {
  // Check if a hosted API URL is defined in the environment (useful for Vercel/production)
  const envApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envApiUrl) return envApiUrl;

  if (Platform.OS === 'web') return 'http://localhost:5000/api';
  
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
  
  // Hardcoded fallback for the development machine IP
  return 'http://192.168.31.189:5000/api';
};

let API_BASE = getBaseUrl();

export function getApiBaseUrl(): string {
  return API_BASE;
}

export function setApiBaseUrl(newUrl: string): void {
  API_BASE = newUrl;
}

export const getImageUrl = (imagePath: string | undefined): string => {
  if (!imagePath) return '';
  if (imagePath.startsWith('http') || imagePath.startsWith('data:')) return imagePath;
  const baseUrl = API_BASE.endsWith('/api') ? API_BASE.slice(0, -4) : API_BASE;
  const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${baseUrl}${cleanPath}`;
};

const STORAGE_KEY = 'vp_crm_database';

export type Contact = {
  _id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  stage: string;
  dealValue: number;
  productInterest?: string[];
  estimatedVolume?: string;
  city?: string;
  leadSource: string;
  createdAt: string;
  interactions: { type: string; note: string; date: string }[];
};

export type Task = {
  _id: string;
  title: string;
  desc: string;
  priority: string;
  dueDate: string;
  completed: boolean;
  contactId: string | null;
};

export type Activity = {
  _id: string;
  type: string;
  text: string;
  date: string;
};

export type DashboardStats = {
  totalPipeline: number;
  closedWon: number;
  activeLeadsCount: number;
  pendingTasksCount: number;
  totalWebSales?: number;
  activeWebOrdersCount?: number;
  completedWebOrdersCount?: number;
  webQueriesCount?: number;
};

export type Customer = {
  _id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  pakkaBalance: number;
  kachhaBalance: number;
  outstandingInvoices: number;
  salesVolume: number;
  createdAt: string;
  gstin?: string;
  state?: string;
  contactPerson?: string;
  pan?: string;
  placeOfSupply?: string;
  paymentTerms?: string;
  billingAddress?: {
    street: string;
    pin: string;
    city: string;
    state: string;
  };
  shippingAddress?: {
    street: string;
    pin: string;
    city: string;
    state: string;
  };
  shippingSameAsBilling?: boolean;
  customerType?: 'gst' | 'cash';
  recordTracking?: 'invoice_ledger';
};

export type Vendor = {
  _id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  productCategory: string;
  pakkaBalance: number;
  kachhaBalance: number;
  paymentTerms: string;
  createdAt: string;
  gstin?: string;
  state?: string;
  registeredName?: string;
  displayName?: string;
  contactPerson?: string;
  addressPin?: string;
  addressCity?: string;
  pan?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankName?: string;
  bankBranch?: string;
};

export type Product = {
  _id: string;
  name: string;
  sku: string;
  price: number;
  stockLevel: number;
  category: string;
  minReorder: number;
  hsnCode?: string;
  gstRate?: number;
  productType?: string;
  size?: string;
  colour?: string;
  shape?: string;
  weight?: string;
  vendorId?: string;
  vendorName?: string;
  image?: string;
  description?: string;
  disease?: string;
  ingredients?: string;
};

export type ChallanItem = {
  productId?: string;
  name: string;
  qty: number; // quantity in boxes
  rate?: number;
  packing?: number;
  vendorId?: string;
  vendorName?: string;
  gstRate?: number;
  hsnCode?: string;
};

export type Challan = {
  _id: string;
  challanNo: string;
  partyName: string;
  partyAddress: string;
  shippingAddress?: string;
  partyCity: string;
  stateOfSupply?: string;
  gstin?: string;
  date: string;
  warehouseId?: string;
  warehouseName?: string;
  items: ChallanItem[];
  status: string;
  mode: 'pakka';
  baseAmount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  roundOff?: number;
  freightAmount?: number;
  internalFreightExpense?: number;
  nettTotal?: number;
  convertedToInvoice?: boolean;
  invoiceId?: string;
  invoiceNo?: string;
};

export type Payment = {
  _id: string;
  type: 'receive' | 'make';
  partyType: 'Customer' | 'Vendor';
  partyId: string;
  partyName: string;
  amount: number;
  mode: 'pakka';
  paymentMethod: 'Cash' | 'Bank Transfer' | 'Cheque' | 'UPI';
  referenceNo: string;
  notes: string;
  date: string;
};

export type ProductQuery = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  productName: string;
  productId?: string;
  query: string;
  image?: string;
  status: 'pending' | 'contacted' | 'converted' | 'closed';
  createdAt: string;
  updatedAt: string;
};


export type Inventory = {
  _id: string;
  warehouse: string;
  itemSku: string;
  itemName: string;
  qty: number;
  minReorder: number;
  val: number;
};

export type Warehouse = {
  _id: string;
  name: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
  contactPerson: string;
  phone: string;
  createdAt: string;
};

export type InventoryEntry = {
  _id: string;
  warehouseId: string;
  warehouseName: string;
  productId: string;
  productType: string;
  size?: string;
  colour: string;
  shape: string;
  weight: string;
  hsnCode: string;
  vendorId?: string;
  vendorName: string;
  qtyBoxes: number;
  updatedAt: string;
  packing: number;
  batchNo?: string;
  mfgDate?: string;
  expiryDate?: string;
};

export type ConsolidatedInventory = {
  _id: string; // unique combined key, e.g. productId_vendorId_packing
  productId: string;
  vendorId: string;
  productType: string;
  size?: string;
  colour: string;
  shape: string;
  weight: string;
  hsnCode: string;
  vendorName: string;
  totalBoxes: number;
  val?: number;
  warehouses: { warehouseId: string; warehouseName: string; qtyBoxes: number }[];
  packing: number;
  batchNo?: string;
  mfgDate?: string;
  expiryDate?: string;
};

export type StockLedger = {
  _id: string;
  productId: string;
  warehouseId: string;
  warehouseName: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  qtyBoxes: number;
  balanceBoxes: number;
  reference: string;
  note: string;
  createdBy: string;
  createdAt: string;
  packing: number;
  vendorId?: string;
  vendorName?: string;
  batchNo?: string;
  mfgDate?: string;
  expiryDate?: string;
};


export type InvoiceItem = {
  productId?: string;
  name: string;
  qty: number;
  boxes: number;
  packing: number;
  rate: number;
  qtyBoxes?: number;
  hsnCode?: string;
  gstRate: number;
};

export type Invoice = {
  _id: string;
  invoiceNo: string;
  customerName?: string;
  supplierName?: string;
  partyAddress?: string;
  shippingAddress?: string;
  date: string;
  dueDate?: string;
  amount: number;
  status: string;
  mode: 'pakka';
  baseAmount?: number;
  gstRate?: number;
  hsnCode?: string;
  cgst?: number;
  sgst?: number;
  igst?: number;
  roundOff?: number;
  freightAmount?: number;
  cartageAmount?: number;
  stateOfSupply?: string;
  gstin?: string;
  warehouseId?: string;
  warehouseName?: string;
  items?: InvoiceItem[];
  subTotal?: number;
  grandTotal?: number;
  vendorName?: string;
  partyGstin?: string;
  deductInventory?: boolean;
  isFinalized?: boolean;
  transport?: string;
  vehicleNo?: string;
  ewayBillNo?: string;
  irn?: string;
  internalFreightExpense?: number;
  qrCode?: string;
};

export type QuotationItem = {
  productId?: string;
  name: string;
  qty: number;
  boxes: number;
  packing: number;
  rate: number;
  hsnCode?: string;
  gstRate: number;
};

export type Quotation = {
  _id: string;
  quotationNo: string;
  customerName?: string;
  partyAddress?: string;
  shippingAddress?: string;
  date: string;
  amount: number;
  status: string;
  baseAmount?: number;
  gstRate?: number;
  hsnCode?: string;
  cgst?: number;
  sgst?: number;
  igst?: number;
  roundOff?: number;
  freightAmount?: number;
  stateOfSupply?: string;
  gstin?: string;
  items?: QuotationItem[];
  warehouseName?: string;
  mode?: string;
  isFinalized?: boolean;
  warehouseId?: string;
};

export type MockDataType = {
  contacts: Contact[];
  tasks: Task[];
  activities: Activity[];
  customers: Customer[];
  vendors: Vendor[];
  products: Product[];
  challans: Challan[];
  inventories: Inventory[];
  saleInvoices: Invoice[];
  purchaseInvoices: Invoice[];
  quotations?: Quotation[];
  warehouses?: Warehouse[];
  inventoryEntries?: InventoryEntry[];
  stockLedgers?: StockLedger[];
  payments?: Payment[];
  queries?: ProductQuery[];
};



export type RawMaterial = {
  _id: string;
  name: string;
  sku: string;
  unit: string;
  minReorder: number;
  stockLevel?: number;
};

export type RawMaterialEntry = {
  _id: string;
  rawMaterialId: string | { _id: string; name: string; sku: string; unit: string };
  batchNo: string;
  qty: number;
  purchaseRate: number;
  vendorId?: string;
  vendorName?: string;
  expiryDate?: string;
  createdAt: string;
};

export type BOMIngredient = {
  rawMaterialId: string | { _id: string; name: string; sku: string; unit: string };
  qtyRequired: number;
};

export type BillOfMaterials = {
  _id: string;
  productId: string | { _id: string; name: string; sku: string; size?: string };
  batchYieldSize: number;
  ingredients: BOMIngredient[];
};

export type BatchProductionIngredient = {
  rawMaterialId: string | { _id: string; name: string; sku: string; unit: string };
  rawMaterialEntryId: string;
  qtyConsumed: number;
  batchNo: string;
};

export type BatchProduction = {
  _id: string;
  batchNo: string;
  productId: string | { _id: string; name: string; sku: string; size?: string; packing?: number; price?: number };
  plannedQty: number;
  actualYieldQty: number;
  status: 'draft' | 'in_progress' | 'qc_hold' | 'completed' | 'cancelled';
  ingredientsConsumed: BatchProductionIngredient[];
  startDate?: string;
  endDate?: string;
  qcNotes?: string;
  qcPassedBy?: string;
  rawMaterialCost?: number;
  unitProductionCost?: number;
  createdAt: string;
};

export type Complaint = {
  _id: string;
  complaintNo: string;
  type: 'complaint' | 'return' | 'exchange';
  customerId?: string;
  customerName: string;
  customerPhone: string;
  invoiceId?: string;
  invoiceNo: string;
  productName: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  resolution: string;
  resolvedBy: string;
  resolvedAt?: string;
  assignedTo: string;
  createdAt: string;
};

export type SampleItem = {
  productId?: string;
  productName: string;
  qty: number;
  size?: string;
  mrp: number;
};

export type Sample = {
  _id: string;
  sampleNo: string;
  givenTo: string;
  designation: string;
  phone: string;
  location: string;
  purpose: string;
  items: SampleItem[];
  totalMrpValue: number;
  givenBy: string;
  date: string;
  followUpDate?: string;
  notes: string;
  status: 'given' | 'follow_up_done' | 'converted' | 'no_response';
  createdAt: string;
};

export type SalesTarget = {
  _id: string;
  agentId: string;
  agentName: string;
  month: number;
  year: number;
  targetAmount: number;
  notes: string;
  createdAt: string;
};

export type CommissionReport = {
  commissionRate: number;
  agents: {
    agentName: string;
    totalSales: number;
    invoiceCount: number;
    commission: number;
  }[];
};

export type Dispatch = {
  _id: string;
  dispatchNo: string;
  invoiceId?: string;
  invoiceNo: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  dispatchDate: string;
  transporter: string;
  lrNo: string;
  vehicleNo: string;
  courierName: string;
  trackingId: string;
  trackingUrl: string;
  totalBoxes: number;
  totalWeight: string;
  freightCharge: number;
  status: 'pending' | 'dispatched' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'returned';
  deliveredAt?: string;
  notes: string;
  createdAt: string;
};

export type DeadStockItem = {
  productId: string;
  productName: string;
  productSku: string;
  price: number;
  size: string;
  warehouseId: string;
  warehouseName: string;
  qty: number;
  stockValue: number;
  lastMovementDate: string;
  daysSinceMovement: number;
};


class ApiClient {
  private authToken: string | null = null;
  currentUser: any = null;

  setToken(token: string | null, user: any = null) {
    this.authToken = token;
    this.currentUser = user;
  }

  async checkConnection(): Promise<boolean> {
    return true; // Always true now since we require network
  }

  private activeRequests = 0;

  private async request(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = {
      ...(options.headers || {}),
      'Content-Type': 'application/json',
    } as Record<string, string>;

    if (!this.authToken) {
      try {
        this.authToken = await authStorage.getItem('vp_crm_token');
      } catch (e) {}
    }

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const method = options.method || 'GET';
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());

    if (isMutating) {
      this.activeRequests++;
      DeviceEventEmitter.emit('global_loader', { isLoading: this.activeRequests > 0 });
    }

    try {
      const res = await fetch(url, { ...options, headers });
      if (!res.ok) {
          let errMsg = 'API Error';
          try {
              const errData = await res.json();
              errMsg = errData.error || errData.message || res.statusText;
          } catch {
              errMsg = res.statusText;
          }
          throw new Error(errMsg);
      }
      return res;
    } finally {
      if (isMutating) {
        this.activeRequests = Math.max(0, this.activeRequests - 1);
        DeviceEventEmitter.emit('global_loader', { isLoading: this.activeRequests > 0 });
      }
    }
  }

  // --- Auth ---
  async login(email: string, password: string): Promise<{ token: string; user: any }> {
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

  async getAuditLogs(search: string = '', page: number = 1, limit: number = 50): Promise<any> {
    const queryParams = new URLSearchParams({
      search,
      page: page.toString(),
      limit: limit.toString()
    });
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
  async getContacts(search = '', stage = 'all'): Promise<Contact[]> {
    const res = await this.request(`${API_BASE}/contacts?search=${search}&stage=${stage}`);
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
  async getCustomers(search = ''): Promise<Customer[]> {
    const res = await this.request(`${API_BASE}/customers?search=${search}`);
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
  async getVendors(search = ''): Promise<Vendor[]> {
    const res = await this.request(`${API_BASE}/vendors?search=${search}`);
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

  // --- Products ---
  async getProducts(search = '', vendorId = ''): Promise<Product[]> {
    const res = await this.request(`${API_BASE}/products?search=${encodeURIComponent(search)}&vendorId=${encodeURIComponent(vendorId)}`);
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
      try { this.authToken = await authStorage.getItem('vp_crm_token'); } catch (e) {}
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
        } catch { errMsg = res.statusText; }
        throw new Error(errMsg);
      }
      return await res.json();
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      DeviceEventEmitter.emit('global_loader', { isLoading: this.activeRequests > 0 });
    }
  }

  // --- Challans ---
  async getChallans(search = "", modeFilter = "all"): Promise<Challan[]> {
    const res = await this.request(`${API_BASE}/challans?search=${encodeURIComponent(search)}&mode=${encodeURIComponent(modeFilter)}`);
    return res.json();
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
    const res = await this.request(`${API_BASE}/challans/${id}/finalize`, { method: 'PATCH' });
    return res.json();
  }
  async convertChallanToInvoice(id: string): Promise<{ message: string; invoice: Invoice; challan: Challan }> {
    const res = await this.request(`${API_BASE}/challans/${id}/convert`, { method: 'POST' });
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
  async addStock(data: any) {
    const res = await this.request(`${API_BASE}/inventory-entries`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async adjustStock(id: string, data: any) {
    const res = await this.request(`${API_BASE}/inventory-entries/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }

  // --- Invoices ---
  async getSaleInvoices(search = '', mode = 'all'): Promise<Invoice[]> {
    let url = `${API_BASE}/invoices/sales?search=${encodeURIComponent(search)}`;
    if (mode && mode !== 'all') url += `&mode=${encodeURIComponent(mode)}`;
    const res = await this.request(url);
    return res.json();
  }
  async getPurchaseInvoices(search = '', mode = 'all'): Promise<Invoice[]> {
    let url = `${API_BASE}/invoices/purchases?search=${encodeURIComponent(search)}`;
    if (mode && mode !== 'all') url += `&mode=${encodeURIComponent(mode)}`;
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
    if (!data) return this.request(`${API_BASE}/quotations/${id}/status`, { method: "PUT", body: JSON.stringify({ status: "Finalized" }) }).then(r => r.json());
    const res = await this.request(`${API_BASE}/quotations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteQuotation(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/quotations/${id}`, { method: 'DELETE' });
    return res.ok;
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
    await this.request(`${API_BASE}/warehouses/${id}`, { method: 'DELETE' });
    return true;
  }

  // --- Inventory Entries (Direct Stock adjustments) ---
  async getInventoryEntries(warehouseId?: string, search = "", showZero = false): Promise<InventoryEntry[]> {
    let url = `${API_BASE}/inventory-entries?search=${encodeURIComponent(search)}`; 
    if (warehouseId && warehouseId !== "all") url += `&warehouseId=${encodeURIComponent(warehouseId)}`; 
    if (showZero) url += `&showZero=true`;
    const res = await this.request(url);
    return res.json();
  }
  async createInventoryEntry(data: Partial<InventoryEntry>): Promise<InventoryEntry> {
    const res = await this.request(`${API_BASE}/inventory-entries`, { method: 'POST', body: JSON.stringify(data) });
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
  async createPayment(data: Partial<Payment>): Promise<Payment> {
    const res = await this.request(`${API_BASE}/payments`, { method: 'POST', body: JSON.stringify(data) });
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
  async getOrders(): Promise<Order[]> {
    const res = await this.request(`${API_BASE}/orders`);
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
  async generateInvoiceFromOrder(id: string): Promise<any> {
    const res = await this.request(`${API_BASE}/orders/${id}/invoice`, {
      method: 'POST'
    });
    return res.json();
  }

  // --- Raw Materials ---
  async getRawMaterials(): Promise<RawMaterial[]> {
    const res = await this.request(`${API_BASE}/raw-materials`);
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
  async deleteRawMaterial(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/raw-materials/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Raw Material Entries ---
  async getRawMaterialEntries(): Promise<RawMaterialEntry[]> {
    const res = await this.request(`${API_BASE}/raw-materials/entries`);
    return res.json();
  }
  async inwardRawMaterial(data: { rawMaterialId: string; batchNo: string; qty: number; purchaseRate: number; vendorId?: string; vendorName?: string; expiryDate?: string }): Promise<RawMaterialEntry> {
    const res = await this.request(`${API_BASE}/raw-materials/entries`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteRawMaterialEntry(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/raw-materials/entries/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Bill of Materials (BOM) ---
  async getBOMs(): Promise<BillOfMaterials[]> {
    const res = await this.request(`${API_BASE}/bom`);
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
  async configureBOM(data: { productId: string; batchYieldSize: number; ingredients: { rawMaterialId: string; qtyRequired: number }[] }): Promise<BillOfMaterials> {
    const res = await this.request(`${API_BASE}/bom`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async deleteBOM(id: string): Promise<boolean> {
    const res = await this.request(`${API_BASE}/bom/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  // --- Batch Production ---
  async getBatchProductions(): Promise<BatchProduction[]> {
    const res = await this.request(`${API_BASE}/batch-productions`);
    return res.json();
  }
  async startBatchProduction(data: { productId: string; plannedQty: number; batchNo: string }): Promise<BatchProduction> {
    const res = await this.request(`${API_BASE}/batch-productions`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }
  async completeBatchProduction(id: string, data: { actualYieldQty: number; qcNotes: string; qcPassedBy: string }): Promise<BatchProduction> {
    const res = await this.request(`${API_BASE}/batch-productions/${id}/complete`, { method: 'PATCH', body: JSON.stringify(data) });
    return res.json();
  }
  async cancelBatchProduction(id: string): Promise<BatchProduction> {
    const res = await this.request(`${API_BASE}/batch-productions/${id}/cancel`, { method: 'PATCH' });
    return res.json();
  }
  async getBMRReport(id: string): Promise<BMRReport> {
    const res = await this.request(`${API_BASE}/batch-productions/${id}/bmr-report`);
    return res.json();
  }
  async getManufacturingAnalytics(): Promise<ManufacturingAnalytics> {
    const res = await this.request(`${API_BASE}/analytics/manufacturing`);
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
  async createDispatch(data: Partial<Dispatch>): Promise<Dispatch> {
    const res = await this.request(`${API_BASE}/dispatches`, { method: 'POST', body: JSON.stringify(data) });
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
}


export type BMRReportIngredient = {
  name: string;
  code: string;
  batchNo: string;
  qtyConsumed: number;
  unit: string;
  purchaseRate: number;
  itemCost: number;
};

export type BMRReport = {
  batchNo: string;
  productName: string;
  productSku: string;
  productPrice: number;
  plannedQty: number;
  actualYieldQty: number;
  status: string;
  startDate: string;
  endDate?: string;
  qcNotes: string;
  qcPassedBy: string;
  rawMaterialCost: number;
  unitProductionCost: number;
  ingredients: BMRReportIngredient[];
};

export type ManufacturingAnalytics = {
  netRawMaterialValue: number;
  netFinishedGoodsValue: number;
  yieldPerformance: {
    batchNo: string;
    productName: string;
    plannedQty: number;
    actualYieldQty: number;
    efficiency: number;
  }[];
  timeline: {
    id: string;
    batchNo: string;
    productName: string;
    plannedQty: number;
    actualYieldQty: number;
    status: string;
    startDate: string;
    endDate?: string;
  }[];
};

export type OrderItem = {
  productId: string;
  name: string;
  qty: number;
  price: number;
  size?: string;
};

export type Order = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  shippingAddress: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  courierName?: string;
  trackingId?: string;
  courierLink?: string;
  adminNotes?: string;
  notifications?: string[];
  createdAt: string;
  updatedAt: string;
};

export const api = new ApiClient();
