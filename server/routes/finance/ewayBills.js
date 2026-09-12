const express = require('express');
const Invoice = require('../../models/Invoice');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// POST /api/eway-bills/generate — Prepare NIC E-Way Bill payload. This endpoint never fabricates an official E-Way Bill number.
router.post('/generate', authorize('invoice:create'), async (req, res) => {
  try {
    const { invoiceId, vehicleNo, transporterId, transporterName } = req.body;
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required' });

    const invoice = await Invoice.findById(invoiceId).lean();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const ewayBillPayload = {
      supplyType: 'Outward',
      subSupplyType: 'Supply',
      docType: 'INV',
      docNo: invoice.invoiceNo,
      docDate: new Date(invoice.date).toLocaleDateString('en-IN'),
      fromGstin: invoice.firmDetails ? invoice.firmDetails.gstin : '09AAAAA0000A1Z5',
      fromTrdName: invoice.firmDetails ? invoice.firmDetails.name : 'Shekhar Bandhu Aushadhalaya',
      fromAddr1: 'Varanasi Factory Unit',
      fromPlace: 'Varanasi',
      fromPincode: 221001,
      toGstin: invoice.gstin || 'URP',
      toTrdName: invoice.customerName || 'Customer',
      toAddr1: invoice.partyAddress || 'Destination Address',
      toPlace: invoice.stateOfSupply || 'Uttar Pradesh',
      totalValue: invoice.baseAmount || invoice.amount,
      cgstValue: invoice.cgst || 0,
      sgstValue: invoice.sgst || 0,
      igstValue: invoice.igst || 0,
      totInvValue: invoice.amount,
      transporterId: transporterId || '',
      transporterName: transporterName || 'Express Logistics',
      transMode: 'Road',
      vehicleNo: vehicleNo || invoice.vehicleNo || 'UP65AB1234'
    };

    res.status(501).json({
      status: 'payload_ready',
      code: 'EWAY_PROVIDER_NOT_CONFIGURED',
      error: 'Official NIC E-Way Bill submission is not configured. The payload is ready for submission through an authorized provider; no fake E-Way Bill number has been generated.',
      ewayBillNo: null,
      ewayBillPayload
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
