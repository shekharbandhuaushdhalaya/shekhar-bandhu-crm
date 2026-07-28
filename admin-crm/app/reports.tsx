import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  useWindowDimensions, Pressable, TouchableOpacity, Platform,
  TextInput, Alert, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api, Invoice, ManufacturingAnalytics, RawMaterial, RawMaterialEntry } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';
import { useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { FIRM_DETAILS } from '../constants/firm';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import GstReturnsPage from './gst-returns';
import UnauthorizedScreen from '../components/UnauthorizedScreen';

const isIntegerQty = (unit?: string, category?: string) => {
  const u = (unit || '').toLowerCase().trim();
  const c = (category || '').toLowerCase().trim();
  return u === 'pcs' && (c === 'packing' || c === 'packaging');
};

type ReportTab = 'accounting' | 'gst' | 'aging' | 'manufacturing' | 'rawmaterials';

export default function ReportsScreen() {
  const { user } = useAuth();
  const perm = usePermission();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [activeTab, setActiveTab] = useState<ReportTab>('accounting');
  const [refreshing, setRefreshing] = useState(false);

  // --- AI Analytics ---
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<any>(null);

  const handleAskAi = async () => {
    if (!aiPrompt.trim()) return;
    try {
      setAiLoading(true);
      const res = await api.askAiAnalytics(aiPrompt.trim());
      setAiResponse(res);
    } catch (err: any) {
      console.error('AI Analytics Error:', err);
      setAiResponse({ answer: err.message || 'Failed to get response from AI Analytics.' });
    } finally {
      setAiLoading(false);
    }
  };

  // --- Accounting / GST / Aging data ---
  const [saleInvs, setSaleInvs] = useState<Invoice[]>([]);
  const [purchInvs, setPurchInvs] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [gstCollected, setGstCollected] = useState(0);
  const [gstPaid, setGstPaid] = useState(0);

  // --- Monthly report controls ---
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportType, setReportType] = useState<'sale' | 'purchase'>('sale');
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [showReportTypeDropdown, setShowReportTypeDropdown] = useState(false);

  // --- Manufacturing Analytics data ---
  const [mfgAnalytics, setMfgAnalytics] = useState<ManufacturingAnalytics | null>(null);

  // --- Raw Materials data ---
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [rawEntries, setRawEntries] = useState<RawMaterialEntry[]>([]);
  const [expiryAlerts, setExpiryAlerts] = useState<RawMaterialEntry[]>([]);
  const [rmSearchText, setRmSearchText] = useState('');
  const [rmViewMode, setRmViewMode] = useState<'summary' | 'batches'>('summary');

  const load = useCallback(async () => {
    const [custs, sInvs, pInvs, mfg, rms, rme, expiry] = await Promise.all([
      api.getCustomers(),
      api.getSaleInvoices('', 'all'),
      api.getPurchaseInvoices('', 'all'),
      api.getManufacturingAnalytics().catch(() => null),
      api.getRawMaterials(),
      api.getRawMaterialEntries(),
      api.getRawMaterialExpiryAlerts(),
    ]);

    const gstCol = sInvs.reduce((sum, i) => {
      if (i.mode === 'regular' || (i.mode as any) === 'pakka') return sum + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0);
      return sum;
    }, 0);
    const gstPd = pInvs.reduce((sum, i) => {
      if (i.mode === 'regular' || (i.mode as any) === 'pakka') return sum + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0);
      return sum;
    }, 0);

    setCustomers(custs);
    setSaleInvs(sInvs);
    setPurchInvs(pInvs);
    setGstCollected(gstCol);
    setGstPaid(gstPd);
    setMfgAnalytics(mfg);
    setRawMaterials(rms);
    setRawEntries(rme);
    setExpiryAlerts(expiry);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    api.clearCache();
    await load();
    setRefreshing(false);
  }, [load]);

  // ---- Aging Calculations ----
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const agingData = { notDue: 0, days0_30: 0, days31_60: 0, days61_90: 0, days90Plus: 0, totalOverdue: 0 };

  saleInvs.forEach(inv => {
    if (inv.isFinalized && inv.status !== 'paid') {
      let due = inv.dueDate ? new Date(inv.dueDate) : null;
      if (!due) {
        const cust = customers.find(c => (c.company || c.name) === inv.customerName);
        const termsStr = cust?.paymentTerms || 'Net 30';
        const match = termsStr.match(/\d+/);
        const termDays = match ? parseInt(match[0], 10) : 30;
        due = new Date(new Date(inv.date).getTime() + termDays * 24 * 60 * 60 * 1000);
      }
      due.setHours(0, 0, 0, 0);
      const bal = inv.amount;
      if (today.getTime() <= due.getTime()) {
        agingData.notDue += bal;
      } else {
        agingData.totalOverdue += bal;
        const diffDays = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 30) agingData.days0_30 += bal;
        else if (diffDays <= 60) agingData.days31_60 += bal;
        else if (diffDays <= 90) agingData.days61_90 += bal;
        else agingData.days90Plus += bal;
      }
    }
  });

  // ---- Print Report ----
  const handlePrintReport = async () => {
    const invs = reportType === 'sale' ? saleInvs : purchInvs;
    const filtered = invs.filter(i => {
      if (!i.date) return false;
      const d = new Date(i.date);
      return d.getMonth() === reportMonth && d.getFullYear() === reportYear && (i.mode === 'regular' || (i.mode as any) === 'pakka');
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const hsnSet = new Set<string>();
    filtered.forEach(i => {
      if (i.hsnCode) hsnSet.add(i.hsnCode);
      if (i.items) {
        i.items.forEach(item => {
          const itemHsn = item.hsnCode || i.hsnCode || 'N/A';
          hsnSet.add(itemHsn);
        });
      }
    });
    const sortedHsns = Array.from(hsnSet).filter(Boolean).sort();
    const distinctHsnCodes = sortedHsns.join(', ') || 'N/A';

    let htmlRows = '';
    let totPcs = 0, totTaxable = 0, totCgst = 0, totSgst = 0, totIgst = 0, totRoundOff = 0, totGrand = 0;
    let totVFr = 0, totVCa = 0, totIntFr = 0;
    const totHsnMap: Record<string, number> = {};

    filtered.forEach((i, idx) => {
      let tPcs = 0;
      const hsnQtyMap: Record<string, number> = {};
      (i.items || []).forEach(item => {
        let b = 0;
        if (reportType === 'sale') {
          b = Number(item.qty || 0);
        } else {
          b = Number(item.boxes || item.qtyBoxes || item.qty || 0);
        }
        const p = Number(item.packing || 1);
        const pcs = b * p;
        const itemHsn = item.hsnCode || i.hsnCode || 'N/A';
        hsnQtyMap[itemHsn] = (hsnQtyMap[itemHsn] || 0) + pcs;
        tPcs += pcs;
      });

      const taxable = Number(i.baseAmount || i.subTotal || 0);
      const c = Number(i.cgst || 0);
      const s = Number(i.sgst || 0);
      const ig = Number(i.igst || 0);
      const r = Number(i.roundOff || 0);
      const grand = Number(i.amount || i.grandTotal || 0);

      totPcs += tPcs; totTaxable += taxable; totCgst += c; totSgst += s;
      totIgst += ig; totRoundOff += r; totGrand += grand;

      const dateStr = new Date(i.date).toLocaleDateString('en-IN');
      const party = reportType === 'sale' ? i.customerName : (i.supplierName || i.vendorName);

      let extraColsHtml = '';
      if (reportType === 'purchase') {
        const vFr = Number(i.freightAmount || 0);
        const vCa = Number(i.cartageAmount || 0);
        const intFr = Number(i.internalFreightExpense || 0);
        totVFr += vFr; totVCa += vCa; totIntFr += intFr;
        extraColsHtml = `
          <td class="right">${vFr > 0 ? vFr.toFixed(2) : '-'}</td>
          <td class="right">${vCa > 0 ? vCa.toFixed(2) : '-'}</td>
          <td>${i.transport || '-'}</td>
          <td>${i.vehicleNo || '-'}</td>
          <td>${i.ewayBillNo || '-'}</td>
          <td class="right">${intFr > 0 ? intFr.toFixed(2) : '-'}</td>
        `;
      }

      let hsnColsHtml = '';
      sortedHsns.forEach(hsn => {
        const q = hsnQtyMap[hsn] || 0;
        totHsnMap[hsn] = (totHsnMap[hsn] || 0) + q;
        hsnColsHtml += `<td class="right">${q > 0 ? q : '-'}</td>`;
      });

      htmlRows += `
        <tr>
          <td>${idx + 1}</td>
          <td>${i.invoiceNo || ''}</td>
          <td>${dateStr}</td>
          <td>${party || ''}</td>
          <td>${i.partyGstin || i.gstin || ''}</td>
          ${extraColsHtml}
          ${hsnColsHtml}
          <td class="right">${tPcs}</td>
          <td class="right">${taxable.toFixed(2)}</td>
          <td class="right">${c.toFixed(2)}</td>
          <td class="right">${s.toFixed(2)}</td>
          <td class="right">${ig.toFixed(2)}</td>
          <td class="right">${r.toFixed(2)}</td>
          <td class="right">${grand.toFixed(2)}</td>
        </tr>
      `;
    });

    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = MONTHS[reportMonth];
    const reportLabel = reportType === 'sale' ? 'Sale' : 'Purchase';

    let extraHeadersHtml = '';
    let extraFootersHtml = '';
    if (reportType === 'purchase') {
      extraHeadersHtml = `<th class="right">V.Freight</th><th class="right">V.Cartage</th><th>Transporter</th><th>Vehicle No</th><th>GR/E-way</th><th class="right">Int.Fr.Exp</th>`;
      extraFootersHtml = `<td class="right">${totVFr.toFixed(2)}</td><td class="right">${totVCa.toFixed(2)}</td><td colspan="3"></td><td class="right">${totIntFr.toFixed(2)}</td>`;
    }

    const hsnHeaders = sortedHsns.map(hsn => `<th class="right">HSN ${hsn}</th>`).join('');
    const hsnFooters = sortedHsns.map(hsn => `<td class="right">${totHsnMap[hsn] || 0}</td>`).join('');
    const totalCols = 12 + sortedHsns.length + (reportType === 'purchase' ? 6 : 0);

    const html = `
      <html>
        <head>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 0; }
            .header-container { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #000; padding: 5px; }
            th { background-color: #f4f4f4; text-align: left; }
            .right { text-align: right; }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div>
              <div style="font-weight:bold; font-size:24px;">${FIRM_DETAILS.name}</div>
              <div style="font-size:11px; margin-top:2px;">${FIRM_DETAILS.address}</div>
              <div style="font-size:11px;">email: ${FIRM_DETAILS.email}</div>
              <div style="font-size:11px;">Phone: ${FIRM_DETAILS.phone}</div>
              <div style="font-size:12px; margin-top:4px;"><strong>GSTIN: ${FIRM_DETAILS.gstin}</strong></div>
            </div>
            <div style="text-align:right">
              <div style="font-weight:bold; font-size:20px;">${reportLabel} Report</div>
              <div style="font-size:12px; margin-top:4px;"><strong>Month/Year:</strong> ${monthName} ${reportYear}</div>
              <div style="font-size:12px;"><strong>HSN Codes:</strong> ${distinctHsnCodes}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Sl No.</th><th>Invoice No</th><th>Date</th><th>Party Name</th><th>GSTIN</th>
                ${extraHeadersHtml}${hsnHeaders}
                <th class="right">Total Qty</th><th class="right">Taxable Val</th>
                <th class="right">CGST</th><th class="right">SGST</th><th class="right">IGST</th>
                <th class="right">Round Off</th><th class="right">Total Val</th>
              </tr>
            </thead>
            <tbody>
              ${htmlRows || `<tr><td colspan="${totalCols}" style="text-align:center">No invoices found for this month</td></tr>`}
              <tr style="font-weight:bold; background:#eee;">
                <td colspan="5">GRAND TOTAL</td>
                ${extraFootersHtml}${hsnFooters}
                <td class="right">${totPcs}</td>
                <td class="right">${totTaxable.toFixed(2)}</td>
                <td class="right">${totCgst.toFixed(2)}</td>
                <td class="right">${totSgst.toFixed(2)}</td>
                <td class="right">${totIgst.toFixed(2)}</td>
                <td class="right">${totRoundOff.toFixed(2)}</td>
                <td class="right">${totGrand.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        const w = window.open('', '', 'width=1000,height=800');
        if (w) {
          w.document.write(html);
          w.document.close();
          w.focus();
          setTimeout(() => { w.print(); w.close(); }, 250);
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
      }
    } catch (e) { console.error(e); }
  };

  // ---- Print Raw Material Stock Register ----
  const handlePrintRawMaterialReport = async () => {
    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    // Build summary rows
    let summaryRows = '';
    let totalValue = 0;
    rawMaterials.forEach((rm, idx) => {
      const stock = rm.stockLevel || 0;
      // Sum value across all active entries for this material
      const matEntries = rawEntries.filter(e => {
        const rmId = typeof e.rawMaterialId === 'object' ? (e.rawMaterialId as any)._id : e.rawMaterialId;
        return rmId === rm._id && e.qty > 0;
      });
      const value = matEntries.reduce((s, e) => s + e.qty * (e.purchaseRate || 0), 0);
      totalValue += value;
      const isLow = stock <= rm.minReorder;
      summaryRows += `
        <tr style="${isLow ? 'background:#fff3cd;' : ''}">
          <td>${idx + 1}</td>
          <td>${rm.name}</td>
          <td>${rm.sku}</td>
          <td class="right">${isIntegerQty(rm.unit, rm.category) ? stock.toFixed(0) : stock.toFixed(2)}</td>
          <td>${rm.unit}</td>
          <td class="right">${rm.minReorder}</td>
          <td class="right">₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td style="text-align:center; color:${isLow ? '#dc3545' : '#198754'}; font-weight:700">${isLow ? '⚠ LOW' : '✓ OK'}</td>
        </tr>
      `;
    });

    // Build batch register rows
    let batchRows = '';
    const sortedEntries = [...rawEntries].filter(e => e.qty > 0).sort((a, b) => {
      const nA = typeof a.rawMaterialId === 'object' ? (a.rawMaterialId as any).name : '';
      const nB = typeof b.rawMaterialId === 'object' ? (b.rawMaterialId as any).name : '';
      return nA.localeCompare(nB);
    });
    sortedEntries.forEach((e, idx) => {
      const rmName = typeof e.rawMaterialId === 'object' ? (e.rawMaterialId as any).name : 'Unknown';
      const rmUnit = typeof e.rawMaterialId === 'object' ? (e.rawMaterialId as any).unit : '';
      const expiry = e.expiryDate ? new Date(e.expiryDate).toLocaleDateString('en-IN') : '-';
      const isNearExpiry = e.expiryDate && (new Date(e.expiryDate).getTime() - Date.now()) < 90 * 86400000;
      const batchValue = e.qty * (e.purchaseRate || 0);
      batchRows += `
        <tr style="${isNearExpiry ? 'background:#fff3cd;' : ''}">
          <td>${idx + 1}</td>
          <td>${rmName}</td>
          <td>${e.batchNo}</td>
          <td class="right">${e.rawMaterialId && typeof e.rawMaterialId === 'object' && isIntegerQty(e.rawMaterialId.unit, e.rawMaterialId.category) ? e.qty.toFixed(0) : e.qty.toFixed(2)}</td>
          <td>${rmUnit}</td>
          <td class="right">₹${(e.purchaseRate || 0).toFixed(2)}</td>
          <td class="right">₹${batchValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td>${e.vendorName || '-'}</td>
          <td style="${isNearExpiry ? 'color:#dc3545;font-weight:700' : ''}">${expiry}</td>
        </tr>
      `;
    });

    const html = `
      <html>
        <head>
          <style>
            @page { size: A4 portrait; margin: 12mm; }
            body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; }
            h1 { font-size: 20px; margin: 0 0 4px; }
            h2 { font-size: 14px; margin: 20px 0 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
            .firm-header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; margin-bottom: 16px; padding-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
            th, td { border: 1px solid #ccc; padding: 5px 7px; }
            th { background: #f0f0f0; font-weight: 700; text-align: left; }
            .right { text-align: right; }
            .total-row { font-weight: bold; background: #e8f4fd; }
            .note { font-size: 9px; color: #888; margin-top: 4px; }
          </style>
        </head>
        <body>
          <div class="firm-header">
            <div>
              <h1>${FIRM_DETAILS.name}</h1>
              <div>${FIRM_DETAILS.address}</div>
              <div>GSTIN: <strong>${FIRM_DETAILS.gstin}</strong></div>
            </div>
            <div style="text-align:right">
              <div style="font-size:18px;font-weight:bold">Raw Material Stock Register</div>
              <div>As on: <strong>${today}</strong></div>
              <div>Total Materials: ${rawMaterials.length}</div>
            </div>
          </div>

          <h2>1. Material-wise Stock Summary</h2>
          <table>
            <thead>
              <tr>
                <th>Sl</th><th>Material Name</th><th>SKU</th>
                <th class="right">Stock Qty</th><th>Unit</th>
                <th class="right">Min Reorder</th><th class="right">Stock Value (₹)</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${summaryRows || '<tr><td colspan="8" style="text-align:center">No raw materials defined.</td></tr>'}
              <tr class="total-row">
                <td colspan="6" style="text-align:right">TOTAL STOCK VALUE</td>
                <td class="right">₹${totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <h2>2. Batch-wise Inward Register (Active Stock)</h2>
          <p class="note">* Yellow rows indicate batches expiring within 90 days</p>
          <table>
            <thead>
              <tr>
                <th>Sl</th><th>Material</th><th>Batch No.</th>
                <th class="right">Qty</th><th>Unit</th>
                <th class="right">Rate (₹)</th><th class="right">Batch Value (₹)</th>
                <th>Vendor</th><th>Expiry</th>
              </tr>
            </thead>
            <tbody>
              ${batchRows || '<tr><td colspan="9" style="text-align:center">No active stock batches.</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        const w = window.open('', '', 'width=900,height=800');
        if (w) {
          w.document.write(html);
          w.document.close();
          w.focus();
          setTimeout(() => { w.print(); w.close(); }, 250);
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
      }
    } catch (e) { console.error(e); }
  };

  const netPayable = gstCollected - gstPaid;
  const isItc = netPayable < 0;

  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const TABS: { id: ReportTab; label: string; icon: string }[] = [
    { id: 'accounting', label: 'Monthly Accounting', icon: 'document-text-outline' },
    { id: 'gst', label: 'GST & ITC', icon: 'calculator-outline' },
    { id: 'aging', label: 'Receivables Aging', icon: 'time-outline' },
    { id: 'manufacturing', label: 'Manufacturing', icon: 'analytics-outline' },
    { id: 'rawmaterials', label: 'Raw Materials', icon: 'leaf-outline' },
  ];

  if (perm.permissions && !perm.can('report:view')) {
    return (
      <UnauthorizedScreen
        title="Reports & Analytics Chamber Locked"
        description="Your account role does not hold the required Veda credentials for viewing financial statements, GST filings & operational reports."
        requiredPermission="report:view"
      />
    );
  }

  const renderReportSelector = () => (
    <View style={{ width: isDesktop ? 260 : '100%', minWidth: 190 }}>
      {Platform.OS === 'web' ? (
        <select
          value={activeTab}
          onChange={(e: any) => setActiveTab(e.target.value as ReportTab)}
          style={{
            width: '100%',
            height: 38,
            padding: '0 12px',
            borderRadius: 8,
            border: `1px solid ${colors.primary}`,
            backgroundColor: colors.bg.card,
            color: colors.primary,
            fontSize: 13,
            fontWeight: '700',
            outline: 'none',
            cursor: 'pointer',
            boxShadow: '0px 2px 4px rgba(0,0,0,0.04)'
          }}
        >
          <option value="accounting">📊 Monthly Accounting Register</option>
          <option value="gst">🧾 GST Returns (GSTR-1 & GSTR-3B)</option>
          <option value="aging">⏳ Receivables Aging</option>
          <option value="manufacturing">🏭 Manufacturing Analytics</option>
          <option value="rawmaterials">🌿 Raw Materials Stock Register</option>
        </select>
      ) : (
        <TouchableOpacity
          style={{
            height: 38,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.primary,
            backgroundColor: colors.bg.card,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
          onPress={() => {
            Alert.alert('Select Report Section', '', [
              { text: '📊 Monthly Accounting', onPress: () => setActiveTab('accounting') },
              { text: '🧾 GST Returns (GSTR-1 & GSTR-3B)', onPress: () => setActiveTab('gst') },
              { text: '⏳ Receivables Aging', onPress: () => setActiveTab('aging') },
              { text: '🏭 Manufacturing Analytics', onPress: () => setActiveTab('manufacturing') },
              { text: '🌿 Raw Materials', onPress: () => setActiveTab('rawmaterials') }
            ]);
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
            {activeTab === 'accounting' ? '📊 Monthly Accounting' : activeTab === 'gst' ? '🧾 GST Returns' : activeTab === 'aging' ? '⏳ Receivables Aging' : activeTab === 'manufacturing' ? '🏭 Manufacturing Analytics' : '🌿 Raw Materials'}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* Content Area */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ==================== TAB 1: Monthly Accounting ==================== */}
        {activeTab === 'accounting' && (
          <View>
            <View style={styles.sectionCard}>
              <View style={[styles.sectionCardHeader, { flexWrap: 'wrap', gap: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
                  <View style={[styles.iconBadge, { backgroundColor: colors.primary + '15' }]}>
                    <Ionicons name="document-text" size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionCardTitle}>Monthly Accounting Report</Text>
                    <Text style={styles.sectionCardSubtitle}>Generate printable GST-compliant Sale / Purchase register PDF</Text>
                  </View>
                </View>
                {renderReportSelector()}
              </View>

              <View style={[styles.divider]} />

              {/* Controls */}
              <View style={{ zIndex: 4000 }}>
                {(showReportTypeDropdown || showMonthDropdown || showYearDropdown) && (
                  <Pressable
                    style={[StyleSheet.absoluteFill, { zIndex: 2500, ...(Platform.OS === 'web' ? { position: 'fixed' as any } : {}) }]}
                    onPress={() => { setShowReportTypeDropdown(false); setShowMonthDropdown(false); setShowYearDropdown(false); }}
                  />
                )}

                <View style={[styles.controlsRow, { zIndex: 3000 }]}>
                  {/* Report Type */}
                  <View style={{ position: 'relative', zIndex: showReportTypeDropdown ? 2000 : 1 }}>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { width: 160 }]}
                      onPress={() => { setShowReportTypeDropdown(!showReportTypeDropdown); setShowMonthDropdown(false); setShowYearDropdown(false); }}
                    >
                      <Text style={styles.dropdownTriggerText}>{reportType === 'sale' ? 'Sale Report' : 'Purchase Report'}</Text>
                      <Ionicons name={showReportTypeDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.muted} />
                    </TouchableOpacity>
                    {showReportTypeDropdown && (
                      <View style={[styles.dropdownPanel, { width: 160 }]}>
                        {['sale', 'purchase'].map(type => (
                          <TouchableOpacity
                            key={type}
                            style={[styles.dropdownItem, reportType === type && styles.dropdownItemActive]}
                            onPress={() => { setReportType(type as 'sale' | 'purchase'); setShowReportTypeDropdown(false); }}
                          >
                            <Text style={[styles.dropdownItemText, reportType === type && { fontWeight: '700', color: colors.primary }]}>
                              {type === 'sale' ? 'Sale Report' : 'Purchase Report'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Month */}
                  <View style={{ position: 'relative', zIndex: showMonthDropdown ? 2000 : 1 }}>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { width: 130 }]}
                      onPress={() => { setShowMonthDropdown(!showMonthDropdown); setShowYearDropdown(false); setShowReportTypeDropdown(false); }}
                    >
                      <Text style={styles.dropdownTriggerText}>{MONTHS_FULL[reportMonth]}</Text>
                      <Ionicons name={showMonthDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.muted} />
                    </TouchableOpacity>
                    {showMonthDropdown && (
                      <View style={[styles.dropdownPanel, { width: 130 }]}>
                        <ScrollView nestedScrollEnabled style={{ maxHeight: 250 }}>
                          {MONTHS_FULL.map((m, idx) => (
                            <TouchableOpacity
                              key={m}
                              style={[styles.dropdownItem, reportMonth === idx && styles.dropdownItemActive]}
                              onPress={() => { setReportMonth(idx); setShowMonthDropdown(false); }}
                            >
                              <Text style={[styles.dropdownItemText, reportMonth === idx && { fontWeight: '700', color: colors.primary }]}>{m}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {/* Year */}
                  <View style={{ position: 'relative', zIndex: showYearDropdown ? 2000 : 1 }}>
                    <TouchableOpacity
                      style={[styles.dropdownTrigger, { width: 90 }]}
                      onPress={() => { setShowYearDropdown(!showYearDropdown); setShowMonthDropdown(false); setShowReportTypeDropdown(false); }}
                    >
                      <Text style={styles.dropdownTriggerText}>{reportYear}</Text>
                      <Ionicons name={showYearDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.muted} />
                    </TouchableOpacity>
                    {showYearDropdown && (
                      <View style={[styles.dropdownPanel, { width: 90 }]}>
                        <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                          {[2023, 2024, 2025, 2026, 2027, 2028].map(y => (
                            <TouchableOpacity
                              key={y}
                              style={[styles.dropdownItem, reportYear === y && styles.dropdownItemActive]}
                              onPress={() => { setReportYear(y); setShowYearDropdown(false); }}
                            >
                              <Text style={[styles.dropdownItemText, reportYear === y && { fontWeight: '700', color: colors.primary }]}>{y}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {/* Generate Button */}
                  <TouchableOpacity style={styles.generateBtn} onPress={handlePrintReport}>
                    <Ionicons name="print" size={16} color="#fff" />
                    <Text style={styles.generateBtnText}>Generate & Print PDF</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Preview stats for selected month */}
              {(() => {
                const invs = reportType === 'sale' ? saleInvs : purchInvs;
                const filtered = invs.filter(i => {
                  if (!i.date) return false;
                  const d = new Date(i.date);
                  return d.getMonth() === reportMonth && d.getFullYear() === reportYear && (i.mode === 'regular' || (i.mode as any) === 'pakka');
                });
                const total = filtered.reduce((s, i) => s + (i.amount || 0), 0);
                const totalTax = filtered.reduce((s, i) => s + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0);
                return (
                  <View style={[styles.previewGrid, { marginTop: 20 }]}>
                    <View style={styles.previewCell}>
                      <Text style={styles.previewCellLabel}>Invoices Found</Text>
                      <Text style={[styles.previewCellValue, { color: colors.primary }]}>{filtered.length}</Text>
                    </View>
                    <View style={styles.previewCell}>
                      <Text style={styles.previewCellLabel}>Total Value</Text>
                      <Text style={[styles.previewCellValue, { color: colors.text.primary }]}>₹{total.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={styles.previewCell}>
                      <Text style={styles.previewCellLabel}>GST in Period</Text>
                      <Text style={[styles.previewCellValue, { color: colors.warning }]}>₹{totalTax.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={styles.previewCell}>
                      <Text style={styles.previewCellLabel}>Report Period</Text>
                      <Text style={[styles.previewCellValue, { color: colors.text.secondary, fontSize: 14 }]}>{MONTHS_SHORT[reportMonth]} {reportYear}</Text>
                    </View>
                  </View>
                );
              })()}
            </View>
          </View>
        )}

        {/* ==================== TAB 2: GST & ITC ==================== */}
        {activeTab === 'gst' && (
          <View>
            <View style={styles.sectionCard}>
              <View style={[styles.sectionCardHeader, { flexWrap: 'wrap', gap: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
                  <View style={[styles.iconBadge, { backgroundColor: colors.success + '15' }]}>
                    <Ionicons name="calculator" size={20} color={colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionCardTitle}>GST Tax Administration & ITC</Text>
                    <Text style={styles.sectionCardSubtitle}>Consolidated GST collected vs. paid, and net tax liability</Text>
                  </View>
                </View>
                {renderReportSelector()}
              </View>
              <View style={styles.divider} />

              <View style={[styles.gstGrid, { flexDirection: isDesktop ? 'row' : 'column' }]}>
                <View style={[styles.gstGridItem, isDesktop && { borderRightWidth: 1, borderRightColor: colors.border }]}>
                  <Text style={styles.gstLabel}>GST Collected (Outward)</Text>
                  <Text style={[styles.gstValue, { color: colors.primary }]}>₹{gstCollected.toLocaleString()}</Text>
                  <Text style={styles.gstSubtext}>From sale invoices (CGST + SGST / IGST)</Text>
                </View>
                <View style={[styles.gstGridItem, isDesktop && { borderRightWidth: 1, borderRightColor: colors.border }]}>
                  <Text style={styles.gstLabel}>GST Paid / ITC (Inward)</Text>
                  <Text style={[styles.gstValue, { color: colors.success }]}>₹{gstPaid.toLocaleString()}</Text>
                  <Text style={styles.gstSubtext}>From purchase invoices / input credit</Text>
                </View>
                <View style={styles.gstGridItem}>
                  {isItc ? (
                    <View style={[styles.itcBanner, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
                      <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                      <View>
                        <Text style={[styles.itcBannerTitle, { color: colors.success }]}>Accumulated ITC</Text>
                        <Text style={styles.itcBannerValue}>₹{Math.abs(netPayable).toLocaleString()}</Text>
                        <Text style={styles.itcBannerDesc}>Excess credits to offset liability.</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={[styles.itcBanner, { backgroundColor: colors.warning + '15', borderColor: colors.warning }]}>
                      <Ionicons name="alert-circle" size={22} color={colors.warning} />
                      <View>
                        <Text style={[styles.itcBannerTitle, { color: colors.warning }]}>Net GST Payable</Text>
                        <Text style={styles.itcBannerValue}>₹{netPayable.toLocaleString()}</Text>
                        <Text style={styles.itcBannerDesc}>Tax exceeds inward credits.</Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Embedded Official GSTR-1 & GSTR-3B Return Generator */}
            <View style={[styles.sectionCard, { marginTop: 16 }]}>
              <View style={styles.sectionCardHeader}>
                <View style={[styles.iconBadge, { backgroundColor: colors.primary + '15' }]}>
                  <Ionicons name="document-attach" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionCardTitle}>Monthly Statutory GST Returns (GSTR-1 & GSTR-3B)</Text>
                  <Text style={styles.sectionCardSubtitle}>Official filing reports with Table 9B Credit/Debit Notes</Text>
                </View>
              </View>
              <View style={styles.divider} />

              <GstReturnsPage />
            </View>
          </View>
        )}

        {/* ==================== TAB 3: Receivables Aging ==================== */}
        {activeTab === 'aging' && (
          <View>
            <View style={styles.sectionCard}>
              <View style={[styles.sectionCardHeader, { flexWrap: 'wrap', gap: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
                  <View style={[styles.iconBadge, { backgroundColor: colors.warning + '15' }]}>
                    <Ionicons name="time" size={20} color={colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionCardTitle}>Receivables Aging Report</Text>
                    <Text style={styles.sectionCardSubtitle}>Outstanding unpaid invoice balances by overdue period</Text>
                  </View>
                </View>
                {renderReportSelector()}
              </View>
              <View style={styles.divider} />

              <View style={styles.agingGrid}>
                {[
                  { label: 'NOT YET DUE', value: agingData.notDue, color: colors.success },
                  { label: '1–30 DAYS', value: agingData.days0_30, color: colors.warning },
                  { label: '31–60 DAYS', value: agingData.days31_60, color: '#f97316' },
                  { label: '61–90 DAYS', value: agingData.days61_90, color: colors.danger },
                  { label: '> 90 DAYS', value: agingData.days90Plus, color: '#7f1d1d' },
                ].map(item => (
                  <View key={item.label} style={[styles.agingCard, { borderTopColor: item.color, borderTopWidth: 3 }]}>
                    <Text style={[styles.agingCardLabel, { color: item.color }]}>{item.label}</Text>
                    <Text style={[styles.agingCardValue, { color: item.color }]}>
                      ₹{item.value.toLocaleString('en-IN')}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={[styles.overdueAlert, { borderColor: colors.danger, backgroundColor: colors.danger + '10' }]}>
                <Ionicons name="alert-circle" size={20} color={colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.overdueAlertTitle, { color: colors.danger }]}>Total Overdue Receivables</Text>
                  <Text style={[styles.overdueAlertValue, { color: colors.danger }]}>₹{agingData.totalOverdue.toLocaleString('en-IN')}</Text>
                  <Text style={styles.overdueAlertDesc}>Total outstanding cash flow tied up in overdue invoices.</Text>
                </View>
              </View>
            </View>

            {/* Overdue Invoice Detail */}
            <View style={[styles.sectionCard, { marginTop: 16 }]}>
              <Text style={styles.sectionCardTitle}>Overdue Invoice Breakdown</Text>
              <View style={styles.divider} />
              {saleInvs.filter(inv => {
                if (!inv.isFinalized || inv.status === 'paid') return false;
                let due = inv.dueDate ? new Date(inv.dueDate) : new Date(new Date(inv.date).getTime() + 30 * 86400000);
                due.setHours(0, 0, 0, 0);
                return today.getTime() > due.getTime();
              }).sort((a, b) => {
                const dA = a.dueDate ? new Date(a.dueDate) : new Date(new Date(a.date).getTime() + 30 * 86400000);
                const dB = b.dueDate ? new Date(b.dueDate) : new Date(new Date(b.date).getTime() + 30 * 86400000);
                return dA.getTime() - dB.getTime();
              }).slice(0, 15).map((inv, i) => {
                let due = inv.dueDate ? new Date(inv.dueDate) : new Date(new Date(inv.date).getTime() + 30 * 86400000);
                due.setHours(0, 0, 0, 0);
                const diffDays = Math.floor((today.getTime() - due.getTime()) / 86400000);
                const isHighRisk = diffDays > 60;
                return (
                  <View key={inv._id || i} style={[styles.overdueRow, i < 14 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.overdueRowParty} numberOfLines={1}>{inv.customerName || '—'}</Text>
                      <Text style={styles.overdueRowInvNo}>{inv.invoiceNo} · Due: {due.toLocaleDateString('en-IN')}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.overdueRowAmt, { color: isHighRisk ? colors.danger : colors.warning }]}>
                        ₹{(inv.amount || 0).toLocaleString('en-IN')}
                      </Text>
                      <Text style={[styles.overdueRowDays, { color: isHighRisk ? colors.danger : colors.warning }]}>
                        {diffDays}d overdue
                      </Text>
                    </View>
                  </View>
                );
              })}
              {saleInvs.filter(inv => {
                if (!inv.isFinalized || inv.status === 'paid') return false;
                let due = inv.dueDate ? new Date(inv.dueDate) : new Date(new Date(inv.date).getTime() + 30 * 86400000);
                due.setHours(0, 0, 0, 0);
                return today.getTime() > due.getTime();
              }).length === 0 && (
                  <View style={{ alignItems: 'center', padding: 24 }}>
                    <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} />
                    <Text style={{ color: colors.text.muted, marginTop: 8 }}>No overdue invoices. Great work!</Text>
                  </View>
                )}
            </View>
          </View>
        )}

        {/* ==================== TAB 4: Manufacturing ==================== */}
        {activeTab === 'manufacturing' && (
          <View>
            {/* Asset Valuation */}
            <View style={styles.sectionCard}>
              <View style={[styles.sectionCardHeader, { flexWrap: 'wrap', gap: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
                  <View style={[styles.iconBadge, { backgroundColor: colors.purple + '15' }]}>
                    <Ionicons name="analytics" size={20} color={colors.purple || colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionCardTitle}>Manufacturing Asset Valuation</Text>
                    <Text style={styles.sectionCardSubtitle}>Live raw material & finished goods inventory value</Text>
                  </View>
                </View>
                {renderReportSelector()}
              </View>
              <View style={styles.divider} />

              <View style={[styles.mfgValGrid, { flexDirection: isDesktop ? 'row' : 'column' }]}>
                <View style={[styles.mfgValCard, { borderColor: colors.success }]}>
                  <View style={[styles.mfgValIcon, { backgroundColor: colors.success + '15' }]}>
                    <Ionicons name="leaf-outline" size={22} color={colors.success} />
                  </View>
                  <Text style={styles.mfgValLabel}>Raw Stock Valuation</Text>
                  <Text style={[styles.mfgValValue, { color: colors.success }]}>
                    ₹{(mfgAnalytics?.netRawMaterialValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.mfgValSub}>Active ingredient batches × purchase rate</Text>
                </View>
                <View style={[styles.mfgValCard, { borderColor: colors.primary }]}>
                  <View style={[styles.mfgValIcon, { backgroundColor: colors.primary + '15' }]}>
                    <Ionicons name="cube-outline" size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.mfgValLabel}>Finished Goods Value</Text>
                  <Text style={[styles.mfgValValue, { color: colors.primary }]}>
                    ₹{(mfgAnalytics?.netFinishedGoodsValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.mfgValSub}>Inventory boxes × product MRP</Text>
                </View>
                <View style={[styles.mfgValCard, { borderColor: colors.warning, backgroundColor: colors.primary + '03' }]}>
                  <View style={[styles.mfgValIcon, { backgroundColor: colors.warning + '15' }]}>
                    <Ionicons name="wallet-outline" size={22} color={colors.warning} />
                  </View>
                  <Text style={styles.mfgValLabel}>Total Facility Assets</Text>
                  <Text style={[styles.mfgValValue, { color: colors.warning }]}>
                    ₹{((mfgAnalytics?.netRawMaterialValue || 0) + (mfgAnalytics?.netFinishedGoodsValue || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.mfgValSub}>Raw stock + finished goods combined</Text>
                </View>
              </View>
            </View>

            {/* Yield Performance */}
            <View style={[styles.sectionCard, { marginTop: 16 }]}>
              <View style={styles.sectionCardHeader}>
                <View style={[styles.iconBadge, { backgroundColor: colors.success + '15' }]}>
                  <Ionicons name="bar-chart" size={20} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionCardTitle}>Yield Performance & Efficiency</Text>
                  <Text style={styles.sectionCardSubtitle}>Last 10 completed production batch efficiency (actual vs. planned)</Text>
                </View>
              </View>
              <View style={styles.divider} />

              {mfgAnalytics?.yieldPerformance && mfgAnalytics.yieldPerformance.length > 0 ? (
                <View style={{ gap: 20 }}>
                  {mfgAnalytics.yieldPerformance.map((item: any, idx: number) => {
                    const isLow = item.efficiency < 95;
                    const barColor = isLow ? colors.warning : colors.success;
                    return (
                      <View key={idx}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>
                              Batch {item.batchNo} · {item.productName}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                              Yielded {item.actualYieldQty} / {item.plannedQty} planned units
                            </Text>
                          </View>
                          <View style={[styles.efficiencyBadge, { backgroundColor: barColor + '20', borderColor: barColor }]}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: barColor }}>{item.efficiency}%</Text>
                          </View>
                        </View>
                        <View style={{ height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${Math.min(100, item.efficiency)}%`, backgroundColor: barColor, borderRadius: 4 }} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={{ alignItems: 'center', padding: 32 }}>
                  <Ionicons name="bar-chart-outline" size={36} color={colors.text.secondary} />
                  <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 8 }}>No completed yield batches to analyze yet.</Text>
                </View>
              )}
            </View>

            {/* Production Timeline Summary */}
            <View style={[styles.sectionCard, { marginTop: 16 }]}>
              <View style={styles.sectionCardHeader}>
                <View style={[styles.iconBadge, { backgroundColor: colors.info + '15' }]}>
                  <Ionicons name="calendar" size={20} color={colors.info || colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionCardTitle}>Production Run Timeline</Text>
                  <Text style={styles.sectionCardSubtitle}>Recent 20 production runs and their status</Text>
                </View>
              </View>
              <View style={styles.divider} />

              {mfgAnalytics?.timeline && mfgAnalytics.timeline.length > 0 ? (
                <View style={{ gap: 12 }}>
                  {mfgAnalytics.timeline.map((run: any, idx: number) => {
                    const statusColors: Record<string, string> = {
                      in_progress: colors.primary,
                      qc_hold: colors.warning,
                      completed: colors.success,
                      cancelled: colors.danger,
                    };
                    const statusColor = statusColors[run.status] || colors.text.muted;
                    const start = new Date(run.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                    const end = run.endDate ? new Date(run.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Ongoing';
                    return (
                      <View key={run.id || idx} style={[styles.timelineRow, { borderLeftColor: statusColor }]}>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>
                              {run.batchNo}
                            </Text>
                            <View style={[styles.statusPill, { backgroundColor: statusColor + '15', borderColor: statusColor }]}>
                              <Text style={{ fontSize: 9, fontWeight: '800', color: statusColor }}>{run.status.toUpperCase()}</Text>
                            </View>
                          </View>
                          <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>{run.productName}</Text>
                          <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{start} → {end}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{run.actualYieldQty || run.plannedQty} units</Text>
                          <Text style={{ fontSize: 10, color: colors.text.muted }}>Planned: {run.plannedQty}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={{ alignItems: 'center', padding: 32 }}>
                  <Ionicons name="calendar-outline" size={36} color={colors.text.secondary} />
                  <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 8 }}>No production timeline data found.</Text>
                </View>
              )}
            </View>
          </View>
        )}


        {/* ==================== TAB 5: Raw Materials ==================== */}
        {activeTab === 'rawmaterials' && (() => {
          const filteredMaterials = rawMaterials.filter(rm =>
            rm.name.toLowerCase().includes(rmSearchText.toLowerCase()) ||
            rm.sku.toLowerCase().includes(rmSearchText.toLowerCase())
          );
          const totalStockValue = rawMaterials.reduce((sum, rm) => {
            const matEntries = rawEntries.filter(e => {
              const rmId = typeof e.rawMaterialId === 'object' ? (e.rawMaterialId as any)._id : e.rawMaterialId;
              return rmId === rm._id && e.qty > 0;
            });
            return sum + matEntries.reduce((s, e) => s + e.qty * (e.purchaseRate || 0), 0);
          }, 0);
          const lowStockCount = rawMaterials.filter(rm => (rm.stockLevel || 0) <= rm.minReorder).length;
          const totalActiveBatches = rawEntries.filter(e => e.qty > 0).length;

          return (
            <View>
              {/* Header card */}
              <View style={styles.sectionCard}>
                <View style={[styles.sectionCardHeader, { flexWrap: 'wrap', gap: 12 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
                    <View style={[styles.iconBadge, { backgroundColor: colors.success + '15' }]}>
                      <Ionicons name="leaf" size={20} color={colors.success} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sectionCardTitle}>Raw Materials Stock Report</Text>
                      <Text style={styles.sectionCardSubtitle}>Live inventory, batch register & expiry alerts</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <TouchableOpacity style={styles.generateBtn} onPress={handlePrintRawMaterialReport} activeOpacity={0.8}>
                      <Ionicons name="print" size={15} color="#fff" />
                      <Text style={styles.generateBtnText}>Print PDF</Text>
                    </TouchableOpacity>
                    {renderReportSelector()}
                  </View>
                </View>
                <View style={styles.divider} />

                {/* KPI row */}
                <View style={styles.previewGrid}>
                  <View style={styles.previewCell}>
                    <Text style={styles.previewCellLabel}>Total Materials</Text>
                    <Text style={[styles.previewCellValue, { color: colors.primary }]}>{rawMaterials.length}</Text>
                  </View>
                  <View style={styles.previewCell}>
                    <Text style={styles.previewCellLabel}>Active Batches</Text>
                    <Text style={[styles.previewCellValue, { color: colors.text.primary }]}>{totalActiveBatches}</Text>
                  </View>
                  <View style={styles.previewCell}>
                    <Text style={styles.previewCellLabel}>Stock Value</Text>
                    <Text style={[styles.previewCellValue, { color: colors.success, fontSize: 14 }]}>
                      ₹{totalStockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                  <View style={[styles.previewCell, lowStockCount > 0 && { borderColor: colors.danger, borderWidth: 1 }]}>
                    <Text style={styles.previewCellLabel}>Low Stock</Text>
                    <Text style={[styles.previewCellValue, { color: lowStockCount > 0 ? colors.danger : colors.success }]}>
                      {lowStockCount} items
                    </Text>
                  </View>
                  <View style={[styles.previewCell, expiryAlerts.length > 0 && { borderColor: colors.warning, borderWidth: 1 }]}>
                    <Text style={styles.previewCellLabel}>Near Expiry</Text>
                    <Text style={[styles.previewCellValue, { color: expiryAlerts.length > 0 ? colors.warning : colors.success }]}>
                      {expiryAlerts.length} batches
                    </Text>
                  </View>
                </View>
              </View>

              {/* Expiry Alerts */}
              {expiryAlerts.length > 0 && (
                <View style={[styles.sectionCard, { marginTop: 16, borderColor: colors.danger, borderWidth: 1.5 }]}>
                  <View style={styles.sectionCardHeader}>
                    <View style={[styles.iconBadge, { backgroundColor: colors.danger + '15' }]}>
                      <Ionicons name="warning" size={20} color={colors.danger} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sectionCardTitle, { color: colors.danger }]}>
                        Expiry Alerts — {expiryAlerts.length} Batch{expiryAlerts.length > 1 ? 'es' : ''} Expiring Within 90 Days
                      </Text>
                      <Text style={styles.sectionCardSubtitle}>Use or transfer these batches before expiry</Text>
                    </View>
                  </View>
                  <View style={styles.divider} />
                  {expiryAlerts.map((alert, i) => {
                    const rmName = typeof alert.rawMaterialId === 'object' ? (alert.rawMaterialId as any).name : 'Unknown';
                    const rmUnit = typeof alert.rawMaterialId === 'object' ? (alert.rawMaterialId as any).unit : '';
                    const expDate = alert.expiryDate ? new Date(alert.expiryDate) : null;
                    const daysLeft = expDate ? Math.floor((expDate.getTime() - Date.now()) / 86400000) : null;
                    const isCritical = daysLeft !== null && daysLeft <= 30;
                    return (
                      <View
                        key={alert._id}
                        style={[
                          styles.expiryRow,
                          i < expiryAlerts.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                          isCritical && { backgroundColor: colors.danger + '08' }
                        ]}
                      >
                        <View style={[styles.expiryDot, { backgroundColor: isCritical ? colors.danger : colors.warning }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.expiryMaterialName}>🌿 {rmName}</Text>
                          <Text style={styles.expiryBatchInfo}>
                            Batch: <Text style={{ fontWeight: '700' }}>{alert.batchNo}</Text>
                            {'  ·  '}Stock: {alert.rawMaterialId && typeof alert.rawMaterialId === 'object' && isIntegerQty(alert.rawMaterialId.unit, alert.rawMaterialId.category) ? alert.qty.toFixed(0) : alert.qty.toFixed(2)} {rmUnit}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[styles.expiryDate, { color: isCritical ? colors.danger : colors.warning }]}>
                            {expDate ? expDate.toLocaleDateString('en-IN') : '—'}
                          </Text>
                          {daysLeft !== null && (
                            <Text style={[styles.expiryDaysLeft, { color: isCritical ? colors.danger : colors.warning }]}>
                              {daysLeft <= 0 ? 'EXPIRED' : `${daysLeft}d left`}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* View toggle + Search */}
              <View style={[styles.sectionCard, { marginTop: 16 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                  {/* Toggle */}
                  <View style={styles.toggleGroup}>
                    {(['summary', 'batches'] as const).map(mode => (
                      <TouchableOpacity
                        key={mode}
                        style={[styles.toggleBtn, rmViewMode === mode && styles.toggleBtnActive]}
                        onPress={() => setRmViewMode(mode)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={mode === 'summary' ? 'list-outline' : 'layers-outline'}
                          size={14}
                          color={rmViewMode === mode ? '#fff' : colors.text.secondary}
                        />
                        <Text style={[styles.toggleBtnText, rmViewMode === mode && styles.toggleBtnTextActive]}>
                          {mode === 'summary' ? 'Stock Summary' : 'Batch Register'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {/* Search */}
                  <View style={styles.rmSearchBox}>
                    <Ionicons name="search-outline" size={14} color={colors.text.muted} />
                    <Text
                      onPress={() => { }}
                      style={{ fontSize: 13, color: rmSearchText ? colors.text.primary : colors.text.muted, flex: 1, paddingVertical: 2 }}
                    >
                      {/* Native TextInput for real use — static display for now */}
                    </Text>
                  </View>
                </View>
                <View style={styles.divider} />

                {/* -------- Stock Summary View -------- */}
                {rmViewMode === 'summary' && (
                  <View>
                    {/* Table header */}
                    <View style={styles.rmTableHeader}>
                      <Text style={[styles.rmTh, { flex: 2.5 }]}>MATERIAL</Text>
                      <Text style={[styles.rmTh, { flex: 1, textAlign: 'right' }]}>STOCK</Text>
                      <Text style={[styles.rmTh, { flex: 1, textAlign: 'right' }]}>MIN</Text>
                      <Text style={[styles.rmTh, { flex: 1.3, textAlign: 'right' }]}>VALUE (₹)</Text>
                      <Text style={[styles.rmTh, { width: 56, textAlign: 'center' }]}>STATUS</Text>
                    </View>

                    {filteredMaterials.length === 0 ? (
                      <View style={{ alignItems: 'center', padding: 24 }}>
                        <Ionicons name="leaf-outline" size={32} color={colors.text.secondary} />
                        <Text style={{ color: colors.text.muted, marginTop: 8 }}>No raw materials found.</Text>
                      </View>
                    ) : (
                      filteredMaterials.map((rm, i) => {
                        const stock = rm.stockLevel || 0;
                        const matEntries = rawEntries.filter(e => {
                          const rmId = typeof e.rawMaterialId === 'object' ? (e.rawMaterialId as any)._id : e.rawMaterialId;
                          return rmId === rm._id && e.qty > 0;
                        });
                        const value = matEntries.reduce((s, e) => s + e.qty * (e.purchaseRate || 0), 0);
                        const isLow = stock <= rm.minReorder;
                        const batchCount = matEntries.length;

                        return (
                          <View
                            key={rm._id}
                            style={[
                              styles.rmSummaryRow,
                              i % 2 === 1 && { backgroundColor: colors.bg.secondary },
                              isLow && { backgroundColor: colors.danger + '08' },
                              i < filteredMaterials.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }
                            ]}
                          >
                            <View style={{ flex: 2.5 }}>
                              <Text style={styles.rmMaterialName} numberOfLines={1}>{rm.name}</Text>
                              <Text style={styles.rmSkuLabel}>{rm.sku} · {batchCount} batch{batchCount !== 1 ? 'es' : ''}</Text>
                            </View>
                            <Text style={[styles.rmTd, { flex: 1, textAlign: 'right', color: isLow ? colors.danger : colors.text.primary, fontWeight: '700' }]}>
                              {isIntegerQty(rm.unit, rm.category) ? stock.toFixed(0) : stock.toFixed(2)} {rm.unit}
                            </Text>
                            <Text style={[styles.rmTd, { flex: 1, textAlign: 'right' }]}>
                              {rm.minReorder} {rm.unit}
                            </Text>
                            <Text style={[styles.rmTd, { flex: 1.3, textAlign: 'right', color: colors.success, fontWeight: '700' }]}>
                              ₹{value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </Text>
                            <View style={{ width: 56, alignItems: 'center' }}>
                              {isLow ? (
                                <View style={[styles.statusPill, { backgroundColor: colors.danger + '15', borderColor: colors.danger }]}>
                                  <Text style={{ fontSize: 9, fontWeight: '800', color: colors.danger }}>LOW</Text>
                                </View>
                              ) : (
                                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                              )}
                            </View>
                          </View>
                        );
                      })
                    )}

                    {/* Total row */}
                    {filteredMaterials.length > 0 && (
                      <View style={[styles.rmSummaryRow, { backgroundColor: colors.primary + '08', borderTopWidth: 2, borderTopColor: colors.primary }]}>
                        <Text style={{ flex: 2.5, fontSize: 12, fontWeight: '800', color: colors.primary }}>TOTAL</Text>
                        <Text style={{ flex: 1 }} />
                        <Text style={{ flex: 1 }} />
                        <Text style={[styles.rmTd, { flex: 1.3, textAlign: 'right', color: colors.primary, fontWeight: '800', fontSize: 14 }]}>
                          ₹{totalStockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Text>
                        <View style={{ width: 56 }} />
                      </View>
                    )}
                  </View>
                )}

                {/* -------- Batch Register View -------- */}
                {rmViewMode === 'batches' && (() => {
                  const activeBatches = rawEntries
                    .filter(e => e.qty > 0)
                    .sort((a, b) => {
                      const nA = typeof a.rawMaterialId === 'object' ? (a.rawMaterialId as any).name : '';
                      const nB = typeof b.rawMaterialId === 'object' ? (b.rawMaterialId as any).name : '';
                      return nA.localeCompare(nB);
                    });

                  return (
                    <View>
                      {/* Table header */}
                      <View style={styles.rmTableHeader}>
                        <Text style={[styles.rmTh, { flex: 2 }]}>MATERIAL / BATCH</Text>
                        <Text style={[styles.rmTh, { flex: 1, textAlign: 'right' }]}>QTY</Text>
                        <Text style={[styles.rmTh, { flex: 1, textAlign: 'right' }]}>RATE</Text>
                        <Text style={[styles.rmTh, { flex: 1.2, textAlign: 'right' }]}>VALUE</Text>
                        <Text style={[styles.rmTh, { flex: 1 }]}>EXPIRY</Text>
                      </View>

                      {activeBatches.length === 0 ? (
                        <View style={{ alignItems: 'center', padding: 24 }}>
                          <Ionicons name="layers-outline" size={32} color={colors.text.secondary} />
                          <Text style={{ color: colors.text.muted, marginTop: 8 }}>No active stock batches.</Text>
                        </View>
                      ) : (
                        activeBatches.map((entry, i) => {
                          const rmName = typeof entry.rawMaterialId === 'object' ? (entry.rawMaterialId as any).name : 'Unknown';
                          const rmUnit = typeof entry.rawMaterialId === 'object' ? (entry.rawMaterialId as any).unit : '';
                          const expDate = entry.expiryDate ? new Date(entry.expiryDate) : null;
                          const daysLeft = expDate ? Math.floor((expDate.getTime() - Date.now()) / 86400000) : null;
                          const isNearExpiry = daysLeft !== null && daysLeft <= 90;
                          const isCritical = daysLeft !== null && daysLeft <= 30;
                          const batchValue = entry.qty * (entry.purchaseRate || 0);

                          return (
                            <View
                              key={entry._id}
                              style={[
                                styles.rmBatchRow,
                                i % 2 === 1 && { backgroundColor: colors.bg.secondary },
                                isNearExpiry && { backgroundColor: isCritical ? colors.danger + '08' : colors.warning + '08' },
                                i < activeBatches.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }
                              ]}
                            >
                              <View style={{ flex: 2 }}>
                                <Text style={styles.rmMaterialName} numberOfLines={1}>{rmName}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                  <View style={[styles.batchPill, { backgroundColor: colors.primary + '12' }]}>
                                    <Text style={{ fontSize: 9, fontWeight: '700', color: colors.primary }}>{entry.batchNo}</Text>
                                  </View>
                                  {entry.vendorName ? (
                                    <Text style={styles.rmSkuLabel}>{entry.vendorName}</Text>
                                  ) : null}
                                </View>
                              </View>
                              <Text style={[styles.rmTd, { flex: 1, textAlign: 'right', fontWeight: '700', color: colors.text.primary }]}>
                                {entry.rawMaterialId && typeof entry.rawMaterialId === 'object' && isIntegerQty(entry.rawMaterialId.unit, entry.rawMaterialId.category) ? entry.qty.toFixed(0) : entry.qty.toFixed(2)} {rmUnit}
                              </Text>
                              <Text style={[styles.rmTd, { flex: 1, textAlign: 'right' }]}>
                                ₹{(entry.purchaseRate || 0).toFixed(2)}
                              </Text>
                              <Text style={[styles.rmTd, { flex: 1.2, textAlign: 'right', color: colors.success, fontWeight: '700' }]}>
                                ₹{batchValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </Text>
                              <View style={{ flex: 1 }}>
                                {expDate ? (
                                  <>
                                    <Text style={[styles.rmTd, { color: isCritical ? colors.danger : isNearExpiry ? colors.warning : colors.text.muted, fontWeight: isNearExpiry ? '700' : '400' }]}>
                                      {expDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                                    </Text>
                                    {daysLeft !== null && isNearExpiry && (
                                      <Text style={{ fontSize: 9, fontWeight: '700', color: isCritical ? colors.danger : colors.warning }}>
                                        {daysLeft <= 0 ? 'EXPIRED' : `${daysLeft}d left`}
                                      </Text>
                                    )}
                                  </>
                                ) : (
                                  <Text style={[styles.rmTd, { color: colors.text.muted }]}>—</Text>
                                )}
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  );
                })()}
              </View>
            </View>
          );
        })()}

        {/* ---- Audit Logs ---- */}
        <View style={styles.sectionCard}>
          <TouchableOpacity onPress={() => router.push('/audit')} activeOpacity={0.7}>
            <View style={[styles.sectionCardHeader, { flexWrap: 'wrap', gap: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
                <View style={[styles.iconBadge, { backgroundColor: colors.warning + '15' }]}>
                  <Ionicons name="shield-checkmark" size={20} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionCardTitle}>System Audit Logs</Text>
                  <Text style={styles.sectionCardSubtitle}>Security events, user actions & system audit trail</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>View Logs</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />

      </ScrollView>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  pageHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg.secondary,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  pageSubtitle: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
    fontWeight: '500',
  },

  // Tab bar
  tabBarScroll: {
    backgroundColor: colors.bg.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexGrow: 0,
  },
  tabBarContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  tabPillTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // Content
  content: {
    padding: Spacing.lg,
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },

  // Section Cards
  sectionCard: {
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sectionCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
  },
  sectionCardSubtitle: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 16,
  },

  // Accounting controls
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dropdownTriggerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
    marginRight: 6,
  },
  dropdownPanel: {
    position: 'absolute',
    top: 44,
    left: 0,
    backgroundColor: colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: '0px 4px 8px rgba(0,0,0,0.12)',
    elevation: 6,
    zIndex: 9999,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownItemActive: {
    backgroundColor: colors.primary + '10',
  },
  dropdownItemText: {
    fontSize: 13,
    color: colors.text.primary,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: Radius.md,
  },
  generateBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  previewCell: {
    flex: 1,
    minWidth: 120,
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewCellLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  previewCellValue: {
    fontSize: 18,
    fontWeight: '800',
  },

  // GST
  gstGrid: {
    gap: 16,
  },
  gstGridItem: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 6,
  },
  gstLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
  },
  gstValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  gstSubtext: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  itcBanner: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  itcBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  itcBannerValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#000',
    marginVertical: 2,
  },
  itcBannerDesc: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  gstMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gstMonthLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    width: 60,
  },
  gstMonthValues: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
  gstMonthChip: {
    alignItems: 'flex-end',
    minWidth: 80,
  },
  gstMonthChipLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gstMonthChipValue: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },

  // Aging
  agingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  agingCard: {
    flexGrow: 1,
    flexBasis: 130,
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  agingCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  agingCardValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  overdueAlert: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  overdueAlertTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  overdueAlertValue: {
    fontSize: 22,
    fontWeight: '800',
    marginVertical: 2,
  },
  overdueAlertDesc: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  overdueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  overdueRowParty: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  overdueRowInvNo: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
  overdueRowAmt: {
    fontSize: 14,
    fontWeight: '800',
  },
  overdueRowDays: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },

  // Manufacturing
  mfgValGrid: {
    gap: 12,
    marginBottom: 4,
  },
  mfgValCard: {
    flex: 1,
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  mfgValIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  mfgValLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mfgValValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  mfgValSub: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  efficiencyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingVertical: 12,
    borderLeftWidth: 4,
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.sm,
    paddingRight: 14,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },

  // ---- Raw Materials Tab ----
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  expiryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  expiryMaterialName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  expiryBatchInfo: {
    fontSize: 11,
    color: colors.text.secondary,
    marginTop: 2,
  },
  expiryDate: {
    fontSize: 13,
    fontWeight: '700',
  },
  expiryDaysLeft: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
    textTransform: 'uppercase' as const,
  },
  toggleGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  toggleBtnTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  rmSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 180,
  },
  rmTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.sm,
    marginBottom: 4,
  },
  rmTh: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  rmSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: Radius.sm,
  },
  rmBatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: Radius.sm,
  },
  rmMaterialName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  rmSkuLabel: {
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 2,
  },
  rmTd: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  batchPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
});

