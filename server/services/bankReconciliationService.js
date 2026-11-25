const DAY_MS = 24 * 60 * 60 * 1000;
const money = value => Number(Number(value || 0).toFixed(2));

function statementDirection(statement) {
  const debit = money(statement.debit);
  const credit = money(statement.credit);
  if (debit > 0 && credit > 0) return null;
  if (debit > 0) return { type: 'make', amount: debit };
  if (credit > 0) return { type: 'receive', amount: credit };
  return null;
}

function paymentDate(payment) {
  const date = new Date(payment.date || payment.createdAt);
  return Number.isFinite(date.getTime()) ? date : null;
}

function referenceMatches(statement, payment) {
  const bankReference = String(statement.reference || '').trim().toLowerCase();
  const paymentReference = String(payment.referenceNo || '').trim().toLowerCase();
  return Boolean(bankReference && paymentReference && bankReference === paymentReference);
}

function evaluateBankPaymentMatch(statement, payment, windowDays = 3) {
  const direction = statementDirection(statement);
  if (!direction || payment.status !== 'active' || payment.type !== direction.type ||
      Math.abs(money(payment.amount) - direction.amount) > 0.01) return null;
  if (referenceMatches(statement, payment)) return 'reference_amount_direction';
  const bankDate = new Date(statement.transactionDate);
  const date = paymentDate(payment);
  const withinWindow = Number.isFinite(bankDate.getTime()) && date &&
    Math.abs(bankDate.getTime() - date.getTime()) <= windowDays * DAY_MS;
  return withinWindow ? 'amount_direction_date' : null;
}

function suggestBankStatementMatches({ bankStatements = [], ledgerPayments = [], windowDays = 3 }) {
  const usedPaymentIds = new Set();
  const matches = [];
  const unreconciledBankLines = [];

  for (const statement of bankStatements) {
    const direction = statementDirection(statement);
    if (!direction) {
      unreconciledBankLines.push({
        bankStatementId: statement._id,
        bankDate: statement.transactionDate,
        bankDescription: statement.description || '',
        bankAmount: money(statement.debit) || money(statement.credit),
        status: 'unmatched',
        reason: 'invalid_or_missing_bank_debit_credit_direction'
      });
      continue;
    }

    const candidates = ledgerPayments.filter(payment => evaluateBankPaymentMatch(statement, payment, windowDays));
    const available = candidates.filter(payment => !usedPaymentIds.has(String(payment._id)));
    const referenceCandidates = available.filter(payment => referenceMatches(statement, payment));
    const finalists = referenceCandidates.length ? referenceCandidates : available;

    if (finalists.length === 1) {
      const payment = finalists[0];
      usedPaymentIds.add(String(payment._id));
      matches.push({
        bankStatementId: statement._id,
        bankDate: statement.transactionDate,
        bankDescription: statement.description || '',
        bankAmount: direction.amount,
        paymentId: payment._id,
        paymentReference: payment.referenceNo || '',
        paymentDate: payment.date || payment.createdAt || null,
        partyName: payment.partyName || '',
        matchBasis: referenceCandidates.length ? 'reference_amount_direction' : 'amount_direction_date',
        status: 'suggested_match'
      });
      continue;
    }

    const reason = finalists.length > 1
      ? 'ambiguous_payment_candidates'
      : candidates.length > 0
        ? 'payment_already_suggested_for_another_statement'
        : 'no_amount_direction_reference_or_date_match';
    unreconciledBankLines.push({
      bankStatementId: statement._id,
      bankDate: statement.transactionDate,
      bankDescription: statement.description || '',
      bankAmount: direction.amount,
      status: 'unmatched',
      reason,
      candidateCount: finalists.length
    });
  }

  return { matches, unreconciledBankLines };
}

module.exports = { suggestBankStatementMatches, evaluateBankPaymentMatch };
