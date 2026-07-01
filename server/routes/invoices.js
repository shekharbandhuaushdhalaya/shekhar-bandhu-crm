const express = require('express');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const InventoryEntry = require('../models/InventoryEntry');
const Warehouse = require('../models/Warehouse');
const StockLedger = require('../models/StockLedger');

function getFinancialYearString(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed, 0 = Jan, 3 = Apr
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

async function validateSaleInvoiceDate(dateToCheck) {
  if (!dateToCheck) return;
  const d = new Date(dateToCheck);
  d.setHours(0,0,0,0);
  
  const latestFinalized = await Invoice.findOne({ type: 'sale', isFinalized: true }).sort({ date: -1 }).lean();
  if (latestFinalized && latestFinalized.date) {
    const latestDate = new Date(latestFinalized.date);
    latestDate.setHours(0,0,0,0);
    if (d < latestDate) {
      throw new Error(`Cannot use this date. A finalized sale invoice already exists for a later date (${latestDate.toLocaleDateString('en-IN')}).`);
    }
  }
}

const router = express.Router();

// GET /api/invoices/sales — List sale invoices
router.get('/sales', async (req, res) => {
  try {
    const { search, mode } = req.query;
    const filter = { type: 'sale' };

    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
      ];
    }

    if (!req.user || !req.user.canAccessCash) {
      filter.mode = 'pakka';
    } else if (mode && mode !== 'all') {
      filter.mode = mode;
    }

    const invoices = await Invoice.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/purchases — List purchase invoices
router.get('/purchases', async (req, res) => {
  try {
    if (req.user && req.user.role === 'agent') {
      return res.status(403).json({ error: 'Access denied: Agents cannot access purchase data.' });
    }
    const { search, mode } = req.query;
    const filter = { type: 'purchase' };

    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: 'i' } },
        { supplierName: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
      ];
    }

    if (!req.user || !req.user.canAccessCash) {
      filter.mode = 'pakka';
    } else if (mode && mode !== 'all') {
      filter.mode = mode;
    }

    const invoices = await Invoice.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoices/sales — Create sale invoice in DRAFT status (no inventory/balance changes yet)
router.post('/sales', async (req, res) => {
  try {
    if (req.body.mode === 'kachha' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permissions to create cash invoices.' });
    }

    let invoiceNo = req.body.invoiceNo;
    if (!invoiceNo) {
      const fy = getFinancialYearString();
      const prefix = `VP/${fy}/`;
      
      const lastInvoice = await Invoice.findOne({ 
        type: 'sale',
        invoiceNo: { $regex: `^${prefix.replace(/\//g, '\\/')}\\d+$` }
      }).sort({ date: -1, createdAt: -1 }).lean();

      let nextNum = 1;
      if (lastInvoice) {
        const parts = lastInvoice.invoiceNo.split('/');
        if (parts.length === 3) {
          nextNum = parseInt(parts[2], 10) + 1;
        }
      }
      invoiceNo = `${prefix}${nextNum.toString().padStart(3, '0')}`;
    }

    if (req.body.date) {
      await validateSaleInvoiceDate(req.body.date);
    }

    const data = {
      ...req.body,
      type: 'sale',
      invoiceNo,
      isFinalized: false,
    };
    const invoice = await Invoice.create(data);
    res.status(201).json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/invoices/purchases — Create purchase invoice in DRAFT status (no inventory/balance changes yet)
router.post('/purchases', async (req, res) => {
  try {
    if (req.user && req.user.role === 'agent') {
      return res.status(403).json({ error: 'Access denied: Agents cannot create purchase invoices.' });
    }
    if (req.body.mode === 'kachha' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permissions to create cash invoices.' });
    }

    const data = {
      ...req.body,
      type: 'purchase',
      invoiceNo: req.body.invoiceNo || 'INV-PURCH-' + Date.now().toString().slice(-6),
      isFinalized: false,
    };
    const invoice = await Invoice.create(data);
    res.status(201).json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/invoices/:id — Edit invoice (allowed only in DRAFT status)
router.put('/:id', async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    
    if (invoice.type === 'purchase' && req.user && req.user.role === 'agent') {
      return res.status(403).json({ error: 'Access denied: Agents cannot modify purchase invoices.' });
    }
    
    if (invoice.isFinalized) {
      const keys = Object.keys(req.body).filter(k => k !== 'status');
      if (keys.length > 0) {
        return res.status(400).json({ error: 'Finalized invoices cannot be edited, except for payment status.' });
      }
    }

    // Check cash permission
    const currentMode = invoice.mode;
    const newMode = req.body.mode;
    if ((currentMode === 'kachha' || newMode === 'kachha') && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permissions to edit cash invoices.' });
    }

    // Keep invoice type and number immutable during edits
    const { type, invoiceNo, ...updateData } = req.body;
    
    if (invoice.type === 'sale' && updateData.date) {
      const oldDate = invoice.date ? new Date(invoice.date).setHours(0,0,0,0) : 0;
      const newDate = new Date(updateData.date).setHours(0,0,0,0);
      if (oldDate !== newDate) {
        await validateSaleInvoiceDate(updateData.date);
      }
    }

    Object.assign(invoice, updateData);
    await invoice.save();
    res.json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/invoices/sales/:id/finalize — Finalize sale invoice & deduct stock
router.patch('/sales/:id/finalize', async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, type: 'sale' });
    if (!invoice) return res.status(404).json({ error: 'Sale invoice not found' });

    if (invoice.isFinalized) {
      return res.status(400).json({ error: 'Invoice is already finalized' });
    }

    // Check cash permission
    if (invoice.mode === 'kachha' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permissions to finalize cash invoices.' });
    }



    // Sync Customer balance
    const cust = await Customer.findOne({
      $or: [
        { name: invoice.customerName },
        { company: invoice.customerName }
      ]
    });
    if (cust) {
      if (cust.recordTracking === 'cash_ledger') {
        cust.kachhaBalance += invoice.amount;
      } else if (invoice.mode === 'pakka') {
        cust.pakkaBalance += invoice.amount;
      } else {
        cust.kachhaBalance += invoice.amount;
      }
      await cust.save();
    }

    if (invoice.status === 'Cancelled') invoice.status = 'unpaid';
    invoice.isFinalized = true;
    await invoice.save();
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/invoices/purchases/:id/finalize — Finalize purchase invoice & add stock
router.patch('/purchases/:id/finalize', async (req, res) => {
  try {
    if (req.user && req.user.role === 'agent') {
      return res.status(403).json({ error: 'Access denied: Agents cannot finalize purchase invoices.' });
    }
    const invoice = await Invoice.findOne({ _id: req.params.id, type: 'purchase' });
    if (!invoice) return res.status(404).json({ error: 'Purchase invoice not found' });

    if (invoice.isFinalized) {
      return res.status(400).json({ error: 'Invoice is already finalized' });
    }

    // Check cash permission
    if (invoice.mode === 'kachha' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permissions to finalize cash invoices.' });
    }

    // Resolve selected warehouse or default to first
    let warehouse;
    if (invoice.warehouseId) {
      warehouse = await Warehouse.findById(invoice.warehouseId);
    }
    if (!warehouse) {
      warehouse = await Warehouse.findOne();
    }
    if (!warehouse) {
      warehouse = await Warehouse.create({ name: 'Gotham Depot A', location: 'Gotham City' });
    }

    // Sync warehouseName to invoice if missing
    if (!invoice.warehouseName) {
      invoice.warehouseName = warehouse.name;
    }

    const vend = await Vendor.findOne({
      $or: [
        { name: invoice.supplierName },
        { company: invoice.supplierName }
      ]
    });
    const resolvedVendorId = vend ? vend._id.toString() : '';
    const resolvedVendorName = vend ? (vend.company || vend.name) : '';

    // Automatically update inventories for each purchase invoice item
    if (invoice.items && invoice.items.length > 0) {
      for (const item of invoice.items) {
        let product;
        if (item.productId) {
          product = await Product.findById(item.productId);
        }
        if (!product) {
          const products = await Product.find({}).lean();
          product = products.find(p => {
            const parts = [
              p.size ? p.size.replace(/[\s.]+/g, '').toUpperCase() + '.' : '',
              p.shape ? p.shape.trim().split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : '',
              p.colour ? p.colour.trim().split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : '',
              p.weight ? (p.weight.replace(/\s+/g, '').toLowerCase().endsWith('g') ? p.weight.replace(/\s+/g, '').toLowerCase() : p.weight.replace(/\s+/g, '').toLowerCase() + 'g') : ''
            ];
            const combined = parts.filter(Boolean).join(' ');
            const displayName = combined || p.name || 'Unnamed Product';
            return displayName.toLowerCase() === item.name.toLowerCase() || p.name.toLowerCase() === item.name.toLowerCase();
          });
        }

        if (product) {
          const boxesNum = item.boxes || 0;
          const packing = item.packing || 1;

          // Update Product stock level
          product.stockLevel += boxesNum;
          await product.save();

          // Update Inventory
          let inv = await Inventory.findOne({ itemSku: product.sku });
          if (inv) {
            inv.qty += boxesNum;
            inv.val = inv.qty * product.price;
            await inv.save();
          } else {
            await Inventory.create({
              warehouse: warehouse.name,
              itemSku: product.sku,
              itemName: product.name,
              qty: boxesNum,
              minReorder: product.minReorder || 5,
              val: boxesNum * product.price
            });
          }

          // Update InventoryEntry
          let entry = await InventoryEntry.findOne({
            warehouseId: warehouse._id,
            productId: product._id,
            vendorId: resolvedVendorId,
            packing,
          });

          if (entry) {
            entry.qtyBoxes += boxesNum;
          } else {
            entry = new InventoryEntry({
              warehouseId: warehouse._id,
              warehouseName: warehouse.name,
              productId: product._id,
              productType: product.productType || '',
              size:        product.size        || '',
              colour:      product.colour      || '',
              shape:       product.shape       || '',
              weight:      product.weight      || '',
              hsnCode:     product.hsnCode     || '',
              vendorId:    resolvedVendorId,
              vendorName:  resolvedVendorName,
              qtyBoxes:    boxesNum,
              packing,
            });
          }
          await entry.save();

          // Record stock ledger entry (IN movement)
          await StockLedger.create({
            productId: product._id,
            warehouseId: warehouse._id,
            warehouseName: warehouse.name,
            type: 'IN',
            qtyBoxes: boxesNum,
            balanceBoxes: entry.qtyBoxes,
            reference: invoice.invoiceNo,
            note: `Auto-created via Purchase Invoice ${invoice.invoiceNo} (Finalized)`,
            createdBy: 'System',
            packing,
            vendorId: resolvedVendorId,
            vendorName: resolvedVendorName,
            createdAt: invoice.date,
          });
        }
      }
    }

    // Sync Vendor balance
    if (vend) {
      if (invoice.mode === 'pakka') {
        vend.pakkaBalance += invoice.amount;
      } else {
        vend.kachhaBalance += invoice.amount;
      }
      await vend.save();
    }

    if (invoice.status === 'Cancelled') invoice.status = 'unpaid';
    invoice.isFinalized = true;
    await invoice.save();
    res.json(invoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/invoices/sales/:id — Delete sale invoice (revert customer balance & stock ONLY if finalized)
router.delete('/sales/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only administrators can delete invoices.' });
    }
    const invoice = await Invoice.findOne({ _id: req.params.id, type: 'sale' });
    if (!invoice) return res.status(404).json({ error: 'Sale invoice not found' });

    // Check cash permission
    if (invoice.mode === 'kachha' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permissions to delete cash invoices.' });
    }

    // Only rollback ledger / stock if it was finalized
    if (invoice.isFinalized) {
      // Deduct Customer balance
      const cust = await Customer.findOne({
        $or: [
          { name: invoice.customerName },
          { company: invoice.customerName }
        ]
      });
      if (cust) {
        if (cust.recordTracking === 'cash_ledger') {
          cust.kachhaBalance = Math.max(0, cust.kachhaBalance - invoice.amount);
        } else if (invoice.mode === 'pakka') {
          cust.pakkaBalance = Math.max(0, cust.pakkaBalance - invoice.amount);
        } else {
          cust.kachhaBalance = Math.max(0, cust.kachhaBalance - invoice.amount);
        }
        await cust.save();
      }


    }

    // Soft Delete
    invoice.status = 'Cancelled';
    invoice.isFinalized = false;
    await invoice.save();
    
    res.json({ message: 'Sale invoice marked as Cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/invoices/purchases/:id — Delete purchase invoice (revert vendor balance & stock ONLY if finalized)
router.delete('/purchases/:id', async (req, res) => {
  try {
    if (req.user && req.user.role === 'agent') {
      return res.status(403).json({ error: 'Access denied: Agents cannot delete purchase invoices.' });
    }
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only administrators can delete invoices.' });
    }
    const invoice = await Invoice.findOne({ _id: req.params.id, type: 'purchase' });
    if (!invoice) return res.status(404).json({ error: 'Purchase invoice not found' });

    // Check cash permission
    if (invoice.mode === 'kachha' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permissions to delete cash invoices.' });
    }

    // Only rollback ledger / stock if it was finalized
    if (invoice.isFinalized) {
      // Deduct Vendor balance
      const vend = await Vendor.findOne({
        $or: [
          { name: invoice.supplierName },
          { company: invoice.supplierName }
        ]
      });
      if (vend) {
        if (invoice.mode === 'pakka') {
          vend.pakkaBalance = Math.max(0, vend.pakkaBalance - invoice.amount);
        } else {
          vend.kachhaBalance = Math.max(0, vend.kachhaBalance - invoice.amount);
        }
        await vend.save();
      }

      // Revert inventory added by purchase invoice
      if (invoice.items && invoice.items.length > 0) {
        let warehouse = await Warehouse.findById(invoice.warehouseId);
        if (!warehouse) warehouse = await Warehouse.findOne();
        if (warehouse) {
          const resolvedVendorId = vend ? vend._id.toString() : '';
          for (const item of invoice.items) {
            if (!item.productId) continue;
            const product = await Product.findById(item.productId);
            if (!product) continue;

            const boxesToRevert = item.boxes || 0;
            const packing = item.packing || 1;

            // 1. Decrement Product stock level
            product.stockLevel = Math.max(0, product.stockLevel - boxesToRevert);
            await product.save();

            // 2. Decrement general Inventory
            let inv = await Inventory.findOne({ itemSku: product.sku });
            if (inv) {
              inv.qty = Math.max(0, inv.qty - boxesToRevert);
              inv.val = inv.qty * product.price;
              await inv.save();
            }

            // 3. Decrement specific InventoryEntry
            let entry = await InventoryEntry.findOne({
              warehouseId: warehouse._id,
              productId: product._id,
              vendorId: resolvedVendorId,
              packing,
            });

            if (entry) {
              entry.qtyBoxes = Math.max(0, entry.qtyBoxes - boxesToRevert);
              await entry.save();
            }

            // 4. Record stock ledger entry (OUT movement to revert)
            await StockLedger.create({
              productId: product._id,
              warehouseId: warehouse._id,
              warehouseName: warehouse.name,
              type: 'OUT',
              qtyBoxes: -boxesToRevert,
              balanceBoxes: entry ? entry.qtyBoxes : 0,
              reference: invoice.invoiceNo,
              note: `Reverted via Deletion of Purchase Invoice ${invoice.invoiceNo}`,
              createdBy: 'System',
              packing,
              vendorId: resolvedVendorId,
              vendorName: vend ? (vend.company || vend.name) : '',
            });
          }
        }
      }
    }

    // Soft Delete
    invoice.status = 'Cancelled';
    invoice.isFinalized = false;
    await invoice.save();

    res.json({ message: 'Purchase invoice marked as Cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
