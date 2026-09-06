const express = require('express');
const Doctor = require('../../models/Doctor');
const MrVisit = require('../../models/MrVisit');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/doctors/events — Birthday & Anniversary Reminders
router.get('/events', authorize('mr:view'), async (req, res) => {
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

// GET /api/doctors/matrix — Doctor Classification & Visit Compliance Matrix
router.get('/matrix', authorize('mr:view'), async (req, res) => {
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

    const visitCountsById = {};
    const visitCountsByName = {};

    visitsThisMonth.forEach(v => {
      if (v.doctorId) {
        const idKey = v.doctorId.toString();
        visitCountsById[idKey] = (visitCountsById[idKey] || 0) + 1;
      }
      if (v.doctorName) {
        const nameKey = v.doctorName.trim().toLowerCase();
        visitCountsByName[nameKey] = (visitCountsByName[nameKey] || 0) + 1;
      }
    });

    const report = doctors.map(doc => {
      const requiredVisits = doc.category === 'A' ? 4 : (doc.category === 'B' ? 2 : 1);
      const idKey = doc._id.toString();
      const nameKey = doc.name.trim().toLowerCase();
      const actualVisits = visitCountsById[idKey] || visitCountsByName[nameKey] || 0;
      const compliancePct = Math.min(100, Number(((actualVisits / requiredVisits) * 100).toFixed(1)));

      return {
        _id: doc._id,
        name: doc.name,
        clinic: doc.clinicName || '',
        clinicName: doc.clinicName || '',
        category: doc.category,
        specialty: doc.specialization,
        specialization: doc.specialization,
        preferredTime: doc.preferredTime,
        assignedMr: doc.assignedMrId,
        assignedMrId: doc.assignedMrId,
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

// GET /api/doctors — List doctors with search, category/assignedMrId filter, and optional pagination
router.get('/', authorize('mr:view'), async (req, res) => {
  try {
    const { search, category, assignedMrId, page, limit } = req.query;
    const filter = {};

    if (category) {
      filter.category = category;
    }
    if (assignedMrId) {
      filter.assignedMrId = assignedMrId;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { clinicName: { $regex: search, $options: 'i' } },
        { specialization: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { areaName: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10) || 50;
    const isPaginated = !isNaN(pageNum) && pageNum > 0;

    let query = Doctor.find(filter)
      .populate('assignedMrId', 'name code phone')
      .sort({ name: 1 });

    if (isPaginated) {
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const doctors = await query.lean();

    if (isPaginated) {
      const total = await Doctor.countDocuments(filter);
      return res.json({
        data: doctors,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      });
    }

    res.json(doctors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/doctors/:id — Get doctor detail
router.get('/:id', authorize('mr:view'), async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id)
      .populate('assignedMrId', 'name code phone email')
      .populate('linkedContactId')
      .populate('linkedCustomerId')
      .lean();

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    res.json(doctor);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/doctors/:id/rx-analytics — Prescription Revenue Analytics for a Doctor
router.get('/:id/rx-analytics', authorize('mr:view'), async (req, res) => {
  try {
    const Invoice = require('../../models/Invoice');
    const doctor = await Doctor.findById(req.params.id).lean();
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const invoices = await Invoice.find({
      $or: [
        { prescribingDoctorId: doctor._id },
        { doctorName: { $regex: new RegExp(`^${doctor.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } }
      ]
    }).lean();

    const totalRxRevenue = invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const invoiceCount = invoices.length;

    res.json({
      doctorId: doctor._id,
      doctorName: doctor.name,
      totalRxRevenue,
      invoiceCount,
      invoices: invoices.map(i => ({
        _id: i._id,
        invoiceNo: i.invoiceNo,
        customerName: i.customerName,
        amount: i.amount,
        date: i.date,
        status: i.status
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/doctors/:id/sample-roi — Doctor Sample ROI Report (Sample Cost vs Rx Revenue)
router.get('/:id/sample-roi', authorize('mr:view'), async (req, res) => {
  try {
    const Invoice = require('../../models/Invoice');
    const MrSampleIssuance = require('../../models/MrSampleIssuance');

    const doctor = await Doctor.findById(req.params.id).lean();
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const [invoices, issuances] = await Promise.all([
      Invoice.find({
        $or: [
          { prescribingDoctorId: doctor._id },
          { doctorName: { $regex: new RegExp(`^${doctor.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i') } }
        ]
      }).lean(),
      MrSampleIssuance.find({ doctorId: doctor._id }).lean()
    ]);

    const totalRxRevenue = invoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const invoiceCount = invoices.length;

    const totalSampleCost = issuances.reduce((sum, iss) => sum + ((iss.qty || 0) * (iss.unitCost || 0)), 0);
    const roiRatio = totalSampleCost > 0 ? Number((totalRxRevenue / totalSampleCost).toFixed(2)) : 0;

    res.json({
      doctorId: doctor._id,
      doctorName: doctor.name,
      totalSampleCost: Number(totalSampleCost.toFixed(2)),
      totalRxRevenue: Number(totalRxRevenue.toFixed(2)),
      roiRatio,
      invoiceCount,
      sampleIssuanceCount: issuances.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/doctors — Create doctor
router.post('/', authorize('mr:create'), async (req, res) => {
  try {
    const doctor = await Doctor.create(req.body);
    res.status(201).json(doctor);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/doctors/:id — Update doctor
router.put('/:id', authorize('mr:edit'), async (req, res) => {
  try {
    const doctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    res.json(doctor);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/doctors/:id — Delete doctor
router.delete('/:id', authorize('mr:delete'), async (req, res) => {
  try {
    const doctor = await Doctor.findByIdAndDelete(req.params.id);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }
    res.json({ message: 'Doctor deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
