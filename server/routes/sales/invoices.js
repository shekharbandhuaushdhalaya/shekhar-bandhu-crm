const express = require('express');
const Invoice = require('../../models/Invoice');
const Customer = require('../../models/Customer');
const Vendor = require('../../models/Vendor');
const Product = require('../../models/Product');
const RawMaterial = require('../../models/RawMaterial');
const RawMaterialEntry = require('../../models/RawMaterialEntry');
const InventoryEntry = require('../../models/InventoryEntry');
const Warehouse = require('../../models/Warehouse');
const StockLedger = require('../../models/StockLedger');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

async function resolveWarehouse(warehouseId) {
  if (!warehouseId) return null;
  let warehouse = await Warehouse.findById(warehouseId);
  if (!warehouse) {
    const ManufacturingUnit = require('../../models/ManufacturingUnit');
    warehouse = await ManufacturingUnit.findById(warehouseId);
  }
  return warehouse;
}

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

// Helper: deduct inventory for a finalized sale invoice
async function deductInventoryForInvoice(invoice) {
  if (!invoice.items || invoice.items.length === 0 || !invoice.warehouseId) return;

  const warehouse = await resolveWarehouse(invoice.warehouseId);
  if (!warehouse) return;

  let isUpdatedItems = false;

  for (const item of invoice.items) {
    if (!item.productId) continue;
    const product = await Product.findById(item.productId);
    if (!product) continue;

    const neededQty = item.qty || item.boxes || 0;
    const packing = item.packing || 1;

    // 1. Decrement Product stock level
    product.stockLevel = Math.max(0, product.stockLevel - neededQty);
    await product.save();

    // 2. Query inventory entries sorted FIFO
    const entries = await InventoryEntry.find({
      warehouseId: warehouse._id,
      productId: product._id,
      packing
    }).sort({ mfgDate: 1, expiryDate: 1, createdAt: 1 });

    const exactEntry = item.batchNo ? entries.find(e => e.batchNo === item.batchNo && e.qtyBoxes >= neededQty) : null;

    if (exactEntry) {
      exactEntry.qtyBoxes = Math.max(0, exactEntry.qtyBoxes - neededQty);
      await exactEntry.save();

      let note = `Sold via Sale Invoice ${invoice.invoiceNo} (Finalized)`;
      if (invoice.saleType === 'doctor_sampling') {
        note = `Doctor Sample: MR ${invoice.medicalRepName || 'N/A'} to Dr. ${invoice.doctorName || 'N/A'}`;
      } else if (invoice.saleType === 'damage') {
        note = `Damaged Goods Write-off: ${invoice.damageReason || 'No details'}`;
      }

      await StockLedger.create({
        productId: product._id,
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        type: 'OUT',
        qtyBoxes: -neededQty,
        balanceBoxes: exactEntry.qtyBoxes,
        reference: invoice.invoiceNo,
        note,
        createdBy: 'System',
        packing,
        batchNo: item.batchNo || '',
      });
    } else {
      // FIFO Multi-batch deduction
      let remainingNeeded = neededQty;
      const batchesUsed = [];

      for (const entry of entries) {
        if (remainingNeeded <= 0) break;
        if (entry.qtyBoxes <= 0) continue;

        const deduct = Math.min(remainingNeeded, entry.qtyBoxes);
        entry.qtyBoxes -= deduct;
        await entry.save();

        remainingNeeded -= deduct;
        batchesUsed.push(`${entry.batchNo || 'NO-BATCH'} (${deduct} Pcs)`);

        let note = `Sold via Sale Invoice ${invoice.invoiceNo} (Batch ${entry.batchNo || 'N/A'})`;
        if (invoice.saleType === 'doctor_sampling') {
          note = `Doctor Sample: MR ${invoice.medicalRepName || 'N/A'} to Dr. ${invoice.doctorName || 'N/A'} (Batch ${entry.batchNo || 'N/A'})`;
        } else if (invoice.saleType === 'damage') {
          note = `Damaged Goods Write-off (Batch ${entry.batchNo || 'N/A'})`;
        }

        await StockLedger.create({
          productId: product._id,
          warehouseId: warehouse._id,
          warehouseName: warehouse.name,
          type: 'OUT',
          qtyBoxes: -deduct,
          balanceBoxes: entry.qtyBoxes,
          reference: invoice.invoiceNo,
          note,
          createdBy: 'System',
          packing,
          batchNo: entry.batchNo || '',
        });
      }

      if (batchesUsed.length > 0) {
        item.batchNo = batchesUsed.join(', ');
        isUpdatedItems = true;
      }
    }
  }

  if (isUpdatedItems) {
    await Invoice.findByIdAndUpdate(invoice._id, { items: invoice.items });
  }
}

// Helper: revert inventory for a deleted/cancelled sale invoice
async function revertInventoryForInvoice(invoice) {
  if (!invoice.items || invoice.items.length === 0 || !invoice.warehouseId) return;

  const warehouse = await resolveWarehouse(invoice.warehouseId);
  if (!warehouse) return;

  for (const item of invoice.items) {
    if (!item.productId) continue;
    const product = await Product.findById(item.productId);
    if (!product) continue;

    const qty = item.qty || 0;
    const packing = item.packing || 1;

    // 1. Revert Product stock level
    product.stockLevel += qty;
    await product.save();

    // 2. Revert specific InventoryEntry
    let entry = await InventoryEntry.findOne({
      warehouseId: warehouse._id,
      productId: product._id,
      packing,
    });

    if (entry) {
      entry.qtyBoxes += qty;
      await entry.save();
    } else {
      entry = await InventoryEntry.create({
        warehouseId: warehouse._id,
        warehouseName: warehouse.name,
        productId: product._id,
        productType: product.productType || '',
        size:        product.size        || '',
        colour:      product.colour      || '',
        shape:       product.shape       || '',
        weight:      product.weight      || '',
        hsnCode:     product.hsnCode     || '',
        vendorId:    '',
        vendorName:  '',
        qtyBoxes:    qty,
        packing,
      });
    }

    // 3. Record stock ledger entry (IN movement)
    let note = `Reverted via Cancellation of Sale Invoice ${invoice.invoiceNo}`;
    if (invoice.saleType === 'doctor_sampling') {
      note = `Reverted Doctor Sample of Sale Invoice ${invoice.invoiceNo}`;
    } else if (invoice.saleType === 'damage') {
      note = `Reverted Damaged Goods of Sale Invoice ${invoice.invoiceNo}`;
    }

    await StockLedger.create({
      productId: product._id,
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      type: 'IN',
      qtyBoxes: qty,
      balanceBoxes: entry ? entry.qtyBoxes : qty,
      reference: invoice.invoiceNo,
      note,
      createdBy: 'System',
      packing,
      vendorId: entry ? entry.vendorId : '',
      vendorName: entry ? entry.vendorName : '',
    });
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

    filter.mode = 'regular';

    const invoices = await Invoice.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    
    // Fetch associated dispatches
    const Dispatch = require('../../models/Dispatch');
    const invoiceIds = invoices.map(inv => inv._id);
    const dispatches = await Dispatch.find({ invoiceId: { $in: invoiceIds } }).lean();
    const dispatchMap = {};
    for (const d of dispatches) {
      if (d.invoiceId) {
        dispatchMap[d.invoiceId.toString()] = d;
      }
    }

    const enrichedInvoices = invoices.map(inv => ({
      ...inv,
      dispatch: dispatchMap[inv._id.toString()] || null
    }));

    res.json(enrichedInvoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/invoices/purchases — List purchase invoices
router.get('/purchases', authorize('invoice:view'), async (req, res) => {
  try {
    const { search, mode } = req.query;
    const filter = { type: 'purchase' };

    if (search) {
      filter.$or = [
        { invoiceNo: { $regex: search, $options: 'i' } },
        { supplierName: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
      ];
    }

    if (mode && mode !== 'all') {
      filter.mode = mode;
    }

    const invoices = await Invoice.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invoices/sales — Create sale invoice in DRAFT status (no inventory/balance changes yet)
router.post('/sales', validate(schemas.invoiceSchema), async (req, res) => {
  try {


    let invoiceNo = req.body.invoiceNo;
    if (!invoiceNo) {
      const fy = getFinancialYearString();
      const SystemSettings = require('../../models/SystemSettings');
      const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
      const pfx = settings.invoicePrefix || 'VP';
      const prefix = `${pfx}/${fy}/`;
      
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

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'CREATE_SALE_INVOICE_DRAFT',
      description: `Created sale invoice draft: ${invoice.invoiceNo} (Customer: ${invoice.customerName}, Amt: ₹${invoice.amount})`,
      details: { id: invoice._id },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/invoices/purchases — Create purchase invoice in DRAFT status (no inventory/balance changes yet)
router.post('/purchases', authorize('invoice:create'), validate(schemas.invoiceSchema), async (req, res) => {
  try {


    const data = {
      ...req.body,
      type: 'purchase',
      invoiceNo: req.body.invoiceNo || 'INV-PURCH-' + Date.now().toString().slice(-6),
      isFinalized: false,
    };
    const invoice = await Invoice.create(data);
    res.status(201).json(invoice);

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'CREATE_PURCHASE_INVOICE_DRAFT',
      description: `Created purchase invoice draft: ${invoice.invoiceNo} (Supplier: ${invoice.supplierName}, Amt: ₹${invoice.amount})`,
      details: { id: invoice._id },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/invoices/:id — Edit invoice (allowed only in DRAFT status)
router.put('/:id', authorize('invoice:edit'), validate(schemas.invoiceSchema.partial()), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    
    if (invoice.isFinalized) {
      const keys = Object.keys(req.body).filter(k => k !== 'status');
      if (keys.length > 0) {
        return res.status(400).json({ error: 'Finalized invoices cannot be edited, except for payment status.' });
      }
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

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'UPDATE_INVOICE',
      description: `Updated invoice draft: ${invoice.invoiceNo} (${invoice.type})`,
      details: { id: invoice._id },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/invoices/sales/:id/finalize — Finalize sale invoice & deduct stock
router.patch('/sales/:id/finalize', authorize('invoice:markPaid'), async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, type: 'sale' });
    if (!invoice) return res.status(404).json({ error: 'Sale invoice not found' });

    if (invoice.isFinalized) {
      return res.status(400).json({ error: 'Invoice is already finalized' });
    }

    // Sync Customer balance
    const cust = await Customer.findOne({
      $or: [
        { name: invoice.customerName },
        { company: invoice.customerName }
      ]
    });
    // If the invoice was converted from a delivery challan (has a reference/sourceDocId), the balance has already been debited by the challan dispatch
    const isFromChallan = !!(invoice.reference || invoice.sourceDocId);
    if (cust && invoice.saleType !== 'doctor_sampling' && invoice.saleType !== 'damage' && !isFromChallan) {
      if (invoice.mode === 'cash') {
        cust.cashBalance += invoice.amount;
      } else {
        cust.regularBalance += invoice.amount;
      }
      await cust.save();
    }

    // Deduct inventory if required (direct sales/sampling/damage)
    if (invoice.deductInventory || invoice.saleType === 'doctor_sampling' || invoice.saleType === 'damage') {
      await deductInventoryForInvoice(invoice);
    }

    if (invoice.status === 'draft' || invoice.status === 'Cancelled' || !invoice.status) {
      invoice.status = 'unpaid';
    }
    invoice.isFinalized = true;
    await invoice.save();
    res.json(invoice);

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'FINALIZE_SALE_INVOICE',
      description: `Finalized sale invoice: ${invoice.invoiceNo} (Customer: ${invoice.customerName}, Amt: ₹${invoice.amount})`,
      details: { id: invoice._id },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/invoices/purchases/:id/finalize — Finalize purchase invoice & add stock
router.patch('/purchases/:id/finalize', authorize('invoice:markPaid'), async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, type: 'purchase' });
    if (!invoice) return res.status(404).json({ error: 'Purchase invoice not found' });

    if (invoice.isFinalized) {
      return res.status(400).json({ error: 'Invoice is already finalized' });
    }



    // Resolve selected warehouse or default to first
    let warehouse;
    if (invoice.warehouseId) {
      warehouse = await resolveWarehouse(invoice.warehouseId);
    }
    if (!warehouse) {
      warehouse = await Warehouse.findOne();
    }
    if (!warehouse) {
      warehouse = await Warehouse.create({ name: 'Primary Warehouse', city: 'Default', state: 'Uttar Pradesh' });
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
        // 1. Check if item is a Raw Material
        let rawMaterial;
        if (item.rawMaterialId) {
          rawMaterial = await RawMaterial.findById(item.rawMaterialId);
        }
        if (!rawMaterial && item.name) {
          rawMaterial = await RawMaterial.findOne({ name: { $regex: `^${item.name.trim()}$`, $options: 'i' } });
        }

        if (rawMaterial) {
          const qtyToAdd = item.qty || item.boxes || 0;
          const rate = item.rate || 0;
          const batchNo = item.batchNo || `PUR-${invoice.invoiceNo}`;

          let rmEntry = await RawMaterialEntry.findOne({
            rawMaterialId: rawMaterial._id,
            batchNo: batchNo
          });

          if (rmEntry) {
            rmEntry.initialQty = (rmEntry.initialQty || rmEntry.qty || 0) + qtyToAdd;
            rmEntry.qty += qtyToAdd;
            if (rate > 0) rmEntry.purchaseRate = rate;
            if (resolvedVendorId) {
              rmEntry.vendorId = resolvedVendorId;
              rmEntry.vendorName = resolvedVendorName;
            }
            rmEntry.purchaseRef = invoice.invoiceNo;
            if (warehouse) {
              rmEntry.warehouseId = warehouse._id;
              rmEntry.warehouseName = warehouse.name;
            }
            await rmEntry.save();
          } else {
            await RawMaterialEntry.create({
              rawMaterialId: rawMaterial._id,
              batchNo: batchNo,
              initialQty: qtyToAdd,
              qty: qtyToAdd,
              purchaseRate: rate,
              vendorId: resolvedVendorId || null,
              vendorName: resolvedVendorName || '',
              purchaseRef: invoice.invoiceNo,
              warehouseId: warehouse ? warehouse._id : null,
              warehouseName: warehouse ? warehouse.name : '',
            });
          }
          continue;
        }

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

          // Update InventoryEntry — match exact slot including batchNo (legacy entries use batchNo: '')
          // For FIFO across batches with same product+vendor+packing, add to the batch with batchNo:''
          let entry = await InventoryEntry.findOne({
            warehouseId: warehouse._id,
            productId: product._id,
            vendorId: resolvedVendorId,
            packing,
            batchNo: '',  // purchase invoices don't carry batch info; use the legacy/unbatched slot
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
              batchNo:     '',  // unbatched — stock added via purchase invoice
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
      if (invoice.mode === 'cash') {
        vend.cashBalance = (vend.cashBalance || 0) + invoice.amount;
      } else {
        vend.regularBalance = (vend.regularBalance || 0) + invoice.amount;
      }
      await vend.save();
    }

    if (invoice.status === 'draft' || invoice.status === 'Cancelled' || !invoice.status) {
      invoice.status = 'unpaid';
    }
    invoice.isFinalized = true;
    await invoice.save();
    res.json(invoice);

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'FINALIZE_PURCHASE_INVOICE',
      description: `Finalized purchase invoice: ${invoice.invoiceNo} (Supplier: ${invoice.supplierName}, Amt: ₹${invoice.amount})`,
      details: { id: invoice._id },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/invoices/sales/:id — Delete sale invoice (revert customer balance & stock ONLY if finalized)
router.delete('/sales/:id', authorize('invoice:delete'), async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, type: 'sale' });
    if (!invoice) return res.status(404).json({ error: 'Sale invoice not found' });

    // Only rollback ledger / stock if it was finalized
    if (invoice.isFinalized) {
      // Deduct Customer balance
      const cust = await Customer.findOne({
        $or: [
          { name: invoice.customerName },
          { company: invoice.customerName }
        ]
      });
      // If the invoice was converted from a delivery challan (has a reference/sourceDocId), the balance rollback is handled by the challan deletion/cancellation
      const isFromChallan = !!(invoice.reference || invoice.sourceDocId);
      if (cust && invoice.saleType !== 'doctor_sampling' && invoice.saleType !== 'damage' && !isFromChallan) {
        if (invoice.mode === 'cash') {
          cust.cashBalance = Math.max(0, cust.cashBalance - invoice.amount);
        } else {
          cust.regularBalance = Math.max(0, cust.regularBalance - invoice.amount);
        }
        await cust.save();
      }

      // Revert stock level if required (direct sales/sampling/damage)
      if (invoice.deductInventory || invoice.saleType === 'doctor_sampling' || invoice.saleType === 'damage') {
        await revertInventoryForInvoice(invoice);
      }
    }

    // Soft Delete
    invoice.status = 'Cancelled';
    invoice.isFinalized = false;
    await invoice.save();
    
    res.json({ message: 'Sale invoice marked as Cancelled' });

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'CANCEL_SALE_INVOICE',
      description: `Cancelled sale invoice: ${invoice.invoiceNo} (Customer: ${invoice.customerName})`,
      details: { id: invoice._id },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/invoices/purchases/:id — Delete purchase invoice (revert vendor balance & stock ONLY if finalized)
router.delete('/purchases/:id', authorize('invoice:delete'), async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, type: 'purchase' });
    if (!invoice) return res.status(404).json({ error: 'Purchase invoice not found' });



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
        if (invoice.mode === 'cash') {
          vend.cashBalance = Math.max(0, (vend.cashBalance || 0) - invoice.amount);
        } else {
          vend.regularBalance = Math.max(0, (vend.regularBalance || 0) - invoice.amount);
        }
        await vend.save();
      }

      // Revert inventory added by purchase invoice
      if (invoice.items && invoice.items.length > 0) {
        let warehouse = await resolveWarehouse(invoice.warehouseId);
        if (!warehouse) warehouse = await Warehouse.findOne();
        if (warehouse) {
          const resolvedVendorId = vend ? vend._id.toString() : '';
          for (const item of invoice.items) {
            // Check Raw Material
            let rawMaterial;
            if (item.rawMaterialId) {
              rawMaterial = await RawMaterial.findById(item.rawMaterialId);
            }
            if (!rawMaterial && item.name) {
              rawMaterial = await RawMaterial.findOne({ name: { $regex: `^${item.name.trim()}$`, $options: 'i' } });
            }

            if (rawMaterial) {
              const boxesToRevert = item.qty || item.boxes || 0;
              const batchNo = item.batchNo || `PUR-${invoice.invoiceNo}`;
              const rmEntry = await RawMaterialEntry.findOne({
                rawMaterialId: rawMaterial._id,
                batchNo: batchNo
              });
              if (rmEntry) {
                rmEntry.qty = Math.max(0, rmEntry.qty - boxesToRevert);
                await rmEntry.save();
              }
              continue;
            }

            if (!item.productId) continue;
            const product = await Product.findById(item.productId);
            if (!product) continue;

            const boxesToRevert = item.boxes || 0;
            const packing = item.packing || 1;

            // 1. Decrement Product stock level
            product.stockLevel = Math.max(0, product.stockLevel - boxesToRevert);
            await product.save();

            // 3. Decrement specific InventoryEntry — FIFO across all batches
            // Get all batch slots for this product+vendor+packing, sorted oldest first
            const allBatchEntries = await InventoryEntry.find({
              warehouseId: warehouse._id,
              productId: product._id,
              vendorId: resolvedVendorId,
              packing,
            }).sort({ createdAt: 1 });

            let remaining = boxesToRevert;
            for (const batchEntry of allBatchEntries) {
              if (remaining <= 0) break;
              const deduct = Math.min(remaining, batchEntry.qtyBoxes);
              batchEntry.qtyBoxes = Math.max(0, batchEntry.qtyBoxes - deduct);
              await batchEntry.save();
              remaining -= deduct;
            }
            // Use first batch entry for ledger balance reference
            const entry = allBatchEntries[0] || null;

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

    const { logAction } = require('../../utils/auditLogger');
    await logAction({
      action: 'CANCEL_PURCHASE_INVOICE',
      description: `Cancelled purchase invoice: ${invoice.invoiceNo} (Supplier: ${invoice.supplierName})`,
      details: { id: invoice._id },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/invoices/:id/documents — Add a supporting document
router.patch('/:id/documents', async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Document name and url are required' });

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const { getRenamedFilename, appendDocument } = require('../../utils/documentHelper');
    const cleanDocName = getRenamedFilename(name, 'invoice', invoice.invoiceNo || invoice._id);
    const updatedInvoice = await appendDocument(Invoice, req.params.id, cleanDocName, url);

    res.json(updatedInvoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/invoices/:id/documents — Remove a supporting document
router.delete('/:id/documents', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Document URL is required' });

    const { removeDocument } = require('../../utils/documentHelper');
    const updatedInvoice = await removeDocument(Invoice, req.params.id, url);

    res.json(updatedInvoice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
