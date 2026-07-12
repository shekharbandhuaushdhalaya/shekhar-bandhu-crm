const express = require('express');
const Challan = require('../models/Challan');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const InventoryEntry = require('../models/InventoryEntry');
const Warehouse = require('../models/Warehouse');
const StockLedger = require('../models/StockLedger');

const router = express.Router();

// Helper: deduct inventory for a finalized challan
async function deductInventory(challan) {
  if (!challan.items || challan.items.length === 0 || !challan.warehouseId) return;

  const warehouse = await Warehouse.findById(challan.warehouseId);
  if (!warehouse) return;

  for (const item of challan.items) {
    if (!item.productId) continue;
    const product = await Product.findById(item.productId);
    if (!product) continue;

    const boxesToDeduct = item.qty || 0;
    const packing = item.packing || 1;

    // 1. Decrement Product stock level
    product.stockLevel = Math.max(0, product.stockLevel - boxesToDeduct);
    await product.save();

    // 2. Decrement general Inventory
    let inv = await Inventory.findOne({ itemSku: product.sku });
    if (inv) {
      inv.qty = Math.max(0, inv.qty - boxesToDeduct);
      inv.val = inv.qty * product.price;
      await inv.save();
    }

    // 3. Decrement specific InventoryEntry
    let entry = await InventoryEntry.findOne({
      warehouseId: warehouse._id,
      productId: product._id,
      vendorId: item.vendorId || '',
      packing,
    });

    if (entry) {
      entry.qtyBoxes = Math.max(0, entry.qtyBoxes - boxesToDeduct);
      await entry.save();
    }

    // 4. Record stock ledger entry (OUT movement)
    await StockLedger.create({
      productId: product._id,
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      type: 'OUT',
      qtyBoxes: -boxesToDeduct,
      balanceBoxes: entry ? entry.qtyBoxes : 0,
      reference: challan.challanNo,
      note: `Dispatched via Challan ${challan.challanNo} (Finalized)`,
      createdBy: 'System',
      packing,
      vendorId: item.vendorId || '',
      vendorName: item.vendorName || '',
    });
  }
}

// Helper: revert inventory for a finalized challan (on delete)
async function revertInventory(challan) {
  if (!challan.items || challan.items.length === 0 || !challan.warehouseId) return;

  const warehouse = await Warehouse.findById(challan.warehouseId);
  if (!warehouse) return;

  for (const item of challan.items) {
    if (!item.productId) continue;
    const product = await Product.findById(item.productId);
    if (!product) continue;

    const boxesToRevert = item.qty || 0;
    const packing = item.packing || 1;

    // 1. Revert Product stock level
    product.stockLevel += boxesToRevert;
    await product.save();

    // 2. Revert general Inventory
    let inv = await Inventory.findOne({ itemSku: product.sku });
    if (inv) {
      inv.qty += boxesToRevert;
      inv.val = inv.qty * product.price;
      await inv.save();
    }

    // 3. Revert specific InventoryEntry
    let entry = await InventoryEntry.findOne({
      warehouseId: warehouse._id,
      productId: product._id,
      vendorId: item.vendorId || '',
      packing,
    });

    if (entry) {
      entry.qtyBoxes += boxesToRevert;
    } else {
      // Re-create entry slot if it was removed
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
        vendorId:    item.vendorId       || '',
        vendorName:  item.vendorName     || '',
        qtyBoxes:    boxesToRevert,
        packing,
      });
    }
    await entry.save();

    // 4. Record stock ledger entry (IN movement)
    await StockLedger.create({
      productId: product._id,
      warehouseId: warehouse._id,
      warehouseName: warehouse.name,
      type: 'IN',
      qtyBoxes: boxesToRevert,
      balanceBoxes: entry.qtyBoxes,
      reference: challan.challanNo,
      note: `Reverted via Deletion of Challan ${challan.challanNo}`,
      createdBy: 'System',
      packing,
      vendorId: item.vendorId || '',
      vendorName: item.vendorName || '',
    });
  }
}

// GET /api/challans — List challans with search and mode filters
router.get('/', async (req, res) => {
  try {
    const { search, mode } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { challanNo: { $regex: search, $options: 'i' } },
        { partyName: { $regex: search, $options: 'i' } },
        { status: { $regex: search, $options: 'i' } },
      ];
    }

    // Enforce cash access security rule
    if (!req.user || !req.user.canAccessCash) {
      filter.mode = 'pakka';
    } else if (mode && mode !== 'all') {
      filter.mode = mode;
    }

    const challans = await Challan.find(filter).sort({ date: -1, challanNo: -1 }).lean();
    res.json(challans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/challans — Create new challan in DRAFT status (no inventory deduction yet)
router.post('/', async (req, res) => {
  try {
    const { mode } = req.body;
    // Enforce cash access security rule
    if (mode === 'kachha' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permissions to perform cash transactions.' });
    }

    let challanNo = req.body.challanNo;
    if (!challanNo) {
      const SystemSettings = require('../models/SystemSettings');
      const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
      const pfx = settings.challanPrefix || 'CH';
      const lastChallan = await Challan.findOne({ challanNo: new RegExp(`^${pfx}-\\d+$`) }).sort({ createdAt: -1 }).lean();
      let nextNum = 1;
      if (lastChallan) {
        const parts = lastChallan.challanNo.split('-');
        if (parts.length === 3) {
          nextNum = parseInt(parts[2], 10) + 1;
        }
      }
      challanNo = `${pfx}-${nextNum.toString().padStart(3, '0')}`;
    }

    const data = {
      ...req.body,
      challanNo,
      status: 'draft', // always draft on creation
    };

    if (!data.warehouseId) {
      return res.status(400).json({ error: 'Source warehouse is required' });
    }

    const warehouse = await Warehouse.findById(data.warehouseId);
    if (!warehouse) {
      return res.status(404).json({ error: 'Selected warehouse not found' });
    }
    data.warehouseName = warehouse.name;

    const challan = await Challan.create(data);
    res.status(201).json(challan);

    const { logAction } = require('../utils/auditLogger');
    await logAction({
      action: 'CREATE_CHALLAN_DRAFT',
      description: `Created challan draft: ${challan.challanNo} (Party: ${challan.partyName}, Amt: ₹${challan.nettTotal})`,
      details: { id: challan._id },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/challans/:id — Update an existing draft challan
router.put('/:id', async (req, res) => {
  try {
    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found' });
    if (challan.status === 'finalized') {
      return res.status(400).json({ error: 'Cannot edit a finalized challan' });
    }
    
    // Enforce cash access security rule
    const targetMode = req.body.mode || challan.mode;
    if (targetMode === 'kachha' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permissions to perform cash transactions.' });
    }
    
    Object.assign(challan, req.body);
    const updated = await challan.save();
    res.json(updated);

    const { logAction } = require('../utils/auditLogger');
    await logAction({
      action: 'UPDATE_CHALLAN',
      description: `Updated challan draft: ${challan.challanNo}`,
      details: { id: challan._id },
      req
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/challans/:id/finalize — Finalize challan & deduct inventory
router.patch('/:id/finalize', async (req, res) => {
  try {
    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found' });

    if (challan.status === 'finalized') {
      return res.status(400).json({ error: 'Challan is already finalized' });
    }

    // Enforce cash access security rule
    if (challan.mode === 'kachha' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permissions to finalize cash challans.' });
    }

    if (challan.deductInventory !== false) {
      // Check stock availability before finalizing
      if (challan.items && challan.items.length > 0 && challan.warehouseId) {
        for (const item of challan.items) {
          if (!item.productId) continue;
          const entry = await InventoryEntry.findOne({
            warehouseId: challan.warehouseId,
            productId: item.productId,
            vendorId: item.vendorId || '',
            packing: item.packing || 1,
          });
          const available = entry ? entry.qtyBoxes : 0;
          if ((item.qty || 0) > available) {
            return res.status(400).json({
              error: `Insufficient stock for "${item.name}". Available: ${available} boxes, Required: ${item.qty} boxes.`
            });
          }
        }
      }

      // Deduct inventory
      await deductInventory(challan);
    }

    // Update customer cash balance if mode is kachha or customer is cash-ledger-tracked
    const Customer = require('../models/Customer');
    const cust = await Customer.findOne({
      $or: [
        { name: challan.partyName },
        { company: challan.partyName }
      ]
    });
    if (cust) {
      if (challan.mode === 'kachha' || cust.recordTracking === 'cash_ledger') {
        cust.kachhaBalance += (challan.nettTotal || 0);
        await cust.save();
      }
    }

    // Update status
    challan.status = 'finalized';
    await challan.save();

    res.json(challan);

    const { logAction } = require('../utils/auditLogger');
    await logAction({
      action: 'FINALIZE_CHALLAN',
      description: `Finalized challan: ${challan.challanNo} (Party: ${challan.partyName}, Amt: ₹${challan.nettTotal})`,
      details: { id: challan._id },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/challans/:id — Remove challan & revert inventories ONLY if finalized
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only administrators can delete challans.' });
    }

    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found' });

    // Enforce cash access security rule if it's a cash challan
    if (challan.mode === 'kachha' && (!req.user || !req.user.canAccessCash)) {
      return res.status(403).json({ error: 'Access denied: You do not have permissions to delete cash transactions.' });
    }

    // Only revert inventory if challan was finalized
    if (challan.status === 'finalized') {
      if (challan.deductInventory !== false) {
        await revertInventory(challan);
      }

      // Revert customer cash balance if mode is kachha or customer is cash-ledger-tracked
      const Customer = require('../models/Customer');
      const cust = await Customer.findOne({
        $or: [
          { name: challan.partyName },
          { company: challan.partyName }
        ]
      });
      if (cust) {
        if (challan.mode === 'kachha' || cust.recordTracking === 'cash_ledger') {
          cust.kachhaBalance = Math.max(0, cust.kachhaBalance - (challan.nettTotal || 0));
          await cust.save();
        }
      }
    }

    await Challan.findByIdAndDelete(req.params.id);
    res.json({ message: 'Challan deleted' });

    const { logAction } = require('../utils/auditLogger');
    await logAction({
      action: 'DELETE_CHALLAN',
      description: `Deleted challan: ${challan.challanNo} (Party: ${challan.partyName})`,
      details: { id: challan._id },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to get financial year string
function getFinancialYearString(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed, 0 = Jan, 3 = Apr
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
}

// POST /api/challans/:id/convert — Convert a Challan to a Sale Invoice
router.post('/:id/convert', async (req, res) => {
  try {
    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found' });

    if (challan.convertedToInvoice) {
      return res.status(400).json({ error: `Challan is already converted to Sale Invoice ${challan.invoiceNo}` });
    }

    if (challan.mode === 'kachha') {
      return res.status(400).json({ error: 'Challans created in Cash Ledger mode cannot be converted to Sale Invoices.' });
    }

    // Check if customer is GSTIN registered
    const Customer = require('../models/Customer');
    const customer = await Customer.findOne({
      $or: [
        { name: challan.partyName },
        { company: challan.partyName }
      ]
    });

    const finalGstin = (challan.gstin || (customer ? customer.gstin : '') || '').trim();
    if (!finalGstin) {
      return res.status(400).json({ error: 'Customer is not GSTIN registered. Sale invoices can only be created for customers with a valid GSTIN.' });
    }

    // Generate Invoice Number
    const Invoice = require('../models/Invoice');
    const fy = getFinancialYearString();
    const SystemSettings = require('../models/SystemSettings');
    const settings = await SystemSettings.findOne({ key: 'company_config' }) || {};
    const pfx = settings.invoicePrefix || 'VP';
    const prefix = `${pfx}/${fy}/`;
    
    const lastInvoice = await Invoice.findOne({ 
      type: 'sale',
      invoiceNo: { $regex: `^${prefix.replace(/\//g, '\\/')}\\d+$` }
    }).sort({ createdAt: -1 }).lean();

    let nextNum = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoiceNo.split('/');
      if (parts.length === 3) {
        nextNum = parseInt(parts[2], 10) + 1;
      }
    }
    const invoiceNo = `${prefix}${nextNum.toString().padStart(3, '0')}`;

    const isIntraState = finalGstin.startsWith('09') || 
      ['uttar pradesh', 'up'].includes((challan.stateOfSupply || (customer ? customer.state : '') || 'Uttar Pradesh').trim().toLowerCase());

    // Recalculate base amount and tax amounts based on items and state of supply
    let totalBase = 0;
    let totalTax = 0;
    const invoiceItems = challan.items.map(it => {
      const itemBase = (it.qty || 0) * (it.rate || 0) * (it.packing || 1);
      totalBase += itemBase;
      const gst = it.gstRate || 0;
      totalTax += (itemBase * gst) / 100;

      return {
        productId: it.productId,
        name: it.name,
        qty: it.qty, // boxes (in sale.tsx, qty is boxes)
        boxes: it.qty, // quantity in boxes
        packing: it.packing || 1,
        rate: it.rate || 0,
        hsnCode: it.hsnCode || '',
        gstRate: it.gstRate || 0
      };
    });

    const cgst = isIntraState ? totalTax / 2 : 0;
    const sgst = isIntraState ? totalTax / 2 : 0;
    const igst = !isIntraState ? totalTax : 0;
    const rawTotal = totalBase + cgst + sgst + igst;
    const nettTotal = Math.round(rawTotal);
    const roundOff = nettTotal - rawTotal;

    // Create invoice data
    const invoiceData = {
      invoiceNo,
      customerName: challan.partyName,
      partyAddress: challan.partyAddress,
      shippingAddress: challan.shippingAddress,
      date: new Date(),
      amount: nettTotal,
      status: 'unpaid',
      mode: 'pakka', // converted invoice is pakka
      baseAmount: totalBase,
      cgst,
      sgst,
      igst,
      roundOff,
      stateOfSupply: challan.stateOfSupply || (customer ? customer.state : '') || 'Uttar Pradesh',
      gstin: finalGstin,
      warehouseId: challan.warehouseId,
      warehouseName: challan.warehouseName,
      deductInventory: challan.status !== 'finalized', // If challan is finalized, stock is already deducted.
      isFinalized: false, // create as draft
      type: 'sale',
      items: invoiceItems
    };

    const invoice = await Invoice.create(invoiceData);

    // Update Challan to link to the invoice
    challan.convertedToInvoice = true;
    challan.invoiceId = invoice._id;
    challan.invoiceNo = invoice.invoiceNo;
    await challan.save();

    res.status(201).json({
      message: 'Challan successfully converted to Sale Invoice',
      invoice,
      challan
    });

    const { logAction } = require('../utils/auditLogger');
    await logAction({
      action: 'CONVERT_CHALLAN_TO_INVOICE',
      description: `Converted challan ${challan.challanNo} to invoice: ${invoice.invoiceNo}`,
      details: { challanId: challan._id, invoiceId: invoice._id },
      req
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
