const express = require('express');
const Challan = require('../../models/Challan');
const Product = require('../../models/Product');
const InventoryEntry = require('../../models/InventoryEntry');
const Warehouse = require('../../models/Warehouse');
const StockLedger = require('../../models/StockLedger');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

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

    // 3. Decrement specific InventoryEntry (with batchNo if provided)
    const entryQuery = {
      warehouseId: warehouse._id,
      productId: product._id,
      vendorId: item.vendorId || '',
      packing,
    };
    if (item.batchNo) entryQuery.batchNo = item.batchNo;

    let entry = await InventoryEntry.findOne(entryQuery);

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
      batchNo: item.batchNo || '',
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

    // 3. Revert specific InventoryEntry (with batchNo if provided)
    const revertQuery = {
      warehouseId: warehouse._id,
      productId: product._id,
      vendorId: item.vendorId || '',
      packing,
    };
    if (item.batchNo) revertQuery.batchNo = item.batchNo;
    let entry = await InventoryEntry.findOne(revertQuery);

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

    filter.mode = 'pakka';

    const challans = await Challan.find(filter).sort({ date: -1, challanNo: -1 }).lean();
    res.json(challans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/challans — Create new challan in DRAFT status (no inventory deduction yet)
router.post('/', validate(schemas.challanSchema), async (req, res) => {
  try {
    const { mode } = req.body;


    let challanNo = req.body.challanNo;
    if (!challanNo) {
      const SystemSettings = require('../../models/SystemSettings');
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

    const { logAction } = require('../../utils/auditLogger');
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
router.put('/:id', validate(schemas.challanSchema.partial()), async (req, res) => {
  try {
    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found' });
    if (challan.status === 'finalized') {
      return res.status(400).json({ error: 'Cannot edit a finalized challan' });
    }
    

    
    Object.assign(challan, req.body);
    const updated = await challan.save();
    res.json(updated);

    const { logAction } = require('../../utils/auditLogger');
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



    if (challan.deductInventory !== false) {
      // Check stock availability before finalizing
      if (challan.items && challan.items.length > 0 && challan.warehouseId) {
        for (const item of challan.items) {
          if (!item.productId) continue;
          const entryQuery = {
            warehouseId: challan.warehouseId,
            productId: item.productId,
            vendorId: item.vendorId || '',
            packing: item.packing || 1,
          };
          if (item.batchNo) entryQuery.batchNo = item.batchNo;
          const entry = await InventoryEntry.findOne(entryQuery);
          const available = entry ? entry.qtyBoxes : 0;
          if ((item.qty || 0) > available) {
            return res.status(400).json({
              error: `Insufficient stock for "${item.name}". Available: ${available} boxes, Required: ${item.qty} boxes.${item.batchNo ? ` Batch: ${item.batchNo}` : ''}`
            });
          }
        }
      }

      // Deduct inventory
      await deductInventory(challan);
    }



    // Sync Customer balance on Challan finalization
    if (challan.partyName && challan.nettTotal > 0) {
      const Customer = require('../../models/Customer');
      const cust = await Customer.findOne({
        $or: [
          { name: challan.partyName },
          { company: challan.partyName }
        ]
      });
      if (cust) {
        if (challan.mode === 'cash') {
          cust.cashBalance = (cust.cashBalance || 0) + challan.nettTotal;
        } else {
          cust.regularBalance = (cust.regularBalance || 0) + challan.nettTotal;
        }
        await cust.save();
      }
    }

    // Update status
    challan.status = 'finalized';
    await challan.save();

    res.json(challan);

    const { logAction } = require('../../utils/auditLogger');
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
router.delete('/:id', authorize('challan:delete'), async (req, res) => {
  try {

    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found' });



    // Only revert inventory and balance if challan was finalized
    if (challan.status === 'finalized') {
      if (challan.deductInventory !== false) {
        await revertInventory(challan);
      }

      if (challan.partyName && challan.nettTotal > 0) {
        const Customer = require('../../models/Customer');
        const cust = await Customer.findOne({
          $or: [
            { name: challan.partyName },
            { company: challan.partyName }
          ]
        });
        if (cust) {
          if (challan.mode === 'cash') {
            cust.cashBalance = Math.max(0, (cust.cashBalance || 0) - challan.nettTotal);
          } else {
            cust.regularBalance = Math.max(0, (cust.regularBalance || 0) - challan.nettTotal);
          }
          await cust.save();
        }
      }
    }

    await Challan.findByIdAndDelete(req.params.id);
    res.json({ message: 'Challan deleted' });

    const { logAction } = require('../../utils/auditLogger');
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



    // Check if customer is GSTIN registered
    const Customer = require('../../models/Customer');
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
    const Invoice = require('../../models/Invoice');
    const fy = getFinancialYearString();
    const SystemSettings = require('../../models/SystemSettings');
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
      status: 'draft',
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

    const { logAction } = require('../../utils/auditLogger');
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

// PATCH /api/challans/:id/documents — Add a supporting document
router.patch('/:id/documents', async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Document name and url are required' });

    const challan = await Challan.findById(req.params.id);
    if (!challan) return res.status(404).json({ error: 'Challan not found' });

    const { getRenamedFilename, appendDocument } = require('../../utils/documentHelper');
    const cleanDocName = getRenamedFilename(name, 'challan', challan.challanNo || challan._id);
    const updatedChallan = await appendDocument(Challan, req.params.id, cleanDocName, url);

    res.json(updatedChallan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/challans/:id/documents — Remove a supporting document
router.delete('/:id/documents', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Document URL is required' });

    const { removeDocument } = require('../../utils/documentHelper');
    const updatedChallan = await removeDocument(Challan, req.params.id, url);

    res.json(updatedChallan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
