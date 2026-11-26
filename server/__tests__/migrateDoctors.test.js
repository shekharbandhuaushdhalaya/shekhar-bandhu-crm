const mongoose = require('mongoose');
const { validateMigrationConfig, doctorPayload } = require('../scripts/migrateDoctors');

describe('doctor migration configuration and mapping', () => {
  const valid = { MONGODB_URI: 'mongodb://localhost:27017/test', MIGRATION_FIRM_ID: new mongoose.Types.ObjectId().toString() };

  test('requires an explicit database URI and tenant', () => {
    expect(() => validateMigrationConfig({ ...valid, MONGODB_URI: '' })).toThrow('MONGODB_URI is required');
    expect(() => validateMigrationConfig({ ...valid, MIGRATION_FIRM_ID: '' })).toThrow('valid MongoDB ObjectId');
  });
  test('defaults to dry-run and requires two exact apply confirmations', () => {
    expect(validateMigrationConfig(valid).apply).toBe(false);
    expect(() => validateMigrationConfig({ ...valid, MIGRATE_DOCTORS_APPLY: 'YES', MIGRATE_DOCTORS_CONFIRM: 'yes' })).toThrow('MIGRATE_DOCTORS_CONFIRM=YES');
    expect(validateMigrationConfig({ ...valid, MIGRATE_DOCTORS_APPLY: 'YES', MIGRATE_DOCTORS_CONFIRM: 'YES' }).apply).toBe(true);
  });
  test('maps contact and customer links without carrying invalid categories', () => {
    const id = new mongoose.Types.ObjectId();
    expect(doctorPayload({ _id: id, name: ' Test ', category: 'unexpected' }, 'Contact')).toMatchObject({
      name: 'Test', category: '', linkedContactId: id, linkedCustomerId: null
    });
    expect(doctorPayload({ _id: id, name: ' Clinic ', billingAddress: { street: ' Road ', city: 'City', pin: '123' } }, 'Customer')).toMatchObject({
      name: 'Clinic', address: 'Road', city: 'City', pincode: '123', linkedCustomerId: id, linkedContactId: null
    });
  });
});
