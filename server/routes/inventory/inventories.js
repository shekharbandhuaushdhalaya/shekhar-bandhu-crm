const express = require('express');
const Inventory = require('../../models/Inventory');
const Product = require('../../models/Product');
const Warehouse = require('../../models/Warehouse');
const Customer = require('../../models/Customer');
const InventoryEntry = require('../../models/InventoryEntry');
const Challan = require('../../models/Challan');
const { postChallanInventory } = require('../../services/challanInventoryService');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');
const { resolvePrice } = require('../../services/salesPricingService');
const { createSalesOrder, createDraftFulfillment } = require('../../services/salesOrderService');
const idempotency = require('../../middleware/idempotency');
const { authorize, getRolePermissions } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/inventories — List warehouse levels with search
router.get('/', authorize('inventory:view'), async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { itemSku: { $regex: search, $options: 'i' } },
        { warehouse: { $regex: search, $options: 'i' } },
      ];
    }

    let query = Inventory.find(filter);
    const rolePerms = await getRolePermissions(req.user.firmRole || req.user.role, req.user.firmId || null);
    if (!rolePerms.includes('inventory:viewValue') && !rolePerms.includes('*')) {
      query = query.select('-val');
    }

    const items = await query.sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Legacy aggregate Inventory records are read-only. Physical corrections must use
// InventoryEntry stocktake/write-off workflows so StockLedger stays authoritative.
router.put('/:id', authorize('inventory:edit'), async (_req, res) => {
  res.status(410).json({ error: 'Direct inventory-level editing is retired. Use Inventory Entries / stocktake adjustments.', code: 'LEGACY_INVENTORY_EDIT_RETIRED' });
});

// Helper: Ensure a dealer consignment location warehouse exists for a customer
async function getOrCreateDealerWarehouse(customerId, dealerName) {
  let warehouse = await Warehouse.findOne({ customerId, type: 'dealer_consignment' });
  if (!warehouse) {
    const cust = await Customer.findById(customerId);
    const name = dealerName || (cust ? (cust.company || cust.name) : 'Dealer Consignment');
    warehouse = await Warehouse.create({
      name: `Dealer Stock - ${name}`,
      type: 'dealer_consignment',
      customerId,
      dealerName: name,
      addressLine1: cust ? (cust.shippingAddress?.street || cust.billingAddress?.street || '') : '',
      city: cust ? (cust.shippingAddress?.city || cust.billingAddress?.city || '') : '',
      state: cust ? (cust.state || 'Maharashtra') : 'Maharashtra',
      contactPerson: cust ? (cust.contactPerson || cust.name) : name,
      phone: cust ? cust.phone : ''
    });
  }
  return warehouse;
}

// POST /api/inventories/consignment/dispatch — company-owned stock moves by Transfer Challan.
router.post('/consignment/dispatch', authorize('inventory:create'), validate(schemas.consignmentDispatchSchema), async (req, res) => {
  try {
    const { sourceWarehouseId, customerId, dealerName, items, notes } = req.body;
    const [sourceWh, customer] = await Promise.all([Warehouse.findById(sourceWarehouseId), Customer.findById(customerId)]);
    if (!sourceWh) return res.status(404).json({ error: 'Source warehouse not found' });
    if (!customer) return res.status(404).json({ error: 'Dealer customer not found' });
    const dealerWh = await getOrCreateDealerWarehouse(customerId, dealerName);
    const challanNo = await generateAtomicDocumentNumber('challanNo_transfer', 'TR-', 6);
    const physicalItems = [];
    for (const item of items || []) {
      const product = await Product.findById(item.productId);
      if (!product) return res.status(404).json({ error: `Product not found: ${item.productId}` });
      physicalItems.push({ productId: product._id, name: product.name, qty: Number(item.qtyBoxes || 0), billableQty: 0, freeQty: 0, packing: Number(item.packing || 1), batchNo: item.batchNo || '', vendorId: item.vendorId || '', rate: 0, gstRate: 0, hsnCode: product.hsnCode || '' });
    }
    const challan = await Challan.create({
      challanNo, challanType: 'transfer', date: new Date(),
      partyName: customer.company || customer.name, customerId: customer._id,
      partyAddress: customer.billingAddress?.street || '', shippingAddress: customer.shippingAddress?.street || '', partyCity: customer.city || '', gstin: customer.gstin || '',
      warehouseId: sourceWh._id, warehouseName: sourceWh.name,
      destinationWarehouseId: dealerWh._id, destinationWarehouseName: dealerWh.name,
      items: physicalItems, status: 'draft', notes: notes || `Consignment transfer to ${dealerWh.name}`,
    });
    const posted = await postChallanInventory(challan, { userId: req.user?.id, createdBy: req.user?.name || 'System' });
    if (req.io) { req.io.emit('challan_updated', { type: 'finalized', id: posted._id }); req.io.emit('inventory_updated', { type: 'consignment_transfer', challanId: posted._id }); }
    res.status(201).json({ message: 'Consignment stock transferred by posted Transfer Challan', dealerWarehouse: dealerWh, challan: posted });
  } catch (err) { res.status(400).json({ error: err.message, code: err.code || 'CONSIGNMENT_DISPATCH_FAILED' }); }
});

// GET /api/inventories/consignment/dealer-stock — View live unsold stock sitting at each dealer location
router.get('/consignment/dealer-stock', authorize('inventory:view'), async (req, res) => {
  try {
    const { customerId } = req.query;
    const filter = { type: 'dealer_consignment' };
    if (customerId) filter.customerId = customerId;

    const dealerWarehouses = await Warehouse.find(filter).lean();
    const dealerWhIds = dealerWarehouses.map(w => w._id);

    const entries = await InventoryEntry.find({ warehouseId: { $in: dealerWhIds }, qtyBoxes: { $gt: 0 } })
      .populate('productId', 'name sku price mrp category unit')
      .sort({ warehouseName: 1 })
      .lean();

    const reportMap = {};
    dealerWarehouses.forEach(w => {
      reportMap[w._id.toString()] = {
        dealerWarehouseId: w._id,
        dealerName: w.dealerName || w.name,
        customerId: w.customerId,
        totalUnsoldBoxes: 0,
        totalUnsoldValue: 0,
        items: []
      };
    });

    entries.forEach(e => {
      const key = e.warehouseId.toString();
      if (reportMap[key]) {
        const itemVal = (e.qtyBoxes || 0) * (e.productId ? (e.productId.price || 0) : 0);
        reportMap[key].totalUnsoldBoxes += (e.qtyBoxes || 0);
        reportMap[key].totalUnsoldValue += itemVal;
        reportMap[key].items.push({
          inventoryEntryId: e._id,
          productId: e.productId ? e.productId._id : null,
          productName: e.productId ? e.productId.name : 'Unknown Product',
          sku: e.productId ? e.productId.sku : '',
          batchNo: e.batchNo || '',
          qtyBoxes: e.qtyBoxes,
          packing: e.packing || 1,
          unitPrice: e.productId ? e.productId.price : 0,
          estimatedValue: itemVal
        });
      }
    });

    res.json(Object.values(reportMap));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventories/consignment/settle — returned goods use Transfer Challan; sold goods use Sale Challan.
router.post('/consignment/settle', idempotency, authorize('inventory:edit', 'order:create', 'challan:create'), validate(schemas.consignmentSettleSchema), async (req, res) => {
  try {
    const { dealerWarehouseId, destinationWarehouseId, soldItems = [], returnedItems = [], notes } = req.body;
    if (soldItems.length && returnedItems.length) {
      return res.status(400).json({
        error: 'Post sold and returned consignment quantities as separate settlement requests so each physical workflow is atomic and retryable.',
        code: 'SPLIT_CONSIGNMENT_SETTLEMENT_REQUIRED',
      });
    }
    const dealerWh = await Warehouse.findById(dealerWarehouseId);
    if (!dealerWh || dealerWh.type !== 'dealer_consignment') return res.status(404).json({ error: 'Dealer consignment stock location not found' });
    const customer = await Customer.findById(dealerWh.customerId);
    if (!customer) return res.status(409).json({ error: 'Dealer warehouse is not linked to an active customer', code: 'CUSTOMER_REQUIRED' });

    let returnChallan = null;
    if (returnedItems.length) {
      const destWh = await Warehouse.findById(destinationWarehouseId);
      if (!destWh) return res.status(404).json({ error: 'Destination main warehouse not found' });
      const items = [];
      for (const row of returnedItems) {
        const product = await Product.findById(row.productId);
        if (!product) return res.status(404).json({ error: `Product not found: ${row.productId}` });
        items.push({ productId: product._id, name: product.name, qty: Number(row.qtyBoxes || 0), billableQty: 0, freeQty: 0, packing: Number(row.packing || 1), batchNo: row.batchNo || '', rate: 0, gstRate: 0, hsnCode: product.hsnCode || '' });
      }
      const challanNo = await generateAtomicDocumentNumber('challanNo_transfer', 'TR-', 6);
      const draft = await Challan.create({ challanNo, challanType: 'transfer', date: new Date(), partyName: customer.company || customer.name, customerId: customer._id, warehouseId: dealerWh._id, warehouseName: dealerWh.name, destinationWarehouseId: destWh._id, destinationWarehouseName: destWh.name, items, status: 'draft', notes: notes || 'Consignment return to main warehouse' });
      returnChallan = await postChallanInventory(draft, { userId: req.user?.id, createdBy: req.user?.name || 'System' });
    }

    let saleChallan = null;
    if (soldItems.length) {
      const orderItems = [];
      const fulfillmentItems = [];
      let baseAmount = 0, taxAmount = 0;
      for (const row of soldItems) {
        const product = await Product.findById(row.productId);
        if (!product) return res.status(404).json({ error: `Product not found: ${row.productId}` });
        const qty = Number(row.qtyBoxes || 0);
        const pricing = await resolvePrice(customer, product, qty);
        const rate = Number(pricing.rate || 0);
        const gstRate = Number(row.gstRate ?? product.gstRate ?? 0);
        baseAmount += qty * rate;
        taxAmount += qty * rate * gstRate / 100;
        orderItems.push({ productId: product._id, name: product.name, qty, price: rate, freeQty: 0, pricingSource: 'consignment_settlement' });
        fulfillmentItems.push({ productId: product._id, qty, packing: Number(row.packing || 1), batchNo: row.batchNo || undefined, vendorId: row.vendorId || undefined });
      }
      const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
      const orderResult = await createSalesOrder({
        customerId: customer._id,
        clientOrderRef: idempotencyKey ? `CONSIGNMENT:${dealerWh._id}:${idempotencyKey}` : '',
        orderChannel: 'crm',
        sourceType: 'direct',
        warehouseId: dealerWh._id,
        shippingAddress: customer.shippingAddress?.street || customer.billingAddress?.street || '-',
        billingAddress: customer.billingAddress?.street || '',
        notes: notes || `Consignment sale settlement from ${dealerWh.name}`,
        items: orderItems,
      }, { customer, fixedPricing: true, notePrefix: 'Consignment settlement. ' });
      const order = orderResult.order;
      if (order.approvalRequired && order.approvalStatus !== 'approved') {
        return res.status(202).json({
          message: `Sales Order ${order.orderNo} was created and requires approval before the Sale Challan can move consignment stock.`,
          order,
          saleChallan: null,
          returnChallan: null,
          invoice: null,
        });
      }

      const draft = await createDraftFulfillment(order, { warehouseId: dealerWh._id, items: fulfillmentItems });
      const isIntra = String(customer.gstin || '').startsWith('09') || ['uttar pradesh','up'].includes(String(customer.state || '').toLowerCase());
      draft.partyAddress = customer.billingAddress?.street || '';
      draft.partyCity = customer.city || '';
      draft.gstin = customer.gstin || '';
      draft.stateOfSupply = customer.state || '';
      draft.baseAmount = baseAmount;
      draft.cgst = isIntra ? taxAmount / 2 : 0;
      draft.sgst = isIntra ? taxAmount / 2 : 0;
      draft.igst = isIntra ? 0 : taxAmount;
      draft.nettTotal = baseAmount + taxAmount;
      draft.notes = notes || `Consignment sale settlement from ${dealerWh.name}`;
      await draft.save();
      saleChallan = await postChallanInventory(draft, { userId: req.user?.id, createdBy: req.user?.name || 'System' });
    }

    if (req.io) req.io.emit('inventory_updated', { type: 'consignment_settled', dealerWarehouseId, saleChallanId: saleChallan?._id, returnChallanId: returnChallan?._id });
    res.json({
      message: saleChallan ? 'Consignment settled. Sold stock is now a posted Sale Challan; create/finalize its invoice from the Sales Workspace.' : 'Consignment return posted.',
      soldItemsCount: soldItems.length, returnedItemsCount: returnedItems.length, saleChallan, returnChallan, salesOrderId: saleChallan?.salesOrderId || null, invoice: null,
    });
  } catch (err) { res.status(400).json({ error: err.message, code: err.code || 'CONSIGNMENT_SETTLEMENT_FAILED' }); }
});

// GET /api/inventories/alerts/expiry — Fetch expiring raw material & finished goods batches (30/60/90 days)
router.get('/alerts/expiry', authorize('inventory:view'), async (req, res) => {
  try {
    const RawMaterialEntry = require('../../models/RawMaterialEntry');
    const now = new Date();
    const d90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const expiringBatches = await RawMaterialEntry.find({
      qty: { $gt: 0 },
      expiryDate: { $ne: null, $lte: d90 }
    }).populate('rawMaterialId', 'name sku unit category').sort({ expiryDate: 1 }).lean();

    const categorized = {
      days30: [],
      days60: [],
      days90: [],
      expired: []
    };

    expiringBatches.forEach(b => {
      const expDate = new Date(b.expiryDate);
      const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
      const item = { ...b, daysLeft };

      if (daysLeft <= 0) categorized.expired.push(item);
      else if (daysLeft <= 30) categorized.days30.push(item);
      else if (daysLeft <= 60) categorized.days60.push(item);
      else categorized.days90.push(item);
    });

    res.json(categorized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventories/alerts/reorder — Fetch raw materials & finished goods below minimum reorder point
router.get('/alerts/reorder', authorize('inventory:view'), async (req, res) => {
  try {
    const RawMaterial = require('../../models/RawMaterial');
    const RawMaterialEntry = require('../../models/RawMaterialEntry');
    const [rawMaterials, products, rawStock] = await Promise.all([
      RawMaterial.find({ minReorder: { $gt: 0 } }).lean(),
      Product.find({ minReorderLevel: { $gt: 0 } }).lean(),
      RawMaterialEntry.aggregate([
        { $match: { qcStatus: 'approved', qty: { $gt: 0 } } },
        { $group: { _id: '$rawMaterialId', stockLevel: { $sum: '$qty' } } }
      ])
    ]);
    const rawStockMap = new Map(rawStock.map((row) => [String(row._id), Number(row.stockLevel || 0)]));
    const lowStockRawMaterials = rawMaterials
      .map((rm) => ({ ...rm, stockLevel: rawStockMap.get(String(rm._id)) || 0 }))
      .filter((rm) => rm.stockLevel <= Number(rm.minReorder || 0));
    const lowStockProducts = products.filter(p => (p.stockLevel || 0) <= (p.minReorderLevel || 0));

    res.json({
      rawMaterials: lowStockRawMaterials,
      products: lowStockProducts,
      totalAlerts: lowStockRawMaterials.length + lowStockProducts.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventories/reports/expiry-valuation — Batch-wise expiry-risk valuation report
router.get('/reports/expiry-valuation', authorize('inventory:view'), async (req, res) => {
  try {
    const entries = await InventoryEntry.find({ qtyBoxes: { $gt: 0 } })
      .populate('productId', 'name sku price')
      .lean();

    const now = new Date();
    const brackets = {
      critical_0_3m: { name: 'Critical Risk (0-3 Months)', count: 0, totalValuation: 0, items: [] },
      high_3_6m: { name: 'High Risk (3-6 Months)', count: 0, totalValuation: 0, items: [] },
      medium_6_12m: { name: 'Medium Risk (6-12 Months)', count: 0, totalValuation: 0, items: [] },
      safe_12m_plus: { name: 'Safe (12+ Months)', count: 0, totalValuation: 0, items: [] }
    };

    entries.forEach(e => {
      if (!e.expiryDate) return;
      const exp = new Date(e.expiryDate);
      const monthsLeft = (exp.getFullYear() - now.getFullYear()) * 12 + (exp.getMonth() - now.getMonth());
      const rate = e.productId ? (e.productId.price || 100) : 100;
      const valuation = (e.qtyBoxes || 0) * rate;

      let key = 'safe_12m_plus';
      if (monthsLeft <= 3) key = 'critical_0_3m';
      else if (monthsLeft <= 6) key = 'high_3_6m';
      else if (monthsLeft <= 12) key = 'medium_6_12m';

      brackets[key].count++;
      brackets[key].totalValuation += valuation;
      brackets[key].items.push({
        _id: e._id,
        batchNo: e.batchNo,
        productName: e.productId ? e.productId.name : 'Finished Good',
        qtyBoxes: e.qtyBoxes,
        expiryDate: e.expiryDate,
        monthsLeft: Math.max(0, monthsLeft),
        valuation: Number(valuation.toFixed(2))
      });
    });

    res.json(brackets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventories/reports/inventory-aging — Inventory aging report (active/slow-moving/dead stock)
router.get('/reports/inventory-aging', authorize('inventory:view'), async (req, res) => {
  try {
    const entries = await InventoryEntry.find({ qtyBoxes: { $gt: 0 } })
      .populate('productId', 'name sku price')
      .lean();

    const now = new Date();
    const categories = {
      active_0_90d: { name: 'Active Stock (<90 Days)', totalValuation: 0, items: [] },
      slow_moving_90_180d: { name: 'Slow-Moving Stock (90-180 Days)', totalValuation: 0, items: [] },
      dead_stock_180d_plus: { name: 'Dead Stock (>180 Days)', totalValuation: 0, items: [] }
    };

    entries.forEach(e => {
      const createdDate = new Date(e.mfgDate || e.createdAt || Date.now());
      const daysOld = Math.ceil((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      const rate = e.productId ? (e.productId.price || 100) : 100;
      const valuation = (e.qtyBoxes || 0) * rate;

      let key = 'active_0_90d';
      if (daysOld > 180) key = 'dead_stock_180d_plus';
      else if (daysOld > 90) key = 'slow_moving_90_180d';

      categories[key].totalValuation += valuation;
      categories[key].items.push({
        _id: e._id,
        batchNo: e.batchNo,
        productName: e.productId ? e.productId.name : 'Item',
        qtyBoxes: e.qtyBoxes,
        daysOld,
        valuation: Number(valuation.toFixed(2))
      });
    });

    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
