const express = require('express');
const MedicalRepresentative = require('../../models/MedicalRepresentative');
const MrDailyLog = require('../../models/MrDailyLog');
const MrVisit = require('../../models/MrVisit');
const MrExpense = require('../../models/MrExpense');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

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
    res.status(201).json(mr);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id', authorize('mr:view'), async (req, res) => {
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
      // Re-open if previously checked out
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
    await log.save();
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
    const visit = await MrVisit.create(data);

    // If free samples were given, automatically generate a Doctor Sample Delivery Challan and update inventory!
    if (data.sampleDetails && data.sampleDetails.length > 0) {
      const MedicalRepresentative = require('../../models/MedicalRepresentative');
      const StockMovement = require('../../models/StockMovement');
      const Product = require('../../models/Product');

      const mr = await MedicalRepresentative.findById(req.params.mrId);
      const count = await StockMovement.countDocuments({ type: 'sample' });
      const docNo = `DC-SMP-${(count + 1).toString().padStart(4, '0')}`;

      const items = [];
      for (const s of data.sampleDetails) {
        let prodName = s.name;
        let pId = s.productId;
        if (pId) {
          const p = await Product.findById(pId);
          if (p) {
            prodName = p.name;
            // Deduct stock level in inventory
            const qtyBoxes = Number(s.qty) || 1;
            p.stockLevel = Math.max(0, (p.stockLevel || 0) - qtyBoxes);
            await p.save();
          }
        }
        items.push({
          productId: pId || null,
          productName: prodName || 'Doctor Sample',
          qty: Number(s.qty) || 1,
          packing: 1,
          rate: 0,
          mrp: 0
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
    res.json(visit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/visits/:visitId', authorize('mr:delete'), async (req, res) => {
  try {
    const visit = await MrVisit.findByIdAndDelete(req.params.visitId);
    if (!visit) return res.status(404).json({ error: 'Visit not found' });
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
    res.json(expense);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/expenses/:expenseId', authorize('mr:delete'), async (req, res) => {
  try {
    const expense = await MrExpense.findByIdAndDelete(req.params.expenseId);
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    res.json({ message: 'Expense deleted' });
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

// All-expenses dashboard (all MRs, for managers)
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

// All visits (for manager overview)
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

module.exports = router;
