const Warehouse = require('../models/Warehouse');

async function resolveManufacturingWarehouse(manufacturingUnitId, session = null) {
  if (!manufacturingUnitId) {
    const e = new Error('Manufacturing unit is required'); e.code = 'MANUFACTURING_UNIT_REQUIRED'; throw e;
  }
  let q = Warehouse.findOne({ manufacturingUnitId, type: 'manufacturing' });
  if (session) q = q.session(session);
  const warehouse = await q;
  if (!warehouse) {
    const e = new Error('No manufacturing warehouse is mapped to this manufacturing unit. Map a warehouse before planning or consuming raw materials.');
    e.code = 'MANUFACTURING_WAREHOUSE_NOT_MAPPED';
    throw e;
  }
  return warehouse;
}

module.exports = { resolveManufacturingWarehouse };
