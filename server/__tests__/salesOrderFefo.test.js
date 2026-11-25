const { sortInventoryEntriesFefo } = require('../services/salesOrderService');

describe('finished-goods FEFO ordering', () => {
  it('places the earliest known expiry before later expiries and unknown expiry dates', () => {
    const entries = [
      { _id: 'unknown', expiryDate: null, mfgDate: new Date('2026-01-01') },
      { _id: 'later', expiryDate: new Date('2027-06-01'), mfgDate: new Date('2026-02-01') },
      { _id: 'earliest', expiryDate: new Date('2027-01-01'), mfgDate: new Date('2026-03-01') },
      { _id: 'missing' },
    ];
    expect(sortInventoryEntriesFefo(entries).map(entry => entry._id))
      .toEqual(['earliest', 'later', 'unknown', 'missing']);
  });

  it('uses manufacturing date and creation date as deterministic tie-breakers', () => {
    const entries = [
      { _id: 'newer', expiryDate: new Date('2027-01-01'), mfgDate: new Date('2026-03-02'), createdAt: new Date('2026-03-02') },
      { _id: 'older', expiryDate: new Date('2027-01-01'), mfgDate: new Date('2026-03-01'), createdAt: new Date('2026-03-03') },
      { _id: 'oldest-created', expiryDate: new Date('2027-01-01'), mfgDate: new Date('2026-03-01'), createdAt: new Date('2026-03-01') },
    ];
    expect(sortInventoryEntriesFefo(entries).map(entry => entry._id))
      .toEqual(['oldest-created', 'older', 'newer']);
  });
});
