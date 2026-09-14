const express = require('express');
const BankStatement = require('../../models/BankStatement');
const Payment = require('../../models/Payment');
const { authorize } = require('../../middleware/authorize');

const router = express.Router();

// GET /api/bank-reconciliations — Run automated bank statement line matching
router.get('/', authorize('payment:view'), async (req, res) => {
  try {
    const bankStatements = await BankStatement.find({ status: { $ne: 'reconciled' } }).lean();
    const ledgerPayments = await Payment.find({ status: { $ne: 'void' } }).lean();

    const matches = [];
    const unreconciledBankLines = [];

    for (const stmt of bankStatements) {
      // Find matching payment ledger entry by amount & date window (within 3 days) or reference/UTRN match
      const stmtDate = new Date(stmt.transactionDate || stmt.createdAt || Date.now());

      const match = ledgerPayments.find(p => {
        const pDate = new Date(p.paymentDate || p.createdAt || Date.now());
        const daysDiff = Math.abs((stmtDate - pDate) / (1000 * 60 * 60 * 24));
        const amountMatch = Math.abs((p.amount || 0) - (stmt.amount || 0)) < 1;
        const refMatch = stmt.referenceNo && p.referenceNo && stmt.referenceNo.toLowerCase() === p.referenceNo.toLowerCase();

        return (amountMatch && daysDiff <= 3) || refMatch;
      });

      if (match) {
        matches.push({
          bankStatementId: stmt._id,
          bankDate: stmt.transactionDate,
          bankDescription: stmt.description || stmt.narrative || '',
          bankAmount: stmt.amount,
          paymentId: match._id,
          receiptNo: match.receiptNo,
          paymentDate: match.paymentDate,
          partyName: match.partyName || match.customerName || '',
          status: 'matched'
        });
      } else {
        unreconciledBankLines.push({
          bankStatementId: stmt._id,
          bankDate: stmt.transactionDate,
          bankDescription: stmt.description || stmt.narrative || '',
          bankAmount: stmt.amount,
          status: 'unmatched'
        });
      }
    }

    res.json({
      totalBankLinesAnalyzed: bankStatements.length,
      matchedCount: matches.length,
      unreconciledCount: unreconciledBankLines.length,
      matches,
      unreconciledBankLines
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
