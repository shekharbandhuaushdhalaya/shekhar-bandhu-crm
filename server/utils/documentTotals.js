/**
 * Shared utility for calculating line-item totals, GST breakdowns, and document grand total.
 */

function calculateItemTotals(items = [], isInterstate = false) {
  let totalBaseAmount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalPcs = 0;

  const processedItems = items.map((item) => {
    const qty = Number(item.qty || item.boxes || item.quantity || 0);
    const packing = Number(item.packing || 1);
    const rate = Number(item.rate || item.unitPrice || 0);
    const discount = Number(item.discount || 0);
    const gstRate = Number(item.gstRate || item.gstPercentage || 18);

    const pcs = qty * packing;
    const grossAmount = pcs * rate;
    const discountAmount = (grossAmount * discount) / 100;
    const taxableAmount = grossAmount - discountAmount;

    let cgstRate = 0;
    let sgstRate = 0;
    let igstRate = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (isInterstate) {
      igstRate = gstRate;
      igstAmount = (taxableAmount * igstRate) / 100;
    } else {
      cgstRate = gstRate / 2;
      sgstRate = gstRate / 2;
      cgstAmount = (taxableAmount * cgstRate) / 100;
      sgstAmount = (taxableAmount * sgstRate) / 100;
    }

    const itemTotal = taxableAmount + cgstAmount + sgstAmount + igstAmount;

    totalBaseAmount += taxableAmount;
    totalCgst += cgstAmount;
    totalSgst += sgstAmount;
    totalIgst += igstAmount;
    totalPcs += pcs;

    return {
      ...item,
      qty,
      packing,
      pcs,
      rate,
      discount,
      gstRate,
      taxableAmount: Number(taxableAmount.toFixed(2)),
      cgstAmount: Number(cgstAmount.toFixed(2)),
      sgstAmount: Number(sgstAmount.toFixed(2)),
      igstAmount: Number(igstAmount.toFixed(2)),
      totalAmount: Number(itemTotal.toFixed(2))
    };
  });

  const rawGrandTotal = totalBaseAmount + totalCgst + totalSgst + totalIgst;
  const roundedGrandTotal = Math.round(rawGrandTotal);
  const roundOff = Number((roundedGrandTotal - rawGrandTotal).toFixed(2));

  return {
    items: processedItems,
    totalPcs,
    baseAmount: Number(totalBaseAmount.toFixed(2)),
    cgst: Number(totalCgst.toFixed(2)),
    sgst: Number(totalSgst.toFixed(2)),
    igst: Number(totalIgst.toFixed(2)),
    roundOff,
    grandTotal: roundedGrandTotal
  };
}

module.exports = {
  calculateItemTotals
};
