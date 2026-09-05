const request = require('supertest');
const express = require('express');
const coaRouter = require('../routes/manufacturing/coa');
const quarantineRouter = require('../routes/manufacturing/quarantine');
const CertificateOfAnalysis = require('../models/CertificateOfAnalysis');
const RawMaterialQuarantine = require('../models/RawMaterialQuarantine');

jest.mock('../models/CertificateOfAnalysis');
jest.mock('../models/RawMaterialQuarantine');
jest.mock('../models/SystemSettings');

jest.setTimeout(10000);

jest.mock('../middleware/authorize', () => ({
  authorize: () => (req, res, next) => {
    req.user = { id: 'usr1', name: 'QC Manager', role: 'admin', permissions: ['quality:view', 'quality:create', 'quality:approve', 'inventory:view', 'inventory:create'] };
    next();
  },
}));

const app = express();
app.use(express.json());
app.use('/api/manufacturing/coa', coaRouter);
app.use('/api/manufacturing/quarantine', quarantineRouter);

describe('Module 2: Ayurvedic Manufacturing & AYUSH / GMP Compliance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Certificate of Analysis (CoA)', () => {
    test('creates and validates AYUSH heavy metal thresholds (Lead, Cadmium, Mercury, Arsenic)', async () => {
      CertificateOfAnalysis.create.mockResolvedValue({
        _id: 'coa1',
        coaNumber: 'COA-1001',
        batchNo: 'B-2026-99',
        productName: 'Chyawanprash Awaleha',
        heavyMetalTests: { leadPpm: 1.2, cadmiumPpm: 0.05, mercuryPpm: 0.01, arsenicPpm: 0.1, passed: true },
        status: 'approved',
      });

      const res = await request(app)
        .post('/api/manufacturing/coa')
        .send({
          batchNo: 'B-2026-99',
          productName: 'Chyawanprash Awaleha',
          manufacturingDate: '2026-01-01',
          expiryDate: '2028-01-01',
          heavyMetalTests: { leadPpm: 1.2, cadmiumPpm: 0.05, mercuryPpm: 0.01, arsenicPpm: 0.1 }
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('approved');
      expect(res.body.heavyMetalTests.passed).toBe(true);
    });

    test('fetches Certificate of Analysis by batch number', async () => {
      CertificateOfAnalysis.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ batchNo: 'B-2026-99', productName: 'Chyawanprash Awaleha' })
      });

      const res = await request(app).get('/api/manufacturing/coa/B-2026-99');
      expect(res.status).toBe(200);
      expect(res.body.batchNo).toBe('B-2026-99');
    });
  });

  describe('Botanical Raw Material Quarantine & Expiry Tracker', () => {
    test('logs raw herb lot into quarantine with under_testing status', async () => {
      RawMaterialQuarantine.create.mockResolvedValue({
        _id: 'q101',
        quarantineLotNo: 'QRM-9901',
        herbName: 'Ashwagandha Root (Withania somnifera)',
        quarantineStatus: 'under_testing',
        qty: 50,
        unit: 'kg'
      });

      const res = await request(app)
        .post('/api/manufacturing/quarantine')
        .send({
          herbName: 'Ashwagandha Root (Withania somnifera)',
          batchNo: 'HERB-881',
          qty: 50,
          unit: 'kg',
          expiryDate: '2027-06-30'
        });

      expect(res.status).toBe(201);
      expect(res.body.quarantineStatus).toBe('under_testing');
    });

    test('updates quarantine status to released upon QC testing approval', async () => {
      const mockLot = {
        _id: 'q101',
        quarantineStatus: 'under_testing',
        save: jest.fn().mockResolvedValue(true)
      };
      RawMaterialQuarantine.findById.mockResolvedValue(mockLot);

      const res = await request(app)
        .patch('/api/manufacturing/quarantine/q101/release')
        .send({ quarantineStatus: 'released', testReportNo: 'QC-REP-44' });

      expect(res.status).toBe(200);
      expect(mockLot.quarantineStatus).toBe('released');
    });
  });
});
