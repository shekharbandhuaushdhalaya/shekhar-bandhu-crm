const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ProductQuery = require('../../models/ProductQuery');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

const router = express.Router();

const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many inquiries submitted. Please try again later.' },
});
const uploadDir = path.join(__dirname, '../../public/uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] || '.bin';
    cb(null, `query-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, Boolean(EXT_BY_MIME[file.mimetype])),
});

const cleanupUploadOnError = (req, res, next) => {
  if (req.file?.path) {
    res.once('finish', () => {
      if (res.statusCode >= 400) fs.unlink(req.file.path, () => {});
    });
  }
  next();
};

router.post('/submit', inquiryLimiter, upload.single('image'), cleanupUploadOnError, validate(schemas.querySubmitSchema), async (req, res) => {
  try {
    const { name, email, phone, productName, query, productId } = req.body;
    if (!name || !email || !phone || !productName || !query) {
      if (req.file?.path) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Missing required inquiry fields' });
    }
    const doc = await ProductQuery.create({
      name,
      email,
      phone,
      productName,
      productId: productId || null,
      query,
      image: req.file ? `/uploads/${req.file.filename}` : '',
    });
    if (req.io) req.io.emit('query_updated', { type: 'created', id: doc._id });
    return res.status(201).json({ message: 'Query submitted successfully', query: doc });
  } catch (err) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: 'Unable to submit public inquiry' });
  }
});

module.exports = router;
