/**
 * One-time migration helper.
 * Links existing manufacturing warehouses to their ManufacturingUnit by exact name,
 * where possible. It does not move stock or create Challans.
 */
const mongoose = require('mongoose');
const Warehouse = require('../models/Warehouse');
const ManufacturingUnit = require('../models/ManufacturingUnit');
require('dotenv').config();

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL);
  const units = await ManufacturingUnit.find({}).lean();
  let linked = 0;
  for (const unit of units) {
    const warehouse = await Warehouse.findOne({ type: 'manufacturing', name: unit.name, $or: [{ manufacturingUnitId: { $exists: false } }, { manufacturingUnitId: null }] });
    if (warehouse) {
      warehouse.manufacturingUnitId = unit._id;
      await warehouse.save();
      linked += 1;
    }
  }
  console.log(`Linked ${linked} manufacturing warehouse(s).`);
  await mongoose.disconnect();
})().catch(err => { console.error(err); process.exit(1); });
