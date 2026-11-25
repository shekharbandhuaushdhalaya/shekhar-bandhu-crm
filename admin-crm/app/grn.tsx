import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from '../components/AppText';
import { PageHeader } from '../components/PageHeader';
import { StatusPill, EmptyState } from '../components/WorkspacePrimitives';
import { api } from '../utils/api';
import { useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { useTheme, useStyles } from '../utils/themeContext';
import { LightColors, Radius, Spacing, Typography } from '../constants/theme';

type Grn = {
  _id: string;
  grnNo: string;
  poNo?: string;
  poId?: string;
  vendorName?: string;
  receivedDate?: string;
  gateEntryNo?: string;
  vehicleNo?: string;
  driverName?: string;
  transporterName?: string;
  eWayBillNo?: string;
  gateInAt?: string;
  grossWeight?: number | null;
  tareWeight?: number | null;
  netWeight?: number | null;
  weightUnit?: string;
  weighmentSlipRef?: string;
  status: 'draft' | 'pending_verification' | 'verified' | 'rejected';
  receivedByUserId?: string;
  receivedByName?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  verificationNotes?: string;
  rejectionReason?: string;
  items?: Array<{ name?: string; qtyReceived?: number; qtyAccepted?: number; qtyRejected?: number; unit?: string; batchNo?: string; supplierCoaRef?: string; supplierCoaNo?: string; supplierCoaDate?: string; supplierCoaLabName?: string; supplierCoaBatchNo?: string; supplierCoaDocumentRef?: string; supplierCoaReviewStatus?: 'not_reviewed' | 'reviewed'; supplierCoaReviewedByName?: string; supplierCoaReviewedAt?: string; rawMaterialId?: string }>;
};

const STATUS_OPTIONS = [
  { label: 'Pending', value: 'pending_verification' },
  { label: 'Verified', value: 'verified' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All', value: 'all' },
];

const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function GoodsReceivedNotesScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuth();
  const permission = usePermission();
  const canView = permission.can('vendor:view');
  const canVerify = permission.can('manufacturing:qcApprove');
  const [items, setItems] = useState<Grn[]>([]);
  const [selected, setSelected] = useState<Grn | null>(null);
  const [status, setStatus] = useState('pending_verification');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<'verified' | 'rejected'>('verified');
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (showRefresh = false) => {
    if (!canView) { setLoading(false); return; }
    if (showRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const result = await api.getGoodsReceivedNotes({ search: search.trim(), status, page, limit: 20 });
      setItems(result.items || []);
      setTotal(result.total || 0);
      setTotalPages(Math.max(1, result.totalPages || 1));
    } catch (err: any) {
      setError(err?.message || 'Unable to load goods received notes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canView, search, status, page]);

  useEffect(() => {
    const timer = setTimeout(() => { load(); }, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const openDetail = async (item: Grn) => {
    setSelected(item);
    try {
      const detail = await api.getGoodsReceivedNote(item._id);
      setSelected(detail);
    } catch (err: any) {
      setError(err?.message || 'Unable to load GRN details');
    }
  };

  const openReview = (nextDecision: 'verified' | 'rejected') => {
    setDecision(nextDecision);
    setNotes('');
    setRejectionReason('');
    setReviewOpen(true);
  };

  const submitReview = async () => {
    if (!selected || !notes.trim() || (decision === 'rejected' && !rejectionReason.trim())) return;
    setBusy(true);
    try {
      const updated = await api.verifyGoodsReceivedNote(selected._id, {
        decision,
        verificationNotes: notes.trim(),
        ...(decision === 'rejected' ? { rejectionReason: rejectionReason.trim() } : {}),
      });
      setSelected(updated);
      setReviewOpen(false);
      await load(true);
    } catch (err: any) {
      setError(err?.message || 'Unable to submit GRN review');
    } finally {
      setBusy(false);
    }
  };

  const isOwnReceipt = Boolean(user?.id && selected?.receivedByUserId && String(user.id) === String(selected.receivedByUserId));
  const canActOnSelected = Boolean(selected?.status === 'pending_verification' && canVerify && !isOwnReceipt);

  if (!canView && permission.permissions !== null) {
    return <View style={styles.container}><PageHeader title="Goods Received Notes" subtitle="You do not have permission to view GRN records." /></View>;
  }

  return (
    <View style={styles.container}>
      <PageHeader title="Goods Received Notes" subtitle="Incoming receipt register and independent supplier-document verification" />
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.text.muted} />
          <TextInput value={search} onChangeText={value => { setSearch(value); setPage(1); }} placeholder="Search GRN, PO or supplier" placeholderTextColor={colors.text.muted} style={styles.searchInput} />
          {search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={colors.text.muted} /></Pressable> : null}
        </View>
        <View style={styles.filters}>
          {STATUS_OPTIONS.map(option => (
            <Pressable key={option.value} onPress={() => { setStatus(option.value); setPage(1); }} style={[styles.filterChip, status === option.value && styles.filterChipActive]}>
              <Text style={[styles.filterText, status === option.value && styles.filterTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.countText}>{total} record{total === 1 ? '' : 's'}</Text>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View> : (
        <ScrollView contentContainerStyle={styles.listContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
          {items.length === 0 ? <EmptyState title="No GRNs found" message="No goods received notes match the selected filter." /> : items.map(item => (
            <Pressable key={item._id} onPress={() => openDetail(item)} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.grnNo}>{item.grnNo || 'GRN'}</Text>
                  <Text style={styles.vendor}>{item.vendorName || 'Supplier not recorded'}</Text>
                </View>
                <StatusPill label={item.status.replaceAll('_', ' ')} tone={item.status === 'verified' ? 'success' : item.status === 'rejected' ? 'danger' : item.status === 'pending_verification' ? 'warning' : 'neutral'} />
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>PO: {item.poNo || '—'}</Text>
                <Text style={styles.meta}>{formatDate(item.receivedDate)}</Text>
              </View>
              <Text style={styles.meta}>Received by: {item.receivedByName || 'Not recorded'}</Text>
            </Pressable>
          ))}
          <View style={styles.pagination}>
            <Pressable disabled={page <= 1} onPress={() => setPage(value => Math.max(1, value - 1))} style={[styles.pageButton, page <= 1 && styles.disabled]}><Text style={styles.pageButtonText}>Previous</Text></Pressable>
            <Text style={styles.meta}>Page {page} of {totalPages}</Text>
            <Pressable disabled={page >= totalPages} onPress={() => setPage(value => Math.min(totalPages, value + 1))} style={[styles.pageButton, page >= totalPages && styles.disabled]}><Text style={styles.pageButtonText}>Next</Text></Pressable>
          </View>
        </ScrollView>
      )}

      <Modal visible={Boolean(selected)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelected(null)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}><Text style={styles.modalTitle}>{selected?.grnNo || 'GRN details'}</Text><Text style={styles.meta}>{selected?.vendorName || 'Supplier'}</Text></View>
            <Pressable onPress={() => setSelected(null)}><Ionicons name="close" size={26} color={colors.text.primary} /></Pressable>
          </View>
          {selected ? <ScrollView contentContainerStyle={styles.detailContent}>
            <View style={styles.detailCard}>
              <Text style={styles.sectionTitle}>Receipt and verification</Text>
              <Text style={styles.detailLine}>Status: {selected.status.replace('_', ' ')}</Text>
              <Text style={styles.detailLine}>Purchase order: {selected.poNo || selected.poId || '—'}</Text>
              <Text style={styles.detailLine}>Received: {formatDate(selected.receivedDate)}</Text>
              <Text style={styles.detailLine}>Received by: {selected.receivedByName || 'Not recorded'}</Text>
              <Text style={styles.detailLine}>Gate entry: {selected.gateEntryNo || 'Not recorded'}</Text>
              <Text style={styles.detailLine}>Vehicle: {selected.vehicleNo || 'Not recorded'}</Text>
              <Text style={styles.detailLine}>Driver / transporter: {[selected.driverName, selected.transporterName].filter(Boolean).join(' / ') || 'Not recorded'}</Text>
              <Text style={styles.detailLine}>Gate-in time: {selected.gateInAt ? new Date(selected.gateInAt).toLocaleString('en-IN') : 'Not recorded'}</Text>
              {selected.eWayBillNo ? <Text style={styles.detailLine}>e-Way Bill reference: {selected.eWayBillNo}</Text> : null}
              {selected.netWeight !== undefined && selected.netWeight !== null ? <Text style={styles.detailLine}>Weighment: Gross {selected.grossWeight} − Tare {selected.tareWeight} = Net {selected.netWeight} {selected.weightUnit || 'kg'} · Slip: {selected.weighmentSlipRef || 'Missing'}</Text> : <Text style={styles.detailLine}>Weighment: Not recorded</Text>}
              <Text style={styles.detailLine}>Verified by: {selected.verifiedByName || 'Not yet verified'}</Text>
              <Text style={styles.detailLine}>Verified at: {formatDate(selected.verifiedAt)}</Text>
              {selected.verificationNotes ? <Text style={styles.detailLine}>Reviewer notes: {selected.verificationNotes}</Text> : null}
              {selected.rejectionReason ? <Text style={styles.detailLine}>Rejection reason: {selected.rejectionReason}</Text> : null}
            </View>
            <Text style={styles.sectionTitle}>Received line items</Text>
            {(selected.items || []).map((line, index) => (
              <View key={String(index)} style={styles.lineCard}>
                <Text style={styles.lineName}>{line.name || 'Unnamed item'}</Text>
                <Text style={styles.detailLine}>Received: {line.qtyReceived ?? '—'} {line.unit || ''} · Accepted: {line.qtyAccepted ?? '—'} · Rejected: {line.qtyRejected ?? '—'}</Text>
                <Text style={styles.detailLine}>Supplier lot: {line.batchNo || '—'}</Text>
                {line.rawMaterialId ? <><Text style={styles.detailLine}>Supplier CoA reference / number: {line.supplierCoaRef || 'Missing'} / {line.supplierCoaNo || 'Missing'}</Text><Text style={styles.detailLine}>CoA date / laboratory: {formatDate(line.supplierCoaDate)} · {line.supplierCoaLabName || 'Not recorded'}</Text><Text style={styles.detailLine}>CoA batch / received batch: {line.supplierCoaBatchNo || 'Missing'} / {line.batchNo || 'Missing'}</Text><Text style={styles.detailLine}>Source document reference: {line.supplierCoaDocumentRef || 'Missing'}</Text><Text style={styles.detailLine}>Independent CoA review: {line.supplierCoaReviewStatus === 'reviewed' ? `Reviewed by ${line.supplierCoaReviewedByName || 'reviewer'} on ${formatDate(line.supplierCoaReviewedAt)}` : 'Pending'}</Text></> : null}
              </View>
            ))}
            {selected.status === 'pending_verification' && isOwnReceipt ? <Text style={styles.warningText}>Maker-checker control: the person who recorded this receipt cannot verify it.</Text> : null}
            {selected.status === 'pending_verification' && canVerify && !isOwnReceipt ? <View style={styles.actionRow}>
              <Pressable onPress={() => openReview('verified')} style={[styles.actionButton, styles.approveButton]}><Text style={styles.actionText}>Verify receipt</Text></Pressable>
              <Pressable onPress={() => openReview('rejected')} style={[styles.actionButton, styles.rejectButton]}><Text style={styles.actionText}>Reject</Text></Pressable>
            </View> : null}
            {selected.status === 'pending_verification' && !canVerify ? <Text style={styles.meta}>Independent verification requires manufacturing:qcApprove permission.</Text> : null}
            <Text style={styles.disclaimer}>GRN verification confirms the receipt record and referenced supplier documents only. Incoming material remains under quarantine/testing until the separate QC disposition workflow is completed. A CoA reference is not itself a validated document attachment.</Text>
          </ScrollView> : null}
        </View>
      </Modal>

      <Modal visible={reviewOpen} transparent animationType="fade" onRequestClose={() => setReviewOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.reviewCard}>
            <Text style={styles.modalTitle}>{decision === 'verified' ? 'Verify GRN' : 'Reject GRN'}</Text>
            <Text style={styles.meta}>Enter a meaningful independent review note. The server enforces maker-checker separation and required CoA references.</Text>
            <Text style={styles.fieldLabel}>Verification notes *</Text>
            <TextInput multiline value={notes} onChangeText={setNotes} placeholder="Record checks performed and findings" placeholderTextColor={colors.text.muted} style={styles.textArea} />
            {decision === 'rejected' ? <>
              <Text style={styles.fieldLabel}>Rejection reason *</Text>
              <TextInput multiline value={rejectionReason} onChangeText={setRejectionReason} placeholder="Explain why the receipt is rejected" placeholderTextColor={colors.text.muted} style={styles.textArea} />
            </> : null}
            <View style={styles.actionRow}>
              <Pressable disabled={busy} onPress={() => setReviewOpen(false)} style={[styles.actionButton, styles.cancelButton]}><Text style={styles.cancelText}>Cancel</Text></Pressable>
              <Pressable disabled={busy || !notes.trim() || (decision === 'rejected' && !rejectionReason.trim())} onPress={submitReview} style={[styles.actionButton, decision === 'verified' ? styles.approveButton : styles.rejectButton, (busy || !notes.trim() || (decision === 'rejected' && !rejectionReason.trim())) && styles.disabled]}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{decision === 'verified' ? 'Confirm verification' : 'Confirm rejection'}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  toolbar: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.sm },
  searchBox: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg.card },
  searchInput: { flex: 1, color: colors.text.primary, ...Typography.bodySm, paddingVertical: 8, outlineStyle: 'none' as any },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.text.secondary, ...Typography.caption, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  countText: { color: colors.text.muted, ...Typography.caption },
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 40, gap: 10 },
  card: { backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, padding: Spacing.md, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grnNo: { color: colors.text.primary, ...Typography.body, fontWeight: '700' },
  vendor: { color: colors.text.secondary, ...Typography.bodySm, marginTop: 3 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  meta: { color: colors.text.muted, ...Typography.caption },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  pageButton: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
  pageButtonText: { color: colors.text.primary, ...Typography.caption, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.danger, paddingHorizontal: Spacing.lg, ...Typography.bodySm },
  modal: { flex: 1, backgroundColor: colors.bg.primary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { color: colors.text.primary, ...Typography.h2, fontWeight: '700' },
  detailContent: { padding: Spacing.lg, gap: 12 },
  detailCard: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, padding: Spacing.md, gap: 6, backgroundColor: colors.bg.card },
  sectionTitle: { color: colors.text.primary, ...Typography.body, fontWeight: '700', marginBottom: 2 },
  detailLine: { color: colors.text.secondary, ...Typography.bodySm },
  lineCard: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, padding: Spacing.md, gap: 5 },
  lineName: { color: colors.text.primary, ...Typography.bodySm, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' },
  actionButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', flex: 1 },
  approveButton: { backgroundColor: colors.success },
  rejectButton: { backgroundColor: colors.danger },
  cancelButton: { borderWidth: 1, borderColor: colors.border },
  actionText: { color: '#fff', ...Typography.bodySm, fontWeight: '700' },
  cancelText: { color: colors.text.primary, ...Typography.bodySm, fontWeight: '600' },
  warningText: { color: colors.warning, ...Typography.bodySm, fontWeight: '600' },
  disclaimer: { color: colors.text.muted, ...Typography.caption, lineHeight: 18, marginTop: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: Spacing.lg },
  reviewCard: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, gap: 10 },
  fieldLabel: { color: colors.text.primary, ...Typography.bodySm, fontWeight: '700' },
  textArea: { minHeight: 76, maxHeight: 140, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.sm, padding: 10, color: colors.text.primary, ...Typography.bodySm, textAlignVertical: 'top' },
});
