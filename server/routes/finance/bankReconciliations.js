const express = require('express');
const BankStatement = require('../../models/BankStatement');
const Payment = require('../../models/Payment');
const { authorize } = require('../../middleware/authorize');
const { withTransaction } = require('../../utils/withTransaction');
const { suggestBankStatementMatches, evaluateBankPaymentMatch } = require('../../services/bankReconciliationService');

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

router.patch('/:id/match', authorize('payment:create'), async (req, res) => {
  try {
    const paymentId = String(req.body.paymentId || '').trim();
    const reviewNotes = String(req.body.reviewNotes || '').trim();
    const actorId = req.user?.id || req.user?._id;
    const actorName = req.user?.name || req.user?.email;
    if (!paymentId || reviewNotes.length < 10 || !actorId || !actorName) {
      return res.status(400).json({ error: 'Payment, at least 10 characters of review notes and authenticated reviewer identity are required', code: 'BANK_MATCH_REVIEW_EVIDENCE_REQUIRED' });
    }

    const matched = await withTransaction(async session => {
      const statement = await BankStatement.findOne({
        _id: req.params.id, status: { $in: ['unmatched', 'flagged'] }
      }).session(session);
      if (!statement) throw Object.assign(new Error('Unmatched bank statement line not found'), { statusCode: 404 });

      const payment = await Payment.findOne({ _id: paymentId, status: 'active' }).session(session);
      if (!payment) throw Object.assign(new Error('Active ledger payment not found'), { statusCode: 404 });

      const matchBasis = evaluateBankPaymentMatch(statement, payment);
      if (!matchBasis) throw Object.assign(
        new Error('Bank line and payment do not agree on direction, amount, reference or permitted date window'),
        { statusCode: 409, code: 'BANK_MATCH_EVIDENCE_MISMATCH' }
      );

      const priorMatch = await BankStatement.findOne({
        matchedPaymentId: payment._id, status: 'matched'
      }).session(session).lean();
      if (priorMatch) throw Object.assign(
        new Error('This payment is already reconciled to another bank statement line'),
        { statusCode: 409, code: 'PAYMENT_ALREADY_RECONCILED' }
      );

      const updated = await BankStatement.findOneAndUpdate(
        { _id: statement._id, status: { $in: ['unmatched', 'flagged'] }, matchedPaymentId: null },
        { $set: {
          status: 'matched', matchedPaymentId: payment._id,
          matchedByUserId: actorId, matchedByName: actorName,
          matchedAt: new Date(), matchBasis, matchNotes: reviewNotes
        } },
        { new: true, runValidators: true, session }
      );
      if (!updated) throw Object.assign(
        new Error('Bank statement line changed while reconciliation was being confirmed'),
        { statusCode: 409, code: 'BANK_MATCH_CONCURRENT_UPDATE' }
      );
      return updated;
    });
    return res.json(matched);
  } catch (err) {
    // The firm-scoped unique index is the final guard against two concurrent
    // confirmations assigning one payment to different bank statement lines.
    if (err.code === 11000) {
      return res.status(409).json({
        error: 'This payment was reconciled to another bank statement line concurrently',
        code: 'PAYMENT_ALREADY_RECONCILED'
      });
    }
    const status = err.statusCode || 400;
    return res.status(status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
  }
});

module.exports = router;
