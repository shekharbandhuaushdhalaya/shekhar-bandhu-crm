const Firm = require('../models/Firm');
const { runWithTenant } = require('../utils/tenantContext');

async function publicTenant(req, res, next) {
  try {
    const configuredFirmId = String(process.env.PUBLIC_FIRM_ID || '').trim();

    // Never guess the tenant in production. A public storefront must be explicitly
    // bound to one firm or it stays unavailable. This prevents cross-tenant leakage
    // when additional firms are added later.
    if (process.env.NODE_ENV === 'production' && !configuredFirmId) {
      return res.status(503).json({ error: 'Public storefront is not configured' });
    }

    const firm = configuredFirmId
      ? await Firm.findOne({ _id: configuredFirmId, active: true }).lean()
      // Local/test convenience only. Production never reaches this fallback.
      : await Firm.findOne({ active: true }).sort({ createdAt: 1 }).lean();

    if (!firm) return res.status(503).json({ error: 'Public storefront is not configured' });

    req.publicFirmId = String(firm._id);
    return runWithTenant({ firmId: firm._id, public: true }, next);
  } catch (_) {
    return res.status(503).json({ error: 'Public storefront is unavailable' });
  }
}

module.exports = { publicTenant };
