const express = require('express');
const BankStatement = require('../../models/BankStatement');
const Payment = require('../../models/Payment');
const { authorize } = require('../../middleware/authorize');
const { suggestBankStatementMatches } = require('../../services/bankReconciliationService');

const router = express.Router();

// GET /api/bank-reconciliations — produce review suggestions only; never auto-post.
router.get('/', authorize('payment:view'), async (req, res) => {
  try {
    const [bankStatements, ledgerPayments] = await Promise.all([
      BankStatement.find({ status: { $in: ['unmatched', 'flagged'] } }).lean(),
      Payment.find({ status: 'active' }).lean()
    ]);
    const result = suggestBankStatementMatches({ bankStatements, ledgerPayments });
    res.json({
      reconciliationMode: 'suggestion_only_no_ledger_posting',
      totalBankLinesAnalyzed: bankStatements.length,
      matchedCount: result.matches.length,
      unreconciledCount: result.unreconciledBankLines.length,
      matches: result.matches,
      unreconciledBankLines: result.unreconciledBankLines
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
