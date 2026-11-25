const request = require('supertest');
const express = require('express');
const coaRouter = require('../routes/manufacturing/coa');
const quarantineRouter = require('../routes/manufacturing/quarantine');
const CertificateOfAnalysis = require('../models/CertificateOfAnalysis');
const RawMaterialQuarantine = require('../models/RawMaterialQuarantine');
const RawMaterial = require('../models/RawMaterial');
const SystemSettings = require('../models/SystemSettings');
const RawMaterialQualitySpecification = require('../models/RawMaterialQualitySpecification');

jest.mock('../models/CertificateOfAnalysis');
jest.mock('../models/RawMaterialQuarantine');
jest.mock('../models/SystemSettings');
jest.mock('../models/RawMaterialEntry');
jest.mock('../models/RawMaterial');
jest.mock('../models/RawMaterialQualitySpecification');
jest.mock('../utils/withTransaction', () => ({ withTransaction: jest.fn(async work => work({})) }));
jest.mock('../utils/auditLogger', () => ({ logAction: jest.fn().mockResolvedValue(true) }));
// coa.js and quarantine.js now allocate document numbers through the atomic,
// tenant-scoped Counter model (see utils/documentCounter.js). Without this
// mock, findOneAndUpdate() hits a real unconnected Mongoose model and the
// test hangs until Jest's per-test timeout instead of failing fast.
jest.mock('../models/Counter', () => ({
  findOneAndUpdate: jest.fn().mockResolvedValue({ seq: 1 }),
}));

jest.setTimeout(10000);

jest.mock('../middleware/authorize', () => ({
  authorize: () => (req, res, next) => {
    req.user = { id: req.headers['x-user-id'] || 'usr1', name: req.headers['x-user-name'] || 'QC Manager', role: 'admin', permissions: ['quality:view', 'quality:create', 'quality:approve', 'inventory:view', 'inventory:create'] };
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
    RawMaterialQualitySpecification.findOne.mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'spec-q101', specificationVersion: '1.0', approvedByUserId: 'qa-approver', approvedAt: new Date(), tests: [{ code: 'IDENTITY', name: 'Botanical identity', specification: 'Conforms to approved raw-material specification', unit: '', methodReference: 'Approved identity method', mandatory: true }] }) }) });
    SystemSettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({})
    });
  });

  describe('Certificate of Analysis (CoA)', () => {
    test('blocks CoA creation without an approved product-specific specification', async () => {
      const res = await request(app).post('/api/manufacturing/coa').send({
        batchNo: 'B-2026-99', productName: 'Chyawanprash Awaleha',
        manufacturingDate: '2026-01-01', expiryDate: '2028-01-01',
        heavyMetalTests: { leadPpm: 1.2, cadmiumPpm: 0.05, mercuryPpm: 0.01, arsenicPpm: 0.1 }
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('COA_SPECIFICATION_REQUIRED');
      expect(CertificateOfAnalysis.create).not.toHaveBeenCalled();
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
      const RawMaterialEntry = require('../models/RawMaterialEntry');
      const linkedEntry = { _id: 'entry-q101', rawMaterialId: 'rm-q101', batchNo: 'HERB-881', vendorName: 'Herbal Supplier', expiryDate: new Date('2027-06-30'), qty: 50, reservedQty: 0, qcStatus: 'under_test' };
      RawMaterialEntry.findById.mockResolvedValue(linkedEntry);
      RawMaterial.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({
        _id: 'rm-q101', name: 'Ashwagandha Root (Withania somnifera)', botanicalName: 'Withania somnifera', unit: 'kg'
      }) });
      RawMaterialQuarantine.findOne.mockResolvedValue(null);
      RawMaterialQuarantine.create.mockImplementation(async ([doc]) => [{
        _id: 'q101',
        quarantineLotNo: 'QRM-9901',
        herbName: 'Ashwagandha Root (Withania somnifera)',
        quarantineStatus: 'under_testing',
        qty: 50,
        unit: 'kg',
        ...doc
      }]);

      const res = await request(app)
        .post('/api/manufacturing/quarantine')
        .send({
          herbName: 'Ashwagandha Root (Withania somnifera)',
          batchNo: 'HERB-881',
          supplierName: 'Herbal Supplier',
          rawMaterialEntryId: 'entry-q101',
          rawMaterialId: 'rm-q101',
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
        rawMaterialEntryId: 'entry-q101',
        rawMaterialId: 'rm-q101',
        batchNo: 'HERB-881',
        qty: 50,
        qcSpecificationId: 'spec-q101', qcSpecificationVersion: '1.0', qcSpecificationTests: [{ code: 'IDENTITY', name: 'Botanical identity', specification: 'Conforms to approved raw-material specification', unit: '', methodReference: 'Approved identity method', mandatory: true }],
        save: jest.fn().mockResolvedValue(true)
      };
      const RawMaterialEntry = require('../models/RawMaterialEntry');
      const linkedEntry = { _id: 'entry-q101', rawMaterialId: 'rm-q101', batchNo: 'HERB-881', qty: 50, reservedQty: 0, qcStatus: 'under_test', save: jest.fn().mockResolvedValue(true) };
      RawMaterialEntry.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(linkedEntry) });
      RawMaterialQuarantine.findById.mockResolvedValue(mockLot);
      RawMaterialQuarantine.findOneAndUpdate.mockImplementation(async (filter, update) => {
        Object.assign(mockLot, update.$set);
        return mockLot;
      });

      const inspection = await request(app)
        .patch('/api/manufacturing/quarantine/q101/inspection')
        .set('x-user-id', 'qc-analyst-17')
        .set('x-user-name', 'Incoming QC Analyst')
        .send({ inspectionResults: [{
          testCode: 'IDENTITY', testName: 'Botanical identity', methodReference: 'Approved identity method',
          specification: 'Conforms to approved raw-material specification', result: 'Conforms',
          unit: '', outcome: 'pass', evidenceRef: 'LAB-OBS-44'
        }] });
      expect(inspection.status).toBe(200);
      expect(mockLot.inspectionRecordedByUserId).toBe('qc-analyst-17');

      RawMaterialQuarantine.findById.mockReturnValue({ session: jest.fn().mockResolvedValue(mockLot) });
      const res = await request(app)
        .patch('/api/manufacturing/quarantine/q101/release')
        .send({ quarantineStatus: 'released', testReportNo: 'QC-REP-44', remarks: 'Conforms to approved specification' });

      expect(res.status).toBe(200);
      expect(mockLot.quarantineStatus).toBe('released');
    });
  });
});
