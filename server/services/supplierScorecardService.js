function buildSupplierScorecard({ purchaseOrders = [], goodsReceivedNotes = [], supplierReturns = [], qualifications = [], from, to }) {
  const acceptedQty = goodsReceivedNotes.reduce((sum, grn) =>
    sum + (grn.items || []).reduce((lineSum, item) => lineSum + Number(item.qtyAccepted || 0), 0), 0);
  const rejectedQty = goodsReceivedNotes.reduce((sum, grn) =>
    sum + (grn.items || []).reduce((lineSum, item) => lineSum + Number(item.qtyRejected || 0), 0), 0);
  const receivedQty = acceptedQty + rejectedQty;
  const supplierReturnQty = supplierReturns
    .filter(record => !['rejected', 'cancelled'].includes(record.status))
    .reduce((sum, record) => sum + Number(record.qty || 0), 0);

  const receiptsByPo = new Map();
  for (const grn of goodsReceivedNotes) {
    const key = String(grn.poId || '');
    if (!key) continue;
    const prior = receiptsByPo.get(key) || { acceptedByItem: new Map(), latestReceiptAt: null };
    for (const item of grn.items || []) {
      const itemKey = item.rawMaterialId ? 'raw:' + String(item.rawMaterialId) :
        item.productId ? 'product:' + String(item.productId) : '';
      if (itemKey) prior.acceptedByItem.set(itemKey, (prior.acceptedByItem.get(itemKey) || 0) + Number(item.qtyAccepted || 0));
    }
    const receiptDate = grn.receivedDate ? new Date(grn.receivedDate) : null;
    if (receiptDate && Number.isFinite(receiptDate.getTime()) &&
        (!prior.latestReceiptAt || receiptDate > prior.latestReceiptAt)) prior.latestReceiptAt = receiptDate;
    receiptsByPo.set(key, prior);
  }

  const eligibleDeliveryOrders = [];
  for (const po of purchaseOrders.filter(order => order.status !== 'cancelled' && order.expectedDeliveryDate)) {
    const receipt = receiptsByPo.get(String(po._id));
    if (!receipt) continue;
    const fullyReceived = (po.items || []).length > 0 && po.items.every(item => {
      const key = item.rawMaterialId ? 'raw:' + String(item.rawMaterialId) :
        item.productId ? 'product:' + String(item.productId) : '';
      return Boolean(key) && (receipt.acceptedByItem.get(key) || 0) >= Number(item.qtyOrdered || 0);
    });
    if (!fullyReceived || !receipt.latestReceiptAt) continue;
    const due = new Date(po.expectedDeliveryDate);
    if (!Number.isFinite(due.getTime())) continue;
    eligibleDeliveryOrders.push({
      poNo: po.poNo,
      expectedDeliveryDate: due,
      actualFinalReceiptDate: receipt.latestReceiptAt,
      onTime: receipt.latestReceiptAt <= due
    });
  }

  const currentDate = new Date();
  const latestQualificationByMaterial = new Map();
  for (const qualification of qualifications) {
    if (qualification.qualificationStatus !== 'approved' || !qualification.verifiedByUserId || !qualification.verifiedAt) continue;
    if (qualification.nextAuditDue && new Date(qualification.nextAuditDue) < currentDate) continue;
    const verifiedAt = new Date(qualification.verifiedAt);
    for (const materialId of qualification.rawMaterialIds || []) {
      const key = String(materialId);
      const prior = latestQualificationByMaterial.get(key);
      if (!prior || verifiedAt > prior.verifiedAt) {
        latestQualificationByMaterial.set(key, { verifiedAt, nextAuditDue: qualification.nextAuditDue || null });
      }
    }
  }

  const poMaterials = [...new Set(purchaseOrders.flatMap(po => (po.items || [])
    .filter(item => item.rawMaterialId).map(item => String(item.rawMaterialId))))];
  const qualifiedMaterials = poMaterials.filter(id => latestQualificationByMaterial.has(id));
  const currentQualificationCoverage = poMaterials.length
    ? Number((qualifiedMaterials.length / poMaterials.length * 100).toFixed(1))
    : null;

  const nonCancelledOrders = purchaseOrders.filter(order => order.status !== 'cancelled');
  const onTimeCount = eligibleDeliveryOrders.filter(order => order.onTime).length;
  const totalSpend = nonCancelledOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

  return {
    period: { from, to },
    purchaseOrderCount: nonCancelledOrders.length,
    totalPurchaseOrderValue: Number(totalSpend.toFixed(2)),
    completedOrdersWithPromisedDate: eligibleDeliveryOrders.length,
    onTimeDeliveryCount: onTimeCount,
    lateDeliveryCount: eligibleDeliveryOrders.length - onTimeCount,
    onTimeDeliveryRate: eligibleDeliveryOrders.length
      ? Number((onTimeCount / eligibleDeliveryOrders.length * 100).toFixed(1)) : null,
    receivedQuantity: Number(receivedQty.toFixed(3)),
    acceptedQuantity: Number(acceptedQty.toFixed(3)),
    rejectedQuantity: Number(rejectedQty.toFixed(3)),
    acceptanceRate: receivedQty ? Number((acceptedQty / receivedQty * 100).toFixed(1)) : null,
    rejectionRate: receivedQty ? Number((rejectedQty / receivedQty * 100).toFixed(1)) : null,
    supplierReturnRequestCount: supplierReturns.filter(record => !['rejected', 'cancelled'].includes(record.status)).length,
    supplierReturnQuantity: Number(supplierReturnQty.toFixed(3)),
    supplierReturnRate: receivedQty ? Number((supplierReturnQty / receivedQty * 100).toFixed(1)) : null,
    rawMaterialsOnPurchaseOrders: poMaterials.length,
    currentlyQualifiedRawMaterials: qualifiedMaterials.length,
    currentQualificationCoverage,
    qualifiedRawMaterialIds: qualifiedMaterials,
    deliveryEvidence: eligibleDeliveryOrders
  };
}

module.exports = { buildSupplierScorecard };
