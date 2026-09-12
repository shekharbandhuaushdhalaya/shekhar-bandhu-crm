const Firm = require('../models/Firm');
const { runWithTenant } = require('../utils/tenantContext');

async function publicTenant(req, res, next) {
  try {
    const configuredFirmId = String(process.env.PUBLIC_FIRM_ID || '').trim();

    const firm = configuredFirmId
      ? await Firm.findOne({ _id: configuredFirmId, active: true }).lean()
      : await Firm.findOne({ active: true }).sort({ createdAt: 1 }).lean();

    if (!firm) return res.status(503).json({ error: 'Public storefront is not configured' });

    req.publicFirmId = String(firm._id);
    return runWithTenant({ firmId: firm._id, public: true }, next);
  } catch (_) {
    return res.status(503).json({ error: 'Public storefront is unavailable' });
  }
}

module.exports = { publicTenant };
