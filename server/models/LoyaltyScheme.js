const mongoose = require('mongoose');

const loyaltySchemeSchema = new mongoose.Schema({
  schemeName: { type: String, required: true, trim: true },
  tier: {
    type: String,
    enum: ['silver', 'gold', 'platinum'],
    required: true,
    unique: true
  },
  minAnnualPurchaseAmount: { type: Number, required: true },
  discountPercent: { type: Number, required: true, min: 0, max: 100 },
  bonusRewardPointsPerThousand: { type: Number, default: 10 },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('LoyaltyScheme', loyaltySchemeSchema);
