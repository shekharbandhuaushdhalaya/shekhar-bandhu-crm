import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, useWindowDimensions, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api, Invoice } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';
import { useAuth } from '../utils/auth';
import { FIRM_DETAILS } from '../constants/firm';
import Svg, { Rect, Circle, Text as SvgText, G, Defs, LinearGradient, Stop } from 'react-native-svg';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { TouchableOpacity, Platform } from 'react-native';

export default function ReportsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  if (user && user.role === 'agent') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.primary, padding: 20 }}>
        <Ionicons name="lock-closed" size={48} color={colors.danger} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary, marginTop: 12 }}>Access Denied</Text>
        <Text style={{ fontSize: 13, color: colors.text.muted, marginTop: 4, textAlign: 'center' }}>Agents do not have permissions to access financial reports.</Text>
      </View>
    );
  }

  const [gstCollected, setGstCollected] = useState(0);
  const [gstPaid, setGstPaid] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const [saleInvs, setSaleInvs] = useState<Invoice[]>([]);
  const [purchInvs, setPurchInvs] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportType, setReportType] = useState<'sale' | 'purchase'>('sale');
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [showReportTypeDropdown, setShowReportTypeDropdown] = useState(false);

  const { width: winWidth } = useWindowDimensions();

  
  const load = useCallback(async () => {
    const [custs, vends, invs, saleInvs, purchInvs] = await Promise.all([
      api.getCustomers(),
      api.getVendors(),
      api.getInventories(),
      api.getSaleInvoices('', 'all'),
      api.getPurchaseInvoices('', 'all')
    ]);

    
    // GST computations
    const gstCol = saleInvs.reduce((sum, i) => {
      if (i.mode === 'pakka') {
        return sum + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0);
      }
      return sum;
    }, 0);
    const gstPd = purchInvs.reduce((sum, i) => {
      if (i.mode === 'pakka') {
        return sum + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0);
      }
      return sum;
    }, 0);

    setGstCollected(gstCol);
    setGstPaid(gstPd);
    setSaleInvs(saleInvs);
    setPurchInvs(purchInvs);
    setCustomers(custs);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const netPayable = gstCollected - gstPaid;
  const isItc = netPayable < 0;

  // Calculate Aging Report
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const agingData = {
    notDue: 0,
    days0_30: 0,
    days31_60: 0,
    days61_90: 0,
    days90Plus: 0,
    totalOverdue: 0
  };

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
      due.setHours(0,0,0,0);

      const bal = inv.amount; // assuming full amount is due for simplicity, or we can use inv.balance if available. We'll use amount since there is no balance on invoice schema directly unless partial payments are recorded (but the CRM doesn't track partial invoice payments on the invoice object itself currently, it tracks ledger balance. For aging, we use unpaid invoice amount).

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

  const handlePrintReport = async () => {
    const invs = reportType === 'sale' ? saleInvs : purchInvs;
    const filtered = invs.filter(i => {
      if (!i.date) return false;
      const d = new Date(i.date);
      return d.getMonth() === reportMonth && d.getFullYear() === reportYear && i.mode === 'pakka';
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

      totPcs += tPcs;
      totTaxable += taxable;
      totCgst += c;
      totSgst += s;
      totIgst += ig;
      totRoundOff += r;
      totGrand += grand;

      const dateStr = new Date(i.date).toLocaleDateString('en-IN');
      const party = reportType === 'sale' ? i.customerName : (i.supplierName || i.vendorName);

      let extraColsHtml = '';
      if (reportType === 'purchase') {
         const vFr = Number(i.freightAmount || 0);
         const vCa = Number(i.cartageAmount || 0);
         const intFr = Number(i.internalFreightExpense || 0);
         totVFr += vFr;
         totVCa += vCa;
         totIntFr += intFr;
         
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

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[reportMonth];
    const reportLabel = reportType === 'sale' ? 'Sale' : 'Purchase';
    const title = `${reportLabel} Report`;

    let extraHeadersHtml = '';
    let extraFootersHtml = '';
    if (reportType === 'purchase') {
       extraHeadersHtml = `
         <th class="right">V.Freight</th>
         <th class="right">V.Cartage</th>
         <th>Transporter</th>
         <th>Vehicle No</th>
         <th>GR/E-way</th>
         <th class="right">Int.Fr.Exp</th>
       `;
       extraFootersHtml = `
         <td class="right">${totVFr.toFixed(2)}</td>
         <td class="right">${totVCa.toFixed(2)}</td>
         <td colspan="3"></td>
         <td class="right">${totIntFr.toFixed(2)}</td>
       `;
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
            .header-left { text-align: left; }
            .header-right { text-align: right; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #000; padding: 5px; }
            th { background-color: #f4f4f4; text-align: left; }
            .right { text-align: right; }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div class="header-left">
              <div style="font-weight:bold; font-size:24px; letter-spacing:1px;">${FIRM_DETAILS.name}</div>
              <div style="font-size:11px; margin-top:2px;">${FIRM_DETAILS.address}</div>
              <div style="font-size:11px;">email: ${FIRM_DETAILS.email}</div>
              <div style="font-size:11px;">Phone : ${FIRM_DETAILS.phone}</div>
              <div style="font-size:12px; margin-top: 4px;"><strong>GSTIN : ${FIRM_DETAILS.gstin}</strong></div>
            </div>
            <div class="header-right">
              <div style="font-weight:bold; font-size:20px;">${title}</div>
              <div style="font-size:12px; margin-top:4px;"><strong>Month/Year:</strong> ${monthName} ${reportYear}</div>
              <div style="font-size:12px; margin-top:2px;"><strong>Distinct HSN Codes:</strong> ${distinctHsnCodes}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Sl No.</th>
                <th>Invoice No</th>
                <th>Date</th>
                <th>Party Name</th>
                <th>GSTIN</th>
                ${extraHeadersHtml}
                ${hsnHeaders}
                <th class="right">Total Qty</th>
                <th class="right">Taxable Val</th>
                <th class="right">CGST</th>
                <th class="right">SGST</th>
                <th class="right">IGST</th>
                <th class="right">Round Off</th>
                <th class="right">Total Val</th>
              </tr>
            </thead>
            <tbody>
              ${htmlRows || `<tr><td colspan="${totalCols}" style="text-align:center">No invoices found for this month</td></tr>`}
              <tr style="font-weight: bold; background-color: #eee;">
                <td colspan="5">GRAND TOTAL</td>
                ${extraFootersHtml}
                ${hsnFooters}
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
        const printWindow = window.open('', '', 'width=1000,height=800');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => {
            printWindow.print();
            printWindow.close();
          }, 250);
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >

      
      {/* Monthly Report Generator Section */}
      <View style={[styles.gstOverviewCard, { zIndex: 5000 }]}>
        <View style={styles.gstCardHeader}>
          <Ionicons name="document-text" size={22} color={colors.primary} />
          <Text style={[styles.statusBannerTitle, { color: colors.primary }]}>Monthly Accounting Report</Text>
        </View>
        
        <View style={[styles.reportControls, { zIndex: 4000 }]}>
          {(showReportTypeDropdown || showMonthDropdown || showYearDropdown) && (
            <Pressable
              style={[
                StyleSheet.absoluteFill,
                { 
                  zIndex: 2500,
                  ...(Platform.OS === 'web' ? { position: 'fixed' as any } : {})
                }
              ]}
              onPress={() => {
                setShowReportTypeDropdown(false);
                setShowMonthDropdown(false);
                setShowYearDropdown(false);
              }}
            />
          )}
          <View style={[styles.reportRow, { zIndex: 3000 }]}>
            <View style={{ position: 'relative', zIndex: showReportTypeDropdown ? 2000 : 1 }}>
              <TouchableOpacity 
                style={[styles.monthSelector, { paddingHorizontal: 12, width: 160, justifyContent: 'space-between' }]}
                onPress={() => { setShowReportTypeDropdown(!showReportTypeDropdown); setShowMonthDropdown(false); setShowYearDropdown(false); }}
              >
                <Text style={[styles.monthText, { minWidth: 0, textAlign: 'left' }]}>
                  {reportType === 'sale' ? 'Sale Report' : 'Purchase Report'}
                </Text>
                <Ionicons name={showReportTypeDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.muted} />
              </TouchableOpacity>
              {showReportTypeDropdown && (
                <View style={[styles.filterDropdownPanel, { top: 44, left: 0, width: 160 }]}>
                  <TouchableOpacity
                    style={[styles.filterDropdownItem, reportType === 'sale' && styles.filterDropdownItemActive]}
                    onPress={() => { setReportType('sale'); setShowReportTypeDropdown(false); }}
                  >
                    <Text style={[styles.filterDropdownItemText, reportType === 'sale' && { fontWeight: '700', color: colors.primary }]}>Sale Report</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.filterDropdownItem, reportType === 'purchase' && styles.filterDropdownItemActive]}
                    onPress={() => { setReportType('purchase'); setShowReportTypeDropdown(false); }}
                  >
                    <Text style={[styles.filterDropdownItemText, reportType === 'purchase' && { fontWeight: '700', color: colors.primary }]}>Purchase Report</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <View style={{ position: 'relative', zIndex: showMonthDropdown ? 2000 : 1 }}>
                <TouchableOpacity 
                  style={[styles.monthSelector, { paddingHorizontal: 12, width: 130, justifyContent: 'space-between' }]}
                  onPress={() => { setShowMonthDropdown(!showMonthDropdown); setShowYearDropdown(false); setShowReportTypeDropdown(false); }}
                >
                  <Text style={[styles.monthText, { minWidth: 0, textAlign: 'left' }]}>
                    {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][reportMonth]}
                  </Text>
                  <Ionicons name={showMonthDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.muted} />
                </TouchableOpacity>
                {showMonthDropdown && (
                  <View style={[styles.filterDropdownPanel, { top: 44, left: 0, width: 130 }]}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 250 }}>
                      {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, idx) => (
                        <TouchableOpacity
                          key={m}
                          style={[styles.filterDropdownItem, reportMonth === idx && styles.filterDropdownItemActive]}
                          onPress={() => { setReportMonth(idx); setShowMonthDropdown(false); }}
                        >
                          <Text style={[styles.filterDropdownItemText, reportMonth === idx && { fontWeight: '700', color: colors.primary }]}>{m}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={{ position: 'relative', zIndex: showYearDropdown ? 2000 : 1 }}>
                <TouchableOpacity 
                  style={[styles.monthSelector, { paddingHorizontal: 12, width: 90, justifyContent: 'space-between' }]}
                  onPress={() => { setShowYearDropdown(!showYearDropdown); setShowMonthDropdown(false); setShowReportTypeDropdown(false); }}
                >
                  <Text style={[styles.monthText, { minWidth: 0, textAlign: 'left' }]}>{reportYear}</Text>
                  <Ionicons name={showYearDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.muted} />
                </TouchableOpacity>
                {showYearDropdown && (
                  <View style={[styles.filterDropdownPanel, { top: 44, left: 0, width: 90 }]}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                      {[2023, 2024, 2025, 2026, 2027, 2028].map((y) => (
                        <TouchableOpacity
                          key={y}
                          style={[styles.filterDropdownItem, reportYear === y && styles.filterDropdownItemActive]}
                          onPress={() => { setReportYear(y); setShowYearDropdown(false); }}
                        >
                          <Text style={[styles.filterDropdownItemText, reportYear === y && { fontWeight: '700', color: colors.primary }]}>{y}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>

            <TouchableOpacity style={styles.exportBtn} onPress={handlePrintReport}>
              <Ionicons name="print" size={18} color="#fff" />
              <Text style={styles.exportBtnText}>Generate & Print PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* GST Tax Overview Component */}
      <View style={[styles.gstOverviewCard, { marginTop: Spacing.lg }]}>
        <View style={styles.gstCardHeader}>
          <Ionicons name="calculator" size={22} color={colors.primary} />
          <Text style={styles.gstCardTitle}>GST Tax Administration & Input Tax Credit (ITC)</Text>
        </View>
        <View style={styles.gstDivider} />

        {(() => {
          const isMobile = winWidth < 768;
          return (
            <View style={[styles.gstGrid, { flexDirection: isMobile ? 'column' : 'row', alignItems: 'stretch' }]}>
              <View style={[styles.gstGridItem, isMobile && { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 12 }]}>
                <Text style={styles.gstLabel}>GST Collected (Outward)</Text>
                <Text style={[styles.gstValue, { color: colors.primary }]}>₹{gstCollected.toLocaleString()}</Text>
                <Text style={styles.gstSubtext}>From sale invoices (CGST+SGST/IGST)</Text>
              </View>
              {!isMobile && <View style={styles.gstVerticalDivider} />}
              <View style={[styles.gstGridItem, isMobile && { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 12 }]}>
                <Text style={styles.gstLabel}>GST Paid / ITC (Inward)</Text>
                <Text style={[styles.gstValue, { color: colors.success }]}>₹{gstPaid.toLocaleString()}</Text>
                <Text style={styles.gstSubtext}>From purchase invoices / input credit</Text>
              </View>
              {!isMobile && <View style={styles.gstVerticalDivider} />}
              <View style={[styles.gstGridItem, { flex: 1.2 }, isMobile && { paddingTop: 12 }]}>
                {isItc ? (
                  <View style={[styles.statusBanner, { backgroundColor: colors.success + '15', borderColor: colors.success, height: isMobile ? undefined : '100%', justifyContent: 'center', marginTop: 0 }]}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.statusBannerTitle, { color: colors.success }]}>Accumulated ITC</Text>
                      <Text style={styles.statusBannerValue}>₹{Math.abs(netPayable).toLocaleString()}</Text>
                      <Text style={styles.statusBannerDesc}>Excess credits to offset liability.</Text>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.statusBanner, { backgroundColor: colors.warning + '15', borderColor: colors.warning, height: isMobile ? undefined : '100%', justifyContent: 'center', marginTop: 0 }]}>
                    <Ionicons name="alert-circle" size={20} color={colors.warning} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.statusBannerTitle, { color: colors.warning }]}>Net Payable</Text>
                      <Text style={styles.statusBannerValue}>₹{netPayable.toLocaleString()}</Text>
                      <Text style={styles.statusBannerDesc}>Tax exceeds inward credits.</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          );
        })()}
      </View>

      {/* Receivables Aging Report */}
      <View style={[styles.gstOverviewCard, { marginTop: Spacing.lg, marginBottom: 40 }]}>
        <View style={styles.gstCardHeader}>
          <Ionicons name="time" size={22} color={colors.warning} />
          <Text style={styles.gstCardTitle}>Receivables Aging Report</Text>
        </View>
        <View style={styles.gstDivider} />
        
        <View style={styles.metricsGrid}>
          <View style={[styles.summaryCard, { flexBasis: 140, borderColor: colors.success }]}>
            <Text style={styles.summaryCardTitle}>NOT YET DUE</Text>
            <Text style={[styles.summaryCardValue, { color: colors.success, fontSize: 20 }]}>₹{agingData.notDue.toLocaleString()}</Text>
          </View>
          <View style={[styles.summaryCard, { flexBasis: 140, borderColor: colors.warning }]}>
            <Text style={styles.summaryCardTitle}>1-30 DAYS PAST DUE</Text>
            <Text style={[styles.summaryCardValue, { color: colors.warning, fontSize: 20 }]}>₹{agingData.days0_30.toLocaleString()}</Text>
          </View>
          <View style={[styles.summaryCard, { flexBasis: 140, borderColor: '#f97316' }]}>
            <Text style={styles.summaryCardTitle}>31-60 DAYS PAST DUE</Text>
            <Text style={[styles.summaryCardValue, { color: '#f97316', fontSize: 20 }]}>₹{agingData.days31_60.toLocaleString()}</Text>
          </View>
          <View style={[styles.summaryCard, { flexBasis: 140, borderColor: colors.danger }]}>
            <Text style={styles.summaryCardTitle}>61-90 DAYS PAST DUE</Text>
            <Text style={[styles.summaryCardValue, { color: colors.danger, fontSize: 20 }]}>₹{agingData.days61_90.toLocaleString()}</Text>
          </View>
          <View style={[styles.summaryCard, { flexBasis: 140, borderColor: '#7f1d1d', backgroundColor: '#7f1d1d08' }]}>
            <Text style={styles.summaryCardTitle}>{'>'} 90 DAYS PAST DUE</Text>
            <Text style={[styles.summaryCardValue, { color: '#7f1d1d', fontSize: 20 }]}>₹{agingData.days90Plus.toLocaleString()}</Text>
          </View>
        </View>

        <View style={[styles.statusBanner, { backgroundColor: colors.danger + '15', borderColor: colors.danger, marginTop: 8 }]}>
          <Ionicons name="alert-circle" size={20} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusBannerTitle, { color: colors.danger }]}>Total Overdue Receivables</Text>
            <Text style={[styles.statusBannerValue, { color: colors.danger }]}>₹{agingData.totalOverdue.toLocaleString()}</Text>
            <Text style={styles.statusBannerDesc}>This represents total outstanding cash flow tied up in overdue invoices.</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: Spacing.lg, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  heading: { fontSize: 28, fontWeight: '800', color: colors.text.primary, marginBottom: 4 },
  subheading: { fontSize: 14, color: colors.text.secondary, marginBottom: Spacing.lg },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.lg },
  summaryCard: { flexGrow: 1, flexShrink: 1, flexBasis: 240, backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: colors.border },
  summaryCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  summaryCardTitle: { fontSize: 10, fontWeight: '700', color: colors.text.muted, letterSpacing: 0.5 },
  summaryCardValue: { fontSize: 24, fontWeight: '800', color: colors.text.primary, marginBottom: 4 },
  summaryCardLabel: { fontSize: 11, color: colors.text.secondary },

  gstOverviewCard: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.lg },
  gstCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  gstCardTitle: { fontSize: 16, fontWeight: '800', color: colors.text.primary },
  gstDivider: { height: 1, backgroundColor: colors.border, marginBottom: 16 },
  gstGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', marginBottom: 16 },
  gstGridItem: { flex: 1, minWidth: 200, gap: 4 },
  gstLabel: { fontSize: 12, fontWeight: '600', color: colors.text.muted },
  gstValue: { fontSize: 22, fontWeight: '800' },
  gstSubtext: { fontSize: 11, color: colors.text.secondary },
  gstVerticalDivider: { width: 1, backgroundColor: colors.border, alignSelf: 'stretch' },
  gstStatusContainer: { marginTop: 8 },
  statusBanner: { flexDirection: 'row', gap: 12, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1 },
  statusBannerTitle: { fontSize: 13, fontWeight: '700' },
  statusBannerValue: { fontSize: 18, fontWeight: '800', color: colors.text.primary, marginVertical: 4 },
  statusBannerDesc: { fontSize: 11, color: colors.text.secondary },

  chartsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, width: '100%' },
  chartCard: { flexGrow: 1, flexShrink: 1, flexBasis: 350, backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.lg },
  chartTitle: { fontSize: 15, fontWeight: '700', color: colors.text.primary, marginBottom: Spacing.lg },
  chartLegend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: Spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: colors.text.secondary, fontWeight: '600' },
  legendVal: { fontSize: 13, color: colors.text.primary, fontWeight: '700', marginTop: 2 },

  reportControls: { marginTop: Spacing.md, gap: Spacing.md },
  reportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, alignItems: 'center' },
  typeBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
  monthSelector: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderRadius: Radius.md, paddingHorizontal: 8, height: 40 },
  arrowBtn: { padding: 8 },
  monthText: { fontSize: 14, fontWeight: '700', color: colors.text.primary, minWidth: 120, textAlign: 'center' },
  filterDropdownPanel: { position: 'absolute', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  filterDropdownItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterDropdownItemActive: { backgroundColor: colors.primary + '10' },
  filterDropdownItemText: { fontSize: 13, color: colors.text.primary },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 16, height: 40, borderRadius: Radius.md },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
