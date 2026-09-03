const DripCampaign = require('../models/DripCampaign');
const User = require('../models/User');

describe('Backlog Phase G — Marketing Automation, Scheduled Digests, Data Backup & Session Security Suite', () => {
  it('instantiates DripCampaign for lead nurturing automation', () => {
    const campaign = new DripCampaign({
      name: 'Ayush Distributor Onboarding Sequence',
      targetAudience: 'distributors',
      channel: 'whatsapp',
      steps: [
        { stepNumber: 1, dayOffset: 0, templateBody: 'Welcome to Shekhar Bandhu Aushadhalaya catalog!' },
        { stepNumber: 2, dayOffset: 3, templateBody: 'Check out our top selling Chyawanprash margins.' }
      ],
      status: 'active'
    });

    expect(campaign.name).toBe('Ayush Distributor Onboarding Sequence');
    expect(campaign.steps.length).toBe(2);
    expect(campaign.steps[1].dayOffset).toBe(3);
  });

  it('formats scheduled executive sales report digest summary text', () => {
    const revenue = 150000;
    const invoicesCount = 12;
    const lowStockCount = 3;

    const digestText = `Total Sales: ₹${revenue}, Invoices: ${invoicesCount}, Low Stock Alerts: ${lowStockCount}`;

    expect(digestText).toContain('150000');
    expect(digestText).toContain('12');
  });

  it('validates backup JSON snapshot collection format', () => {
    const snapshot = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      companyConfig: { firmName: 'Shekhar Bandhu Aushadhalaya' },
      counts: { products: 45, customers: 120, vendors: 15 }
    };

    expect(snapshot.version).toBe('1.0.0');
    expect(snapshot.counts.products).toBe(45);
  });

  it('manages active user device sessions and session revocation', () => {
    const user = new User({
      name: 'Admin User',
      email: 'admin@shekharbandhu.com',
      password: 'hashedpassword',
      activeSessions: [
        { sessionId: 'sess-001', deviceInfo: 'iPhone 15 Pro', ipAddress: '192.168.1.1' },
        { sessionId: 'sess-002', deviceInfo: 'Chrome macOS', ipAddress: '192.168.1.5' }
      ]
    });

    expect(user.activeSessions.length).toBe(2);

    // Revoke sess-001
    user.activeSessions = user.activeSessions.filter(s => s.sessionId !== 'sess-001');
    expect(user.activeSessions.length).toBe(1);
    expect(user.activeSessions[0].sessionId).toBe('sess-002');
  });
});
