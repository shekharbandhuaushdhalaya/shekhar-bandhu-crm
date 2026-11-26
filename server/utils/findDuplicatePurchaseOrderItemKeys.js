function itemKey(item) {
  if (item?.rawMaterialId) return 'raw:' + String(item.rawMaterialId);
  if (item?.productId) return 'product:' + String(item.productId);
  return null;
}

function findDuplicatePurchaseOrderItemKeys(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items || []) {
    const key = itemKey(item);
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    else seen.add(key);
  }
  return duplicates;
}

module.exports = findDuplicatePurchaseOrderItemKeys;
