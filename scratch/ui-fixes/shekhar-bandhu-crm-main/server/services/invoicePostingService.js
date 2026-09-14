const Invoice = require('../models/Invoice');
const Challan = require('../models/Challan');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Warehouse = require('../models/Warehouse');
const Product = require('../models/Product');
const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const InventoryEntry = require('../models/InventoryEntry');
const StockLedger = require('../models/StockLedger');
const { withTransaction } = require('../utils/withTransaction');
const { calculateTCS } = require('../utils/tdsTcsCalculator');

function businessError(code, message, details) {
  const err = new Error(message);
  err.code = code;
  if (details) err.details = details;
  return err;
}

function normalizedStatus(invoice) {
  const paid = Number(invoice.amountPaid || 0);
  const total = Number(invoice.amount || 0);
  if (paid <= 0) return 'unpaid';
  if (paid + 0.005 >= total) return 'paid';
  return 'partially_paid';
}

async function finalizeSaleInvoice(invoiceId, actor = {}) {
  const draft = await Invoice.findOne({ _id: invoiceId, type: 'sale' }).lean();
  if (!draft) throw businessError('INVOICE_NOT_FOUND', 'Sale invoice not found');
  if (draft.isFinalized) throw businessError('INVOICE_ALREADY_FINALIZED', 'Invoice is already finalized');
  if (!draft.customerId) throw businessError('CUSTOMER_REQUIRED', 'A linked customer is required before finalizing a sale invoice');
  if (draft.sourceDocType !== 'Challan' || !draft.sourceDocId) {
    throw businessError('SALE_CHALLAN_REQUIRED', 'A normal sale invoice must originate from a posted Sale Challan');
  }

  const tcsResult = await calculateTCS({
    customerId: draft.customerId,
    invoiceAmount: Number(draft.amount || 0),
    invoiceDate: draft.date || new Date(),
  });

  return withTransaction(async (session) => {
    const invoice = await Invoice.findOne({ _id: invoiceId, type: 'sale' }).session(session);
    if (!invoice) throw businessError('INVOICE_NOT_FOUND', 'Sale invoice not found');
    if (invoice.isFinalized) throw businessError('INVOICE_ALREADY_FINALIZED', 'Invoice is already finalized');
    if (!invoice.customerId) throw businessError('CUSTOMER_REQUIRED', 'A linked customer is required before finalizing a sale invoice');
    if (invoice.sourceDocType !== 'Challan' || !invoice.sourceDocId) {
      throw businessError('SALE_CHALLAN_REQUIRED', 'A normal sale invoice must originate from a posted Sale Challan');
    }

    const challan = await Challan.findOne({
      _id: invoice.sourceDocId,
      challanType: 'sale',
      status: 'finalized',
      inventoryPostingStatus: 'posted',
    }).session(session);
    if (!challan) throw businessError('CHALLAN_NOT_POSTED', 'The originating Sale Challan is not posted');
    if (!challan.customerId || String(challan.customerId) !== String(invoice.customerId)) {
      throw businessError('CUSTOMER_MISMATCH', 'Invoice customer does not match the originating Challan customer');
    }

    const customer = await Customer.findById(invoice.customerId).session(session);
    if (!customer) throw businessError('CUSTOMER_NOT_FOUND', 'Linked customer not found');

    if (tcsResult?.applicable && Number(tcsResult.amount || 0) > 0) {
      const tcs = Number(tcsResult.amount || 0);
      invoice.tcsApplicable = true;
      invoice.tcsRate = 0.1;
      invoice.tcsAmount = tcs;
      invoice.amount = Number(invoice.amount || 0) + tcs;
    }

    invoice.isFinalized = true;
    invoice.status = normalizedStatus(invoice);
    invoice.amountPaid = Number(invoice.amountPaid || 0);
    await invoice.save({ session });

    const balanceField = invoice.mode === 'cash' ? 'cashBalance' : 'regularBalance';
    customer[balanceField] = Number(customer[balanceField] || 0) + Number(invoice.amount || 0);
    await customer.save({ session });

    return invoice;
  });
}

async function resolvePurchaseWarehouse(invoice, session) {
  if (!invoice.warehouseId) {
    throw businessError('WAREHOUSE_REQUIRED', 'Select the receiving warehouse before finalizing a purchase invoice');
  }
  const warehouse = await Warehouse.findById(invoice.warehouseId).session(session);
  if (!warehouse) throw businessError('WAREHOUSE_NOT_FOUND', 'Receiving warehouse not found');
  return warehouse;
}

async function resolvePurchaseVendor(invoice, session) {
  if (!invoice.vendorId) throw businessError('VENDOR_REQUIRED', 'A linked vendor is required before finalizing a purchase invoice');
  const vendor = await Vendor.findById(invoice.vendorId).session(session);
  if (!vendor) throw businessError('VENDOR_NOT_FOUND', 'Linked vendor not found');
  return vendor;
}

async function postFinishedProductLine({ invoice, item, index, warehouse, vendor, session, actor }) {
  if (!item.productId) throw businessError('PRODUCT_REQUIRED', `Purchase line ${index + 1} is not linked to a product`);
  const product = await Product.findById(item.productId).session(session);
  if (!product) throw businessError('PRODUCT_NOT_FOUND', `Product not found for purchase line ${index + 1}`);
  const qty = Number(item.boxes || item.qty || 0);
  if (!(qty > 0)) throw businessError('INVALID_QUANTITY', `Purchase quantity must be positive for ${item.name}`);
  const packing = Number(item.packing || 1);
  const batchNo = String(item.batchNo || `PUR-${invoice.invoiceNo}`).trim();

  let entry = await InventoryEntry.findOne({
    warehouseId: warehouse._id,
    productId: product._id,
    vendorId: String(vendor._id),
    packing,
    batchNo,
  }).session(session);
  if (!entry) {
    entry = new InventoryEntry({
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      productId: product._id,
      productType: product.productType || '',
      size: product.size || '',
      colour: product.colour || '',
      shape: product.shape || '',
      weight: product.weight || '',
      hsnCode: product.hsnCode || '',
      vendorId: String(vendor._id),
      vendorName: vendor.company || vendor.name || '',
      qtyBoxes: 0,
      packing,
      batchNo,
      mfgDate: item.mfgDate || null,
      expiryDate: item.expiryDate || null,
      qcStatus: 'under_test',
    });
  }
  entry.qtyBoxes = Number(entry.qtyBoxes || 0) + qty;
  await entry.save({ session });

  product.stockLevel = Number(product.stockLevel || 0) + qty;
  await product.save({ session });

  await StockLedger.create([{
    productId: product._id,
    warehouseId: warehouse._id,
    warehouseName: warehouse.name,
    type: 'IN',
    qtyBoxes: qty,
    balanceBoxes: entry.qtyBoxes,
    reference: invoice.invoiceNo,
    movementKey: `purchase-invoice:${invoice._id}:product:${index}`,
    note: `Purchase Invoice ${invoice.invoiceNo}`,
    createdBy: actor.name || 'System',
    packing,
    batchNo,
    vendorId: String(vendor._id),
    vendorName: vendor.company || vendor.name || '',
    createdAt: invoice.date || new Date(),
  }], { session });
}

async function postRawMaterialLine({ invoice, item, index, warehouse, vendor, session }) {
  const rawMaterial = item.rawMaterialId
    ? await RawMaterial.findById(item.rawMaterialId).session(session)
    : null;
  if (!rawMaterial) throw businessError('RAW_MATERIAL_NOT_FOUND', `Raw material not found for purchase line ${index + 1}`);
  const qty = Number(item.qty || item.boxes || 0);
  if (!(qty > 0)) throw businessError('INVALID_QUANTITY', `Purchase quantity must be positive for ${item.name}`);
  const batchNo = String(item.batchNo || `PUR-${invoice.invoiceNo}`).trim();

  let entry = await RawMaterialEntry.findOne({
    rawMaterialId: rawMaterial._id,
    warehouseId: warehouse._id,
    batchNo,
  }).session(session);
  if (!entry) {
    entry = new RawMaterialEntry({
      rawMaterialId: rawMaterial._id,
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      batchNo,
      initialQty: 0,
      qty: 0,
      purchaseRate: Number(item.rate || 0),
      vendorId: vendor._id,
      vendorName: vendor.company || vendor.name || '',
      purchaseRef: invoice.invoiceNo,
      expiryDate: item.expiryDate || null,
      qcStatus: 'under_test',
    });
  }
  entry.initialQty = Number(entry.initialQty || 0) + qty;
  entry.qty = Number(entry.qty || 0) + qty;
  if (Number(item.rate || 0) > 0) entry.purchaseRate = Number(item.rate || 0);
  entry.vendorId = vendor._id;
  entry.vendorName = vendor.company || vendor.name || '';
  entry.purchaseRef = invoice.invoiceNo;
  await entry.save({ session });
}

async function finalizePurchaseInvoice(invoiceId, actor = {}) {
  return withTransaction(async (session) => {
    const invoice = await Invoice.findOne({ _id: invoiceId, type: 'purchase' }).session(session);
    if (!invoice) throw businessError('INVOICE_NOT_FOUND', 'Purchase invoice not found');
    if (invoice.isFinalized) throw businessError('INVOICE_ALREADY_FINALIZED', 'Invoice is already finalized');

    const [warehouse, vendor] = await Promise.all([
      resolvePurchaseWarehouse(invoice, session),
      resolvePurchaseVendor(invoice, session),
    ]);
    invoice.warehouseName = warehouse.name;
    invoice.supplierName = vendor.company || vendor.name || invoice.supplierName;

    for (let index = 0; index < (invoice.items || []).length; index += 1) {
      const item = invoice.items[index];
      if (item.rawMaterialId || item.itemType === 'raw_material' || item.itemType === 'packaging' || item.itemType === 'consumable' || item.itemType === 'excipient') {
        await postRawMaterialLine({ invoice, item, index, warehouse, vendor, session });
      } else {
        await postFinishedProductLine({ invoice, item, index, warehouse, vendor, session, actor });
      }
    }

    const balanceField = invoice.mode === 'cash' ? 'cashBalance' : 'regularBalance';
    vendor[balanceField] = Number(vendor[balanceField] || 0) + Number(invoice.amount || 0);
    await vendor.save({ session });

    invoice.isFinalized = true;
    invoice.status = normalizedStatus(invoice);
    invoice.amountPaid = Number(invoice.amountPaid || 0);
    await invoice.save({ session });
    return invoice;
  });
}

module.exports = {
  finalizeSaleInvoice,
  finalizePurchaseInvoice,
  businessError,
};
