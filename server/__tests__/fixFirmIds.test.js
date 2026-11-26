const mongoose = require('mongoose');
const { backfillFirmIds, COLLECTIONS_TO_UPDATE } = require('../scripts/fix-firm-ids');

describe('firm ID backfill script', () => {
  test('requires a valid explicit target firm ID', async () => {
    const db = { collection: jest.fn() };
    await expect(backfillFirmIds(db, '')).rejects.toThrow('FIRM_ID_BACKFILL_TARGET must be a valid MongoDB ObjectId');
    expect(db.collection).not.toHaveBeenCalled();
  });

  test('refuses to update records when the target firm does not exist', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const db = { collection: jest.fn(() => ({ findOne })) };
    await expect(backfillFirmIds(db, new mongoose.Types.ObjectId().toString()))
      .rejects.toThrow('does not match an existing firm');
    expect(db.collection).toHaveBeenCalledTimes(1);
  });

  test('updates only records with missing tenant IDs after verifying the selected firm', async () => {
    const firmId = new mongoose.Types.ObjectId();
    const firm = { _id: firmId, name: 'Selected firm' };
    const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 2 });
    const db = {
      collection: jest.fn(name => name === 'firms'
        ? { findOne: jest.fn().mockResolvedValue(firm) }
        : { updateMany })
    };

    const result = await backfillFirmIds(db, firmId.toString());

    expect(result.firm).toEqual(firm);
    expect(result.results).toHaveLength(COLLECTIONS_TO_UPDATE.length);
    expect(updateMany).toHaveBeenCalledTimes(COLLECTIONS_TO_UPDATE.length);
    for (const [filter, update] of updateMany.mock.calls) {
      expect(filter).toEqual({ $or: [{ firmId: null }, { firmId: { $exists: false } }] });
      expect(update).toEqual({ $set: { firmId } });
    }
  });
});
