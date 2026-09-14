require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('../src/config');
const { runWithTenant } = require('../utils/tenantContext');

// Load every model before inspecting/synchronizing indexes. The old migration only
// loaded a handful of models, which meant most tenant/index migrations never ran.
for (const file of fs.readdirSync(path.join(__dirname, '..', 'models'))) {
  if (!file.endsWith('.js')) continue;
  require(path.join(__dirname, '..', 'models', file));
}

const Firm = mongoose.model('Firm');
const User = mongoose.model('User');
const UserFirm = mongoose.model('UserFirm');
const SystemSettings = mongoose.model('SystemSettings');
const RolePermission = mongoose.model('RolePermission');

function oid(value) {
  try { return new mongoose.Types.ObjectId(String(value)); } catch { return null; }
}

async function resolveMigrationFirm() {
  const requested = String(process.env.MIGRATION_FIRM_ID || '').trim();
  if (requested) {
    const id = oid(requested);
    if (!id) throw new Error('MIGRATION_FIRM_ID is not a valid MongoDB ObjectId');
    const firm = await Firm.findById(id).lean();
    if (!firm) throw new Error('MIGRATION_FIRM_ID does not match an existing Firm');
    return firm;
  }

  const firms = await Firm.find({}).sort({ createdAt: 1 }).limit(3).lean();
  if (firms.length === 1) return firms[0];
  if (firms.length > 1) {
    throw new Error('Multiple firms exist. Set MIGRATION_FIRM_ID explicitly before assigning legacy unscoped records.');
  }

  if (config.isProduction && process.env.MIGRATION_CREATE_DEFAULT_FIRM !== 'YES') {
    throw new Error('No Firm exists. Set MIGRATION_CREATE_DEFAULT_FIRM=YES (and MIGRATION_CONFIRM=YES) only after verifying the intended legacy company data.');
  }

  // Read the old unscoped settings document directly so tenant middleware cannot hide it.
  const settings = await SystemSettings.collection.findOne({ key: 'company_config' });
  return Firm.create({
    name: settings?.firmName || 'Default Firm',
    legalName: settings?.firmName || '',
    gstin: settings?.firmGstin || '',
    email: settings?.firmEmail || '',
    phone: settings?.firmPhone || '',
    address: settings?.firmAddress || '',
    stateCode: settings?.stateUtCode || '',
  });
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function uniqueNameMap(rows, fields) {
  const map = new Map();
  const duplicates = new Set();
  for (const row of rows) {
    for (const field of fields) {
      const key = normalizeName(row[field]);
      if (!key) continue;
      if (map.has(key) && String(map.get(key)) !== String(row._id)) duplicates.add(key);
      else map.set(key, row._id);
    }
  }
  for (const key of duplicates) map.delete(key);
  return map;
}

async function backfillTenantIds(firmId, report) {
  for (const name of mongoose.modelNames()) {
    const Model = mongoose.model(name);
    if (!Model.schema.path('firmId')) continue;
    const result = await Model.collection.updateMany(
      { $or: [{ firmId: { $exists: false } }, { firmId: null }] },
      { $set: { firmId } }
    );
    report.push({ step: 'firmId', model: name, matched: result.matchedCount, modified: result.modifiedCount });
  }
}

async function ensureUserMemberships(firmId, report) {
  const users = await User.find({}).lean();
  let created = 0;
  for (const user of users) {
    const exists = await UserFirm.exists({ userId: user._id, firmId });
    if (!exists) {
      await UserFirm.create({ userId: user._id, firmId, role: user.role || 'agent', isDefault: true, active: true });
      created += 1;
    }
  }
  report.push({ step: 'userMemberships', users: users.length, created });
}

async function normalizeLegacyInvoiceState(firmId, report) {
  const Invoice = mongoose.model('Invoice');
  const partial = await Invoice.collection.updateMany({ firmId, status: 'partial' }, { $set: { status: 'partially_paid' } });
  const rows = await Invoice.collection.find({ firmId, isFinalized: true }, { projection: { _id: 1, amount: 1, amountPaid: 1, status: 1 } }).toArray();
  let normalized = 0;
  for (const row of rows) {
    if (['cancelled', 'Cancelled'].includes(row.status)) continue;
    const total = Number(row.amount || 0);
    const paid = Number(row.amountPaid || 0);
    const status = paid <= 0 ? 'unpaid' : (paid + 0.01 >= total ? 'paid' : 'partially_paid');
    if (row.status !== status) {
      await Invoice.collection.updateOne({ _id: row._id }, { $set: { status } });
      normalized += 1;
    }
  }
  report.push({ step: 'invoiceStatus', partialRenamed: partial.modifiedCount, normalized });
}

async function backfillQcBuckets(firmId, report) {
  const InventoryEntry = mongoose.model('InventoryEntry');
  const RawMaterialEntry = mongoose.model('RawMaterialEntry');
  const finished = await InventoryEntry.collection.updateMany(
    { firmId, $or: [{ qcStatus: { $exists: false } }, { qcStatus: null }, { qcStatus: '' }] },
    { $set: { qcStatus: 'approved' } }
  );
  const raw = await RawMaterialEntry.collection.updateMany(
    { firmId, $or: [{ qcStatus: { $exists: false } }, { qcStatus: null }, { qcStatus: '' }] },
    { $set: { qcStatus: 'approved' } }
  );
  report.push({ step: 'qcBackfill', finished: finished.modifiedCount, rawMaterial: raw.modifiedCount });
}

async function backfillRawMaterialWarehouses(firmId, report, blockers) {
  const Warehouse = mongoose.model('Warehouse');
  const RawMaterialEntry = mongoose.model('RawMaterialEntry');
  const warehouses = await Warehouse.collection.find({ firmId }).toArray();
  const byId = new Map(warehouses.map(w => [String(w._id), w]));
  const byUnit = new Map(warehouses.filter(w => w.manufacturingUnitId).map(w => [String(w.manufacturingUnitId), w]));
  const manufacturing = warehouses.filter(w => w.type === 'manufacturing');
  const fallback = manufacturing.length === 1 ? manufacturing[0] : (warehouses.length === 1 ? warehouses[0] : null);

  const rows = await RawMaterialEntry.collection.find({ firmId }).toArray();
  let mapped = 0;
  const unresolved = [];
  for (const row of rows) {
    const current = row.warehouseId ? String(row.warehouseId) : '';
    let warehouse = current ? byId.get(current) : null;
    // Historical buggy code sometimes stored a ManufacturingUnit id in warehouseId.
    if (!warehouse && current) warehouse = byUnit.get(current) || null;
    if (!warehouse) warehouse = fallback;
    if (!warehouse) {
      if (Number(row.qty || 0) > 0 || Number(row.reservedQty || 0) > 0) unresolved.push(String(row._id));
      continue;
    }
    if (current !== String(warehouse._id) || row.warehouseName !== warehouse.name) {
      await RawMaterialEntry.collection.updateOne({ _id: row._id }, { $set: { warehouseId: warehouse._id, warehouseName: warehouse.name || '' } });
      mapped += 1;
    }
  }
  if (unresolved.length) blockers.push({ type: 'RAW_MATERIAL_WAREHOUSE_UNRESOLVED', count: unresolved.length, ids: unresolved.slice(0, 25) });
  report.push({ step: 'rawMaterialWarehouse', mapped, unresolved: unresolved.length });
}

async function backfillPartyLinks(firmId, report, blockers) {
  const Customer = mongoose.model('Customer');
  const Vendor = mongoose.model('Vendor');
  const Invoice = mongoose.model('Invoice');
  const Challan = mongoose.model('Challan');
  const Order = mongoose.model('Order');

  const customers = await Customer.collection.find({ firmId }, { projection: { _id: 1, name: 1, company: 1 } }).toArray();
  const vendors = await Vendor.collection.find({ firmId }, { projection: { _id: 1, name: 1, company: 1 } }).toArray();
  const customerMap = uniqueNameMap(customers, ['company', 'name']);
  const vendorMap = uniqueNameMap(vendors, ['company', 'name']);

  let invoiceCustomers = 0, invoiceVendors = 0, challanCustomers = 0, orderCustomers = 0;
  const saleInvoices = await Invoice.collection.find({ firmId, type: 'sale', $or: [{ customerId: null }, { customerId: { $exists: false } }] }).toArray();
  for (const row of saleInvoices) {
    const id = customerMap.get(normalizeName(row.customerName));
    if (id) { await Invoice.collection.updateOne({ _id: row._id }, { $set: { customerId: id } }); invoiceCustomers += 1; }
    else if (row.isFinalized) blockers.push({ type: 'FINALIZED_SALE_INVOICE_CUSTOMER_UNRESOLVED', id: String(row._id), invoiceNo: row.invoiceNo, name: row.customerName });
  }

  const purchaseInvoices = await Invoice.collection.find({ firmId, type: 'purchase', $or: [{ vendorId: null }, { vendorId: { $exists: false } }] }).toArray();
  for (const row of purchaseInvoices) {
    const id = vendorMap.get(normalizeName(row.supplierName));
    if (id) { await Invoice.collection.updateOne({ _id: row._id }, { $set: { vendorId: id } }); invoiceVendors += 1; }
    else if (row.isFinalized) blockers.push({ type: 'FINALIZED_PURCHASE_INVOICE_VENDOR_UNRESOLVED', id: String(row._id), invoiceNo: row.invoiceNo, name: row.supplierName });
  }

  const challans = await Challan.collection.find({ firmId, challanType: 'sale', $or: [{ customerId: null }, { customerId: { $exists: false } }] }).toArray();
  for (const row of challans) {
    const id = customerMap.get(normalizeName(row.partyName));
    if (id) { await Challan.collection.updateOne({ _id: row._id }, { $set: { customerId: id } }); challanCustomers += 1; }
    else if (row.status === 'finalized' || row.inventoryPostingStatus === 'posted') blockers.push({ type: 'POSTED_CHALLAN_CUSTOMER_UNRESOLVED', id: String(row._id), challanNo: row.challanNo, name: row.partyName });
  }

  const orders = await Order.collection.find({ firmId, $or: [{ customerId: null }, { customerId: { $exists: false } }] }).toArray();
  for (const row of orders) {
    const id = customerMap.get(normalizeName(row.name));
    if (id) { await Order.collection.updateOne({ _id: row._id }, { $set: { customerId: id } }); orderCustomers += 1; }
  }

  report.push({ step: 'partyLinks', invoiceCustomers, invoiceVendors, challanCustomers, orderCustomers });
}

function buildUniqueMatch(fields, options) {
  const clauses = [];
  if (options?.partialFilterExpression) clauses.push(options.partialFilterExpression);
  if (options?.sparse) {
    for (const key of Object.keys(fields)) clauses.push({ [key]: { $exists: true } });
  }
  if (!clauses.length) return null;
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

async function preflightUniqueIndexes(report, blockers) {
  for (const name of mongoose.modelNames()) {
    const Model = mongoose.model(name);
    if (!Model.schema.path('firmId')) continue;
    for (const [fields, options] of Model.schema.indexes()) {
      if (!options?.unique) continue;
      const keys = Object.keys(fields);
      const groupId = Object.fromEntries(keys.map(k => [k.replace(/\./g, '_'), `$${k}`]));
      const pipeline = [];
      const match = buildUniqueMatch(fields, options);
      if (match) pipeline.push({ $match: match });
      pipeline.push({ $group: { _id: groupId, count: { $sum: 1 }, ids: { $push: '$_id' } } }, { $match: { count: { $gt: 1 } } }, { $limit: 10 });
      let duplicates = [];
      try { duplicates = await Model.collection.aggregate(pipeline).toArray(); }
      catch (error) { blockers.push({ type: 'UNIQUE_PREFLIGHT_ERROR', model: name, fields: keys, error: error.message }); continue; }
      if (duplicates.length) blockers.push({ type: 'UNIQUE_INDEX_DUPLICATES', model: name, fields: keys, examples: duplicates });
    }
  }
  report.push({ step: 'uniqueIndexPreflight', blockers: blockers.filter(b => String(b.type).startsWith('UNIQUE_')).length });
}

async function syncTenantIndexes(report) {
  for (const name of mongoose.modelNames()) {
    const Model = mongoose.model(name);
    if (!Model.schema.path('firmId')) continue;
    const result = await Model.syncIndexes();
    report.push({ step: 'syncIndexes', model: name, dropped: result });
  }
}

async function main() {
  if (config.isProduction && process.env.MIGRATION_CONFIRM !== 'YES') {
    throw new Error('Production migration requires MIGRATION_CONFIRM=YES. Take and verify a backup first.');
  }
  await mongoose.connect(config.mongoUri);
  const report = [];
  const blockers = [];
  const firm = await resolveMigrationFirm();
  const firmId = firm._id;

  await backfillTenantIds(firmId, report);
  await ensureUserMemberships(firmId, report);
  await normalizeLegacyInvoiceState(firmId, report);
  await backfillQcBuckets(firmId, report);
  await backfillRawMaterialWarehouses(firmId, report, blockers);
  await backfillPartyLinks(firmId, report, blockers);

  await runWithTenant({ firmId }, async () => {
    await RolePermission.seedDefaults();
  });
  report.push({ step: 'roleDefaults', seeded: true });

  await preflightUniqueIndexes(report, blockers);
  if (blockers.length) {
    console.error(JSON.stringify({ ok: false, firmId: String(firmId), blockers, report }, null, 2));
    throw new Error(`Migration blocked by ${blockers.length} unresolved data/index issue(s). Resolve them before index synchronization.`);
  }

  await syncTenantIndexes(report);
  console.log(JSON.stringify({ ok: true, firmId: String(firmId), report }, null, 2));
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) { /* connection is already closed */ }
  process.exit(1);
});
