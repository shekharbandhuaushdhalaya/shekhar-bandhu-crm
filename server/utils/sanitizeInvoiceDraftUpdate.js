const PROTECTED_DRAFT_FIELDS = new Set([
  '_id', '__v', 'createdAt', 'updatedAt', 'firmId', 'tenantId',
  'type', 'invoiceNo', 'firmDetails', 'isFinalized', 'status', 'amountPaid',
  'payments', 'sourceDocType', 'sourceDocId'
]);

function sanitizeInvoiceDraftUpdate(updateData = {}) {
  if (!updateData || typeof updateData !== 'object' || Array.isArray(updateData)) return {};
  return Object.fromEntries(
    Object.entries(updateData).filter(([field]) => {
      if (field.startsWith('
  );
}

module.exports = { sanitizeInvoiceDraftUpdate, PROTECTED_DRAFT_FIELDS };
) || field.includes('.') || ['__proto__', 'prototype', 'constructor'].includes(field)) return false;
      return !PROTECTED_DRAFT_FIELDS.has(field);
    })
  );
}

module.exports = { sanitizeInvoiceDraftUpdate, PROTECTED_DRAFT_FIELDS };
