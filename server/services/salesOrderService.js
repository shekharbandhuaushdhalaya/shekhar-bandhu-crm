const Order = require('../models/Order');
const Challan = require('../models/Challan');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');
const InventoryEntry = require('../models/InventoryEntry');
const { generateAtomicDocumentNumber, getNextSequenceValue } = require('../utils/documentCounter');
const { priceOrderItems, evaluateOrderApproval, money } = require('./salesPricingService');

function salesOrderError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function resolvePricedRows(customer, rawItems) {
  const productRows = [];
  for (const row of rawItems || []) {
    const qty = Number(row.qty || 0);
    if (!(qty > 0)) throw salesOrderError('INVALID_QUANTITY', 'Every order quantity must be greater than zero');
    const product = await Product.findById(row.productId);
    if (!product) throw salesOrderError('PRODUCT_NOT_FOUND', `Product not found: ${row.productId}`, 404);
    productRows.push({ product, qty });
  }
  if (!productRows.length) throw salesOrderError('INVALID_ORDER', 'At least one product is required');
  const priced = await priceOrderItems(customer, productRows);
  const approval = await evaluateOrderApproval(customer, priced.items, priced.totalAmount);
  return { ...priced, ...approval };
}

async function resolveFixedPricedRows(customer, rawItems) {
  const items = [];
  for (const row of rawItems || []) {
    const qty = Number(row.qty || 0);
    const price = Number(row.price ?? row.rate ?? 0);
    const freeQty = Number(row.freeQty || 0);
    if (!(qty > 0) || !Number.isFinite(price) || price < 0 || !Number.isFinite(freeQty) || freeQty < 0) {
      throw salesOrderError('INVALID_ORDER_ITEM', 'Every fixed-price order line requires a positive quantity and non-negative price/free quantity');
    }
    const product = await Product.findById(row.productId);
    if (!product) throw salesOrderError('PRODUCT_NOT_FOUND', `Product not found: ${row.productId}`, 404);
    items.push({
      productId: product._id,
      name: row.name || product.name,
      qty,
      price,
      size: product.size || '',
      fulfilledQty: 0,
      backorderedQty: qty + freeQty,
      freeQty,
      discountPercent: Number(row.discountPercent || 0),
      pricingSource: row.pricingSource || 'source_document',
      schemeCode: row.schemeCode || '',
    });
  }
  if (!items.length) throw salesOrderError('INVALID_ORDER', 'At least one product is required');
  const totalAmount = money(items.reduce((sum, item) => sum + item.price * item.qty, 0));
  const approval = await evaluateOrderApproval(customer, items, totalAmount);
  return {
    items,
    totalAmount,
    pricingSummary: {
      subtotal: totalAmount,
      discount: 0,
      schemeBenefit: money(items.reduce((sum, item) => sum + item.freeQty * item.price, 0)),
    },
    ...approval,
  };
}

async function createSalesOrder(payload, options = {}) {
  const customer = options.customer || await Customer.findById(payload.customerId);
  if (!customer) throw salesOrderError('CUSTOMER_NOT_FOUND', 'Customer not found', 404);

  const clientOrderRef = String(payload.clientOrderRef || '').trim();
  if (clientOrderRef) {
    const existing = await Order.findOne({ clientOrderRef, customerId: customer._id });
    if (existing) return { order: existing, idempotent: true, approvalRequired: existing.approvalRequired };
  }

  let warehouse = null;
  if (payload.warehouseId) {
    warehouse = await Warehouse.findById(payload.warehouseId);
    if (!warehouse) throw salesOrderError('WAREHOUSE_NOT_FOUND', 'Warehouse not found', 404);
  }

  let priced = options.fixedPricing
    ? await resolveFixedPricedRows(customer, payload.items || [])
    : await resolvePricedRows(customer, payload.items || []);
  if (options.preApproved) {
    priced = { ...priced, approvalRequired: false };
  }
  const orderNo = await generateAtomicDocumentNumber('salesOrderNo_SO', 'SO-', 5);
  const approvalStatus = priced.approvalRequired ? 'pending_approval' : (options.preApproved ? 'approved' : 'none');
  const status = priced.approvalRequired ? 'pending' : 'processing';
  const sourceType = payload.sourceType || options.sourceType || 'direct';
  const sourcePersonId = payload.sourcePersonId || null;
  const sourcePersonName = payload.sourcePersonName || '';

  const order = await Order.create({
    orderNo,
    clientOrderRef,
    orderChannel: payload.orderChannel || options.orderChannel || 'crm',
    customerId: customer._id,
    name: customer.company || customer.name,
    email: customer.email || options.fallbackEmail || 'sales@local.invalid',
    phone: customer.phone || '-',
    shippingAddress: payload.shippingAddress || customer.shippingAddress?.street || customer.billingAddress?.street || '-',
    billingAddress: payload.billingAddress || customer.billingAddress?.street || '',
    customerPoNo: payload.customerPoNo || '',
    expectedDeliveryDate: payload.expectedDeliveryDate || null,
    priority: payload.priority || 'normal',
    paymentTerms: customer.paymentTerms || '',
    creditDays: Number(customer.creditDays || 0),
    warehouseId: warehouse?._id || null,
    warehouseName: warehouse?.name || '',
    items: priced.items,
    totalAmount: priced.totalAmount,
    status,
    sourceType,
    sourcePersonId,
    sourcePersonName,
    mrId: sourceType === 'mr' && sourcePersonId ? sourcePersonId : null,
    mrName: sourceType === 'mr' ? sourcePersonName : '',
    adminNotes: `${options.notePrefix || ''}${payload.notes || ''}`.trim(),
    approvalRequired: priced.approvalRequired,
    approvalStatus,
    pricingSummary: priced.pricingSummary,
  });

  return {
    order,
    idempotent: false,
    approvalRequired: priced.approvalRequired,
    credit: priced.credit,
    policy: priced.policy,
  };
}

const nonExpiredFilter = () => ({
  $or: [
    { expiryDate: null },
    { expiryDate: { $exists: false } },
    { expiryDate: { $gt: new Date() } },
  ],
});

async function priorFulfillment(orderId, productId) {
  const challans = await Challan.find({
    salesOrderId: orderId,
    status: 'finalized',
    inventoryPostingStatus: 'posted',
  }).select('items').lean();
  let physical = 0;
  let billable = 0;
  for (const row of challans.flatMap((challan) => challan.items || []).filter((item) => String(item.productId) === String(productId))) {
    const qty = Number(row.qty || 0);
    physical += qty;
    billable += row.billableQty == null
      ? Math.max(0, qty - Number(row.freeQty || 0))
      : Number(row.billableQty || 0);
  }
  return { physical, billable, free: Math.max(0, physical - billable) };
}

function allocateBillingAcrossLots(lots, { paidRemaining, freeRemaining }) {
  let paid = paidRemaining;
  let free = freeRemaining;
  return lots.map((lot) => {
    const qty = Number(lot.qty || 0);
    const billableQty = Math.min(qty, Math.max(0, paid));
    paid -= billableQty;
    const freeQty = qty - billableQty;
    free -= freeQty;
    if (free < -0.0001) {
      throw salesOrderError('FULFILLMENT_EXCEEDS_REMAINING', 'Fulfillment exceeds the remaining order quantity', 409);
    }
    return { ...lot, billableQty, freeQty };
  });
}

async function resolveRequestedLots({ order, orderItem, requestRow, warehouse }) {
  const physicalRemaining = Math.max(
    0,
    Number(orderItem.qty || 0) + Number(orderItem.freeQty || 0) - Number(orderItem.fulfilledQty || 0)
  );
  const qty = Number(requestRow.qty || 0);
  if (!(qty > 0) || qty > physicalRemaining + 0.0001) {
    throw salesOrderError(
      'FULFILLMENT_EXCEEDS_REMAINING',
      `${orderItem.name}: remaining ${physicalRemaining}, requested ${qty}`,
      409
    );
  }

  const product = await Product.findById(orderItem.productId);
  if (!product) throw salesOrderError('PRODUCT_NOT_FOUND', `Product not found: ${orderItem.name}`, 404);
  const packing = Number(requestRow.packing || 1);
  const base = {
    productId: product._id,
    name: orderItem.name,
    rate: Number(orderItem.price || 0),
    packing,
    hsnCode: product.hsnCode || '',
    gstRate: Number(product.gstRate || 0),
  };
  const commonFilter = {
    warehouseId: warehouse._id,
    productId: product._id,
    packing,
    qcStatus: 'approved',
    qtyBoxes: { $gt: 0 },
    ...nonExpiredFilter(),
  };
  const lots = [];

  if (requestRow.inventoryEntryId) {
    const entry = await InventoryEntry.findOne({ _id: requestRow.inventoryEntryId, ...commonFilter }).lean();
    if (!entry || Number(entry.qtyBoxes || 0) < qty) {
      throw salesOrderError('BATCH_STOCK_UNAVAILABLE', `${orderItem.name}: selected stock slot is unavailable or insufficient`, 409);
    }
    lots.push({ ...base, qty, batchNo: entry.batchNo || '', vendorId: entry.vendorId || '', vendorName: entry.vendorName || '' });
  } else if (requestRow.batchNo) {
    const batchFilter = { ...commonFilter, batchNo: requestRow.batchNo };
    if (requestRow.vendorId) batchFilter.vendorId = requestRow.vendorId;
    const matches = await InventoryEntry.find(batchFilter).limit(2).lean();
    if (!matches.length) throw salesOrderError('BATCH_STOCK_UNAVAILABLE', `${orderItem.name}: selected batch is unavailable`, 409);
    if (matches.length > 1 && !requestRow.vendorId) {
      throw salesOrderError('BATCH_AMBIGUOUS', `${orderItem.name}: batch ${requestRow.batchNo} exists in more than one stock slot; select the exact lot`, 409);
    }
    const entry = matches[0];
    if (Number(entry.qtyBoxes || 0) < qty) {
      throw salesOrderError('BATCH_STOCK_UNAVAILABLE', `${orderItem.name}: selected batch has only ${entry.qtyBoxes} boxes`, 409);
    }
    lots.push({ ...base, qty, batchNo: entry.batchNo || '', vendorId: entry.vendorId || '', vendorName: entry.vendorName || '' });
  } else {
    const entries = await InventoryEntry.find(commonFilter).sort({ expiryDate: 1, mfgDate: 1, createdAt: 1 }).lean();
    let remaining = qty;
    for (const entry of entries) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, Number(entry.qtyBoxes || 0));
      if (!(take > 0)) continue;
      lots.push({ ...base, qty: take, batchNo: entry.batchNo || '', vendorId: entry.vendorId || '', vendorName: entry.vendorName || '' });
      remaining -= take;
    }
    if (remaining > 0.0001) {
      throw salesOrderError('INSUFFICIENT_STOCK', `Insufficient approved non-expired stock for ${orderItem.name}. Short by ${money(remaining)} boxes.`, 409);
    }
  }

  const prior = await priorFulfillment(order._id, orderItem.productId);
  return allocateBillingAcrossLots(lots, {
    paidRemaining: Math.max(0, Number(orderItem.qty || 0) - prior.billable),
    freeRemaining: Math.max(0, Number(orderItem.freeQty || 0) - prior.free),
  });
}

async function createDraftFulfillment(order, payload) {
  if (order.approvalRequired && order.approvalStatus !== 'approved') {
    throw salesOrderError('ORDER_APPROVAL_REQUIRED', 'Order must be approved before fulfillment', 409);
  }
  if (['draft', 'cancelled', 'fulfilled', 'shipped', 'delivered'].includes(order.status)) {
    throw salesOrderError('ORDER_NOT_FULFILLABLE', `Order is ${order.status}`, 409);
  }
  if (!order.customerId) throw salesOrderError('ORDER_CUSTOMER_REQUIRED', 'Sales Order must be linked to a customer', 409);

  const warehouseId = payload.warehouseId || order.warehouseId;
  const warehouse = await Warehouse.findById(warehouseId);
  if (!warehouse) throw salesOrderError('WAREHOUSE_NOT_FOUND', 'Warehouse not found', 404);

  const challanItems = [];
  for (const row of payload.items || []) {
    const orderItem = order.items.find((item) => String(item.productId) === String(row.productId));
    if (!orderItem) throw salesOrderError('ORDER_ITEM_NOT_FOUND', 'Item does not belong to this order', 409);
    challanItems.push(...await resolveRequestedLots({ order, orderItem, requestRow: row, warehouse }));
  }
  if (!challanItems.length) throw salesOrderError('EMPTY_FULFILLMENT', 'Select quantities to fulfill');

  const challanNo = await generateAtomicDocumentNumber('challanNo_CH', 'CH-', 5);
  const baseAmount = money(challanItems.reduce(
    (sum, item) => sum + Number(item.billableQty || 0) * Number(item.rate || 0),
    0
  ));
  const fulfillmentSequence = await getNextSequenceValue(`salesOrderFulfillment_${order._id}`);
  const challan = await Challan.create({
    challanNo,
    challanType: 'sale',
    salesOrderId: order._id,
    customerId: order.customerId,
    fulfillmentSequence,
    partyName: order.name,
    shippingAddress: order.shippingAddress,
    warehouseId: warehouse._id,
    warehouseName: warehouse.name,
    items: challanItems,
    status: 'draft',
    mode: 'pakka',
    baseAmount,
    nettTotal: baseAmount,
  });
  await Order.updateOne({ _id: order._id }, { $addToSet: { challanIds: challan._id } });
  return challan;
}

module.exports = {
  createSalesOrder,
  createDraftFulfillment,
  resolvePricedRows,
  salesOrderError,
};
