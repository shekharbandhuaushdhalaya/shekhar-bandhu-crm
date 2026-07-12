const AuditLog = require('../models/AuditLog');

async function logAction({ userId, userName, userEmail, action, description, ipAddress, deviceInfo, details, req }) {
  try {
    let resolvedUserId = userId;
    let resolvedUserName = userName;
    let resolvedUserEmail = userEmail;
    let resolvedIp = ipAddress;
    let resolvedDevice = deviceInfo;

    // Auto-extract details from Express Request object if present
    if (req) {
      resolvedIp = resolvedIp || req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
      resolvedDevice = resolvedDevice || req.headers['user-agent'] || '';
      if (req.user) {
        resolvedUserId = resolvedUserId || req.user.id;
        resolvedUserName = resolvedUserName || req.user.name;
        resolvedUserEmail = resolvedUserEmail || req.user.email;
      }
    }

    await AuditLog.create({
      userId: resolvedUserId || null,
      userName: resolvedUserName || 'System / Anonymous',
      userEmail: resolvedUserEmail || '',
      action,
      description,
      ipAddress: resolvedIp,
      deviceInfo: resolvedDevice,
      details
    });
  } catch (err) {
    console.error('Failed to create audit log entry:', err);
  }
}

module.exports = { logAction };
