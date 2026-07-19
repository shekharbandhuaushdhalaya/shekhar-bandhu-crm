import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, Modal, Pressable,
  useWindowDimensions, Platform, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api, StockMovement, StockMovementItem, Product } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';
import { useAuth } from '../utils/auth';

const DIRECTION_OPTS = [
  { value: '', label: 'All' },
  { value: 'out', label: 'Outbound' },
  { value: 'in', label: 'Inbound' },
] as const;

const TYPE_OPTS: { value: string; label: string; dir: 'out' | 'in' | 'both' }[] = [
  { value: '', label: 'All', dir: 'both' },
  { value: 'sale', label: 'Sale', dir: 'out' },
  { value: 'sample', label: 'Sample', dir: 'out' },
  { value: 'order', label: 'Online Order', dir: 'out' },
  { value: 'return', label: 'Return', dir: 'in' },
  { value: 'purchase', label: 'Purchase', dir: 'in' },
  { value: 'transfer_out', label: 'Transfer Out', dir: 'out' },
  { value: 'transfer_in', label: 'Transfer In', dir: 'in' },
];

const STATUS_COLORS: Record<string, string> = {
  draft: '#f59e0b',
  dispatched: '#3b82f6',
  received: '#10b981',
  cancelled: '#ef4444',
};

const TYPE_LABELS: Record<string, string> = {
  sale: 'Sale', sample: 'Sample', order: 'Order',
  return: 'Return', purchase: 'Purchase',
  transfer_out: 'Trf Out', transfer_in: 'Trf In',
};

export default function StockMovementsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width: winWidth } = useWindowDimensions();

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterDir, setFilterDir] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    direction: 'out' as 'out' | 'in',
    type: 'sale' as string,
    date: new Date().toISOString().split('T')[0],
    partyType: '' as string,
    partyName: '',
    partyGstin: '',
    partyAddress: '',
    warehouseId: '',
    warehouseName: '',
    isFree: false,
    notes: '',
    status: 'draft' as string,
  });
  const [items, setItems] = useState<StockMovementItem[]>([{ productName: '', qty: 1, packing: 1, rate: 0, gstRate: 18, mrp: 0 }]);
  const [error, setError] = useState('');

  // Product search
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [productDropdownIdx, setProductDropdownIdx] = useState<number | null>(null);

  // Warehouses
  const [warehouses, setWarehouses] = useState<any[]>([]);

  // Detail modal
  const [detailMovement, setDetailMovement] = useState<StockMovement | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getStockMovements({
        direction: filterDir || undefined,
        type: filterType || undefined,
        status: filterStatus || undefined,
        search: search || undefined,
      });
      setMovements(data);
    } catch { setMovements([]); }
  }, [filterDir, filterType, filterStatus, search]);

  const loadWarehouses = useCallback(async () => {
    try {
      const w = await api.getWarehouses();
      setWarehouses(w);
      if (w.length > 0 && !form.warehouseId) {
        setForm(f => ({ ...f, warehouseId: w[0]._id, warehouseName: w[0].name }));
      }
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (showModal) loadWarehouses(); }, [showModal, loadWarehouses]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const resetForm = () => {
    setForm({
      direction: 'out', type: 'sale',
      date: new Date().toISOString().split('T')[0],
      partyType: '', partyName: '', partyGstin: '', partyAddress: '',
      warehouseId: warehouses[0]?._id || '', warehouseName: warehouses[0]?.name || '',
      isFree: false, notes: '', status: 'draft',
    });
    setItems([{ productName: '', qty: 1, packing: 1, rate: 0, gstRate: 18, mrp: 0 }]);
    setError('');
    setProductResults([]);
    setProductDropdownIdx(null);
  };

  const handleSave = async () => {
    if (!form.partyName.trim()) { setError('Party name is required.'); return; }
    if (items.some(i => !i.productName.trim())) { setError('All items must have a product name.'); return; }
    if (!form.warehouseId) { setError('Warehouse is required.'); return; }

    const payload = {
      ...form,
      items: items.map(it => ({
        productId: it.productId,
        productName: it.productName,
        qty: it.qty,
        packing: it.packing || 1,
        rate: it.rate || 0,
        gstRate: it.gstRate || 0,
        batchNo: it.batchNo || '',
        mrp: it.mrp || 0,
      })),
      warehouseId: form.warehouseId,
      warehouseName: form.warehouseName,
      isFree: form.isFree,
      status: form.direction === 'out' ? 'dispatched' : 'received',
    };

    try {
      if (editId) {
        await api.updateStockMovement(editId, payload);
      } else {
        await api.createStockMovement(payload);
      }
      setShowModal(false);
      resetForm();
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleConvertToInvoice = async (id: string) => {
    try {
      const result = await api.convertStockMovementToInvoice(id);
      if (Platform.OS === 'web') window.alert(`Invoice ${result.invoice.invoiceNo} created!`);
      load();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message);
    }
  };

  const handleCancel = async (id: string) => {
    const ok = Platform.OS === 'web'
      ? window.confirm('Cancel this movement? Inventory will be reverted.')
      : await new Promise(r => Alert.alert('Cancel', 'Cancel this movement?', [{ text: 'No', onPress: () => r(false) }, { text: 'Yes', style: 'destructive', onPress: () => r(true) }]));
    if (!ok) return;
    try {
      await api.cancelStockMovement(id);
      load();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = Platform.OS === 'web'
      ? window.confirm('Delete this movement?')
      : await new Promise(r => Alert.alert('Delete', 'Delete this movement?', [{ text: 'No', onPress: () => r(false) }, { text: 'Delete', style: 'destructive', onPress: () => r(true) }]));
    if (!ok) return;
    try {
      await api.deleteStockMovement(id);
      load();
    } catch (e: any) {
      if (Platform.OS === 'web') window.alert(e.message);
    }
  };

  const availableTypes = TYPE_OPTS.filter(t => t.dir === 'both' || t.dir === form.direction);

  return (
    <View style={styles.screen}>
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.pageTitle}>Stock Movements</Text>
          <Text style={styles.pageSubtitle}>Unified document for all finished goods movement</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => { setEditId(null); resetForm(); setShowModal(true); }}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.addBtnText}>New Movement</Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filterBar}>
        <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search by doc no / party..." placeholderTextColor={colors.text.muted} />
        <View style={styles.filterRow}>
          {DIRECTION_OPTS.map(d => (
            <TouchableOpacity key={d.value} style={[styles.filterChip, filterDir === d.value && styles.filterChipActive]} onPress={() => { setFilterDir(d.value); setFilterType(''); }}>
              <Text style={[styles.filterChipText, filterDir === d.value && styles.filterChipTextActive]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          <View style={styles.filterRow}>
            {['', 'draft', 'dispatched', 'received', 'cancelled'].map(s => (
              <TouchableOpacity key={s} style={[styles.filterChip, filterStatus === s && { backgroundColor: STATUS_COLORS[s] || colors.primary, borderColor: STATUS_COLORS[s] || colors.primary }]} onPress={() => setFilterStatus(s)}>
                <Text style={[styles.filterChipText, filterStatus === s && { color: '#fff' }]}>{s || 'All'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

        {/* KPI */}
        <View style={styles.statsRow}>
          {[
            { label: 'Total', val: movements.length, color: colors.primary },
            { label: 'Dispatched', val: movements.filter(m => m.status === 'dispatched').length, color: '#3b82f6' },
            { label: 'Received', val: movements.filter(m => m.status === 'received').length, color: '#10b981' },
            { label: 'Draft', val: movements.filter(m => m.status === 'draft').length, color: '#f59e0b' },
          ].map(s => (
            <View key={s.label} style={styles.statCard}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {movements.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="swap-horizontal-outline" size={40} color={colors.text.secondary} />
            <Text style={styles.emptyText}>No stock movements found.</Text>
          </View>
        ) : movements.map(m => (
          <TouchableOpacity key={m._id} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: STATUS_COLORS[m.status] || colors.border }]}
            onPress={() => { setDetailMovement(m); setShowDetail(true); }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <Text style={styles.cardTitle}>{m.docNo}</Text>
                  <View style={[styles.badge, { backgroundColor: STATUS_COLORS[m.status] + '20', borderColor: STATUS_COLORS[m.status] }]}>
                    <Text style={[styles.badgeText, { color: STATUS_COLORS[m.status] }]}>{m.status.toUpperCase()}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                    <Text style={[styles.badgeText, { color: colors.primary }]}>{TYPE_LABELS[m.type] || m.type}</Text>
                  </View>
                  <Text style={[styles.badgeText, { color: m.direction === 'out' ? colors.danger : colors.success, fontSize: 11 }]}>
                    {m.direction === 'out' ? 'OUT' : 'IN'}
                  </Text>
                </View>
                <Text style={styles.cardSubTitle}>{m.partyName}{m.partyGstin ? ` (${m.partyGstin})` : ''}</Text>
                <Text style={styles.metaText}>
                  {m.warehouseName} · {new Date(m.date).toLocaleDateString('en-IN')}
                </Text>
                <Text style={styles.metaText}>{m.items.length} item(s) · Total: ₹{(m.totalAmount || 0).toLocaleString('en-IN')}</Text>
                {m.convertedToInvoice && (
                  <Text style={[styles.metaText, { color: colors.success }]}>
                    Invoiced: {m.invoiceNo}
                  </Text>
                )}
              </View>
              <View style={{ flexDirection: 'column', gap: 4 }}>
                {m.type === 'sale' && m.direction === 'out' && m.partyGstin && !m.convertedToInvoice && m.status === 'dispatched' && (
                  <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.success + '20' }]} onPress={() => handleConvertToInvoice(m._id)}>
                    <Ionicons name="document-text-outline" size={14} color={colors.success} />
                  </TouchableOpacity>
                )}
                {m.status === 'draft' && (
                  <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.primary + '20' }]} onPress={() => { setEditId(m._id); resetForm(); setShowModal(true); }}>
                    <Ionicons name="create-outline" size={14} color={colors.primary} />
                  </TouchableOpacity>
                )}
                {(m.status === 'dispatched' || m.status === 'received') && !m.convertedToInvoice && (
                  <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.warning + '20' }]} onPress={() => handleCancel(m._id)}>
                    <Ionicons name="close-circle-outline" size={14} color={colors.warning} />
                  </TouchableOpacity>
                )}
                {m.status !== 'dispatched' && m.status !== 'received' && (
                  <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.danger + '15' }]} onPress={() => handleDelete(m._id)}>
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ===== Create/Edit Modal ===== */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowModal(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editId ? 'Edit' : 'New'} Stock Movement</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}><Ionicons name="close" size={20} color={colors.text.primary} /></TouchableOpacity>
            </View>
            {error ? <Text style={styles.modalError}>{error}</Text> : null}
            <ScrollView style={styles.modalForm}>
              {/* Direction toggle */}
              <Text style={styles.inputLabel}>Direction</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {DIRECTION_OPTS.filter(d => d.value).map(d => (
                  <TouchableOpacity key={d.value} style={[styles.toggleChip, form.direction === d.value && styles.toggleChipActive]}
                    onPress={() => { setForm(f => ({ ...f, direction: d.value as any, type: '' })); setItems([{ productName: '', qty: 1, packing: 1, rate: 0, gstRate: 18, mrp: 0 }]); }}>
                    <Text style={[styles.toggleChipText, form.direction === d.value && styles.toggleChipTextActive]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Type */}
              <Text style={styles.inputLabel}>Movement Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {availableTypes.filter(t => t.value).map(t => (
                  <TouchableOpacity key={t.value} style={[styles.toggleChip, form.type === t.value && styles.toggleChipActive]}
                    onPress={() => setForm(f => ({ ...f, type: t.value }))}>
                    <Text style={[styles.toggleChipText, form.type === t.value && styles.toggleChipTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Date</Text>
              <TextInput style={styles.input} value={form.date} onChangeText={v => setForm(f => ({ ...f, date: v }))} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.muted} />

              {/* Party */}
              {form.direction === 'out' && form.type !== 'transfer_out' && (
                <>
                  <Text style={styles.inputLabel}>Party Type</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    {['', 'customer', 'mr'].map(pt => (
                      <TouchableOpacity key={pt} style={[styles.toggleChip, form.partyType === pt && styles.toggleChipActive]}
                        onPress={() => setForm(f => ({ ...f, partyType: pt }))}>
                        <Text style={[styles.toggleChipText, form.partyType === pt && styles.toggleChipTextActive]}>{pt || 'None'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.inputLabel}>Party Name *</Text>
              <TextInput style={styles.input} value={form.partyName} onChangeText={v => setForm(f => ({ ...f, partyName: v }))} placeholder="Name" placeholderTextColor={colors.text.muted} />

              {form.type === 'sale' && (
                <Text style={styles.inputLabel}>GSTIN (for invoice conversion)</Text>
              )}
              <TextInput style={styles.input} value={form.partyGstin} onChangeText={v => setForm(f => ({ ...f, partyGstin: v }))} placeholder="GSTIN (optional for cash customers)" placeholderTextColor={colors.text.muted} />

              <Text style={styles.inputLabel}>Address</Text>
              <TextInput style={[styles.input, { height: 60, textAlignVertical: 'top' }]} value={form.partyAddress} onChangeText={v => setForm(f => ({ ...f, partyAddress: v }))} placeholder="Address" placeholderTextColor={colors.text.muted} multiline />

              {/* Warehouse */}
              <Text style={styles.inputLabel}>Warehouse *</Text>
              {Platform.OS === 'web' ? (
                <select value={form.warehouseId} onChange={(e: any) => {
                  const w = warehouses.find(x => x._id === e.target.value);
                  setForm(f => ({ ...f, warehouseId: e.target.value, warehouseName: w?.name || '' }));
                }} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.bg.secondary, color: colors.text.primary, fontSize: 13, marginBottom: 12, width: '100%' }}>
                  <option value="">-- Select --</option>
                  {warehouses.map(w => <option key={w._id} value={w._id}>{w.name}</option>)}
                </select>
              ) : (
                <TextInput style={styles.input} value={form.warehouseName} onChangeText={v => setForm(f => ({ ...f, warehouseName: v }))} placeholder="Warehouse name" placeholderTextColor={colors.text.muted} />
              )}

              {/* Free / Paid toggle for outbound */}
              {form.direction === 'out' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Text style={styles.inputLabel}>Is Free Sample?</Text>
                  <TouchableOpacity style={[styles.toggleChip, form.isFree && styles.toggleChipActive]} onPress={() => setForm(f => ({ ...f, isFree: !f.isFree }))}>
                    <Text style={[styles.toggleChipText, form.isFree && styles.toggleChipTextActive]}>{form.isFree ? 'Yes' : 'No'}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Notes */}
              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput style={[styles.input, { height: 60, textAlignVertical: 'top' }]} value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} placeholder="Notes..." placeholderTextColor={colors.text.muted} multiline />

              {/* Items */}
              <Text style={[styles.inputLabel, { marginTop: 8 }]}>Items:</Text>
              {items.map((item, idx) => (
                <View key={idx} style={{ marginBottom: 8, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <TextInput style={[styles.input, { marginBottom: 4 }]} value={item.productName} onChangeText={v => {
                        const n = [...items]; n[idx].productName = v; n[idx].productId = undefined; n[idx].rate = 0; n[idx].mrp = 0;
                        setItems(n);
                        if (v.length >= 2) { api.getProducts(v).then(res => { setProductResults(res); setProductDropdownIdx(idx); }).catch(() => {}); }
                        else { setProductResults([]); setProductDropdownIdx(null); }
                      }} placeholder="Search product..." placeholderTextColor={colors.text.muted} />
                      {productDropdownIdx === idx && productResults.length > 0 && (
                        <View style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: 6, marginBottom: 4 }}>
                          {productResults.slice(0, 8).map(p => (
                            <TouchableOpacity key={p._id} style={{ paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}
                              onPress={() => {
                                const n = [...items];
                                n[idx].productName = p.name;
                                n[idx].productId = p._id;
                                n[idx].rate = p.price;
                                n[idx].mrp = p.price;
                                n[idx].gstRate = p.gstRate || 18;
                                setItems(n);
                                setProductResults([]);
                                setProductDropdownIdx(null);
                              }}>
                              <Text style={{ fontSize: 12, color: colors.text.primary }}>{p.name}</Text>
                              <Text style={{ fontSize: 10, color: colors.text.muted }}>Rate: ₹{p.price} | SKU: {p.sku}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                    {items.length > 1 && (
                      <TouchableOpacity onPress={() => { setItems(items.filter((_, i) => i !== idx)); setProductDropdownIdx(null); }}>
                        <Ionicons name="remove-circle" size={20} color={colors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Qty (boxes)</Text>
                      <TextInput style={styles.smallInput} value={String(item.qty)} onChangeText={v => { const n = [...items]; n[idx].qty = parseInt(v) || 0; setItems(n); }} keyboardType="numeric" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Packing</Text>
                      <TextInput style={styles.smallInput} value={String(item.packing || 1)} onChangeText={v => { const n = [...items]; n[idx].packing = parseInt(v) || 1; setItems(n); }} keyboardType="numeric" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Rate</Text>
                      <TextInput style={styles.smallInput} value={String(item.rate || 0)} onChangeText={v => { const n = [...items]; n[idx].rate = parseFloat(v) || 0; setItems(n); }} keyboardType="numeric" />
                    </View>
                  </View>
                  {form.type === 'sale' && !form.isFree && (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>GST %</Text>
                        <TextInput style={styles.smallInput} value={String(item.gstRate || 0)} onChangeText={v => { const n = [...items]; n[idx].gstRate = parseFloat(v) || 0; setItems(n); }} keyboardType="numeric" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>Batch No</Text>
                        <TextInput style={styles.smallInput} value={item.batchNo || ''} onChangeText={v => { const n = [...items]; n[idx].batchNo = v; setItems(n); }} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.fieldLabel}>MRP</Text>
                        <TextInput style={styles.smallInput} value={String(item.mrp || 0)} onChangeText={v => { const n = [...items]; n[idx].mrp = parseFloat(v) || 0; setItems(n); }} keyboardType="numeric" />
                      </View>
                    </View>
                  )}
                </View>
              ))}
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }} onPress={() => setItems([...items, { productName: '', qty: 1, packing: 1, rate: 0, gstRate: 18, mrp: 0 }])}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Add Item</Text>
              </TouchableOpacity>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSave}><Text style={styles.submitBtnText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Detail Modal ===== */}
      <Modal visible={showDetail} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowDetail(false)} />
          {detailMovement && (
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{detailMovement.docNo}</Text>
                <TouchableOpacity onPress={() => setShowDetail(false)}><Ionicons name="close" size={20} color={colors.text.primary} /></TouchableOpacity>
              </View>
              <ScrollView style={styles.modalForm}>
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                    <View style={[styles.badge, { backgroundColor: STATUS_COLORS[detailMovement.status] + '20', borderColor: STATUS_COLORS[detailMovement.status] }]}>
                      <Text style={[styles.badgeText, { color: STATUS_COLORS[detailMovement.status] }]}>{detailMovement.status.toUpperCase()}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
                      <Text style={[styles.badgeText, { color: colors.primary }]}>{TYPE_LABELS[detailMovement.type] || detailMovement.type}</Text>
                    </View>
                    <Text style={[styles.badgeText, { color: detailMovement.direction === 'out' ? colors.danger : colors.success, fontWeight: '700' }]}>
                      {detailMovement.direction.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>{new Date(detailMovement.date).toLocaleDateString('en-IN')}</Text>
                  <Text style={styles.detailLabel}>Party</Text>
                  <Text style={styles.detailValue}>{detailMovement.partyName}{detailMovement.partyGstin ? ` (${detailMovement.partyGstin})` : ''}</Text>
                  {detailMovement.partyAddress ? <><Text style={styles.detailLabel}>Address</Text><Text style={styles.detailValue}>{detailMovement.partyAddress}</Text></> : null}
                  <Text style={styles.detailLabel}>Warehouse</Text>
                  <Text style={styles.detailValue}>{detailMovement.warehouseName}</Text>
                  {detailMovement.isFree && <Text style={[styles.detailValue, { color: colors.warning }]}>Free Sample</Text>}
                  {detailMovement.convertedToInvoice && <Text style={[styles.detailValue, { color: colors.success }]}>Invoiced: {detailMovement.invoiceNo}</Text>}
                  {detailMovement.notes ? <><Text style={styles.detailLabel}>Notes</Text><Text style={styles.detailValue}>{detailMovement.notes}</Text></> : null}
                </View>

                <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Items</Text>
                {detailMovement.items.map((it, i) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: colors.border }}>
                    <View style={{ flex: 2 }}>
                      <Text style={{ fontSize: 13, color: colors.text.primary }}>{it.productName}</Text>
                      <Text style={{ fontSize: 11, color: colors.text.muted }}>{it.batchNo ? `Batch: ${it.batchNo}` : ''}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.text.secondary, flex: 1, textAlign: 'center' }}>× {it.qty} (p{it.packing})</Text>
                    <Text style={{ fontSize: 12, color: colors.success, fontWeight: '700', flex: 1, textAlign: 'right' }}>₹{((it.qty || 0) * (it.rate || 0) * (it.packing || 1)).toLocaleString('en-IN')}</Text>
                  </View>
                ))}
                {detailMovement.totalAmount ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 8 }}>
                    <Text style={{ fontWeight: '700', color: colors.text.primary }}>Total</Text>
                    <Text style={{ fontWeight: '700', color: colors.success }}>₹{detailMovement.totalAmount.toLocaleString('en-IN')}</Text>
                  </View>
                ) : null}

                {detailMovement.type === 'sale' && detailMovement.direction === 'out' && detailMovement.partyGstin && !detailMovement.convertedToInvoice && detailMovement.status === 'dispatched' && (
                  <TouchableOpacity style={[styles.submitBtn, { marginTop: 16 }]} onPress={() => { setShowDetail(false); handleConvertToInvoice(detailMovement._id); }}>
                    <Text style={styles.submitBtnText}>Convert to Invoice</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
              <View style={styles.modalFooter}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDetail(false)}><Text style={styles.cancelBtnText}>Close</Text></TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  pageHeader: { paddingHorizontal: Spacing.lg, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageTitle: { fontSize: 22, fontWeight: '800', color: colors.text.primary },
  pageSubtitle: { fontSize: 12, color: colors.text.muted, marginTop: 2 },
  filterBar: { paddingHorizontal: Spacing.lg, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary, gap: 8 },
  searchInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: colors.text.primary, backgroundColor: colors.bg.primary },
  filterRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  filterChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.primary },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 11, color: colors.text.secondary },
  filterChipTextActive: { color: '#fff' },
  content: { padding: Spacing.lg, gap: 10, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  statCard: { flex: 1, minWidth: 70, backgroundColor: colors.bg.secondary, borderRadius: Radius.md, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, color: colors.text.secondary, marginTop: 2 },
  card: { backgroundColor: colors.bg.secondary, borderRadius: Radius.md, padding: 14 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text.primary },
  cardSubTitle: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  metaText: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.md },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  iconBtn: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { color: colors.text.secondary, fontSize: 13 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContainer: { width: '90%', maxWidth: 500, maxHeight: '90%', backgroundColor: colors.bg.primary, borderRadius: Radius.lg, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text.primary },
  modalError: { backgroundColor: colors.danger + '15', color: colors.danger, padding: 10, margin: 12, borderRadius: 6, fontSize: 12 },
  modalForm: { padding: Spacing.lg },
  inputLabel: { fontSize: 12, fontWeight: '700', color: colors.text.secondary, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: colors.text.primary, backgroundColor: colors.bg.secondary, marginBottom: 12 },
  smallInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, fontSize: 12, color: colors.text.primary, backgroundColor: colors.bg.secondary, marginBottom: 4 },
  fieldLabel: { fontSize: 10, color: colors.text.muted, marginBottom: 2 },
  toggleChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.primary },
  toggleChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggleChipText: { fontSize: 12, color: colors.text.secondary },
  toggleChipTextActive: { color: '#fff' },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: Spacing.lg, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border },
  cancelBtnText: { fontSize: 13, color: colors.text.secondary, fontWeight: '600' },
  submitBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.md, backgroundColor: colors.primary },
  submitBtnText: { fontSize: 13, color: '#fff', fontWeight: '700' },

  // Detail
  detailLabel: { fontSize: 11, color: colors.text.muted, marginTop: 6, marginBottom: 1 },
  detailValue: { fontSize: 13, color: colors.text.primary },
});
