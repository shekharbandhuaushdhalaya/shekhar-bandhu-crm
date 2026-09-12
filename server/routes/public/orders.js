const express = require('express');

const router = express.Router();

// Anonymous website Sales Orders are intentionally retired. A commercial order must
// belong to an authenticated CRM Customer so pricing, credit, approvals, returns and
// the eventual Sale Challan all have one authoritative owner.
router.post('/create', (_req, res) => res.status(410).json({
  error: 'Anonymous order placement is retired. Sign in to the customer self-service portal to place an order.',
  code: 'CUSTOMER_PORTAL_REQUIRED'
}));

// Sequential/public order identifiers are not authentication. Order status and item
// details are available only through the authenticated customer portal.
router.get('/track/:query', (_req, res) => res.status(410).json({
  error: 'Public order tracking is retired. Sign in to the customer portal to track your orders.',
  code: 'CUSTOMER_PORTAL_REQUIRED'
}));

module.exports = router;
