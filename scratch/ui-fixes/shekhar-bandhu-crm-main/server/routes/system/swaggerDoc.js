const express = require('express');
const router = express.Router();

// GET /api/docs/openapi.json — OpenAPI 3.0 specification for Shekhar Bandhu CRM API
router.get('/openapi.json', (req, res) => {
  const openApiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'Shekhar Bandhu Aushadhalaya CRM & Manufacturing API',
      version: '1.0.0',
      description: 'Production B2B CRM, AYUSH Schedule T GMP Manufacturing, Inventory & Finance REST API'
    },
    paths: {
      '/api/auth/login': {
        post: { summary: 'Authenticate user & receive JWT token' }
      },
      '/api/invoices/sales': {
        get: { summary: 'List sales invoices' },
        post: { summary: 'Create new sale invoice' }
      },
      '/api/batch-productions': {
        get: { summary: 'List BMR batch production runs' },
        post: { summary: 'Issue new batch production run' }
      },
      '/api/inventories': {
        get: { summary: 'Get multi-warehouse inventory stock levels' }
      },
      '/api/debit-notes': {
        get: { summary: 'List debit notes' }
      },
      '/api/leads': {
        get: { summary: 'List sales pipeline opportunities' }
      }
    }
  };

  res.json(openApiSpec);
});

module.exports = router;
