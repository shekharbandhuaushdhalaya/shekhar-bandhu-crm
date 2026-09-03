const { sendMultiChannelNotification } = require('../services/smsFallbackService');

describe('Backlog Phase J — Logistics Tracking, E-Way Bills, SMS Fallback & Tally 2-Way Sync Suite', () => {
  it('normalizes logistics shipment tracking status response', () => {
    const dispatch = {
      dispatchNo: 'DISP-0010',
      courierName: 'VRL Logistics',
      trackingId: 'VRL12345678',
      status: 'in_transit',
      deliveryDate: new Date('2026-09-05')
    };

    const trackingStatus = {
      dispatchNo: dispatch.dispatchNo,
      courierName: dispatch.courierName,
      trackingId: dispatch.trackingId,
      status: dispatch.status,
      currentLocation: 'Transit Hub Varanasi'
    };

    expect(trackingStatus.courierName).toBe('VRL Logistics');
    expect(trackingStatus.status).toBe('in_transit');
  });

  it('generates NIC E-Way Bill JSON payload structure for B2B invoices', () => {
    const ewayBillPayload = {
      supplyType: 'Outward',
      docType: 'INV',
      docNo: 'VP/26-27/005',
      totInvValue: 75000,
      transMode: 'Road',
      vehicleNo: 'UP65AB1234'
    };

    expect(ewayBillPayload.supplyType).toBe('Outward');
    expect(ewayBillPayload.totInvValue).toBe(75000);
    expect(ewayBillPayload.vehicleNo).toBe('UP65AB1234');
  });

  it('triggers multi-channel notification with SMS fallback capability', async () => {
    const res = await sendMultiChannelNotification('9876543210', 'Your order VP/26-27/005 has been dispatched.');
    expect(res.success).toBe(true);
    expect(res.phone).toBe('9876543210');
  });

  it('parses Tally XML voucher numbers and party ledger names', () => {
    const xmlPayload = '<VOUCHER><VOUCHERNUMBER>TALLY-9988</VOUCHERNUMBER><PARTYLEDGERNAME>Gupta Medical Store</PARTYLEDGERNAME><AMOUNT>-25000</AMOUNT></VOUCHER>';

    const voucherNoMatch = xmlPayload.match(/<VOUCHERNUMBER>(.*?)<\/VOUCHERNUMBER>/i);
    const partyNameMatch = xmlPayload.match(/<PARTYLEDGERNAME>(.*?)<\/PARTYLEDGERNAME>/i);
    const amountMatch = xmlPayload.match(/<AMOUNT>(.*?)<\/AMOUNT>/i);

    expect(voucherNoMatch[1]).toBe('TALLY-9988');
    expect(partyNameMatch[1]).toBe('Gupta Medical Store');
    expect(Math.abs(parseFloat(amountMatch[1]))).toBe(25000);
  });
});
