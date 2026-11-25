import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PageHeader as ScreenHeader } from '../components/PageHeader';
import { AppTextInput as TextInput } from '../components/AppTextInput';
import { PressableOpacity as TouchableOpacity } from '../components/PressableOpacity';
import { AppText as Text } from '../components/AppText';
import { Spacing, Radius, Typography } from '../constants/theme';
import { api } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';

type ReturnCondition = 'saleable' | 'damaged' | 'expired' | 'other';
type ModalMode = 'create' | 'qc' | 'reverse' | null;

export default function SalesReturnsPage() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [returns, setReturns] = useState<any[]>([]);
  const [challans, setChallans] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<ModalMode>(null);
  const [selectedChallan, setSelectedChallan] = useState<any>(null);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [qty, setQty] = useState('1');
  const [condition, setCondition] = useState<ReturnCondition>('saleable');
  const [reason, setReason] = useState('');
  const [reviewReturn, setReviewReturn] = useState<any>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [disposition, setDisposition] = useState<'approved' | 'rejected'>('approved');
  const [reviewNotes, setReviewNotes] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [rows, challanRows] = await Promise.all([api.getSalesReturns(), api.getChallans()]);
      setReturns(Array.isArray(rows) ? rows : []);
      setChallans((Array.isArray(challanRows) ? challanRows : []).filter((c: any) =>
        c.challanType === 'sale' && c.status === 'finalized' && c.inventoryPostingStatus === 'posted'
      ));
    } catch (e: any) {
      setError(e?.message || 'Unable to load sales returns');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startCreate = () => {
    setSelectedChallan(null);
    setSelectedItem(null);
    setQty('1');
    setCondition('saleable');
    setReason('');
    setModal('create');
  };

  const createDraft = async () => {
    if (!selectedChallan || !selectedItem || !(Number(qty) > 0) || !reason.trim()) {
      Alert.alert('Missing return details', 'Select a posted Challan and item, then enter a positive quantity and reason.');
      return;
    }
    try {
      setSaving(true);
      await api.createSalesReturn({
        challanId: selectedChallan._id,
        warehouseId: selectedChallan.warehouseId,
        resolution: 'credit_note',
        items: [{
          productId: selectedItem.productId,
          name: selectedItem.name,
          batchNo: selectedItem.batchNo || '',
          qty: Number(qty),
          packing: selectedItem.packing || 1,
          vendorId: selectedItem.vendorId || '',
          condition,
          reason: reason.trim()
        }]
      });
      setModal(null);
      await load();
    } catch (e: any) { Alert.alert('Could not create return', e?.message || 'Please retry'); }
    finally { setSaving(false); }
  };

  const postDraft = async (row: any) => {
    try {
      setSaving(true);
      await api.postSalesReturn(row._id);
      await load();
    } catch (e: any) { Alert.alert('Could not post return', e?.message || 'Please retry'); }
    finally { setSaving(false); }
  };

  const openQc = (row: any, index: number) => {
    setReviewReturn(row);
    setReviewIndex(index);
    setDisposition('approved');
    setReviewNotes('');
    setModal('qc');
  };

  const saveQc = async () => {
    if (reviewNotes.trim().length < 10) {
      Alert.alert('QA notes required', 'Enter at least 10 characters describing the independent inspection.');
      return;
    }
    try {
      setSaving(true);
      await api.dispositionSalesReturnItem(reviewReturn._id, reviewIndex, { disposition, notes: reviewNotes.trim() });
      setModal(null);
      await load();
    } catch (e: any) { Alert.alert('Could not record QA disposition', e?.message || 'Please retry'); }
    finally { setSaving(false); }
  };

  const saveReversal = async () => {
    if (reason.trim().length < 10) {
      Alert.alert('Reason required', 'Enter a substantive reversal reason of at least 10 characters.');
      return;
    }
    try {
      setSaving(true);
      await api.reverseSalesReturn(reviewReturn._id, reason.trim());
      setModal(null);
      await load();
    } catch (e: any) { Alert.alert('Could not reverse return', e?.message || 'Please retry'); }
    finally { setSaving(false); }
  };

  const postedChallans = useMemo(() => challans.slice(0, 100), [challans]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Sales returns" subtitle="Trace returns to posted Challans, hold returned goods for QA, and retain credit/reversal evidence." />
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.primaryButton} onPress={startCreate}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>New return</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={load}>
          <Ionicons name="refresh" size={17} color={colors.text.primary} />
          <Text style={styles.secondaryButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}>
        {loading && returns.length === 0 ? <ActivityIndicator color={colors.primary} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!loading && returns.length === 0 ? <Text style={styles.empty}>No sales returns recorded yet.</Text> : null}
        {returns.map(row => (
          <View key={row._id} style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{row.returnNo}</Text>
                <Text style={styles.muted}>Challan {row.challanNo || '—'} · {row.customerName || 'Customer'}</Text>
              </View>
              <Text style={[styles.status, row.status === 'posted' ? styles.statusPosted : null]}>{String(row.status || '').toUpperCase()}</Text>
            </View>
            <Text style={styles.amount}>₹{Number(row.totalAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
            {(row.items || []).map((item: any, index: number) => (
              <View key={index} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{item.name} · {item.batchNo || 'Batch not recorded'}</Text>
                  <Text style={styles.muted}>Qty {item.qty} · {item.condition} · QC {item.qcDisposition || 'pending'}</Text>
                </View>
                {row.status === 'posted' && (!item.qcDisposition || item.qcDisposition === 'pending') ? (
                  <TouchableOpacity style={styles.smallButton} onPress={() => openQc(row, index)}>
                    <Text style={styles.smallButtonText}>QA review</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
            {row.status === 'draft' ? (
              <TouchableOpacity style={styles.actionButton} disabled={saving} onPress={() => postDraft(row)}>
                <Text style={styles.actionText}>Post return and place stock on QC hold</Text>
              </TouchableOpacity>
            ) : null}
            {row.status === 'posted' ? (
              <TouchableOpacity style={styles.dangerButton} disabled={saving} onPress={() => { setReviewReturn(row); setReason(''); setModal('reverse'); }}>
                <Text style={styles.dangerText}>Reverse posted return</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <Modal visible={modal !== null} transparent animationType="slide" onRequestClose={() => setModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.row}>
              <Text style={styles.modalTitle}>{modal === 'create' ? 'Create sales return' : modal === 'qc' ? 'Returned-stock QA review' : 'Reverse sales return'}</Text>
              <TouchableOpacity onPress={() => setModal(null)}><Ionicons name="close" size={22} color={colors.text.primary} /></TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              {modal === 'create' ? (
                <>
                  {!selectedChallan ? (
                    <>
                      <Text style={styles.fieldLabel}>Select original posted Sale Challan</Text>
                      {postedChallans.map(c => (
                        <TouchableOpacity key={c._id} style={styles.choice} onPress={() => setSelectedChallan(c)}>
                          <Text style={styles.choiceTitle}>{c.challanNo || c._id}</Text>
                          <Text style={styles.muted}>{c.customerName || c.partyName || 'Customer'} · {new Date(c.date || c.createdAt).toLocaleDateString('en-IN')}</Text>
                        </TouchableOpacity>
                      ))}
                      {postedChallans.length === 0 ? <Text style={styles.empty}>No posted sale Challans available.</Text> : null}
                    </>
                  ) : (
                    <>
                      <TouchableOpacity onPress={() => { setSelectedChallan(null); setSelectedItem(null); }}>
                        <Text style={styles.linkText}>← Choose a different Challan ({selectedChallan.challanNo || selectedChallan._id})</Text>
                      </TouchableOpacity>
                      <Text style={styles.fieldLabel}>Select returned item and batch</Text>
                      {(selectedChallan.items || []).map((item: any, index: number) => (
                        <TouchableOpacity key={index} style={[styles.choice, selectedItem === item ? styles.choiceSelected : null]} onPress={() => setSelectedItem(item)}>
                          <Text style={styles.choiceTitle}>{item.name} · {item.batchNo || 'No batch recorded'}</Text>
                          <Text style={styles.muted}>Dispatched qty {item.qty} · rate ₹{item.rate || 0}</Text>
                        </TouchableOpacity>
                      ))}
                      {selectedItem ? (
                        <>
                          <Text style={styles.fieldLabel}>Return quantity</Text>
                          <TextInput value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="Quantity" />
                          <Text style={styles.fieldLabel}>Reported condition</Text>
                          <View style={styles.wrap}>
                            {(['saleable','damaged','expired','other'] as ReturnCondition[]).map(value => (
                              <TouchableOpacity key={value} style={[styles.chip, condition === value ? styles.chipSelected : null]} onPress={() => setCondition(value)}>
                                <Text style={[styles.chipText, condition === value ? styles.chipTextSelected : null]}>{value}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <Text style={styles.fieldLabel}>Return reason</Text>
                          <TextInput value={reason} onChangeText={setReason} placeholder="Reason for return" multiline />
                        </>
                      ) : null}
                    </>
                  )}
                </>
              ) : null}
              {modal === 'qc' ? (
                <>
                  <Text style={styles.muted}>Return {reviewReturn?.returnNo} · line {reviewIndex + 1}. The return poster cannot approve this stock.</Text>
                  <Text style={styles.fieldLabel}>Independent QA disposition</Text>
                  <View style={styles.wrap}>
                    {(['approved','rejected'] as const).map(value => (
                      <TouchableOpacity key={value} style={[styles.chip, disposition === value ? styles.chipSelected : null]} onPress={() => setDisposition(value)}>
                        <Text style={[styles.chipText, disposition === value ? styles.chipTextSelected : null]}>{value}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.fieldLabel}>Inspection notes / evidence</Text>
                  <TextInput value={reviewNotes} onChangeText={setReviewNotes} placeholder="Describe identity, condition and inspection evidence" multiline />
                </>
              ) : null}
              {modal === 'reverse' ? (
                <>
                  <Text style={styles.muted}>Return {reviewReturn?.returnNo}. Reversal is blocked if the returned stock has already been consumed.</Text>
                  <Text style={styles.fieldLabel}>Substantive reversal reason</Text>
                  <TextInput value={reason} onChangeText={setReason} placeholder="Explain why this posted return must be reversed" multiline />
                </>
              ) : null}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setModal(null)}><Text style={styles.secondaryButtonText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} disabled={saving} onPress={modal === 'create' ? createDraft : modal === 'qc' ? saveQc : saveReversal}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryButtonText}>{modal === 'create' ? 'Save draft' : modal === 'qc' ? 'Record QA disposition' : 'Reverse return'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  toolbar: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  content: { padding: Spacing.lg, paddingBottom: 40, gap: 12 },
  card: { backgroundColor: colors.bg.secondary, borderColor: colors.border, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { ...Typography.body, fontWeight: '700', color: colors.text.primary },
  muted: { ...Typography.caption, color: colors.text.secondary },
  amount: { ...Typography.h3, color: colors.text.primary, fontWeight: '700' },
  status: { ...Typography.caption, fontWeight: '700', color: colors.text.secondary },
  statusPosted: { color: colors.success || colors.primary },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  itemTitle: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '600' },
  primaryButton: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryButtonText: { ...Typography.bodySm, color: '#fff', fontWeight: '700' },
  secondaryButton: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', gap: 6 },
  secondaryButtonText: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '600' },
  smallButton: { backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.sm },
  smallButtonText: { ...Typography.caption, color: colors.primary, fontWeight: '700' },
  actionButton: { backgroundColor: colors.primaryLight, borderRadius: Radius.md, padding: 12, alignItems: 'center' },
  actionText: { ...Typography.bodySm, color: colors.primary, fontWeight: '700' },
  dangerButton: { borderWidth: 1, borderColor: colors.danger, borderRadius: Radius.md, padding: 10, alignItems: 'center' },
  dangerText: { ...Typography.bodySm, color: colors.danger, fontWeight: '700' },
  empty: { ...Typography.bodySm, color: colors.text.secondary, textAlign: 'center', padding: 20 },
  error: { ...Typography.bodySm, color: colors.danger },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 18 },
  modalCard: { maxHeight: '90%', backgroundColor: colors.bg.secondary, borderRadius: Radius.lg, padding: Spacing.lg, gap: 12 },
  modalTitle: { ...Typography.h3, color: colors.text.primary, fontWeight: '700' },
  fieldLabel: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, padding: 10, marginBottom: 8 },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  choiceTitle: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '700' },
  linkText: { ...Typography.bodySm, color: colors.primary, marginBottom: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  chipText: { ...Typography.caption, color: colors.text.secondary, textTransform: 'capitalize' },
  chipTextSelected: { color: colors.primary, fontWeight: '700' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 8 }
});
