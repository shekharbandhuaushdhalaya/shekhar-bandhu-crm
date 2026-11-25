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
jest.mock('../models/InventoryEntry');
jest.mock('../models/Warehouse');
jest.mock('../utils/withTransaction', () => ({
  withTransaction: jest.fn(async work => work({}))
}));
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
const InventoryEntry = require('../models/InventoryEntry');
const Warehouse = require('../models/Warehouse');
const Product = require('../models/Product');
const RolePermission = require('../models/RolePermission');
const ProductQualitySpecification = require('../models/ProductQualitySpecification');

RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });

const batchRouter = require('../routes/manufacturing/batchProductions');

describe('BMR Pharmacopoeia Verification Gate Suite', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      req.user = req.headers['x-test-user'] ? { id: req.headers['x-test-user'], name: 'Independent QA Reviewer', role: 'admin' } : { id: 'user_123', name: 'QA Manager', role: 'admin' };
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

  describe('batch completion evidence gate', () => {
    test('blocks completion before warehouse or packaging processing when critical stage evidence is incomplete', async () => {
      const batch = {
        _id: 'batch-completion-gate-1',
        status: 'qc_hold',
        productId: '111111111111111111111111',
        plannedQty: 100,
        stages: [{
          name: 'Mixing',
          status: 'completed',
          performedBy: 'operator-1',
          performedByName: 'Operator One',
          verifiedBy: null,
          verifiedAt: null,
          isDualSigned: false,
          operatorTrainingRecordId: 'training-1',
          equipmentId: 'equipment-1',
          equipmentCalibrationStatus: 'valid'
        }],
        packagingMode: 'self_packed',
        packagingDeducted: false,
        save: jest.fn()
      };
      BatchProduction.findById.mockResolvedValue(batch);
      Product.find.mockResolvedValue([{ _id: '111111111111111111111111', name: 'Test Product', mrp: 10 }]);

      const res = await request(app)
        .patch('/api/batch-productions/batch-completion-gate-1/complete')
        .send({
          actualYieldQty: 100,
          qcPassedBy: 'QC Analyst',
          warehouseId: '222222222222222222222222'
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('STAGE_EXECUTION_EVIDENCE_INCOMPLETE');
      expect(res.body.missingEvidence).toContain('Independent operator and verifier evidence is missing: Mixing');
      expect(Warehouse.findById).not.toHaveBeenCalled();
      expect(batch.packagingDeducted).toBe(false);
      expect(batch.save).not.toHaveBeenCalled();
    });

    test('blocks skipped critical stages without a documented reason', async () => {
      const batch = {
        _id: 'batch-completion-gate-2',
        status: 'qc_hold',
        productId: '333333333333333333333333',
        plannedQty: 100,
        stages: [{
          name: 'Mixing',
          status: 'skipped',
          performedBy: 'operator-1',
          verifiedBy: 'reviewer-1',
          verifiedAt: new Date(),
          notes: ''
        }],
        save: jest.fn()
      };
      BatchProduction.findById.mockResolvedValue(batch);
      Product.find.mockResolvedValue([{ _id: '333333333333333333333333', name: 'Test Product', mrp: 10 }]);

      const res = await request(app)
        .patch('/api/batch-productions/batch-completion-gate-2/complete')
        .send({
          actualYieldQty: 100,
          qcPassedBy: 'QC Analyst',
          warehouseId: '222222222222222222222222'
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('STAGE_EXECUTION_EVIDENCE_INCOMPLETE');
      expect(res.body.missingEvidence).toContain('Documented skip reason is missing: Mixing');
      expect(Warehouse.findById).not.toHaveBeenCalled();
      expect(batch.save).not.toHaveBeenCalled();
    });
  });

  describe('independent finished-batch QA release', () => {
    const makeReleaseBatch = () => ({
      _id: 'batch-release-1',
      productId: 'product-release-1',
      qcSpecificationId: 'spec-release-1',
      status: 'completed',
      qcStatus: 'approved',
      bmrApprovedBy: 'bmr-approver',
      bmrApprovedAt: new Date(),
      plannedQty: 100,
      bomSnapshot: { formulationBasis: 100, ingredients: [{ rawMaterialId: 'rm-1', itemType: 'formulation', qtyRequired: 10, stageName: 'Mixing' }] },
      ingredientsConsumed: [{
        rawMaterialId: 'rm-1', rawMaterialEntryId: 'entry-1', qtyConsumed: 10,
        qtyWasted: 0, batchNo: 'LOT-1', stageIndex: 0, dispensingNo: 'DSP-1'
      }],
      qcPassedBy: 'QC Analyst',
      qcPassedByUser: 'qc-analyst-1',
      qcTests: [{
        code: 'IDENTITY', status: 'pass', result: 'Conforms',
        testedBy: 'qc-analyst-1', testedByName: 'QC Analyst', testedAt: new Date()
      }],
      stages: [{ name: 'Mixing', status: 'completed', isDualSigned: true, performedBy: 'mixing-operator', verifiedBy: 'mixing-reviewer', verifiedAt: new Date() }],
      save: jest.fn().mockResolvedValue(true)
    });
    const mockVerifiedDispensing = () => {
      MaterialDispensing.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([{
        dispensingNo: 'DSP-1', status: 'verified', dispensedBy: 'material-operator',
        verifiedBy: 'material-reviewer', verifiedAt: new Date(),
        items: [{ rawMaterialEntryId: 'entry-1', rawMaterialId: 'rm-1', qtyDispensed: 10 }]
      }]) });
    };
    const makeClearances = () => ['manufacturing', 'filling', 'packing'].map(phase => ({
      phase, cleared: true, submittedBy: 'line-operator', submittedAt: new Date(), clearedBy: 'clearance-reviewer', clearedAt: new Date(), verifiedBy: 'clearance-reviewer', verifiedAt: new Date(),
      checklist: { equipmentCleaned: true, previousMaterialsRemoved: true, previousLabelsDocumentsRemoved: true, areaVisuallyInspected: true }
    }));
    const approvedSpec = {
      _id: 'spec-release-1', productId: 'product-release-1', status: 'approved',
      approvedBy: 'spec-approver', approvedAt: new Date(), tests: [{ code: 'IDENTITY', mandatory: true }]
    };

    test('blocks market release when a skipped stage lacks independent verification', async () => {
      const batch = makeReleaseBatch();
      batch.stages[0] = { name: 'Mixing', status: 'skipped', notes: 'Not applicable to this formulation', performedBy: 'operator-1', verifiedBy: null, verifiedAt: null };
      BatchProduction.findById.mockResolvedValue(batch);

      const res = await request(app).patch('/api/batch-productions/batch-release-1/release').set('x-test-user', 'qa-reviewer-1').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('completed or skipped critical manufacturing stage requires independent');
      expect(ProductQualitySpecification.findById).not.toHaveBeenCalled();
      expect(batch.save).not.toHaveBeenCalled();
    });

    test('blocks market release when a skipped stage has no documented reason', async () => {
      const batch = makeReleaseBatch();
      batch.stages[0] = { name: 'Mixing', status: 'skipped', notes: '', performedBy: 'operator-1', verifiedBy: 'reviewer-1', verifiedAt: new Date() };
      BatchProduction.findById.mockResolvedValue(batch);

      const res = await request(app).patch('/api/batch-productions/batch-release-1/release').set('x-test-user', 'qa-reviewer-1').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('skipped critical manufacturing stage requires a documented reason');
      expect(ProductQualitySpecification.findById).not.toHaveBeenCalled();
      expect(batch.save).not.toHaveBeenCalled();
    });

    test('blocks the QC analyst from releasing their own batch', async () => {
      const batch = makeReleaseBatch();
      BatchProduction.findById.mockResolvedValue(batch);
      ProductQualitySpecification.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(approvedSpec) });
      LineClearance.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(makeClearances()) });
      mockVerifiedDispensing();

      const res = await request(app).patch('/api/batch-productions/batch-release-1/release').set('x-test-user', 'qc-analyst-1').send({});

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('QC analyst cannot release');
      expect(batch.save).not.toHaveBeenCalled();
    });

    test('allows a distinct QA releaser only after complete QC and line-clearance evidence', async () => {
      const batch = makeReleaseBatch();
      BatchProduction.findById.mockResolvedValue(batch);
      ProductQualitySpecification.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(approvedSpec) });
      LineClearance.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(makeClearances()) });
      mockVerifiedDispensing();
      BatchProduction.findOne.mockReturnValue({ session: jest.fn().mockResolvedValue(batch) });
      InventoryEntry.updateMany.mockResolvedValue({ modifiedCount: 1 });
      const res = await request(app).patch('/api/batch-productions/batch-release-1/release').set('x-test-user', 'qa-reviewer-1').send({});

      expect(res.status).toBe(200);
      expect(batch.releasedBy).toBe('qa-reviewer-1');
      expect(batch.releasedByName).toBe('Independent QA Reviewer');
      expect(batch.releasedAt).toBeInstanceOf(Date);
      expect(batch.save).toHaveBeenCalled();
    });

    test('blocks release when formula material consumption is missing or short', async () => {
      const batch = makeReleaseBatch();
      batch.ingredientsConsumed = [];
      BatchProduction.findById.mockResolvedValue(batch);
      ProductQualitySpecification.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(approvedSpec) });
      LineClearance.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(makeClearances()) });
      MaterialDispensing.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) });
      const res = await request(app).patch('/api/batch-productions/batch-release-1/release').set('x-test-user', 'qa-reviewer-1').send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MATERIAL_GENEALOGY_INCOMPLETE');
      expect(res.body.missingEvidence.some(item => item.includes('below the pinned formula requirement'))).toBe(true);
      expect(batch.save).not.toHaveBeenCalled();
    });

    test('blocks release while material dispensing awaits independent verification', async () => {
      const batch = makeReleaseBatch();
      BatchProduction.findById.mockResolvedValue(batch);
      ProductQualitySpecification.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(approvedSpec) });
      LineClearance.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(makeClearances()) });
      MaterialDispensing.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([{
        dispensingNo: 'DSP-1', status: 'pending_verification', dispensedBy: 'material-operator',
        verifiedBy: null, verifiedAt: null,
        items: [{ rawMaterialEntryId: 'entry-1', rawMaterialId: 'rm-1', qtyDispensed: 10 }]
      }]) });
      const res = await request(app).patch('/api/batch-productions/batch-release-1/release').set('x-test-user', 'qa-reviewer-1').send({});
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MATERIAL_GENEALOGY_INCOMPLETE');
      expect(res.body.missingEvidence.some(item => item.includes('not independently verified'))).toBe(true);
      expect(batch.save).not.toHaveBeenCalled();
    });

    test('rejects a QC test result without tester identity or timestamp', async () => {
      const batch = makeReleaseBatch();
      batch.qcTests[0].testedBy = null;
      batch.qcTests[0].testedByName = '';
      batch.qcTests[0].testedAt = null;
      BatchProduction.findById.mockResolvedValue(batch);
      ProductQualitySpecification.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue(approvedSpec) });

      const res = await request(app).patch('/api/batch-productions/batch-release-1/release').send({});

      expect(res.status).toBe(400);
      expect(res.body.tests).toEqual(['IDENTITY']);
      expect(batch.save).not.toHaveBeenCalled();
    });
  });

});
