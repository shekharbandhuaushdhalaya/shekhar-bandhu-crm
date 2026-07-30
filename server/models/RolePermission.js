const mongoose = require('mongoose');
const { getDefaultPermissionsForRole } = require('../utils/permissions');

const BUILTIN_ROLES = ['admin', 'manager', 'agent'];

const rolePermissionSchema = new mongoose.Schema({
  role: {
    type: String,
    required: true,
    unique: true,
  },
  permissions: {
    type: [String],
    default: [],
  },
  mfaPermissions: {
    type: [String],
    default: [],
  },
  label: { type: String, default: '' },
  description: { type: String, default: '' },
  isCustom: { type: Boolean, default: false },
}, { timestamps: true });

rolePermissionSchema.statics.getEffectivePermissions = async function (role) {
  const doc = await this.findOne({ role });
  if (doc && doc.permissions) return { permissions: doc.permissions, mfaPermissions: doc.mfaPermissions || [] };
  return { permissions: getDefaultPermissionsForRole(role), mfaPermissions: [] };
};

rolePermissionSchema.statics.seedDefaults = async function () {
  for (const role of BUILTIN_ROLES) {
    const existing = await this.findOne({ role });
    if (!existing) {
      await this.create({
        role,
        permissions: getDefaultPermissionsForRole(role),
        label: role.charAt(0).toUpperCase() + role.slice(1),
        description: `${role} role with default permissions`,
      });
    }
  }
};

module.exports = mongoose.model('RolePermission', rolePermissionSchema);
module.exports.BUILTIN_ROLES = BUILTIN_ROLES;
