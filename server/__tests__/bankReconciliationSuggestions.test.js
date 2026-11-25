const { suggestBankStatementMatches } = require('../services/bankReconciliationService');

describe('Bank reconciliation suggestions', () => {
  test('matches credits to receipts and debits to payments using actual statement and ledger fields', () => {
    const bankStatements = [
      { _id: 'bank-credit', transactionDate: new Date('2026-11-20'), credit: 1500, debit: 0, reference: 'UPI-001' },
      { _id: 'bank-debit', transactionDate: new Date('2026-11-21'), credit: 0, debit: 900, reference: 'NEFT-002' }
    ];
    const ledgerPayments = [
      { _id: 'payment-receipt', type: 'receive', status: 'active', amount: 1500, date: new Date('2026-11-20'), referenceNo: 'UPI-001', partyName: 'Customer A' },
      { _id: 'payment-made', type: 'make', status: 'active', amount: 900, date: new Date('2026-11-22'), referenceNo: 'NEFT-002', partyName: 'Supplier B' }
    ];
    const result = suggestBankStatementMatches({ bankStatements, ledgerPayments });
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]).toMatchObject({ paymentId: 'payment-receipt', matchBasis: 'reference_amount_direction' });
    expect(result.matches[1]).toMatchObject({ paymentId: 'payment-made', matchBasis: 'reference_amount_direction' });
    expect(result.unreconciledBankLines).toHaveLength(0);
  });

  test('does not reuse a ledger payment for multiple bank statement lines', () => {
    const bankStatements = [
      { _id: 'bank-1', transactionDate: new Date('2026-11-20'), credit: 500, debit: 0 },
      { _id: 'bank-2', transactionDate: new Date('2026-11-20'), credit: 500, debit: 0 }
    ];
    const ledgerPayments = [
      { _id: 'payment-1', type: 'receive', status: 'active', amount: 500, date: new Date('2026-11-20') }
    ];
    const result = suggestBankStatementMatches({ bankStatements, ledgerPayments });
    expect(result.matches).toHaveLength(1);
    expect(result.unreconciledBankLines[0].reason).toBe('payment_already_suggested_for_another_statement');
  });

  test('leaves ambiguous candidates and reversed payments unmatched', () => {
    const bankStatements = [
      { _id: 'ambiguous', transactionDate: new Date('2026-11-20'), credit: 700, debit: 0 },
      { _id: 'reversed', transactionDate: new Date('2026-11-20'), credit: 800, debit: 0 }
    ];
    const ledgerPayments = [
      { _id: 'p1', type: 'receive', status: 'active', amount: 700, date: new Date('2026-11-20') },
      { _id: 'p2', type: 'receive', status: 'active', amount: 700, date: new Date('2026-11-20') },
      { _id: 'p3', type: 'receive', status: 'reversed', amount: 800, date: new Date('2026-11-20') }
    ];
    const result = suggestBankStatementMatches({ bankStatements, ledgerPayments });
    expect(result.matches).toHaveLength(0);
    expect(result.unreconciledBankLines[0].reason).toBe('ambiguous_payment_candidates');
    expect(result.unreconciledBankLines[1].reason).toBe('no_amount_direction_reference_or_date_match');
  });

  test('does not infer a full reconciliation when a statement has no debit or credit amount', () => {
    const result = suggestBankStatementMatches({
      bankStatements: [{ _id: 'bank-empty', transactionDate: new Date(), debit: 0, credit: 0 }],
      ledgerPayments: []
    });
    expect(result.matches).toHaveLength(0);
    expect(result.unreconciledBankLines[0].reason).toBe('invalid_or_missing_bank_debit_credit_direction');
  });
});
