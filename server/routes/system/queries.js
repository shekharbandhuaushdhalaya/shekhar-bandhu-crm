const express = require('express');
const ProductQuery = require('../../models/ProductQuery');
const Contact = require('../../models/Contact');
const multer = require('multer');
const path = require('path');
const { validate } = require('../../middleware/validate');
const schemas = require('../../validation/schemas');

// Multer storage config for query reference photos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../public/uploads/'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'query-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

const router = express.Router();

// Middleware to verify JWT token (helper inside route or passed from server)
// We import authenticateJWT or define a standard verify check.
// In server.js, authenticateJWT is passed as a middleware.
// Let's create a local middleware wrapper or inspect if we should export it.
// To keep things simple and decoupled, we can extract the user role check since
// authenticateJWT will be applied in server.js when mounting.

// GET /api/queries — List all queries (Authenticated)
router.get('/', async (req, res) => {
  try {
    const queries = await ProductQuery.find({}).sort({ createdAt: -1 }).lean();
    res.json(queries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/queries/:id/status — Update query status (Authenticated)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'contacted', 'converted', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    const updated = await ProductQuery.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Query not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/queries/:id/convert — Convert query to CRM Lead Contact (Authenticated)
router.post('/:id/convert', validate(schemas.queryConvertSchema), async (req, res) => {
  try {
    const queryDoc = await ProductQuery.findById(req.params.id);
    if (!queryDoc) return res.status(404).json({ error: 'Query not found' });

    // Retrieve product to estimate a B2B deal value for the pipeline
    let dealValue = 5000; // default backup bulk value
    const Product = require('../../models/Product');
    let dbProd = null;
    if (queryDoc.productId) {
      dbProd = await Product.findById(queryDoc.productId);
    } else {
      dbProd = await Product.findOne({ name: new RegExp(queryDoc.productName, 'i') });
    }
    if (dbProd && dbProd.price) {
      dealValue = dbProd.price * 50; // estimate based on a standard bulk order of 50 boxes/units
    }

    // Create a new Contact record in CRM pipeline stage "lead"
    const lead = await Contact.create({
      name: queryDoc.name,
      company: 'Web Inquirer',
      email: queryDoc.email,
      phone: queryDoc.phone,
      stage: 'lead',
      dealSource: 'Website', 
      leadSource: 'Website',
      dealValue,
      productInterest: [queryDoc.productName],
      interactions: [
        {
          type: 'email',
          note: `Public query submitted: "${queryDoc.query}".` + 
                (queryDoc.image ? ` View attached photo: ${queryDoc.image}` : ''),
          date: queryDoc.createdAt
        }
      ]
    });

    // Update query status to converted
    queryDoc.status = 'converted';
    await queryDoc.save();

    res.json({ message: 'Query converted to lead successfully', lead, query: queryDoc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/public/queries — Public submission of product queries (Unauthenticated)
// Route matches `/api/public/queries`
router.post('/submit', upload.single('image'), validate(schemas.querySubmitSchema), async (req, res) => {
  try {
    const { name, email, phone, productName, query, productId } = req.body;
    if (!name || !email || !phone || !productName || !query) {
      return res.status(400).json({ error: 'Missing required inquiry fields' });
    }

    const imagePath = req.file ? '/uploads/' + req.file.filename : '';

    const newQuery = await ProductQuery.create({
      name,
      email,
      phone,
      productName,
      productId: productId || null,
      query,
      image: imagePath
    });

    res.status(201).json({ message: 'Query submitted successfully', query: newQuery });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
