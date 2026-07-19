import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Modal, RefreshControl, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { useTheme, useStyles } from '../utils/themeContext';
import { useToast } from '../utils/ToastContext';
import { api, MedicalRepresentative, MrDailyLog, MrVisit, MrExpense, MrDashboardSummary } from '../utils/api';
import { Spacing, Radius } from '../constants/theme';

type Tab = 'mrs' | 'attendance' | 'visits' | 'expenses' | 'dashboard';

export default function MedicalRepsScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const perm = usePermission();
  const { showToast } = useToast();
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [refreshing, setRefreshing] = useState(false);

  // MR Master
  const [mrs, setMrs] = useState<MedicalRepresentative[]>([]);
  const [mrSearch, setMrSearch] = useState('');
  const [mrModal, setMrModal] = useState(false);
  const [editMr, setEditMr] = useState<MedicalRepresentative | null>(null);
  const [mrForm, setMrForm] = useState({ name: '', phone: '', email: '', code: '', territory: '', monthlyTarget: 0, address: '', notes: '' });

  // Attendance
  const [selectedMrForAttendance, setSelectedMrForAttendance] = useState<string>('');
  const [attendanceLogs, setAttendanceLogs] = useState<MrDailyLog[]>([]);

  // Visits
  const [selectedMrForVisits, setSelectedMrForVisits] = useState<string>('');
  const [visits, setVisits] = useState<MrVisit[]>([]);
  const [visitModal, setVisitModal] = useState(false);
  const [visitForm, setVisitForm] = useState({ doctorName: '', clinicName: '', specialization: '', city: '', purpose: 'promotion', orderTaken: false, orderAmount: 0, feedback: '', notes: '' });

  // Expenses
  const [expenses, setExpenses] = useState<MrExpense[]>([]);
  const [expenseFilter, setExpenseFilter] = useState('all');
  const [expenseModal, setExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ category: 'travel', amount: 0, description: '' });

  // Dashboard
  const [dashboard, setDashboard] = useState<MrDashboardSummary | null>(null);
  const [dateRange, setDateRange] = useState('thisMonth');

  const loadMrs = useCallback(async () => {
    try { setMrs(await api.getMRs(mrSearch)); } catch { }
  }, [mrSearch]);

  const loadAttendance = useCallback(async (mrId: string) => {
    if (!mrId) return;
    try { setAttendanceLogs(await api.getMrAttendance(mrId)); } catch { }
  }, []);

  const loadVisits = useCallback(async (mrId: string) => {
    if (!mrId) return;
    try { setVisits(await api.getMrVisits(mrId)); } catch { }
  }, []);

  const loadExpenses = useCallback(async (mrId: string) => {
    if (!mrId) return;
    try { setExpenses(await api.getMrExpenses(mrId)); } catch { }
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const now = new Date();
      let from: string | undefined;
      let to: string | undefined;
      if (dateRange === 'thisMonth') {
        from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        to = now.toISOString();
      } else if (dateRange === 'lastMonth') {
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
        to = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
      } else if (dateRange === 'thisQuarter') {
        const q = Math.floor(now.getMonth() / 3);
        from = new Date(now.getFullYear(), q * 3, 1).toISOString();
        to = now.toISOString();
      }
      setDashboard(await api.getMrDashboard(from, to));
    } catch { }
  }, [dateRange]);

  useEffect(() => {
    if (activeTab === 'mrs') loadMrs();
    else if (activeTab === 'attendance' && selectedMrForAttendance) loadAttendance(selectedMrForAttendance);
    else if (activeTab === 'visits' && selectedMrForVisits) loadVisits(selectedMrForVisits);
    else if (activeTab === 'expenses' && selectedMrForVisits) loadExpenses(selectedMrForVisits);
    else if (activeTab === 'dashboard') loadDashboard();
  }, [activeTab, selectedMrForAttendance, selectedMrForVisits, loadMrs, loadAttendance, loadVisits, loadExpenses, loadDashboard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'mrs') await loadMrs();
    else if (activeTab === 'dashboard') await loadDashboard();
    setRefreshing(false);
  }, [activeTab, loadMrs, loadDashboard]);

  const handleSaveMr = async () => {
    if (!mrForm.name.trim() || !mrForm.phone.trim()) {
      showToast('Name and phone are required', 'warning');
      return;
    }
    try {
      if (editMr) {
        await api.updateMR(editMr._id, mrForm);
        showToast('MR updated', 'success');
      } else {
        await api.createMR(mrForm);
        showToast('MR created', 'success');
      }
      setMrModal(false);
      setEditMr(null);
      setMrForm({ name: '', phone: '', email: '', code: '', territory: '', monthlyTarget: 0, address: '', notes: '' });
      loadMrs();
    } catch (err: any) {
      showToast(err.message || 'Failed to save MR', 'error');
    }
  };

  const handleDeleteMr = (id: string) => {
    api.deleteMR(id).then(() => {
      showToast('MR deleted', 'success');
      loadMrs();
    }).catch(err => showToast(err.message, 'error'));
  };

  const handleSaveVisit = async () => {
    if (!visitForm.doctorName.trim()) {
      showToast('Doctor name is required', 'warning');
      return;
    }
    try {
      await api.createMrVisit(selectedMrForVisits, visitForm);
      showToast('Visit recorded', 'success');
      setVisitModal(false);
      setVisitForm({ doctorName: '', clinicName: '', specialization: '', city: '', purpose: 'promotion', orderTaken: false, orderAmount: 0, feedback: '', notes: '' });
      loadVisits(selectedMrForVisits);
    } catch (err: any) {
      showToast(err.message || 'Failed to save visit', 'error');
    }
  };

  const handleSaveExpense = async () => {
    if (expenseForm.amount <= 0) {
      showToast('Valid amount is required', 'warning');
      return;
    }
    try {
      await api.createMrExpense(selectedMrForVisits, expenseForm);
      showToast('Expense submitted', 'success');
      setExpenseModal(false);
      setExpenseForm({ category: 'travel', amount: 0, description: '' });
      loadExpenses(selectedMrForVisits);
    } catch (err: any) {
      showToast(err.message || 'Failed to save expense', 'error');
    }
  };

  const handleApproveExpense = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await api.approveMrExpense(id, status);
      showToast(`Expense ${status}`, 'success');
      loadExpenses(selectedMrForVisits);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'stats-chart' },
    { id: 'mrs', label: 'MR List', icon: 'people' },
    { id: 'attendance', label: 'Attendance', icon: 'calendar' },
    { id: 'visits', label: 'Visits', icon: 'medkit' },
    { id: 'expenses', label: 'Expenses', icon: 'cash' },
  ];

  const renderTabBar = () => (
    <View style={[styles.tabContainer, isDesktop && { maxWidth: 700 }]}>
      {TABS.map(t => (
        <TouchableOpacity key={t.id} style={[styles.tab, activeTab === t.id && styles.tabActive]} onPress={() => setActiveTab(t.id)} activeOpacity={0.7}>
          <Ionicons name={t.icon as any} size={14} color={activeTab === t.id ? colors.primary : colors.text.secondary} />
          <Text style={[styles.tabText, activeTab === t.id && styles.tabActiveText]}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const mrSelector = (onSelect: (id: string) => void, selectedId?: string) => (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      {mrs.filter(m => m.isActive).map(m => (
        <TouchableOpacity key={m._id} style={[styles.chip, selectedId === m._id && { backgroundColor: colors.primary }]} onPress={() => onSelect(m._id)}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: selectedId === m._id ? '#fff' : colors.text.primary }}>{m.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderDashboard = () => {
    if (!dashboard) return <ActivityIndicator style={{ marginTop: 40 }} />;
    const { mrs: mrData, totals } = dashboard;
    return (
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.dateFilter}>
          {['thisMonth', 'lastMonth', 'thisQuarter'].map(d => (
            <TouchableOpacity key={d} style={[styles.chip, dateRange === d && { backgroundColor: colors.primary }]} onPress={() => setDateRange(d)}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: dateRange === d ? '#fff' : colors.text.primary }}>
                {d === 'thisMonth' ? 'This Month' : d === 'lastMonth' ? 'Last Month' : 'This Quarter'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.summaryCards}>
          {[
            { label: 'Visits', value: totals.visits, icon: 'medkit', color: colors.primary },
            { label: 'Orders', value: totals.orders, icon: 'cart', color: colors.success },
            { label: 'Order Value', value: `₹${(totals.orderValue || 0).toLocaleString('en-IN')}`, icon: 'cash', color: colors.warning },
            { label: 'Expenses', value: `₹${(totals.expenses || 0).toLocaleString('en-IN')}`, icon: 'trending-down', color: colors.danger },
            { label: 'Distance', value: `${(totals.distance || 0).toFixed(0)} km`, icon: 'navigate', color: colors.info },
          ].map(s => (
            <View key={s.label} style={styles.summaryCard}>
              <Ionicons name={s.icon as any} size={20} color={s.color} />
              <Text style={[styles.summaryValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.summaryLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {mrData.length === 0 ? (
          <Text style={{ textAlign: 'center', color: colors.text.muted, marginTop: 20 }}>No data for this period</Text>
        ) : (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.sectionTitle}>MR-wise Performance</Text>
            {mrData.map(m => {
              const roi = m.expenses > 0 ? ((m.orderValue - m.expenses) / m.expenses * 100).toFixed(0) : '∞';
              return (
                <View key={m._id} style={styles.mrCard}>
                  <View style={styles.mrCardHeader}>
                    <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
                      <Text style={[styles.avatarText, { color: colors.primary }]}>{m.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', color: colors.text.primary }}>{m.name}</Text>
                      <Text style={{ fontSize: 11, color: colors.text.muted }}>{m.territory || 'No territory'} • Target: ₹{(m.monthlyTarget || 0).toLocaleString('en-IN')}</Text>
                    </View>
                  </View>
                  <View style={styles.mrCardStats}>
                    {[
                      ['Visits', m.visits], ['Orders', m.orders], ['Order ₹', m.orderValue],
                      ['Exp ₹', m.expenses], ['Days', m.daysWorked], ['Km', m.totalDistance.toFixed(0)], ['ROI', `${roi}%`],
                    ].map(([l, v]) => (
                      <View key={l as string} style={styles.stat}>
                        <Text style={styles.statValue}>{v}</Text>
                        <Text style={styles.statLabel}>{l}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    );
  };

  const renderMrList = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Search MRs..." placeholderTextColor={colors.text.muted} value={mrSearch} onChangeText={setMrSearch} />
        <TouchableOpacity style={styles.addBtn} onPress={() => { setEditMr(null); setMrForm({ name: '', phone: '', email: '', code: '', territory: '', monthlyTarget: 0, address: '', notes: '' }); setMrModal(true); }}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {mrs.map(m => (
          <View key={m._id} style={styles.mrCard}>
            <View style={styles.mrCardHeader}>
              <View style={[styles.avatar, { backgroundColor: m.isActive ? colors.primary + '20' : colors.text.muted + '20' }]}>
                <Text style={[styles.avatarText, { color: m.isActive ? colors.primary : colors.text.muted }]}>{m.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontWeight: '700', color: colors.text.primary }}>{m.name}</Text>
                  {m.code && <Text style={{ fontSize: 10, color: colors.text.muted }}>({m.code})</Text>}
                  {!m.isActive && <Text style={{ fontSize: 10, color: colors.danger, fontWeight: '700' }}>INACTIVE</Text>}
                </View>
                <Text style={{ fontSize: 12, color: colors.text.secondary }}>{m.phone} {m.email ? `• ${m.email}` : ''}</Text>
                <Text style={{ fontSize: 11, color: colors.text.muted }}>{m.territory || 'No territory'} | Target: ₹{(m.monthlyTarget || 0).toLocaleString('en-IN')}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {perm.can('mr:edit') && (
                  <TouchableOpacity onPress={() => { setEditMr(m); setMrForm({ name: m.name, phone: m.phone, email: m.email || '', code: m.code || '', territory: m.territory || '', monthlyTarget: m.monthlyTarget || 0, address: m.address || '', notes: m.notes || '' }); setMrModal(true); }}>
                    <Ionicons name="create-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>
                )}
                {perm.can('mr:delete') && (
                  <TouchableOpacity onPress={() => handleDeleteMr(m._id)}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={mrModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editMr ? 'Edit MR' : 'Add MR'}</Text>
            <ScrollView>
              {[
                ['name', 'Full Name', true], ['phone', 'Phone Number', true], ['email', 'Email', false],
                ['code', 'MR Code', false], ['territory', 'Territory/Area', false],
              ].map(([k, label, req]) => (
                <View key={k}>
                  <Text style={styles.label}>{label} {req ? '*' : ''}</Text>
                  <TextInput style={styles.input} value={(mrForm as any)[k]} onChangeText={v => setMrForm({ ...mrForm, [k]: v })} placeholderTextColor={colors.text.muted} />
                </View>
              ))}
              <Text style={styles.label}>Monthly Target (₹)</Text>
              <TextInput style={styles.input} value={mrForm.monthlyTarget.toString()} onChangeText={v => setMrForm({ ...mrForm, monthlyTarget: Number(v) || 0 })} keyboardType="numeric" placeholderTextColor={colors.text.muted} />
              <Text style={styles.label}>Address</Text>
              <TextInput style={styles.input} value={mrForm.address} onChangeText={v => setMrForm({ ...mrForm, address: v })} multiline placeholderTextColor={colors.text.muted} />
              <Text style={styles.label}>Notes</Text>
              <TextInput style={styles.input} value={mrForm.notes} onChangeText={v => setMrForm({ ...mrForm, notes: v })} multiline placeholderTextColor={colors.text.muted} />
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: colors.border }]} onPress={() => setMrModal(false)}><Text style={{ fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: colors.primary }]} onPress={handleSaveMr}><Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  const renderAttendance = () => (
    <View style={{ flex: 1 }}>
      <Text style={styles.sectionTitle}>Select MR</Text>
      {mrSelector(id => { setSelectedMrForAttendance(id); loadAttendance(id); }, selectedMrForAttendance)}
      {selectedMrForAttendance ? (
        <ScrollView>
          {attendanceLogs.map(log => (
            <View key={log._id} style={styles.mrCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', color: colors.text.primary }}>{new Date(log.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
                <Text style={{ fontSize: 12, color: log.status === 'checked_in' ? colors.success : colors.text.muted }}>{log.status === 'checked_in' ? 'CHECKED IN' : 'CHECKED OUT'}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 20, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: colors.text.muted }}>Check-in</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }}>{log.checkIn?.time ? new Date(log.checkIn.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</Text>
                  {log.checkIn?.location && <Text style={{ fontSize: 10, color: colors.text.muted }}>{log.checkIn.location}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: colors.text.muted }}>Check-out</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }}>{log.checkOut?.time ? new Date(log.checkOut.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</Text>
                  {log.checkOut?.location && <Text style={{ fontSize: 10, color: colors.text.muted }}>{log.checkOut.location}</Text>}
                </View>
              </View>
              {log.totalDistance ? <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 4 }}>Distance: {log.totalDistance} km</Text> : null}
            </View>
          ))}
          {attendanceLogs.length === 0 && <Text style={{ textAlign: 'center', color: colors.text.muted, marginTop: 20 }}>No attendance records</Text>}
        </ScrollView>
      ) : (
        <Text style={{ textAlign: 'center', color: colors.text.muted, marginTop: 20 }}>Select an MR to view attendance</Text>
      )}
    </View>
  );

  const renderVisits = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Select MR</Text>
        {selectedMrForVisits && perm.can('mr:visits') && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setVisitModal(true)}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
      {mrSelector(id => { setSelectedMrForVisits(id); loadVisits(id); loadExpenses(id); }, selectedMrForVisits)}
      {selectedMrForVisits ? (
        <ScrollView>
          {visits.map(v => (
            <View key={v._id} style={styles.mrCard}>
              <View style={styles.mrCardHeader}>
                <View style={[styles.avatar, { backgroundColor: colors.success + '20' }]}>
                  <Text style={[styles.avatarText, { color: colors.success }]}>{v.doctorName.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: colors.text.primary }}>{v.doctorName}</Text>
                  <Text style={{ fontSize: 11, color: colors.text.muted }}>{v.clinicName} {v.city ? `• ${v.city}` : ''}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: v.purpose === 'promotion' ? colors.primary + '20' : colors.warning + '20' }]}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: v.purpose === 'promotion' ? colors.primary : colors.warning }}>{v.purpose}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                <Text style={{ fontSize: 12, color: colors.text.secondary }}>{new Date(v.date).toLocaleDateString('en-IN')}</Text>
                {v.checkIn?.time && <Text style={{ fontSize: 12, color: colors.text.secondary }}>{new Date(v.checkIn.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</Text>}
                {v.orderTaken && <Text style={{ fontSize: 12, fontWeight: '700', color: colors.success }}>Order: ₹{(v.orderAmount || 0).toLocaleString('en-IN')}</Text>}
              </View>
            </View>
          ))}
          {visits.length === 0 && <Text style={{ textAlign: 'center', color: colors.text.muted, marginTop: 20 }}>No visits recorded</Text>}
        </ScrollView>
      ) : (
        <Text style={{ textAlign: 'center', color: colors.text.muted, marginTop: 20 }}>Select an MR to view visits</Text>
      )}

      <Modal visible={visitModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New Visit</Text>
            <ScrollView>
              <Text style={styles.label}>Doctor Name *</Text>
              <TextInput style={styles.input} value={visitForm.doctorName} onChangeText={v => setVisitForm({ ...visitForm, doctorName: v })} placeholderTextColor={colors.text.muted} />
              <Text style={styles.label}>Clinic/Hospital</Text>
              <TextInput style={styles.input} value={visitForm.clinicName} onChangeText={v => setVisitForm({ ...visitForm, clinicName: v })} placeholderTextColor={colors.text.muted} />
              <Text style={styles.label}>Specialization</Text>
              <TextInput style={styles.input} value={visitForm.specialization} onChangeText={v => setVisitForm({ ...visitForm, specialization: v })} placeholderTextColor={colors.text.muted} />
              <Text style={styles.label}>City</Text>
              <TextInput style={styles.input} value={visitForm.city} onChangeText={v => setVisitForm({ ...visitForm, city: v })} placeholderTextColor={colors.text.muted} />
              <Text style={styles.label}>Purpose</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {['promotion', 'sampling', 'collection', 'followup', 'meeting'].map(p => (
                  <TouchableOpacity key={p} style={[styles.chip, visitForm.purpose === p && { backgroundColor: colors.primary }]} onPress={() => setVisitForm({ ...visitForm, purpose: p })}>
                    <Text style={{ fontSize: 12, color: visitForm.purpose === p ? '#fff' : colors.text.primary }}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <TouchableOpacity style={[styles.chip, visitForm.orderTaken && { backgroundColor: colors.success }]} onPress={() => setVisitForm({ ...visitForm, orderTaken: !visitForm.orderTaken })}>
                  <Text style={{ fontSize: 12, color: visitForm.orderTaken ? '#fff' : colors.text.primary }}>{visitForm.orderTaken ? 'Order Taken' : 'No Order'}</Text>
                </TouchableOpacity>
                {visitForm.orderTaken && (
                  <TextInput style={[styles.input, { flex: 1 }]} value={visitForm.orderAmount.toString()} onChangeText={v => setVisitForm({ ...visitForm, orderAmount: Number(v) || 0 })} keyboardType="numeric" placeholder="Order amount" placeholderTextColor={colors.text.muted} />
                )}
              </View>
              <Text style={styles.label}>Feedback</Text>
              <TextInput style={styles.input} value={visitForm.feedback} onChangeText={v => setVisitForm({ ...visitForm, feedback: v })} multiline placeholderTextColor={colors.text.muted} />
              <Text style={styles.label}>Notes</Text>
              <TextInput style={styles.input} value={visitForm.notes} onChangeText={v => setVisitForm({ ...visitForm, notes: v })} multiline placeholderTextColor={colors.text.muted} />
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: colors.border }]} onPress={() => setVisitModal(false)}><Text style={{ fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: colors.primary }]} onPress={handleSaveVisit}><Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  const renderExpenses = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>Select MR</Text>
        {selectedMrForVisits && perm.can('mr:expenses') && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setExpenseModal(true)}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
      {mrSelector(id => { setSelectedMrForVisits(id); loadVisits(id); loadExpenses(id); }, selectedMrForVisits)}
      {selectedMrForVisits ? (
        <ScrollView>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {['all', 'pending', 'approved', 'rejected'].map(s => (
              <TouchableOpacity key={s} style={[styles.chip, expenseFilter === s && { backgroundColor: colors.primary }]} onPress={() => setExpenseFilter(s)}>
                <Text style={{ fontSize: 12, color: expenseFilter === s ? '#fff' : colors.text.primary }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {expenses.filter(e => expenseFilter === 'all' || e.status === expenseFilter).map(e => (
            <View key={e._id} style={styles.mrCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontWeight: '700', color: colors.text.primary }}>{e.category.toUpperCase()} • ₹{e.amount.toLocaleString('en-IN')}</Text>
                  <Text style={{ fontSize: 12, color: colors.text.secondary }}>{new Date(e.date).toLocaleDateString('en-IN')} {e.description ? `• ${e.description}` : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <View style={[styles.badge, {
                    backgroundColor: e.status === 'approved' ? colors.success + '20' : e.status === 'rejected' ? colors.danger + '20' : colors.warning + '20'
                  }]}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: e.status === 'approved' ? colors.success : e.status === 'rejected' ? colors.danger : colors.warning }}>{e.status}</Text>
                  </View>
                  {e.status === 'pending' && perm.can('mr:approveExpenses') && (
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <TouchableOpacity style={{ padding: 4 }} onPress={() => handleApproveExpense(e._id, 'approved')}>
                        <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                      </TouchableOpacity>
                      <TouchableOpacity style={{ padding: 4 }} onPress={() => handleApproveExpense(e._id, 'rejected')}>
                        <Ionicons name="close-circle" size={20} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))}
          {expenses.length === 0 && <Text style={{ textAlign: 'center', color: colors.text.muted, marginTop: 20 }}>No expenses</Text>}
        </ScrollView>
      ) : (
        <Text style={{ textAlign: 'center', color: colors.text.muted, marginTop: 20 }}>Select an MR to view expenses</Text>
      )}

      <Modal visible={expenseModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>New Expense</Text>
            <Text style={styles.label}>Category</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {['travel', 'food', 'stay', 'conveyance', 'stationery', 'mobile', 'misc'].map(c => (
                <TouchableOpacity key={c} style={[styles.chip, expenseForm.category === c && { backgroundColor: colors.primary }]} onPress={() => setExpenseForm({ ...expenseForm, category: c })}>
                  <Text style={{ fontSize: 12, color: expenseForm.category === c ? '#fff' : colors.text.primary }}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Amount (₹) *</Text>
            <TextInput style={styles.input} value={expenseForm.amount > 0 ? expenseForm.amount.toString() : ''} onChangeText={v => setExpenseForm({ ...expenseForm, amount: Number(v) || 0 })} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.text.muted} />
            <Text style={styles.label}>Description</Text>
            <TextInput style={styles.input} value={expenseForm.description} onChangeText={v => setExpenseForm({ ...expenseForm, description: v })} placeholder="What was this for?" placeholderTextColor={colors.text.muted} />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: colors.border }]} onPress={() => setExpenseModal(false)}><Text style={{ fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: colors.primary }]} onPress={handleSaveExpense}><Text style={{ color: '#fff', fontWeight: '700' }}>Submit</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}
      refreshControl={activeTab === 'dashboard' || activeTab === 'mrs' ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}>
      <View style={{ marginBottom: Spacing.md }}>
        <Text style={styles.pageTitle}>Medical Representatives</Text>
        <Text style={styles.pageSubtitle}>Track field staff activity, visits & expenses</Text>
      </View>
      {renderTabBar()}
      <View style={{ marginTop: Spacing.md }}>
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'mrs' && renderMrList()}
        {activeTab === 'attendance' && renderAttendance()}
        {activeTab === 'visits' && renderVisits()}
        {activeTab === 'expenses' && renderExpenses()}
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  scrollContent: { padding: Spacing.lg },
  pageTitle: { fontSize: 20, fontWeight: '800', color: colors.text.primary },
  pageSubtitle: { fontSize: 13, color: colors.text.muted, marginTop: 2 },
  tabContainer: { flexDirection: 'row', backgroundColor: colors.bg.card, borderRadius: Radius.md, padding: 4, gap: 2 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: Radius.sm },
  tabActive: { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border },
  tabText: { fontSize: 11, fontWeight: '600', color: colors.text.secondary },
  tabActiveText: { color: colors.primary, fontWeight: '800' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text.primary, marginBottom: 8 },
  input: { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text.primary, marginBottom: 8 },
  label: { fontSize: 11, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', marginBottom: 4, marginTop: 8 },
  btn: { paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center' },
  addBtn: { backgroundColor: colors.primary, borderRadius: Radius.md, padding: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  summaryCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  summaryCard: { flex: 1, minWidth: 100, backgroundColor: colors.bg.card, borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 16, fontWeight: '800' },
  summaryLabel: { fontSize: 10, color: colors.text.muted, fontWeight: '600' },
  dateFilter: { flexDirection: 'row', gap: 8 },
  mrCard: { backgroundColor: colors.bg.card, borderRadius: Radius.md, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  mrCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mrCardStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  stat: { alignItems: 'center', minWidth: 45 },
  statValue: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
  statLabel: { fontSize: 9, color: colors.text.muted },
  avatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.lg },
  modal: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, maxHeight: '80%' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text.primary, marginBottom: 12 },
});
