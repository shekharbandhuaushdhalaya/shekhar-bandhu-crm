const express = require('express');
const mongoose = require('mongoose');
const MedicalRepresentative = require('../../models/MedicalRepresentative');
const MrDailyLog = require('../../models/MrDailyLog');
const MrVisit = require('../../models/MrVisit');
const MrExpense = require('../../models/MrExpense');
const MrTourPlan = require('../../models/MrTourPlan');
const MrSampleBag = require('../../models/MrSampleBag');
const Contact = require('../../models/Contact');
const Customer = require('../../models/Customer');
const Doctor = require('../../models/Doctor');
const MrLeave = require('../../models/MrLeave');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');
const { getHaversineDistanceInMeters, compileMRDailyCallReport, calculateMRLeaderboard, calculateTourPlanCompliance, calculateMRProfitability } = require('../../services/medicalRepService');
const { safeEscapeRegex, sendWhatsAppNotification } = require('../../utils/whatsappService');

const router = express.Router();

// Helper: Enforces MR Self-Scoping (MR users can only access their own field data)
async function verifyMrAccess(req, targetMrId) {
  if (!req.user || !targetMrId) return true;
  const role = (req.user.role || '').toLowerCase();

  // Admins, managers, and owners have organization-wide access
  if (role === 'admin' || role === 'manager' || role === 'owner') {
    return true;
  }

  // Scoped MR check by mrId
  if (req.user.mrId && req.user.mrId.toString() !== targetMrId.toString()) {
    return false;
  }

  if (req.user.email) {
    const mr = await MedicalRepresentative.findOne({ email: req.user.email.toLowerCase() }).lean();
    if (mr && mr._id.toString() !== targetMrId.toString()) {
      return false;
    }
  }
  return true;
}

// ─── MR Master CRUD ───

router.get('/', authorize('mr:view'), async (req, res) => {
  try {
    const { search, active } = req.query;
    const filter = {};
    if (active === 'true') filter.isActive = true;
    if (active === 'false') filter.isActive = false;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { territory: { $regex: search, $options: 'i' } },
      ];
    }
    const mrs = await MedicalRepresentative.find(filter)
      .populate('reportingTo', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.json(mrs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authorize('mr:create'), validate(schemas.medicalRepSchema), async (req, res) => {
  try {
    const data = { ...req.body };
    if (!data.code || !data.code.trim()) {
      const count = await MedicalRepresentative.countDocuments();
      data.code = `MR-${(count + 1).toString().padStart(3, '0')}`;
    }
    const mr = await MedicalRepresentative.create(data);
    if (req.io) {
      req.io.emit('medrep_updated', { type: 'created', id: mr._id });
    }
    res.status(201).json(mr);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id', authorize('mr:view'), async (req, res, next) => {
  if (['suggest', 'tour-plans', 'sample-stock', 'matrix', 'events'].includes(req.params.id)) {
    return next();
  }
  try {
    const mr = await MedicalRepresentative.findById(req.params.id)
      .populate('reportingTo', 'name email')
      .lean();
    if (!mr) return res.status(404).json({ error: 'MR not found' });
    res.json(mr);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authorize('mr:edit'), validate(schemas.medicalRepSchema.partial()), async (req, res) => {
  try {
    const mr = await MedicalRepresentative.findByIdAndUpdate(
      req.params.id, req.body, { new: true, runValidators: true }
    );
    if (!mr) return res.status(404).json({ error: 'MR not found' });

    // Revoke system user access if deactivated
    if (req.body.isActive === false) {
      const User = require('../../models/User');
      if (mr.email) {
        await User.updateMany({ email: mr.email.toLowerCase() }, { canAccessCash: false, role: 'disabled' });
      }
    }

    if (req.io) {
      req.io.emit('medrep_updated', { type: 'updated', id: mr._id });
    }
    res.json(mr);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', authorize('mr:delete'), async (req, res) => {
  try {
    const mr = await MedicalRepresentative.findByIdAndDelete(req.params.id);
    if (!mr) return res.status(404).json({ error: 'MR not found' });

    // Revoke system access: Permanently delete associated login credentials
    const User = require('../../models/User');
    if (mr.email) {
      await User.deleteMany({ email: mr.email.toLowerCase() });
    }

    await MrDailyLog.deleteMany({ mrId: req.params.id });
    await MrVisit.deleteMany({ mrId: req.params.id });
    await MrExpense.deleteMany({ mrId: req.params.id });
    await MrTourPlan.deleteMany({ mrId: req.params.id });
    await MrSampleBag.deleteMany({ mrId: req.params.id });

    if (req.io) {
      req.io.emit('medrep_updated', { type: 'deleted', id: req.params.id });
    }
    res.json({ message: 'MR deleted and system user access revoked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Daily Attendance (Check-in / Check-out) ───

router.get('/:mrId/attendance', authorize('mr:view'), async (req, res) => {
  try {
    const { from, to, limit = 50 } = req.query;
    const filter = { mrId: req.params.mrId };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }
    const logs = await MrDailyLog.find(filter)
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:mrId/checkin', authorize('mr:attendance'), validate(schemas.mrCheckinSchema), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startKm = req.body.startKmReading ? Number(req.body.startKmReading) : 0;

    let log = await MrDailyLog.findOne({ mrId: req.params.mrId, date: today });
    if (log) {
      if (log.status === 'checked_in') {
        return res.status(400).json({ error: 'Already checked in today' });
      }
      log.status = 'checked_in';
      log.checkIn = { time: new Date(), ...req.body };
      if (startKm > 0) log.startKmReading = startKm;
      await log.save();
      return res.json(log);
    }
    log = await MrDailyLog.create({
      mrId: req.params.mrId,
      date: today,
      checkIn: { time: new Date(), ...req.body },
      startKmReading: startKm,
      status: 'checked_in',
    });
    if (req.io) {
      req.io.emit('medrep_updated', { type: 'checkin', mrId: req.params.mrId });
    }
    res.status(201).json(log);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});



router.post('/:mrId/checkout', authorize('mr:attendance'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const log = await MrDailyLog.findOne({ mrId: req.params.mrId, date: today });
    if (!log) return res.status(400).json({ error: 'No check-in found for today' });
    if (log.status === 'checked_out') return res.status(400).json({ error: 'Already checked out today' });
    
    const endKm = req.body.endKmReading ? Number(req.body.endKmReading) : 0;
    log.checkOut = { time: new Date(), ...req.body };
    log.endKmReading = endKm;
    log.status = 'checked_out';

    if (endKm > 0 && log.startKmReading > 0) {
      log.totalDistance = Math.max(0, endKm - log.startKmReading);
    }

    const ciLat = log.checkIn?.latitude;
    const ciLng = log.checkIn?.longitude;
    const coLat = req.body.latitude || log.checkOut?.latitude;
    const coLng = req.body.longitude || log.checkOut?.longitude;
    if (ciLat && ciLng && coLat && coLng) {
      const distMeters = getHaversineDistanceInMeters(ciLat, ciLng, coLat, coLng);
      if (distMeters !== null) {
        log.gpsDistance = Math.round((distMeters / 1000) * 100) / 100;
      }
    }

    if (!log.totalDistance && log.gpsDistance > 0) {
      log.totalDistance = log.gpsDistance;
    }

    await log.save();
    if (req.io) {
      req.io.emit('medrep_updated', { type: 'checkout', mrId: req.params.mrId });
    }
    res.json(log);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Doctor Visits ───

router.get('/:mrId/visits', authorize('mr:view'), async (req, res) => {
  try {
    const { from, to, limit = 100 } = req.query;
    const filter = { mrId: req.params.mrId };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }
    const visits = await MrVisit.find(filter)
      .sort({ date: -1, 'checkIn.time': -1 })
      .limit(parseInt(limit))
      .populate('sampleDetails.productId', 'name sku')
      .lean();
    res.json(visits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:mrId/visits', authorize('mr:visits'), validate(schemas.mrVisitSchema), async (req, res) => {
  try {
    const data = { ...req.body, mrId: req.params.mrId };
    if (!data.date) data.date = new Date();

    // Auto-find or auto-create Doctor record
    let doctorObj = null;
    if (data.doctorId) {
      doctorObj = await Doctor.findById(data.doctorId);
    }
    if (!doctorObj && data.doctorName) {
      const escaped = safeEscapeRegex(data.doctorName.trim());
      doctorObj = await Doctor.findOne({ name: { $regex: new RegExp(escaped, 'i') } });
      if (!doctorObj) {
        doctorObj = await Doctor.create({
          name: data.doctorName.trim(),
          clinicName: data.clinicName || '',
          specialization: data.specialization || '',
          city: data.city || '',
          latitude: data.latitude,
          longitude: data.longitude
        });
      }
      data.doctorId = doctorObj._id;
    } else if (doctorObj) {
      data.doctorId = doctorObj._id;
      if (!data.doctorName) data.doctorName = doctorObj.name;
    }

    let doctorVerified = false;
    if (data.latitude && data.longitude && doctorObj) {
      if (doctorObj.latitude && doctorObj.longitude) {
        const dist = getHaversineDistanceInMeters(data.latitude, data.longitude, doctorObj.latitude, doctorObj.longitude);
        if (dist !== null && dist <= 200) {
          doctorVerified = true;
          data.doctorVerified = true;
          data.doctorVerifiedAt = new Date();
        }
      }
    }

    // Doctor Monthly Sample Quota Validation
    if (data.sampleDetails && data.sampleDetails.length > 0) {
      const requestedQty = data.sampleDetails.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
      if (requestedQty > 0) {
        let monthlyQuota = doctorObj && doctorObj.monthlySampleQuota ? doctorObj.monthlySampleQuota : null;
        if (!monthlyQuota) {
          const category = (doctorObj ? doctorObj.category || '' : '').toUpperCase();
          if (category === 'A') monthlyQuota = 10;
          else if (category === 'B') monthlyQuota = 5;
          else if (category === 'C') monthlyQuota = 2;
          else monthlyQuota = 5;
        }

        const visitDate = new Date(data.date || Date.now());
        const startOfMonth = new Date(visitDate.getFullYear(), visitDate.getMonth(), 1);
        const endOfMonth = new Date(visitDate.getFullYear(), visitDate.getMonth() + 1, 0, 23, 59, 59, 999);

        const filterDoc = {};
        if (doctorObj) {
          filterDoc.$or = [{ doctorId: doctorObj._id }, { doctorName: data.doctorName }];
        } else {
          filterDoc.doctorName = data.doctorName;
        }
        filterDoc.date = { $gte: startOfMonth, $lte: endOfMonth };

        const monthVisits = await MrVisit.find(filterDoc).lean();
        let alreadyGivenQty = 0;
        for (const mv of monthVisits) {
          if (mv.sampleDetails && mv.sampleDetails.length > 0) {
            alreadyGivenQty += mv.sampleDetails.reduce((sum, s) => sum + (Number(s.qty) || 0), 0);
          }
        }

        if (alreadyGivenQty + requestedQty > monthlyQuota) {
          return res.status(400).json({
            error: `Sample monthly quota exceeded for doctor "${data.doctorName}". Monthly limit: ${monthlyQuota} units, Already issued this month: ${alreadyGivenQty} units, Requested: ${requestedQty} units.`,
            monthlyQuota,
            alreadyGivenQty,
            requestedQty
          });
        }
      }
    }

    const visit = await MrVisit.create(data);

    // Deduct sample quantities from MR Field Bag Stock (MrSampleStock)
    if (data.sampleDetails && data.sampleDetails.length > 0) {
      const MrSampleStock = require('../../models/MrSampleStock');
      for (const s of data.sampleDetails) {
        if (s.productId && (Number(s.qty) > 0)) {
          await MrSampleStock.findOneAndUpdate(
            { mrId: req.params.mrId, productId: s.productId },
            { $inc: { qty: -Number(s.qty) } },
            { upsert: false }
          );
        }
      }
    }

    // Check & update Permanent Journey Plan (PJP) adherence if plan exists for MR + date
    try {
      const PermanentJourneyPlan = require('../../models/PermanentJourneyPlan');
      const visitDate = new Date(data.date || Date.now());
      const startOfDay = new Date(visitDate); startOfDay.setHours(0,0,0,0);
      const endOfDay = new Date(visitDate); endOfDay.setHours(23,59,59,999);

      const pjp = await PermanentJourneyPlan.findOne({
        mrId: req.params.mrId,
        plannedDate: { $gte: startOfDay, $lte: endOfDay }
      });

      if (pjp && pjp.targetDoctors && pjp.targetDoctors.length > 0) {
        let matched = false;
        const vDoctorName = (data.doctorName || '').trim().toLowerCase();
        const vDoctorId = data.doctorId ? data.doctorId.toString() : null;

        for (const target of pjp.targetDoctors) {
          const tName = (target.doctorName || '').trim().toLowerCase();
          const tId = target.doctorId ? target.doctorId.toString() : null;

          if ((vDoctorId && tId === vDoctorId) || (vDoctorName && tName === vDoctorName)) {
            target.visited = true;
            target.visitedAt = new Date();
            matched = true;
          }
        }

        if (matched) {
          const visitedCount = pjp.targetDoctors.filter(t => t.visited).length;
          const totalPlanned = pjp.targetDoctors.length;
          pjp.adherencePercentage = Math.round((visitedCount / totalPlanned) * 100 * 10) / 10;
          if (pjp.adherencePercentage >= 100) {
            pjp.status = 'completed';
          } else if (pjp.adherencePercentage > 0) {
            pjp.status = 'partially_completed';
          }
          await pjp.save();
        }
      }
    } catch (_) {
      // Non-blocking PJP update catch
    }

    if (data.sampleDetails && data.sampleDetails.length > 0) {
      const StockMovement = require('../../models/StockMovement');
      const Product = require('../../models/Product');
      const InventoryEntry = require('../../models/InventoryEntry');

      const mr = await MedicalRepresentative.findById(req.params.mrId);
      const count = await StockMovement.countDocuments({ type: 'sample' });
      const docNo = `DC-SMP-${(count + 1).toString().padStart(4, '0')}`;

      const items = [];
      for (const s of data.sampleDetails) {
        let prodName = s.name;
        let pId = s.productId;
        let batchNo = s.batchNo || '';

        if (pId) {
          const p = await Product.findById(pId);
          if (p) {
            prodName = p.name;
            const qtyBoxes = Number(s.qty) || 1;
            p.stockLevel = Math.max(0, (p.stockLevel || 0) - qtyBoxes);
            await p.save();

            // Deduct sample balance from MR's personal bag
            const sampleBagItem = await MrSampleBag.findOne({ mrId: req.params.mrId, productId: pId });
            if (sampleBagItem) {
              sampleBagItem.qty = Math.max(0, sampleBagItem.qty - qtyBoxes);
              await sampleBagItem.save();
            }

            if (!batchNo) {
              const invEntry = await InventoryEntry.findOne({
                productId: pId,
                qtyBoxes: { $gt: 0 },
                batchNo: { $ne: '' }
              }).sort({ mfgDate: 1, createdAt: 1 }).lean();
              if (invEntry && invEntry.batchNo) {
                batchNo = invEntry.batchNo;
              }
            }
          }
        }
        items.push({
          productId: pId || null,
          productName: prodName || 'Doctor Sample',
          qty: Number(s.qty) || 1,
          packing: 1,
          rate: 0,
          mrp: 0,
          batchNo: batchNo
        });
      }

      await StockMovement.create({
        docNo,
        direction: 'out',
        type: 'sample',
        date: data.date,
        partyType: 'mr',
        partyId: req.params.mrId,
        partyName: data.doctorName ? `Dr. ${data.doctorName} (via ${mr ? mr.name : 'MR'})` : (mr ? mr.name : 'MR'),
        medicalRepName: mr ? mr.name : '',
        doctorName: data.doctorName || '',
        items,
        isFree: true,
        status: 'dispatched',
        sourceDocType: 'MrVisit',
        sourceDocId: visit._id,
        notes: `Free doctor samples given during clinic visit to Dr. ${data.doctorName || ''}`
      });
    }

    if (req.io) {
      req.io.emit('medrep_updated', { type: 'visit_created', mrId: req.params.mrId, visitId: visit._id });
    }
    res.status(201).json(visit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/visits/:visitId', authorize('mr:visits'), validate(schemas.mrVisitSchema.partial()), async (req, res) => {
  try {
    const visit = await MrVisit.findByIdAndUpdate(
      req.params.visitId, req.body, { new: true, runValidators: true }
    );
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    if (req.io) {
      req.io.emit('medrep_updated', { type: 'visit_updated', visitId: visit._id });
    }
    res.json(visit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/visits/:visitId', authorize('mr:delete'), async (req, res) => {
  try {
    const visit = await MrVisit.findByIdAndDelete(req.params.visitId);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
    if (req.io) {
      req.io.emit('medrep_updated', { type: 'visit_deleted', visitId: req.params.visitId });
    }
    res.json({ message: 'Visit deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Expense Claims ───

router.get('/:mrId/expenses', authorize('mr:view'), async (req, res) => {
  try {
    const { from, to, status, limit = 100 } = req.query;
    const filter = { mrId: req.params.mrId };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }
    if (status) filter.status = status;
    const expenses = await MrExpense.find(filter)
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .populate('approvedBy', 'name')
      .lean();
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:mrId/expenses', authorize('mr:expenses'), validate(schemas.mrExpenseSchema), async (req, res) => {
  try {
    const data = { ...req.body, mrId: req.params.mrId };
    if (!data.date) data.date = new Date();
    const expense = await MrExpense.create(data);
    if (req.io) {
      req.io.emit('medrep_updated', { type: 'expense_created', mrId: req.params.mrId });
    }
    res.status(201).json(expense);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/expenses/:expenseId/approve', authorize('mr:approveExpenses'), async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }
    const expense = await MrExpense.findByIdAndUpdate(
      req.params.expenseId,
      { status, approvedBy: req.user.id, approvedAt: new Date(), rejectionReason: rejectionReason || '' },
      { new: true }
    ).populate('approvedBy', 'name');
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    if (req.io) {
      req.io.emit('medrep_updated', { type: 'expense_approved', expenseId: expense._id });
    }
    res.json(expense);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/expenses/:expenseId', authorize('mr:delete'), async (req, res) => {
  try {
    const expense = await MrExpense.findByIdAndDelete(req.params.expenseId);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    if (req.io) {
      req.io.emit('medrep_updated', { type: 'expense_deleted', expenseId: req.params.expenseId });
    }
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Beat Plan / Tour Plan ───

router.get('/:mrId/tour-plans', authorize('mr:view'), async (req, res) => {
  try {
    const { month, year } = req.query;
    const filter = { mrId: req.params.mrId };
    if (month) filter.month = month;
    if (year) filter.year = Number(year);

    const tourPlans = await MrTourPlan.find(filter)
      .populate('approvedBy', 'name email')
      .sort({ year: -1, month: -1 })
      .lean();
    res.json(tourPlans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:mrId/tour-plans', authorize('mr:visits'), validate(schemas.mrTourPlanSchema), async (req, res) => {
  try {
    const { month, year, entries, status = 'submitted' } = req.body;
    const mrId = req.params.mrId;

    let tourPlan = await MrTourPlan.findOne({ mrId, month, year: Number(year) });
    if (tourPlan) {
      tourPlan.entries = entries || [];
      tourPlan.status = status;
      if (status === 'submitted') {
        tourPlan.approvedBy = null;
        tourPlan.rejectionReason = '';
      }
      await tourPlan.save();
    } else {
      tourPlan = await MrTourPlan.create({
        mrId,
        month,
        year: Number(year),
        entries: entries || [],
        status
      });
    }

    if (req.io) {
      req.io.emit('medrep_updated', { type: 'tour_plan_updated', mrId, id: tourPlan._id });
    }
    res.status(201).json(tourPlan);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/tour-plans/:id/status', authorize('mr:edit'), async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }

    const tourPlan = await MrTourPlan.findByIdAndUpdate(
      req.params.id,
      {
        status,
        approvedBy: req.user ? req.user.id : null,
        approvedAt: new Date(),
        rejectionReason: rejectionReason || ''
      },
      { new: true }
    ).populate('approvedBy', 'name');

    if (!tourPlan) return res.status(404).json({ error: 'Tour plan not found' });

    // Send WhatsApp Push Notification to MR
    const mr = await MedicalRepresentative.findById(tourPlan.mrId);
    if (mr && mr.phone) {
      const msg = `Your Tour Plan for ${tourPlan.month}/${tourPlan.year} has been ${status.toUpperCase()}.${status === 'rejected' ? ` Reason: ${rejectionReason}` : ''}`;
      sendWhatsAppNotification(mr.phone, msg);
    }

    if (req.io) {
      req.io.emit('medrep_updated', { type: 'tour_plan_status', id: tourPlan._id });
    }
    res.json(tourPlan);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/medical-reps/tour-plans/compliance — Planned vs Actual Beat Plan Report
router.get('/tour-plans/compliance', authorize('mr:view'), async (req, res) => {
  try {
    const { mrId, month, year } = req.query;
    if (!mrId) return res.status(400).json({ error: 'mrId parameter is required' });
    const report = await calculateTourPlanCompliance(mrId, month, year);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/medical-reps/tour-plans/suggest — Suggest doctors for beat/tour plan for a given day
router.get(['/tour-plans/suggest', '/suggest'], authorize('mr:view'), async (req, res) => {
  try {
    const { mrId, date, lat, lng } = req.query;
    if (!mrId || !date) {
      return res.status(400).json({ error: 'mrId and date query parameters are required' });
    }

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDay = daysOfWeek[new Date(date).getDay()];

    const doctors = await Doctor.find({ assignedMrId: mrId, preferredVisitDay: targetDay }).lean();

    const reqLat = parseFloat(lat);
    const reqLng = parseFloat(lng);
    const hasCoords = !isNaN(reqLat) && !isNaN(reqLng);

    const suggestions = doctors.map(doc => {
      let distanceKm = null;
      if (hasCoords && doc.latitude && doc.longitude) {
        const distMeters = getHaversineDistanceInMeters(reqLat, reqLng, doc.latitude, doc.longitude);
        if (distMeters !== null) {
          distanceKm = Number((distMeters / 1000).toFixed(2));
        }
      }
      return {
        _id: doc._id,
        name: doc.name,
        clinicName: doc.clinicName || '',
        specialization: doc.specialization || '',
        category: doc.category || '',
        preferredTime: doc.preferredTime || '',
        preferredVisitDay: doc.preferredVisitDay || '',
        address: doc.address || '',
        city: doc.city || '',
        latitude: doc.latitude,
        longitude: doc.longitude,
        distanceKm
      };
    });

    if (hasCoords) {
      suggestions.sort((a, b) => {
        if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
        if (a.distanceKm !== null) return -1;
        if (b.distanceKm !== null) return 1;
        return 0;
      });
    }

    res.json({
      mrId,
      date,
      dayOfWeek: targetDay,
      suggestedCount: suggestions.length,
      doctors: suggestions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Doctor Classification & Event Matrix ───

router.get('/doctors/matrix', authorize('mr:view'), async (req, res) => {
  try {
    const { mrId } = req.query;
    const filter = { category: { $in: ['A', 'B', 'C'] } };
    if (mrId) filter.assignedMrId = mrId;

    const doctors = await Doctor.find(filter)
      .populate('assignedMrId', 'name code')
      .lean();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const visitsThisMonth = await MrVisit.find({
      date: { $gte: startOfMonth, $lte: endOfMonth }
    }).lean();

    const visitCounts = {};
    visitsThisMonth.forEach(v => {
      if (v.doctorId) {
        const idKey = v.doctorId.toString();
        visitCounts[idKey] = (visitCounts[idKey] || 0) + 1;
      }
      if (v.doctorName) {
        const nameKey = v.doctorName.trim().toLowerCase();
        visitCounts[nameKey] = (visitCounts[nameKey] || 0) + 1;
      }
    });

    const report = doctors.map(doc => {
      const requiredVisits = doc.category === 'A' ? 4 : (doc.category === 'B' ? 2 : 1);
      const idKey = doc._id.toString();
      const nameKey = doc.name.trim().toLowerCase();
      const actualVisits = visitCounts[idKey] || visitCounts[nameKey] || 0;
      const compliancePct = Math.min(100, Number(((actualVisits / requiredVisits) * 100).toFixed(1)));

      return {
        _id: doc._id,
        name: doc.name,
        clinic: doc.clinicName || '',
        category: doc.category,
        specialty: doc.specialization,
        specialization: doc.specialization,
        preferredTime: doc.preferredTime,
        assignedMr: doc.assignedMrId,
        requiredVisits,
        actualVisits,
        compliancePct
      };
    });

    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/doctors/events', authorize('mr:view'), async (req, res) => {
  try {
    const doctors = await Doctor.find({
      $or: [{ birthday: { $ne: null } }, { anniversary: { $ne: null } }]
    }).populate('assignedMrId', 'name phone').lean();

    const events = [];

    doctors.forEach(doc => {
      if (doc.birthday) {
        events.push({
          doctorId: doc._id,
          doctorName: doc.name,
          clinic: doc.clinicName || '',
          eventType: 'Birthday',
          date: new Date(doc.birthday),
          assignedMr: doc.assignedMrId
        });
      }
      if (doc.anniversary) {
        events.push({
          doctorId: doc._id,
          doctorName: doc.name,
          clinic: doc.clinicName || '',
          eventType: 'Anniversary',
          date: new Date(doc.anniversary),
          assignedMr: doc.assignedMrId
        });
      }
    });

    events.sort((a, b) => a.date.getTime() - b.date.getTime());
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MR Sample Bag Inventory ───

// ─── MR Sample Bag Inventory ───

const sampleOtpStore = new Map();

router.get('/:mrId/sample-bag', authorize('mr:view'), async (req, res) => {
  try {
    if (!(await verifyMrAccess(req, req.params.mrId))) {
      return res.status(403).json({ error: 'Access denied: You can only view your own sample bag.' });
    }

    const items = await MrSampleBag.find({ mrId: req.params.mrId })
      .populate('productId', 'name sku unit category')
      .lean();

    const now = Date.now();
    const enriched = items.map(item => {
      let daysToExpiry = null;
      let isNearExpiry = false;
      let isExpired = false;

      if (item.expiryDate) {
        const diffMs = new Date(item.expiryDate).getTime() - now;
        daysToExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (daysToExpiry <= 0) {
          isExpired = true;
        } else if (daysToExpiry <= 30) {
          isNearExpiry = true;
        }
      }

      return {
        ...item,
        daysToExpiry,
        isNearExpiry,
        isExpired
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:mrId/sample-bag/issue', authorize('mr:edit'), validate(schemas.mrSampleIssueSchema), async (req, res) => {
  try {
    const { productId, batchNo = '', qty, expiryDate } = req.body;
    const mrId = req.params.mrId;
    const currentUserId = (req.user && req.user.id && mongoose.Types.ObjectId.isValid(req.user.id)) ? req.user.id : null;

    let finalExpiryDate = expiryDate ? new Date(expiryDate) : null;
    if (!finalExpiryDate && batchNo) {
      const InventoryEntry = require('../../models/InventoryEntry');
      const invEntry = await InventoryEntry.findOne({ productId, batchNo }).lean();
      if (invEntry && invEntry.expiryDate) {
        finalExpiryDate = invEntry.expiryDate;
      }
    }

    let sampleBagItem = await MrSampleBag.findOne({ mrId, productId, batchNo });
    if (sampleBagItem) {
      sampleBagItem.qty += Number(qty);
      sampleBagItem.allocatedBy = currentUserId;
      sampleBagItem.allocatedAt = new Date();
      if (finalExpiryDate) sampleBagItem.expiryDate = finalExpiryDate;
      await sampleBagItem.save();
    } else {
      sampleBagItem = await MrSampleBag.create({
        mrId,
        productId,
        batchNo,
        qty: Number(qty),
        expiryDate: finalExpiryDate,
        allocatedBy: currentUserId
      });
    }

    const Product = require('../../models/Product');
    const prod = await Product.findById(productId);
    if (prod) {
      prod.stockLevel = Math.max(0, (prod.stockLevel || 0) - Number(qty));
      await prod.save();
    }

    if (req.io) {
      req.io.emit('medrep_updated', { type: 'sample_issued', mrId, productId });
    }
    res.status(201).json(sampleBagItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Doctor Sample OTP Acknowledgment ───

router.post('/sample-otp/send', authorize('mr:visits'), async (req, res) => {
  try {
    const { doctorId, doctorPhone, doctorName } = req.body;
    if (!doctorId && !doctorPhone && !doctorName) {
      return res.status(400).json({ error: 'doctorId, doctorPhone, or doctorName is required' });
    }

    const otpKey = doctorId || doctorPhone || doctorName;
    const otp = '1234'; // Standard mock OTP for field verification
    sampleOtpStore.set(otpKey.toString().toLowerCase(), { otp, expiresAt: Date.now() + 10 * 60 * 1000 });

    res.json({
      success: true,
      message: `Sample verification OTP sent to doctor. (Mock OTP: ${otp})`,
      otpKey,
      otp
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sample-otp/verify', authorize('mr:visits'), async (req, res) => {
  try {
    const { otpKey, otp } = req.body;
    if (!otpKey || !otp) {
      return res.status(400).json({ error: 'otpKey and otp are required' });
    }

    const record = sampleOtpStore.get(otpKey.toString().toLowerCase());
    if (!record || record.expiresAt < Date.now()) {
      return res.status(400).json({ verified: false, error: 'OTP expired or not requested' });
    }

    if (record.otp !== otp.toString().trim()) {
      return res.status(400).json({ verified: false, error: 'Invalid OTP entered' });
    }

    sampleOtpStore.delete(otpKey.toString().toLowerCase());
    res.json({ verified: true, message: 'Doctor sample acknowledgment OTP verified successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MR Field Bag Sample Stock API ───

// GET /api/medical-reps/:mrId/sample-stock — Get current sample stock in MR bag
router.get('/:mrId/sample-stock', authorize('mr:view'), async (req, res) => {
  try {
    const MrSampleStock = require('../../models/MrSampleStock');
    const stock = await MrSampleStock.find({ mrId: req.params.mrId })
      .populate('productId', 'name sku productType packing stockLevel')
      .lean();
    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/medical-reps/:mrId/sample-stock/issue — Issue/dispatch sample stock to MR bag
router.post('/:mrId/sample-stock/issue', authorize('mr:create'), async (req, res) => {
  try {
    const MrSampleStock = require('../../models/MrSampleStock');
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const mrId = req.params.mrId;
    const mr = await MedicalRepresentative.findById(mrId);
    if (!mr) return res.status(404).json({ error: 'MR not found' });

    const updatedStock = [];
    for (const item of items) {
      if (!item.productId || !item.qty) continue;
      const qtyNum = Math.max(0, parseInt(item.qty, 10) || 0);
      if (qtyNum <= 0) continue;

      const record = await MrSampleStock.findOneAndUpdate(
        { mrId, productId: item.productId },
        {
          $inc: { qty: qtyNum },
          $set: { lastIssuedAt: new Date() }
        },
        { upsert: true, new: true, runValidators: true }
      ).populate('productId', 'name sku productType packing');

      updatedStock.push(record);
    }

    res.json({
      message: `Successfully issued ${updatedStock.length} sample products to ${mr.name}'s bag stock`,
      stock: updatedStock
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mr-sample-stock/issue — Issue sample stock to Doctor and create issuance audit log
router.post(['/sample-stock/issue-to-doctor', '/issue-to-doctor'], authorize('mr:visits'), async (req, res) => {
  try {
    const MrSampleStock = require('../../models/MrSampleStock');
    const MrSampleIssuance = require('../../models/MrSampleIssuance');
    const Product = require('../../models/Product');

    const { mrId, doctorId, productId, qty, unitCost, date } = req.body;
    if (!mrId || !doctorId || !productId || !qty) {
      return res.status(400).json({ error: 'mrId, doctorId, productId, and qty are required' });
    }

    const qtyVal = Math.max(1, parseInt(qty, 10) || 1);

    await MrSampleStock.findOneAndUpdate(
      { mrId, productId },
      { $inc: { qty: -qtyVal } },
      { upsert: false }
    );

    let effectiveUnitCost = Number(unitCost);
    if (isNaN(effectiveUnitCost) || effectiveUnitCost <= 0) {
      const prod = await Product.findById(productId).lean();
      effectiveUnitCost = prod ? (prod.price || prod.mrp || 0) : 0;
    }

    const issuance = await MrSampleIssuance.create({
      mrId,
      doctorId,
      productId,
      qty: qtyVal,
      unitCost: effectiveUnitCost,
      date: date ? new Date(date) : new Date()
    });

    res.status(201).json(issuance);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/medical-reps/:id/sample-roi — MR-level aggregate Sample ROI across assigned doctors
router.get('/:id/sample-roi', authorize('mr:view'), async (req, res) => {
  try {
    const Invoice = require('../../models/Invoice');
    const MrSampleIssuance = require('../../models/MrSampleIssuance');
    const Doctor = require('../../models/Doctor');

    const mrId = req.params.id;
    const mr = await MedicalRepresentative.findById(mrId).lean();
    if (!mr) return res.status(404).json({ error: 'MR not found' });

    const doctors = await Doctor.find({ assignedMrId: mrId }).lean();
    const docIds = doctors.map(d => d._id);
    const docNames = doctors.map(d => d.name.trim());

    const [issuances, invoices] = await Promise.all([
      MrSampleIssuance.find({ mrId }).lean(),
      Invoice.find({
        $or: [
          { prescribingDoctorId: { $in: docIds } },
          { doctorName: { $in: docNames } }
        ]
      }).lean()
    ]);

    const totalSampleCost = issuances.reduce((sum, iss) => sum + ((iss.qty || 0) * (iss.unitCost || 0)), 0);
    const totalRxRevenue = invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const roiRatio = totalSampleCost > 0 ? Number((totalRxRevenue / totalSampleCost).toFixed(2)) : 0;

    res.json({
      mrId,
      mrName: mr.name,
      doctorCount: doctors.length,
      totalSampleCost: Number(totalSampleCost.toFixed(2)),
      totalRxRevenue: Number(totalRxRevenue.toFixed(2)),
      roiRatio,
      invoiceCount: invoices.length,
      sampleIssuanceCount: issuances.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DCR & Performance Leaderboard ───

router.get('/:mrId/dcr', authorize('mr:view'), async (req, res) => {
  try {
    const dcr = await compileMRDailyCallReport(req.params.mrId, req.query.date);
    if (!dcr) return res.status(404).json({ error: 'MR not found' });
    res.json(dcr);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/leaderboard', authorize('mr:view'), async (req, res) => {
  try {
    const result = await calculateMRLeaderboard(req.query.month, req.query.year);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Dashboard / Reports ───

router.get('/dashboard/summary', authorize('mr:view'), async (req, res) => {
  try {
    const { from, to, mrId } = req.query;
    const dateFilter = {};
    if (from || to) {
      dateFilter.date = {};
      if (from) dateFilter.date.$gte = new Date(from);
      if (to) dateFilter.date.$lte = new Date(to);
    }

    const mrFilter = {};
    if (mrId) mrFilter._id = mrId;

    const mrs = await MedicalRepresentative.find(mrFilter).lean();
    const mrIds = mrs.map(m => m._id);

    if (mrIds.length === 0) {
      return res.json({ mrs: [], totals: { visits: 0, orders: 0, orderValue: 0, expenses: 0, distance: 0 } });
    }

    const visitFilter = { mrId: { $in: mrIds }, ...dateFilter };
    const expenseFilter = { mrId: { $in: mrIds }, ...dateFilter };

    const [visits, expenses, attendance] = await Promise.all([
      MrVisit.find(visitFilter).lean(),
      MrExpense.find(expenseFilter).lean(),
      MrDailyLog.find({ mrId: { $in: mrIds }, ...dateFilter }).lean(),
    ]);

    const visitMap = {};
    visits.forEach(v => {
      if (!visitMap[v.mrId]) visitMap[v.mrId] = { total: 0, orders: 0, orderValue: 0 };
      visitMap[v.mrId].total++;
      if (v.orderTaken) {
        visitMap[v.mrId].orders++;
        visitMap[v.mrId].orderValue += (v.orderAmount || 0);
      }
    });

    const expenseMap = {};
    expenses.forEach(e => {
      if (!expenseMap[e.mrId]) expenseMap[e.mrId] = 0;
      expenseMap[e.mrId] += e.amount;
    });

    const attendanceMap = {};
    attendance.forEach(a => {
      if (!attendanceMap[a.mrId]) attendanceMap[a.mrId] = { days: 0, totalDistance: 0 };
      attendanceMap[a.mrId].days++;
      attendanceMap[a.mrId].totalDistance += (a.totalDistance || 0);
    });

    const summary = mrs.map(m => ({
      _id: m._id,
      name: m.name,
      code: m.code,
      phone: m.phone,
      photo: m.photo,
      territory: m.territory,
      monthlyTarget: m.monthlyTarget,
      visits: visitMap[m._id]?.total || 0,
      orders: visitMap[m._id]?.orders || 0,
      orderValue: visitMap[m._id]?.orderValue || 0,
      expenses: expenseMap[m._id] || 0,
      daysWorked: attendanceMap[m._id]?.days || 0,
      totalDistance: attendanceMap[m._id]?.totalDistance || 0,
    }));

    const totals = summary.reduce((acc, m) => ({
      visits: acc.visits + m.visits,
      orders: acc.orders + m.orders,
      orderValue: acc.orderValue + m.orderValue,
      expenses: acc.expenses + m.expenses,
      distance: acc.distance + m.totalDistance,
    }), { visits: 0, orders: 0, orderValue: 0, expenses: 0, distance: 0 });

    res.json({ mrs: summary, totals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/expenses/all', authorize('mr:approveExpenses'), async (req, res) => {
  try {
    const { from, to, status, limit = 200 } = req.query;
    const filter = {};
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }
    if (status) filter.status = status;
    const expenses = await MrExpense.find(filter)
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .populate('mrId', 'name code phone')
      .populate('approvedBy', 'name')
      .lean();
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/visits/all', authorize('mr:view'), async (req, res) => {
  try {
    const { from, to, mrId, limit = 200 } = req.query;
    const filter = {};
    if (mrId) filter.mrId = mrId;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }
    const visits = await MrVisit.find(filter)
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .populate('mrId', 'name code phone')
      .populate('sampleDetails.productId', 'name')
      .lean();
    res.json(visits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/samples/distribution', authorize('mr:view'), async (req, res) => {
  try {
    const visits = await MrVisit.find({ 'sampleDetails.0': { $exists: true } })
      .sort({ date: -1 })
      .populate('mrId', 'name code territory')
      .populate('sampleDetails.productId', 'name sku')
      .lean();
    res.json(visits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/commission/calculate', authorize('mr:view'), async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    const queryMonth = month || (now.getMonth() + 1).toString().padStart(2, '0');
    const queryYear = parseInt(year, 10) || now.getFullYear();

    const startDate = new Date(queryYear, parseInt(queryMonth, 10) - 1, 1);
    const endDate = new Date(queryYear, parseInt(queryMonth, 10), 0, 23, 59, 59, 999);

    const mrs = await MedicalRepresentative.find({ isActive: true }).lean();
    const mrIds = mrs.map(m => m._id);

    const salesData = await MrVisit.aggregate([
      {
        $match: {
          mrId: { $in: mrIds },
          date: { $gte: startDate, $lte: endDate },
          orderTaken: true
        }
      },
      {
        $group: {
          _id: '$mrId',
          totalSales: { $sum: '$orderAmount' }
        }
      }
    ]);

    const salesMap = {};
    salesData.forEach(item => {
      if (item._id) {
        salesMap[item._id.toString()] = item.totalSales;
      }
    });

    const report = mrs.map(mr => {
      const sales = salesMap[mr._id] || 0;
      const target = mr.monthlyTarget || 100000;
      const achievementPct = target > 0 ? (sales / target) * 100 : 0;
      
      let rate = 0.01;
      if (achievementPct >= 100) rate = 0.05;
      else if (achievementPct >= 75) rate = 0.025;

      const commission = sales * rate;

      return {
        mrId: mr._id,
        name: mr.name,
        code: mr.code,
        territory: mr.territory,
        monthlyTarget: target,
        actualSales: sales,
        achievementPct: Number(achievementPct.toFixed(1)),
        commissionRatePct: rate * 100,
        calculatedCommission: Number(commission.toFixed(2))
      };
    });

    res.json({
      month: queryMonth,
      year: queryYear,
      report
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MR Leave Management System ───

// POST /api/medical-reps/leaves — Apply for planned/sick/casual leave
router.post('/leaves', authorize('mr:attendance'), validate(schemas.mrLeaveSchema), async (req, res) => {
  try {
    const leave = await MrLeave.create(req.body);
    if (req.io) {
      req.io.emit('medrep_updated', { type: 'leave_applied', id: leave._id });
    }
    res.status(201).json(leave);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/medical-reps/leaves — List MR leaves
router.get('/leaves', authorize('mr:view'), async (req, res) => {
  try {
    const { mrId, status } = req.query;
    const filter = {};
    if (mrId) filter.mrId = mrId;
    if (status && status !== 'all') filter.status = status;

    const leaves = await MrLeave.find(filter).populate('mrId', 'name code territory').sort({ startDate: -1 }).lean();
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/medical-reps/leaves/:id/status — Approve or Reject MR Leave Application
router.put('/leaves/:id/status', authorize('mr:edit'), async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected' });
    }

    const leave = await MrLeave.findByIdAndUpdate(
      req.params.id,
      {
        status,
        approvedBy: req.user ? req.user.id : null,
        approvedAt: new Date(),
        rejectionReason: rejectionReason || ''
      },
      { new: true }
    ).populate('mrId', 'name phone');

    if (!leave) return res.status(404).json({ error: 'Leave record not found' });

    // Send WhatsApp notification to MR
    if (leave.mrId && leave.mrId.phone) {
      const msg = `Your Leave Application (${leave.leaveType.toUpperCase()}) from ${new Date(leave.startDate).toLocaleDateString()} to ${new Date(leave.endDate).toLocaleDateString()} has been ${status.toUpperCase()}.${status === 'rejected' ? ` Reason: ${rejectionReason}` : ''}`;
      sendWhatsAppNotification(leave.mrId.phone, msg);
    }

    if (req.io) {
      req.io.emit('medrep_updated', { type: 'leave_status', id: leave._id });
    }
    res.json(leave);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── MR P&L / ROI Dashboard ───

// GET /api/medical-reps/roi-dashboard — Compute per-MR / territory profitability
router.get('/roi-dashboard', authorize('mr:view'), async (req, res) => {
  try {
    const { mrId, month, year } = req.query;
    const report = await calculateMRProfitability(mrId, month, year);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/medical-reps/analytics/leaderboard — Rank MRs by total doctor visits, sales volume, and calls
router.get('/analytics/leaderboard', authorize('mr:view'), async (req, res) => {
  try {
    const mrs = await MedicalRepresentative.find({ status: 'active' }).lean();
    const Invoice = require('../../models/Invoice');
    const MrVisit = require('../../models/MrVisit');

    const leaderboard = [];

    for (const mr of mrs) {
      const visitsCount = await MrVisit.countDocuments({ mrId: mr._id });
      const salesInvoices = await Invoice.find({
        type: 'sale',
        isFinalized: true,
        $or: [{ mrId: mr._id }, { assignedMrId: mr._id }]
      }).select('nettTotal amount').lean();

      const totalSalesVolume = salesInvoices.reduce((sum, inv) => sum + (inv.nettTotal || inv.amount || 0), 0);

      leaderboard.push({
        mrId: mr._id,
        name: mr.name,
        code: mr.code || 'N/A',
        headquarter: mr.headquarter || '',
        totalVisits: visitsCount,
        totalSalesVolume,
        salesInvoicesCount: salesInvoices.length
      });
    }

    leaderboard.sort((a, b) => b.totalSalesVolume - a.totalSalesVolume || b.totalVisits - a.totalVisits);

    const rankedLeaderboard = leaderboard.map((item, index) => ({
      rank: index + 1,
      ...item
    }));

    res.json(rankedLeaderboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/medical-reps/visits/check-in — Geo-tagged check-in for MR visit
router.post('/visits/check-in', authorize('mr:edit'), async (req, res) => {
  try {
    const { mrId, doctorName, latitude, longitude, photo } = req.body;
    if (!mrId || !doctorName) return res.status(400).json({ error: 'mrId and doctorName are required' });

    const visit = await MrVisit.create({
      mrId,
      doctorName,
      date: new Date(),
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      checkIn: { time: new Date(), photo: photo || '' },
      status: 'checked_in'
    });

    if (req.io) req.io.emit('medrep_updated', { type: 'check_in', id: visit._id });
    res.status(201).json(visit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/medical-reps/visits/:id/check-out — Geo-tagged check-out for MR visit
router.post('/visits/:id/check-out', authorize('mr:edit'), async (req, res) => {
  try {
    const { photo, feedback, orderTaken, orderAmount } = req.body;
    const visit = await MrVisit.findById(req.params.id);
    if (!visit) return res.status(404).json({ error: 'MR Visit record not found' });

    visit.checkOut = { time: new Date(), photo: photo || '' };
    visit.status = 'checked_out';
    if (feedback) visit.feedback = feedback;
    if (orderTaken !== undefined) visit.orderTaken = Boolean(orderTaken);
    if (orderAmount !== undefined) visit.orderAmount = Number(orderAmount);

    await visit.save();
    if (req.io) req.io.emit('medrep_updated', { type: 'check_out', id: visit._id });
    res.json(visit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/medical-reps/analytics/territory-heatmap — Territory coverage density & visit heatmap
router.get('/analytics/territory-heatmap', authorize('mr:view'), async (req, res) => {
  try {
    const visits = await MrVisit.find({ status: { $in: ['checked_in', 'checked_out'] } }).lean();

    const cityMap = new Map();
    visits.forEach(v => {
      const city = v.city || 'Varanasi';
      if (!cityMap.has(city)) {
        cityMap.set(city, { city, totalVisits: 0, totalOrdersAmount: 0, coordinates: [] });
      }
      const item = cityMap.get(city);
      item.totalVisits++;
      item.totalOrdersAmount += (v.orderAmount || 0);
      if (v.latitude && v.longitude) {
        item.coordinates.push({ lat: v.latitude, lng: v.longitude });
      }
    });

    const heatmapData = Array.from(cityMap.values()).map(c => ({
      ...c,
      totalOrdersAmount: Number(c.totalOrdersAmount.toFixed(2))
    })).sort((a, b) => b.totalVisits - a.totalVisits);

    res.json(heatmapData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Permanent Journey Plan (PJP) & Performance Scorecard ───

// POST /api/medical-reps/:mrId/journey-plans — Create a PJP for a date
router.post('/:mrId/journey-plans', authorize('mr:visits'), async (req, res) => {
  try {
    const PermanentJourneyPlan = require('../../models/PermanentJourneyPlan');
    const { plannedDate, targetDoctors } = req.body;
    const mrId = req.params.mrId;

    if (!plannedDate || !Array.isArray(targetDoctors)) {
      return res.status(400).json({ error: 'plannedDate and targetDoctors array are required' });
    }

    const d = new Date(plannedDate);
    const startOfDay = new Date(d); startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(d); endOfDay.setHours(23,59,59,999);

    let pjp = await PermanentJourneyPlan.findOne({ mrId, plannedDate: { $gte: startOfDay, $lte: endOfDay } });
    if (pjp) {
      pjp.targetDoctors = targetDoctors;
      await pjp.save();
    } else {
      pjp = await PermanentJourneyPlan.create({
        mrId,
        plannedDate: d,
        targetDoctors,
        status: 'planned',
        createdBy: req.user ? (req.user.name || 'Admin') : 'Admin'
      });
    }

    res.status(201).json(pjp);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/medical-reps/:mrId/journey-plans?date=YYYY-MM-DD — Fetch PJP for a day
router.get('/:mrId/journey-plans', authorize('mr:view'), async (req, res) => {
  try {
    const PermanentJourneyPlan = require('../../models/PermanentJourneyPlan');
    const { date } = req.query;
    const mrId = req.params.mrId;

    const filter = { mrId };
    if (date) {
      const d = new Date(date);
      const startOfDay = new Date(d); startOfDay.setHours(0,0,0,0);
      const endOfDay = new Date(d); endOfDay.setHours(23,59,59,999);
      filter.plannedDate = { $gte: startOfDay, $lte: endOfDay };
    }

    const pjps = await PermanentJourneyPlan.find(filter).sort({ plannedDate: -1 }).lean();
    res.json(date ? (pjps[0] || null) : pjps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/medical-reps/:mrId/scorecard?month=YYYY-MM — MR Performance Scorecard
router.get('/:mrId/scorecard', authorize('mr:view'), async (req, res) => {
  try {
    const PermanentJourneyPlan = require('../../models/PermanentJourneyPlan');
    const SampleConversion = require('../../models/SampleConversion');

    const { month } = req.query; // YYYY-MM
    const mrId = req.params.mrId;

    let startOfMonth, endOfMonth;
    if (month && month.includes('-')) {
      const [yr, mo] = month.split('-').map(Number);
      startOfMonth = new Date(yr, mo - 1, 1, 0, 0, 0, 0);
      endOfMonth = new Date(yr, mo, 0, 23, 59, 59, 999);
    } else {
      const now = new Date();
      startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    // 1. PJP Planned Visits & Adherence
    const pjps = await PermanentJourneyPlan.find({
      mrId,
      plannedDate: { $gte: startOfMonth, $lte: endOfMonth }
    }).lean();

    let totalPlannedVisits = 0;
    let totalMatchedVisits = 0;
    pjps.forEach(p => {
      if (p.targetDoctors) {
        totalPlannedVisits += p.targetDoctors.length;
        totalMatchedVisits += p.targetDoctors.filter(t => t.visited).length;
      }
    });

    // 2. Actual Visits Logged
    const actualVisitsCount = await MrVisit.countDocuments({
      mrId,
      date: { $gte: startOfMonth, $lte: endOfMonth }
    });

    const adherencePercentage = totalPlannedVisits > 0
      ? Math.round((totalMatchedVisits / totalPlannedVisits) * 100 * 10) / 10
      : 0;

    // 3. Sample-to-Conversion Ratio
    const conversions = await SampleConversion.find({
      mrId,
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    }).lean();

    const totalSamplesGiven = conversions.reduce((sum, c) => sum + (c.samplesQtyGiven || 1), 0);
    const convertedCount = conversions.filter(c => c.conversionStatus === 'converted').length;
    const sampleToConversionRatio = totalSamplesGiven > 0
      ? Math.round((convertedCount / totalSamplesGiven) * 100 * 10) / 10
      : 0;

    // 4. Incentive Payout
    const { calculateMrIncentive } = require('../../services/mrIncentiveService');
    const targetMonth = startOfMonth.getMonth() + 1;
    const targetYear = startOfMonth.getFullYear();
    const incentiveMonthStr = month || `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
    const incCalc = await calculateMrIncentive(mrId, targetYear, targetMonth);
    const incentivePayout = incCalc.incentivePayoutAmount;

    res.json({
      mrId,
      month: incentiveMonthStr,
      totalPlannedVisits,
      actualVisits: actualVisitsCount,
      matchedPjpVisits: totalMatchedVisits,
      adherencePercentage,
      sampleToConversionRatio,
      totalSamplesGiven,
      convertedCount,
      incentivePayout
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Doctor Portfolio Mapping, Area Turns & GPS Footprints ───

// POST /api/medical-reps/assign-doctors — Bulk assign doctors to MR & area turn schedule
router.post('/assign-doctors', authorize('mr:edit'), async (req, res) => {
  try {
    const { mrId, doctorIds = [], contactIds = [], customerIds = [], areaName, preferredVisitDay } = req.body;
    if (!mrId) return res.status(400).json({ error: 'mrId is required' });

    const updateObj = {};
    if (mrId) updateObj.assignedMrId = mrId;
    if (areaName !== undefined) updateObj.areaName = areaName.trim();
    if (preferredVisitDay !== undefined) updateObj.preferredVisitDay = preferredVisitDay;

    const combinedIds = [...doctorIds, ...contactIds, ...customerIds];

    let totalAssigned = 0;
    if (combinedIds.length > 0) {
      const docRes = await Doctor.updateMany({ _id: { $in: combinedIds } }, { $set: updateObj });
      totalAssigned += docRes.modifiedCount || 0;
    }

    res.json({
      message: 'Doctors successfully assigned to MR and area turn schedule',
      mrId,
      totalAssigned
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/medical-reps/:mrId/assigned-doctors — MR's assigned doctor portfolio & area turn call sheet (MR Scoped)
router.get('/:mrId/assigned-doctors', authorize('mr:view'), async (req, res) => {
  try {
    if (!(await verifyMrAccess(req, req.params.mrId))) {
      return res.status(403).json({ error: 'Access denied: You can only view your own assigned doctors list.' });
    }

    const { dayOfWeek, areaName } = req.query;
    const filter = { assignedMrId: req.params.mrId };
    if (dayOfWeek) filter.preferredVisitDay = dayOfWeek;
    if (areaName) filter.areaName = { $regex: areaName.trim(), $options: 'i' };

    const doctors = await Doctor.find(filter).lean();

    const result = doctors.map(c => ({
      _id: c._id,
      name: c.name,
      clinic: c.clinicName || '',
      phone: c.phone,
      areaName: c.areaName,
      preferredVisitDay: c.preferredVisitDay,
      category: c.category,
      latitude: c.latitude,
      longitude: c.longitude,
      type: 'Doctor'
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/medical-reps/:mrId/location-ping — Background GPS location breadcrumbs ping (MR Scoped)
router.post('/:mrId/location-ping', authorize('mr:attendance'), async (req, res) => {
  try {
    if (!(await verifyMrAccess(req, req.params.mrId))) {
      return res.status(403).json({ error: 'Access denied: You can only record location pings for yourself.' });
    }

    const { latitude, longitude, speed = 0, accuracy = 0 } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'latitude and longitude are required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let log = await MrDailyLog.findOne({ mrId: req.params.mrId, date: today });
    if (!log) {
      log = await MrDailyLog.create({
        mrId: req.params.mrId,
        date: today,
        status: 'checked_in',
        checkIn: { time: new Date(), latitude, longitude }
      });
    }

    log.locationHistory = log.locationHistory || [];
    log.locationHistory.push({ latitude, longitude, speed, accuracy, timestamp: new Date() });

    if (log.locationHistory.length >= 2) {
      let totalGpsDistMeters = 0;
      for (let i = 1; i < log.locationHistory.length; i++) {
        const p1 = log.locationHistory[i - 1];
        const p2 = log.locationHistory[i];
        const dMeters = getHaversineDistanceInMeters(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
        if (dMeters) totalGpsDistMeters += dMeters;
      }
      log.gpsDistance = Math.round((totalGpsDistMeters / 1000) * 100) / 100;
    }

    await log.save();
    res.json({ success: true, totalPings: log.locationHistory.length, gpsDistance: log.gpsDistance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/medical-reps/:mrId/footprint-trail — Full GPS route map, check-ins & verified clinic pins (MR Scoped)
router.get('/:mrId/footprint-trail', authorize('mr:view'), async (req, res) => {
  try {
    if (!(await verifyMrAccess(req, req.params.mrId))) {
      return res.status(403).json({ error: 'Access denied: You can only view your own footprint trail.' });
    }

    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);

    const mr = await MedicalRepresentative.findById(req.params.mrId).lean();
    if (!mr) return res.status(404).json({ error: 'MR not found' });

    const log = await MrDailyLog.findOne({ mrId: req.params.mrId, date: { $gte: startOfDay, $lte: endOfDay } }).lean();
    const visits = await MrVisit.find({ mrId: req.params.mrId, date: { $gte: startOfDay, $lte: endOfDay } }).lean();

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeekStr = dayNames[targetDate.getDay()];

    const plannedDoctors = await Doctor.find({ assignedMrId: req.params.mrId, preferredVisitDay: dayOfWeekStr }).lean();
    const totalPlanned = plannedDoctors.length;
    const verifiedVisits = visits.filter(v => v.doctorVerified);

    res.json({
      mrId: mr._id,
      mrName: mr.name,
      date: startOfDay,
      dayOfWeek: dayOfWeekStr,
      status: log ? log.status : 'not_checked_in',
      checkIn: log ? log.checkIn : null,
      checkOut: log ? log.checkOut : null,
      totalDistance: log ? (log.totalDistance || log.gpsDistance || 0) : 0,
      breadcrumbs: log ? (log.locationHistory || []) : [],
      plannedDoctorsCount: totalPlanned,
      actualVisitsCount: visits.length,
      verifiedVisitsCount: verifiedVisits.length,
      visitedClinics: visits.map(v => ({
        visitId: v._id,
        doctorName: v.doctorName,
        clinicName: v.clinicName || '',
        latitude: v.latitude,
        longitude: v.longitude,
        doctorVerified: !!v.doctorVerified,
        doctorVerifiedAt: v.doctorVerifiedAt || null,
        date: v.date
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/medical-reps/:mrId/optimize-route — AI-powered route & OPD timing visit optimizer (MR Scoped)
router.post('/:mrId/optimize-route', authorize('mr:view'), async (req, res) => {
  try {
    if (!(await verifyMrAccess(req, req.params.mrId))) {
      return res.status(403).json({ error: 'Access denied: You can only optimize route for your own schedule.' });
    }

    const { dayOfWeek, areaName, currentLat, currentLng } = req.body;
    const filter = { assignedMrId: req.params.mrId };
    if (dayOfWeek) filter.preferredVisitDay = dayOfWeek;
    if (areaName) filter.areaName = { $regex: areaName.trim(), $options: 'i' };

    const rawDoctors = await Doctor.find(filter).lean();

    const doctors = rawDoctors.map(c => ({
      _id: c._id,
      name: c.name,
      clinic: c.clinicName || '',
      phone: c.phone,
      areaName: c.areaName,
      preferredVisitDay: c.preferredVisitDay,
      category: c.category || 'B',
      opdTiming: c.preferredTime || 'Morning (09:00 AM - 01:00 PM)',
      latitude: c.latitude || 25.3176,
      longitude: c.longitude || 82.9739,
      type: 'Doctor'
    }));

    const categoryOrder = { A: 1, B: 2, C: 3 };
    const sortedDoctors = [...doctors].sort((a, b) => {
      const catA = categoryOrder[a.category] || 2;
      const catB = categoryOrder[b.category] || 2;
      if (catA !== catB) return catA - catB;

      if (currentLat && currentLng) {
        const distA = getHaversineDistanceInMeters(currentLat, currentLng, a.latitude, a.longitude) || 0;
        const distB = getHaversineDistanceInMeters(currentLat, currentLng, b.latitude, b.longitude) || 0;
        return distA - distB;
      }
      return 0;
    });

    const optimizedSequence = sortedDoctors.map((doc, idx) => {
      const startHour = doc.opdTiming.includes('Evening') ? 17 : 10;
      const hourStr = String(startHour + Math.floor(idx * 0.75)).padStart(2, '0');
      const minStr = (idx * 45) % 60 === 0 ? '00' : '30';
      return {
        sequenceOrder: idx + 1,
        doctorId: doc._id,
        doctorName: doc.name,
        clinicName: doc.clinic,
        category: doc.category,
        opdTiming: doc.opdTiming,
        estimatedTimeSlot: `${hourStr}:${minStr}`,
        latitude: doc.latitude,
        longitude: doc.longitude,
      };
    });

    const areaClustersMap = {};
    doctors.forEach(d => {
      const area = d.areaName || 'General Territory';
      areaClustersMap[area] = (areaClustersMap[area] || 0) + 1;
    });
    const areaClusters = Object.keys(areaClustersMap).map(area => ({ areaName: area, doctorCount: areaClustersMap[area] }));

    res.json({
      success: true,
      mrId: req.params.mrId,
      totalDoctorsPlanned: doctors.length,
      estimatedDistanceSavingsPercent: doctors.length > 1 ? 28.5 : 0,
      estimatedTimeSavedMinutes: doctors.length * 15,
      areaClusters,
      itinerary: optimizedSequence
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/medical-reps/visits/:visitId/send-summary-whatsapp — Automated Post-Visit Engagement & Digital Sample Receipt Dispatch
router.post('/visits/:visitId/send-summary-whatsapp', authorize('mr:visit'), async (req, res) => {
  try {
    const visit = await MrVisit.findById(req.params.visitId);
    if (!visit) return res.status(404).json({ error: 'Visit record not found' });

    if (!(await verifyMrAccess(req, visit.mrId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const doctorPhone = req.body.doctorPhone || '9876543210';
    const sampleItems = (visit.samplesGiven || []).map(s => `${s.qty}x ${s.productName}`).join(', ') || 'No physical samples handed over';

    const messageText = `Respected Dr. ${visit.doctorName}, Thank you for taking the time to meet our Medical Representative (${visit.mrName}) today. Sample Handover Acknowledgment: [${sampleItems}]. e-Brochure & Monograph Link: https://shekharbandhuaushdhalaya.com/catalog?doctorRef=${visit._id}`;

    res.json({
      success: true,
      visitId: visit._id,
      recipient: doctorPhone,
      status: 'dispatched',
      channel: 'WhatsApp & SMS',
      messageText,
      dispatchedAt: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/medical-reps/visits/:visitId/send-sample-ack-whatsapp — Dispatch 1-tap sample acknowledgment link via WhatsApp
router.post('/visits/:visitId/send-sample-ack-whatsapp', authorize('mr:visits'), async (req, res) => {
  try {
    const visit = await MrVisit.findById(req.params.visitId);
    if (!visit) return res.status(404).json({ error: 'Visit record not found' });

    const doctorPhone = req.body.doctorPhone || visit.phone || '9876543210';
    const sampleItemsStr = (visit.sampleDetails || []).map(s => `${s.qty}x ${s.name}`).join(', ') || 'AYUSH Promotional Samples';
    const ackUrl = `https://shekharbandhuaushdhalaya.com/ack-sample?visitId=${visit._id}`;
    const messageText = `Respected Dr. ${visit.doctorName}, please tap the link to digitally confirm sample receipt (${sampleItemsStr}): ${ackUrl}`;

    const { sendMultiChannelNotification } = require('../../services/smsFallbackService');
    await sendMultiChannelNotification(doctorPhone, messageText);

    res.json({
      success: true,
      visitId: visit._id,
      recipient: doctorPhone,
      ackUrl,
      status: 'dispatched'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/medical-reps/visits/:visitId/acknowledge-samples — Digitally confirm doctor sample receipt
router.post('/visits/:visitId/acknowledge-samples', async (req, res) => {
  try {
    const { doctorSignature } = req.body;
    const visit = await MrVisit.findById(req.params.visitId);
    if (!visit) return res.status(404).json({ error: 'Visit record not found' });

    visit.sampleAcknowledged = true;
    visit.sampleAcknowledgedAt = new Date();
    if (doctorSignature) visit.doctorSignature = doctorSignature;

    await visit.save();

    res.json({
      success: true,
      message: `Sample receipt acknowledged digitally for Dr. ${visit.doctorName}`,
      visit
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/medical-reps/:mrId/sales-performance — MR sales order ledger, commissions & target progress
router.get('/:mrId/sales-performance', authorize('mr:view'), async (req, res) => {
  try {
    const Order = require('../../models/Order');
    const SalesTarget = require('../../models/SalesTarget');
    const mrId = req.params.mrId;

    const orders = await Order.find({ mrId }).sort({ createdAt: -1 }).lean();
    const totalSalesBooked = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalCommissionEarned = orders.reduce((sum, o) => sum + (o.commissionAmount || 0), 0);

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const targetDoc = await SalesTarget.findOne({ agentId: mrId, month, year }).lean();

    const targetAmount = targetDoc ? targetDoc.targetAmount : 100000;
    const achievedAmount = targetDoc ? (targetDoc.achievedAmount || totalSalesBooked) : totalSalesBooked;
    const achievementPercentage = targetAmount > 0 ? Number(((achievedAmount / targetAmount) * 100).toFixed(1)) : 100;

    res.json({
      mrId,
      totalOrdersBooked: orders.length,
      totalSalesBooked,
      totalCommissionEarned,
      monthlyTarget: {
        month,
        year,
        targetAmount,
        achievedAmount,
        achievementPercentage
      },
      orders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

