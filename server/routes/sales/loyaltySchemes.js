const express = require('express');
const LoyaltyScheme = require('../../models/LoyaltyScheme');
const Customer = require('../../models/Customer');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/loyalty-schemes — List active loyalty volume pricing tiers
router.get('/', async (req, res) => {
  try {
    let schemes = await LoyaltyScheme.find({ isActive: true }).sort({ minAnnualPurchaseAmount: 1 }).lean();
    if (schemes.length === 0) {
      // Seed default AYUSH distributor loyalty tiers if empty
      schemes = await LoyaltyScheme.insertMany([
        { schemeName: 'Silver Distributor Tier', tier: 'silver', minAnnualPurchaseAmount: 100000, discountPercent: 3, bonusRewardPointsPerThousand: 10 },
        { schemeName: 'Gold Distributor Tier', tier: 'gold', minAnnualPurchaseAmount: 500000, discountPercent: 6, bonusRewardPointsPerThousand: 25 },
        { schemeName: 'Platinum Super Stockist Tier', tier: 'platinum', minAnnualPurchaseAmount: 1500000, discountPercent: 10, bonusRewardPointsPerThousand: 50 }
      ]);
    }
    res.json(schemes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/loyalty-schemes/evaluate/:customerId — Evaluate customer annual sales for loyalty tier qualification
router.get('/evaluate/:customerId', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.customerId).lean();
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const Invoice = require('../../models/Invoice');
    const d365 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    const invoices = await Invoice.find({
      type: 'sale',
      isFinalized: true,
      date: { $gte: d365 },
      $or: [{ customerName: customer.name }, { customerName: customer.company }]
    }).select('nettTotal amount').lean();

    const annualVolume = invoices.reduce((sum, inv) => sum + (inv.nettTotal || inv.amount || 0), 0);

    const schemes = await LoyaltyScheme.find({ isActive: true }).sort({ minAnnualPurchaseAmount: -1 }).lean();
    const qualifiedTier = schemes.find(s => annualVolume >= s.minAnnualPurchaseAmount);

    res.json({
      customerId: customer._id,
      customerName: customer.company || customer.name,
      annualVolume: Number(annualVolume.toFixed(2)),
      qualifiedTier: qualifiedTier ? qualifiedTier.tier : 'standard',
      appliedDiscountPercent: qualifiedTier ? qualifiedTier.discountPercent : 0,
      rewardPointsEarned: qualifiedTier ? Math.floor((annualVolume / 1000) * qualifiedTier.bonusRewardPointsPerThousand) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
