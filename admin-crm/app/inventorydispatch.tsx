import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, Modal, Pressable,
  useWindowDimensions, Platform, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api, Dispatch, DeadStockItem, Invoice } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';

type InvTab = 'dispatches' | 'deadstock';

export default function InventoryDispatchScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [activeTab, setActiveTab] = useState<InvTab>('dispatches');
  const [refreshing, setRefreshing] = useState(false);

  // ── Dispatches ──
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [dispStatusFilter, setDispStatusFilter] = useState('all');
  const [dispSearch, setDispSearch] = useState('');
  const [showDispModal, setShowDispModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [transporter, setTransporter] = useState('');
  const [lrNo, setLrNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [courierName, setCourierName] = useState('');
  const [trackingId, setTrackingId] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [totalBoxes, setTotalBoxes] = useState('1');
  const [totalWeight, setTotalWeight] = useState('');
  const [freightCharge, setFreightCharge] = useState('0');
  const [dispNotes, setDispNotes] = useState('');
  const [dispError, setDispError] = useState('');

  // Status update
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [updatingDisp, setUpdatingDisp] = useState<Dispatch | null>(null);
  const [statusVal, setStatusVal] = useState<Dispatch['status']>('dispatched');

  // ── Dead Stock ──
  const [deadStock, setDeadStock] = useState<DeadStockItem[]>([]);

  const load = useCallback(async () => {
    const [disps, dead, sales] = await Promise.all([
      api.getDispatches(dispStatusFilter, dispSearch).catch(() => []),
      api.getDeadStock().catch(() => []),
      api.getSaleInvoices().catch(() => []),
    ]);
    setDispatches(disps);
    setDeadStock(dead);
    // Only show finalized invoices that don't have a dispatch yet
    const dispatchedInvoiceIds = new Set(disps.map(d => d.invoiceId));
    setInvoices(sales.filter(inv => inv.isFinalized && !dispatchedInvoiceIds.has(inv._id)));
  }, [dispStatusFilter, dispSearch]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  // Dispatch creation
  const handleCreateDispatch = async () => {
    if (!selectedInvoice) { setDispError('Please select a finalized Sale Invoice.'); return; }
    try {
      await api.createDispatch({
        invoiceId: selectedInvoice._id,
        invoiceNo: selectedInvoice.invoiceNo,
        customerName: selectedInvoice.customerName,
        customerPhone: selectedInvoice.gstin || '', // fall back to gstin or dummy
        shippingAddress: selectedInvoice.shippingAddress || selectedInvoice.partyAddress,
        items: (selectedInvoice.items || []).map((it: any) => ({
          productId: it.productId,
          productName: it.name,
          qtyBoxes: it.qty || it.boxes || 1,
          packing: it.packing || 1,
        })),
        transporter, lrNo, vehicleNo, courierName, trackingId, trackingUrl,
        totalBoxes: parseInt(totalBoxes) || 1, totalWeight, freightCharge: parseFloat(freightCharge) || 0,
        notes: dispNotes, status: 'dispatched'
      });
      setShowDispModal(false);
      // Reset form
      setSelectedInvoice(null); setTransporter(''); setLrNo(''); setVehicleNo('');
      setCourierName(''); setTrackingId(''); setTrackingUrl(''); setTotalBoxes('1');
      setTotalWeight(''); setFreightCharge('0'); setDispNotes(''); setDispError('');
      load();
    } catch (e: any) { setDispError(e.message); }
  };

  const handleUpdateStatus = async () => {
    if (!updatingDisp) return;
    try {
      await api.updateDispatch(updatingDisp._id, { status: statusVal });
      setShowStatusModal(false); setUpdatingDisp(null); load();
    } catch (e: any) { alert(e.message); }
  };

  const handleDeleteDispatch = async (id: string) => {
    const ok = Platform.OS === 'web' ? window.confirm('Delete this dispatch record?') : await new Promise(r => Alert.alert('Delete', 'Delete this dispatch record?', [{ text: 'Cancel', onPress: () => r(false) }, { text: 'Delete', style: 'destructive', onPress: () => r(true) }]));
    if (ok) { await api.deleteDispatch(id); load(); }
  };

  const dispatchStatusColors: Record<string, string> = {
    pending: colors.warning,
    dispatched: colors.primary,
    in_transit: colors.info,
    out_for_delivery: colors.purple || '#8e44ad',
    delivered: colors.success,
    returned: colors.danger,
  };

  const TABS = [
    { id: 'dispatches', label: 'Dispatches & Courier Tracking', icon: 'bus-outline' },
    { id: 'deadstock',  label: 'Dead Stock Report',            icon: 'alert-circle-outline' },
  ] as const;

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.pageTitle}>Inventory & Dispatch</Text>
          <Text style={styles.pageSubtitle}>Track dispatches, couriers, LR receipts, and slow-moving stock</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBarScroll}>
        <View style={styles.tabBarContent}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity key={tab.id} style={[styles.tabPill, active && styles.tabPillActive]} onPress={() => setActiveTab(tab.id)} activeOpacity={0.7}>
                <Ionicons name={tab.icon as any} size={15} color={active ? '#fff' : colors.text.secondary} />
                <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

        {/* ===== TAB 1: DISPATCHES & COURIER TRACKING ===== */}
        {activeTab === 'dispatches' && (
          <View>
            {/* Stats Row */}
            <View style={styles.statsRow}>
              {[
                { label: 'Dispatched', val: dispatches.filter(d => d.status === 'dispatched').length, color: colors.primary },
                { label: 'In Transit', val: dispatches.filter(d => d.status === 'in_transit').length, color: colors.info },
                { label: 'Delivered', val: dispatches.filter(d => d.status === 'delivered').length, color: colors.success },
                { label: 'Returned', val: dispatches.filter(d => d.status === 'returned').length, color: colors.danger },
              ].map(s => (
                <View key={s.label} style={styles.statCard}>
                  <Text style={[styles.statValue, { color: s.color }]}>{s.val}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Actions/Filters */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {(['all', 'dispatched', 'in_transit', 'delivered', 'returned'] as const).map(s => (
                    <TouchableOpacity key={s} style={[styles.filterChip, dispStatusFilter === s && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setDispStatusFilter(s)}>
                      <Text style={[styles.filterChipText, dispStatusFilter === s && { color: '#fff' }]}>{s.replace('_',' ').toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={styles.addBtn} onPress={() => { setSelectedInvoice(null); setShowDispModal(true); }}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.addBtnText}>Create Dispatch</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* List */}
            {dispatches.length === 0 ? (
              <View style={styles.emptyBox}><Ionicons name="bus-outline" size={40} color={colors.text.secondary} /><Text style={styles.emptyText}>No dispatch records found.</Text></View>
            ) : dispatches.map(disp => (
              <View key={disp._id} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: dispatchStatusColors[disp.status] || colors.primary }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                      <Text style={styles.cardTitle}>{disp.dispatchNo}</Text>
                      <View style={[styles.badge, { backgroundColor: dispatchStatusColors[disp.status] + '20', borderColor: dispatchStatusColors[disp.status] }]}>
                        <Text style={[styles.badgeText, { color: dispatchStatusColors[disp.status] }]}>{disp.status.toUpperCase()}</Text>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.secondary }}>Invoice: {disp.invoiceNo}</Text>
                    </View>
                    <Text style={styles.cardSubTitle}>Party: {disp.customerName}</Text>
                    <Text style={styles.metaText}>📍 Address: {disp.shippingAddress}</Text>

                    {/* Dispatch Details */}
                    <View style={styles.detailsGrid}>
                      {disp.transporter ? <Text style={styles.detailsItem}>Transporter: <Text style={{ fontWeight: '700' }}>{disp.transporter}</Text></Text> : null}
                      {disp.lrNo ? <Text style={styles.detailsItem}>LR/GR No: <Text style={{ fontWeight: '700' }}>{disp.lrNo}</Text></Text> : null}
                      {disp.vehicleNo ? <Text style={styles.detailsItem}>Vehicle No: <Text style={{ fontWeight: '700' }}>{disp.vehicleNo}</Text></Text> : null}
                      {disp.courierName ? <Text style={styles.detailsItem}>Courier: <Text style={{ fontWeight: '700' }}>{disp.courierName}</Text></Text> : null}
                      {disp.trackingId ? <Text style={styles.detailsItem}>Tracking ID: <Text style={{ fontWeight: '700' }}>{disp.trackingId}</Text></Text> : null}
                      <Text style={styles.detailsItem}>Boxes: <Text style={{ fontWeight: '700' }}>{disp.totalBoxes}</Text></Text>
                      {disp.totalWeight ? <Text style={styles.detailsItem}>Weight: <Text style={{ fontWeight: '700' }}>{disp.totalWeight}</Text></Text> : null}
                      {disp.freightCharge ? <Text style={styles.detailsItem}>Freight Charge: <Text style={{ fontWeight: '700', color: colors.success }}>₹{disp.freightCharge.toLocaleString()}</Text></Text> : null}
                    </View>

                    {disp.notes ? <Text style={[styles.metaText, { marginTop: 6, fontStyle: 'italic' }]}>Note: {disp.notes}</Text> : null}
                  </View>

                  {/* Actions */}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.primary + '15' }]} onPress={() => { setUpdatingDisp(disp); setStatusVal(disp.status); setShowStatusModal(true); }}>
                      <Ionicons name="create-outline" size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.danger + '15' }]} onPress={() => handleDeleteDispatch(disp._id)}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.dateText}>Shipped Date: {new Date(disp.dispatchDate).toLocaleDateString('en-IN')}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ===== TAB 2: DEAD STOCK REPORT ===== */}
        {activeTab === 'deadstock' && (
          <View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Slow Moving &amp; Dead Stock Report</Text>
              <Text style={{ fontSize: 12, color: colors.text.muted, marginBottom: 16 }}>Shows finished goods products with NO stock movement (inward or dispatch) in the last 90+ days</Text>

              {deadStock.length === 0 ? (
                <View style={styles.emptyBox}><Ionicons name="checkmark-circle-outline" size={40} color={colors.success} /><Text style={styles.emptyText}>All stock has active movement!</Text></View>
              ) : (
                <View>
                  {/* Table Header */}
                  <View style={styles.tableHeader}>
                    <Text style={[styles.th, { flex: 2 }]}>PRODUCT</Text>
                    <Text style={[styles.th, { flex: 1.2 }]}>WAREHOUSE</Text>
                    <Text style={[styles.th, { flex: 0.8, textAlign: 'right' }]}>QTY (BOXES)</Text>
                    <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>VALUE (₹)</Text>
                    <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>INACTIVE</Text>
                  </View>

                  {/* Rows */}
                  {deadStock.map((item, i) => (
                    <View key={i} style={[styles.tableRow, i % 2 === 1 && { backgroundColor: colors.bg.secondary }]}>
                      <View style={{ flex: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{item.productName}</Text>
                        <Text style={{ fontSize: 10, color: colors.text.muted }}>SKU: {item.productSku} · Size: {item.size}</Text>
                      </View>
                      <Text style={[styles.td, { flex: 1.2 }]}>{item.warehouseName}</Text>
                      <Text style={[styles.td, { flex: 0.8, textAlign: 'right', fontWeight: '700' }]}>{item.qtyBoxes}</Text>
                      <Text style={[styles.td, { flex: 1.2, textAlign: 'right', color: colors.success, fontWeight: '700' }]}>₹{item.stockValue.toLocaleString()}</Text>
                      <Text style={[styles.td, { flex: 1, textAlign: 'right', color: colors.danger, fontWeight: '700' }]}>{item.daysSinceMovement} Days</Text>
                    </View>
                  ))}

                  {/* Totals */}
                  <View style={[styles.tableRow, { backgroundColor: colors.danger + '08', borderTopWidth: 2, borderTopColor: colors.danger, marginTop: 4 }]}>
                    <Text style={{ flex: 2, fontSize: 12, fontWeight: '800', color: colors.danger }}>TOTAL DEAD STOCK</Text>
                    <Text style={{ flex: 1.2 }} />
                    <Text style={[styles.td, { flex: 0.8, textAlign: 'right', fontWeight: '800', color: colors.danger }]}>{deadStock.reduce((s, a) => s + a.qtyBoxes, 0)}</Text>
                    <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontWeight: '800', color: colors.danger }]}>₹{deadStock.reduce((s, a) => s + a.stockValue, 0).toLocaleString()}</Text>
                    <Text style={{ flex: 1 }} />
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ===== MODAL: CREATE DISPATCH ===== */}
      <Modal visible={showDispModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowDispModal(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Dispatch Record</Text>
              <TouchableOpacity onPress={() => setShowDispModal(false)}><Ionicons name="close" size={20} color={colors.text.primary} /></TouchableOpacity>
            </View>
            {dispError ? <Text style={styles.modalError}>{dispError}</Text> : null}
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Select Finalized Sale Invoice *</Text>
              {Platform.OS === 'web' ? (
                <select value={selectedInvoice?._id || ''} onChange={(e: any) => setSelectedInvoice(invoices.find(inv => inv._id === e.target.value) || null)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.bg.secondary, color: colors.text.primary, fontSize: 13, marginBottom: 12, width: '100%' }}>
                  <option value="">-- Select Invoice --</option>
                  {invoices.map(inv => <option key={inv._id} value={inv._id}>{inv.invoiceNo} - {inv.customerName} (₹{inv.amount.toLocaleString()})</option>)}
                </select>
              ) : (
                <TextInput style={styles.input} value={selectedInvoice?.invoiceNo || ''} placeholder="Invoice No" placeholderTextColor={colors.text.muted} />
              )}

              <Text style={styles.inputLabel}>Transporter Name</Text>
              <TextInput style={styles.input} value={transporter} onChangeText={setTransporter} placeholder="e.g. VRL Logistics, TCI" placeholderTextColor={colors.text.muted} />

              <Text style={styles.inputLabel}>LR / GR Number (Lorry Receipt)</Text>
              <TextInput style={styles.input} value={lrNo} onChangeText={setLrNo} placeholder="e.g. LR-98765" placeholderTextColor={colors.text.muted} />

              <Text style={styles.inputLabel}>Vehicle Number</Text>
              <TextInput style={styles.input} value={vehicleNo} onChangeText={setVehicleNo} placeholder="e.g. MH-12-PQ-4567" placeholderTextColor={colors.text.muted} />

              <Text style={styles.inputLabel}>Courier Service Name</Text>
              <TextInput style={styles.input} value={courierName} onChangeText={setCourierName} placeholder="e.g. Delhivery, BlueDart" placeholderTextColor={colors.text.muted} />

              <Text style={styles.inputLabel}>Courier Tracking ID</Text>
              <TextInput style={styles.input} value={trackingId} onChangeText={setTrackingId} placeholder="Tracking Number" placeholderTextColor={colors.text.muted} />

              <Text style={styles.inputLabel}>Courier Tracking Link</Text>
              <TextInput style={styles.input} value={trackingUrl} onChangeText={setTrackingUrl} placeholder="https://..." placeholderTextColor={colors.text.muted} />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Total Boxes</Text>
                  <TextInput style={styles.input} value={totalBoxes} onChangeText={setTotalBoxes} keyboardType="numeric" placeholder="1" placeholderTextColor={colors.text.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Total Weight</Text>
                  <TextInput style={styles.input} value={totalWeight} onChangeText={setTotalWeight} placeholder="e.g. 15 kg" placeholderTextColor={colors.text.muted} />
                </View>
              </View>

              <Text style={styles.inputLabel}>Freight Charge (₹)</Text>
              <TextInput style={styles.input} value={freightCharge} onChangeText={setFreightCharge} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.text.muted} />

              <Text style={styles.inputLabel}>Dispatch Notes</Text>
              <TextInput style={[styles.input, { height: 60, textAlignVertical: 'top' }]} value={dispNotes} onChangeText={setDispNotes} placeholder="Any delivery instructions..." placeholderTextColor={colors.text.muted} multiline />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDispModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleCreateDispatch}><Text style={styles.submitBtnText}>Dispatch Out</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== MODAL: UPDATE DISPATCH STATUS ===== */}
      <Modal visible={showStatusModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowStatusModal(false)} />
          <View style={[styles.modalContainer, { maxHeight: 350 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Status: {updatingDisp?.dispatchNo}</Text>
              <TouchableOpacity onPress={() => setShowStatusModal(false)}><Ionicons name="close" size={20} color={colors.text.primary} /></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Status *</Text>
              {Platform.OS === 'web' ? (
                <select value={statusVal} onChange={(e: any) => setStatusVal(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.bg.secondary, color: colors.text.primary, fontSize: 13, width: '100%' }}>
                  {(['pending', 'dispatched', 'in_transit', 'out_for_delivery', 'delivered', 'returned'] as const).map(s => (
                    <option key={s} value={s}>{s.replace('_',' ').toUpperCase()}</option>
                  ))}
                </select>
              ) : (
                <TextInput style={styles.input} value={statusVal} onChangeText={(v: any) => setStatusVal(v)} placeholder="Status" />
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowStatusModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleUpdateStatus}><Text style={styles.submitBtnText}>Update</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  pageHeader: { paddingHorizontal: Spacing.lg, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.text.primary },
  pageSubtitle: { fontSize: 12, color: colors.text.muted, marginTop: 2 },
  tabBarScroll: { backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBarContent: { paddingHorizontal: Spacing.lg, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  tabPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border },
  tabPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabPillText: { fontSize: 13, fontWeight: '600', color: colors.text.secondary },
  tabPillTextActive: { color: '#fff', fontWeight: '700' },
  content: { padding: Spacing.lg, maxWidth: 1200, alignSelf: 'center', width: '100%' },
  card: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  statCard: { flex: 1, minWidth: 80, backgroundColor: colors.bg.card, borderRadius: Radius.md, padding: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4, textAlign: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.md },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.secondary },
  filterChipText: { fontSize: 11, fontWeight: '600', color: colors.text.secondary },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text.primary },
  cardSubTitle: { fontSize: 13, fontWeight: '600', color: colors.text.secondary },
  metaText: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
  dateText: { fontSize: 10, color: colors.text.muted, marginTop: 8 },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8, padding: 10, backgroundColor: colors.bg.secondary, borderRadius: Radius.sm },
  detailsItem: { fontSize: 12, color: colors.text.secondary, width: '45%' },
  iconBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 13, color: colors.text.muted },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text.primary, marginBottom: 8 },
  tableHeader: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, marginBottom: 4 },
  th: { fontSize: 10, fontWeight: '800', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', borderRadius: Radius.sm },
  td: { fontSize: 13, color: colors.text.secondary },
  // Modal styles
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalContainer: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, width: '90%', maxWidth: 520, maxHeight: '85%', zIndex: 10, borderWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 16, fontWeight: '800', color: colors.text.primary },
  modalForm: { padding: 16, maxHeight: 420 },
  modalFooter: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  modalError: { margin: 12, padding: 10, backgroundColor: colors.danger + '15', borderRadius: Radius.sm, color: colors.danger, fontSize: 12, fontWeight: '600' },
  inputLabel: { fontSize: 12, fontWeight: '700', color: colors.text.secondary, marginBottom: 6 },
  input: { backgroundColor: colors.bg.secondary, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text.primary, marginBottom: 12 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: colors.text.secondary },
  submitBtn: { flex: 2, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  submitBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
