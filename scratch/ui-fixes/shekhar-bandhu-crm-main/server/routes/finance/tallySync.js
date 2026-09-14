const express = require('express');
const Invoice = require('../../models/Invoice');
const Customer = require('../../models/Customer');
const { authorize } = require('../../middleware/authorize');
const { generateAtomicDocumentNumber } = require('../../utils/documentCounter');

const router = express.Router();

function cleanXmlText(value) {
  return String(value || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
}

// POST /api/tally/import-xml — Import an external Tally sales voucher as a reconciliation draft.
// It deliberately does NOT create a finalized CRM sale invoice: physical movement must still
// originate from a posted Sale Challan and receivables are posted only when that CRM invoice finalizes.
router.post('/import-xml', authorize('invoice:create'), async (req, res) => {
  try {
    const { xmlPayload } = req.body;
    if (!xmlPayload || typeof xmlPayload !== 'string') return res.status(400).json({ error: 'xmlPayload string is required' });

    const voucherNoMatch = xmlPayload.match(/<VOUCHERNUMBER>(.*?)<\/VOUCHERNUMBER>/is);
    const partyNameMatch = xmlPayload.match(/<PARTYLEDGERNAME>(.*?)<\/PARTYLEDGERNAME>/is);
    const amountMatches = [...xmlPayload.matchAll(/<AMOUNT>(.*?)<\/AMOUNT>/gis)];
    const externalVoucherNo = cleanXmlText(voucherNoMatch?.[1]);
    const partyName = cleanXmlText(partyNameMatch?.[1]);
    const parsedAmounts = amountMatches.map(m => Math.abs(Number.parseFloat(cleanXmlText(m[1])) || 0)).filter(n => n > 0);
    const amount = parsedAmounts.length ? Math.max(...parsedAmounts) : 0;

    if (!externalVoucherNo || !partyName || !(amount > 0)) {
      return res.status(422).json({ error: 'Tally voucher must contain VOUCHERNUMBER, PARTYLEDGERNAME and a positive AMOUNT', code: 'TALLY_VOUCHER_INCOMPLETE' });
    }

    const duplicate = await Invoice.findOne({ type: 'sale', reference: `TALLY:${externalVoucherNo}` }).lean();
    if (duplicate) return res.status(200).json({ status: 'already_imported', externalVoucherNo, invoice: duplicate });

    const customers = await Customer.find({ $or: [{ name: partyName }, { company: partyName }] }).limit(2);
    if (customers.length !== 1) {
      return res.status(409).json({
        error: customers.length ? `Tally party "${partyName}" matches more than one customer. Resolve the customer before import.` : `No CRM customer matches Tally party "${partyName}". Create/link the customer first.`,
        code: customers.length ? 'TALLY_CUSTOMER_AMBIGUOUS' : 'TALLY_CUSTOMER_NOT_FOUND'
      });
    }

    const customer = customers[0];
    const invoiceNo = await generateAtomicDocumentNumber('tallyReconciliationInvoiceNo', 'TALLY-DRAFT-', 6);
    const invoice = await Invoice.create({
      type: 'sale',
      invoiceNo,
      customerId: customer._id,
      customerName: customer.company || customer.name,
      amount,
      baseAmount: amount,
      date: new Date(),
      status: 'unpaid',
      isFinalized: false,
      deductInventory: false,
      reference: `TALLY:${externalVoucherNo}`,
      sourceDocType: '',
      items: [],
    });

    res.status(201).json({
      status: 'reconciliation_draft',
      message: 'Tally voucher imported as a non-posting draft. Match it to a posted Sale Challan before creating/finalizing the authoritative CRM invoice.',
      externalVoucherNo,
      partyName,
      amount,
      invoice,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, code: 'TALLY_IMPORT_FAILED' });
  }
});

module.exports = router;
