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
async function consumeFromReservation(batch, rawMaterialId, qtyNeeded, session) {
  if (!qtyNeeded || qtyNeeded <= 0) return 0;
  let needed = Number(qtyNeeded);
  let totalConsumed = 0;

  const targetIdStr = rawMaterialId.toString();

  if (batch.ingredientsReserved && batch.ingredientsReserved.length > 0) {
    for (const res of batch.ingredientsReserved) {
      if (needed <= 0.0001) break;
      if (!res.rawMaterialId || res.rawMaterialId.toString() !== targetIdStr) continue;
      if ((res.qtyReserved || 0) <= 0.0001) continue;

      const draw = Math.min(needed, res.qtyReserved);
      const drawVal = Number(draw.toFixed(2));
      if (drawVal <= 0) continue;

      let query = RawMaterialEntry.findById(res.rawMaterialEntryId);
      if (session) query = query.session(session);
      const entry = await query;

      if (entry) {
        entry.reservedQty = Math.max(0, Number(((entry.reservedQty || 0) - drawVal).toFixed(2)));
        entry.qty = Math.max(0, Number(((entry.qty || 0) - drawVal).toFixed(2)));
        await entry.save(session ? { session } : undefined);

        batch.rawMaterialCost = Number(((batch.rawMaterialCost || 0) + drawVal * (entry.purchaseRate || 0)).toFixed(2));

        const existingConsumed = batch.ingredientsConsumed.find(
          c => c.rawMaterialEntryId?.toString() === entry._id.toString()
        );
        if (existingConsumed) {
          existingConsumed.qtyConsumed = Number((existingConsumed.qtyConsumed + drawVal).toFixed(2));
        } else {
          batch.ingredientsConsumed.push({
            rawMaterialId: entry.rawMaterialId,
            rawMaterialEntryId: entry._id,
            qtyConsumed: drawVal,
            batchNo: entry.batchNo
          });
        }

        res.qtyReserved = Number((res.qtyReserved - drawVal).toFixed(2));
        needed = Number((needed - drawVal).toFixed(2));
        totalConsumed = Number((totalConsumed + drawVal).toFixed(2));
      }
    }

    batch.ingredientsReserved = batch.ingredientsReserved.filter(r => (r.qtyReserved || 0) > 0.0001);
  }

  if (needed > 0.0001) {
    let query = RawMaterialEntry.find({
      rawMaterialId,
      warehouseId: batch.manufacturingUnitId
    });
    if (session) query = query.session(session);
    const entries = await query;

    entries.sort((a, b) => {
      if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate) - new Date(b.expiryDate);
      if (a.expiryDate && !b.expiryDate) return -1;
      if (!a.expiryDate && b.expiryDate) return 1;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    for (const entry of entries) {
      if (needed <= 0.0001) break;
      const avail = Math.max(0, (entry.qty || 0) - (entry.reservedQty || 0));
      if (avail <= 0.0001) continue;

      const deduct = Math.min(needed, avail);
      const deductVal = Number(deduct.toFixed(2));
      if (deductVal <= 0) continue;

      entry.qty = Math.max(0, Number((entry.qty - deductVal).toFixed(2)));
      await entry.save(session ? { session } : undefined);

      batch.rawMaterialCost = Number(((batch.rawMaterialCost || 0) + deductVal * (entry.purchaseRate || 0)).toFixed(2));

      const existingConsumed = batch.ingredientsConsumed.find(
        c => c.rawMaterialEntryId?.toString() === entry._id.toString()
      );
      if (existingConsumed) {
        existingConsumed.qtyConsumed = Number((existingConsumed.qtyConsumed + deductVal).toFixed(2));
      } else {
        batch.ingredientsConsumed.push({
          rawMaterialId: entry.rawMaterialId,
          rawMaterialEntryId: entry._id,
          qtyConsumed: deductVal,
          batchNo: entry.batchNo
        });
      }

      needed = Number((needed - deductVal).toFixed(2));
      totalConsumed = Number((totalConsumed + deductVal).toFixed(2));
    }
  }

  return totalConsumed;
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
 * Auto-deduct packaging materials (bottles, labels, boxes) when reaching packaging stage or completion.
 */
async function deductPackagingMaterials(batch, outputQtyOrYields) {
  if (batch.packagingDeducted) return;

  let itemsToProcess = [];
  if (Array.isArray(outputQtyOrYields)) {
    itemsToProcess = outputQtyOrYields;
  } else {
    itemsToProcess = [{
      productId: batch.productId.toString(),
      actualYieldQty: Number(outputQtyOrYields) || 0
    }];
  }

  for (const item of itemsToProcess) {
    const qty = Number(item.actualYieldQty);
    if (qty <= 0) continue;

    let bom = await BillOfMaterials.findOne({ productId: item.productId, isActive: true });
    if (!bom) {
      bom = await BillOfMaterials.findById(batch.bomId);
    }
    if (!bom) continue;

    const pkgIngs = bom.ingredients.filter(ing => ing.itemType === 'packaging');

    for (const ing of bom.ingredients) {
      if (ing.itemType !== 'packaging') {
        const rm = await RawMaterial.findById(ing.rawMaterialId);
        if (rm && rm.category === 'Packaging' && !pkgIngs.some(p => p.rawMaterialId.toString() === ing.rawMaterialId.toString())) {
          pkgIngs.push(ing);
        }
      }
    }

    if (!pkgIngs || pkgIngs.length === 0) continue;

    for (const ing of pkgIngs) {
      if (batch.ingredientsConsumed.some(c => c.rawMaterialId?.toString() === ing.rawMaterialId?.toString())) {
        continue;
      }
      const qtyNeeded = ing.qtyRequired * qty;
      const rm = await RawMaterial.findById(ing.rawMaterialId);
      if (!rm) continue;

      await consumeFromReservation(batch, ing.rawMaterialId, qtyNeeded);
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
  const rmEntries = await RawMaterialEntry.find({ rawMaterialId: { $in: rmIds } }).lean();

  const report = [];
  let overallSufficient = true;

  for (const rmIdStr of rmIds) {
    const demand = demandMap[rmIdStr];
    const rm = rawMaterials.find(r => r._id.toString() === rmIdStr);
    const rmLots = rmEntries.filter(e => e.rawMaterialId.toString() === rmIdStr);

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
