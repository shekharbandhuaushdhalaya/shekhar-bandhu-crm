const express = require('express');
const Invoice = require('../../models/Invoice');
const SystemSettings = require('../../models/SystemSettings');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// POST /api/eway-bills/generate — Prepare NIC E-Way Bill payload. This endpoint never fabricates an official E-Way Bill number.
router.post('/generate', authorize('invoice:create'), async (req, res) => {
  try {
    const { invoiceId, vehicleNo, transporterId, transporterName } = req.body;
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId is required' });

    const invoice = await Invoice.findById(invoiceId).lean();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const settings = await SystemSettings.findOne({ key: 'company_config' }).lean() || {};
    const firm = {
      name: settings.firmName,
      address: settings.firmAddress,
      gstin: settings.firmGstin,
      ...(invoice.firmDetails || {}),
    };
    const resolvedVehicleNo = vehicleNo || invoice.vehicleNo || '';
    const resolvedTransporterName = transporterName || '';
    if (!String(firm.gstin || '').trim() || !String(firm.address || '').trim()) {
      return res.status(409).json({ error: 'Firm GSTIN and address are required before preparing an E-Way Bill payload', code: 'EWAY_FIRM_DETAILS_REQUIRED' });
    }
    if (!String(invoice.partyAddress || '').trim()) {
      return res.status(409).json({ error: 'Customer address is required before preparing an E-Way Bill payload', code: 'EWAY_CUSTOMER_ADDRESS_REQUIRED' });
    }
    if (!resolvedVehicleNo || !resolvedTransporterName) {
      return res.status(409).json({ error: 'Vehicle number and transporter name are required before preparing an E-Way Bill payload', code: 'EWAY_TRANSPORT_DETAILS_REQUIRED' });
    }

    const ewayBillPayload = {
      supplyType: 'Outward',
      subSupplyType: 'Supply',
      docType: 'INV',
      docNo: invoice.invoiceNo,
      docDate: new Date(invoice.date).toLocaleDateString('en-IN'),
      fromGstin: firm.gstin,
      fromTrdName: firm.name || settings.firmName,
      fromAddr1: firm.address,
      fromPlace: settings.firmAddress || '',
      fromPincode: settings.firmPincode || '',
      toGstin: invoice.gstin || 'URP',
      toTrdName: invoice.customerName || 'Customer',
      toAddr1: invoice.partyAddress,
      toPlace: invoice.stateOfSupply || '',
      totalValue: invoice.baseAmount || invoice.amount,
      cgstValue: invoice.cgst || 0,
      sgstValue: invoice.sgst || 0,
      igstValue: invoice.igst || 0,
      totInvValue: invoice.amount,
      transporterId: transporterId || '',
      transporterName: resolvedTransporterName,
      transMode: 'Road',
      vehicleNo: resolvedVehicleNo
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
