const express = require('express');
const router = express.Router();
const InventoryEntry = require('../../models/InventoryEntry');
const Product = require('../../models/Product');
const Warehouse = require('../../models/Warehouse');
const StockLedger = require('../../models/StockLedger');
const Customer = require('../../models/Customer');
const Vendor = require('../../models/Vendor');
const { authorize } = require('../../middleware/authorize');
const { withTransaction } = require('../../utils/withTransaction');

// GET /api/inventory/compliance/near-expiry — Get batches expiring soon (default 90 days)
router.get('/near-expiry', authorize('inventory:view'), async (req, res) => {
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
router.get('/license-alerts', authorize('inventory:view'), async (req, res) => {
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
router.post('/write-off', authorize('inventory:edit'), async (req, res) => {
  try {
    const { productId, warehouseId, packing, batchNo, reason } = req.body;
    const qty = Number(req.body.qtyBoxes);
    if (!productId || !warehouseId || !(qty > 0)) return res.status(400).json({ error: 'productId, warehouseId, and positive qtyBoxes are required' });

    const posted = await withTransaction(async (session) => {
      const [product, warehouse] = await Promise.all([Product.findById(productId).session(session), Warehouse.findById(warehouseId).session(session)]);
      if (!product) throw Object.assign(new Error('Product not found'), { code: 'PRODUCT_NOT_FOUND' });
      if (!warehouse) throw Object.assign(new Error('Warehouse not found'), { code: 'WAREHOUSE_NOT_FOUND' });
      const query = { productId, warehouseId, packing: Number(packing) || 1, batchNo: String(batchNo || '').trim() };
      const entry = await InventoryEntry.findOne({ ...query, qtyBoxes: { $gte: qty } }).session(session);
      if (!entry) throw Object.assign(new Error('Insufficient stock in the specified batch/QC slot'), { code: 'INSUFFICIENT_STOCK' });
      entry.qtyBoxes -= qty;
      await entry.save({ session });
      const aggregate = await Product.updateOne({ _id: productId, stockLevel: { $gte: qty } }, { $inc: { stockLevel: -qty } }, { session });
      if (!aggregate.modifiedCount) throw Object.assign(new Error('Aggregate stock does not match warehouse stock. Run reconciliation before write-off.'), { code: 'AGGREGATE_STOCK_MISMATCH' });
      const [ledger] = await StockLedger.create([{
        productId, warehouseId, warehouseName: warehouse.name, type: 'OUT', qtyBoxes: -qty, balanceBoxes: entry.qtyBoxes,
        reference: 'WRITE-OFF', movementKey: `writeoff:${entry._id}:${Date.now()}`, note: `Damaged Goods Write-off: ${reason || 'Expired/Damaged stock discard'}`,
        createdBy: req.user?.name || 'System', packing: entry.packing, batchNo: entry.batchNo || '',
      }], { session });
      return { entry, ledger };
    });
    if (req.io) { req.io.emit('inventory_updated', { type: 'write_off', productId, warehouseId }); req.io.emit('compliance_updated', { type: 'write_off', productId }); }
    res.status(200).json({ message: 'Stock successfully written off', inventoryEntry: posted.entry, ledgerEntry: posted.ledger });
  } catch (err) {
    res.status(['PRODUCT_NOT_FOUND','WAREHOUSE_NOT_FOUND'].includes(err.code) ? 404 : 409).json({ error: err.message, code: err.code || 'WRITE_OFF_FAILED' });
  }
});

// GET /api/inventory/compliance/low-stock — Get products running below minimum reorder levels
router.get('/low-stock', authorize('inventory:view'), async (req, res) => {
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
