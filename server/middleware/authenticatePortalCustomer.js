const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');
const config = require('../src/config');

async function authenticatePortalCustomer(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header missing or invalid format' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);

    if (!decoded || decoded.scope !== 'customer-portal' || !decoded.customerId) {
      return res.status(401).json({ error: 'Invalid customer portal token scope' });
    }

    const customer = await Customer.findById(decoded.customerId);
    if (!customer || customer.portalEnabled === false) {
      return res.status(401).json({ error: 'Customer portal access disabled or account not found' });
    }

    req.customer = customer;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
}

module.exports = {
  authenticatePortalCustomer
};
