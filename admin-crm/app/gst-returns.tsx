import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Modal, TextInput, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api, getApiBaseUrl } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';

function GstReturnsPage() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [view, setView] = useState<'gstr1' | 'gstr3b'>('gstr1');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [filingStatus, setFilingStatus] = useState<any>(null);
  const [arnModalVisible, setArnModalVisible] = useState(false);
  const [arnInput, setArnInput] = useState('');
  const [acknowledgementUrl, setAcknowledgementUrl] = useState('');

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getGstReturn(view, month, year);
      setData(res);
      const periodStr = `${year}-${month.toString().padStart(2, '0')}`;
      const statusRes = await api.getGstFilingStatus(periodStr, view);
      setFilingStatus(statusRes);
    } catch (err) {
      console.error(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [view, month, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(y => y - 1);
    } else {
      setMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(y => y + 1);
    } else {
      setMonth(m => m + 1);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg }} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={colors.primary} />}>
        {/* Top Controls: Return Type Tabs & Month Navigation */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: Spacing.lg }}>
          {/* Tab Selector */}
          <View style={{ flexDirection: 'row', backgroundColor: colors.bg.card, borderRadius: Radius.md, padding: 4, borderWidth: 1, borderColor: colors.border }}>
            <TouchableOpacity style={[styles.tabBtn, view === 'gstr1' && { backgroundColor: colors.primary }]} onPress={() => setView('gstr1')}>
              <Text style={[styles.tabBtnText, view === 'gstr1' && { color: '#fff', fontWeight: '700' }]}>GSTR-1 (Sales)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, view === 'gstr3b' && { backgroundColor: colors.primary }]} onPress={() => setView('gstr3b')}>
              <Text style={[styles.tabBtnText, view === 'gstr3b' && { color: '#fff', fontWeight: '700' }]}>GSTR-3B (Summary & ITC)</Text>
            </TouchableOpacity>
          </View>

          {/* Month Navigation */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, height: 42, gap: 12 }}>
            <TouchableOpacity onPress={handlePrevMonth} style={{ padding: 4 }}>
              <Ionicons name="chevron-back" size={18} color={colors.primary} />
            </TouchableOpacity>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, minWidth: 130, textAlign: 'center' }}>
              {months[month - 1]} {year}
            </Text>
            <TouchableOpacity onPress={handleNextMonth} style={{ padding: 4 }}>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Export Utility Row */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: Spacing.lg, flexWrap: 'wrap' }}>
          <TouchableOpacity 
            style={[styles.exportBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '08' }]}
            onPress={() => {
              const url = `${getApiBaseUrl()}/gst/${view}?month=${month}&year=${year}&format=json`;
              if (Platform.OS === 'web') {
                window.open(url, '_blank');
              } else {
                Alert.alert('Download JSON Utility', `Offline JSON URL:\n${url}`);
              }
            }}
          >
            <Ionicons name="code-download-outline" size={15} color={colors.primary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Download JSON Utility</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.exportBtn, { borderColor: colors.success, backgroundColor: colors.success + '08' }]}
            onPress={() => {
              const url = `${getApiBaseUrl()}/gst/${view}?month=${month}&year=${year}&format=csv`;
              if (Platform.OS === 'web') {
                window.open(url, '_blank');
              } else {
                Alert.alert('Download CSV Spreadsheet', `Offline CSV URL:\n${url}`);
              }
            }}
          >
            <Ionicons name="document-text-outline" size={15} color={colors.success} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.success }}>Download CSV / Excel</Text>
          </TouchableOpacity>
        </View>

        {/* Filing status card */}
        <View style={{ backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.md, marginBottom: Spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: filingStatus?.filed ? colors.success + '15' : colors.warning + '15', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={filingStatus?.filed ? "shield-checkmark" : "alert-circle"} size={20} color={filingStatus?.filed ? colors.success : colors.warning} />
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>
                Filing Status: {filingStatus?.filed ? 'FILED' : 'PENDING FILING'}
              </Text>
              {filingStatus?.filed ? (
                <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 1 }}>
                  ARN: {filingStatus.filing.arn} | Date: {new Date(filingStatus.filing.filedDate).toLocaleDateString('en-IN')}
                </Text>
              ) : (
                <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 1 }}>Download the JSON utility and upload to the GST portal</Text>
              )}
            </View>
          </View>
          
          {filingStatus?.filed ? (
            filingStatus.filing.supportingDocuments?.length > 0 ? (
              <TouchableOpacity 
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary + '15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}
                onPress={() => Platform.OS === 'web' ? window.open(filingStatus.filing.supportingDocuments[0].url, '_blank') : Alert.alert('View Document', filingStatus.filing.supportingDocuments[0].url)}
              >
                <Ionicons name="document-attach" size={13} color={colors.primary} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>View Receipt</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ backgroundColor: colors.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                <Text style={{ fontSize: 11, color: colors.text.muted }}>No Receipt Attached</Text>
              </View>
            )
          ) : (
            <TouchableOpacity 
              style={{ backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              onPress={() => {
                setArnInput('');
                setAcknowledgementUrl('');
                setArnModalVisible(true);
              }}
            >
              <Ionicons name="checkmark-done" size={13} color="#fff" />
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#fff' }}>Record ARN</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : data && view === 'gstr1' ? (
          <Gstr1View data={data} colors={colors} styles={styles} />
        ) : data && view === 'gstr3b' ? (
          <Gstr3bView data={data} colors={colors} styles={styles} />
        ) : (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.text.muted} />
            <Text style={{ color: colors.text.muted, marginTop: 10 }}>No GST data available for selected period.</Text>
          </View>
        )}
      </ScrollView>

      {/* Record ARN Modal */}
      <Modal animationType="slide" presentationStyle="formSheet" visible={arnModalVisible} onRequestClose={() => setArnModalVisible(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setArnModalVisible(false)}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text.primary }}>Record Return Filing ARN</Text>
            <TouchableOpacity onPress={async () => {
              if (!arnInput.trim()) {
                alert('Please enter the application reference number (ARN)');
                return;
              }
              try {
                const periodStr = `${year}-${month.toString().padStart(2, '0')}`;
                await api.recordGstFiling({
                  period: periodStr,
                  returnType: view,
                  arn: arnInput.trim(),
                  url: acknowledgementUrl || undefined,
                  name: 'GST Filing Receipt'
                });
                setArnModalVisible(false);
                fetchData();
              } catch (err: any) {
                alert(err.message || 'Failed to save filing details');
              }
            }}>
              <Ionicons name="checkmark" size={24} color={colors.success} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
            <Text style={{ fontSize: 11, color: colors.text.muted, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 }}>Period</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text.primary, marginBottom: 14 }}>{months[month - 1]} {year} - {view.toUpperCase()}</Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary, marginBottom: 4 }}>Government ARN *</Text>
            <TextInput 
              style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 13, color: colors.text.primary, marginBottom: 16 }}
              placeholder="e.g. AA090726123456F"
              value={arnInput}
              onChangeText={setArnInput}
            />

            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary, marginBottom: 4 }}>Acknowledgement PDF Receipt (Optional)</Text>
            {acknowledgementUrl ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg.secondary, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
                <Text style={{ fontSize: 12, color: colors.text.primary, fontWeight: '600', flex: 1 }} numberOfLines={1}>Filing_Receipt.pdf</Text>
                <TouchableOpacity onPress={() => setAcknowledgementUrl('')}>
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity 
                style={{ height: 45, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary + '05', marginBottom: 16 }}
                onPress={async () => {
                  if (Platform.OS === 'web') {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'application/pdf,image/*';
                    input.onchange = async (e: any) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      try {
                        const reader = new FileReader();
                        reader.onload = async () => {
                          try {
                            const uploadRes = await api.uploadFile(reader.result as string, file.name);
                            setAcknowledgementUrl(uploadRes.url);
                          } catch (err: any) { alert(err.message || 'Upload failed'); }
                        };
                        reader.readAsDataURL(file);
                      } catch { alert('File read failed'); }
                    };
                    input.click();
                  } else {
                    Alert.prompt('File URL', 'Enter PDF Receipt URL:', [
                      { text: 'Cancel' },
                      { text: 'Save', onPress: (url) => url && setAcknowledgementUrl(url) }
                    ]);
                  }
                }}
              >
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '700' }}>+ Upload Government PDF Receipt</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Gstr1View({ data, colors, styles }: { data: any; colors: any; styles: any }) {
  const totalInvoices = data.totalInvoices || 0;
  const totalTaxable = data.totalTaxableValue || 0;
  const totalGst = data.totalGST || 0;
  const table9B_CN = data.table9B_CreditNotes || {};
  const table9B_DN = data.table9B_DebitNotes || {};

  return (
    <View>
      {/* Top Stat Summary Cards */}
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: Spacing.lg }}>
        <View style={[styles.statCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
          <Text style={[styles.statLabel, { color: colors.primary }]}>TOTAL FINALIZED INVOICES</Text>
          <Text style={[styles.statValue, { color: colors.text.primary }]}>{totalInvoices}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.info + '10', borderColor: colors.info + '30' }]}>
          <Text style={[styles.statLabel, { color: colors.info }]}>NET TAXABLE VALUE (AFTER NOTES)</Text>
          <Text style={[styles.statValue, { color: colors.text.primary }]}>₹{totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.success + '10', borderColor: colors.success + '30' }]}>
          <Text style={[styles.statLabel, { color: colors.success }]}>NET OUTWARD GST</Text>
          <Text style={[styles.statValue, { color: colors.success }]}>₹{totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
        </View>
      </View>

      {/* Table 9B: Credit / Debit Notes Summary Card */}
      <View style={[styles.summaryCard, { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg, marginBottom: Spacing.lg }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={styles.sectionTitle}>Table 9B: Credit / Debit Notes (Registered & Unregistered)</Text>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: colors.primary + '15' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>GSTR-1 Statutory Table 9B</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginTop: 4 }}>
          <View>
            <Text style={styles.label}>Credit Notes Issued (-)</Text>
            <Text style={[styles.value, { color: colors.danger }]}>- ₹{(table9B_CN.baseAmount || 0).toLocaleString('en-IN')}</Text>
            <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{table9B_CN.count || 0} Credit Notes</Text>
          </View>
          <View>
            <Text style={styles.label}>Debit Notes Issued (+)</Text>
            <Text style={[styles.value, { color: colors.success }]}>+ ₹{(table9B_DN.baseAmount || 0).toLocaleString('en-IN')}</Text>
            <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>{table9B_DN.count || 0} Debit Notes</Text>
          </View>
          <View>
            <Text style={styles.label}>Net Tax Adjustment</Text>
            <Text style={[styles.value, { color: colors.primary }]}>
              ₹{((table9B_DN.cgst + table9B_DN.sgst + table9B_DN.igst) - (table9B_CN.cgst + table9B_CN.sgst + table9B_CN.igst)).toLocaleString('en-IN')}
            </Text>
            <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>Reflected in GSTR-1 & GSTR-3B</Text>
          </View>
        </View>
      </View>

      {/* B2B Table */}
      <View style={{ marginBottom: Spacing.lg }}>
        <Text style={styles.sectionTitle}>B2B Registered Invoices ({data.b2b?.length || 0})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ width: '100%' }} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={[styles.table, { width: '100%', minWidth: 850 }]}>
            <View style={styles.tableHeaderRow}>
              <View style={[styles.tableHeaderCellContainer, { width: 140 }]}><Text style={styles.tableHeaderCell}>Invoice No</Text></View>
              <View style={[styles.tableHeaderCellContainer, { flex: 2, minWidth: 180 }]}><Text style={styles.tableHeaderCell}>Customer Name</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 140 }]}><Text style={styles.tableHeaderCell}>GSTIN</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 120 }]}><Text style={styles.tableHeaderCell}>Taxable (₹)</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 100 }]}><Text style={styles.tableHeaderCell}>CGST (₹)</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 100 }]}><Text style={styles.tableHeaderCell}>SGST (₹)</Text></View>
              <View style={[styles.tableHeaderCellContainer, { width: 100, borderRightWidth: 0 }]}><Text style={styles.tableHeaderCell}>IGST (₹)</Text></View>
            </View>

            {data.b2b?.map((inv: any, i: number) => (
              <View key={i} style={styles.tableBodyRow}>
                <View style={[styles.tableCellContainer, { width: 140 }]}>
                  <Text style={[styles.tableCell, { fontWeight: '700' }]}>{inv.invoiceNo}</Text>
                </View>
                <View style={[styles.tableCellContainer, { flex: 2, minWidth: 180 }]}>
                  <Text style={styles.tableCell} numberOfLines={1}>{inv.customerName}</Text>
                </View>
                <View style={[styles.tableCellContainer, { width: 140 }]}>
                  <Text style={[styles.tableCell, { fontFamily: 'monospace', fontSize: 12 }]}>{inv.gstin}</Text>
                </View>
                <View style={[styles.tableCellContainer, { width: 120 }]}>
                  <Text style={styles.tableCell}>₹{(inv.taxableValue || 0).toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.tableCellContainer, { width: 100 }]}>
                  <Text style={styles.tableCell}>₹{(inv.cgst || 0).toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.tableCellContainer, { width: 100 }]}>
                  <Text style={styles.tableCell}>₹{(inv.sgst || 0).toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.tableCellContainer, { width: 100, borderRightWidth: 0 }]}>
                  <Text style={styles.tableCell}>₹{(inv.igst || 0).toLocaleString('en-IN')}</Text>
                </View>
              </View>
            ))}

            {(!data.b2b || data.b2b.length === 0) && (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: colors.text.muted }}>No B2B invoices found for this month.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* B2C Summary */}
      {data.b2c && (
        <View style={[styles.summaryCard, { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg }]}>
          <Text style={styles.sectionTitle}>B2C Unregistered Sales Summary</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginTop: 8 }}>
            <View>
              <Text style={styles.label}>B2C Invoices Count</Text>
              <Text style={styles.value}>{data.b2c.count || 0}</Text>
            </View>
            <View>
              <Text style={styles.label}>B2C Taxable Value</Text>
              <Text style={styles.value}>₹{(data.b2c.totalTaxableValue || 0).toLocaleString('en-IN')}</Text>
            </View>
            <View>
              <Text style={styles.label}>B2C Total GST</Text>
              <Text style={[styles.value, { color: colors.success }]}>₹{(data.b2c.totalGST || 0).toLocaleString('en-IN')}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function Gstr3bView({ data, colors, styles }: { data: any; colors: any; styles: any }) {
  const outward = data.outwardSupplies || {};
  const inward = data.inwardSupplies || {};
  const netPayable = data.netGSTPayable || 0;

  return (
    <View style={{ gap: Spacing.lg }}>
      <View style={[styles.summaryCard, { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg }]}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text.primary, marginBottom: 12 }}>3.1 Outward Taxable Supplies (Sales & Notes)</Text>
        <InfoRow label="Net Taxable Base (Gross Sales - Credit Notes + Debit Notes)" value={`₹${(outward.taxableValue || 0).toLocaleString('en-IN')}`} />
        <InfoRow label="Credit Notes Deductions (-)" value={`- ₹${(outward.creditNoteDeduction || 0).toLocaleString('en-IN')} (${outward.creditNotesCount || 0} Notes)`} />
        <InfoRow label="Debit Notes Additions (+)" value={`+ ₹${(outward.debitNoteAddition || 0).toLocaleString('en-IN')} (${outward.debitNotesCount || 0} Notes)`} />
        <InfoRow label="Net CGST Liability" value={`₹${(outward.cgst || 0).toLocaleString('en-IN')}`} />
        <InfoRow label="Net SGST Liability" value={`₹${(outward.sgst || 0).toLocaleString('en-IN')}`} />
        <InfoRow label="Net IGST Liability" value={`₹${(outward.igst || 0).toLocaleString('en-IN')}`} />
        <InfoRow label="Total Net Output Tax Liability" value={`₹${(outward.totalTax || 0).toLocaleString('en-IN')}`} isBold />
        <InfoRow label="Total Invoices Count" value={String(outward.invoiceCount || 0)} />
      </View>

      <View style={[styles.summaryCard, { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg }]}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text.primary, marginBottom: 12 }}>4. Eligible Input Tax Credit (ITC - Purchases)</Text>
        <InfoRow label="Total Inward Taxable Value" value={`₹${(inward.taxableValue || 0).toLocaleString('en-IN')}`} />
        <InfoRow label="ITC CGST" value={`₹${(inward.itcCGST || 0).toLocaleString('en-IN')}`} />
        <InfoRow label="ITC SGST" value={`₹${(inward.itcSGST || 0).toLocaleString('en-IN')}`} />
        <InfoRow label="ITC IGST" value={`₹${(inward.itcIGST || 0).toLocaleString('en-IN')}`} />
        <InfoRow label="Total Claimable ITC" value={`₹${(inward.totalITC || 0).toLocaleString('en-IN')}`} isBold />
      </View>

      <View style={{ padding: Spacing.lg, backgroundColor: netPayable >= 0 ? colors.warning + '15' : colors.success + '15', borderRadius: Radius.lg, borderWidth: 1, borderColor: netPayable >= 0 ? colors.warning : colors.success }}>
        <InfoRow label="Net Tax Payable (Outward Tax - Inward ITC)" value={`₹${netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`} isBold />
      </View>
    </View>
  );
}

function InfoRow({ label, value, isBold }: { label: string; value: string; isBold?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border + '40' }}>
      <Text style={{ color: colors.text.secondary, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.text.primary, fontWeight: isBold ? '800' : '600', fontSize: isBold ? 14 : 13 }}>{value}</Text>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.sm },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: colors.text.secondary },
  label: { fontSize: 10, color: colors.text.muted, fontWeight: '700', letterSpacing: 0.5 },
  value: { fontSize: 18, fontWeight: '800', color: colors.text.primary, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text.primary, marginBottom: 12 },
  statCard: { flex: 1, minWidth: 200, backgroundColor: colors.bg.card, borderRadius: Radius.md, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1 },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  statValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  table: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  tableHeaderCell: { fontSize: 11, fontWeight: '800', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableHeaderCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  tableBodyRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tableCell: { fontSize: 13, color: colors.text.primary },
  tableCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  summaryCard: { padding: Spacing.md },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1
  },
});

export default GstReturnsPage;
