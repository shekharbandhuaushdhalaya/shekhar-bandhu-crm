const express = require('express');
const request = require('supertest');

// Mocks
jest.mock('../models/MrVisit');
jest.mock('../models/Order');
jest.mock('../models/Dispatch');
jest.mock('../models/RetentionSample');
jest.mock('../models/Recall');
jest.mock('../models/SystemSettings');
jest.mock('../models/RolePermission');
jest.mock('../utils/whatsappService', () => ({
  safeEscapeRegex: value => String(value || ''),
  sendWhatsAppNotification: jest.fn().mockResolvedValue({ success: true, sid: 'SM-TEST' })
}));
// Order tracking now resolves dispatches through the authoritative Challan
// (posted, finalized) instead of a direct Order->Dispatch lookup; see
// routes/portal/portal.js. Mock Challan so Challan.find() doesn't hang
// against a real unconnected Mongoose model.
jest.mock('../models/Challan');
jest.mock('../middleware/authenticatePortalCustomer', () => ({
  authenticatePortalCustomer: (req, res, next) => {
    req.customer = req.customer || {
      _id: 'cust_999',
      name: 'Sharma Pharmacy',
      phone: '9876543210'
    };
    next();
  }
}));
jest.mock('../services/smsFallbackService', () => ({
  sendMultiChannelNotification: jest.fn().mockResolvedValue({ success: true, channel: 'whatsapp', simulated: false })
}));

const MrVisit = require('../models/MrVisit');
const Order = require('../models/Order');
const Dispatch = require('../models/Dispatch');
const RetentionSample = require('../models/RetentionSample');
const Recall = require('../models/Recall');
const SystemSettings = require('../models/SystemSettings');
const Challan = require('../models/Challan');
const RolePermission = require('../models/RolePermission');

RolePermission.getEffectivePermissions = jest.fn().mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });

// Routers
const mrRouter = require('../routes/crm/medicalReps');
const portalRouter = require('../routes/portal/portal');
const retentionRouter = require('../routes/manufacturing/retentionSamples');
const recallRouter = require('../routes/manufacturing/recalls');

describe('Features 3, 7, 8: Sample E-Sign, Customer Portal Tracking & Retention Recall Audit Suite', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Inject user middleware for admin/rep routes
    app.use((req, res, next) => {
      req.user = { id: '507f1f77bcf86cd799439011', name: 'Test User', role: 'admin' };
      // Inject customer middleware for portal routes
      req.customer = {
        _id: 'cust_999',
        name: 'Sharma Pharmacy',
        phone: '9876543210'
      };
      next();
    });

    app.use('/api/medical-reps', mrRouter);
    app.use('/api/portal', portalRouter);
    app.use('/api/retention-samples', retentionRouter);
    app.use('/api/recalls', recallRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Recall.findOneAndUpdate = jest.fn().mockImplementation(async (_filter, update) => ({ ...update.$set }));
    RolePermission.getEffectivePermissions.mockResolvedValue({ permissions: ['*'], mfaPermissions: [] });
  });

  // Feature 3 Tests
  describe('Feature 3: Digital Sample Handover E-Sign & WhatsApp Acknowledgment', () => {
    test('POST /api/medical-reps/visits/:visitId/send-sample-ack-whatsapp dispatches 1-tap link', async () => {
      MrVisit.findById.mockResolvedValue({
        _id: 'visit_123',
        doctorName: 'R. K. Pandey',
        phone: '9876543210',
        sampleDetails: [{ name: 'Chyawanprash Special', qty: 2 }]
      });

      const res = await request(app)
        .post('/api/medical-reps/visits/visit_123/send-sample-ack-whatsapp')
        .send({ doctorPhone: '9876543210' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('dispatched');
      expect(res.body.ackUrl).toContain('visitId=visit_123');
    });

    test('POST /api/medical-reps/visits/:visitId/acknowledge-samples updates digital sample confirmation', async () => {
      const mockSave = jest.fn().mockResolvedValue(true);
      const mockVisit = {
        _id: 'visit_123',
        doctorName: 'R. K. Pandey',
        sampleAcknowledged: false,
        save: mockSave
      };
      MrVisit.findById.mockResolvedValue(mockVisit);

      const res = await request(app)
        .post('/api/medical-reps/visits/visit_123/acknowledge-samples')
        .send({ doctorSignature: 'data:image/png;base64,sampleSig' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockVisit.sampleAcknowledged).toBe(true);
      expect(mockVisit.doctorSignature).toBe('data:image/png;base64,sampleSig');
      expect(mockSave).toHaveBeenCalled();
    });
  });

  // Feature 7 Tests
  describe('Feature 7: Customer Portal Self-Service Order & Dispatch Tracking', () => {
    test('GET /api/portal/orders lists customer orders', async () => {
      Order.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'ord_1', orderNo: 'ORD-1001', customerId: 'cust_999', totalAmount: 15000 }
          ])
        })
      });

      const res = await request(app).get('/api/portal/orders');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].orderNo).toBe('ORD-1001');
    });

    // Tracking was reworked to resolve dispatches through the authoritative,
    // posted Sale Challan linked to the order (see routes/portal/portal.js),
    // and the customer scope is now enforced inside the Order query itself
    // (Order.findOne({ _id, customerId })) rather than checked after the fetch.
    test('GET /api/portal/orders/:id/track returns tracking info if customer owns order', async () => {
      Order.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'ord_1',
          orderNo: 'ORD-1001',
          customerId: 'cust_999',
          status: 'dispatched',
          totalAmount: 15000
        })
      });

      Challan.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ _id: 'challan_1', challanNo: 'CH-0001' }])
        })
      });

      Dispatch.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{
            _id: 'disp_1',
            challanId: 'challan_1',
            transporter: 'VRL Logistics',
            vehicleNo: 'UP65-AT-1234',
            status: 'in_transit',
            dispatchDate: new Date('2026-09-01')
          }])
        })
      });

      const res = await request(app).get('/api/portal/orders/ord_1/track');
      expect(res.status).toBe(200);
      expect(res.body.orderNo).toBe('ORD-1001');
      expect(Array.isArray(res.body.tracking)).toBe(true);
      expect(res.body.tracking[0].transporter).toBe('VRL Logistics');
      expect(res.body.tracking[0].vehicleNo).toBe('UP65-AT-1234');
    });

    // Because the customer scope is now part of the query, an order that
    // belongs to another customer simply doesn't match and returns 404 —
    // this avoids leaking whether the order ID exists at all (an improvement
    // over the previous fetch-then-403 pattern).
    test('GET /api/portal/orders/:id/track returns 404 if order belongs to another customer', async () => {
      Order.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null)
      });

      const res = await request(app).get('/api/portal/orders/ord_other/track');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Order not found');
    });
  });

  // Feature 8 Tests
  describe('Feature 8: AYUSH Retention Sample Disposal & Recall Audit Log', () => {
    test('GET /api/retention-samples/due-for-disposal lists expired retention samples', async () => {
      RetentionSample.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            { _id: 'ret_1', batchNo: 'B-2023-01', productName: 'Ashwagandha Churna', status: 'stored' }
          ])
        })
      });

      const res = await request(app).get('/api/retention-samples/due-for-disposal');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].batchNo).toBe('B-2023-01');
    });

    test('PATCH /api/retention-samples/:id/dispose records disposal method and witness', async () => {
      const mockSave = jest.fn().mockResolvedValue(true);
      const mockSample = {
        _id: 'ret_1',
        batchNo: 'B-2023-01',
        status: 'stored',
        save: mockSave
      };
      RetentionSample.findById.mockResolvedValue(mockSample);

      const res = await request(app)
        .patch('/api/retention-samples/ret_1/dispose')
        .send({ disposalMethod: 'Incineration', witnessedBy: 'Dr. S. K. Verma QC' });

      expect(res.status).toBe(200);
      expect(mockSample.status).toBe('disposed');
      expect(mockSample.disposalNotes).toContain('Method: Incineration');
      expect(mockSample.disposalNotes).toContain('Witness: Dr. S. K. Verma QC');
      expect(mockSave).toHaveBeenCalled();
    });

    test('GET /api/recalls/:id/audit-report generates an internal traceability report without claiming statutory status', async () => {
      Recall.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'recall_1',
          recallNo: 'REC-2026-001',
          batchNo: 'B-2026-88',
          productName: 'Maha Bhringraj Taila',
          severity: 'Class I',
          reason: 'Viscosity deviation',
          totalAffectedQty: 1000,
          recalledQty: 950,
          status: 'completed',
          affectedCustomers: [
            { customerName: 'Apex Distributors', qty: 500, notified: true },
            { customerName: 'City Retailers', qty: 500, notified: true }
          ]
        })
      });

      SystemSettings.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          firmName: 'SHEKHAR BANDHU AUSHADHALAYA',
          manufacturingLicenseNo: 'AYUSH-1983-UP'
        })
      });

      const res = await request(app).get('/api/recalls/recall_1/audit-report');
      expect(res.status).toBe(200);
      expect(res.body.title).toContain('Internal batch recall traceability and effectiveness report');
      expect(res.body.reportStatus).toBe('INTERNAL_RECORD_NOT_A_STATUTORY_SUBMISSION');
      expect(res.body.firmDetails.name).toBe('SHEKHAR BANDHU AUSHADHALAYA');
      expect(res.body.firmDetails.licenseNo).toBe('AYUSH-1983-UP');
      expect(res.body.firmDetails.gmpCertNo).toBeUndefined();
      expect(res.body.reconciliationMetrics.reconciliationPercentage).toBe(95);
      expect(res.body.reconciliationMetrics.unrecoveredQty).toBe(50);
      expect(res.body.reconciliationMetrics.reconciliationStatus).toBe('partially_recovered');
    });


    test('requires traceable notification evidence for an affected invoice', async () => {
      const recall = { _id: 'recall_notify', updatedAt: new Date('2026-11-25T10:00:00Z'), affectedCustomers: [{ invoiceNo: 'INV-1', notified: false }] };
      Recall.findById.mockResolvedValue(recall);
      const missing = await request(app).patch('/api/recalls/recall_notify/notify-customer').send({ invoiceNo: 'INV-1' });
      expect(missing.status).toBe(400);
      expect(Recall.findOneAndUpdate).not.toHaveBeenCalled();
      const recorded = await request(app).patch('/api/recalls/recall_notify/notify-customer').send({
        invoiceNo: 'INV-1', notificationMethod: 'email', notificationReference: 'mail-log-2026-001'
      });
      expect(recorded.status).toBe(200);
      expect(Recall.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: 'recall_notify', updatedAt: recall.updatedAt,
          affectedCustomers: { $elemMatch: { invoiceNo: 'INV-1', notified: { $ne: true } } } }),
        expect.objectContaining({ $set: expect.objectContaining({
          'affectedCustomers.$.notified': true,
          'affectedCustomers.$.notifiedByName': 'Test User',
          'affectedCustomers.$.notificationMethod': 'email',
          'affectedCustomers.$.notificationReference': 'mail-log-2026-001'
        }) }),
        { new: true, runValidators: true }
      );
    });

    test('blocks recall completion until notification and full recovery evidence are reconciled', async () => {
      const recall = {
        _id: 'recall_close', updatedAt: new Date('2026-11-25T10:00:00Z'), status: 'in_progress', totalAffectedQty: 100,
        recalledQty: 90, closureNotes: '',
        affectedCustomers: [{ invoiceNo: 'INV-1', notified: false }],
        save: jest.fn()
      };
      Recall.findById.mockResolvedValue(recall);
      const incomplete = await request(app).patch('/api/recalls/recall_close/status').send({
        status: 'completed', recalledQty: 100, closureNotes: 'Closure reviewed and approved'
      });
      expect(incomplete.status).toBe(409);
      expect(incomplete.body.code).toBe('RECALL_EFFECTIVENESS_EVIDENCE_INCOMPLETE');
      expect(recall.save).not.toHaveBeenCalled();
    });

    test('prevents the recall initiator from independently closing a fully reconciled recall', async () => {
      const recall = {
        _id: 'recall_maker_checker', updatedAt: new Date('2026-11-25T10:00:00Z'),
        initiatedByUserId: '507f1f77bcf86cd799439011', status: 'in_progress',
        totalAffectedQty: 100, recalledQty: 100,
        closureNotes: 'All affected stock accounted for and reviewed',
        affectedCustomers: [{ invoiceNo: 'INV-1', notified: true }]
      };
      Recall.findById.mockResolvedValue(recall);
      const response = await request(app).patch('/api/recalls/recall_maker_checker/status').send({
        status: 'completed', recalledQty: 100,
        closureNotes: 'All affected stock accounted for and reviewed'
      });
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('RECALL_MAKER_CHECKER_REQUIRED');
      expect(Recall.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('returns a conflict when recall closure evidence changes concurrently', async () => {
      const recall = {
        _id: 'recall_stale_close', updatedAt: new Date('2026-11-25T10:00:00Z'),
        initiatedByUserId: '507f191e810c19729de860ea', status: 'in_progress',
        totalAffectedQty: 100, recalledQty: 100,
        closureNotes: 'All affected stock accounted for and reviewed',
        affectedCustomers: [{ invoiceNo: 'INV-1', notified: true }]
      };
      Recall.findById.mockResolvedValue(recall);
      Recall.findOneAndUpdate.mockResolvedValue(null);
      const response = await request(app).patch('/api/recalls/recall_stale_close/status').send({
        status: 'completed', recalledQty: 100,
        closureNotes: 'All affected stock accounted for and reviewed'
      });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('RECALL_UPDATE_CONFLICT');
    });

    test('rejects recalled quantities above the traced distributed quantity', async () => {
      const recall = {
        _id: 'recall_qty', updatedAt: new Date('2026-11-25T10:00:00Z'), status: 'in_progress', totalAffectedQty: 100,
        recalledQty: 0, affectedCustomers: [], save: jest.fn()
      };
      Recall.findById.mockResolvedValue(recall);
      const response = await request(app).patch('/api/recalls/recall_qty/status').send({ recalledQty: 101 });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('INVALID_RECALL_RECONCILIATION');
      expect(recall.save).not.toHaveBeenCalled();
    });

    test('does not invent firm identity, licence or GMP certificate values when configuration is absent', async () => {
      Recall.findById.mockReturnValue({ lean: jest.fn().mockResolvedValue({
        _id: 'recall_2', recallNo: 'REC-2026-002', batchNo: 'B-2026-89',
        productName: 'Test formulation', severity: 'class_II', reason: 'Investigation',
        totalAffectedQty: 0, recalledQty: 0, status: 'initiated', affectedCustomers: []
      }) });
      SystemSettings.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({}) });
      const res = await request(app).get('/api/recalls/recall_2/audit-report');
      expect(res.status).toBe(200);
      expect(res.body.firmDetails).toEqual({});
      expect(res.body.reconciliationMetrics.reconciliationPercentage).toBeNull();
      expect(res.body.reconciliationMetrics.reconciliationStatus).toBe('no_distributed_quantity_identified');
    });
  });
});
