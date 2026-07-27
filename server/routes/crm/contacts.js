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
    const { search, stage } = req.query;
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

    const contacts = await Contact.find(filter).sort({ createdAt: -1 }).lean();
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

module.exports = router;
