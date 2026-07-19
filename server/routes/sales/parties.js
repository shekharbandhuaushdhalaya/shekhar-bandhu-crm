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

const MOCK_COMPANIES = [
  'Arogya Ayurvedic Herbs',
  'Bhandari Pharma Care',
  'Varanasi Herbals & Botanicals',
  'Sri Kashi Ayurvedic Aushdhalaya',
  'Ganga Valley Distributors',
  'Divine Ayur Pharma',
  'Nirvana Wellness Trading',
  'Himalaya Botanical Traders'
];

const MOCK_CITIES = {
  '09': 'Varanasi',
  '27': 'Mumbai',
  '07': 'New Delhi',
  '19': 'Kolkata',
  '33': 'Chennai',
  '29': 'Bengaluru',
  '24': 'Ahmedabad',
  '23': 'Bhopal'
};

// POST /api/parties/verify-gstin — Verify GSTIN and return auto-filled company profile
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
  const state = STATE_MAP[stateCode] || 'Uttar Pradesh';
  const panLetters = cleanGstin.substring(2, 7);

  // Generate deterministic details based on the GSTIN
  const companyIndex = (panLetters.charCodeAt(0) + panLetters.charCodeAt(1)) % MOCK_COMPANIES.length;
  const baseCompany = MOCK_COMPANIES[companyIndex];
  const companyName = `${baseCompany} (${panLetters})`;

  const city = MOCK_CITIES[stateCode] || 'Varanasi';
  const sector = 1 + (panLetters.charCodeAt(2) % 20);
  const plot = 100 + (panLetters.charCodeAt(3) % 90);
  const billingAddress = `Plot No. ${plot}, Sector ${sector}, Industrial Area, ${city}, ${state}`;

  res.json({
    companyName,
    billingAddress,
    state,
    placeOfSupply: `${stateCode}-${state}`
  });
});

module.exports = router;
