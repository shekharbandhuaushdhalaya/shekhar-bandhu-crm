const SalesReturn = require('../models/SalesReturn');
const Challan = require('../models/Challan');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Warehouse = require('../models/Warehouse');
const Product = require('../models/Product');
const InventoryEntry = require('../models/InventoryEntry');
const StockLedger = require('../models/StockLedger');
const CreditNote = require('../models/CreditNote');
const { generateAtomicDocumentNumber } = require('../utils/documentCounter');
const { withTransaction } = require('../utils/withTransaction');

const money = n => Number(Number(n || 0).toFixed(2));
function err(code, message) { const e = new Error(message); e.code = code; return e; }
function keyFor(item) { return `${String(item.productId)}::${String(item.batchNo || '')}::${Number(item.packing || 1)}::${String(item.vendorId || '')}`; }

/**
 * Returns are valued only from the authoritative posted Challan.
 * Promotional/free units remain explicitly zero-value. For a partial return we allocate
 * remaining free units first, then paid units; this prevents a client from choosing a
 * "paid" unit when the same physical batch still has unreturned promotional stock.
 */
function deriveReturnPricing(originalItems, requestedItems, priorReturnedItems = []) {
  const sold = new Map();
  for (const row of originalItems || []) {
    const physical = Number(row.qty || 0);
    const billable = row.billableQty == null
      ? Math.max(0, physical - Number(row.freeQty || 0))
      : Number(row.billableQty || 0);
    const free = Math.max(0, Number(row.freeQty == null ? physical - billable : row.freeQty || 0));
    const base = money(billable * Number(row.rate || 0));
    const tax = money(base * Number(row.gstRate || 0) / 100);
    const k = keyFor(row);
    const current = sold.get(k) || {
      physical: 0, billable: 0, free: 0, base: 0, tax: 0,
      packing: Number(row.packing || 1), name: row.name || '',
      vendorId: row.vendorId || '', vendorName: row.vendorName || '',
    };
    current.physical += physical;
    current.billable += billable;
    current.free += free;
    current.base = money(current.base + base);
    current.tax = money(current.tax + tax);
    if (!current.vendorId && row.vendorId) current.vendorId = row.vendorId;
    if (!current.vendorName && row.vendorName) current.vendorName = row.vendorName;
    sold.set(k, current);
  }

  const already = new Map();
  for (const row of priorReturnedItems || []) {
    const k = keyFor(row);
    const current = already.get(k) || { physical: 0, billable: 0, free: 0 };
    const physical = Number(row.qty || 0);
    const billable = row.billableQty == null ? physical : Number(row.billableQty || 0);
    const free = row.freeQty == null ? Math.max(0, physical - billable) : Number(row.freeQty || 0);
    current.physical += physical;
    current.billable += billable;
    current.free += free;
    already.set(k, current);
  }

  const allocatedThisCall = new Map();
  return (requestedItems || []).map(row => {
    const k = keyFor(row);
    const source = sold.get(k);
    if (!source) throw err('RETURN_ITEM_NOT_SOLD', `${row.name || 'Item'} was not dispatched on the original Challan${row.batchNo ? ` in batch ${row.batchNo}` : ''}`);
    const qty = Number(row.qty || 0);
    if (!(qty > 0)) throw err('INVALID_RETURN_QUANTITY', `Return quantity must be positive for ${row.name || source.name}`);

    const prior = already.get(k) || { physical: 0, billable: 0, free: 0 };
    const current = allocatedThisCall.get(k) || { physical: 0, billable: 0, free: 0 };
    const remainingPhysical = source.physical - prior.physical - current.physical;
    if (qty > remainingPhysical + 0.0001) throw err('RETURN_EXCEEDS_REMAINING', `Return quantity exceeds remaining dispatched quantity for ${row.name || source.name}`);

    const remainingFree = Math.max(0, source.free - prior.free - current.free);
    const freeQty = Math.min(qty, remainingFree);
    const billableQty = Math.max(0, qty - freeQty);
    const remainingBillable = Math.max(0, source.billable - prior.billable - current.billable);
    if (billableQty > remainingBillable + 0.0001) throw err('RETURN_EXCEEDS_BILLABLE', `Return quantity exceeds remaining billable quantity for ${row.name || source.name}`);

    current.physical += qty;
    current.free += freeQty;
    current.billable += billableQty;
    allocatedThisCall.set(k, current);

    const paidRate = source.billable > 0 ? money(source.base / source.billable) : 0;
    const gstRate = source.base > 0 ? Number(((source.tax / source.base) * 100).toFixed(4)) : 0;
    return {
      productId: row.productId,
      name: row.name || source.name,
      batchNo: row.batchNo || '',
      qty,
      billableQty,
      freeQty,
      packing: Number(row.packing || source.packing || 1),
      rate: paidRate,
      gstRate,
      vendorId: source.vendorId || '',
      vendorName: source.vendorName || '',
      condition: ['saleable','damaged','expired','other'].includes(row.condition) ? row.condition : 'saleable',
      reason: row.reason || '',
    };
  });
}

async function getPriorReturnedItems(challanId, excludeReturnId = null, session = null) {
  const query = { challanId, status: 'posted' };
  if (excludeReturnId) query._id = { $ne: excludeReturnId };
  let q = SalesReturn.find(query).select('items').lean();
  if (session) q = q.session(session);
  const returns = await q;
  return returns.flatMap(ret => ret.items || []);
}

function totalsFor(items, originalChallan) {
  const baseAmount = money((items || []).reduce((sum, item) => sum + Number(item.billableQty == null ? item.qty : item.billableQty || 0) * Number(item.rate || 0), 0));
  const taxAmount = money((items || []).reduce((sum, item) => {
    const base = Number(item.billableQty == null ? item.qty : item.billableQty || 0) * Number(item.rate || 0);
    return sum + base * Number(item.gstRate || 0) / 100;
  }, 0));
  const isIgst = Number(originalChallan?.igst || 0) > 0 && Number(originalChallan?.cgst || 0) === 0 && Number(originalChallan?.sgst || 0) === 0;
  const igst = isIgst ? taxAmount : 0;
  const cgst = isIgst ? 0 : money(taxAmount / 2);
  const sgst = isIgst ? 0 : money(taxAmount - cgst);
  return { baseAmount, cgst, sgst, igst, totalAmount: money(baseAmount + taxAmount) };
}

async function assertCumulativeReturnLimit({ challan, pricedItems, excludeReturnId = null, session = null }) {
  const query = { challanId: challan._id, status: 'posted' };
  if (excludeReturnId) query._id = { $ne: excludeReturnId };
  let q = SalesReturn.find(query);
  if (session) q = q.session(session);
  const prior = await q.lean();
  const returned = new Map();
  for (const ret of prior) for (const item of ret.items || []) {
    const k = keyFor(item);
    returned.set(k, (returned.get(k) || 0) + Number(item.qty || 0));
  }
  const sold = new Map();
  for (const item of challan.items || []) {
    const k = keyFor(item);
    sold.set(k, (sold.get(k) || 0) + Number(item.qty || 0));
  }
  const current = new Map();
  for (const item of pricedItems || []) {
    const k = keyFor(item);
    current.set(k, (current.get(k) || 0) + Number(item.qty || 0));
  }
  for (const [k, qty] of current.entries()) {
    if ((returned.get(k) || 0) + qty > (sold.get(k) || 0) + 0.0001) {
      throw err('RETURN_EXCEEDS_REMAINING', 'Cumulative returned quantity exceeds the quantity dispatched on the original Challan');
    }
  }
}

async function createSalesReturn(data) {
  if (!data.challanId) throw err('ORIGINAL_CHALLAN_REQUIRED', 'A posted Sale Challan is required for a Sales Return');
  if (data.resolution === 'refund') {
    throw err('REFUND_WORKFLOW_REQUIRED', 'Cash/bank refunds must be handled through a dedicated authorized refund payment workflow; use a credit note or replacement return here');
  }
  const challan = await Challan.findOne({ _id: data.challanId, challanType: 'sale', status: 'finalized', inventoryPostingStatus: 'posted' }).lean();
  if (!challan) throw err('ORIGINAL_CHALLAN_REQUIRED', 'Original posted Sale Challan not found');
  if (!challan.customerId) throw err('CUSTOMER_REQUIRED', 'Original Challan has no linked customer');
  const customer = await Customer.findById(challan.customerId).lean();
  if (!customer) throw err('CUSTOMER_NOT_FOUND', 'Original customer not found');
  const warehouseId = data.warehouseId || challan.warehouseId;
  const warehouse = await Warehouse.findById(warehouseId).lean();
  if (!warehouse) throw err('WAREHOUSE_NOT_FOUND', 'Return warehouse not found');

  let invoice = null;
  if (data.invoiceId) invoice = await Invoice.findOne({ _id: data.invoiceId, type: 'sale', customerId: customer._id, sourceDocId: challan._id }).lean();
  else if (challan.invoiceId) invoice = await Invoice.findOne({ _id: challan.invoiceId, type: 'sale', customerId: customer._id }).lean();
  if (data.resolution === 'credit_note' && (!invoice || !invoice.isFinalized)) {
    throw err('FINALIZED_INVOICE_REQUIRED', 'A finalized invoice from the original Challan is required for a credit-note return');
  }

  const priorReturnedItems = await getPriorReturnedItems(challan._id);
  const items = deriveReturnPricing(challan.items || [], data.items || [], priorReturnedItems);
  await assertCumulativeReturnLimit({ challan, pricedItems: items });
  const totals = totalsFor(items, challan);
  const returnNo = await generateAtomicDocumentNumber('salesReturnNo_SR', 'SR-', 5);
  return SalesReturn.create({
    returnNo,
    customerId: customer._id,
    customerName: customer.company || customer.name,
    invoiceId: invoice?._id || null,
    invoiceNo: invoice?.invoiceNo || '',
    challanId: challan._id,
    challanNo: challan.challanNo,
    warehouseId: warehouse._id,
    resolution: data.resolution || 'credit_note',
    items,
    totalAmount: totals.totalAmount,
    status: 'draft',
  });
}

async function postSalesReturn(returnId, actor = {}) {
  return withTransaction(async session => {
    const ret = await SalesReturn.findById(returnId).session(session);
    if (!ret) throw err('RETURN_NOT_FOUND', 'Sales Return not found');
    if (ret.status === 'posted') return { return: ret, creditNote: ret.creditNoteId ? await CreditNote.findById(ret.creditNoteId).session(session) : null };
    if (ret.status !== 'draft') throw err('RETURN_NOT_POSTABLE', `Sales Return is ${ret.status}`);
    if (ret.resolution === 'refund') throw err('REFUND_WORKFLOW_REQUIRED', 'Refund returns require the dedicated refund-payment workflow');
    const [challan, customer, warehouse] = await Promise.all([
      Challan.findOne({ _id: ret.challanId, challanType: 'sale', status: 'finalized', inventoryPostingStatus: 'posted' }).session(session),
      Customer.findById(ret.customerId).session(session),
      Warehouse.findById(ret.warehouseId).session(session),
    ]);
    if (!challan) throw err('ORIGINAL_CHALLAN_REQUIRED', 'Original posted Challan is required');
    if (!customer || String(challan.customerId) !== String(customer._id)) throw err('CUSTOMER_MISMATCH', 'Return customer does not match original Challan');
    if (!warehouse) throw err('WAREHOUSE_NOT_FOUND', 'Return warehouse not found');

    const priorReturnedItems = await getPriorReturnedItems(challan._id, ret._id, session);
    const priced = deriveReturnPricing(challan.items || [], ret.items || [], priorReturnedItems);
    await assertCumulativeReturnLimit({ challan, pricedItems: priced, excludeReturnId: ret._id, session });
    const totals = totalsFor(priced, challan);
    ret.items = priced;
    ret.totalAmount = totals.totalAmount;

    for (let idx = 0; idx < priced.length; idx += 1) {
      const item = priced[idx];
      const product = await Product.findById(item.productId).session(session);
      if (!product) throw err('PRODUCT_NOT_FOUND', `Product not found: ${item.name}`);
      const qcStatus = item.condition === 'saleable' ? 'approved' : 'rejected';
      const slot = {
        warehouseId: warehouse._id,
        productId: product._id,
        vendorId: item.vendorId || '',
        packing: item.packing || 1,
        batchNo: item.batchNo || '',
        qcStatus,
      };
      let entry = await InventoryEntry.findOne(slot).session(session);
      if (!entry) {
        entry = new InventoryEntry({
          ...slot,
          warehouseName: warehouse.name,
          productType: product.productType || '', size: product.size || '', colour: product.colour || '',
          shape: product.shape || '', weight: product.weight || '', hsnCode: product.hsnCode || '',
          vendorName: item.vendorName || '', qtyBoxes: 0,
        });
      }
      entry.qtyBoxes = Number(entry.qtyBoxes || 0) + Number(item.qty || 0);
      await entry.save({ session });
      product.stockLevel = Number(product.stockLevel || 0) + Number(item.qty || 0);
      await product.save({ session });
      await StockLedger.create([{
        productId: product._id, warehouseId: warehouse._id, warehouseName: warehouse.name,
        type: 'IN', qtyBoxes: Number(item.qty), balanceBoxes: entry.qtyBoxes,
        reference: ret.returnNo, movementKey: `sales-return:${ret._id}:${idx}:post`,
        note: `Sales return ${ret.returnNo} (${item.condition}/${qcStatus})`, createdBy: actor.name || 'System',
        packing: item.packing || 1, batchNo: item.batchNo || '',
      }], { session });
    }

    let creditNote = null;
    if (ret.resolution === 'credit_note' && totals.totalAmount > 0) {
      const invoice = await Invoice.findOne({ _id: ret.invoiceId, type: 'sale', isFinalized: true, customerId: customer._id }).session(session);
      if (!invoice) throw err('FINALIZED_INVOICE_REQUIRED', 'Finalized original sale invoice is required for credit note');
      const noteNo = await generateAtomicDocumentNumber('creditNoteNo_CN', 'CN-', 5);
      [creditNote] = await CreditNote.create([{
        noteNo, type: 'credit_note', invoiceId: invoice._id, invoiceNo: invoice.invoiceNo,
        partyType: 'Customer', partyId: customer._id, partyName: customer.company || customer.name,
        reason: `Sales return ${ret.returnNo}`, baseAmount: totals.baseAmount,
        cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst, totalAmount: totals.totalAmount,
        status: 'finalized',
        items: priced.map(item => ({
          productId: item.productId, name: item.name, qty: item.qty, boxes: item.qty,
          billableQty: item.billableQty || 0, freeQty: item.freeQty || 0,
          packing: item.packing, rate: item.rate, gstRate: item.gstRate,
          amount: money(Number(item.billableQty || 0) * item.rate), batchNo: item.batchNo,
        })),
      }], { session });
      const balanceField = invoice.mode === 'cash' ? 'cashBalance' : 'regularBalance';
      // A customer credit may legitimately exceed current receivables (for example after
      // the original invoice was already paid). Preserve that credit as a negative balance.
      customer[balanceField] = money(Number(customer[balanceField] || 0) - totals.totalAmount);
      await customer.save({ session });
      ret.creditNoteId = creditNote._id;
    }

    ret.status = 'posted';
    ret.postedAt = new Date();
    ret.postedBy = actor.id || null;
    await ret.save({ session });
    return { return: ret, creditNote };
  });
}

async function reverseSalesReturn(returnId, actor = {}, reason = '') {
  return withTransaction(async session => {
    const ret = await SalesReturn.findById(returnId).session(session);
    if (!ret) throw err('RETURN_NOT_FOUND', 'Sales Return not found');
    if (ret.status === 'reversed') return ret;
    if (ret.status !== 'posted') throw err('RETURN_NOT_REVERSIBLE', 'Only a posted Sales Return can be reversed');
    const [customer, warehouse] = await Promise.all([
      Customer.findById(ret.customerId).session(session),
      Warehouse.findById(ret.warehouseId).session(session),
    ]);
    if (!customer || !warehouse) throw err('RETURN_DEPENDENCY_MISSING', 'Return customer or warehouse is missing');

    for (let idx = 0; idx < (ret.items || []).length; idx += 1) {
      const item = ret.items[idx];
      const qcStatus = item.condition === 'saleable' ? 'approved' : 'rejected';
      const entry = await InventoryEntry.findOne({
        warehouseId: warehouse._id, productId: item.productId, vendorId: item.vendorId || '',
        packing: item.packing || 1, batchNo: item.batchNo || '', qcStatus,
      }).session(session);
      if (!entry || Number(entry.qtyBoxes || 0) < Number(item.qty || 0)) throw err('RETURN_REVERSAL_STOCK_SHORT', `Cannot reverse ${item.name}; returned stock is no longer available in its ${qcStatus} bucket`);
      entry.qtyBoxes = Number(entry.qtyBoxes || 0) - Number(item.qty || 0);
      await entry.save({ session });
      const product = await Product.findById(item.productId).session(session);
      if (!product || Number(product.stockLevel || 0) < Number(item.qty || 0)) throw err('RETURN_REVERSAL_AGGREGATE_SHORT', `Cannot reverse ${item.name}; aggregate stock is insufficient`);
      product.stockLevel = Number(product.stockLevel || 0) - Number(item.qty || 0);
      await product.save({ session });
      await StockLedger.create([{
        productId: item.productId, warehouseId: warehouse._id, warehouseName: warehouse.name,
        type: 'OUT', qtyBoxes: -Number(item.qty), balanceBoxes: entry.qtyBoxes,
        reference: ret.returnNo, movementKey: `sales-return:${ret._id}:${idx}:reverse`,
        note: `Reversal of sales return ${ret.returnNo}`, createdBy: actor.name || 'System', packing: item.packing || 1, batchNo: item.batchNo || '',
      }], { session });
    }

    if (ret.creditNoteId) {
      const credit = await CreditNote.findById(ret.creditNoteId).session(session);
      if (credit && credit.status === 'finalized') {
        const invoice = ret.invoiceId ? await Invoice.findById(ret.invoiceId).session(session) : null;
        const balanceField = invoice?.mode === 'cash' ? 'cashBalance' : 'regularBalance';
        customer[balanceField] = money(Number(customer[balanceField] || 0) + Number(credit.totalAmount || 0));
        await customer.save({ session });
        credit.status = 'cancelled';
        await credit.save({ session });
      }
    }
    ret.status = 'reversed';
    ret.reversedAt = new Date();
    ret.reversedBy = actor.id || null;
    ret.reversalReason = String(reason || '').slice(0, 500);
    await ret.save({ session });
    return ret;
  });
}

module.exports = { createSalesReturn, postSalesReturn, reverseSalesReturn, deriveReturnPricing, assertCumulativeReturnLimit };
