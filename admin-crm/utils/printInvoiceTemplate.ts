import { Platform } from 'react-native';
import { Invoice } from './api/types';
import { LOGO_BASE64 } from './logo';
import { FIRM_DETAILS } from '../constants/firm';
import { getStateStrWithCode } from './gst';

const numberToWords = (num: number): string => {
  if (num === 0) return "Zero";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const n = ("000000000" + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
  if (!n) return "";
  let str = "";
  str += (n[1] !== '00') ? (a[Number(n[1])] || b[Number(n[1][0])] + " " + a[Number(n[1][1])]) + " Crore " : "";
  str += (n[2] !== '00') ? (a[Number(n[2])] || b[Number(n[2][0])] + " " + a[Number(n[2][1])]) + " Lakh " : "";
  str += (n[3] !== '00') ? (a[Number(n[3])] || b[Number(n[3][0])] + " " + a[Number(n[3][1])]) + " Thousand " : "";
  str += (n[4] !== '0') ? (a[Number(n[4])] || b[Number(n[4][0])] + " " + a[Number(n[4][1])]) + " Hundred " : "";
  str += (n[5] !== '00') ? ((str !== "") ? "and " : "") + (a[Number(n[5])] || b[Number(n[5][0])] + " " + a[Number(n[5][1])]) : "";
  return str.trim();
};

export const printInvoice = (invoice: Invoice) => {
  if (Platform.OS !== 'web') {
    alert('Print is available on web only.');
    return;
  }

  const isPakka = true;
  let totalTaxable = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;
  let grandTotal = 0;

  let totalBoxes = 0;
  let totalGoodsQty = 0;
  const numItems = invoice.items?.length || 0;
  const fillerHeight = Math.max(0, 200 - (numItems * 18));
  const isAllPieces = (invoice.items || []).every(it => (it.packing || 1) === 1);

  let billingAddressToShow = invoice.partyAddress || '';
  let shippingAddressToShow = invoice.shippingAddress || '';

  if (invoice.partyAddress && invoice.partyAddress.includes('Billing Address:') && invoice.partyAddress.includes('Shipping Address:')) {
    const parts = invoice.partyAddress.split('Shipping Address:');
    const billingPart = parts[0].replace('Billing Address:', '').trim();
    const shippingPart = parts[1] ? parts[1].trim() : '';
    if (billingPart) billingAddressToShow = billingPart;
    if (shippingPart) shippingAddressToShow = shippingPart;
  } else if (invoice.shippingAddress && invoice.shippingAddress.includes('Billing Address:') && invoice.shippingAddress.includes('Shipping Address:')) {
    const parts = invoice.shippingAddress.split('Shipping Address:');
    const billingPart = parts[0].replace('Billing Address:', '').trim();
    const shippingPart = parts[1] ? parts[1].trim() : '';
    if (billingPart) billingAddressToShow = billingPart;
    if (shippingPart) shippingAddressToShow = shippingPart;
  }

  const hsnSummary: Record<string, { taxable: number, cgst: number, sgst: number, igst: number, totalTax: number }> = {};

  const itemRows = (invoice.items || [])
    .map((it, i) => {
      const rate = it.rate || 0;
      const packing = it.packing || 1;
      const qty = it.qty || 0;

      const totalPcs = qty * packing;
      totalBoxes += qty;
      totalGoodsQty += totalPcs;
      const taxable = totalPcs * rate;
      totalTaxable += taxable;

      let cRate = 0, cAmt = 0;
      let sRate = 0, sAmt = 0;
      let iRate = 0, iAmt = 0;

      if (isPakka) {
        const gstRate = it.gstRate || invoice.gstRate || FIRM_DETAILS.defaultGstRate;
        if (invoice.igst && invoice.igst > 0) {
          iRate = gstRate;
          iAmt = taxable * (iRate / 100);
          totalIGST += iAmt;
        } else {
          cRate = gstRate / 2;
          sRate = gstRate / 2;
          cAmt = taxable * (cRate / 100);
          sAmt = taxable * (sRate / 100);
          totalCGST += cAmt;
          totalSGST += sAmt;
        }
      }

      const rowTotal = taxable + cAmt + sAmt + iAmt;
      grandTotal += rowTotal;

      const hsn = it.hsnCode || 'N/A';
      if (!hsnSummary[hsn]) {
        hsnSummary[hsn] = { taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
      }
      hsnSummary[hsn].taxable += taxable;
      hsnSummary[hsn].cgst += cAmt;
      hsnSummary[hsn].sgst += sAmt;
      hsnSummary[hsn].igst += iAmt;
      hsnSummary[hsn].totalTax += (cAmt + sAmt + iAmt);

      return `
        <tr>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:center;">${i + 1}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:left;">
            ${(it.name || '').replace(/\s+[0-9]+(?:\.[0-9]+)?[gG]$/, '')}
          </td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:center;">${it.hsnCode || ''}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:center; font-family: monospace; font-size: 9px; font-weight: bold;">${(it as any).batchNo || '—'}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:center; font-size:8px;">
            ${(it as any).expiryDate ? new Date((it as any).expiryDate).toLocaleDateString('en-IN') : '—'}
          </td>
          ${isAllPieces ? `
            <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${qty}</td>
          ` : `
            <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${packing}</td>
            <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${qty}</td>
          `}
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${(it.mrp && it.mrp > 0 ? it.mrp : rate).toFixed(2)}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:center;">${it.discountPercent && it.discountPercent > 0 ? it.discountPercent + '%' : '—'}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${taxable.toFixed(2)}</td>
          
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${cRate > 0 ? cRate.toFixed(2) + '%' : ''}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${cAmt > 0 ? cAmt.toFixed(2) : ''}</td>
          
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${sRate > 0 ? sRate.toFixed(2) + '%' : ''}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${sAmt > 0 ? sAmt.toFixed(2) : ''}</td>
          
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${iRate > 0 ? iRate.toFixed(2) + '%' : ''}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${iAmt > 0 ? iAmt.toFixed(2) : ''}</td>
          
          <td style="padding:1px 2px; text-align:right;">${rowTotal.toFixed(2)}</td>
        </tr>`;
    })
    .join('');

  const dateStr = new Date(invoice.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const docLabel = isPakka ? 'TAX INVOICE' : 'DELIVERY CHALLAN';
  const finalGrandTotal = grandTotal + (invoice.roundOff || 0);

  const makeCopy = (copyLabel: string) => `
    <div class="copy-page">
      <div class="invoice-container">
      <div style="border: 1px solid #000; border-bottom: none; padding: 10px;">
        <div style="display:flex; justify-content:space-between; align-items: center;">
          <div style="display:flex; align-items: center; gap: 15px;">
            <img src="data:image/png;base64,${LOGO_BASE64}" style="height: 45px; width: auto; object-fit: contain;" />
            <div style="text-align:left;">
              <div style="font-weight:bold; font-size:20px; letter-spacing:1px;">${invoice.firmDetails?.name || FIRM_DETAILS.name}</div>
              <div style="font-size:10px; margin-top:2px;">${invoice.firmDetails?.address || FIRM_DETAILS.address}</div>
              <div style="font-size:10px;">email: ${invoice.firmDetails?.email || FIRM_DETAILS.email}</div>
              <div style="font-size:10px;">Phone : ${invoice.firmDetails?.phone || FIRM_DETAILS.phone}</div>
              <div style="font-size:11px; margin-top: 2px;"><strong>GSTIN : ${invoice.firmDetails?.gstin || FIRM_DETAILS.gstin}</strong>${FIRM_DETAILS.manufacturingLicenseNo ? ` &nbsp;|&nbsp; <strong>Mfg. Lic. No : ${FIRM_DETAILS.manufacturingLicenseNo}</strong>` : ''}${FIRM_DETAILS.gmpCertificateNo ? ` &nbsp;|&nbsp; <strong>GMP No : ${FIRM_DETAILS.gmpCertificateNo}</strong>` : ''}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-weight:bold; font-size:18px;">${docLabel}</div>
            <div style="font-style:italic; font-size:12px; margin-top: 4px;">${copyLabel} Copy</div>
          </div>
        </div>
      </div>
      <table style="width:100%; border: 1px solid #000; border-collapse: collapse; font-size:10px;">
        <tr>
          <td style="width:50%; border-right: 1px solid #000; border-bottom: 1px solid #000; padding:5px; vertical-align:top;">
            <strong>Billed to :</strong><br/>
            <strong style="font-size:14px;">${invoice.customerName}</strong><br/>
            ${billingAddressToShow ? billingAddressToShow.replace(/\n/g, '<br/>') : ''}<br/>
            ${invoice.gstin ? `<strong>GSTIN:</strong> ${invoice.gstin}<br/>` : ''}
            <strong>State:</strong> ${getStateStrWithCode(invoice.stateOfSupply)}
          </td>
          <td style="width:50%; padding:5px; vertical-align:top;" rowspan="2">
            <div style="display:flex; justify-content:space-between; height: 100%;">
              <div style="flex:1;">
                <table style="width:100%; font-size:10px;">
                  <tr><td style="width:40%;">Invoice No.</td><td>: <strong>${invoice.invoiceNo || ''}</strong></td></tr>
                  <tr><td>Date of Invoice</td><td>: <strong>${dateStr}</strong></td></tr>
                  <tr><td>Place of Supply</td><td>: <strong>${getStateStrWithCode(invoice.stateOfSupply)}</strong></td></tr>
                  <tr><td>Reverse Charge</td><td>: <strong>N</strong></td></tr>
                  <tr><td colspan="2"><div style="border-top: 1px dashed #ccc; margin: 4px 0;"></div></td></tr>
                  <tr><td>Transport</td><td>: <strong>${invoice.transport || ''}</strong></td></tr>
                  <tr><td>Vehicle No.</td><td>: <strong>${invoice.vehicleNo || ''}</strong></td></tr>
                  <tr><td>E-WAY BILL NO.</td><td>: <strong>${invoice.ewayBillNo || ''}</strong></td></tr>
                  <tr><td>IRN</td><td>: <strong>${invoice.irn || ''}</strong></td></tr>
                </table>
              </div>
              ${invoice.qrCode ? `
              <div style="width: 80px; display:flex; flex-direction:column; align-items:flex-end;">
                 <img src="${invoice.qrCode}" style="width: 70px; height: 70px;" />
              </div>
              ` : ''}
            </div>
          </td>
        </tr>
        <tr>
          <td style="width:50%; border-right: 1px solid #000; padding:5px; vertical-align:top;">
            <strong>Shipped to :</strong><br/>
            <strong style="font-size:14px;">${invoice.customerName}</strong><br/>
            ${shippingAddressToShow ? shippingAddressToShow.replace(/\n/g, '<br/>') : (billingAddressToShow || '')}<br/>
            <strong>State:</strong> ${getStateStrWithCode(invoice.stateOfSupply)}
          </td>
        </tr>
      </table>

      <table style="width:100%; border: 1px solid #000; border-top: none; border-bottom: none; border-collapse: collapse; font-size:10px; text-align:center;">
        <thead>
          <tr style="border-bottom: 1px solid #000; border-top: 1px solid #000; background-color: #f9fafb;">
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:4%;">S.No.</th>
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:22%;">Description of Goods</th>
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:6%;">HSN/SAC</th>
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:8%;">Batch No.</th>
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:7%;">Expiry</th>
            ${isAllPieces ? `
              <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:6%;">Qty</th>
            ` : `
              <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:6%;">Packing/Box</th>
              <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:6%;">No. of Boxes</th>
            `}
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:5%;">Price</th>
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:5%;">Disc %</th>
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:8%;">Taxable Amt</th>
            <th colspan="2" style="border-right: 1px solid #000; padding:4px; width:10%;">CGST</th>
            <th colspan="2" style="border-right: 1px solid #000; padding:4px; width:10%;">SGST</th>
            <th colspan="2" style="border-right: 1px solid #000; padding:4px; width:10%;">IGST</th>
            <th rowspan="2" style="padding:4px; width:10%;">Amount(Rs.)</th>
          </tr>
          <tr style="border-bottom: 1px solid #000; background-color: #f9fafb;">
            <th style="border-right: 1px solid #000; border-top: 1px solid #000; padding:4px;">Rate</th>
            <th style="border-right: 1px solid #000; border-top: 1px solid #000; padding:4px;">Amount</th>
            <th style="border-right: 1px solid #000; border-top: 1px solid #000; padding:4px;">Rate</th>
            <th style="border-right: 1px solid #000; border-top: 1px solid #000; padding:4px;">Amount</th>
            <th style="border-right: 1px solid #000; border-top: 1px solid #000; padding:4px;">Rate</th>
            <th style="border-right: 1px solid #000; border-top: 1px solid #000; padding:4px;">Amount</th>
          </tr>
        </thead>
        <tbody style="border-bottom: 1px solid #000;">
          ${itemRows}
          <tr>
            <td style="border-right: 1px solid #000; height: ${fillerHeight}px;"></td>
            <td style="border-right: 1px solid #000;"></td>
            <td style="border-right: 1px solid #000;"></td>
            <td style="border-right: 1px solid #000;"></td> <!-- Batch No -->
            <td style="border-right: 1px solid #000;"></td> <!-- Expiry -->
            <td style="border-right: 1px solid #000;"></td>
            ${isAllPieces ? '' : '<td style="border-right: 1px solid #000;"></td>'}
            <td style="border-right: 1px solid #000;"></td>
            <td style="border-right: 1px solid #000;"></td>
            <td style="border-right: 1px solid #000;"></td>
            <td style="border-right: 1px solid #000;"></td>
            <td style="border-right: 1px solid #000;"></td>
            <td style="border-right: 1px solid #000;"></td>
            <td style="border-right: 1px solid #000;"></td>
            <td style="border-right: 1px solid #000;"></td>
            <td style="border-right: 1px solid #000;"></td>
            <td></td>
          </tr>
        </tbody>
        <tfoot>
          <tr style="border-bottom: 1px solid #000;">
            <td colspan="5" style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding:4px; text-align:right;"><strong>Sub-Total / Total Qty</strong></td>
            ${isAllPieces ? `
              <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding:4px; text-align:right;"><strong>${totalGoodsQty} Pcs.</strong></td>
            ` : `
              <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding:4px; text-align:right;"><strong>${totalGoodsQty} Pcs.</strong></td>
              <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding:4px; text-align:right;"><strong>${totalBoxes}</strong></td>
            `}
            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding:4px;"></td>
            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding:4px;"></td>
            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding:4px; text-align:right;"><strong>${totalTaxable.toFixed(2)}</strong></td>
            <td colspan="2" style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding:4px; text-align:right;"><strong>${totalCGST > 0 ? totalCGST.toFixed(2) : ''}</strong></td>
            <td colspan="2" style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding:4px; text-align:right;"><strong>${totalSGST > 0 ? totalSGST.toFixed(2) : ''}</strong></td>
            <td colspan="2" style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding:4px; text-align:right;"><strong>${totalIGST > 0 ? totalIGST.toFixed(2) : ''}</strong></td>
            <td style="border-bottom: 1px solid #000; padding:4px; text-align:right;"><strong>${grandTotal.toFixed(2)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <table style="width:100%; border: 1px solid #000; border-top: none; border-collapse: collapse; font-size:10px;">
        <tr>
          <td style="width:70%; border-right: 1px solid #000; padding:5px; vertical-align:top;">
            <table style="width:70%; font-size:9px; text-align:left; border-collapse: collapse;">
              <tr>
                <th style="padding-right: 8px;">HSN/SAC</th>
                <th style="padding-right: 8px;">Taxable Amt.</th>
                ${totalCGST > 0 ? `<th style="padding-right: 8px;">CGST Amt.</th>` : ''}
                ${totalSGST > 0 ? `<th style="padding-right: 8px;">SGST Amt.</th>` : ''}
                ${totalIGST > 0 ? `<th style="padding-right: 8px;">IGST Amt.</th>` : ''}
                <th>Total Tax</th>
              </tr>
              ${Object.entries(hsnSummary).map(([hsn, data]) => `
                <tr>
                  <td>${hsn}</td>
                  <td>${data.taxable.toFixed(2)}</td>
                  ${totalCGST > 0 ? `<td>${data.cgst.toFixed(2)}</td>` : ''}
                  ${totalSGST > 0 ? `<td>${data.sgst.toFixed(2)}</td>` : ''}
                  ${totalIGST > 0 ? `<td>${data.igst.toFixed(2)}</td>` : ''}
                  <td>${data.totalTax.toFixed(2)}</td>
                </tr>
              `).join('')}
              <tr style="border-top: 1px solid #000; font-weight: bold;">
                <td style="padding-top: 2px;">Total</td>
                <td style="padding-top: 2px;">${totalTaxable.toFixed(2)}</td>
                ${totalCGST > 0 ? `<td style="padding-top: 2px;">${totalCGST.toFixed(2)}</td>` : ''}
                ${totalSGST > 0 ? `<td style="padding-top: 2px;">${totalSGST.toFixed(2)}</td>` : ''}
                ${totalIGST > 0 ? `<td style="padding-top: 2px;">${totalIGST.toFixed(2)}</td>` : ''}
                <td style="padding-top: 2px;">${(totalCGST + totalSGST + totalIGST).toFixed(2)}</td>
              </tr>
            </table>
          </td>
          <td style="width:30%; padding:5px; vertical-align:top; text-align:right;">
            <table style="width:100%; font-size:11px;">
              <tr><td style="text-align:right;">Taxable Amount</td><td style="text-align:right;">${totalTaxable.toFixed(2)}</td></tr>
              ${totalCGST > 0 ? `<tr><td style="text-align:right;">Add: CGST</td><td style="text-align:right;">${totalCGST.toFixed(2)}</td></tr>` : ''}
              ${totalSGST > 0 ? `<tr><td style="text-align:right;">Add: SGST</td><td style="text-align:right;">${totalSGST.toFixed(2)}</td></tr>` : ''}
              ${totalIGST > 0 ? `<tr><td style="text-align:right;">Add: IGST</td><td style="text-align:right;">${totalIGST.toFixed(2)}</td></tr>` : ''}
              ${invoice.roundOff ? `<tr><td style="text-align:right;">Round Off</td><td style="text-align:right;">${invoice.roundOff > 0 ? '+' : ''}${invoice.roundOff.toFixed(2)}</td></tr>` : ''}
            </table>
          </td>
        </tr>
        <tr style="border-top: 1px solid #000;">
          <td style="width:70%; border-right: 1px solid #000; padding:5px; vertical-align:middle;">
            <span style="font-weight:600;">Amount in words:</span><br/>
            <strong>Rupees ${numberToWords(Math.round(finalGrandTotal))} Only</strong>
          </td>
          <td style="width:30%; padding:5px; vertical-align:middle; text-align:right;">
            <table style="width:100%; font-size:11px;">
              <tr><td style="text-align:right;"><strong>Grand Total</strong></td><td style="text-align:right; font-size:14px;"><strong>${finalGrandTotal.toFixed(2)}</strong></td></tr>
            </table>
          </td>
        </tr>
      </table>
      <table style="width:100%; border: 1px solid #000; border-top: none; border-collapse: collapse; font-size:10px;">
        <tr>
          <td style="width:33%; border-right: 1px solid #000; padding:5px; vertical-align:top;">
            <strong>Bank Details:</strong><br/>
            Bank Name: ${invoice.firmDetails?.bankName || FIRM_DETAILS.bankName}<br/>
            Account No.: ${invoice.firmDetails?.bankAccountNo || FIRM_DETAILS.bankAccountNo}<br/>
            IFSC: ${invoice.firmDetails?.bankIfsc || FIRM_DETAILS.bankIfsc}<br/>
            Branch: ${invoice.firmDetails?.bankBranch || FIRM_DETAILS.bankBranch}
          </td>
          <td style="width:34%; border-right: 1px solid #000; padding:5px; vertical-align:top; font-size:8px; line-height: 1.3;">
            <strong>Terms & Conditions</strong><br/>
            ${FIRM_DETAILS.defaultTerms ? FIRM_DETAILS.defaultTerms.replace(/\\n/g, '\n').replace(/\r?\n/g, '<br/>') : ''}
          </td>
          <td style="width:33%; text-align:center; padding:5px; vertical-align:${(FIRM_DETAILS.signatureBase64 || FIRM_DETAILS.signatureUrl) ? 'middle' : 'bottom'}; height: 80px;">
            ${(FIRM_DETAILS.signatureBase64 || FIRM_DETAILS.signatureUrl) ? `
              <img src="${FIRM_DETAILS.signatureBase64 || FIRM_DETAILS.signatureUrl}" style="max-height: 38px; width: auto; object-fit: contain; margin-bottom: 2px;" />
              <div style="font-weight:bold; font-size: 10px; color: #15803d; margin-bottom: 4px;">
                ✔ DIGITALLY SIGNED DOCUMENT
              </div>
              <div style="border: 1px dashed #16a34a; background-color: #f0fdf4; border-radius: 4px; padding: 5px; font-size: 8px; text-align: left; line-height: 1.3; display: flex; align-items: center; gap: 8px;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`GST Digital Signature | Seller: ${FIRM_DETAILS.name} | GSTIN: ${FIRM_DETAILS.gstin || ''} | Inv: ${invoice.invoiceNo} | Date: ${new Date(invoice.date || Date.now()).toLocaleDateString('en-IN')} | Amt: ₹${finalGrandTotal.toFixed(2)} | Rule 46 CGST & Sec 5 IT Act Certified`)}" style="width: 48px; height: 48px; border: 1px solid #16a34a; padding: 2px; background: #fff; border-radius: 3px; flex-shrink: 0;" />
                <div style="flex: 1;">
                  <strong>Signed By:</strong> ${FIRM_DETAILS.name}<br/>
                  <strong>Signatory:</strong> ${FIRM_DETAILS.dscSignatoryName}<br/>
                  <strong>Date:</strong> ${new Date(invoice.date || Date.now()).toLocaleDateString('en-IN')}<br/>
                  <span style="color: #15803d; font-weight: bold;">✔ Certified under Rule 46 CGST & Sec 5 IT Act.</span>
                </div>
              </div>
            ` : `
              <div style="font-weight:bold; margin-bottom: 40px; font-size: 11px;">For ${FIRM_DETAILS.name}</div>
              <div>Authorised Signatory</div>
            `}
          </td>
        </tr>
      </table>
      </div>
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Invoice ${invoice.invoiceNo || 'Draft'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      color: #000;
      background: #fff;
      width: 297mm;
      margin: 0 auto;
    }
    .copy-page {
      width: 100%;
      height: 210mm;
      padding: 5mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      position: relative;
    }
    .invoice-container {
      width: 100%;
    }
    @media print {
      body { width: 297mm; height: 210mm; }
      @page { size: A4 landscape; margin: 0; }
      .copy-page { page-break-after: always; padding: 5mm; height: 210mm; }
    }
  </style>
</head>
<body>
  ${makeCopy('Original')}
  ${makeCopy('Duplicate')}
  <script>
    Promise.all(
      Array.from(document.images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      })
    ).then(() => {
      setTimeout(() => {
        window.print();
      }, 250);
    });
  </script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=800,height=900');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
};
