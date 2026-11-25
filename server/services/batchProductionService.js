const RawMaterial = require('../models/RawMaterial');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const BillOfMaterials = require('../models/BillOfMaterials');

/**
 * Parses size strings like "200ml", "450 ml", "1 L", "500g" to numeric value in ml/grams.
 */
function getSizeInMl(sizeStr) {
  if (!sizeStr || typeof sizeStr !== 'string') return 0;
  const s = sizeStr.trim().toLowerCase();
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(ml|l|liter|liters|g|gm|kg|pcs|pc|tablet|tablets|vati)?$/);
  if (!match) {
    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
  }
  const val = parseFloat(match[1]);
  const unit = match[2] || '';
  if (unit === 'l' || unit === 'liter' || unit === 'liters') return val * 1000;
  if (unit === 'kg') return val * 1000;
  return val;
}

/**
 * Consume raw material starting from batch's ingredientsReserved, falling back to FEFO over available stock.
 */
async function consumeFromReservation() {
  throw Object.assign(
    new Error('MATERIAL_DISPENSING_REQUIRED: raw-material stock can only be issued through independently verified batch material dispensing'),
    { code: 'MATERIAL_DISPENSING_REQUIRED' }
  );
}
/**
 * Release all remaining unconsumed ingredientsReserved on batch.
 */
async function releaseAllReservations(batch, session) {
  if (!batch.ingredientsReserved || batch.ingredientsReserved.length === 0) return;
  for (const res of batch.ingredientsReserved) {
    if (!res.rawMaterialEntryId || !res.qtyReserved || res.qtyReserved <= 0) continue;
    let query = RawMaterialEntry.findById(res.rawMaterialEntryId);
    if (session) query = query.session(session);
    const entry = await query;
    if (entry) {
      entry.reservedQty = Math.max(0, Number(((entry.reservedQty || 0) - res.qtyReserved).toFixed(2)));
      await entry.save(session ? { session } : undefined);
    }
  }
  batch.ingredientsReserved = [];
}

/**
 * Verify that packaging material has already been issued through the independently
 * verified dispensing workflow. This helper must never deduct stock itself.
 */
async function deductPackagingMaterials(batch, outputQtyOrYields) {
  if (batch.packagingDeducted) return;
  if (!batch.bomSnapshot || !Array.isArray(batch.bomSnapshot.ingredients)) {
    throw new Error('BATCH_BOM_SNAPSHOT_REQUIRED: packaging reconciliation requires the batch-pinned formula snapshot');
  }
  const itemsToProcess = Array.isArray(outputQtyOrYields)
    ? outputQtyOrYields
    : [{ actualYieldQty: Number(outputQtyOrYields) || 0 }];
  const totalActualOutput = itemsToProcess.reduce((sum, item) => sum + Math.max(0, Number(item.actualYieldQty) || 0), 0);
  if (totalActualOutput <= 0) throw new Error('ACTUAL_PACKAGING_OUTPUT_REQUIRED: record actual packed output before packaging reconciliation');
  const packagingIngredients = batch.bomSnapshot.ingredients.filter(ingredient =>
    ingredient.itemType === 'packaging'
  );
  for (const ingredient of packagingIngredients) {
    const requiredQty = Number(ingredient.qtyRequired || 0) * totalActualOutput;
    const stageName = String(ingredient.stageName || '').trim().toLowerCase();
    const stageIndex = stageName
      ? (batch.stages || []).findIndex(stage => String(stage.name || '').trim().toLowerCase() === stageName)
      : -1;
    if (stageIndex < 0) {
      throw new Error('PACKAGING_STAGE_ASSIGNMENT_REQUIRED: packaging material ' +
        String(ingredient.rawMaterialId) + ' must be assigned to a batch manufacturing stage before reconciliation');
    }
    const dispensedQty = (batch.ingredientsConsumed || [])
      .filter(consumed => String(consumed.rawMaterialId) === String(ingredient.rawMaterialId) &&
        Number(consumed.stageIndex) === stageIndex && Boolean(consumed.dispensingNo))
      .reduce((sum, consumed) => sum + Number(consumed.qtyConsumed || 0), 0);
    if (dispensedQty + 0.0001 < requiredQty) {
      throw new Error('PACKAGING_DISPENSING_REQUIRED: packaging material ' + String(ingredient.rawMaterialId) +
        ' requires ' + requiredQty.toFixed(2) + ' units verified through the independent dispensing workflow; ' +
        dispensedQty.toFixed(2) + ' verified');
    }
  }
  batch.packagingDeducted = true;
}

/**
 * Calculates aggregate raw material sufficiency across multiple planned batches in a production plan horizon.
 */
async function calculateAggregateMaterialSufficiency(batchIds = []) {
  const BatchProduction = require('../models/BatchProduction');
  const batches = await BatchProduction.find({ _id: { $in: batchIds } }).populate('bomId').lean();

  const demandMap = {};

  for (const b of batches) {
    const bom = b.bomId;
    if (!bom || !bom.ingredients) continue;
    const batchPlannedOutput = b.plannedOutputQty || 100;
    const basis = bom.formulationBasis || 100;
    const multiplier = batchPlannedOutput / basis;

    for (const ing of bom.ingredients) {
      if (!ing.rawMaterialId) continue;
      const rmIdStr = ing.rawMaterialId.toString();
      const required = ing.qtyRequired * multiplier;

      if (!demandMap[rmIdStr]) {
        demandMap[rmIdStr] = {
          rawMaterialId: ing.rawMaterialId,
          totalRequired: 0,
          unit: ing.unit || 'kg'
        };
      }
      demandMap[rmIdStr].totalRequired += required;
    }
  }

  const rmIds = Object.keys(demandMap);
  const rawMaterials = await RawMaterial.find({ _id: { $in: rmIds } }).lean();
  const rmEntries = await RawMaterialEntry.find({ rawMaterialId: { $in: rmIds }, qcStatus: 'approved', $or: [{ expiryDate: null }, { expiryDate: { $gt: new Date() } }] }).lean();

  const report = [];
  let overallSufficient = true;

  for (const rmIdStr of rmIds) {
    const demand = demandMap[rmIdStr];
    const rm = rawMaterials.find(r => r._id.toString() === rmIdStr);
    const rmLots = rmEntries.filter(e => e.rawMaterialId.toString() === rmIdStr && e.qcStatus === 'approved');

    const availableStock = rmLots.reduce((sum, e) => sum + Math.max(0, (e.qty || 0) - (e.reservedQty || 0)), 0);
    const totalRequired = Number(demand.totalRequired.toFixed(2));
    const shortageQty = Math.max(0, Number((totalRequired - availableStock).toFixed(2)));
    const isSufficient = shortageQty <= 0.001;

    if (!isSufficient) overallSufficient = false;

    report.push({
      rawMaterialId: demand.rawMaterialId,
      rawMaterialName: rm ? rm.name : 'Raw Material',
      sku: rm ? rm.sku : '',
      unit: demand.unit,
      totalRequired,
      availableStock: Number(availableStock.toFixed(2)),
      shortageQty,
      isSufficient
    });
  }

  return {
    overallSufficient,
    totalPlannedBatches: batches.length,
    materials: report
  };
}

module.exports = {
  getSizeInMl,
  consumeFromReservation,
  releaseAllReservations,
  deductPackagingMaterials,
  calculateAggregateMaterialSufficiency
};
