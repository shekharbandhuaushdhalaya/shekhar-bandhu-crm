const express = require('express');
const { authorize } = require('../../middleware/authorize');
const { generateDailyDigestData } = require('../../services/digestService');

const router = express.Router();

// GET /api/analytics/digests/daily-sales — Generate formatted text for daily sales & inventory digest
router.get('/daily-sales', authorize('report:view'), async (req, res) => {
  try {
    const digest = await generateDailyDigestData();
    res.json(digest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
