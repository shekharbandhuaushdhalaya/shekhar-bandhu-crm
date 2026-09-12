const RolePermission = require('../models/RolePermission');
const { hasPermission } = require('../utils/permissions');

const permissionCache = new Map();
const CACHE_TTL = 60 * 1000;
let lastCacheClear = Date.now();

async function getRolePermissions(role, firmId = null) {
  const now = Date.now();
  if (now - lastCacheClear > CACHE_TTL) {
    permissionCache.clear();
    lastCacheClear = now;
  }
  const key = `${firmId || 'no-firm'}:${role}`;
  if (permissionCache.has(key)) {
    return permissionCache.get(key);
  }
  const result = await RolePermission.getEffectivePermissions(role);
  const perms = result.permissions || [];
  permissionCache.set(key, perms);
  return perms;
}

function clearPermissionCache() {
  permissionCache.clear();
  lastCacheClear = Date.now();
}

function authorize(...requiredPermissions) {
  return async (req, res, next) => {
    try {
      if (!req.user || !(req.user.firmRole || req.user.role)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const role = req.user.firmRole || req.user.role;

      if (requiredPermissions.length === 0) {
        return next();
      }

      const rolePermissions = await getRolePermissions(role, req.user.firmId);

      if (rolePermissions.includes('*')) {
        return next();
      }

      const missing = requiredPermissions.filter(
        perm => !hasPermission(rolePermissions, perm)
      );

      if (missing.length > 0) {
        return res.status(403).json({
          error: `Access denied. Required permission(s): ${missing.join(', ')}`,
          missing,
        });
      }

      next();
    } catch (err) {
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}

function roleAuthorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !(req.user.firmRole || req.user.role)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const role = req.user.firmRole || req.user.role;
    if (allowedRoles.includes(role)) {
      return next();
    }
    return res.status(403).json({
      error: `Access denied. Required role(s): ${allowedRoles.join(', ')}`,
    });
  };
}

module.exports = { authorize, roleAuthorize, clearPermissionCache, getRolePermissions };
