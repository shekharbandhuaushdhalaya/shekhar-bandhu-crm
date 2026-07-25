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
  regularBalance: number;
  cashBalance: number;
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
  recordTracking?: 'invoice_ledger' | 'cash_ledger';
  discountPercent?: number;
};

export type Vendor = {
  _id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  productCategory: string;
  regularBalance: number;
  cashBalance: number;
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
  mrp?: number;
  discount?: number;
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
  qty: number;
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
  mode: 'regular';
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
  mode: 'regular' | 'cash';
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

export type ManufacturingUnit = {
  _id: string;
  name: string;
  code: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
  contactPerson: string;
  phone: string;
  isActive: boolean;
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
  manufacturingUnitId?: string;
  manufacturingUnitName?: string;
};

export type ConsolidatedInventory = {
  _id: string;
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
  manufacturingUnitId?: string;
  manufacturingUnitName?: string;
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
  manufacturingUnitId?: string;
  manufacturingUnitName?: string;
};

export type InvoiceItem = {
  productId?: string;
  rawMaterialId?: string;
  name: string;
  qty: number;
  boxes: number;
  packing: number;
  unit?: string;
  mrp?: number;
  discountPercent?: number;
  discountAmount?: number;
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
  mode: 'regular' | 'cash';
  baseAmount?: number;
  totalMrp?: number;
  totalDiscount?: number;
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
  supportingDocuments?: any[];
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
  category?: string;
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
  warehouseId?: string;
  warehouseName?: string;
};

export type BOMIngredient = {
  rawMaterialId: string | { _id: string; name: string; sku: string; unit: string };
  qtyRequired: number;
  itemType?: 'formulation' | 'packaging';
};

export type BillOfMaterials = {
  _id: string;
  productId: string | { _id: string; name: string; sku: string; size?: string };
  batchYieldSize: number;
  ingredients: BOMIngredient[];
  isActive?: boolean;
  productionNotes?: string;
  overheadCost?: number;
  stages?: any[];
  defaultProductionType?: string;
  defaultJobWorkMode?: string;
  defaultPackagingMode?: string;
  defaultJobWorkerId?: string | null;
};

export type ManufacturingStage = {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';
  startedAt?: string;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
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
  stages: ManufacturingStage[];
  wasteQty: number;
  wasteReason: string;
  variancePercent: number;
  ingredientsConsumed: BatchProductionIngredient[];
  manufacturingUnitId?: string;
  manufacturingUnitName?: string;
  startDate?: string;
  endDate?: string;
  qcNotes?: string;
  qcPassedBy?: string;
  rawMaterialCost?: number;
  unitProductionCost?: number;
  createdAt: string;
  productionType?: string;
  overheadCost?: number;
  qcParameters?: {
    organoleptic?: string;
    moistureContent?: number;
    ashValue?: number;
    pHValue?: number;
    disintegrationTime?: number;
    heavyMetals?: string;
    microbialLimit?: string;
    labReportRef?: string;
  };
  supportingDocuments?: { name: string; url: string; uploadedAt?: string }[];
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

export type StockMovementItem = {
  productId?: string;
  productName: string;
  qty: number;
  packing?: number;
  rate?: number;
  discountPercent?: number;
  gstRate?: number;
  batchNo?: string;
  mrp?: number;
  hsnCode?: string;
};

export type StockMovement = {
  _id: string;
  docNo: string;
  direction: 'in' | 'out';
  type: 'sale' | 'sample' | 'order' | 'return' | 'purchase' | 'transfer_out' | 'transfer_in' | 'damage';
  billingMode?: 'cash' | 'regular';
  date: string;
  warehouseId?: string;
  warehouseName?: string;
  partyType?: 'customer' | 'mr' | 'vendor' | '';
  partyId?: string;
  partyName?: string;
  partyGstin?: string;
  partyAddress?: string;
  items: StockMovementItem[];
  baseAmount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  roundOff?: number;
  totalAmount: number;
  isFree?: boolean;
  status: 'draft' | 'dispatched' | 'received' | 'cancelled';
  convertedToInvoice?: boolean;
  invoiceId?: string;
  invoiceNo?: string;
  sourceDocType?: string;
  sourceDocId?: string;
  notes?: string;
  medicalRepName?: string;
  doctorName?: string;
  transporter?: string;
  courierName?: string;
  lrNo?: string;
  vehicleNo?: string;
  trackingId?: string;
  totalBoxes?: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
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
  qtyBoxes: number;
  stockValue: number;
  lastMovementDate: string;
  daysSinceMovement: number;
};

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
  wasteQty: number;
  wasteReason: string;
  variancePercent: number;
  status: string;
  startDate: string;
  endDate?: string;
  qcNotes: string;
  qcPassedBy: string;
  rawMaterialCost: number;
  unitProductionCost: number;
  stages: ManufacturingStage[];
  ingredients: BMRReportIngredient[];
};

export type BatchGenealogyIngredient = {
  rawMaterialId: { _id: string; name: string; sku: string; unit: string } | string;
  rawMaterialEntryId: string;
  qtyConsumed: number;
  batchNo: string;
  sourceBatch: {
    vendorName: string;
    purchaseRate: number;
    originalQty: number;
    expiryDate?: string;
  } | null;
};

export type BatchGenealogy = {
  batchNo: string;
  productName: string;
  productSku: string;
  status: string;
  startDate?: string;
  endDate?: string;
  plannedQty: number;
  actualYieldQty: number;
  wasteQty: number;
  wasteReason: string;
  variancePercent: number;
  ingredients: BatchGenealogyIngredient[];
};

export type RawMaterialGenealogyBatch = {
  batchProductionId: string;
  batchNo: string;
  productName: string;
  productSku: string;
  status: string;
  totalConsumed: number;
  unit: string;
  startDate?: string;
  endDate?: string;
  plannedQty: number;
  actualYieldQty: number;
  wasteQty: number;
  variancePercent: number;
};

export type RawMaterialGenealogy = {
  rawMaterial: { _id: string; name: string; sku: string; unit: string };
  totalBatchesUsedIn: number;
  batches: RawMaterialGenealogyBatch[];
};

export type TraceRawMaterialEntry = {
  _id: string; materialName: string; materialSku: string; unit: string;
  qty: number; purchaseRate: number; vendorName: string; expiryDate?: string; createdAt: string;
};
export type TraceProductionBatch = {
  relation: string; batchProductionId: string; batchNo: string;
  productName: string; productSku: string; status: string;
  plannedQty: number; actualYieldQty: number; qtyConsumed?: number;
  wasteQty?: number; wasteReason?: string; variancePercent?: number;
  rawMaterialCost?: number; unitProductionCost?: number;
  startDate?: string; endDate?: string; stages?: ManufacturingStage[];
};
export type TraceFinishedGood = {
  _id: string; productName: string; productSku: string;
  warehouseName: string; qtyBoxes: number; packing: number;
  vendorName: string; mfgDate?: string; expiryDate?: string;
};
export type TraceChallan = {
  _id: string; challanNo: string; partyName: string;
  status: string; date: string;
  items: { name: string; qty: number; packing: number }[];
};
export type TraceInvoice = {
  _id: string; invoiceNo: string; customerName: string;
  status: string; type: string; date: string; amount: number;
  paymentTransactionId: string;
  items: { name: string; qty: number; packing: number }[];
};
export type TraceDispatch = {
  _id: string; dispatchNo: string; customerName: string;
  status: string; dispatchDate: string; transporter: string;
  lrNo: string; trackingId: string;
  items: { name: string; qty: number; packing: number }[];
};
export type TraceResult = {
  batchNo: string;
  rawMaterialEntries: TraceRawMaterialEntry[];
  productionBatches: TraceProductionBatch[];
  finishedGoodsEntries: TraceFinishedGood[];
  challans: TraceChallan[];
  invoices: TraceInvoice[];
  dispatches: TraceDispatch[];
  materialSku?: string;
  materialName?: string;
};

export type RolePermissionConfig = {
  _id: string; role: string; permissions: string[]; label: string; description: string;
};
export type RBACPermissionsResponse = {
  allPermissions: string[];
  grouped: Record<string, string[]>;
  roles: RolePermissionConfig[];
};

export type PaymentOrderResponse = {
  orderId: string; amount: number; currency: string;
  receipt: string; keyId: string; invoiceNo: string;
  customerName: string; customerEmail: string; customerPhone: string;
};
export type PaymentVerifyResponse = {
  success: boolean; message: string;
  invoice: { _id: string; invoiceNo: string; status: string; paymentTransactionId: string };
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

export type MedicalRepresentative = {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  code?: string;
  photo?: string;
  territory?: string;
  reportingTo?: { _id: string; name: string; email: string } | null;
  dateOfJoining?: string;
  isActive: boolean;
  monthlyTarget: number;
  address?: string;
  alternatePhone?: string;
  notes?: string;
  createdAt: string;
};

export type MrDailyLog = {
  _id: string;
  mrId: string;
  date: string;
  checkIn: { time?: string; latitude?: number; longitude?: number; photo?: string; location?: string };
  checkOut: { time?: string; latitude?: number; longitude?: number; photo?: string; location?: string };
  startKmReading?: number;
  endKmReading?: number;
  totalDistance?: number;
  status: 'checked_in' | 'checked_out';
  notes?: string;
};

export type MrVisit = {
  _id: string;
  mrId: string | { _id: string; name: string; code?: string; phone?: string };
  dailyLogId?: string;
  date: string;
  doctorName: string;
  clinicName?: string;
  specialization?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  checkIn: { time?: string; photo?: string };
  checkOut: { time?: string; photo?: string };
  purpose: string;
  sampleDetails?: { productId?: { _id: string; name?: string }; name?: string; qty?: number }[];
  orderTaken: boolean;
  orderAmount: number;
  feedback?: string;
  doctorVerified: boolean;
  status: string;
  notes?: string;
};

export type MrExpense = {
  _id: string;
  mrId: string | { _id: string; name: string; code?: string; phone?: string };
  date: string;
  category: string;
  amount: number;
  description?: string;
  receiptUrl?: string;
  latitude?: number;
  longitude?: number;
  location?: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: { _id: string; name?: string } | null;
  approvedAt?: string;
  rejectionReason?: string;
};

export type MrDashboardSummary = {
  mrs: {
    _id: string;
    name: string;
    code?: string;
    phone: string;
    photo?: string;
    territory?: string;
    monthlyTarget: number;
    visits: number;
    orders: number;
    orderValue: number;
    expenses: number;
    daysWorked: number;
    totalDistance: number;
  }[];
  totals: { visits: number; orders: number; orderValue: number; expenses: number; distance: number };
};

export type CampaignAnalytics = {
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  revenue: number;
};

export type Campaign = {
  _id: string;
  name: string;
  platform: 'social_media' | 'email' | 'sms' | 'whatsapp' | 'google' | 'other';
  status: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';
  startDate: string | null;
  endDate: string | null;
  budget: number;
  spent: number;
  targetAudience: string;
  content: string;
  notes: string;
  analytics: CampaignAnalytics;
  createdBy: { _id: string; name: string; email: string } | null;
  launchedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
