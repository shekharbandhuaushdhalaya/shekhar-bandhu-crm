const RolePermission = require('../models/RolePermission');
const { hasPermission } = require('../utils/permissions');

const permissionCache = new Map();
const CACHE_TTL = 60 * 1000;
let lastCacheClear = Date.now();

async function getRolePermissions(role) {
  const now = Date.now();
  if (now - lastCacheClear > CACHE_TTL) {
    permissionCache.clear();
    lastCacheClear = now;
  }
  if (permissionCache.has(role)) {
    return permissionCache.get(role);
  }
  const perms = await RolePermission.getEffectivePermissions(role);
  permissionCache.set(role, perms);
  return perms;
}

function clearPermissionCache() {
  permissionCache.clear();
  lastCacheClear = Date.now();
}

function authorize(...requiredPermissions) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const role = req.user.role;

      if (requiredPermissions.length === 0) {
        return next();
      }

      const rolePermissions = await getRolePermissions(role);

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
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (allowedRoles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({
      error: `Access denied. Required role(s): ${allowedRoles.join(', ')}`,
    });
  };
}

module.exports = { authorize, roleAuthorize, clearPermissionCache, getRolePermissions };
