require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config');
const Firm = require('../models/Firm');
const User = require('../models/User');
const UserFirm = require('../models/UserFirm');
const SystemSettings = require('../models/SystemSettings');
const tenantPlugin = require('../utils/tenantPlugin');

const EXCLUDED = new Set(['User','Firm','UserFirm','RefreshSession','Job','WebhookEvent','RolePermission','Otp','IdempotencyKey']);
async function main() {
  if (config.isProduction && process.env.MIGRATION_CONFIRM !== 'YES') {
    throw new Error('Production migration requires MIGRATION_CONFIRM=YES. Take and verify a backup first.');
  }
  await mongoose.connect(config.mongoUri);
  let firm = await Firm.findOne().sort({ createdAt: 1 });
  if (!firm) {
    const settings = await SystemSettings.findOne({ key: 'company_config' }).lean();
    firm = await Firm.create({ name: settings?.firmName || 'Default Firm', legalName: settings?.firmName || '', gstin: settings?.firmGstin || '', email: settings?.firmEmail || '', phone: settings?.firmPhone || '', address: settings?.firmAddress || '', stateCode: settings?.stateUtCode || '' });
  }
  const users = await User.find({}).lean();
  for (const user of users) {
    const exists = await UserFirm.exists({ userId: user._id, firmId: firm._id });
    if (!exists) await UserFirm.create({ userId: user._id, firmId: firm._id, role: user.role, isDefault: true });
  }
  const models = mongoose.modelNames().filter(n => !EXCLUDED.has(n));
  const report=[];
  for (const name of models) {
    const Model = mongoose.model(name);
    if (!Model.schema.path('firmId')) Model.schema.add({ firmId: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', index: true } });
    const result = await Model.updateMany({ firmId: { $exists: false } }, { $set: { firmId: firm._id } });
    report.push({ model:name, matched:result.matchedCount, modified:result.modifiedCount });
    try { await Model.syncIndexes(); } catch (e) { report.push({ model:name, indexError:e.message }); }
  }
  console.log(JSON.stringify({ firmId: String(firm._id), migratedUsers: users.length, models: report }, null, 2));
  await mongoose.disconnect();
}
main().catch(err => { console.error(err); process.exit(1); });
