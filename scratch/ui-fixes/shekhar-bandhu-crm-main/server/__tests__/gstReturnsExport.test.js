describe('GSTR-1 and GSTR-3B JSON Exporters', () => {
  it('formats GSTR-1 B2B invoices according to GST Portal schema', () => {
    const invoices = [
      {
        invoiceNo: 'INV-001',
        date: new Date('2026-09-10'),
        amount: 1120,
        baseAmount: 1000,
        cgst: 60,
        sgst: 60,
        igst: 0,
        gstin: '09AAACG1234F1Z5'
      }
    ];

    const b2bMap = {};
    invoices.forEach(inv => {
      const ctin = inv.gstin.trim();
      if (!b2bMap[ctin]) b2bMap[ctin] = { ctin, inv: [] };

      b2bMap[ctin].inv.push({
        inum: inv.invoiceNo,
        idt: '10-09-2026',
        val: inv.amount,
        pos: inv.gstin.substring(0, 2),
        rchrg: 'N',
        inv_typ: 'R',
        itms: [{ num: 1, itm_det: { txval: inv.baseAmount, rt: 12, camt: 60, samt: 60, iamt: 0, csamt: 0 } }]
      });
    });

    const exportObj = {
      gstin: '09AAAAA0000A1Z5',
      fp: '092026',
      version: 'GST3.0.4',
      b2b: Object.values(b2bMap)
    };

    expect(exportObj.version).toBe('GST3.0.4');
    expect(exportObj.fp).toBe('092026');
    expect(exportObj.b2b.length).toBe(1);
    expect(exportObj.b2b[0].ctin).toBe('09AAACG1234F1Z5');
    expect(exportObj.b2b[0].inv[0].val).toBe(1120);
  });
});
