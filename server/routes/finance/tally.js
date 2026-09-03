const express = require('express');
const router = express.Router();
const Invoice = require('../../models/Invoice');
const Payment = require('../../models/Payment');
const { authorize } = require('../../middleware/authorize');

// GET /api/finance/export/tally — Export sales, purchases, and payments in Tally-friendly CSV format
router.get('/', authorize('report:view'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Date filter setup
    const dateFilter = {};
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) dateFilter.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (!isNaN(end.getTime())) dateFilter.$lte = end;
    }

    const invoiceQuery = { isFinalized: true };
    if (startDate || endDate) {
      invoiceQuery.date = dateFilter;
    }

    const paymentQuery = {};
    if (startDate || endDate) {
      paymentQuery.date = dateFilter;
    }

    const [invoices, payments] = await Promise.all([
      Invoice.find(invoiceQuery).lean(),
      Payment.find(paymentQuery).lean()
    ]);

    // Build CSV content
    let csvContent = 'Date,VoucherType,VoucherNo,PartyName,BaseAmount,CGST,SGST,IGST,RoundOff,TotalAmount,PaymentMethod/Notes\n';

    // 1. Process Invoices
    for (const inv of invoices) {
      const dateStr = inv.date ? new Date(inv.date).toISOString().split('T')[0] : '';
      const voucherType = inv.type === 'sale' ? 'Sales' : 'Purchase';
      const voucherNo = inv.invoiceNo || '';
      const partyName = (inv.type === 'sale' ? inv.customerName : inv.supplierName) || '';
      const baseAmt = inv.baseAmount || 0;
      const cgst = inv.cgst || 0;
      const sgst = inv.sgst || 0;
      const igst = inv.igst || 0;
      const roundOff = inv.roundOff || 0;
      const grandTotal = inv.amount || 0;
      
      csvContent += `"${dateStr}","${voucherType}","${voucherNo}","${partyName.replace(/"/g, '""')}",${baseAmt},${cgst},${sgst},${igst},${roundOff},${grandTotal},""\n`;
    }

    // 2. Process Payments
    for (const pm of payments) {
      const dateStr = pm.date ? new Date(pm.date).toISOString().split('T')[0] : '';
      const voucherType = pm.type === 'receive' ? 'Receipt' : 'Payment';
      const voucherNo = pm.referenceNo || '';
      const partyName = pm.partyName || '';
      const totalAmount = pm.amount || 0;
      const payMethod = pm.paymentMethod || 'Cash';
      const notes = pm.notes || '';
      const notesField = `"${payMethod} - ${notes.replace(/"/g, '""')}"`;

      csvContent += `"${dateStr}","${voucherType}","${voucherNo}","${partyName.replace(/"/g, '""')}",0,0,0,0,0,${totalAmount},${notesField}\n`;
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=tally_export_${Date.now()}.csv`);
    return res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
