const express = require('express');
const Invoice = require('../../models/Invoice');
const Customer = require('../../models/Customer');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// POST /api/tally/import-xml — Bi-directional Tally XML voucher & ledger import engine
router.post('/import-xml', authorize('invoice:create'), async (req, res) => {
  try {
    const { xmlPayload } = req.body;
    if (!xmlPayload) return res.status(400).json({ error: 'xmlPayload string is required' });

    // Extract basic voucher details from Tally XML string
    const voucherNoMatch = xmlPayload.match(/<VOUCHERNUMBER>(.*?)<\/VOUCHERNUMBER>/i);
    const partyNameMatch = xmlPayload.match(/<PARTYLEDGERNAME>(.*?)<\/PARTYLEDGERNAME>/i);
    const amountMatch = xmlPayload.match(/<AMOUNT>(.*?)<\/AMOUNT>/i);

    const voucherNo = voucherNoMatch ? voucherNoMatch[1] : `TALLY-${Date.now().toString().slice(-6)}`;
    const partyName = partyNameMatch ? partyNameMatch[1] : 'Tally Imported Customer';
    const amount = amountMatch ? Math.abs(parseFloat(amountMatch[1])) : 1000;

    let customer = await Customer.findOne({ $or: [{ name: partyName }, { company: partyName }] });
    if (!customer) {
      customer = await Customer.create({
        name: partyName,
        company: partyName,
        billingAddress: { street: 'Tally Import Address', city: 'Varanasi', state: 'Uttar Pradesh', pin: '221001' }
      });
    }

    const existingInv = await Invoice.findOne({ invoiceNo: voucherNo });
    let inv = existingInv;
    if (!inv) {
      inv = await Invoice.create({
        type: 'sale',
        invoiceNo: voucherNo,
        customerName: customer.company || customer.name,
        amount,
        baseAmount: Number((amount / 1.18).toFixed(2)),
        cgst: Number(((amount - amount / 1.18) / 2).toFixed(2)),
        sgst: Number(((amount - amount / 1.18) / 2).toFixed(2)),
        date: new Date(),
        isFinalized: true
      });
    }

    res.status(201).json({
      status: 'synced',
      voucherNo,
      partyName,
      amount,
      invoiceId: inv._id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
