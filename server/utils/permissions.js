const PERMISSIONS = {
  product:       ['view', 'create', 'edit', 'delete', 'viewPricing', 'editPricing'],
  inventory:     ['view', 'create', 'edit', 'delete', 'viewValue'],
  vendor:        ['view', 'create', 'edit', 'delete'],
  customer:      ['view', 'create', 'edit', 'delete'],
  invoice:       ['view', 'create', 'edit', 'delete', 'markPaid'],
  challan:       ['view', 'create', 'edit', 'delete', 'finalize'],
  quotation:     ['view', 'create', 'edit', 'delete'],
  report:        ['view'],
  user:          ['view', 'create', 'edit', 'delete'],
  settings:      ['view', 'edit'],
  audit:         ['view'],
  analytics:     ['query'],
  cash:          ['access'],
  payment:       ['view', 'create'],
  dispatch:      ['view', 'create', 'edit', 'delete'],
  manufacturing: ['view', 'create', 'edit', 'delete', 'complete', 'verify', 'release', 'correctReleased'],
  task:          ['view', 'create', 'edit', 'delete'],
  contact:       ['view', 'create', 'edit', 'delete'],
  mr:            ['view', 'create', 'edit', 'delete', 'attendance', 'visits', 'expenses', 'approveExpenses'],
  campaign:      ['view', 'create', 'edit', 'delete', 'publish', 'analytics'],
  rbac:          ['manage'],
  stockmovement: ['view', 'create', 'edit', 'delete'],
  pricing:       ['view', 'edit', 'delete'],
};

const ALL_PERMISSIONS = [];
for (const [resource, actions] of Object.entries(PERMISSIONS)) {
  for (const action of actions) {
    ALL_PERMISSIONS.push(`${resource}:${action}`);
  }
}

function getAllPermissions() {
  return [...ALL_PERMISSIONS];
}

function getResourceActions(resource) {
  return PERMISSIONS[resource] || [];
}

function hasPermission(rolePermissions, required) {
  if (!rolePermissions || !required) return false;
  if (rolePermissions.includes('*')) return true;
  return rolePermissions.includes(required);
}

function getDefaultPermissionsForRole(role) {
  switch (role) {
    case 'admin':
      return [...ALL_PERMISSIONS, '*'];
    case 'manager':
      return [
        'product:view', 'product:create', 'product:edit', 'product:viewPricing', 'product:editPricing',
        'inventory:view', 'inventory:create', 'inventory:edit', 'inventory:viewValue',
        'vendor:view', 'vendor:create', 'vendor:edit',
        'customer:view', 'customer:create', 'customer:edit',
        'invoice:view', 'invoice:create', 'invoice:edit', 'invoice:markPaid',
        'challan:view', 'challan:create', 'challan:edit', 'challan:finalize',
        'quotation:view', 'quotation:create', 'quotation:edit',
        'report:view',
        'analytics:query',
        'payment:view', 'payment:create',
        'dispatch:view', 'dispatch:create', 'dispatch:edit',
        'manufacturing:view', 'manufacturing:create', 'manufacturing:edit',
        'task:view', 'task:create', 'task:edit',
        'contact:view', 'contact:create', 'contact:edit',
        'mr:view', 'mr:create', 'mr:edit', 'mr:attendance', 'mr:visits', 'mr:expenses', 'mr:approveExpenses',
        'cash:access',
        'stockmovement:view', 'stockmovement:create', 'stockmovement:edit',
      ];
    case 'agent':
      return [
        'product:view',
        'inventory:view',
        'customer:view', 'customer:create', 'customer:edit',
        'invoice:view', 'invoice:create',
        'challan:view',
        'quotation:view', 'quotation:create',
        'payment:view', 'payment:create',
        'dispatch:view',
        'manufacturing:view',
        'task:view', 'task:create',
        'contact:view', 'contact:create', 'contact:edit',
        'mr:attendance', 'mr:visits', 'mr:expenses',
        'stockmovement:view',
      ];
    default:
      return [];
  }
}

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS,
  getAllPermissions,
  getResourceActions,
  hasPermission,
  getDefaultPermissionsForRole,
};
