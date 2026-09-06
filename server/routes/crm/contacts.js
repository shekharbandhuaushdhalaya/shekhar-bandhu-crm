const express = require('express');
const Contact = require('../../models/Contact');
const Activity = require('../../models/Activity');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

// GET /api/contacts — list contacts with optional search and stage filter
router.get('/', async (req, res) => {
  try {
    const { search, stage, page, limit } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (stage && stage !== 'all') {
      filter.stage = stage;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit) || 50;
    const isPaginated = !isNaN(pageNum) && pageNum > 0;

    let query = Contact.find(filter)
      .select('name company email phone stage dealValue interactions createdAt updatedAt')
      .sort({ createdAt: -1 });

    if (isPaginated) {
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const contacts = await query.lean();

    if (isPaginated) {
      const total = await Contact.countDocuments(filter);
      return res.json({
        data: contacts,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      });
    }

    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts/:id — get single contact
router.get('/:id', async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id).lean();
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (req.io) {
      req.io.emit('contact_updated', { type: 'updated', id: contact._id });
    }
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts — create contact
router.post('/', validate(schemas.contactSchema), async (req, res) => {
  try {
    const data = {
      ...req.body,
      interactions: [{ type: 'System', note: 'Contact created', date: new Date() }],
    };
    const contact = await Contact.create(data);

    await Activity.create({
      type: 'system',
      text: `${contact.name} added as a new ${contact.stage}`,
      contactId: contact._id,
    });

    if (req.io) {
      req.io.emit('contact_updated', { type: 'created', id: contact._id });
    }
    res.status(201).json(contact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/contacts/:id — update contact (stage changes, full edits)
router.put('/:id', validate(schemas.contactSchema.partial()), async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const oldStage = contact.stage;

    Object.assign(contact, req.body);

    if (req.body.stage && req.body.stage !== oldStage) {
      contact.interactions.unshift({
        type: 'System',
        note: `Stage changed from '${oldStage}' to '${req.body.stage}'`,
        date: new Date(),
      });
      await Activity.create({
        type: 'system',
        text: `${contact.name} moved to '${req.body.stage}'`,
        contactId: contact._id,
      });
    }

    await contact.save();
    res.json(contact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/contacts/:id/interactions — log interaction
router.post('/:id/interactions', validate(schemas.interactionSchema), async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const { type, note } = req.body;
    contact.interactions.unshift({ type, note, date: new Date() });
    await contact.save();

    await Activity.create({
      type: type.toLowerCase(),
      text: `${type} logged with ${contact.name}`,
      contactId: contact._id,
    });

    res.json(contact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/contacts/:id — remove contact
router.delete('/:id', authorize('contact:delete'), async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    if (req.io) {
      req.io.emit('contact_updated', { type: 'deleted', id: req.params.id });
    }
    res.json({ message: 'Contact deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts/duplicates/scan — Detect potential duplicate contact pairs
router.get('/duplicates/scan', authorize('contact:view'), async (req, res) => {
  try {
    const contacts = await Contact.find({}).lean();
    const duplicates = [];
    const seenMap = new Map();

    for (const c of contacts) {
      const nameKey = (c.name || '').trim().toLowerCase().replace(/\s+/g, '');
      const phoneKey = (c.phone || '').trim().replace(/[^0-9]/g, '');
      const emailKey = (c.email || '').trim().toLowerCase();

      let matchedMaster = null;
      if (phoneKey && phoneKey.length >= 10 && seenMap.has(`phone:${phoneKey}`)) {
        matchedMaster = seenMap.get(`phone:${phoneKey}`);
      } else if (emailKey && seenMap.has(`email:${emailKey}`)) {
        matchedMaster = seenMap.get(`email:${emailKey}`);
      } else if (nameKey && seenMap.has(`name:${nameKey}`)) {
        matchedMaster = seenMap.get(`name:${nameKey}`);
      }

      if (matchedMaster && matchedMaster._id.toString() !== c._id.toString()) {
        duplicates.push({
          masterContact: matchedMaster,
          duplicateContact: c,
          reason: matchedMaster.phone === c.phone ? 'Matching Phone' : (matchedMaster.email === c.email ? 'Matching Email' : 'Matching Name')
        });
      } else {
        if (nameKey) seenMap.set(`name:${nameKey}`, c);
        if (phoneKey && phoneKey.length >= 10) seenMap.set(`phone:${phoneKey}`, c);
        if (emailKey) seenMap.set(`email:${emailKey}`, c);
      }
    }

    res.json({ totalDuplicatePairs: duplicates.length, duplicates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/contacts/merge — Merge duplicate contact into target master contact
router.post('/merge', authorize('contact:edit'), async (req, res) => {
  try {
    const { masterId, duplicateId } = req.body;
    if (!masterId || !duplicateId) {
      return res.status(400).json({ error: 'masterId and duplicateId are required' });
    }

    if (masterId === duplicateId) {
      return res.status(400).json({ error: 'Cannot merge a contact into itself' });
    }

    const master = await Contact.findById(masterId);
    const duplicate = await Contact.findById(duplicateId);

    if (!master || !duplicate) {
      return res.status(404).json({ error: 'Master or duplicate contact not found' });
    }

    // Merge interactions & notes
    const combinedInteractions = [
      ...(master.interactions || []),
      ...(duplicate.interactions || []),
      { type: 'System', note: `Merged contact '${duplicate.name}' (${duplicate._id}) into master`, date: new Date() }
    ];
    master.interactions = combinedInteractions;

    if (!master.email && duplicate.email) master.email = duplicate.email;
    if (!master.phone && duplicate.phone) master.phone = duplicate.phone;
    if (!master.company && duplicate.company) master.company = duplicate.company;

    await master.save();

    // Re-link Activities & Tasks to master contact
    const Task = require('../../models/Task');
    await Activity.updateMany({ contactId: duplicate._id }, { contactId: master._id });
    await Task.updateMany({ contactId: duplicate._id }, { contactId: master._id });

    // Remove duplicate contact document
    await Contact.findByIdAndDelete(duplicate._id);

    res.json({
      message: `Contact '${duplicate.name}' successfully merged into '${master.name}'`,
      masterContact: master
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
