const express = require('express');
const request = require('supertest');

jest.mock('../models/BatchProduction');
jest.mock('../models/RawMaterial');
jest.mock('../models/PharmacopoeiaEntry');
jest.mock('../models/RawMaterialEntry');
jest.mock('../models/SystemSettings');
jest.mock('../models/ProductQualitySpecification');
jest.mock('../models/LineClearance');
jest.mock('../models/RetentionSample');
jest.mock('../models/MaterialDispensing');
jest.mock('../models/Product');
jest.mock('../models/RolePermission');
jest.mock('../utils/botanicalLookup', () => ({
  getBotanicalProfile: jest.fn().mockResolvedValue({ latinName: 'Test Species', partUsed: 'Leaf', standard: 'API', monographRef: 'API Vol I' })
}));

const BatchProduction = require('../models/BatchProduction');
const RawMaterial = require('../models/RawMaterial');
const PharmacopoeiaEntry = require('../models/PharmacopoeiaEntry');
const RawMaterialEntry = require('../models/RawMaterialEntry');
const SystemSettings = require('../models/SystemSettings');
const LineClearance = require('../models/LineClearance');
const RetentionSample = require('../models/RetentionSample');
const MaterialDispensing = require('../models/MaterialDispensing');
const Product = require('../models/Product');
const RolePermission = require('../models/RolePermission');

RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });

const batchRouter = require('../routes/manufacturing/batchProductions');

describe('BMR Pharmacopoeia Verification Gate Suite', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = { id: 'user_123', name: 'QA Manager', role: 'admin' };
      next();
    });
    app.use('/api/batch-productions', batchRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    RolePermission.getEffectivePermissions.mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });

  test('PATCH /api/batch-productions/:id/approve-bmr approves normally when all ingredients cite verified entries', async () => {
    const mockBatch = {
      _id: 'batch_verified_1',
      status: 'draft',
      batchNo: 'B-VERIFIED-01',
      bomSnapshot: {
        ingredients: [{ rawMaterialId: 'rm_1' }]
      },
      save: jest.fn().mockResolvedValue(true)
    };
    BatchProduction.findById.mockResolvedValue(mockBatch);
    RawMaterial.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: 'rm_1', name: 'ASHWAGANDHA', botanicalName: 'Withania somnifera' }])
    });
    PharmacopoeiaEntry.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ayurvedicName: 'ASHWAGANDHA', verified: true, source: 'manual' })
    });

    const res = await request(app).patch('/api/batch-productions/batch_verified_1/approve-bmr').send({});
    expect(res.status).toBe(200);
    expect(mockBatch.bmrApprovedBy).toBe('user_123');
    expect(mockBatch.save).toHaveBeenCalled();
  });

  test('PATCH /api/batch-productions/:id/approve-bmr rejects without acknowledgement flag when ingredient is unverified', async () => {
    const mockBatch = {
      _id: 'batch_unverified_1',
      status: 'draft',
      batchNo: 'B-UNVERIFIED-01',
      bomSnapshot: {
        ingredients: [{ rawMaterialId: 'rm_2' }]
      },
      save: jest.fn()
    };
    BatchProduction.findById.mockResolvedValue(mockBatch);
    RawMaterial.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: 'rm_2', name: 'UNVERIFIED_HERB', botanicalName: 'Unverified species' }])
    });
    PharmacopoeiaEntry.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ayurvedicName: 'UNVERIFIED_HERB', verified: false, source: 'AI-generated' })
    });

    const res = await request(app).patch('/api/batch-productions/batch_unverified_1/approve-bmr').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('unverified pharmacopoeia monograph citations');
    expect(res.body.unverifiedIngredients).toHaveLength(1);
    expect(mockBatch.save).not.toHaveBeenCalled();
  });

  test('PATCH /api/batch-productions/:id/approve-bmr succeeds when acknowledgeUnverifiedRefs is true', async () => {
    const mockBatch = {
      _id: 'batch_unverified_2',
      status: 'draft',
      batchNo: 'B-UNVERIFIED-02',
      bomSnapshot: {
        ingredients: [{ rawMaterialId: 'rm_2' }]
      },
      save: jest.fn().mockResolvedValue(true)
    };
    BatchProduction.findById.mockResolvedValue(mockBatch);
    RawMaterial.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: 'rm_2', name: 'UNVERIFIED_HERB', botanicalName: 'Unverified species' }])
    });
    PharmacopoeiaEntry.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ayurvedicName: 'UNVERIFIED_HERB', verified: false, source: 'AI-generated' })
    });

    const res = await request(app)
      .patch('/api/batch-productions/batch_unverified_2/approve-bmr')
      .send({ acknowledgeUnverifiedRefs: true });

    expect(res.status).toBe(200);
    expect(mockBatch.bmrApprovedBy).toBe('user_123');
    expect(mockBatch.bmrUnverifiedAcknowledged).toBe(true);
    expect(mockBatch.save).toHaveBeenCalled();
  });

  test('GET /api/batch-productions/:id/bmr-report returns hasUnverifiedReferences and unverifiedIngredients', async () => {
    SystemSettings.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({}) });
    LineClearance.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    RetentionSample.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
    MaterialDispensing.find.mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });
    Product.find.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
    });

    BatchProduction.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            _id: 'batch_report_1',
            batchNo: 'B-REPORT-01',
            ingredientsConsumed: [
              {
                rawMaterialId: { name: 'UNVERIFIED_HERB', unit: 'kg' },
                rawMaterialEntryId: 'entry_1',
                qtyConsumed: 5,
                batchNo: 'RM-01'
              }
            ]
          })
        })
      })
    });

    RawMaterialEntry.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ purchaseRate: 100 })
    });

    PharmacopoeiaEntry.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ ayurvedicName: 'UNVERIFIED_HERB', verified: false, source: 'AI-generated' })
    });

    const res = await request(app).get('/api/batch-productions/batch_report_1/bmr-report');
    expect(res.status).toBe(200);
    expect(res.body.documentType).toBe('system_generated_batch_manufacturing_record');
    expect(res.body.officialStatutoryForm).toBe(false);
    expect(res.body.documentStatus).toBe('DRAFT_INCOMPLETE');
    expect(res.body.hasUnverifiedReferences).toBe(true);
    expect(res.body.unverifiedIngredients).toHaveLength(1);
    expect(res.body.unverifiedIngredients[0].name).toBe('UNVERIFIED_HERB');
    expect(res.body.ingredients[0].botanicalName).toBeNull();
    expect(res.body.ingredients[0].pharmacopoeialStandard).toBeNull();
    expect(res.body.ingredients[0].purchaseRate).toBe(100);
    expect(res.body.organizationDetails.manufacturingLicenseNo).toBeNull();
    expect(res.body.organizationDetails.gmpCertificateNo).toBeNull();
    expect(res.body.productDetails.name).toBeNull();
    expect(res.body.missingEvidence).toContain('Pre-execution BMR approval identity or timestamp is missing');
  });

  test('GET /api/batch-productions/:id/coa returns an internal incomplete summary and never invents test passes or signatories', async () => {
    BatchProduction.findById.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'batch_coa_1',
          batchNo: 'B-COA-01',
          productId: { name: 'Test formulation' },
          plannedQty: 100,
          qcStatus: null,
          qcParameters: {},
          qcTests: []
        })
      })
    });
    SystemSettings.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({}) });

    const res = await request(app).get('/api/batch-productions/batch_coa_1/coa');
    expect(res.status).toBe(200);
    expect(res.body.documentType).toBe('system_generated_qc_summary');
    expect(res.body.title).toContain('NOT A CERTIFICATE OF ANALYSIS');
    expect(res.body.officialCertificate).toBe(false);
    expect(res.body.documentStatus).toBe('INCOMPLETE');
    expect(res.body.overallResult).toBe('PENDING');
    expect(res.body.testResults).toEqual([]);
    expect(res.body.recordedQcDisposition).toBeNull();
    expect(res.body.qcAnalyst).toBeNull();
    expect(res.body.independentQaRelease).toBeNull();
    expect(res.body.missingEvidence).toContain('No specification-linked batch QC test results are recorded');
    expect(res.body.firmDetails).toBeUndefined();
  });

});
