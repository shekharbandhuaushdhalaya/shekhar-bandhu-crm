const jwt = require('jsonwebtoken');
const config = require('../src/config');
const User = require('../models/User');
const UserFirm = require('../models/UserFirm');
const { runWithTenant } = require('../utils/tenantContext');
const { trackAgentActivity } = require('../utils/agentTracker');

async function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized: No token provided', requestId: req.requestId });
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const dbUser = await User.findById(decoded.id).select('_id name email role canAccessCash mustChangePassword mfaEnabled').lean();
    if (!dbUser) return res.status(401).json({ error: 'User account no longer exists' });
    let requestedFirmId = req.headers['x-firm-id'] || decoded.firmId || null;
    let membership = requestedFirmId ? await UserFirm.findOne({ userId: dbUser._id, firmId: requestedFirmId, active: true }).lean() : null;
    if (!membership) membership = await UserFirm.findOne({ userId: dbUser._id, isDefault: true, active: true }).lean();
    if (!membership) membership = await UserFirm.findOne({ userId: dbUser._id, active: true }).sort({ createdAt: 1 }).lean();
    if (config.enforceTenancy && !membership) return res.status(403).json({ error: 'No active firm membership' });
    const firmId = membership?.firmId || null;
    req.user = { ...dbUser, id: String(dbUser._id), firmId: firmId ? String(firmId) : null, firmRole: membership?.role || dbUser.role, role: membership?.role || dbUser.role };
    trackAgentActivity(dbUser._id, req);
    return runWithTenant({ firmId, userId: String(dbUser._id) }, next);
  } catch (_) { return res.status(403).json({ error: 'Forbidden: Invalid or expired token' }); }
}
module.exports = { authenticateJWT };
