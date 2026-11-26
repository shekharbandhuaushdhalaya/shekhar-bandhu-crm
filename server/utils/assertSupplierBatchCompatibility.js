const assertSupplierBatchCompatibility = (existing, incomingVendorId) => {
  if (!existing) return;
  if (String(existing.vendorId || '') !== String(incomingVendorId || '')) {
    const error = new Error('Supplier batch is already attributed to a different supplier; keep supplier lots separate');
    error.statusCode = 409;
    error.code = 'RAW_MATERIAL_SUPPLIER_BATCH_CONFLICT';
    throw error;
  }
};

module.exports = assertSupplierBatchCompatibility;
