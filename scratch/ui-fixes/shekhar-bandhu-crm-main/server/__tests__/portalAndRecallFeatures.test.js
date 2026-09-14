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
  sendMultiChannelNotification: jest.fn().mockResolvedValue(true)
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

    test('GET /api/recalls/:id/audit-report generates official AYUSH Drug Inspector audit report JSON', async () => {
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
      expect(res.body.title).toContain('AYUSH DRUG INSPECTOR BATCH RECALL AUDIT REPORT');
      expect(res.body.firmDetails.name).toBe('SHEKHAR BANDHU AUSHADHALAYA');
      expect(res.body.reconciliationMetrics.reconciliationPercentage).toBe(95);
      expect(res.body.reconciliationMetrics.unrecoveredQty).toBe(50);
    });
  });
});
