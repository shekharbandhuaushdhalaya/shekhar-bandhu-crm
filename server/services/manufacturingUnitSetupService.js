const mongoose = require('mongoose');
const ManufacturingUnit = require('../models/ManufacturingUnit');
const Warehouse = require('../models/Warehouse');

async function createManufacturingUnitWithWarehouse(unitData) {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const [unit] = await ManufacturingUnit.create([unitData], { session });
      const [warehouse] = await Warehouse.create([{
        name: `${unit.name} Production House`,
        type: 'manufacturing',
        manufacturingUnitId: unit._id,
        addressLine1: unit.addressLine1,
        city: unit.city,
        state: unit.state,
        pincode: unit.pincode,
        contactPerson: unit.contactPerson,
        phone: unit.phone
      }], { session });

      result = { unit, warehouse };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { createManufacturingUnitWithWarehouse };
