import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, FlatList, Modal, ActivityIndicator, Alert, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors, Shadows } from '../constants/theme';
import { api } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';

export default function AgeingScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ summary: any; customers: any[] }>({
    summary: { b0_30: 0, b31_60: 0, b61_90: 0, b90_plus: 0 },
    customers: []
  });

  // Allocation modal state
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [allocationModalVisible, setAllocationModalVisible] = useState(false);
  const [availablePayments, setAvailablePayments] = useState<any[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({}); // invoiceId -> amount string

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getReceivableAgeing();
      setData(res);
    } catch (err: any) {
      alert(err.message || 'Failed to load ageing report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAllocationModal = async (cust: any) => {
    setSelectedCustomer(cust);
    setAllocationAmounts({});
    setSelectedPayment(null);
    try {
      // Fetch payments for this specific customer
      const allPayments = await api.getPayments();
      // Filter out payments that are customer receipts, match the customer's name, and have unallocated amounts
      const custPayments = allPayments.filter((p: any) => 
        p.partyType === 'Customer' && 
        p.type === 'receive' &&
        (p.partyName?.toLowerCase() === cust.customerName.toLowerCase())
      );
      setAvailablePayments(custPayments);
      setAllocationModalVisible(true);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch customer payments');
    }
  };

  const autoDistributePayment = () => {
    if (!selectedPayment || !selectedCustomer) return;
    const totalToAllocate = selectedPayment.amount;
    let remaining = totalToAllocate;
    const newAllocations: Record<string, string> = {};

    // Sort customer's invoices oldest first (highest daysOld first)
    const sortedInvoices = [...selectedCustomer.invoices].sort((a: any, b: any) => b.daysOld - a.daysOld);

    for (const inv of sortedInvoices) {
      if (remaining <= 0) break;
      const invOutstanding = inv.outstanding;
      const allocAmount = Math.min(remaining, invOutstanding);
      newAllocations[inv._id] = allocAmount.toFixed(2);
      remaining -= allocAmount;
    }

    setAllocationAmounts(newAllocations);
  };

  const handleSaveAllocation = async () => {
    if (!selectedPayment) {
      alert('Please select a payment receipt first');
      return;
    }

    const payloadAllocations = Object.entries(allocationAmounts)
      .map(([invoiceId, amtStr]) => ({
        invoiceId,
        amount: parseFloat(amtStr) || 0
      }))
      .filter(a => a.amount > 0);

    if (payloadAllocations.length === 0) {
      alert('Please allocate a non-zero amount to at least one invoice');
      return;
    }

    const totalAllocated = payloadAllocations.reduce((sum, a) => sum + a.amount, 0);
    if (totalAllocated > selectedPayment.amount) {
      alert(`Allocated total (₹${totalAllocated}) exceeds payment receipt amount (₹${selectedPayment.amount})`);
      return;
    }

    try {
      setLoading(true);
      await api.allocatePayment(selectedPayment._id, payloadAllocations);
      setAllocationModalVisible(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to allocate payment');
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return `₹${Math.round(val).toLocaleString('en-IN')}`;
  };

  if (loading && data.customers.length === 0) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 8, color: colors.text.muted }}>Calculating Brackets...</Text>
      </View>
    );
  }

  const { summary } = data;
  const totalReceivables = summary.b0_30 + summary.b31_60 + summary.b61_90 + summary.b90_plus;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: Spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <View>
          <Text style={styles.title}>Receivable Ageing Analysis</Text>
          <Text style={{ fontSize: 13, color: colors.text.muted }}>Outstanding sales invoices grouped by age brackets</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadData}>
          <Ionicons name="refresh-outline" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Widget */}
      <View style={[styles.grid, { flexDirection: isDesktop ? 'row' : 'column', gap: 12, marginBottom: 20 }]}>
        <View style={[styles.card, { flex: 1, borderLeftWidth: 5, borderLeftColor: colors.success }]}>
          <Text style={styles.cardLabel}>0 - 30 Days</Text>
          <Text style={[styles.cardValue, { color: colors.success }]}>{formatCurrency(summary.b0_30)}</Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressBar, { width: `${(summary.b0_30 / (totalReceivables || 1)) * 100}%`, backgroundColor: colors.success }]} />
          </View>
        </View>

        <View style={[styles.card, { flex: 1, borderLeftWidth: 5, borderLeftColor: colors.info }]}>
          <Text style={styles.cardLabel}>31 - 60 Days</Text>
          <Text style={[styles.cardValue, { color: colors.info }]}>{formatCurrency(summary.b31_60)}</Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressBar, { width: `${(summary.b31_60 / (totalReceivables || 1)) * 100}%`, backgroundColor: colors.info }]} />
          </View>
        </View>

        <View style={[styles.card, { flex: 1, borderLeftWidth: 5, borderLeftColor: colors.warning }]}>
          <Text style={styles.cardLabel}>61 - 90 Days</Text>
          <Text style={[styles.cardValue, { color: colors.warning }]}>{formatCurrency(summary.b61_90)}</Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressBar, { width: `${(summary.b61_90 / (totalReceivables || 1)) * 100}%`, backgroundColor: colors.warning }]} />
          </View>
        </View>

        <View style={[styles.card, { flex: 1, borderLeftWidth: 5, borderLeftColor: colors.danger }]}>
          <Text style={styles.cardLabel}>90+ Days (Overdue)</Text>
          <Text style={[styles.cardValue, { color: colors.danger }]}>{formatCurrency(summary.b90_plus)}</Text>
          <View style={styles.progressBg}>
            <View style={[styles.progressBar, { width: `${(summary.b90_plus / (totalReceivables || 1)) * 100}%`, backgroundColor: colors.danger }]} />
          </View>
        </View>
      </View>

      {/* Customer Wise breakdown */}
      <Text style={styles.sectionTitle}>Breakdown By Customer ({data.customers.length})</Text>
      
      {data.customers.map((cust, idx) => (
        <View key={idx} style={styles.customerBlock}>
          <View style={styles.customerHeader}>
            <View>
              <Text style={styles.customerName}>{cust.customerName}</Text>
              <Text style={{ fontSize: 11, color: colors.text.muted }}>{cust.invoices.length} outstanding invoices</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={styles.customerOutstanding}>DR. {Math.round(cust.totalOutstanding).toLocaleString('en-IN')}</Text>
              <TouchableOpacity style={styles.allocateBtn} onPress={() => openAllocationModal(cust)}>
                <Ionicons name="link-outline" size={12} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Match Bill</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Invoices List */}
          <View style={styles.invoiceTable}>
            {cust.invoices.map((inv: any) => (
              <View key={inv._id} style={styles.invoiceRow}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.invoiceNo}>{inv.invoiceNo || 'Draft Invoice'}</Text>
                  <Text style={{ fontSize: 10.5, color: colors.text.muted }}>Date: {new Date(inv.date).toLocaleDateString('en-IN')}</Text>
                </View>
                <View style={{ flex: 1.5, alignItems: 'center' }}>
                  <View style={[styles.badge, { 
                    backgroundColor: inv.bracket.includes('90+') ? colors.danger + '18' : inv.bracket.includes('61-90') ? colors.warning + '18' : colors.success + '18',
                    borderColor: inv.bracket.includes('90+') ? colors.danger : inv.bracket.includes('61-90') ? colors.warning : colors.success,
                  }]}>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: inv.bracket.includes('90+') ? colors.danger : inv.bracket.includes('61-90') ? colors.warning : colors.success }}>
                      {inv.daysOld} Days Old
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                  <Text style={styles.invoiceOut}>₹{Math.round(inv.outstanding).toLocaleString('en-IN')}</Text>
                  <Text style={{ fontSize: 9.5, color: colors.text.muted }}>of ₹{Math.round(inv.amount).toLocaleString('en-IN')}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}

      {data.customers.length === 0 && (
        <View style={{ padding: 30, alignItems: 'center', backgroundColor: colors.bg.secondary, borderRadius: 12 }}>
          <Ionicons name="checkmark-done-circle" size={42} color={colors.success} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary, marginTop: 8 }}>All Receivables Settled!</Text>
          <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>No outstanding invoices found.</Text>
        </View>
      )}

      {/* Bill-Wise Allocation Modal */}
      <Modal animationType="slide" presentationStyle="formSheet" visible={allocationModalVisible} onRequestClose={() => setAllocationModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setAllocationModalVisible(false)}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Bill-Wise Matching</Text>
            <TouchableOpacity onPress={handleSaveAllocation}>
              <Ionicons name="checkmark" size={24} color={colors.success} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
            <Text style={{ fontSize: 11, color: colors.text.muted, textTransform: 'uppercase', fontWeight: '800' }}>Customer</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary, marginBottom: 14 }}>{selectedCustomer?.customerName}</Text>

            <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary, marginBottom: 6 }}>1. Select Customer Payment Receipt Record</Text>
            {availablePayments.length > 0 ? (
              <View style={{ gap: 6, marginBottom: 16 }}>
                {availablePayments.map((p) => (
                  <TouchableOpacity 
                    key={p._id} 
                    style={[styles.paymentSelectCard, selectedPayment?._id === p._id && { borderColor: colors.primary, backgroundColor: colors.primary + '08' }]}
                    onPress={() => setSelectedPayment(p)}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary }}>Receipt No: {p.referenceNo || p._id.slice(-6).toUpperCase()}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.success }}>₹{p.amount.toLocaleString('en-IN')}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>Received Date: {new Date(p.date).toLocaleDateString('en-IN')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={{ fontSize: 11, color: colors.text.muted, fontStyle: 'italic', marginBottom: 16 }}>No unallocated payment receipt logs available for this customer.</Text>
            )}

            {selectedPayment && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary }}>2. Distribute Receipt Amount</Text>
                  <TouchableOpacity style={styles.autoBtn} onPress={autoDistributePayment}>
                    <Ionicons name="flash-outline" size={12} color={colors.primary} />
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.primary }}>Auto-Distribute (FIFO)</Text>
                  </TouchableOpacity>
                </View>

                {selectedCustomer?.invoices.map((inv: any) => {
                  const allocatedVal = parseFloat(allocationAmounts[inv._id] || '0') || 0;
                  return (
                    <View key={inv._id} style={styles.allocRow}>
                      <View style={{ flex: 2 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary }}>{inv.invoiceNo}</Text>
                        <Text style={{ fontSize: 10, color: colors.text.muted }}>Outstanding: ₹{Math.round(inv.outstanding).toLocaleString('en-IN')}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <TouchableOpacity 
                          style={styles.fullMatchBtn} 
                          onPress={() => setAllocationAmounts(prev => ({ ...prev, [inv._id]: inv.outstanding.toString() }))}
                        >
                          <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '700' }}>Match Full</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 12, color: colors.success, fontWeight: '700' }}>₹{allocatedVal.toFixed(2)}</Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.primary
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.primary
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08'
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  card: {
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.muted,
    textTransform: 'uppercase'
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 8
  },
  progressBg: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden'
  },
  progressBar: {
    height: '100%',
    borderRadius: 2
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  customerBlock: {
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden'
  },
  customerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.bg.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  customerName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text.primary
  },
  customerOutstanding: {
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.primary
  },
  allocateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6
  },
  invoiceTable: {
    backgroundColor: colors.bg.primary + '40'
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '40'
  },
  invoiceNo: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary
  },
  invoiceOut: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.text.primary
  },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.bg.primary
  },
  modalHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg.secondary
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary
  },
  paymentSelectCard: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10
  },
  autoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm
  },
  allocRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg.secondary,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6
  },
  fullMatchBtn: {
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4
  }
});
