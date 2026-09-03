const Warehouse = require('../models/Warehouse');

describe('Dealer Consignment Location Model', () => {
  it('instantiates dealer_consignment warehouse type correctly', () => {
    const wh = new Warehouse({
      name: 'Dealer Stock - North Pharma',
      type: 'dealer_consignment',
      customerId: '507f1f77bcf86cd799439011',
      dealerName: 'North Pharma'
    });

    expect(wh.name).toBe('Dealer Stock - North Pharma');
    expect(wh.type).toBe('dealer_consignment');
    expect(wh.dealerName).toBe('North Pharma');
    expect(wh.customerId.toString()).toBe('507f1f77bcf86cd799439011');
  });
});
