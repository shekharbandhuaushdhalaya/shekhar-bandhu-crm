const express = require('express');
const router = express.Router();
const InventoryEntry = require('../../models/InventoryEntry');
const Product = require('../../models/Product');
const Warehouse = require('../../models/Warehouse');
const StockLedger = require('../../models/StockLedger');
const Customer = require('../../models/Customer');
const Vendor = require('../../models/Vendor');
const { authorize } = require('../../middleware/authorize');

// GET /api/inventory/compliance/near-expiry — Get batches expiring soon (default 90 days)
router.get('/near-expiry', async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 90;
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + days);

    const entries = await InventoryEntry.find({
      qtyBoxes: { $gt: 0 },
      expiryDate: { $ne: null, $lte: thresholdDate }
    }).sort({ expiryDate: 1 }).lean();

    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/compliance/license-alerts — Get customers/vendors with expiring licenses (default 60 days)
router.get('/license-alerts', async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 60;
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + days);

    // Fetch customers with expiring drug licenses
    const customers = await Customer.find({
      drugLicenseExpiry: { $ne: null, $lte: thresholdDate }
    }).select('name company email phone drugLicenseNo drugLicenseExpiry').lean();

    // Fetch vendors with expiring manufacturing licenses
    const vendors = await Vendor.find({
      manufacturingLicenseExpiry: { $ne: null, $lte: thresholdDate }
    }).select('name company email phone manufacturingLicenseNo manufacturingLicenseExpiry').lean();

    res.json({
      customers: customers.map(c => ({
        id: c._id,
        name: c.name,
        company: c.company,
        type: 'Customer',
        licenseNo: c.drugLicenseNo,
        expiryDate: c.drugLicenseExpiry,
      })),
      vendors: vendors.map(v => ({
        id: v._id,
        name: v.name,
        company: v.company,
        type: 'Vendor',
        licenseNo: v.manufacturingLicenseNo,
        expiryDate: v.manufacturingLicenseExpiry,
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/inventory/compliance/write-off — Write off expired or damaged stock
router.post('/write-off', async (req, res) => {
  try {
    const { productId, warehouseId, qtyBoxes, packing, batchNo, reason } = req.body;
    const qty = parseFloat(qtyBoxes);

    if (!productId || !warehouseId || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'productId, warehouseId, and positive qtyBoxes are required' });
    }

    const [product, warehouse] = await Promise.all([
      Product.findById(productId),
      Warehouse.findById(warehouseId)
    ]);

    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (!warehouse) return res.status(404).json({ error: 'Warehouse not found' });

    // Find exact inventory slot
    const entry = await InventoryEntry.findOne({
      productId,
      warehouseId,
      packing: parseInt(packing, 10) || 1,
      batchNo: (batchNo || '').trim()
    });

    if (!entry || entry.qtyBoxes < qty) {
      return res.status(400).json({ error: 'Insufficient stock in the specified batch slot' });
    }

    // Deduct stock
    entry.qtyBoxes = Math.max(0, entry.qtyBoxes - qty);
    await entry.save();

    // Deduct overall Product stock level
    product.stockLevel = Math.max(0, product.stockLevel - qty);
    await product.save();

    // Log to Stock Ledger
    const note = `Damaged Goods Write-off: ${reason || 'Expired/Damaged stock discard'}`;
    const ledger = await StockLedger.create({
      productId,
      warehouseId,
      warehouseName: warehouse.name,
      type: 'OUT',
      qtyBoxes: -qty,
      balanceBoxes: entry.qtyBoxes,
      reference: 'WRITE-OFF',
      note,
      createdBy: req.user ? req.user.name : 'System',
      packing: entry.packing,
      batchNo: entry.batchNo || '',
    });

    if (req.io) {
      req.io.emit('inventory_updated', { type: 'write_off', productId, warehouseId });
      req.io.emit('compliance_updated', { type: 'write_off', productId });
    }
    res.status(200).json({
      message: 'Stock successfully written off',
      inventoryEntry: entry,
      ledgerEntry: ledger
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/compliance/low-stock — Get products running below minimum reorder levels
router.get('/low-stock', async (req, res) => {
  try {
    const products = await Product.find({
      $expr: { $lte: ['$stockLevel', '$minReorder'] }
    }).select('name sku stockLevel minReorder category').lean();

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
