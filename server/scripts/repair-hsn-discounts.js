require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const StockMovement = require('../models/StockMovement');
const Firm = require('../models/Firm');
const { runWithTenant } = require('../utils/tenantContext');

function validateMigrationConfig(env = process.env) {
  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (!mongoUri) throw new Error('MONGODB_URI is required.');
  const firmId = String(env.MIGRATION_FIRM_ID || '').trim();
  if (!mongoose.Types.ObjectId.isValid(firmId)) {
    throw new Error('MIGRATION_FIRM_ID must be a valid MongoDB ObjectId.');
  }
  const apply = env.REPAIR_HSN_DISCOUNTS_APPLY === 'YES';
  if (apply && env.REPAIR_HSN_DISCOUNTS_CONFIRM !== 'YES') {
    throw new Error('Applying HSN/discount repairs requires REPAIR_HSN_DISCOUNTS_CONFIRM=YES.');
  }
  return { mongoUri, firmId, apply };
}

/**
 * Only repair from an explicitly linked StockMovement snapshot. Current Product
 * master data is deliberately not used: its HSN/MRP/discount may have changed
 * since the invoice was issued.
 */
function getLinkedMovementId(invoice) {
  if (!invoice || invoice.sourceDocType !== 'StockMovement' || !invoice.sourceDocId) return null;
  const id = String(invoice.sourceDocId);
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

function planItemRepairs(invoice, movement) {
  const updates = {};
  const stats = { hsn: 0, mrp: 0, discountPercent: 0, ambiguousItems: 0 };
  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  const movementItems = Array.isArray(movement?.items) ? movement.items : [];

  items.forEach((item, index) => {
    if (!item?.productId) return;
    const matches = movementItems.filter(candidate =>
      candidate?.productId && String(candidate.productId) === String(item.productId)
    );
    if (matches.length !== 1) {
      if (matches.length > 1) stats.ambiguousItems += 1;
      return;
    }
    const source = matches[0];
    const set = {};
    const currentHsn = String(item.hsnCode || '').trim();
    const sourceHsn = String(source.hsnCode || '').trim();
    if (!currentHsn && sourceHsn) {
      set.hsnCode = sourceHsn;
      stats.hsn += 1;
    }

    const currentMrp = Number(item.mrp);
    const sourceMrp = Number(source.mrp);
    if ((!Number.isFinite(currentMrp) || currentMrp <= 0) &&
        Number.isFinite(sourceMrp) && sourceMrp > 0) {
      set.mrp = sourceMrp;
      stats.mrp += 1;
    }

    const currentDiscount = Number(item.discountPercent);
    const sourceDiscount = Number(source.discountPercent);
    if ((!Number.isFinite(currentDiscount) || currentDiscount <= 0) &&
        Number.isFinite(sourceDiscount) && sourceDiscount > 0 &&
        sourceDiscount <= 100) {
      set.discountPercent = sourceDiscount;
      stats.discountPercent += 1;
    }

    if (Object.keys(set).length) updates[`items.${index}`] = set;
  });

  return { updates, stats };
}

async function repairHsnDiscounts(env = process.env) {
  const { mongoUri, firmId, apply } = validateMigrationConfig(env);
  let failed = false;
  const summary = {
    invoicesChecked: 0,
    invoicesWithRepairs: 0,
    invoicesUpdated: 0,
    invoicesWithoutExplicitMovementLink: 0,
    linkedMovementsNotFound: 0,
    hsnCandidates: 0,
    mrpCandidates: 0,
    discountCandidates: 0,
    ambiguousItems: 0,
    samples: []
  };

  try {
    await mongoose.connect(mongoUri);
    const firm = await Firm.findById(firmId).select('_id name').lean();
    if (!firm) throw new Error('MIGRATION_FIRM_ID does not match an existing firm.');

    await runWithTenant({ firmId: firm._id }, async () => {
      const invoices = await Invoice.find({
        $or: [
          { 'items.hsnCode': { $exists: false } },
          { 'items.hsnCode': '' },
          { 'items.mrp': { $exists: false } },
          { 'items.mrp': null },
          { 'items.mrp': 0 },
          { 'items.discountPercent': { $exists: false } },
          { 'items.discountPercent': null },
          { 'items.discountPercent': 0 }
        ]
      }).select('_id invoiceNo sourceDocType sourceDocId items').lean();

      summary.invoicesChecked = invoices.length;
      for (const invoice of invoices) {
        const movementId = getLinkedMovementId(invoice);
        if (!movementId) {
          summary.invoicesWithoutExplicitMovementLink += 1;
          continue;
        }

        const movement = await StockMovement.findById(movementId).select('_id items').lean();
        if (!movement) {
          summary.linkedMovementsNotFound += 1;
          continue;
        }

        const { updates, stats } = planItemRepairs(invoice, movement);
        summary.hsnCandidates += stats.hsn;
        summary.mrpCandidates += stats.mrp;
        summary.discountCandidates += stats.discountPercent;
        summary.ambiguousItems += stats.ambiguousItems;
        if (!Object.keys(updates).length) continue;

        summary.invoicesWithRepairs += 1;
        if (summary.samples.length < 25) {
          summary.samples.push({
            invoiceId: String(invoice._id),
            invoiceNo: invoice.invoiceNo,
            hsn: stats.hsn,
            mrp: stats.mrp,
            discountPercent: stats.discountPercent,
            ambiguousItems: stats.ambiguousItems
          });
        }

        if (apply) {
          const set = {};
          for (const [path, values] of Object.entries(updates)) {
            for (const [field, value] of Object.entries(values)) set[`${path}.${field}`] = value;
          }
          const result = await Invoice.updateOne({ _id: invoice._id }, { $set: set });
          if (result.modifiedCount > 0) summary.invoicesUpdated += 1;
        }
      }

      console.log(`${apply ? 'HSN/discount repair applied' : 'HSN/discount repair dry run'} for firm ${firm._id}:`, JSON.stringify(summary, null, 2));
      if (!apply) {
        console.log('No records changed. Only exact StockMovement snapshots are eligible; current Product master data is never used.');
        console.log('Review the report, then set REPAIR_HSN_DISCOUNTS_APPLY=YES and REPAIR_HSN_DISCOUNTS_CONFIRM=YES to apply.');
      }
    });
  } catch (error) {
    failed = true;
    console.error('HSN/discount repair failed:', error.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      try { await mongoose.disconnect(); }
      catch (error) { failed = true; console.error('Database disconnect failed:', error.message); }
    }
  }

  if (failed) process.exitCode = 1;
  return summary;
}

if (require.main === module) repairHsnDiscounts();
module.exports = {
  repairHsnDiscounts,
  validateMigrationConfig,
  getLinkedMovementId,
  planItemRepairs
};
