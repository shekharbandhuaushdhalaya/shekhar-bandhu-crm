const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Vendor = require('../models/Vendor');
const { withTransaction } = require('../utils/withTransaction');

const money = n => Number(Number(n || 0).toFixed(2));

function invoicePaymentStatus(amountPaid, amount) {
  const paid = money(amountPaid);
  const total = money(amount);
  if (paid <= 0) return 'unpaid';
  if (paid + 0.01 >= total) return 'paid';
  return 'partially_paid';
}

function paymentError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function loadParty({ partyType, partyId, session }) {
  if (partyType === 'Customer') {
    const party = await Customer.findById(partyId).session(session);
    if (!party) throw paymentError('CUSTOMER_NOT_FOUND', 'Customer not found');
    return party;
  }
  if (partyType === 'Vendor') {
    const party = await Vendor.findById(partyId).session(session);
    if (!party) throw paymentError('VENDOR_NOT_FOUND', 'Vendor not found');
    return party;
  }
  throw paymentError('INVALID_PARTY_TYPE', 'Payment party type must be Customer or Vendor');
}

function assertAllocationOwnership(invoice, partyType, partyId) {
  if (!invoice.isFinalized || invoice.status === 'cancelled' || invoice.status === 'Cancelled') {
    throw paymentError('INVOICE_NOT_FINALIZED', `Invoice ${invoice.invoiceNo} is not an open finalized invoice`);
  }
  if (partyType === 'Customer') {
    if (invoice.type !== 'sale' || !invoice.customerId || String(invoice.customerId) !== String(partyId)) {
      throw paymentError('ALLOCATION_PARTY_MISMATCH', `Invoice ${invoice.invoiceNo} does not belong to this customer`);
    }
  } else if (partyType === 'Vendor') {
    if (invoice.type !== 'purchase' || !invoice.vendorId || String(invoice.vendorId) !== String(partyId)) {
      throw paymentError('ALLOCATION_PARTY_MISMATCH', `Invoice ${invoice.invoiceNo} does not belong to this vendor`);
    }
  }
}

function adjustPartyBalance(party, { partyType, type, mode, amount, reverse = false }) {
  const key = mode === 'cash' ? 'cashBalance' : 'regularBalance';
  let delta = 0;
  if (partyType === 'Customer') delta = type === 'receive' ? -amount : amount;
  else delta = type === 'make' ? -amount : amount;
  if (reverse) delta *= -1;
  party[key] = money(Number(party[key] || 0) + delta);
}

async function createPaymentInSession({ paymentData, allocations = [], session }) {
  const amount = money(paymentData.amount);
  if (!(amount > 0)) throw paymentError('INVALID_PAYMENT_AMOUNT', 'Payment amount must be greater than zero');
  const party = await loadParty({ partyType: paymentData.partyType, partyId: paymentData.partyId, session });

  const cleanAllocations = [];
  let allocated = 0;
  for (const row of allocations || []) {
    const allocationAmount = money(row.amountApplied ?? row.amountAllocated ?? row.amount);
    if (!(allocationAmount > 0)) continue;
    const invoice = await Invoice.findById(row.invoiceId).session(session);
    if (!invoice) throw paymentError('INVOICE_NOT_FOUND', `Invoice not found: ${row.invoiceId}`);
    assertAllocationOwnership(invoice, paymentData.partyType, paymentData.partyId);
    const outstanding = money(Math.max(0, Number(invoice.amount || 0) - Number(invoice.amountPaid || 0)));
    if (allocationAmount > outstanding + 0.01) {
      throw paymentError('ALLOCATION_EXCEEDS_INVOICE', `Allocation exceeds outstanding amount for ${invoice.invoiceNo}`);
    }
    allocated = money(allocated + allocationAmount);
    if (allocated > amount + 0.01) throw paymentError('ALLOCATION_EXCEEDS_PAYMENT', 'Allocated total cannot exceed payment amount');
    cleanAllocations.push({ invoice, amount: allocationAmount });
  }

  const [payment] = await Payment.create([{
    ...paymentData,
    status: 'active',
    amount,
    partyName: paymentData.partyName || party.company || party.name,
    unallocatedAmount: money(amount - allocated),
    allocations: [],
  }], { session });

  for (const row of cleanAllocations) {
    const invoice = row.invoice;
    invoice.amountPaid = money(Number(invoice.amountPaid || 0) + row.amount);
    invoice.status = invoicePaymentStatus(invoice.amountPaid, invoice.amount);
    invoice.payments = invoice.payments || [];
    invoice.payments.push({ paymentId: payment._id, amountAllocated: row.amount, amountApplied: row.amount, allocatedAt: new Date() });
    await invoice.save({ session });
    payment.allocations.push({ invoiceId: invoice._id, invoiceNo: invoice.invoiceNo, amountAllocated: row.amount, amountApplied: row.amount, allocatedAt: new Date() });
  }
  await payment.save({ session });
  adjustPartyBalance(party, { partyType: payment.partyType, type: payment.type, mode: payment.mode, amount });
  await party.save({ session });
  return { payment, party };
}

async function createPaymentAndAllocate({ paymentData, allocations = [] }) {
  return withTransaction(session => createPaymentInSession({ paymentData, allocations, session }));
}

async function allocateExistingPayment({ paymentId, allocations = [] }) {
  return withTransaction(async session => {
    const payment = await Payment.findById(paymentId).session(session);
    if (!payment) throw paymentError('PAYMENT_NOT_FOUND', 'Payment receipt record not found');
    if (payment.status === 'reversed') throw paymentError('PAYMENT_REVERSED', 'A reversed payment cannot be allocated');
    let remaining = money(payment.unallocatedAmount != null ? payment.unallocatedAmount : payment.amount);
    for (const row of allocations) {
      const amount = money(row.amountApplied ?? row.amountAllocated ?? row.amount);
      if (!(amount > 0)) continue;
      if (amount > remaining + 0.01) throw paymentError('ALLOCATION_EXCEEDS_PAYMENT', 'Allocations exceed the unallocated payment amount');
      const invoice = await Invoice.findById(row.invoiceId).session(session);
      if (!invoice) throw paymentError('INVOICE_NOT_FOUND', `Invoice not found: ${row.invoiceId}`);
      assertAllocationOwnership(invoice, payment.partyType, payment.partyId);
      const outstanding = money(Math.max(0, Number(invoice.amount || 0) - Number(invoice.amountPaid || 0)));
      if (amount > outstanding + 0.01) throw paymentError('ALLOCATION_EXCEEDS_INVOICE', `Allocation exceeds outstanding amount for ${invoice.invoiceNo}`);
      invoice.amountPaid = money(Number(invoice.amountPaid || 0) + amount);
      invoice.status = invoicePaymentStatus(invoice.amountPaid, invoice.amount);
      invoice.payments = invoice.payments || [];
      invoice.payments.push({ paymentId: payment._id, amountAllocated: amount, amountApplied: amount, allocatedAt: new Date() });
      await invoice.save({ session });
      payment.allocations = payment.allocations || [];
      payment.allocations.push({ invoiceId: invoice._id, invoiceNo: invoice.invoiceNo, amountAllocated: amount, amountApplied: amount, allocatedAt: new Date() });
      remaining = money(remaining - amount);
    }
    payment.unallocatedAmount = remaining;
    await payment.save({ session });
    return payment;
  });
}

async function reversePayment(paymentId, actorId = null) {
  return withTransaction(async session => {
    const payment = await Payment.findById(paymentId).session(session);
    if (!payment) throw paymentError('PAYMENT_NOT_FOUND', 'Payment not found');
    if (payment.status === 'reversed') throw paymentError('PAYMENT_ALREADY_REVERSED', 'Payment has already been reversed');
    for (const alloc of payment.allocations || []) {
      const invoice = await Invoice.findById(alloc.invoiceId).session(session);
      if (!invoice) continue;
      const amount = money(alloc.amountApplied ?? alloc.amountAllocated);
      invoice.amountPaid = money(Math.max(0, Number(invoice.amountPaid || 0) - amount));
      invoice.status = invoicePaymentStatus(invoice.amountPaid, invoice.amount);
      invoice.payments = (invoice.payments || []).filter(p => String(p.paymentId) !== String(payment._id));
      await invoice.save({ session });
    }
    const party = await loadParty({ partyType: payment.partyType, partyId: payment.partyId, session });
    adjustPartyBalance(party, { partyType: payment.partyType, type: payment.type, mode: payment.mode, amount: Number(payment.amount), reverse: true });
    await party.save({ session });
    // Preserve the original receipt as an immutable audit record. Reversal is
    // represented as a state transition rather than destructive deletion.
    payment.status = 'reversed';
    payment.reversedAt = new Date();
    payment.reversedBy = actorId || null;
    await payment.save({ session });
    return payment;
  });
}


async function createSplitPayments({ invoiceId, tenders = [], actorName = 'System' }) {
  return withTransaction(async session => {
    const invoice = await Invoice.findOne({ _id: invoiceId, type: 'sale', isFinalized: true }).session(session);
    if (!invoice || !invoice.customerId) throw paymentError('INVOICE_NOT_FOUND', 'Finalized customer-linked Sale Invoice not found');
    const clean = (tenders || []).filter(t => Number(t.amount || 0) > 0);
    if (!clean.length) throw paymentError('TENDERS_REQUIRED', 'At least one payment tender is required');
    const outstanding = money(Math.max(0, Number(invoice.amount || 0) - Number(invoice.amountPaid || 0)));
    const total = money(clean.reduce((sum, t) => sum + Number(t.amount || 0), 0));
    if (total > outstanding + 0.01) throw paymentError('PAYMENT_EXCEEDS_BALANCE', `Payment total ${total} exceeds balance ${outstanding}`);
    const payments = [];
    for (const tender of clean) {
      const result = await createPaymentInSession({
        paymentData: {
          type: 'receive', partyType: 'Customer', partyId: invoice.customerId,
          partyName: invoice.customerName, amount: Number(tender.amount),
          mode: tender.method === 'Cash' ? 'cash' : 'regular', paymentMethod: tender.method,
          referenceNo: tender.referenceNo || '', notes: tender.notes || `Split payment for ${invoice.invoiceNo}`,
          receivedBy: actorName,
        },
        allocations: [{ invoiceId: invoice._id, amountAllocated: Number(tender.amount) }],
        session,
      });
      payments.push(result.payment);
    }
    const refreshed = await Invoice.findById(invoice._id).session(session);
    return { invoice: refreshed, payments };
  });
}

async function postGatewayPayment({ invoice, amount, transactionId, gatewayOrderId, gatewayData }) {
  if (!invoice || invoice.type !== 'sale' || !invoice.isFinalized || !invoice.customerId) {
    throw paymentError('INVALID_GATEWAY_INVOICE', 'Gateway payments require a finalized customer-linked sale invoice');
  }
  const outstanding = money(Math.max(0, Number(invoice.amount || 0) - Number(invoice.amountPaid || 0)));
  const payAmount = money(amount == null ? outstanding : amount);
  if (!(outstanding > 0)) throw paymentError('INVOICE_ALREADY_PAID', 'Invoice is already paid');
  if (payAmount > outstanding + 0.01) throw paymentError('PAYMENT_EXCEEDS_BALANCE', 'Gateway payment exceeds invoice balance');
  return withTransaction(async session => {
    const fresh = await Invoice.findById(invoice._id).session(session);
    if (!fresh || !fresh.isFinalized || fresh.type !== 'sale' || !fresh.customerId) throw paymentError('INVALID_GATEWAY_INVOICE', 'Invoice is not eligible for gateway payment');
    const result = await createPaymentInSession({
      paymentData: {
        type: 'receive', partyType: 'Customer', partyId: fresh.customerId,
        partyName: fresh.customerName, amount: payAmount, mode: 'regular', paymentMethod: 'UPI',
        referenceNo: transactionId || '', notes: `Gateway payment for ${fresh.invoiceNo}`,
        gatewayTransactionId: transactionId || '', gatewayOrderId: gatewayOrderId || '',
      },
      allocations: [{ invoiceId: fresh._id, amountAllocated: payAmount }],
      session,
    });
    fresh.paymentTransactionId = transactionId || fresh.paymentTransactionId;
    fresh.gatewayOrderId = gatewayOrderId || fresh.gatewayOrderId;
    fresh.paymentGatewayData = gatewayData || fresh.paymentGatewayData;
    await fresh.save({ session });
    return { invoice: fresh, payment: result.payment };
  });
}

module.exports = {
  invoicePaymentStatus,
  createPaymentAndAllocate,
  createSplitPayments,
  allocateExistingPayment,
  reversePayment,
  postGatewayPayment,
  assertAllocationOwnership,
};
