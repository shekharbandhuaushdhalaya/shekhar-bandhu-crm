const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Customer = require('../../models/Customer');
const config = require('../../src/config');

const router = express.Router();

// POST /api/portal/auth/login — Customer B2B self-service portal login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const customer = await Customer.findOne({ email: cleanEmail });

    if (!customer || !customer.portalEnabled || !customer.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, customer.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const payload = {
      customerId: customer._id.toString(),
      email: customer.email,
      scope: 'customer-portal'
    };

    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });

    res.json({
      token,
      customer: {
        id: customer._id,
        name: customer.name,
        company: customer.company,
        email: customer.email
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
