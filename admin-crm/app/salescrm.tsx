import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, Modal, Pressable,
  useWindowDimensions, Platform, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api, Complaint, Sample, SampleItem, SalesTarget, CommissionReport, Product } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';
import { useAuth } from '../utils/auth';

type CRMTab = 'complaints' | 'samples' | 'targets';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function SalesCRMScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [activeTab, setActiveTab] = useState<CRMTab>('complaints');
  const [refreshing, setRefreshing] = useState(false);

  // ── Complaints ──
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [cmpStatusFilter, setCmpStatusFilter] = useState('all');
  const [cmpTypeFilter, setCmpTypeFilter] = useState('all');
  const [showCmpModal, setShowCmpModal] = useState(false);
  const [editingCmp, setEditingCmp] = useState<Complaint | null>(null);
  const [cmpCustomerName, setCmpCustomerName] = useState('');
  const [cmpCustomerPhone, setCmpCustomerPhone] = useState('');
  const [cmpType, setCmpType] = useState<'complaint' | 'return' | 'exchange'>('complaint');
  const [cmpInvoiceNo, setCmpInvoiceNo] = useState('');
  const [cmpProductName, setCmpProductName] = useState('');
  const [cmpDescription, setCmpDescription] = useState('');
  const [cmpPriority, setCmpPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [cmpError, setCmpError] = useState('');
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolvingCmp, setResolvingCmp] = useState<Complaint | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [resolvedBy, setResolvedBy] = useState('');

  // ── Samples ──
  const [samples, setSamples] = useState<Sample[]>([]);
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [smpGivenTo, setSmpGivenTo] = useState('');
  const [smpDesignation, setSmpDesignation] = useState('');
  const [smpPhone, setSmpPhone] = useState('');
  const [smpLocation, setSmpLocation] = useState('');
  const [smpPurpose, setSmpPurpose] = useState('');
  const [smpGivenBy, setSmpGivenBy] = useState(user?.name || '');
  const [smpDate, setSmpDate] = useState(new Date().toISOString().split('T')[0]);
  const [smpFollowUp, setSmpFollowUp] = useState('');
  const [smpNotes, setSmpNotes] = useState('');
  const [smpItems, setSmpItems] = useState<SampleItem[]>([{ productName: '', qty: 1, mrp: 0 }]);
  const [smpError, setSmpError] = useState('');
  const [smpProductResults, setSmpProductResults] = useState<Product[]>([]);
  const [smpProductDropdownIdx, setSmpProductDropdownIdx] = useState<number | null>(null);

  // ── Targets / Commission ──
  const [targets, setTargets] = useState<SalesTarget[]>([]);
  const [commission, setCommission] = useState<CommissionReport | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [targetMonth, setTargetMonth] = useState(new Date().getMonth() + 1);
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [commissionRate, setCommissionRate] = useState('5');
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [tgtAgentId, setTgtAgentId] = useState('');
  const [tgtAgentName, setTgtAgentName] = useState('');
  const [tgtAmount, setTgtAmount] = useState('');
  const [tgtError, setTgtError] = useState('');

  const load = useCallback(async () => {
    const [cmps, smps, tgts, usrs, comm] = await Promise.all([
      api.getComplaints(cmpStatusFilter, cmpTypeFilter).catch(() => []),
      api.getSamples().catch(() => []),
      api.getSalesTargets(targetMonth, targetYear).catch(() => []),
      api.getUsers().catch(() => []),
      api.getCommissionReport(targetMonth, targetYear, parseFloat(commissionRate) || 5).catch(() => null),
    ]);
    setComplaints(cmps);
    setSamples(smps);
    setTargets(tgts);
    setUsers(usrs.filter((u: any) => u.role === 'agent' || u.role === 'manager'));
    setCommission(comm);
  }, [cmpStatusFilter, cmpTypeFilter, targetMonth, targetYear, commissionRate]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { api.clearCache(); setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  // ── Complaint handlers ──
  const resetCmpForm = () => {
    setCmpCustomerName(''); setCmpCustomerPhone(''); setCmpType('complaint');
    setCmpInvoiceNo(''); setCmpProductName(''); setCmpDescription('');
    setCmpPriority('medium'); setCmpError(''); setEditingCmp(null);
  };

  const handleSaveComplaint = async () => {
    if (!cmpCustomerName.trim() || !cmpDescription.trim()) {
      setCmpError('Customer name and description are required.'); return;
    }
    try {
      await api.createComplaint({
        customerName: cmpCustomerName, customerPhone: cmpCustomerPhone,
        type: cmpType, invoiceNo: cmpInvoiceNo, productName: cmpProductName,
        description: cmpDescription, priority: cmpPriority,
      });
      setShowCmpModal(false); resetCmpForm(); load();
    } catch (e: any) { setCmpError(e.message); }
  };

  const handleResolve = async () => {
    if (!resolvingCmp) return;
    try {
      await api.updateComplaint(resolvingCmp._id, {
        status: 'resolved', resolution: resolutionText, resolvedBy,
      });
      setShowResolveModal(false); setResolvingCmp(null); setResolutionText(''); setResolvedBy(''); load();
    } catch (e: any) { alert(e.message); }
  };

  const handleDeleteComplaint = async (id: string) => {
    const ok = Platform.OS === 'web' ? window.confirm('Delete this complaint?') : await new Promise(r => Alert.alert('Delete', 'Delete this complaint?', [{ text: 'Cancel', onPress: () => r(false) }, { text: 'Delete', style: 'destructive', onPress: () => r(true) }]));
    if (ok) { await api.deleteComplaint(id); load(); }
  };

  // ── Sample handlers ──
  const resetSampleForm = () => {
    setSmpGivenTo(''); setSmpDesignation(''); setSmpPhone(''); setSmpLocation('');
    setSmpPurpose(''); setSmpGivenBy(user?.name || ''); setSmpDate(new Date().toISOString().split('T')[0]);
    setSmpFollowUp(''); setSmpNotes(''); setSmpItems([{ productName: '', qty: 1, mrp: 0 }]); setSmpError('');
    setSmpProductResults([]); setSmpProductDropdownIdx(null);
  };

  const handleSaveSample = async () => {
    if (!smpGivenTo.trim()) { setSmpError('Recipient name is required.'); return; }
    if (smpItems.some(i => !i.productName.trim())) { setSmpError('All items must have a product name.'); return; }
    try {
      await api.createSample({
        givenTo: smpGivenTo, designation: smpDesignation, phone: smpPhone,
        location: smpLocation, purpose: smpPurpose, givenBy: smpGivenBy,
        date: smpDate, followUpDate: smpFollowUp || undefined, notes: smpNotes, items: smpItems,
      });
      setShowSampleModal(false); resetSampleForm(); load();
    } catch (e: any) { setSmpError(e.message); }
  };

  // ── Target handlers ──
  const handleSaveTarget = async () => {
    if (!tgtAgentId || !tgtAmount) { setTgtError('Select an agent and enter target amount.'); return; }
    try {
      await api.setSalesTarget({ agentId: tgtAgentId, agentName: tgtAgentName, month: targetMonth, year: targetYear, targetAmount: parseFloat(tgtAmount) });
      setShowTargetModal(false); setTgtAgentId(''); setTgtAgentName(''); setTgtAmount(''); setTgtError(''); load();
    } catch (e: any) { setTgtError(e.message); }
  };

  const statusColors: Record<string, string> = {
    open: colors.danger, in_progress: colors.warning, resolved: colors.success, closed: colors.text.muted,
  };
  const priorityColors: Record<string, string> = { low: colors.success, medium: colors.warning, high: colors.danger };
  const sampleStatusColors: Record<string, string> = {
    given: colors.primary, follow_up_done: colors.warning, converted: colors.success, no_response: colors.text.muted,
  };

  const TABS = [
    { id: 'complaints', label: 'Complaints & Returns', icon: 'chatbubble-ellipses-outline' },
    { id: 'samples',    label: 'Sample Management',    icon: 'gift-outline' },
    { id: 'targets',    label: 'Targets & Commission', icon: 'trophy-outline' },
  ] as const;

  return (
    <View style={styles.screen}>
      {/* Standardized Search & Title Topbar */}
      <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.xs }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.bg.card,
          paddingHorizontal: 14,
          paddingRight: 8,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 12,
          minHeight: 46
        }}>
          {/* Tab Selector pills inside topbar */}
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {TABS.map(tab => {
              const active = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm, flexDirection: 'row', alignItems: 'center', gap: 6 },
                    active ? { backgroundColor: colors.primary } : { backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border }
                  ]}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={tab.icon as any} size={14} color={active ? '#fff' : colors.text.secondary} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#fff' : colors.text.primary }}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

        {/* ===== TAB 1: COMPLAINTS ===== */}
        {activeTab === 'complaints' && (
          <View>
            {/* Stats */}
            <View style={styles.statsRow}>
              {[
                { label: 'Open', val: complaints.filter(c => c.status === 'open').length, color: colors.danger },
                { label: 'In Progress', val: complaints.filter(c => c.status === 'in_progress').length, color: colors.warning },
                { label: 'Resolved', val: complaints.filter(c => c.status === 'resolved').length, color: colors.success },
                { label: 'Total', val: complaints.length, color: colors.primary },
              ].map(s => (
                <View key={s.label} style={styles.statCard}>
                  <Text style={[styles.statValue, { color: s.color }]}>{s.val}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Filters + Add */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {(['all','open','in_progress','resolved','closed'] as const).map(s => (
                    <TouchableOpacity key={s} style={[styles.filterChip, cmpStatusFilter === s && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setCmpStatusFilter(s)}>
                      <Text style={[styles.filterChipText, cmpStatusFilter === s && { color: '#fff' }]}>{s === 'all' ? 'All' : s.replace('_',' ')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={styles.addBtn} onPress={() => { resetCmpForm(); setShowCmpModal(true); }}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.addBtnText}>Log Complaint</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* List */}
            {complaints.length === 0 ? (
              <View style={styles.emptyBox}><Ionicons name="chatbubble-ellipses-outline" size={40} color={colors.text.secondary} /><Text style={styles.emptyText}>No complaints found.</Text></View>
            ) : complaints.map(cmp => (
              <View key={cmp._id} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: statusColors[cmp.status] || colors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <Text style={styles.cardTitle}>{cmp.complaintNo}</Text>
                      <View style={[styles.badge, { backgroundColor: statusColors[cmp.status] + '20', borderColor: statusColors[cmp.status] }]}>
                        <Text style={[styles.badgeText, { color: statusColors[cmp.status] }]}>{cmp.status.replace('_',' ').toUpperCase()}</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: priorityColors[cmp.priority] + '20', borderColor: priorityColors[cmp.priority] }]}>
                        <Text style={[styles.badgeText, { color: priorityColors[cmp.priority] }]}>{cmp.priority.toUpperCase()}</Text>
                      </View>
                      <View style={[styles.badge, { backgroundColor: colors.info + '20', borderColor: colors.info }]}>
                        <Text style={[styles.badgeText, { color: colors.info }]}>{cmp.type.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.cardSubTitle}>{cmp.customerName}{cmp.customerPhone ? ` · ${cmp.customerPhone}` : ''}</Text>
                    {cmp.invoiceNo ? <Text style={styles.metaText}>Invoice: {cmp.invoiceNo}{cmp.productName ? ` · ${cmp.productName}` : ''}</Text> : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {(cmp.status === 'open' || cmp.status === 'in_progress') && (
                      <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.success + '15' }]} onPress={() => { setResolvingCmp(cmp); setResolutionText(''); setResolvedBy(''); setShowResolveModal(true); }}>
                        <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.danger + '15' }]} onPress={() => handleDeleteComplaint(cmp._id)}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.descriptionText}>{cmp.description}</Text>
                {cmp.resolution ? (
                  <View style={[styles.resolutionBox, { backgroundColor: colors.success + '10', borderColor: colors.success }]}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.success }}>RESOLUTION</Text>
                    <Text style={{ fontSize: 12, color: colors.text.primary, marginTop: 2 }}>{cmp.resolution}</Text>
                    {cmp.resolvedBy ? <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>By: {cmp.resolvedBy}</Text> : null}
                  </View>
                ) : null}
                <Text style={styles.dateText}>{new Date(cmp.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ===== TAB 2: SAMPLES ===== */}
        {activeTab === 'samples' && (
          <View>
            {/* KPI */}
            <View style={styles.statsRow}>
              {[
                { label: 'Total Samples', val: samples.length, color: colors.primary },
                { label: 'Converted', val: samples.filter(s => s.status === 'converted').length, color: colors.success },
                { label: 'Follow-up Due', val: samples.filter(s => s.status === 'given' && s.followUpDate && new Date(s.followUpDate) < new Date()).length, color: colors.warning },
                { label: 'Total MRP', val: `₹${samples.reduce((s, x) => s + x.totalMrpValue, 0).toLocaleString('en-IN')}`, color: colors.danger, isText: true },
              ].map(s => (
                <View key={s.label} style={styles.statCard}>
                  <Text style={[styles.statValue, { color: s.color, fontSize: s.isText ? 14 : 22 }]}>{s.val}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <TouchableOpacity style={styles.addBtn} onPress={() => { resetSampleForm(); setShowSampleModal(true); }}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.addBtnText}>Log Sample</Text>
                </TouchableOpacity>
              </View>
            </View>

            {samples.length === 0 ? (
              <View style={styles.emptyBox}><Ionicons name="gift-outline" size={40} color={colors.text.secondary} /><Text style={styles.emptyText}>No samples logged yet.</Text></View>
            ) : samples.map(smp => (
              <View key={smp._id} style={[styles.card, { borderLeftWidth: 4, borderLeftColor: sampleStatusColors[smp.status] || colors.primary }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <Text style={styles.cardTitle}>{smp.sampleNo}</Text>
                      <View style={[styles.badge, { backgroundColor: sampleStatusColors[smp.status] + '20', borderColor: sampleStatusColors[smp.status] }]}>
                        <Text style={[styles.badgeText, { color: sampleStatusColors[smp.status] }]}>{smp.status.replace('_',' ').toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={styles.cardSubTitle}>🎁 To: {smp.givenTo}{smp.designation ? ` (${smp.designation})` : ''}</Text>
                    {smp.location ? <Text style={styles.metaText}>📍 {smp.location}</Text> : null}
                    {smp.purpose ? <Text style={styles.metaText}>Purpose: {smp.purpose}</Text> : null}
                    <Text style={styles.metaText}>
                      By: {smp.givenBy} · {new Date(smp.date).toLocaleDateString('en-IN')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={[styles.cardTitle, { color: colors.success }]}>₹{smp.totalMrpValue.toLocaleString()}</Text>
                    <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.danger + '15' }]} onPress={async () => { if (Platform.OS === 'web' ? window.confirm('Delete sample?') : true) { await api.deleteSample(smp._id); load(); } }}>
                      <Ionicons name="trash-outline" size={14} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ marginTop: 10, gap: 4 }}>
                  {smp.items.map((item, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.border }}>
                      <Text style={{ fontSize: 12, color: colors.text.primary, flex: 2 }}>{item.productName}{item.size ? ` (${item.size})` : ''}</Text>
                      <Text style={{ fontSize: 12, color: colors.text.secondary }}>× {item.qty}</Text>
                      <Text style={{ fontSize: 12, color: colors.success, fontWeight: '700' }}>₹{item.mrp}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {(['given','follow_up_done','converted','no_response'] as const).map(s => (
                    <TouchableOpacity key={s} style={[styles.filterChip, smp.status === s && { backgroundColor: sampleStatusColors[s], borderColor: sampleStatusColors[s] }]}
                      onPress={() => { api.updateSample(smp._id, { status: s }).then(() => load()); }}>
                      <Text style={[styles.filterChipText, smp.status === s && { color: '#fff' }]}>{s.replace('_',' ')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ===== TAB 3: TARGETS & COMMISSION ===== */}
        {activeTab === 'targets' && (
          <View>
            {/* Month/Year selector */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.secondary }}>Period:</Text>
                  {Platform.OS === 'web' ? (
                    <>
                      <select value={targetMonth} onChange={(e: any) => setTargetMonth(parseInt(e.target.value))} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.bg.secondary, color: colors.text.primary, fontSize: 13 }}>
                        {MONTHS_FULL.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                      </select>
                      <select value={targetYear} onChange={(e: any) => setTargetYear(parseInt(e.target.value))} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.bg.secondary, color: colors.text.primary, fontSize: 13 }}>
                        {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </>
                  ) : (
                    <TextInput style={styles.smallInput} value={`${targetMonth}/${targetYear}`} onChangeText={v => {}} placeholder="MM/YYYY" />
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 13, color: colors.text.secondary }}>Commission %:</Text>
                    <TextInput style={[styles.smallInput, { width: 60 }]} value={commissionRate} onChangeText={setCommissionRate} keyboardType="numeric" placeholder="5" />
                  </View>
                </View>
                <TouchableOpacity style={styles.addBtn} onPress={() => { setTgtAgentId(''); setTgtAgentName(''); setTgtAmount(''); setTgtError(''); setShowTargetModal(true); }}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.addBtnText}>Set Target</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Commission Report */}
            {commission && commission.agents.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Commission Report — {MONTHS_FULL[targetMonth - 1]} {targetYear}</Text>
                <Text style={{ fontSize: 11, color: colors.text.muted, marginBottom: 12 }}>Commission Rate: {commission.commissionRate}% on finalized invoices</Text>
                {/* Table header */}
                <View style={[styles.tableHeader]}>
                  <Text style={[styles.th, { flex: 2 }]}>AGENT</Text>
                  <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>INVOICES</Text>
                  <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>TOTAL SALES</Text>
                  <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>COMMISSION</Text>
                </View>
                {commission.agents.map((ag, i) => {
                  const target = targets.find(t => t.agentName === ag.agentName);
                  const pct = target ? Math.min(100, Math.round((ag.totalSales / target.targetAmount) * 100)) : null;
                  return (
                    <View key={i} style={[styles.tableRow, i % 2 === 1 && { backgroundColor: colors.bg.secondary }]}>
                      <View style={{ flex: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{ag.agentName}</Text>
                        {pct !== null && (
                          <View>
                            <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>Target: ₹{target!.targetAmount.toLocaleString()} ({pct}%)</Text>
                            <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                              <View style={{ height: '100%', width: `${pct}%`, backgroundColor: pct >= 100 ? colors.success : pct >= 75 ? colors.warning : colors.danger, borderRadius: 2 }} />
                            </View>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.td, { flex: 1, textAlign: 'right' }]}>{ag.invoiceCount}</Text>
                      <Text style={[styles.td, { flex: 1.2, textAlign: 'right', color: colors.primary, fontWeight: '700' }]}>₹{ag.totalSales.toLocaleString()}</Text>
                      <Text style={[styles.td, { flex: 1.2, textAlign: 'right', color: colors.success, fontWeight: '700' }]}>₹{ag.commission.toLocaleString()}</Text>
                    </View>
                  );
                })}
                <View style={[styles.tableRow, { backgroundColor: colors.primary + '08', borderTopWidth: 2, borderTopColor: colors.primary }]}>
                  <Text style={{ flex: 2, fontSize: 12, fontWeight: '800', color: colors.primary }}>TOTAL</Text>
                  <Text style={[styles.td, { flex: 1, textAlign: 'right', fontWeight: '800', color: colors.primary }]}>{commission.agents.reduce((s, a) => s + a.invoiceCount, 0)}</Text>
                  <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontWeight: '800', color: colors.primary }]}>₹{commission.agents.reduce((s, a) => s + a.totalSales, 0).toLocaleString()}</Text>
                  <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontWeight: '800', color: colors.success }]}>₹{commission.agents.reduce((s, a) => s + a.commission, 0).toLocaleString()}</Text>
                </View>
              </View>
            )}
            {commission && commission.agents.length === 0 && (
              <View style={styles.emptyBox}><Ionicons name="trophy-outline" size={40} color={colors.text.secondary} /><Text style={styles.emptyText}>No finalized invoices found for this period.</Text></View>
            )}

            {/* Targets list */}
            {targets.length > 0 && (
              <View style={[styles.card, { marginTop: 16 }]}>
                <Text style={styles.sectionTitle}>Targets Set for {MONTHS_FULL[targetMonth - 1]} {targetYear}</Text>
                {targets.map((t, i) => (
                  <View key={t._id} style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{t.agentName}</Text>
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: colors.primary }}>₹{t.targetAmount.toLocaleString()}</Text>
                      <TouchableOpacity onPress={async () => { await api.deleteSalesTarget(t._id); load(); }}>
                        <Ionicons name="trash-outline" size={14} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ===== MODAL: ADD COMPLAINT ===== */}
      <Modal visible={showCmpModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowCmpModal(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Complaint / Return</Text>
              <TouchableOpacity onPress={() => setShowCmpModal(false)}><Ionicons name="close" size={20} color={colors.text.primary} /></TouchableOpacity>
            </View>
            {cmpError ? <Text style={styles.modalError}>{cmpError}</Text> : null}
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Type *</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {(['complaint','return','exchange'] as const).map(t => (
                  <TouchableOpacity key={t} style={[styles.filterChip, cmpType === t && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setCmpType(t)}>
                    <Text style={[styles.filterChipText, cmpType === t && { color: '#fff' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.inputLabel}>Customer Name *</Text>
              <TextInput style={styles.input} value={cmpCustomerName} onChangeText={setCmpCustomerName} placeholder="Customer name" placeholderTextColor={colors.text.muted} />
              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput style={styles.input} value={cmpCustomerPhone} onChangeText={setCmpCustomerPhone} placeholder="Phone number" placeholderTextColor={colors.text.muted} keyboardType="phone-pad" />
              <Text style={styles.inputLabel}>Invoice No.</Text>
              <TextInput style={styles.input} value={cmpInvoiceNo} onChangeText={setCmpInvoiceNo} placeholder="e.g. INV-001" placeholderTextColor={colors.text.muted} />
              <Text style={styles.inputLabel}>Product</Text>
              <TextInput style={styles.input} value={cmpProductName} onChangeText={setCmpProductName} placeholder="Product name" placeholderTextColor={colors.text.muted} />
              <Text style={styles.inputLabel}>Priority</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                {(['low','medium','high'] as const).map(p => (
                  <TouchableOpacity key={p} style={[styles.filterChip, cmpPriority === p && { backgroundColor: priorityColors[p], borderColor: priorityColors[p] }]} onPress={() => setCmpPriority(p)}>
                    <Text style={[styles.filterChipText, cmpPriority === p && { color: '#fff' }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.inputLabel}>Description *</Text>
              <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={cmpDescription} onChangeText={setCmpDescription} placeholder="Describe the issue..." placeholderTextColor={colors.text.muted} multiline />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCmpModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveComplaint}><Text style={styles.submitBtnText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== MODAL: RESOLVE COMPLAINT ===== */}
      <Modal visible={showResolveModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowResolveModal(false)} />
          <View style={[styles.modalContainer, { maxHeight: 400 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Resolve {resolvingCmp?.complaintNo}</Text>
              <TouchableOpacity onPress={() => setShowResolveModal(false)}><Ionicons name="close" size={20} color={colors.text.primary} /></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Resolution Details *</Text>
              <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={resolutionText} onChangeText={setResolutionText} placeholder="What action was taken?" placeholderTextColor={colors.text.muted} multiline />
              <Text style={styles.inputLabel}>Resolved By</Text>
              <TextInput style={styles.input} value={resolvedBy} onChangeText={setResolvedBy} placeholder="Staff name" placeholderTextColor={colors.text.muted} />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowResolveModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.success }]} onPress={handleResolve}><Text style={styles.submitBtnText}>Mark Resolved</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== MODAL: ADD SAMPLE ===== */}
      <Modal visible={showSampleModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowSampleModal(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Sample Distribution</Text>
              <TouchableOpacity onPress={() => setShowSampleModal(false)}><Ionicons name="close" size={20} color={colors.text.primary} /></TouchableOpacity>
            </View>
            {smpError ? <Text style={styles.modalError}>{smpError}</Text> : null}
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Given To *</Text>
              <TextInput style={styles.input} value={smpGivenTo} onChangeText={setSmpGivenTo} placeholder="Doctor/Distributor name" placeholderTextColor={colors.text.muted} />
              <Text style={styles.inputLabel}>Designation</Text>
              <TextInput style={styles.input} value={smpDesignation} onChangeText={setSmpDesignation} placeholder="e.g. Doctor, Distributor" placeholderTextColor={colors.text.muted} />
              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput style={styles.input} value={smpPhone} onChangeText={setSmpPhone} placeholder="Contact number" placeholderTextColor={colors.text.muted} keyboardType="phone-pad" />
              <Text style={styles.inputLabel}>Location</Text>
              <TextInput style={styles.input} value={smpLocation} onChangeText={setSmpLocation} placeholder="City / Area" placeholderTextColor={colors.text.muted} />
              <Text style={styles.inputLabel}>Purpose</Text>
              <TextInput style={styles.input} value={smpPurpose} onChangeText={setSmpPurpose} placeholder="e.g. Demo, Trial, New Launch" placeholderTextColor={colors.text.muted} />
              <Text style={styles.inputLabel}>Given By</Text>
              <TextInput style={styles.input} value={smpGivenBy} onChangeText={setSmpGivenBy} placeholder="Your name" placeholderTextColor={colors.text.muted} />
              <Text style={styles.inputLabel}>Date</Text>
              <TextInput style={styles.input} value={smpDate} onChangeText={setSmpDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.muted} />
              <Text style={styles.inputLabel}>Follow-up Date (optional)</Text>
              <TextInput style={styles.input} value={smpFollowUp} onChangeText={setSmpFollowUp} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.muted} />
              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput style={[styles.input, { height: 60, textAlignVertical: 'top' }]} value={smpNotes} onChangeText={setSmpNotes} placeholder="Additional notes..." placeholderTextColor={colors.text.muted} multiline />
              <Text style={[styles.inputLabel, { marginTop: 8 }]}>Products Given:</Text>
              {smpItems.map((item, idx) => (
                <View key={idx} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                    <View style={{ flex: 2 }}>
                      <TextInput style={[styles.input, { marginBottom: 0 }]} value={item.productName} onChangeText={v => {
                        const n = [...smpItems];
                        n[idx].productName = v;
                        n[idx].productId = undefined;
                        n[idx].mrp = 0;
                        n[idx].size = undefined;
                        setSmpItems(n);
                        if (v.length >= 2) {
                          api.getProducts(v).then(res => { setSmpProductResults(res); setSmpProductDropdownIdx(idx); }).catch(() => {});
                        } else { setSmpProductResults([]); setSmpProductDropdownIdx(null); }
                      }} placeholder="Search product..." placeholderTextColor={colors.text.muted} />
                      {smpProductDropdownIdx === idx && smpProductResults.length > 0 && (
                        <View style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: 6, marginTop: 2 }}>
                          {smpProductResults.slice(0, 8).map(p => (
                            <TouchableOpacity key={p._id} style={{ paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}
                              onPress={() => {
                                const n = [...smpItems];
                                n[idx].productName = p.name;
                                n[idx].productId = p._id;
                                n[idx].mrp = p.price;
                                n[idx].size = p.size;
                                setSmpItems(n);
                                setSmpProductResults([]);
                                setSmpProductDropdownIdx(null);
                              }}>
                              <Text style={{ fontSize: 12, color: colors.text.primary }}>{p.name}</Text>
                              <Text style={{ fontSize: 10, color: colors.text.muted }}>MRP: ₹{p.price} | {p.size || 'N/A'}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                    <TextInput style={[styles.input, { flex: 0.6, marginBottom: 0 }]} value={String(item.qty)} onChangeText={v => { const n = [...smpItems]; n[idx].qty = parseInt(v) || 1; setSmpItems(n); }} placeholder="Qty" keyboardType="numeric" placeholderTextColor={colors.text.muted} />
                    <TextInput style={[styles.input, { flex: 0.8, marginBottom: 0 }]} value={String(item.mrp)} onChangeText={v => { const n = [...smpItems]; n[idx].mrp = parseFloat(v) || 0; setSmpItems(n); }} placeholder="MRP" keyboardType="numeric" placeholderTextColor={colors.text.muted} />
                    {smpItems.length > 1 && <TouchableOpacity onPress={() => { setSmpItems(smpItems.filter((_, i) => i !== idx)); setSmpProductDropdownIdx(null); }}><Ionicons name="remove-circle" size={20} color={colors.danger} /></TouchableOpacity>}
                  </View>
                </View>
              ))}
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }} onPress={() => setSmpItems([...smpItems, { productName: '', qty: 1, mrp: 0 }])}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '600' }}>Add Product</Text>
              </TouchableOpacity>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowSampleModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveSample}><Text style={styles.submitBtnText}>Save Sample</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== MODAL: SET TARGET ===== */}
      <Modal visible={showTargetModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowTargetModal(false)} />
          <View style={[styles.modalContainer, { maxHeight: 400 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Set Sales Target</Text>
              <TouchableOpacity onPress={() => setShowTargetModal(false)}><Ionicons name="close" size={20} color={colors.text.primary} /></TouchableOpacity>
            </View>
            {tgtError ? <Text style={styles.modalError}>{tgtError}</Text> : null}
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Select Agent *</Text>
              {Platform.OS === 'web' ? (
                <select value={tgtAgentId} onChange={(e: any) => { setTgtAgentId(e.target.value); setTgtAgentName(users.find(u => u._id === e.target.value)?.name || ''); }} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.border}`, backgroundColor: colors.bg.secondary, color: colors.text.primary, fontSize: 13, marginBottom: 12, width: '100%' }}>
                  <option value="">-- Select Agent --</option>
                  {users.map(u => <option key={u._id} value={u._id}>{u.name} ({u.role})</option>)}
                </select>
              ) : (
                <TextInput style={styles.input} value={tgtAgentName} onChangeText={setTgtAgentName} placeholder="Agent name" placeholderTextColor={colors.text.muted} />
              )}
              <Text style={styles.inputLabel}>Target Amount (₹) *</Text>
              <TextInput style={styles.input} value={tgtAmount} onChangeText={setTgtAmount} placeholder="e.g. 100000" keyboardType="numeric" placeholderTextColor={colors.text.muted} />
              <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>Period: {MONTHS_FULL[targetMonth - 1]} {targetYear}</Text>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowTargetModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveTarget}><Text style={styles.submitBtnText}>Save Target</Text></TouchableOpacity>
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
  tabBarScroll: { backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0 },
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
  descriptionText: { fontSize: 13, color: colors.text.secondary, marginTop: 4, lineHeight: 18 },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  dateText: { fontSize: 10, color: colors.text.muted, marginTop: 8 },
  resolutionBox: { padding: 10, borderRadius: Radius.sm, borderWidth: 1, marginTop: 8 },
  iconBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  emptyBox: { alignItems: 'center', padding: 40, gap: 8 },
  emptyText: { fontSize: 13, color: colors.text.muted },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text.primary, marginBottom: 8 },
  tableHeader: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4, backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, marginBottom: 4 },
  th: { fontSize: 10, fontWeight: '800', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', borderRadius: Radius.sm },
  td: { fontSize: 13, color: colors.text.secondary },
  smallInput: { backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: colors.text.primary, width: 100 },
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
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: colors.text.secondary },
  submitBtn: { flex: 2, paddingVertical: 12, borderRadius: Radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  submitBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
