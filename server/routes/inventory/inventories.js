const express = require('express');
const Inventory = require('../../models/Inventory');
const Product = require('../../models/Product');
const Warehouse = require('../../models/Warehouse');
const Customer = require('../../models/Customer');
const InventoryEntry = require('../../models/InventoryEntry');
const StockLedger = require('../../models/StockLedger');
const Invoice = require('../../models/Invoice');
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
    const rolePerms = await getRolePermissions(req.user.role);
    if (!rolePerms.includes('inventory:viewValue') && !rolePerms.includes('*')) {
      query = query.select('-val');
    }

    const items = await query.sort({ createdAt: -1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/inventories/:id — Update qty, value, and sync to product stock level
router.put('/:id', authorize('inventory:edit'), async (req, res) => {
  try {
    const { qty } = req.body;
    if (qty === undefined) {
      return res.status(400).json({ error: 'Quantity (qty) is required' });
    }

    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });

    item.qty = qty;

    const product = await Product.findOne({ sku: item.itemSku });
    if (product) {
      item.val = qty * product.price;
      product.stockLevel = qty;
      await product.save();
    } else {
      item.val = qty * 100;
    }

    await item.save();
    if (req.io) {
      req.io.emit('inventory_updated', { type: 'level_updated', id: item._id });
    }
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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

// POST /api/inventories/consignment/dispatch — Dispatch stock to a dealer's consignment location
router.post('/consignment/dispatch', authorize('inventory:create'), validate(schemas.consignmentDispatchSchema), async (req, res) => {
  try {
    const { sourceWarehouseId, customerId, dealerName, items, notes } = req.body;

    const sourceWh = await Warehouse.findById(sourceWarehouseId);
    if (!sourceWh) return res.status(404).json({ error: 'Source warehouse not found' });

    const dealerWh = await getOrCreateDealerWarehouse(customerId, dealerName);

    for (const item of items) {
      const { productId, qtyBoxes, packing = 1, batchNo = '', vendorId = '' } = item;
      const prod = await Product.findById(productId);
      if (!prod) continue;

      // 1. Deduct from Source Warehouse InventoryEntry
      const sourceQuery = { warehouseId: sourceWh._id, productId, packing, vendorId };
      if (batchNo) sourceQuery.batchNo = batchNo;
      const sourceEntry = await InventoryEntry.findOne(sourceQuery);

      if (!sourceEntry || sourceEntry.qtyBoxes < qtyBoxes) {
        return res.status(400).json({ error: `Insufficient stock in source warehouse for product "${prod.name}". Available: ${sourceEntry ? sourceEntry.qtyBoxes : 0}, Required: ${qtyBoxes}` });
      }

      sourceEntry.qtyBoxes -= qtyBoxes;
      await sourceEntry.save();

      // 2. Increment Stock in Dealer Consignment Warehouse
      const dealerQuery = { warehouseId: dealerWh._id, productId, packing, vendorId };
      if (batchNo) dealerQuery.batchNo = batchNo;

      let dealerEntry = await InventoryEntry.findOne(dealerQuery);
      if (dealerEntry) {
        dealerEntry.qtyBoxes += qtyBoxes;
      } else {
        dealerEntry = new InventoryEntry({
          warehouseId: dealerWh._id,
          warehouseName: dealerWh.name,
          productId: prod._id,
          productType: prod.productType || '',
          size: prod.size || '',
          colour: prod.colour || '',
          shape: prod.shape || '',
          weight: prod.weight || '',
          hsnCode: prod.hsnCode || '',
          vendorId,
          qtyBoxes,
          packing,
          batchNo
        });
      }
      await dealerEntry.save();

      // 3. Record Stock Ledger Movement
      await StockLedger.create({
        productId: prod._id,
        warehouseId: sourceWh._id,
        warehouseName: sourceWh.name,
        type: 'TRANSFER_OUT',
        qtyBoxes: -qtyBoxes,
        balanceBoxes: sourceEntry.qtyBoxes,
        reference: `Consignment Transfer to ${dealerWh.name}`,
        note: notes || `Dispatched on consignment to dealer ${dealerWh.dealerName}`,
        createdBy: req.user ? req.user.name : 'System',
        packing,
        batchNo
      });
    }

    if (req.io) {
      req.io.emit('inventory_updated', { type: 'consignment_dispatched', dealerWarehouseId: dealerWh._id });
    }
    res.status(201).json({
      message: 'Consignment stock dispatched successfully',
      dealerWarehouse: dealerWh
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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

// POST /api/inventories/consignment/settle — 1-Click Dealer Settlement (Returned -> Main WH, Sold -> Invoice)
router.post('/consignment/settle', authorize('inventory:edit'), validate(schemas.consignmentSettleSchema), async (req, res) => {
  try {
    const { dealerWarehouseId, destinationWarehouseId, soldItems = [], returnedItems = [], notes } = req.body;

    const dealerWh = await Warehouse.findById(dealerWarehouseId);
    if (!dealerWh || dealerWh.type !== 'dealer_consignment') {
      return res.status(404).json({ error: 'Dealer consignment stock location not found' });
    }

    const destWh = await Warehouse.findById(destinationWarehouseId);
    if (!destWh) return res.status(404).json({ error: 'Destination main warehouse not found' });

    const customer = await Customer.findById(dealerWh.customerId);

    // 1. Process Returned Items (Transfer Back: Dealer WH -> Main WH)
    for (const ret of returnedItems) {
      const { productId, qtyBoxes, packing = 1, batchNo = '' } = ret;

      const dealerQuery = { warehouseId: dealerWh._id, productId, packing };
      if (batchNo) dealerQuery.batchNo = batchNo;
      const dealerEntry = await InventoryEntry.findOne(dealerQuery);
      if (dealerEntry) {
        dealerEntry.qtyBoxes = Math.max(0, dealerEntry.qtyBoxes - qtyBoxes);
        await dealerEntry.save();
      }

      const destQuery = { warehouseId: destWh._id, productId, packing };
      if (batchNo) destQuery.batchNo = batchNo;
      let destEntry = await InventoryEntry.findOne(destQuery);
      if (destEntry) {
        destEntry.qtyBoxes += qtyBoxes;
      } else {
        const prod = await Product.findById(productId);
        destEntry = new InventoryEntry({
          warehouseId: destWh._id,
          warehouseName: destWh.name,
          productId,
          qtyBoxes,
          packing,
          batchNo,
          productType: prod ? prod.productType : '',
          size: prod ? prod.size : '',
          hsnCode: prod ? prod.hsnCode : ''
        });
      }
      await destEntry.save();

      await StockLedger.create({
        productId,
        warehouseId: destWh._id,
        warehouseName: destWh.name,
        type: 'TRANSFER_IN',
        qtyBoxes,
        balanceBoxes: destEntry.qtyBoxes,
        reference: `Consignment Return from ${dealerWh.name}`,
        note: `Returned from dealer consignment stock`,
        createdBy: req.user ? req.user.name : 'System',
        packing,
        batchNo
      });
    }

    // 2. Process Sold Items (Deduct Dealer WH & Generate GST Invoice)
    let generatedInvoice = null;
    if (soldItems.length > 0) {
      const invoiceItems = [];
      let totalBase = 0;
      let totalTax = 0;

      const isIntraState = customer ? (customer.gstin.startsWith('09') || customer.state === 'Maharashtra') : true;

      for (const item of soldItems) {
        const { productId, qtyBoxes, rate, packing = 1, batchNo = '', hsnCode = '', gstRate = 0 } = item;

        const dealerQuery = { warehouseId: dealerWh._id, productId, packing };
        if (batchNo) dealerQuery.batchNo = batchNo;
        const dealerEntry = await InventoryEntry.findOne(dealerQuery);
        if (dealerEntry) {
          dealerEntry.qtyBoxes = Math.max(0, dealerEntry.qtyBoxes - qtyBoxes);
          await dealerEntry.save();
        }

        const prod = await Product.findById(productId);
        const itemBase = qtyBoxes * rate * packing;
        totalBase += itemBase;
        const tax = (itemBase * gstRate) / 100;
        totalTax += tax;

        invoiceItems.push({
          productId,
          name: prod ? prod.name : 'Consignment Item',
          qty: qtyBoxes,
          boxes: qtyBoxes,
          packing,
          rate,
          hsnCode: hsnCode || (prod ? prod.hsnCode : ''),
          gstRate,
          batchNo
        });
      }

      const cgst = isIntraState ? totalTax / 2 : 0;
      const sgst = isIntraState ? totalTax / 2 : 0;
      const igst = !isIntraState ? totalTax : 0;
      const rawTotal = totalBase + cgst + sgst + igst;
      const nettTotal = Math.round(rawTotal);
      const roundOff = nettTotal - rawTotal;

      const SystemSettings = require('../../models/SystemSettings');
      const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
      const pfx = settings.invoicePrefix || 'INV';
      const count = await Invoice.countDocuments();
      const invoiceNo = `${pfx}-${(count + 1).toString().padStart(4, '0')}`;

      generatedInvoice = await Invoice.create({
        invoiceNo,
        customerName: customer ? customer.name : dealerWh.dealerName,
        partyAddress: customer ? (customer.billingAddress?.street || '') : '',
        shippingAddress: customer ? (customer.shippingAddress?.street || '') : '',
        date: new Date(),
        amount: nettTotal,
        status: 'unpaid',
        mode: 'regular',
        baseAmount: totalBase,
        cgst,
        sgst,
        igst,
        roundOff,
        stateOfSupply: customer ? customer.state : 'Maharashtra',
        gstin: customer ? customer.gstin : '',
        warehouseId: dealerWh._id,
        warehouseName: dealerWh.name,
        deductInventory: false,
        isFinalized: true,
        type: 'sale',
        saleType: 'b2b',
        reference: `Dealer Consignment Settlement - ${dealerWh.dealerName}`,
        items: invoiceItems
      });

      if (customer) {
        customer.regularBalance = (customer.regularBalance || 0) + nettTotal;
        await customer.save();
      }
    }

    if (req.io) {
      req.io.emit('inventory_updated', { type: 'consignment_settled', dealerWarehouseId });
    }

    res.json({
      message: 'Dealer consignment stock settled successfully',
      soldItemsCount: soldItems.length,
      returnedItemsCount: returnedItems.length,
      invoice: generatedInvoice
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
    const [rawMaterials, products] = await Promise.all([
      RawMaterial.find({ minReorder: { $gt: 0 } }).lean(),
      Product.find({ minReorderLevel: { $gt: 0 } }).lean()
    ]);

    const lowStockRawMaterials = rawMaterials.filter(rm => (rm.stockLevel || 0) <= rm.minReorder);
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

module.exports = router;
