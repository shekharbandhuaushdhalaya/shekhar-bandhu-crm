import { useEffect, useState, useCallback } from 'react';
import * as Print from 'expo-print';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl, Modal, FlatList, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api, Quotation, Product, Customer, Warehouse, InventoryEntry, QuotationItem } from '../utils/api';
import { getStateStrWithCode } from '../utils/gst';
import { useAuth } from '../utils/auth';
import { useTheme, useStyles } from '../utils/themeContext';
import * as Sharing from 'expo-sharing';
import { LOGO_BASE64 } from '../utils/logo';
import { FIRM_DETAILS } from '../constants/firm';

// ── Print Quotation ──────────────────────────────────────────────────────────────
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

const printQuotation = (invoice: Quotation) => {
  if (Platform.OS !== 'web') {
    alert('Print is available on web only.');
    return;
  }

  const isPakka = invoice.mode === 'pakka';
  let totalBoxes = 0;
  let totalGoodsQty = 0;
  const hsnSummary: Record<string, { taxable: number, cgst: number, sgst: number, igst: number, totalTax: number }> = {};
  
  const numItems = invoice.items?.length || 0;
  const fillerHeight = Math.max(0, 200 - (numItems * 18));

  let totalTaxable = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;
  let grandTotal = 0;
  
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
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:left;">${(it.name || '').replace(/\s+[0-9]+(?:\.[0-9]+)?[gG]$/, '')}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:center;">${it.hsnCode || ''}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${packing}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${qty}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${rate.toFixed(2)}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${taxable.toFixed(2)}</td>
          
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${cRate > 0 ? cRate.toFixed(2)+'%' : ''}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${cAmt > 0 ? cAmt.toFixed(2) : ''}</td>
          
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${sRate > 0 ? sRate.toFixed(2)+'%' : ''}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${sAmt > 0 ? sAmt.toFixed(2) : ''}</td>
          
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${iRate > 0 ? iRate.toFixed(2)+'%' : ''}</td>
          <td style="border-right: 1px solid #000; padding:1px 2px; text-align:right;">${iAmt > 0 ? iAmt.toFixed(2) : ''}</td>
          
          <td style="padding:1px 2px; text-align:right;">${rowTotal.toFixed(2)}</td>
        </tr>`;
    })
    .join('');

  const dateStr = new Date(invoice.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
  const docLabel = isPakka ? 'PROFORMA INVOICE / QUOTATION' : 'PROFORMA INVOICE / QUOTATION';
  const finalGrandTotal = grandTotal + (invoice.roundOff || 0);

  const makeCopy = (copyLabel: string) => `
    <div class="copy-page">
      <div class="invoice-container">
      <div style="border: 1px solid #000; border-bottom: none; padding: 10px;">
        <div style="display:flex; justify-content:space-between; align-items: center;">
          <div style="display:flex; align-items: center; gap: 15px;">
            <img src="data:image/png;base64,${LOGO_BASE64}" style="height: 45px; width: auto; object-fit: contain;" />
            <div style="text-align:left;">
              <div style="font-weight:bold; font-size:20px; letter-spacing:1px;">${FIRM_DETAILS.name}</div>
              <div style="font-size:10px; margin-top:2px;">${FIRM_DETAILS.address}</div>
              <div style="font-size:10px;">email: ${FIRM_DETAILS.email}</div>
              <div style="font-size:10px;">Phone : ${FIRM_DETAILS.phone}</div>
              <div style="font-size:11px; margin-top: 2px;"><strong>GSTIN : ${FIRM_DETAILS.gstin}</strong></div>
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
            ${invoice.partyAddress ? invoice.partyAddress.replace(/\n/g, '<br/>') : ''}<br/>
            ${invoice.gstin ? `<strong>GSTIN:</strong> ${invoice.gstin}<br/>` : ''}
            <strong>State:</strong> ${getStateStrWithCode(invoice.stateOfSupply)}
          </td>
          <td style="width:50%; padding:5px; vertical-align:top;" rowspan="2">
            <div style="display:flex; justify-content:space-between; height: 100%;">
              <div style="flex:1;">
                <table style="width:100%; font-size:10px;">
                  <tr><td style="width:40%;">Quotation No.</td><td>: <strong>${invoice.quotationNo || ''}</strong></td></tr>
                  <tr><td>Date</td><td>: <strong>${dateStr}</strong></td></tr>
                  <tr><td>Place of Supply</td><td>: <strong>${getStateStrWithCode(invoice.stateOfSupply)}</strong></td></tr>
                </table>
              </div>
            </div>
          </td>
        </tr>
        <tr>
          <td style="width:50%; border-right: 1px solid #000; padding:5px; vertical-align:top;">
            <strong>Shipped to :</strong><br/>
            <strong style="font-size:14px;">${invoice.customerName}</strong><br/>
            ${invoice.shippingAddress ? invoice.shippingAddress.replace(/\n/g, '<br/>') : (invoice.partyAddress || '')}<br/>
            <strong>State:</strong> ${getStateStrWithCode(invoice.stateOfSupply)}
          </td>
        </tr>
      </table>

      <table style="width:100%; border: 1px solid #000; border-top: none; border-bottom: none; border-collapse: collapse; font-size:10px; text-align:center;">
        <thead>
          <tr style="border-bottom: 1px solid #000; border-top: 1px solid #000; background-color: #f9fafb;">
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:4%;">S.No.</th>
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:24%;">Description of Goods</th>
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:6%;">HSN/SAC</th>
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:6%;">Packing/Box</th>
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:6%;">No. of Boxes</th>
            <th rowspan="2" style="border-right: 1px solid #000; padding:4px; width:5%;">Price</th>
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
            <td style="border-right: 1px solid #000;"></td>
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
            <td colspan="3" style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding:4px; text-align:right;"><strong>Sub-Total / Total Qty</strong></td>
            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding:4px; text-align:right;"><strong>${totalGoodsQty} Pcs.</strong></td>
            <td style="border-right: 1px solid #000; border-bottom: 1px solid #000; padding:4px; text-align:right;"><strong>${totalBoxes}</strong></td>
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
                <th style="padding-right: 8px;">Total Tax</th>
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
              ${invoice.freightAmount && invoice.freightAmount > 0 ? `<tr><td style="text-align:right; font-weight: bold;">Add: Freight</td><td style="text-align:right; font-weight: bold;">${invoice.freightAmount.toFixed(2)}</td></tr>` : ''}
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
            Bank Name: ${FIRM_DETAILS.bankName}<br/>
            Account No.: ${FIRM_DETAILS.bankAccountNo}<br/>
            IFSC: ${FIRM_DETAILS.bankIfsc}<br/>
            Branch: ${FIRM_DETAILS.bankBranch}
          </td>
          <td style="width:34%; border-right: 1px solid #000; padding:5px; vertical-align:top; font-size:8px; line-height: 1.3;">
            <strong>Terms & Conditions</strong><br/>
            ${FIRM_DETAILS.defaultTerms ? FIRM_DETAILS.defaultTerms.replace(/\n/g, '<br/>') : ''}
          </td>
          <td style="width:33%; text-align:center; padding:5px; vertical-align:bottom; height: 80px;">
            <div style="font-weight:bold; margin-bottom: 40px; font-size: 11px;">For ${FIRM_DETAILS.name}</div>
            <div>Authorised Signatory</div>
          </td>
        </tr>
      </table>
      </div>
    </div>
`;


  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Quotation ${invoice.quotationNo || 'Draft'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      color: #000;
      background: #fff;
      width: 210mm;
      margin: 0 auto;
    }
    .copy-page {
      width: 100%;
      height: 280mm; /* A4 portrait height approx */
      padding: 10mm;
      position: relative;
    }
    @media print {
      body { width: 210mm; height: 297mm; }
      @page { size: A4 portrait; margin: 0; }
      .copy-page { page-break-after: always; padding: 10mm; height: 297mm; }
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

// ── End Print ──

// ── End Print ──

interface ExtendedQuotationItem extends QuotationItem {
  maxQty?: number;
  rateText?: string;
}

const toTitleCase = (str?: string) => {
  if (!str) return '';
  return str
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
};

const formatSize = (size?: string) => {
  if (!size) return '';
  const cleaned = size.replace(/[\s.]+/g, '').toUpperCase();
  return cleaned ? `${cleaned}.` : '';
};

const formatWeight = (weight?: string) => {
  if (!weight) return '';
  let w = weight.replace(/\s+/g, '').toLowerCase();
  if (w.endsWith('gms')) {
    w = w.slice(0, -3) + 'g';
  } else if (!w.endsWith('g')) {
    w += 'g';
  }
  return w;
};

function QuotationDetailModal({ invoice, visible, onClose, onDeleted, onEdit }: { invoice: Quotation | null; visible: boolean; onClose: () => void; onDeleted: () => void; onEdit: (invoice: Quotation) => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuth();

  if (!invoice) return null;

  const handleDelete = async () => {
    try {
      const success = await api.deleteQuotation(invoice._id);
      if (success) {
        onDeleted();
        onClose();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete invoice');
    }
  };

  const isOutstanding = invoice.status !== 'paid';

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Sale Quotation</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          <View style={styles.profileHeader}>
            <View style={styles.profileAvatar}>
              <Ionicons name="receipt" size={36} color={colors.primary} />
            </View>
            <Text style={styles.profileName}>{invoice.quotationNo}</Text>
            <Text style={styles.profileCustomer}>{invoice.customerName}</Text>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: invoice.mode === 'kachha' ? colors.warningLight : colors.successLight }]}>
                <Ionicons name="pricetag" size={16} color={invoice.mode === 'kachha' ? colors.warning : colors.success} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Billing Mode</Text>
                <Text style={[styles.infoValue, { color: invoice.mode === 'kachha' ? colors.warning : colors.success }]}>
                  {invoice.mode === 'kachha' ? 'CASH' : 'INVOICE'}
                </Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.successLight }]}>
                <Ionicons name="cash" size={16} color={colors.success} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Total Amount</Text>
                <Text style={styles.infoValue}>₹{invoice.amount.toLocaleString()}</Text>
              </View>
            </View>

            {invoice.mode === 'pakka' && (
              <>
                <View style={styles.infoItem}>
                  <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
                    <Ionicons name="calculator-outline" size={16} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>GST Breakdown</Text>
                    <Text style={styles.infoValue}>
                      Base: ₹{invoice.baseAmount?.toLocaleString() || '0'} | Rate: {invoice.gstRate || 0}%
                    </Text>
                    {invoice.igst && invoice.igst > 0 ? (
                      <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                        IGST: ₹{invoice.igst.toLocaleString()} (Inter-state)
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                        CGST: ₹{(invoice.cgst || 0).toLocaleString()} | SGST: ₹{(invoice.sgst || 0).toLocaleString()} (Intra-state)
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.infoItem}>
                  <View style={[styles.infoIcon, { backgroundColor: colors.infoLight }]}>
                    <Ionicons name="map-outline" size={16} color={colors.info} />
                  </View>
                  <View>
                    <Text style={styles.infoLabel}>State of Supply & Party GSTIN</Text>
                    <Text style={styles.infoValue}>
                      State: {invoice.stateOfSupply || 'Uttar Pradesh'} | GSTIN: {invoice.gstin || 'None'}
                    </Text>
                  </View>
                </View>
              </>
            )}
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="calendar" size={16} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Quotation Date</Text>
                <Text style={styles.infoValue}>{new Date(invoice.date).toLocaleDateString()} {new Date(invoice.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: isOutstanding ? colors.warningLight : colors.successLight }]}>
                <Ionicons name="shield-checkmark" size={16} color={isOutstanding ? colors.warning : colors.success} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Payment Status</Text>
                <Text style={[styles.infoValue, { color: isOutstanding ? colors.warning : colors.success }]}>
                  {invoice.status.toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: invoice.isFinalized ? colors.successLight : colors.warningLight }]}>
                <Ionicons name={invoice.isFinalized ? "lock-closed" : "document-text"} size={16} color={invoice.isFinalized ? colors.success : colors.warning} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Document Status</Text>
                <Text style={[styles.infoValue, { color: invoice.isFinalized ? colors.success : colors.warning }]}>
                  {invoice.isFinalized ? 'FINALIZED' : 'DRAFT'}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Items Details</Text>
          <View style={styles.itemsCard}>
            {(invoice.items || []).map((it, idx) => {
              const rate = it.rate || 0;
              const packing = it.packing || 1;
              const sub = it.qty * rate * packing;
              return (
                <View key={idx} style={[styles.itemRowDetail, idx < (invoice.items || []).length - 1 && styles.itemRowBorder]}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.itemNameText}>{it.name}</Text>
                    <Text style={styles.itemSubTextDetail}>
                      {it.hsnCode ? `HSN: ${it.hsnCode} | ` : ''}Rate: ₹{rate.toFixed(2)}/pc | Qty: {it.qty} boxes {it.packing !== undefined && it.packing > 1 ? `(${it.packing} pcs/box)` : ''}
                    </Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
                    <Text style={styles.itemQtyText}>₹{sub.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                </View>
              );
            })}
            
            {invoice.mode === 'pakka' && ((invoice.cgst || 0) > 0 || (invoice.sgst || 0) > 0 || (invoice.igst || 0) > 0) ? (
              <View style={{ borderTopWidth: 2, borderTopColor: colors.border, paddingTop: 10, marginTop: 4, gap: 6, paddingBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={[styles.itemNameText, { fontSize: 12, color: colors.text.secondary }]}>Base Amount</Text>
                  <Text style={[styles.itemQtyText, { fontSize: 12, color: colors.text.secondary }]}>
                    ₹{(invoice.baseAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
                {(invoice.cgst || 0) > 0 || (invoice.sgst || 0) > 0 ? (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[styles.itemNameText, { fontSize: 11, color: colors.text.muted }]}>CGST</Text>
                      <Text style={[styles.itemQtyText, { fontSize: 11, color: colors.text.muted }]}>
                        ₹{(invoice.cgst || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[styles.itemNameText, { fontSize: 11, color: colors.text.muted }]}>SGST</Text>
                      <Text style={[styles.itemQtyText, { fontSize: 11, color: colors.text.muted }]}>
                        ₹{(invoice.sgst || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={[styles.itemNameText, { fontSize: 11, color: colors.text.muted }]}>IGST</Text>
                    <Text style={[styles.itemQtyText, { fontSize: 11, color: colors.text.muted }]}>
                      ₹{(invoice.igst || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }}>
                  <Text style={[styles.itemNameText, { fontWeight: '800', fontSize: 14 }]}>Nett Total</Text>
                  <Text style={[styles.itemQtyText, { fontSize: 16, color: colors.success }]}>
                    ₹{(invoice.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={[styles.itemRowDetail, { borderTopWidth: 2, borderTopColor: colors.border, paddingVertical: 14, marginTop: 4 }]}>
                <Text style={[styles.itemNameText, { fontWeight: '800', fontSize: 14 }]}>Grand Total</Text>
                <Text style={[styles.itemQtyText, { fontSize: 16, color: colors.success }]}>
                  ₹{(invoice.amount || invoice.baseAmount || (invoice.items || []).reduce((acc, it) => acc + (it.qty * (it.rate || 0) * (it.packing || 1)), 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            )}
          </View>

          {/* Finalize Button */}
          {!invoice.isFinalized && (
            <TouchableOpacity
              style={[styles.printBtn, { marginTop: 24, backgroundColor: colors.success }]}
              onPress={async () => {
                try {
                  await api.updateQuotation(invoice._id);
                  onDeleted(); // Reload parent
                  onClose();
                } catch (err: any) {
                  alert(err.message || 'Failed to finalize invoice');
                }
              }}
            >
              <Ionicons name="checkmark-done-circle" size={18} color="#fff" />
              <Text style={styles.printBtnText}>Finalize Quotation</Text>
            </TouchableOpacity>
          )}

          {/* Edit Button */}
          {!invoice.isFinalized && (
            <TouchableOpacity
              style={[styles.printBtn, { marginTop: 10, backgroundColor: colors.info }]}
              onPress={() => {
                onClose();
                onEdit(invoice);
              }}
            >
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={styles.printBtnText}>Edit Draft Details</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={[styles.printBtn, { marginTop: 10, backgroundColor: colors.primary }]}
            onPress={() => printQuotation(invoice)}
          >
            <Ionicons name="print-outline" size={18} color="#fff" />
            <Text style={styles.printBtnText}>Print Quotation</Text>
          </TouchableOpacity>
          
          {user?.role === 'admin' && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.deleteBtnText}>Delete Quotation</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function AddQuotationModal({ visible, onClose, onSaved, invoiceToEdit }: { visible: boolean; onClose: () => void; onSaved: () => void; invoiceToEdit?: Quotation | null }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  
  const [quotationNo, setQuotationNo] = useState('');
  const [customerName, setPartyName] = useState('');
  const [partyAddress, setPartyAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [partyCity, setPartyCity] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [showWarehouseDropdown, setShowWarehouseDropdown] = useState(false);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseInventory, setWarehouseInventory] = useState<InventoryEntry[]>([]);
  const [status, setStatus] = useState('draft');
  const [mode, setMode] = useState<'pakka' | 'kachha'>('pakka');
  const [freightAmount, setFreightAmount] = useState('');
  const [customerState, setCustomerState] = useState('Uttar Pradesh');

  // Customer & Product lists for selection
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [activeItemDropdownIdx, setActiveItemDropdownIdx] = useState<number | null>(null);
  const [itemSearchText, setItemSearchText] = useState('');

  const [items, setItems] = useState<ExtendedQuotationItem[]>([{ name: '', qty: 1, boxes: 1, rate: 0, packing: 1, rateText: '', gstRate: 0 }]);

  useEffect(() => {
    if (visible) {
      if (invoiceToEdit) {
        
        setQuotationNo(invoiceToEdit.quotationNo || '');
        setPartyName(invoiceToEdit.customerName || '');
        setPartyAddress(invoiceToEdit.partyAddress || '');
        setShippingAddress(invoiceToEdit.shippingAddress || '');
        setWarehouseId(invoiceToEdit.warehouseId || '');
        setStatus(invoiceToEdit.status || 'draft');
        setMode((invoiceToEdit.mode as "pakka"|"kachha") || "pakka");
        setFreightAmount(invoiceToEdit.freightAmount ? invoiceToEdit.freightAmount.toString() : '');
        setCustomerState(invoiceToEdit.stateOfSupply || 'Uttar Pradesh');
        setItems((invoiceToEdit.items || []).map(it => ({
          productId: it.productId,
          name: it.name,
          qty: it.boxes !== undefined ? it.boxes : it.qty,
          boxes: it.boxes !== undefined ? it.boxes : it.qty,
          rate: it.rate,
          rateText: it.rate.toString(),
          packing: it.packing || 1,
          hsnCode: it.hsnCode || '',
          gstRate: it.gstRate || 0
        })));
      } else {
        
        setQuotationNo('');
        setPartyName('');
        setPartyAddress('');
        setShippingAddress('');
        setPartyCity('');
        setWarehouseId('');
        setShowWarehouseDropdown(false);
        setWarehouses([]);
        setWarehouseInventory([]);
        setStatus('draft');
        setMode('pakka');
        setItems([{ name: '', qty: 1, boxes: 1, rate: 0, packing: 1, rateText: '', gstRate: 0 }]);
        setShowCustomerDropdown(false);
        setActiveItemDropdownIdx(null);
        setItemSearchText('');
        setCustomerState('Uttar Pradesh');
      }

      const loadData = async () => {
        try {
          const [p, c, w] = await Promise.all([
            api.getProducts(),
            api.getCustomers(),
            api.getWarehouses()
          ]);
          setProducts(p);
          setCustomers(c);
          setWarehouses(w);
          if (w.length > 0 && !invoiceToEdit) {
            setWarehouseId(w[0]._id);
          }
        } catch (err) {
          console.log('Failed to fetch initial data in Challan modal:', err);
        }
      };
      loadData();
    }
  }, [visible, invoiceToEdit]);

  // When warehouseId changes, load warehouse inventory and reset items
  useEffect(() => {
    if (warehouseId) {
      const loadWarehouseInventory = async () => {
        try {
          const entries = await api.getInventoryEntries(warehouseId, "", true);
          setWarehouseInventory(entries);
        } catch (err) {
          console.log('Failed to fetch warehouse inventory:', err);
        }
      };
      loadWarehouseInventory();
      if (!invoiceToEdit || invoiceToEdit.warehouseId !== warehouseId) {
        setItems([{ name: '', qty: 1, boxes: 1, rate: 0, packing: 1, rateText: '', gstRate: 0 }]);
      }
    } else {
      setWarehouseInventory([]);
    }
  }, [warehouseId]);

  const filteredCustomers = (customerName
    ? customers.filter(c =>
        (c.company || c.name || '').toLowerCase().includes(customerName.toLowerCase()) ||
        (c.contactPerson || '').toLowerCase().includes(customerName.toLowerCase())
      )
    : customers).filter(c => c.gstin && c.gstin.trim() !== '');

  const handleSelectCustomer = (c: Customer) => {
    const finalName = c.company || c.name;
    setPartyName(finalName);
    const hasGstin = !!(c.gstin && c.gstin.trim());
    setMode(hasGstin ? 'pakka' : 'kachha');
    setCustomerState(c.state || 'Uttar Pradesh');
    // Auto-fill billing address
    const addr = c.billingAddress;
    setPartyAddress(addr ? [addr.street, addr.city, addr.state, addr.pin].filter(Boolean).join(', ') : '');
    const sAddr = c.shippingAddress;
    setShippingAddress(sAddr && !c.shippingSameAsBilling ? [sAddr.street, sAddr.city, sAddr.state, sAddr.pin].filter(Boolean).join(', ') : (addr ? [addr.street, addr.city, addr.state, addr.pin].filter(Boolean).join(', ') : ''));
    setPartyCity(addr ? [addr.city, addr.state].filter(Boolean).join(', ') : (c.state || ''));
    setShowCustomerDropdown(false);
  };

  const handleItemNameChange = (idx: number, text: string) => {
    const next = [...items];
    next[idx].name = text;
    setItems(next);
    setItemSearchText(text);
    setActiveItemDropdownIdx(idx);
  };

  const handleItemFocus = (idx: number) => {
    setActiveItemDropdownIdx(idx);
    setItemSearchText(items[idx].name);
  };

  const getInventoryEntryDisplayName = (entry: InventoryEntry) => {
    const product = products.find(p => p._id === entry.productId);
    const parts = [
      formatSize(entry.size),
      toTitleCase(entry.shape),
      toTitleCase(entry.colour),
      formatWeight(entry.weight)
    ];
    const combined = parts.filter(Boolean).join(' ');
    if (combined) {
      return combined;
    }
    return product ? product.name : entry.productType || 'Unnamed Product';
  };

  const getFilteredInventoryEntries = (search: string) => {
    const s = search ? search.toLowerCase() : '';
    
    // Combine actual inventory entries with dummy zero-stock entries for unstocked products
    const allDropdownItems: any[] = [...warehouseInventory];
    
    // Add dummy entries for products that have NO inventory entries at all
    products.forEach(p => {
      const hasEntry = warehouseInventory.some(e => e.productId === p._id);
      if (!hasEntry) {
        allDropdownItems.push({
          _id: p._id,
          productId: p._id,
          productType: p.productType || '',
          size: p.size || '',
          colour: p.colour || '',
          shape: p.shape || '',
          weight: p.weight || '',
          hsnCode: p.hsnCode || '',
          vendorId: '',
          vendorName: '',
          qtyBoxes: 0,
          packing: 1,
          warehouseId: warehouseId,
          warehouseName: ''
        });
      }
    });

    if (!s) return allDropdownItems;

    return allDropdownItems.filter(entry => {
      const displayName = getInventoryEntryDisplayName(entry).toLowerCase();
      const colour = (entry.colour || '').toLowerCase();
      const shape = (entry.shape || '').toLowerCase();
      return displayName.includes(s) || colour.includes(s) || shape.includes(s);
    });
  };

  const handleSelectInventoryEntry = (idx: number, entry: InventoryEntry) => {
    const next = [...items];
    const product = products.find(p => p._id === entry.productId);
    const price = product ? product.price : 0;
    const gst = product ? (product.gstRate || FIRM_DETAILS.defaultGstRate) : FIRM_DETAILS.defaultGstRate;
    const hsn = product ? (product.hsnCode || '') : '';

    next[idx] = {
      productId: entry.productId,
      name: getInventoryEntryDisplayName(entry),
      qty: 1,
      boxes: 1,
      rate: price,
      rateText: price.toString(),
      packing: entry.packing || 1,
      gstRate: gst,
      hsnCode: hsn,
      maxQty: entry.qtyBoxes
    };
    setItems(next);
    setActiveItemDropdownIdx(null);
  };

  const handleSave = async () => {
    const validItems = items.filter(it => it.name.trim() !== '' && it.productId);
    if (!customerName.trim() || validItems.length === 0 || !warehouseId) {
      alert('Please fill party name, select a source warehouse, and add at least one product.');
      return;
    }

    // No GSTIN required for quotation

    // Quotations do not check stock levels

    // Strip maxQty before saving
    const finalItems = validItems.map(({ maxQty, ...rest }) => rest);

    try {
      const selectedWarehouse = warehouses.find(w => w._id === warehouseId);
      const targetCust = customers.find(c => (c.company || c.name) === customerName.trim());
      const finalGstin = targetCust?.gstin || '';

      const invoiceData: Partial<Quotation> = {
        quotationNo: quotationNo.trim() || undefined,
        customerName: customerName.trim() || 'Walk-in Customer',
        partyAddress: partyAddress.trim(),
        shippingAddress: shippingAddress.trim(),
        stateOfSupply: customerState.trim() || 'Uttar Pradesh',
        gstin: finalGstin,
        warehouseId,
        warehouseName: selectedWarehouse ? selectedWarehouse.name : '',
        status,
        items: finalItems as QuotationItem[],
        mode,
        baseAmount: totalBase,
        cgst,
        sgst,
        igst,
        roundOff,
        freightAmount: parseFloat(freightAmount) || 0,
        amount: nettTotal
      };

      if (invoiceToEdit) {
        await api.updateQuotation(invoiceToEdit._id, invoiceData);
      } else {
        await api.createQuotation(invoiceData);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to create sale invoice');
    }
  };

  const addItemRow = () => setItems([{ name: '', qty: 1, boxes: 1, rate: 0, packing: 1, rateText: '', gstRate: 0 }, ...items]);
  const removeItemRow = (idx: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== idx));
    }
    if (activeItemDropdownIdx === idx) {
      setActiveItemDropdownIdx(null);
    }
  };

  const stateCheck = (customerState || 'Uttar Pradesh').trim().toLowerCase();
  const isIntraState = stateCheck === 'uttar pradesh' || stateCheck === 'up';

  let totalBase = 0;
  let totalTax = 0;
  items.forEach(it => {
    if (it.name.trim() !== '' && it.productId) {
      const itemBase = it.qty * (it.rate || 0) * (it.packing || 1);
      totalBase += itemBase;
      const gst = it.gstRate || 0;
      if (mode === 'pakka') {
        const itemTax = (itemBase * gst) / 100;
        totalTax += itemTax;
      }
    }
  });

  const freightVal = parseFloat(freightAmount) || 0;
  if (freightVal > 0) {
    totalBase += freightVal;
    if (mode === 'pakka') {
      totalTax += (freightVal * 18) / 100;
    }
  }

  const cgst = mode === 'pakka' && isIntraState ? totalTax / 2 : 0;
  const sgst = mode === 'pakka' && isIntraState ? totalTax / 2 : 0;
  const igst = mode === 'pakka' && !isIntraState ? totalTax : 0;
  const rawTotal = totalBase + cgst + sgst + igst;
  const nettTotal = Math.round(rawTotal);
  const roundOff = nettTotal - rawTotal;

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>

        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{invoiceToEdit ? 'Edit Sale Quotation' : 'New Sale Quotation'}</Text>
          <TouchableOpacity onPress={handleSave}>
            <Ionicons name="checkmark-circle" size={26} color={colors.success} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }} keyboardShouldPersistTaps="handled">
          {(showWarehouseDropdown || showCustomerDropdown || activeItemDropdownIdx !== null) && (
            <Pressable
              style={[
                StyleSheet.absoluteFill,
                { zIndex: showWarehouseDropdown ? 1019 : (showCustomerDropdown ? 1009 : 999) }
              ]}
              onPress={() => {
                setShowWarehouseDropdown(false);
                setShowCustomerDropdown(false);
                setActiveItemDropdownIdx(null);
              }}
            />
          )}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Quotation Number</Text>
            <View style={[styles.formInput, { backgroundColor: colors.bg.secondary, borderColor: colors.border }]}>
              <Ionicons name="barcode-outline" size={16} color={colors.text.muted} />
              <TextInput style={[styles.formInputText, { color: colors.text.muted }]} value={invoiceToEdit ? quotationNo : "Auto-generated on Save"} editable={false} />
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>Status</Text>
              <View style={styles.formInput}>
                <Ionicons name="information-circle" size={18} color={colors.text.muted} />
                <TextInput
                  style={styles.formInputText}
                  value={status}
                  editable={false}
                />
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>Freight (₹)</Text>
              <View style={styles.formInput}>
                <Ionicons name="cube" size={18} color={colors.text.muted} />
                <TextInput
                  style={styles.formInputText}
                  placeholder="0.00"
                  placeholderTextColor={colors.text.muted}
                  value={freightAmount}
                  onChangeText={setFreightAmount}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>

          {/* Source Warehouse Selection */}
          <View style={[styles.formGroup, { zIndex: 1020 }]}>
            <Text style={styles.formLabel}>Source Warehouse *</Text>
            <View style={styles.customSearchSelectContainer}>
              <TouchableOpacity
                style={styles.formInput}
                onPress={() => setShowWarehouseDropdown(!showWarehouseDropdown)}
              >
                <Ionicons name="business-outline" size={16} color={colors.text.muted} />
                <Text style={[styles.formInputText, { paddingVertical: 12, lineHeight: 20 }]}>
                  {warehouses.find(w => w._id === warehouseId)?.name || 'Select Source Warehouse...'}
                </Text>
                <Ionicons name={showWarehouseDropdown ? "chevron-up" : "chevron-down"} size={16} color={colors.text.muted} />
              </TouchableOpacity>

              {showWarehouseDropdown && (
                <View style={styles.customSelectPanel}>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                    {warehouses.map(w => (
                      <TouchableOpacity
                        key={w._id}
                        style={styles.customSelectItem}
                        onPress={() => {
                          setWarehouseId(w._id);
                          setShowWarehouseDropdown(false);
                        }}
                      >
                        <Text style={styles.customSelectItemText}>{w.name}</Text>
                        <Text style={styles.customSelectItemSubtext}>{w.city}, {w.state}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>

          {/* Party Name Customer Search Input Selector */}
          <View style={[styles.formGroup, { zIndex: 1010 }]}>
            <Text style={styles.formLabel}>Party Name (Customer/Vendor) *</Text>
            <View style={styles.customSearchSelectContainer}>
              <View style={styles.formInput}>
                <Ionicons name="person-outline" size={16} color={colors.text.muted} />
                <TextInput
                  style={styles.formInputText}
                  placeholder="Search and select customer..."
                  placeholderTextColor={colors.text.muted}
                  value={customerName}
                  onChangeText={(val) => {
                    setPartyName(val);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                />
                {customerName ? (
                  <TouchableOpacity onPress={() => { setPartyName(''); setShowCustomerDropdown(true); }}>
                    <Ionicons name="close-circle" size={18} color={colors.text.muted} style={{ paddingLeft: 6 }} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {showCustomerDropdown && (
              <View style={styles.customSelectPanel}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                  {filteredCustomers.map(c => {
                    const cName = c.company || c.name;
                    return (
                      <TouchableOpacity
                        key={c._id}
                        style={styles.customSelectItem}
                        onPress={() => handleSelectCustomer(c)}
                      >
                        <Text style={styles.customSelectItemText}>{cName}</Text>
                        <Text style={styles.customSelectItemSubtext}>
                          {c.gstin ? `GSTIN: ${c.gstin}` : 'Cash / Unregistered'}
                          {c.phone ? ` | Phone: ${c.phone}` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  {filteredCustomers.length === 0 && (
                    <View style={{ padding: 12 }}>
                      <Text style={{ fontSize: 12, color: colors.text.muted, textAlign: 'center' }}>
                        No customers found (typing custom name)
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.customSelectItem, { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg.secondary }]}
                    onPress={() => setShowCustomerDropdown(false)}
                  >
                    <Text style={[styles.customSelectItemText, { color: colors.primary, textAlign: 'center' }]}>
                      ✓ Use typed custom name
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            )}
          </View>

          {/* Billing Address Input */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Billing Address (Party Address)</Text>
            <View style={styles.formInput}>
              <Ionicons name="location-outline" size={16} color={colors.text.muted} />
              <TextInput
                style={styles.formInputText}
                placeholder="Enter billing address..."
                placeholderTextColor={colors.text.muted}
                value={partyAddress}
                onChangeText={setPartyAddress}
                multiline
              />
            </View>
          </View>

          {/* Shipping Address Input */}
          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Shipping Address</Text>
            <View style={styles.formInput}>
              <Ionicons name="bus-outline" size={16} color={colors.text.muted} />
              <TextInput
                style={styles.formInputText}
                placeholder="Enter shipping address..."
                placeholderTextColor={colors.text.muted}
                value={shippingAddress}
                onChangeText={setShippingAddress}
                multiline
              />
            </View>
          </View>



          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>Quotation Items</Text>
            <TouchableOpacity style={styles.addItemRowBtn} onPress={addItemRow}>
              <Ionicons name="add" size={14} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>Add Item</Text>
            </TouchableOpacity>
          </View>

          {items.map((it, idx) => {
            const subtotal = it.qty * (it.rate || 0) * (it.packing || 1);
            const isDropdownOpen = activeItemDropdownIdx === idx;
            const filtered = getFilteredInventoryEntries(isDropdownOpen ? itemSearchText : '');

            // Check stock limits
            const matchedEntry = warehouseInventory.find(e => 
              e.productId === it.productId &&
              (e.packing || 1) === (it.packing || 1)
            );
            const maxQty = matchedEntry ? matchedEntry.qtyBoxes : 0;
            const hasError = !!(it.productId && it.qty > maxQty);

            return (
              <View key={idx} style={[styles.itemCardForm, { zIndex: isDropdownOpen ? 1000 : 100 - idx, position: 'relative' }]}>
                {/* Row Header/Top line: Product Selection */}
                <View style={{ position: 'relative', zIndex: isDropdownOpen ? 10 : 1 }}>
                  <Text style={styles.itemSublabel}>Select Product (From Warehouse Stock) *</Text>
                  <View style={styles.formInput}>
                    <Ionicons name="cube-outline" size={14} color={colors.text.muted} />
                    <TextInput
                      style={styles.formInputText}
                      placeholder="Type to search product stock..."
                      placeholderTextColor={colors.text.muted}
                      value={it.name}
                      onChangeText={(v) => handleItemNameChange(idx, v)}
                      onFocus={() => handleItemFocus(idx)}
                    />
                    {it.name ? (
                      <TouchableOpacity onPress={() => {
                        const next = [...items];
                        next[idx] = { name: '', qty: 1, boxes: 1, rate: 0, packing: 1, rateText: '', gstRate: 0 };
                        setItems(next);
                        setItemSearchText('');
                        setActiveItemDropdownIdx(idx);
                      }}>
                        <Ionicons name="close-circle" size={16} color={colors.text.muted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {isDropdownOpen && (
                    <View style={styles.customSelectPanel}>
                      <ScrollView nestedScrollEnabled style={{ maxHeight: 150 }} keyboardShouldPersistTaps="handled">
                        {filtered.map(entry => (
                          <TouchableOpacity
                            key={entry._id}
                            style={styles.customSelectItem}
                            onPress={() => handleSelectInventoryEntry(idx, entry)}
                          >
                            <Text style={styles.customSelectItemText}>{getInventoryEntryDisplayName(entry)}</Text>
                            <Text style={styles.customSelectItemSubtext}>
                              Packing: {entry.packing} | Vendor: {entry.vendorName} | Available: {entry.qtyBoxes} boxes
                            </Text>
                          </TouchableOpacity>
                        ))}
                        {filtered.length === 0 && (
                          <View style={{ padding: 12 }}>
                            <Text style={{ fontSize: 12, color: colors.text.muted, textAlign: 'center' }}>No available stock entries in this warehouse</Text>
                          </View>
                        )}
                        <TouchableOpacity
                          style={[styles.customSelectItem, { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg.secondary }]}
                          onPress={() => setActiveItemDropdownIdx(null)}
                        >
                          <Text style={[styles.customSelectItemText, { color: colors.primary, textAlign: 'center' }]}>
                            ✓ Close list
                          </Text>
                        </TouchableOpacity>
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* Bottom line: Qty, Rate, Subtotal, Remove */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, alignItems: 'center' }}>
                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.itemSublabel}>Boxes</Text>
                    <TextInput
                      style={[styles.itemInput, hasError && { borderColor: colors.danger, borderWidth: 1 }]}
                      placeholder="Qty"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="numeric"
                      value={it.qty.toString()}
                      onChangeText={(v) => {
                        const next = [...items];
                        next[idx].qty = parseInt(v) || 0;
                        setItems(next);
                      }}
                    />
                  </View>

                  <View style={{ flex: 1.5 }}>
                    <Text style={styles.itemSublabel}>Rate (₹)</Text>
                    <TextInput
                      style={styles.itemInput}
                      placeholder="Rate"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="numeric"
                      value={it.rateText !== undefined ? it.rateText : (it.rate || 0).toString()}
                      onChangeText={(v) => {
                        const next = [...items];
                        next[idx].rateText = v;
                        next[idx].rate = parseFloat(v) || 0;
                        setItems(next);
                      }}
                    />
                  </View>

                  <View style={{ flex: 2, alignItems: 'flex-end', justifyContent: 'center', minHeight: 40, marginTop: 12 }}>
                    <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: '600' }}>Amount</Text>
                    <Text style={{ fontSize: 13, color: colors.success, fontWeight: '800' }}>
                      ₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>

                  {items.length > 1 && (
                    <TouchableOpacity style={[styles.itemRemoveBtn, { marginTop: 14 }]} onPress={() => removeItemRow(idx)}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>

                {it.productId ? (
                  <Text style={{ fontSize: 10, color: hasError ? colors.danger : colors.text.muted, marginTop: 4, fontWeight: '600' }}>
                    {hasError ? `Error: Exceeds stock limit of ${maxQty} boxes` : `Available stock: ${maxQty} boxes (Packing: ${it.packing || 1})`}
                  </Text>
                ) : null}
              </View>
            );
          })}

          {mode === 'pakka' ? (
            <View style={[styles.grandTotalContainer, { flexDirection: 'column', alignItems: 'stretch', gap: 6 }]}>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>Total Base Value:</Text>
                <Text style={styles.previewValue}>₹{totalBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </View>
              {freightVal > 0 && (
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Freight Added:</Text>
                  <Text style={styles.previewValue}>₹{freightVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                </View>
              )}
              {isIntraState ? (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={[styles.grandTotalLabel, { fontSize: 12, fontWeight: '500', color: colors.text.muted }]}>CGST:</Text>
                    <Text style={[styles.grandTotalValue, { fontSize: 12, fontWeight: '500', color: colors.text.muted }]}>₹{cgst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={[styles.grandTotalLabel, { fontSize: 12, fontWeight: '500', color: colors.text.muted }]}>SGST:</Text>
                    <Text style={[styles.grandTotalValue, { fontSize: 12, fontWeight: '500', color: colors.text.muted }]}>₹{sgst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={[styles.grandTotalLabel, { fontSize: 12, fontWeight: '500', color: colors.text.muted }]}>IGST:</Text>
                  <Text style={[styles.grandTotalValue, { fontSize: 12, fontWeight: '500', color: colors.text.muted }]}>₹{igst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                </View>
              )}
              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.grandTotalLabel}>Nett Total:</Text>
                <Text style={styles.grandTotalValue}>₹{nettTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.grandTotalContainer}>
              <Text style={styles.grandTotalLabel}>Grand Total:</Text>
              <Text style={styles.grandTotalValue}>₹{totalBase.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function QuotationsScreen() {
  const [invoices, setQuotations] = useState<Quotation[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInv, setSelectedInv] = useState<Quotation | null>(null);
  const [invoiceToEdit, setQuotationToEdit] = useState<Quotation | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [modeFilter, setModeFilter] = useState<'all' | 'pakka' | 'kachha'>('all');

  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const load = useCallback(async () => {
    const res = await api.getQuotations(search, modeFilter);
    setQuotations(res);
  }, [search, modeFilter]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.screen}>
      <View style={styles.innerContainer}>
        <View style={{ zIndex: 1100, position: 'relative' }}>
          <View style={[styles.searchBar, { paddingRight: 8, paddingLeft: 12 }]}>
            <Ionicons name="search" size={18} color={colors.text.muted} />
            <TextInput
              style={[styles.searchInput, { minWidth: 100 }]}
              placeholder="Search sale invoices..."
              placeholderTextColor={colors.text.muted}
              value={search}
              onChangeText={setSearch}
            />
            <TouchableOpacity style={styles.addBtn} onPress={() => { setQuotationToEdit(null); setAddVisible(true); }}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>



      <ScrollView style={{ flex: 1 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: Spacing.lg }}>
          <View style={styles.table}>
            {/* Table Header Row */}
            <View style={styles.tableHeaderRow}>
              <View style={[styles.tableHeaderCellContainer, { width: 130 }]}><Text style={styles.tableHeaderCell}>Quotation No</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 160 }]}><Text style={styles.tableHeaderCell}>Customer Name</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 120 }]}><Text style={styles.tableHeaderCell}>Date</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 110 }]}><Text style={styles.tableHeaderCell}>Amount</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 120 }]}><Text style={styles.tableHeaderCell}>Doc Status</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 120 }]}><Text style={styles.tableHeaderCell}>Status</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 100 }]}><Text style={styles.tableHeaderCell}>Mode</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 80, borderRightWidth: 0 }]}><Text style={[styles.tableHeaderCell, { textAlign: 'center' }]}>Action</Text></View>
            </View>

            {/* Table Body Rows */}
            {invoices.map((item) => (
              <View key={item._id} style={styles.tableBodyRow}>
                <View style={[styles.tableCellContainer, { width: 130 }]}>
                  <Text style={[styles.tableCell, { fontWeight: '700' }]}>{item.quotationNo}</Text>
                </View>
                <View style={[styles.tableCellContainer, { width: 160 }]}>
                  <Text style={styles.tableCell} numberOfLines={1}>{item.customerName || 'N/A'}</Text>
                </View>
                <View style={[styles.tableCellContainer, { width: 120 }]}>
                  <Text style={styles.tableCell}>{new Date(item.date).toLocaleDateString('en-IN')}</Text>
                </View>
                <View style={[styles.tableCellContainer, { width: 110 }]}>
                  <Text style={[styles.tableCell, { fontWeight: '800' }]}>₹{item.amount.toLocaleString()}</Text>
                </View>
                <View style={[styles.tableCellContainer, { width: 120 }]}>
                  <View style={[styles.statusBadge, {
                    borderColor: item.isFinalized ? colors.success : colors.warning,
                    backgroundColor: (item.isFinalized ? colors.success : colors.warning) + '12'
                  }]}>
                    <Text style={[styles.statusText, {
                      color: item.isFinalized ? colors.success : colors.warning
                    }]}>{item.isFinalized ? 'FINALIZED' : 'DRAFT'}</Text>
                  </View>
                </View>
                <View style={[styles.tableCellContainer, { width: 120 }]}>
                  <View style={[styles.statusBadge, {
                    borderColor: item.status === 'paid' ? colors.success : item.status === 'partially paid' ? colors.info : colors.warning,
                    backgroundColor: (item.status === 'paid' ? colors.success : item.status === 'partially paid' ? colors.info : colors.warning) + '12'
                  }]}>
                    <Text style={[styles.statusText, {
                      color: item.status === 'paid' ? colors.success : item.status === 'partially paid' ? colors.info : colors.warning
                    }]}>{item.status.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={[styles.tableCellContainer, { width: 100 }]}>
                  <View style={[styles.modeBadge, {
                    borderColor: item.mode === 'pakka' ? colors.success : colors.warning,
                    backgroundColor: (item.mode === 'pakka' ? colors.success : colors.warning) + '12'
                  }]}>
                    <Text style={[styles.modeText, {
                      color: item.mode === 'pakka' ? colors.success : colors.warning
                    }]}>{item.mode === 'pakka' ? 'INVOICE' : 'CASH'}</Text>
                  </View>
                </View>
                <View style={[styles.tableCellContainer, { width: 80, borderRightWidth: 0, alignItems: 'center', justifyContent: 'center' }]}>
                  <TouchableOpacity style={styles.actionIconButton} onPress={() => { setSelectedInv(item); setDetailVisible(true); }}>
                    <Ionicons name="eye" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {invoices.length === 0 && (
              <View style={styles.emptyTableContainer}>
                <Ionicons name="folder-open-outline" size={28} color={colors.text.muted} />
                <Text style={styles.emptyText}>No invoices found</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </ScrollView>
      </View>

      <QuotationDetailModal
        invoice={selectedInv}
        visible={detailVisible}
        onClose={() => { setDetailVisible(false); load(); }}
        onDeleted={load}
        onEdit={(inv) => {
          setQuotationToEdit(inv);
          setAddVisible(true);
        }}
      />
      <AddQuotationModal
        visible={addVisible}
        onClose={() => {
          setAddVisible(false);
          setQuotationToEdit(null);
        }}
        onSaved={() => {
          load();
          setDetailVisible(false);
        }}
        invoiceToEdit={invoiceToEdit}
      />
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  innerContainer: { flex: 1, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, margin: Spacing.lg, paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, gap: 10 },
  searchInput: { flex: 1, height: 46, color: colors.text.primary, fontSize: 14 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.text.muted, textAlign: 'center', marginTop: 40, fontSize: 13 },

  table: { flex: 1, backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start', marginVertical: Spacing.md, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  tableHeaderCell: { fontSize: 11, fontWeight: '800', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableHeaderCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  tableBodyRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tableCell: { fontSize: 13, color: colors.text.primary },
  tableCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  primaryText: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  secondaryText: { fontSize: 10, color: colors.text.muted, marginTop: 1 },
  outstandingText: { fontSize: 13, fontWeight: '800' },
  actionIconButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  emptyTableContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontWeight: '800' },

  modalContainer: { flex: 1, backgroundColor: colors.bg.primary, width: '100%', maxWidth: 650, alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text.primary },
  profileHeader: { alignItems: 'center', marginBottom: 20, marginTop: 10 },
  profileAvatar: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  profileName: { fontSize: 22, fontWeight: '800', color: colors.text.primary },
  profileCustomer: { fontSize: 14, color: colors.text.secondary },
  infoGrid: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg, gap: 16 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11, color: colors.text.muted, fontWeight: '600' },
  infoValue: { fontSize: 14, color: colors.text.primary, fontWeight: '500' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.danger, borderRadius: Radius.md, paddingVertical: 12, marginTop: 24, marginBottom: 16 },
  deleteBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 12, fontWeight: '700', color: colors.text.secondary, marginBottom: 6 },
  formInput: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
  formInputText: { flex: 1, height: 46, color: colors.text.primary, fontSize: 14 },
  statusSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  statusBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
  statusBtnText: { fontSize: 11, fontWeight: '700', color: colors.text.secondary },

  modeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start' },
  modeText: { fontSize: 8, fontWeight: '800' },
  modeSelector: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 16 },
  modeBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },



  gstCalculationPreview: { marginTop: 16, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.secondary },
  previewTitle: { fontSize: 12, fontWeight: '700', color: colors.text.primary, marginBottom: 8 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  previewLabel: { fontSize: 12, color: colors.text.secondary },
  previewValue: { fontSize: 12, fontWeight: '600', color: colors.text.primary },
  previewDivider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  
  // Missing from earlier migration
  customSearchSelectContainer: { position: 'relative', width: '100%' },
  customSelectPanel: { position: 'absolute', top: 50, left: 0, right: 0, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, zIndex: 2000, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4 },
  customSelectItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  customSelectItemText: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  customSelectItemSubtext: { fontSize: 10, color: colors.text.muted, marginTop: 2 },
  itemCardForm: { backgroundColor: colors.bg.secondary, padding: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  itemSublabel: { fontSize: 10, fontWeight: '700', color: colors.text.secondary, marginBottom: 4 },
  grandTotalContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg.secondary, padding: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, marginVertical: 12 },
  grandTotalLabel: { fontSize: 14, fontWeight: '800', color: colors.text.primary },
  grandTotalValue: { fontSize: 16, fontWeight: '800', color: colors.success },
  itemRowDetail: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, alignItems: 'center' },
  itemSubTextDetail: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
  
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text.primary, marginBottom: 8 },
  itemsCard: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: Spacing.lg },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  itemNameText: { fontSize: 13, color: colors.text.primary, fontWeight: '500' },
  itemQtyText: { fontSize: 13, color: colors.primary, fontWeight: '700' },
  printBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563eb', borderRadius: Radius.md, paddingVertical: 13, marginTop: 24, marginBottom: 8 },
  printBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: colors.primary + '40', backgroundColor: colors.primary + '10' },
  actionBtnText: { fontSize: 11, fontWeight: '700' },
  addItemRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.primary + '30', backgroundColor: colors.primary + '08' },
  itemInput: { backgroundColor: colors.bg.card, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 40, color: colors.text.primary, fontSize: 13 },
  itemRemoveBtn: { width: 40, height: 40, borderRadius: 6, borderWidth: 1, borderColor: colors.danger + '30', backgroundColor: colors.danger + '08', alignItems: 'center', justifyContent: 'center' }
});
