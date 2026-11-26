/**
 * Resolve one GRN line to exactly one purchase-order line.
 * Legacy POs may contain duplicate item identities even though new PO creation rejects them.
 */
function resolvePurchaseOrderItem(poItems, grnItem) {
  const matches = (poItems || []).filter(item =>
    (grnItem.rawMaterialId && item.rawMaterialId && String(item.rawMaterialId) === String(grnItem.rawMaterialId)) ||
    (grnItem.productId && item.productId && String(item.productId) === String(grnItem.productId))
  );
  if (matches.length === 0) {
    throw Object.assign(new Error('GRN item is not present on the purchase order'), {
      statusCode: 400,
      code: 'PO_ITEM_NOT_FOUND'
    });
  }
  if (matches.length > 1) {
    throw Object.assign(new Error('Multiple purchase-order lines match this item; correct the purchase order before receiving goods'), {
      statusCode: 409,
      code: 'PO_ITEM_MATCH_AMBIGUOUS'
    });
  }
  return matches[0];
}

module.exports = resolvePurchaseOrderItem;
