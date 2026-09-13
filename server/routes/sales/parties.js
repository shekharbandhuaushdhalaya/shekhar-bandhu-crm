const express = require('express');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const router = express.Router();

const STATE_MAP = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh'
};

// POST /api/parties/verify-gstin — Validate GSTIN syntax. Authoritative taxpayer
// lookup requires a configured government/GSP provider and is deliberately not
// faked from the PAN characters.
router.post('/verify-gstin', validate(schemas.gstinVerifySchema), (req, res) => {
  const { gstin } = req.body;
  if (!gstin) {
    return res.status(400).json({ error: 'GSTIN is required' });
  }

  const cleanGstin = gstin.trim().toUpperCase();
  // Standard Indian GSTIN Regex
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(cleanGstin)) {
    return res.status(400).json({ error: 'Invalid GSTIN format. Standard Indian GSTIN expected (e.g. 09AAAAA1111A1Z1)' });
  }

  const stateCode = cleanGstin.substring(0, 2);
  const state = STATE_MAP[stateCode] || null;
  res.json({
    verified: false,
    formatValid: true,
    source: 'format-only',
    message: 'GSTIN format is valid. Company name and address require an authoritative GST/GSP lookup.',
    gstin: cleanGstin,
    state,
    placeOfSupply: state ? `${stateCode}-${state}` : stateCode
  });
});

module.exports = router;
