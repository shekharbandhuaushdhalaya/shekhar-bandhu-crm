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

type Requisition = {
  _id: string; requisitionNo: string; department: string; justification: string;
  status: string; requestedByName?: string; requestedByUserId?: string;
  approvedByName?: string; approvedAt?: string; requiredByDate?: string;
  items?: Array<{ name: string; qtyRequested: number; unit: string; itemType: string; notes?: string }>;
  selectedQuotationId?: string;
};
const STATUSES = [
  { label: 'Pending approval', value: 'pending_approval' }, { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' }, { label: 'Converted', value: 'converted' },
  { label: 'Draft', value: 'draft' }, { label: 'All', value: 'all' },
];
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString('en-IN') : '—';
const statusTone = (status: string) => status === 'approved' || status === 'converted' ? 'success' : status === 'rejected' ? 'danger' : status === 'pending_approval' ? 'warning' : 'neutral';

export default function PurchaseRequisitionsScreen() {
  const { colors } = useTheme(); const styles = useStyles(createStyles);
  const { user } = useAuth(); const permission = usePermission();
  const canView = permission.can('vendor:view'); const canReview = permission.can('vendor:edit');
  const [items, setItems] = useState<Requisition[]>([]); const [status, setStatus] = useState('pending_approval');
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(''); const [selected, setSelected] = useState<Requisition | null>(null);
  const [rejectReason, setRejectReason] = useState(''); const [rejectOpen, setRejectOpen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false); const [quotes, setQuotes] = useState<any[]>([]);
  const [quotesBusy, setQuotesBusy] = useState(false); const [quoteNotes, setQuoteNotes] = useState('');
  const [quoteOpen, setQuoteOpen] = useState(false);
  const canCreate = permission.can('vendor:create');
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [department, setDepartment] = useState('');
  const [justification, setJustification] = useState('');
  const [itemId, setItemId] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState('');
  const [itemQty, setItemQty] = useState('');
  const [itemType, setItemType] = useState<'raw_material' | 'finished_product'>('raw_material');
  const [draftLines, setDraftLines] = useState<any[]>([]);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!canView) { setLoading(false); return; }
    refresh ? setRefreshing(true) : setLoading(true); setError('');
    try { const result = await api.getPurchaseRequisitions({ status, page: 1, limit: 50 }); setItems(result.items || []); }
    catch (e: any) { setError(e?.message || 'Unable to load purchase requisitions'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [canView, status]);
  useEffect(() => { load(); }, [load]);

  const runAction = async (action: () => Promise<any>) => {
    setReviewBusy(true); setError('');
    try { const updated = await action(); if (selected && updated?._id === selected._id) setSelected(updated); await load(true); }
    catch (e: any) { setError(e?.message || 'The requisition action failed'); }
    finally { setReviewBusy(false); }
  };
  const openQuotes = async (item: Requisition) => {
    setSelected(item); setQuoteOpen(true); setQuotesBusy(true); setQuoteNotes(''); setQuotes([]);
    try { const result = await api.getSupplierQuotations(item._id); setQuotes(result.quotations || []); }
    catch (e: any) { setError(e?.message || 'Unable to load supplier quotations'); }
    finally { setQuotesBusy(false); }
  };
  const openCreate = () => { setDepartment(''); setJustification(''); setItemId(''); setItemName(''); setItemUnit(''); setItemQty(''); setDraftLines([]); setCreateError(''); setCreateOpen(true); };
  const addDraftLine = () => {
    const qty = Number(itemQty);
    if (!itemId.trim() || !itemName.trim() || !itemUnit.trim() || !Number.isFinite(qty) || qty <= 0) { setCreateError('Catalogue ID, item name, unit and a positive quantity are required.'); return; }
    const duplicate = draftLines.some(line => String(line.rawMaterialId || line.productId) === itemId.trim());
    if (duplicate) { setCreateError('This catalogue item is already on the requisition.'); return; }
    setDraftLines([...draftLines, { itemType, rawMaterialId: itemType === 'raw_material' ? itemId.trim() : undefined, productId: itemType === 'finished_product' ? itemId.trim() : undefined, name: itemName.trim(), unit: itemUnit.trim(), qtyRequested: qty }]);
    setItemId(''); setItemName(''); setItemUnit(''); setItemQty(''); setCreateError('');
  };
  const saveDraft = async () => {
    if (!department.trim() || !justification.trim() || draftLines.length === 0) { setCreateError('Department, justification and at least one item are required.'); return; }
    setCreateBusy(true); setCreateError('');
    try { await api.createPurchaseRequisition({ department: department.trim(), justification: justification.trim(), items: draftLines }); setCreateOpen(false); await load(true); }
    catch (e: any) { setCreateError(e?.message || 'Unable to save requisition draft'); }
    finally { setCreateBusy(false); }
  };
  const ownRequest = Boolean(user?.id && selected?.requestedByUserId && String(user.id) === String(selected.requestedByUserId));
  if (!canView && permission.permissions !== null) return <View style={styles.container}><PageHeader title="Purchase Requisitions" subtitle="You do not have permission to view requisitions." /></View>;

  return <View style={styles.container}>
    <PageHeader title="Purchase Requisitions" subtitle="Department requests, independent approval and supplier quotation review" />
    {canCreate ? <Pressable onPress={openCreate} style={styles.primary}><Text style={styles.primaryText}>+ Create requisition</Text></Pressable> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {STATUSES.map(option => <Pressable key={option.value} onPress={() => setStatus(option.value)} style={[styles.chip, status === option.value && styles.chipActive]}><Text style={[styles.chipText, status === option.value && styles.chipTextActive]}>{option.label}</Text></Pressable>)}
    </ScrollView>
    <Text style={styles.count}>{items.length} requisition{items.length === 1 ? '' : 's'} shown</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View> :
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
        {items.length === 0 ? <EmptyState title="No requisitions found" message="There are no requisitions in this status." /> : items.map(item =>
          <Pressable key={item._id} onPress={() => setSelected(item)} style={styles.card}>
            <View style={styles.cardTop}><View style={{ flex: 1 }}><Text style={styles.number}>{item.requisitionNo}</Text><Text style={styles.department}>{item.department}</Text></View><StatusPill label={item.status.replaceAll('_', ' ')} tone={statusTone(item.status)} /></View>
            <Text style={styles.meta}>Requested by: {item.requestedByName || '—'} · {item.items?.length || 0} line(s)</Text>
            <Text style={styles.meta}>Required by: {dateLabel(item.requiredByDate)}</Text>
            <View style={styles.actions}>
              {item.status === 'draft' && user?.id && String(item.requestedByUserId) === String(user.id) ? <Pressable disabled={reviewBusy} onPress={() => runAction(() => api.submitPurchaseRequisition(item._id))} style={styles.action}><Text style={styles.actionText}>Submit</Text></Pressable> : null}
              {item.status === 'pending_approval' && canReview && (!user?.id || String(item.requestedByUserId) !== String(user.id)) ? <Pressable disabled={reviewBusy} onPress={() => { setSelected(item); runAction(() => api.approvePurchaseRequisition(item._id)); }} style={styles.action}><Text style={styles.actionText}>Approve</Text></Pressable> : null}
              {item.status === 'pending_approval' && canReview && (!user?.id || String(item.requestedByUserId) !== String(user.id)) ? <Pressable disabled={reviewBusy} onPress={() => { setSelected(item); setRejectReason(''); setRejectOpen(true); }} style={[styles.action, styles.rejectAction]}><Text style={styles.rejectText}>Reject</Text></Pressable> : null}
              {item.status === 'approved' ? <Pressable onPress={() => openQuotes(item)} style={styles.action}><Text style={styles.actionText}>Compare quotations</Text></Pressable> : null}
            </View>
          </Pressable>)}
      </ScrollView>}
    <Modal visible={createOpen} animationType="slide" onRequestClose={() => setCreateOpen(false)}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}><Text style={styles.modalTitle}>New purchase requisition</Text><Pressable onPress={() => setCreateOpen(false)}><Ionicons name="close" size={24} color={colors.text.primary} /></Pressable></View>
        <ScrollView contentContainerStyle={styles.detail}>
          <Text style={styles.section}>Department *</Text><TextInput value={department} onChangeText={setDepartment} placeholder="Department" placeholderTextColor={colors.text.muted} style={styles.input} />
          <Text style={styles.section}>Business justification *</Text><TextInput value={justification} onChangeText={setJustification} multiline placeholder="Why are these items required?" placeholderTextColor={colors.text.muted} style={[styles.input, { minHeight: 84 }]} />
          <Text style={styles.section}>Item type</Text><View style={styles.actions}><Pressable onPress={() => setItemType("raw_material")} style={styles.action}><Text style={styles.actionText}>Raw material</Text></Pressable><Pressable onPress={() => setItemType("finished_product")} style={styles.action}><Text style={styles.actionText}>Finished product</Text></Pressable></View>
          <TextInput value={itemId} onChangeText={setItemId} placeholder="Catalogue record ID" placeholderTextColor={colors.text.muted} style={styles.input} />
          <TextInput value={itemName} onChangeText={setItemName} placeholder="Catalogue item name" placeholderTextColor={colors.text.muted} style={styles.input} />
          <TextInput value={itemUnit} onChangeText={setItemUnit} placeholder="Unit (kg, g, nos.)" placeholderTextColor={colors.text.muted} style={styles.input} />
          <TextInput value={itemQty} onChangeText={setItemQty} keyboardType="decimal-pad" placeholder="Quantity required" placeholderTextColor={colors.text.muted} style={styles.input} />
          <Pressable onPress={addDraftLine} style={styles.action}><Text style={styles.actionText}>Add line</Text></Pressable>
          <Text style={styles.section}>Items ({draftLines.length})</Text>
          {draftLines.map((line, index) => <View key={index} style={styles.line}><Text style={styles.body}>{line.name} · {line.qtyRequested} {line.unit}</Text><Pressable onPress={() => setDraftLines(draftLines.filter((_, i) => i !== index))}><Text style={styles.rejectText}>Remove</Text></Pressable></View>)}
          {createError ? <Text style={styles.error}>{createError}</Text> : null}
          <Pressable disabled={createBusy} onPress={saveDraft} style={styles.primary}>{createBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save draft</Text>}</Pressable>
          <Text style={styles.meta}>A saved requisition remains a draft. Only the requester can submit it; a different authorised reviewer must approve it.</Text>
        </ScrollView>
      </View>
    </Modal>
    <Modal visible={Boolean(selected) && !quoteOpen && !rejectOpen} animationType="slide" onRequestClose={() => setSelected(null)}>
      <View style={styles.modal}><View style={styles.modalHeader}><Text style={styles.modalTitle}>{selected?.requisitionNo || 'Requisition'}</Text><Pressable onPress={() => setSelected(null)}><Ionicons name="close" size={24} color={colors.text.primary} /></Pressable></View>
        <ScrollView contentContainerStyle={styles.detail}><Text style={styles.section}>Department</Text><Text style={styles.body}>{selected?.department || '—'}</Text><Text style={styles.section}>Justification</Text><Text style={styles.body}>{selected?.justification || '—'}</Text><Text style={styles.section}>Requested items</Text>
          {(selected?.items || []).map((line, index) => <View key={index} style={styles.line}><Text style={styles.body}>{line.name}</Text><Text style={styles.meta}>{line.qtyRequested} {line.unit} · {line.itemType.replaceAll('_', ' ')}</Text></View>)}
          <Text style={styles.meta}>Requested by: {selected?.requestedByName || '—'}</Text><Text style={styles.meta}>Approved by: {selected?.approvedByName || '—'} · {dateLabel(selected?.approvedAt)}</Text>
          {selected?.status === 'draft' && user?.id && String(selected.requestedByUserId) === String(user.id) ? <Pressable onPress={() => runAction(() => api.submitPurchaseRequisition(selected._id))} style={styles.primary}><Text style={styles.primaryText}>Submit for approval</Text></Pressable> : null}
          {selected?.status === 'pending_approval' && canReview && !ownRequest ? <Pressable onPress={() => runAction(() => api.approvePurchaseRequisition(selected._id))} style={styles.primary}><Text style={styles.primaryText}>Approve requisition</Text></Pressable> : null}
        </ScrollView>
      </View>
    </Modal>
    <Modal visible={rejectOpen} transparent animationType="fade" onRequestClose={() => setRejectOpen(false)}><View style={styles.overlay}><View style={styles.dialog}><Text style={styles.modalTitle}>Reject requisition</Text><Text style={styles.meta}>A reason is required and will be retained in the record.</Text><TextInput value={rejectReason} onChangeText={setRejectReason} multiline placeholder="Rejection reason" placeholderTextColor={colors.text.muted} style={styles.input} /><View style={styles.actions}><Pressable onPress={() => setRejectOpen(false)} style={styles.action}><Text style={styles.actionText}>Cancel</Text></Pressable><Pressable disabled={!rejectReason.trim() || reviewBusy} onPress={async () => { if (selected) { await runAction(() => api.rejectPurchaseRequisition(selected._id, rejectReason.trim())); setRejectOpen(false); } }} style={styles.primary}><Text style={styles.primaryText}>Confirm rejection</Text></Pressable></View></View></View></Modal>
    <Modal visible={quoteOpen} animationType="slide" onRequestClose={() => { setQuoteOpen(false); setSelected(null); }}><View style={styles.modal}><View style={styles.modalHeader}><View style={{ flex: 1 }}><Text style={styles.modalTitle}>Supplier quotations</Text><Text style={styles.meta}>{selected?.requisitionNo}</Text></View><Pressable onPress={() => { setQuoteOpen(false); setSelected(null); }}><Ionicons name="close" size={24} color={colors.text.primary} /></Pressable></View>
      <ScrollView contentContainerStyle={styles.detail}><Text style={styles.meta}>Landed cost includes quoted line value, GST, freight and other charges. The lowest value is a comparison aid, not an automatic award.</Text>{quotesBusy ? <ActivityIndicator color={colors.primary} /> : quotes.length === 0 ? <EmptyState title="No quotations recorded" message="Supplier quotations have not yet been entered for this requisition." /> : quotes.map(q => <View key={q._id} style={styles.card}><View style={styles.cardTop}><Text style={styles.number}>{q.quotationNo}</Text><StatusPill label={q.status.replaceAll('_', ' ')} tone={q.status === 'selected' ? 'success' : 'neutral'} /></View><Text style={styles.department}>{q.vendorName}</Text><Text style={styles.body}>Landed cost: ₹{Number(q.landedCost || q.totalAmount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text><Text style={styles.meta}>Delivery: {q.deliveryLeadTimeDays} days · Valid until {dateLabel(q.validUntil)}</Text><Text style={styles.meta}>Evidence reference: {q.evidenceRef || '—'}</Text>{q.status === 'pending_review' && selected?.status === 'approved' && canReview && q.submittedByUserId !== user?.id ? <><TextInput value={quoteNotes} onChangeText={setQuoteNotes} placeholder="Independent review notes (optional)" placeholderTextColor={colors.text.muted} style={styles.input} /><Pressable disabled={reviewBusy} onPress={async () => { try { setReviewBusy(true); await api.selectSupplierQuotation(selected._id, q._id, quoteNotes.trim()); const result = await api.getSupplierQuotations(selected._id); setQuotes(result.quotations || []); await load(true); } catch (e: any) { setError(e?.message || 'Unable to select quotation'); } finally { setReviewBusy(false); } }} style={styles.primary}><Text style={styles.primaryText}>Select quotation</Text></Pressable></> : null}</View>)}</ScrollView></View></Modal>
  </View>;
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary, padding: Spacing.lg },
  filters: { gap: 8, paddingVertical: Spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { ...Typography.caption, color: colors.text.secondary }, chipTextActive: { color: colors.primary, fontWeight: '700' },
  count: { ...Typography.caption, color: colors.text.muted, marginBottom: 8 },
  list: { gap: 10, paddingBottom: 30 }, card: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.md, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  number: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '700' }, department: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '600' },
  meta: { ...Typography.caption, color: colors.text.muted }, body: { ...Typography.bodySm, color: colors.text.primary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }, action: { borderWidth: 1, borderColor: colors.primary, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 9 },
  actionText: { ...Typography.caption, color: colors.primary, fontWeight: '700' }, rejectAction: { borderColor: colors.danger }, rejectText: { ...Typography.caption, color: colors.danger, fontWeight: '700' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' }, error: { ...Typography.caption, color: colors.danger, marginVertical: 8 },
  modal: { flex: 1, backgroundColor: colors.bg.primary, padding: Spacing.lg }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { ...Typography.h2, color: colors.text.primary, fontWeight: '700' }, detail: { paddingVertical: Spacing.md, gap: 10 },
  section: { ...Typography.caption, color: colors.text.muted, fontWeight: '700', textTransform: 'uppercase' }, line: { padding: 10, borderRadius: Radius.md, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, gap: 4 },
  primary: { backgroundColor: colors.primary, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' }, primaryText: { ...Typography.caption, color: '#fff', fontWeight: '700' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }, dialog: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, gap: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, padding: 10, minHeight: 44, color: colors.text.primary, backgroundColor: colors.bg.primary, textAlignVertical: 'top' },
});

