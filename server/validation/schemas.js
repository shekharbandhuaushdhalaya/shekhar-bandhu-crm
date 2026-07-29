const z = require('zod');

const objectId = z.union([
  z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId'),
  z.literal(''),
  z.null()
]).transform(val => (val === '' || val === null) ? undefined : val);

// ── Shared field types ──────────────────────────────────────
const phone = z.string().max(20).default('');
const email = z.string().email().toLowerCase().or(z.literal('')).default('');
const gstin = z.string().max(15).or(z.literal('')).default('');

// ── Product ──────────────────────────────────────────────────
const productItem = z.object({
  productId: objectId.optional(),
  name: z.string().min(1, 'Item name required'),
  qty: z.number().min(0),
  boxes: z.number().min(0).optional(),
  packing: z.number().min(1).default(1),
  rate: z.number().min(0).default(0),
  hsnCode: z.string().default(''),
  gstRate: z.number().default(0),
  batchNo: z.string().default(''),
  mrp: z.number().default(0),
  size: z.string().default(''),
  amount: z.number().optional(),
  productName: z.string().optional(),
  vendorId: z.string().default(''),
  vendorName: z.string().default(''),
  deductedBoxes: z.number().default(0),
});

const productSchema = z.object({
  name: z.string().min(1, 'Name required'),
  sku: z.string().optional(),
  price: z.number().default(0),
  mrp: z.number().default(0),
  discount: z.number().min(0).max(100).default(0),
  discountLabel: z.string().default(''),
  websitePromoActive: z.boolean().default(false),
  stockLevel: z.number().int().min(0).default(0),
  category: z.string().default('General'),
  minReorder: z.number().int().min(0).default(5),
  hsnCode: z.string().default('70109000'),
  gstRate: z.number().default(18),
  productType: z.string().default(''),
  size: z.string().default(''),
  colour: z.string().default(''),
  shape: z.string().default(''),
  weight: z.string().default(''),
  vendorId: z.string().default(''),
  vendorName: z.string().default(''),
  image: z.string().default(''),
  description: z.string().default(''),
  disease: z.string().default(''),
  ingredients: z.string().default(''),
  rating: z.number().default(0),
  ratingCount: z.number().int().default(0),
  parentId: objectId.optional().nullable(),
});

// ── Customer ─────────────────────────────────────────────────
const addressObj = z.object({
  street: z.string().default(''),
  pin: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
});

const customerSchema = z.object({
  name: z.string().min(1, 'Customer name required'),
  company: z.string().default(''),
  email,
  phone,
  regularBalance: z.number().default(0),
  cashBalance: z.number().default(0),
  outstandingInvoices: z.number().default(0),
  salesVolume: z.number().default(0),
  gstin,
  state: z.string().default('Maharashtra'),
  contactPerson: z.string().default(''),
  pan: z.string().default(''),
  placeOfSupply: z.string().default(''),
  paymentTerms: z.string().default('Net 30'),
  billingAddress: addressObj.default({}),
  shippingAddress: addressObj.default({}),
  shippingSameAsBilling: z.boolean().default(false),
  customerType: z.enum(['gst', 'cash']).default('gst'),
  recordTracking: z.enum(['invoice_ledger', 'cash_ledger']).default('invoice_ledger'),
  discountPercent: z.number().min(0).max(100).default(0),
  drugLicenseNo: z.string().optional().default(''),
  drugLicenseExpiry: z.string().or(z.date()).nullable().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

// ── Invoice ──────────────────────────────────────────────────
const invoiceItem = z.object({
  productId: objectId.optional(),
  name: z.string().min(1),
  qty: z.number().default(0),
  boxes: z.number().default(0),
  packing: z.number().default(1),
  rate: z.number().default(0),
  hsnCode: z.string().default(''),
  gstRate: z.number().default(0),
  batchNo: z.string().default(''),
  mfgDate: z.string().or(z.date()).optional().nullable(),
  expiryDate: z.string().or(z.date()).optional().nullable(),
  amount: z.number().optional(),
  size: z.string().optional(),
  mrp: z.number().default(0),
  discountPercent: z.number().default(0),
  discountAmount: z.number().default(0),
});

const invoiceSchema = z.object({
  type: z.enum(['sale', 'purchase']),
  purchaseType: z.enum(['finished_goods', 'raw_materials']).default('finished_goods'),
  invoiceNo: z.string().optional(),
  customerName: z.string().default(''),
  supplierName: z.string().default(''),
  partyAddress: z.string().default(''),
  shippingAddress: z.string().default(''),
  date: z.string().or(z.date()).optional(),
  amount: z.number().default(0),
  dueDate: z.string().or(z.date()).optional(),
  status: z.string().default('unpaid'),
  mode: z.enum(['regular', 'cash', 'pakka', 'non_gst']).default('regular'),
  baseAmount: z.number().optional(),
  totalMrp: z.number().optional(),
  totalDiscount: z.number().optional(),
  gstRate: z.number().optional(),
  cgst: z.number().optional(),
  sgst: z.number().optional(),
  igst: z.number().optional(),
  roundOff: z.number().default(0),
  freightAmount: z.number().default(0),
  internalFreightExpense: z.number().default(0),
  stateOfSupply: z.string().default(''),
  gstin: z.string().default(''),
  ewayBillNo: z.string().default(''),
  vehicleNo: z.string().default(''),
  transport: z.string().default(''),
  irn: z.string().default(''),
  warehouseId: objectId.optional(),
  warehouseName: z.string().default(''),
  deductInventory: z.boolean().default(false),
  isFinalized: z.boolean().default(false),
  agentId: objectId.optional(),
  agentName: z.string().default(''),
  items: z.array(invoiceItem).default([]),
  paymentTransactionId: z.string().default(''),
  paymentGatewayData: z.any().optional(),
  cartageAmount: z.number().default(0),
  subTotal: z.number().default(0),
  grandTotal: z.number().default(0),
  partyGstin: z.string().default(''),
  qrCode: z.string().default(''),
  reference: objectId.optional(),
}).passthrough();

// ── Quote ────────────────────────────────────────────────────
const quotationItem = z.object({
  productId: objectId.optional(),
  name: z.string().min(1),
  qty: z.number().default(0),
  boxes: z.number().default(0),
  packing: z.number().default(1),
  rate: z.number().default(0),
  hsnCode: z.string().default(''),
  gstRate: z.number().default(0),
  mrp: z.number().default(0),
  discountPercent: z.number().default(0),
  discountAmount: z.number().default(0),
  batchNo: z.string().default(''),
  expiryDate: z.string().or(z.date()).optional(),
});

const quotationSchema = z.object({
  quotationNo: z.string().optional(),
  customerName: z.string().default(''),
  partyAddress: z.string().default(''),
  shippingAddress: z.string().default(''),
  date: z.string().or(z.date()).optional(),
  amount: z.number().default(0),
  status: z.enum(['draft', 'sent', 'approved', 'rejected']).default('draft'),
  mode: z.enum(['regular', 'pakka', 'cash']).default('pakka'),
  baseAmount: z.number().optional(),
  gstRate: z.number().optional(),
  cgst: z.number().optional(),
  sgst: z.number().optional(),
  igst: z.number().optional(),
  roundOff: z.number().default(0),
  freightAmount: z.number().default(0),
  stateOfSupply: z.string().default(''),
  gstin: z.string().default(''),
  items: z.array(quotationItem).default([]),
  warehouseId: objectId.optional(),
  warehouseName: z.string().default(''),
  isFinalized: z.boolean().default(false),
});

// ── StockMovement ────────────────────────────────────────────
const smItem = z.object({
  productId: objectId.optional(),
  productName: z.string().min(1),
  qty: z.number(),
  packing: z.number().default(1),
  rate: z.number().default(0),
  discountPercent: z.number().default(0),
  gstRate: z.number().default(0),
  batchNo: z.string().default(''),
  mfgDate: z.string().or(z.date()).optional().default(''),
  expiryDate: z.string().or(z.date()).optional().default(''),
  mrp: z.number().default(0),
  size: z.string().optional().default(''),
});

const stockMovementSchema = z.object({
  docNo: z.string().optional(),
  direction: z.enum(['in', 'out']),
  type: z.enum(['sale', 'sample', 'order', 'return', 'purchase', 'transfer_out', 'transfer_in', 'damage']),
  billingMode: z.enum(['cash', 'regular']).optional().default('regular'),
  date: z.string().or(z.date()).optional(),
  warehouseId: objectId.optional(),
  warehouseName: z.string().default(''),
  partyType: z.enum(['customer', 'mr', 'vendor', '']).default(''),
  partyId: objectId.optional(),
  partyName: z.string().default(''),
  partyGstin: z.string().default(''),
  partyAddress: z.string().default(''),
  items: z.array(smItem).min(1, 'At least one item required'),
  baseAmount: z.number().default(0),
  cgst: z.number().default(0),
  sgst: z.number().default(0),
  igst: z.number().default(0),
  roundOff: z.number().default(0),
  totalAmount: z.number().default(0),
  isFree: z.boolean().default(false),
  status: z.enum(['draft', 'dispatched', 'received', 'cancelled']).default('draft'),
  convertedToInvoice: z.boolean().optional().default(false),
  invoiceId: objectId.optional(),
  invoiceNo: z.string().optional().default(''),
  medicalRepName: z.string().optional().default(''),
  doctorName: z.string().optional().default(''),
  damageReason: z.string().optional().default(''),
  notes: z.string().default(''),
  createdBy: z.string().default(''),
});

// ── Order ────────────────────────────────────────────────────
const orderItem = z.object({
  productId: objectId,
  name: z.string().min(1),
  qty: z.number().int().min(1),
  price: z.number().min(0),
  size: z.string().default(''),
  deductedBoxes: z.number().default(0),
});

const orderSchema = z.object({
  name: z.string().min(1, 'Name required'),
  email: z.string().email('Valid email required'),
  phone: z.string().min(1, 'Phone required'),
  shippingAddress: z.string().min(1, 'Shipping address required'),
  items: z.array(orderItem).min(1, 'At least one item required'),
  totalAmount: z.number().min(0),
  status: z.enum(['pending', 'processing', 'shipped', 'delivered', 'cancelled']).default('pending'),
  courierName: z.string().default(''),
  trackingId: z.string().default(''),
  courierLink: z.string().default(''),
  adminNotes: z.string().default(''),
});

// ── Warehouse ────────────────────────────────────────────────
const warehouseSchema = z.object({
  name: z.string().min(1, 'Warehouse name required'),
  addressLine1: z.string().default(''),
  addressLine2: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  pincode: z.string().default(''),
  contactPerson: z.string().default(''),
  phone: z.string().default(''),
});

// ── User ─────────────────────────────────────────────────────
const userSchema = z.object({
  name: z.string().min(1, 'Name required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.string().regex(/^[a-z0-9_]+$/, 'Invalid role format').default('agent'),
  canAccessCash: z.boolean().default(false),
});

const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.string().regex(/^[a-z0-9_]+$/, 'Invalid role format').optional(),
  canAccessCash: z.boolean().optional(),
});

// ── Vendor ───────────────────────────────────────────────────
const vendorSchema = z.object({
  name: z.string().default(''),
  company: z.string().default(''),
  email,
  phone,
  productCategory: z.string().default('General'),
  regularBalance: z.number().default(0),
  cashBalance: z.number().default(0),
  paymentTerms: z.string().default('Net 30'),
  gstin,
  state: z.string().default('Maharashtra'),
  registeredName: z.string().default(''),
  displayName: z.string().default(''),
  contactPerson: z.string().default(''),
  addressPin: z.string().default(''),
  addressCity: z.string().default(''),
  pan: z.string().default(''),
  bankAccountNumber: z.string().default(''),
  bankIfsc: z.string().default(''),
  bankName: z.string().default(''),
  bankBranch: z.string().default(''),
  recordTracking: z.enum(['invoice_ledger', 'cash_ledger']).default('invoice_ledger'),
  manufacturingLicenseNo: z.string().optional().default(''),
  manufacturingLicenseExpiry: z.string().or(z.date()).nullable().optional()
});

// ── InventoryEntry ───────────────────────────────────────────
const inventoryEntrySchema = z.object({
  warehouseId: objectId,
  warehouseName: z.string().min(1),
  productId: objectId,
  productType: z.string().default(''),
  size: z.string().default(''),
  colour: z.string().default(''),
  shape: z.string().default(''),
  weight: z.string().default(''),
  hsnCode: z.string().default(''),
  vendorId: z.string().default(''),
  vendorName: z.string().default(''),
  qtyBoxes: z.number().int().default(0),
  packing: z.number().int().min(1).default(1),
  batchNo: z.string().default(''),
  mfgDate: z.string().or(z.date()).optional(),
  expiryDate: z.string().or(z.date()).optional(),
  purchaseRate: z.number().default(0),
});

// ── Payment ──────────────────────────────────────────────────
const paymentSchema = z.object({
  type: z.enum(['receive', 'make']),
  partyType: z.enum(['Customer', 'Vendor']),
  partyId: objectId,
  partyName: z.string().min(1),
  amount: z.number().min(0),
  mode: z.enum(['regular', 'cash']).default('regular'),
  paymentMethod: z.enum(['Cash', 'Bank Transfer', 'Cheque', 'UPI']).default('Cash'),
  referenceNo: z.string().default(''),
  notes: z.string().default(''),
  date: z.string().or(z.date()).optional(),
});

// ── Credit / Debit Note ──────────────────────────────────────
const creditNoteItem = z.object({
  productId: objectId.optional(),
  name: z.string().min(1),
  qty: z.number().min(0).default(0),
  boxes: z.number().min(0).default(0),
  packing: z.number().min(1).default(1),
  rate: z.number().min(0).default(0),
  amount: z.number().min(0).default(0),
});

const creditNoteSchema = z.object({
  noteNo: z.string().optional(),
  type: z.enum(['credit_note', 'debit_note']),
  invoiceId: objectId.optional(),
  invoiceNo: z.string().default(''),
  partyType: z.enum(['Customer', 'Vendor']),
  partyId: objectId,
  partyName: z.string().min(1),
  date: z.string().or(z.date()).optional(),
  reason: z.string().default(''),
  baseAmount: z.number().min(0).default(0),
  gstRate: z.number().min(0).default(0),
  cgst: z.number().min(0).default(0),
  sgst: z.number().min(0).default(0),
  igst: z.number().min(0).default(0),
  totalAmount: z.number().min(0).default(0),
  items: z.array(creditNoteItem).default([]),
});

// ── Sample ───────────────────────────────────────────────────
const sampleItem = z.object({
  productId: objectId.optional(),
  productName: z.string().min(1),
  qty: z.number().int().min(1),
  size: z.string().default(''),
  mrp: z.number().default(0),
});

const sampleSchema = z.object({
  sampleNo: z.string().optional(),
  givenTo: z.string().min(1, 'Recipient name required'),
  designation: z.string().default(''),
  phone: z.string().default(''),
  location: z.string().default(''),
  purpose: z.string().default(''),
  items: z.array(sampleItem).min(1),
  totalMrpValue: z.number().default(0),
  givenBy: z.string().default(''),
  date: z.string().or(z.date()).optional(),
  followUpDate: z.string().or(z.date()).optional(),
  notes: z.string().default(''),
  status: z.enum(['given', 'follow_up_done', 'converted', 'no_response']).default('given'),
});

// ── BatchProduction ──────────────────────────────────────────
const plannedYieldSchema = z.object({
  productId: objectId,
  plannedQty: z.number().int().positive(),
  size: z.string().optional().default('')
});

const batchProductionSchema = z.object({
  batchNo: z.string().min(1),
  productId: objectId,
  bomId: objectId.optional().nullable(),
  plannedQty: z.number().int().positive(),
  manufacturingUnitId: objectId,
  startDate: z.string().or(z.date()).optional(),
  productionType: z.enum(['in_house', 'job_work']).default('in_house'),
  jobWorkMode: z.enum(['raw_materials_supplied', 'direct_purchase', 'none']).default('none'),
  packagingMode: z.enum(['packed_by_vendor', 'self_packed']).default('packed_by_vendor'),
  jobWorkerId: objectId.nullable().optional(),
  jobWorkerName: z.string().optional().default(''),
  jobWorkerChallanRef: z.string().optional().default(''),
  expiryDate: z.string().or(z.date()).optional().nullable(),
  plannedYields: z.array(plannedYieldSchema).optional()
});

const yieldItemSchema = z.object({
  productId: objectId,
  actualYieldQty: z.number().int().min(0),
  packing: z.number().int().min(1).default(1),
});

const batchCompleteSchema = z.object({
  actualYieldQty: z.number().int().min(0),
  wasteQty: z.number().int().min(0).default(0),
  wasteReason: z.string().default(''),
  qcNotes: z.string().default(''),
  qcPassedBy: z.string().default(''),
  packing: z.number().int().min(1).default(1),
  yields: z.array(yieldItemSchema).optional(),
  qcStatus: z.enum(['approved', 'rejected']).default('approved'),
  organoleptic: z.string().optional(),
  moistureContent: z.number().nullable().optional(),
  ashValue: z.number().nullable().optional(),
  pHValue: z.number().nullable().optional(),
  disintegrationTime: z.number().nullable().optional(),
  heavyMetals: z.string().optional(),
  microbialLimit: z.string().optional(),
  labReportRef: z.string().optional(),
  warehouseId: objectId,
  jobWorkerCertificateRef: z.string().optional().default(''),
  coaDocumentRef: z.string().optional().default(''),
  jobWorkCharges: z.number().nonnegative().optional().default(0)
});

// ── Challan ──────────────────────────────────────────────────
const challanItem = z.object({
  productId: objectId.optional(),
  name: z.string().min(1),
  qty: z.number().default(0),
  rate: z.number().default(0),
  packing: z.number().default(1),
  hsnCode: z.string().default(''),
  gstRate: z.number().default(0),
  vendorId: z.string().default(''),
  vendorName: z.string().default(''),
  batchNo: z.string().default(''),
});

const challanSchema = z.object({
  challanNo: z.string().optional(),
  date: z.string().or(z.date()).optional(),
  partyName: z.string().default(''),
  partyAddress: z.string().default(''),
  partyCity: z.string().default(''),
  stateOfSupply: z.string().default(''),
  gstin: z.string().default(''),
  shippingAddress: z.string().default(''),
  warehouseId: objectId.optional(),
  warehouseName: z.string().default(''),
  items: z.array(challanItem).default([]),
  status: z.string().default('draft'),
  mode: z.enum(['regular', 'pakka', 'cash']).default('pakka'),
  baseAmount: z.number().default(0),
  cgst: z.number().default(0),
  sgst: z.number().default(0),
  igst: z.number().default(0),
  roundOff: z.number().default(0),
  nettTotal: z.number().default(0),
  deductInventory: z.boolean().default(true),
});

// ── RawMaterial ──────────────────────────────────────────────
const rawMaterialSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  unit: z.string().min(1),
  category: z.string().default('Herb'),
  minReorder: z.number().default(0),
  cleaningLossPercent: z.number().min(0).max(100).default(0),
});

const rawMaterialEntrySchema = z.object({
  rawMaterialId: objectId,
  batchNo: z.string().min(1),
  qty: z.number().positive(),
  purchaseRate: z.number().min(0),
  vendorName: z.string().default(''),
  expiryDate: z.string().or(z.date()).optional(),
});

// ── BOM ──────────────────────────────────────────────────────
const bomIngredient = z.object({
  rawMaterialId: objectId,
  qtyRequired: z.number().positive(),
  itemType: z.enum(['formulation', 'packaging']).default('formulation').optional(),
  stageName: z.string().optional().default(''),
});

const bomStage = z.object({
  name: z.string().min(1),
  targetDurationDays: z.number().positive().default(1),
});

const bomSchema = z.object({
  productId: objectId,
  recipeName: z.string().default('Standard Recipe'),
  isDefault: z.boolean().default(false),
  batchYieldSize: z.number().int().positive(),
  ingredients: z.array(bomIngredient).min(1),
  isActive: z.boolean().optional(),
  productionNotes: z.string().optional(),
  overheadCost: z.number().nonnegative().optional(),
  stages: z.array(bomStage).optional(),
  defaultProductionType: z.enum(['in_house', 'job_work']).default('in_house'),
  defaultJobWorkMode: z.enum(['raw_materials_supplied', 'direct_purchase', 'none']).default('none'),
  defaultPackagingMode: z.enum(['packed_by_vendor', 'self_packed']).default('self_packed'),
  defaultJobWorkerId: objectId.nullable().optional(),
  formulationBasis: z.number().positive().optional().default(100),
  formulationBasisUnit: z.string().optional().default('ml'),
});

// ── Contact ──────────────────────────────────────────────────
const contactSchema = z.object({
  name: z.string().min(1),
  email,
  phone,
  company: z.string().default(''),
  role: z.string().default(''),
  notes: z.string().default(''),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const interactionSchema = z.object({
  type: z.string().min(1),
  notes: z.string().default(''),
  date: z.string().or(z.date()).optional(),
});

// ── MedicalRep ───────────────────────────────────────────────
const medicalRepSchema = z.object({
  name: z.string().min(1),
  email,
  phone,
  territory: z.string().default(''),
  joiningDate: z.string().or(z.date()).optional(),
  notes: z.string().default(''),
});

const mrCheckinSchema = z.object({
  location: z.string().default(''),
  notes: z.string().default(''),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  startKmReading: z.number().optional(),
});

const mrVisitSchema = z.object({
  doctorName: z.string().min(1),
  clinic: z.string().default(''),
  location: z.string().default(''),
  notes: z.string().default(''),
  date: z.string().or(z.date()).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  sampleDetails: z.array(z.object({
    productId: objectId.optional(),
    name: z.string().optional(),
    qty: z.number().default(1)
  })).optional()
});

const mrExpenseSchema = z.object({
  category: z.string().min(1),
  amount: z.number().positive(),
  notes: z.string().default(''),
  date: z.string().or(z.date()).optional(),
});

// ── Task ─────────────────────────────────────────────────────
const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  dueDate: z.string().or(z.date()).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  status: z.enum(['pending', 'in_progress', 'completed']).default('pending'),
  assignedTo: objectId.optional(),
});

// ── Campaign ─────────────────────────────────────────────────
const campaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  type: z.string().default(''),
  startDate: z.string().or(z.date()).optional(),
  endDate: z.string().or(z.date()).optional(),
  budget: z.number().default(0),
  status: z.enum(['draft', 'active', 'paused', 'completed']).default('draft'),
});

// ── Complaint ────────────────────────────────────────────────
const complaintSchema = z.object({
  customerName: z.string().min(1),
  phone: z.string().default(''),
  productId: objectId.optional(),
  productName: z.string().default(''),
  issue: z.string().min(1),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).default('open'),
  resolution: z.string().default(''),
});

// ── Dispatch ─────────────────────────────────────────────────
const dispatchSchema = z.object({
  dispatchNo: z.string().optional(),
  invoiceId: objectId.optional(),
  invoiceNo: z.string().default(''),
  customerName: z.string().min(1, 'Customer name required'),
  customerPhone: z.string().default(''),
  shippingAddress: z.string().default(''),
  items: z.array(z.object({
    productId: objectId.optional(),
    name: z.string().min(1, 'Item name required'),
    qty: z.number().int().nonnegative(),
    packing: z.number().int().min(1).default(1),
    batchNo: z.string().default(''),
  })).min(1),
  transporter: z.string().default(''),
  vehicleNo: z.string().default(''),
  date: z.string().or(z.date()).optional(),
  notes: z.string().default(''),
  totalBoxes: z.number().default(0),
  totalWeight: z.string().default(''),
  freightCharge: z.number().default(0),
  status: z.enum(['pending', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'returned']).default('dispatched'),
});

// ── ManufacturingUnit ────────────────────────────────────────
const manufacturingUnitSchema = z.object({
  name: z.string().min(1, 'Manufacturing unit name required'),
  code: z.string().min(1, 'Manufacturing unit code required'),
  addressLine1: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  pincode: z.string().default(''),
  contactPerson: z.string().default(''),
  phone: z.string().default(''),
  isActive: z.boolean().default(true),
});

// ── SystemSettings ───────────────────────────────────────────
const systemSettingsSchema = z.object({}).passthrough();

// ── RBAC ─────────────────────────────────────────────────────
const rbacPermissionsSchema = z.object({
  role: z.string().min(1).optional(),
  permissions: z.array(z.string()).optional(),
  label: z.string().optional(),
  description: z.string().optional(),
});

// ── Web Query ────────────────────────────────────────────────
const querySubmitSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().default(''),
  message: z.string().min(1),
});

const queryConvertSchema = z.object({
  customerId: objectId.optional(),
  customerName: z.string().min(1),
  notes: z.string().default(''),
});

// ── Sales Target ─────────────────────────────────────────────
const salesTargetSchema = z.object({
  agentId: objectId.optional(),
  agentName: z.string().default(''),
  month: z.string().min(1),
  year: z.number().int(),
  targetAmount: z.number().positive(),
});

// ── Verification ─────────────────────────────────────────────
const gstinVerifySchema = z.object({
  gstin: z.string().length(15),
});

// ── Batch Production Supporting Documents ─────────────────────
const batchStageUpdateSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped', 'failed']).optional(),
  notes: z.string().optional(),
  completedBy: z.string().optional(),
  inputQty: z.number().min(0).optional(),
  outputQty: z.number().min(0).optional(),
  actualYieldQty: z.number().min(0).optional(),
  lossReason: z.string().optional(),
  stageIngredients: z.array(z.object({
    rawMaterialId: z.string(),
    qtyNeeded: z.number().min(0),
    wastage: z.number().min(0).optional(),
  })).optional(),
});

const cleaningAdjustmentSchema = z.object({
  cleanedQty: z.number().min(0),
  notes: z.string().default(''),
});

const batchCancelSchema = z.object({
  reason: z.string().optional().default(''),
});

const batchDocumentAddSchema = z.object({
  name: z.string().min(1, 'Document name required'),
  url: z.string().url('Valid document URL required'),
});

const batchDocumentRemoveSchema = z.object({
  url: z.string().url('Valid document URL required'),
});

// ── Exports ──────────────────────────────────────────────────
module.exports = {
  productSchema,
  customerSchema,
  invoiceSchema,
  quotationSchema,
  stockMovementSchema,
  orderSchema,
  warehouseSchema,
  manufacturingUnitSchema,
  userSchema,
  loginSchema,
  changePasswordSchema,
  updateProfileSchema,
  vendorSchema,
  inventoryEntrySchema,
  paymentSchema,
  creditNoteSchema,
  sampleSchema,
  batchProductionSchema,
  batchCompleteSchema,
  challanSchema,
  rawMaterialSchema,
  rawMaterialEntrySchema,
  bomSchema,
  contactSchema,
  interactionSchema,
  medicalRepSchema,
  mrCheckinSchema,
  mrVisitSchema,
  mrExpenseSchema,
  taskSchema,
  campaignSchema,
  complaintSchema,
  dispatchSchema,
  systemSettingsSchema,
  rbacPermissionsSchema,
  querySubmitSchema,
  queryConvertSchema,
  salesTargetSchema,
  gstinVerifySchema,
  batchStageUpdateSchema,
  batchCancelSchema,
  batchDocumentAddSchema,
  batchDocumentRemoveSchema,
  cleaningAdjustmentSchema,
  objectId,
  productItem,
  orderItem,
  smItem,
  invoiceItem,
  challanItem,
  sampleItem,
  bomIngredient,
  addressObj,
};
