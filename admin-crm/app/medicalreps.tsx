import { PressableOpacity as TouchableOpacity } from './../components/PressableOpacity';
import { AppTextInput as TextInput } from './../components/AppTextInput';
import { AppText as Text } from './../components/AppText';
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Modal, RefreshControl, useWindowDimensions, Platform, Pressable, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { useTheme, useStyles } from '../utils/themeContext';
import { useToast } from '../utils/ToastContext';
import { useConfirm } from '../utils/ConfirmContext';
import { api, MedicalRepresentative, MrDailyLog, MrVisit, MrAssignment, Doctor, MrExpense, MrDashboardSummary, Product } from '../utils/api';
import { LightColors, Spacing, Radius, Shadows, Typography } from '../constants/theme';
import { WorkspaceTabs, WorkspaceLoading, StatusPill, EmptyState, WorkspaceTransition } from './../components/WorkspacePrimitives';
import { PageHeader as WorkspaceHeader } from './../components/PageHeader';
import { ResponsiveSelect } from './../components/ResponsiveSelect';
import { FormField } from './../components/FormField';

type Tab = 'dashboard' | 'mrs' | 'portfolio' | 'attendance' | 'visits' | 'expenses';

export default function MedicalRepsScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const perm = usePermission();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { user } = useAuth();
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [activeTab, setActiveTab] = useState<Tab>('mrs');
  const [refreshing, setRefreshing] = useState(false);

  // MR Master
  const [mrs, setMrs] = useState<MedicalRepresentative[]>([]);
  const [mrSearch, setMrSearch] = useState('');
  const [mrModal, setMrModal] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [mrSaving, setMrSaving] = useState(false);
  const [editMr, setEditMr] = useState<MedicalRepresentative | null>(null);
  const [mrForm, setMrForm] = useState({ name: '', phone: '', email: '', code: '', territory: '', monthlyTarget: 0, address: '', notes: '' });

  // Flexible MR portfolio assignments
  const [assignments, setAssignments] = useState<MrAssignment[]>([]);
  const [assignmentModal, setAssignmentModal] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState<Partial<MrAssignment>>({ entityType: 'doctor', entityName: '', area: '', territory: '', role: 'primary', priority: 'normal', preferredVisitDays: [], notes: '' });

  // Selected MR ID (consolidated from attendance/visits)
  const [selectedMrId, setSelectedMrId] = useState<string>('');

  // Attendance
  const [attendanceLogs, setAttendanceLogs] = useState<MrDailyLog[]>([]);
  const [checkInModal, setCheckInModal] = useState(false);
  const [checkInForm, setCheckInForm] = useState<{
    location: string;
    startKmReading: number;
    latitude?: number;
    longitude?: number;
  }>({ location: '', startKmReading: 0 });
  const [checkOutModal, setCheckOutModal] = useState(false);
  const [checkOutForm, setCheckOutForm] = useState<{
    location: string;
    endKmReading: number;
    latitude?: number;
    longitude?: number;
  }>({ location: '', endKmReading: 0 });

  // Visits & Products
  const [products, setProducts] = useState<Product[]>([]);
  const [visits, setVisits] = useState<MrVisit[]>([]);
  const [visitModal, setVisitModal] = useState(false);
  const [visitForm, setVisitForm] = useState<{
    doctorId?: string;
    doctorName: string;
    clinicName: string;
    specialization: string;
    city: string;
    purpose: string;
    orderTaken: boolean;
    orderAmount: number;
    sampleDetails: any[];
    feedback: string;
    notes: string;
    latitude?: number;
    longitude?: number;
  }>({
    doctorId: undefined,
    doctorName: '',
    clinicName: '',
    specialization: '',
    city: '',
    purpose: 'promotion',
    orderTaken: false,
    orderAmount: 0,
    sampleDetails: [],
    feedback: '',
    notes: '',
    latitude: undefined,
    longitude: undefined,
  });
  const [doctorSuggestions, setDoctorSuggestions] = useState<Doctor[]>([]);
  const [showDoctorSuggestions, setShowDoctorSuggestions] = useState(false);
  const [sampleProdId, setSampleProdId] = useState('');
  const [sampleQty, setSampleQty] = useState<string>('1');

  // Expenses
  const [expenses, setExpenses] = useState<MrExpense[]>([]);
  const [expenseFilter, setExpenseFilter] = useState('all');
  const [expenseModal, setExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ category: 'travel', amount: 0, description: '' });

  // Dashboard
  const [dashboard, setDashboard] = useState<MrDashboardSummary | null>(null);
  const [dateRange, setDateRange] = useState('thisMonth');

  const loadProducts = useCallback(async () => {
    try { setProducts(await api.getProducts()); } catch { }
  }, []);

  const loadMrs = useCallback(async () => {
    try {
      const res = await api.getMRs(mrSearch);
      setMrs(res);
      // Auto-select logged-in MR by matching email, otherwise first active MR
      const active = res.filter(m => m.isActive);
      if (active.length > 0) {
        const loggedInMr = user?.email ? active.find(m => m.email?.toLowerCase() === user.email.toLowerCase()) : null;
        const defaultMrId = loggedInMr ? loggedInMr._id : active[0]._id;
        setSelectedMrId(prev => prev || defaultMrId);
      }
    } catch { }
  }, [mrSearch, user]);

  const loadAssignments = useCallback(async (mrId: string) => {
    if (!mrId) return;
    try { setAssignments(await api.getMrAssignments(mrId)); } catch { setAssignments([]); }
  }, []);

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
    loadMrs();
    loadProducts();
  }, [loadMrs, loadProducts]);

  useEffect(() => {
    if (activeTab === 'mrs') loadMrs();
    else if (activeTab === 'portfolio' && selectedMrId) loadAssignments(selectedMrId);
    else if (activeTab === 'attendance' && selectedMrId) loadAttendance(selectedMrId);
    else if (activeTab === 'visits' && selectedMrId) loadVisits(selectedMrId);
    else if (activeTab === 'expenses' && selectedMrId) loadExpenses(selectedMrId);
    else if (activeTab === 'dashboard') loadDashboard();
  }, [activeTab, selectedMrId, loadMrs, loadAssignments, loadAttendance, loadVisits, loadExpenses, loadDashboard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    api.clearCache();
    if (activeTab === 'mrs') await loadMrs();
    else if (activeTab === 'dashboard') await loadDashboard();
    else if (activeTab === 'portfolio' && selectedMrId) await loadAssignments(selectedMrId);
    else if (activeTab === 'attendance' && selectedMrId) await loadAttendance(selectedMrId);
    else if (activeTab === 'visits' && selectedMrId) await loadVisits(selectedMrId);
    else if (activeTab === 'expenses' && selectedMrId) await loadExpenses(selectedMrId);
    setRefreshing(false);
  }, [activeTab, selectedMrId, loadMrs, loadDashboard, loadAssignments, loadAttendance, loadVisits, loadExpenses]);

  const fetchGpsLocation = (): Promise<{ latitude?: number; longitude?: number }> => {
    return new Promise((resolve) => {
      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude
            });
          },
          (_) => resolve({}),
          { timeout: 5000, enableHighAccuracy: true }
        );
      } else {
        resolve({});
      }
    });
  };

  const handleOpenCheckInModal = async () => {
    setCheckInForm({ location: '', startKmReading: 0 });
    setCheckInModal(true);
    const coords = await fetchGpsLocation();
    if (coords.latitude !== undefined && coords.longitude !== undefined) {
      const lat = coords.latitude;
      const lng = coords.longitude;
      setCheckInForm(prev => ({
        ...prev,
        latitude: lat,
        longitude: lng,
        location: prev.location ? prev.location : `GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`
      }));
      showToast(`GPS acquired: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'success');
    }
  };

  const handleOpenCheckOutModal = async () => {
    setCheckOutForm({ location: '', endKmReading: 0 });
    setCheckOutModal(true);
    const coords = await fetchGpsLocation();
    if (coords.latitude !== undefined && coords.longitude !== undefined) {
      const lat = coords.latitude;
      const lng = coords.longitude;
      setCheckOutForm(prev => ({
        ...prev,
        latitude: lat,
        longitude: lng,
        location: prev.location ? prev.location : `GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`
      }));
      showToast(`GPS acquired: ${lat.toFixed(4)}, ${lng.toFixed(4)}`, 'success');
    }
  };

  const handleCheckInSubmit = async () => {
    if (!selectedMrId) return;
    try {
      let coords: { latitude?: number; longitude?: number } = { latitude: checkInForm.latitude, longitude: checkInForm.longitude };
      if (!coords.latitude || !coords.longitude) {
        showToast('Capturing GPS location...', 'info');
        coords = await fetchGpsLocation();
      }
      const payload = {
        ...checkInForm,
        latitude: coords.latitude,
        longitude: coords.longitude
      };
      await api.mrCheckIn(selectedMrId, payload);
      showToast('Field check-in recorded with live GPS coordinates!', 'success');
      setCheckInModal(false);
      setCheckInForm({ location: '', startKmReading: 0 });
      loadAttendance(selectedMrId);
    } catch (err: any) {
      showToast(err.message || 'Check-in failed', 'error');
    }
  };

  const handleCheckOutSubmit = async () => {
    if (!selectedMrId) return;
    try {
      let coords: { latitude?: number; longitude?: number } = { latitude: checkOutForm.latitude, longitude: checkOutForm.longitude };
      if (!coords.latitude || !coords.longitude) {
        showToast('Capturing GPS location...', 'info');
        coords = await fetchGpsLocation();
      }
      const payload = {
        ...checkOutForm,
        latitude: coords.latitude,
        longitude: coords.longitude
      };
      await api.mrCheckOut(selectedMrId, payload);
      showToast('Field check-out recorded with live GPS coordinates!', 'success');
      setCheckOutModal(false);
      setCheckOutForm({ location: '', endKmReading: 0 });
      loadAttendance(selectedMrId);
    } catch (err: any) {
      showToast(err.message || 'Check-out failed', 'error');
    }
  };

  const handleAddSampleProduct = () => {
    if (!sampleProdId) return;
    const prod = products.find(p => p._id === sampleProdId);
    if (!prod) return;
    const parsedQty = Math.max(1, parseInt(sampleQty) || 1);

    setVisitForm(prev => {
      const existingIndex = prev.sampleDetails.findIndex(s => s.productId === sampleProdId);
      if (existingIndex >= 0) {
        const updated = [...prev.sampleDetails];
        updated[existingIndex] = {
          ...updated[existingIndex],
          qty: updated[existingIndex].qty + parsedQty
        };
        return { ...prev, sampleDetails: updated };
      }
      return {
        ...prev,
        sampleDetails: [
          ...prev.sampleDetails,
          { productId: prod._id, name: prod.name, qty: parsedQty }
        ]
      };
    });
    setSampleProdId('');
    setSampleQty('1');
  };

  const handleUpdateSampleQty = (prodId: string, delta: number) => {
    setVisitForm(prev => {
      const updated = prev.sampleDetails.map(s => {
        if (s.productId === prodId) {
          const newQty = s.qty + delta;
          return newQty > 0 ? { ...s, qty: newQty } : null;
        }
        return s;
      }).filter(Boolean) as any[];
      return { ...prev, sampleDetails: updated };
    });
  };

  const handleRemoveSampleProduct = (prodId?: string) => {
    setVisitForm(prev => ({
      ...prev,
      sampleDetails: prev.sampleDetails.filter(s => s.productId !== prodId)
    }));
  };

  const handleSaveMr = async () => {
    const name = mrForm.name.trim();
    const phone = mrForm.phone.trim();
    const email = mrForm.email.trim();
    let hasError = false;
    if (!name) { showToast('Please enter the Medical Representative name', 'info'); hasError = true; }
    else if (!phone) { showToast('Please enter a phone number', 'info'); hasError = true; }
    else if (email && !/^\S+@\S+\.\S+$/.test(email)) { showToast('Please enter a valid email address', 'info'); hasError = true; }
    else if (mrForm.monthlyTarget < 0 || !Number.isFinite(mrForm.monthlyTarget)) { showToast('Monthly target must be 0 or more', 'info'); hasError = true; }
    
    if (hasError) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);

    setMrSaving(true);
    try {
      const payload = { ...mrForm, name, phone, email, monthlyTarget: Number(mrForm.monthlyTarget) || 0 };
      const saved = editMr
        ? await api.updateMR(editMr._id, payload)
        : await api.createMR(payload);
      showToast(editMr ? 'Medical Representative updated successfully' : 'Medical Representative created successfully', 'success');
      setMrModal(false);
      setEditMr(null);
      setMrForm({ name: '', phone: '', email: '', code: '', territory: '', monthlyTarget: 0, address: '', notes: '' });
      await loadMrs();
      if (!editMr && saved?._id) {
        setSelectedMrId(saved._id);
      }
    } catch (err: any) {
      showToast(err?.message || 'Unable to save Medical Representative. Please check the highlighted data and try again.', 'error');
    } finally {
      setMrSaving(false);
    }
  };

  const handleDeleteMr = (id: string) => {
    confirm({
      title: 'Delete Medical Representative?',
      description: 'This will permanently delete this representative and their associated assignments. This action cannot be undone.',
      destructive: true,
      confirmLabel: 'Delete Representative',
      iconName: 'trash-outline',
      onConfirm: () => {
        api.deleteMR(id).then(() => {
          showToast('MR deleted successfully', 'success');
          loadMrs();
        }).catch(err => showToast(err.message, 'error'));
      }
    });
  };

  const handleLogVisitLocation = async () => {
    try {
      showToast('Capturing current GPS coordinates...', 'info');
      const coords = await fetchGpsLocation();
      if (coords.latitude && coords.longitude) {
        setVisitForm(prev => ({
          ...prev,
          latitude: coords.latitude,
          longitude: coords.longitude
        }));
        showToast('Location logged successfully.', 'success');
      } else {
        showToast('Unable to capture location. Please grant location permissions.', 'error');
      }
    } catch (err) {
      showToast('Failed to acquire GPS location', 'error');
    }
  };

  const handleDoctorNameChange = async (text: string) => {
    setVisitForm(prev => ({ ...prev, doctorName: text, doctorId: undefined }));
    if (text.trim().length >= 2) {
      try {
        const res = await api.getDoctors(text, undefined, undefined, 1, 5);
        const docs = res.doctors || [];
        setDoctorSuggestions(docs);
        setShowDoctorSuggestions(docs.length > 0);
      } catch {
        setDoctorSuggestions([]);
        setShowDoctorSuggestions(false);
      }
    } else {
      setDoctorSuggestions([]);
      setShowDoctorSuggestions(false);
    }
  };

  const handleSelectDoctorSuggestion = (doc: Doctor) => {
    setVisitForm(prev => ({
      ...prev,
      doctorId: doc._id,
      doctorName: doc.name,
      clinicName: doc.clinicName || prev.clinicName,
      specialization: doc.specialization || prev.specialization,
      city: doc.city || prev.city,
    }));
    setShowDoctorSuggestions(false);
    setDoctorSuggestions([]);
  };

  const handleSaveVisit = async () => {
    if (!visitForm.doctorName.trim()) {
      showToast('Doctor name is required', 'info');
      return;
    }
    if (!visitForm.latitude || !visitForm.longitude) {
      showToast('GPS location is required before saving this visit.', 'warning');
      return;
    }
    try {
      await api.createMrVisit(selectedMrId, visitForm);
      showToast('Doctor visit recorded with verified GPS location', 'success');
      setVisitModal(false);
      setShowDoctorSuggestions(false);
      setDoctorSuggestions([]);
      setVisitForm({
        doctorId: undefined, doctorName: '', clinicName: '', specialization: '', city: '',
        purpose: 'promotion', orderTaken: false, orderAmount: 0, sampleDetails: [],
        feedback: '', notes: '', latitude: undefined, longitude: undefined
      });
      loadVisits(selectedMrId);
    } catch (err: any) {
      showToast(err.message || 'Failed to save visit', 'error');
    }
  };

  const handleSaveExpense = async () => {
    if (expenseForm.amount <= 0) {
      showToast('Valid expense amount is required', 'info');
      return;
    }
    try {
      await api.createMrExpense(selectedMrId, expenseForm);
      showToast('Expense claim submitted', 'success');
      setExpenseModal(false);
      setExpenseForm({ category: 'travel', amount: 0, description: '' });
      loadExpenses(selectedMrId);
    } catch (err: any) {
      showToast(err.message || 'Failed to save expense', 'error');
    }
  };

  const handleApproveExpense = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await api.approveMrExpense(id, status);
      showToast(`Expense ${status}`, 'success');
      loadExpenses(selectedMrId);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleOpenNewMrModal = () => {
    setEditMr(null);
    const nextNum = (mrs.length + 1).toString().padStart(3, '0');
    setMrForm({
      name: '',
      phone: '',
      email: '',
      code: `MR-${nextNum}`,
      territory: '',
      monthlyTarget: 0,
      address: '',
      notes: ''
    });
    setMrModal(true);
  };

  const TABS: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; desc: string }[] = [
    { id: 'dashboard', label: 'Overview', icon: 'stats-chart', desc: 'Performance & ROI' },
    { id: 'mrs', label: 'Team', icon: 'people', desc: 'Field Team Directory' },
    { id: 'portfolio', label: 'Portfolio', icon: 'briefcase-outline', desc: 'Doctors, Chemists & Territories' },
    { id: 'attendance', label: 'Attendance', icon: 'location', desc: 'Check-ins & Distance' },
    { id: 'visits', label: 'Visits', icon: 'medkit', desc: 'Clinic Calls & Orders' },
    { id: 'expenses', label: 'Expenses', icon: 'wallet', desc: 'T&E & Approvals' },
  ];

  const categoryIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
    travel: 'car-outline',
    food: 'fast-food-outline',
    stay: 'bed-outline',
    conveyance: 'bus-outline',
    stationery: 'document-text-outline',
    mobile: 'call-outline',
    misc: 'ellipsis-horizontal-circle-outline'
  };

  const mrSelector = (onSelect: (id: string) => void, selectedId?: string) => {
    const activeMRs = mrs.filter(m => m.isActive);
    if (activeMRs.length === 0) {
      return (
        <EmptyState title={<>No active Medical Representatives found.</>} actionLabel="Add Representative" onAction={handleOpenNewMrModal} />
      );
    }
    const options = activeMRs.map(m => ({
      value: m._id,
      label: `${m.name} (${m.territory || 'HQ'})`
    }));

    return (
      <View style={[styles.selectorWrapper, { marginBottom: Spacing.md, zIndex: 1000 }]}>
        <ResponsiveSelect
          label="Select medical representative"
          options={options}
          value={selectedId || ''}
          onChange={onSelect}
          placeholder="Search and select an MR..."
          searchable={true}
        />
      </View>
    );
  };

  // ── 1. DASHBOARD RENDER ──────────────────────────────────────────────────────
  const renderDashboard = () => {
    if (!dashboard) {
      return (
        <View style={styles.loadingBox}>
          <WorkspaceLoading />
        </View>
      );
    }
    const { mrs: mrData, totals } = dashboard;
    return (
      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {/* Hero Filter Controls */}
        <View style={styles.heroFilterBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="calendar-outline" size={16} color={colors.primary} />
            <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary }}>Performance Window:</Text>
          </View>
          <View style={styles.segmentedControl}>
            {[
              { id: 'thisMonth', label: 'This Month' },
              { id: 'lastMonth', label: 'Last Month' },
              { id: 'thisQuarter', label: 'This Quarter' }
            ].map(d => (
              <TouchableOpacity
                key={d.id}
                style={[styles.segmentedBtn, dateRange === d.id && styles.segmentedBtnActive]}
                onPress={() => setDateRange(d.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentedBtnText, dateRange === d.id && styles.segmentedBtnTextActive]}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Hero KPI Cards */}
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { borderColor: colors.primary + '30', backgroundColor: colors.bg.card }]}>
            <View style={[styles.kpiIconBadge, { backgroundColor: colors.primary + '15' }]}>
              <Ionicons name="medkit" size={20} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.kpiLabel}>TOTAL DOCTOR VISITS</Text>
              <Text style={[styles.kpiValue, { color: colors.primary }]}>{totals.visits}</Text>
            </View>
          </View>

          <View style={[styles.kpiCard, { borderColor: colors.success + '30', backgroundColor: colors.bg.card }]}>
            <View style={[styles.kpiIconBadge, { backgroundColor: colors.success + '15' }]}>
              <Ionicons name="cart" size={20} color={colors.success} />
            </View>
            <View>
              <Text style={styles.kpiLabel}>BOOKED ORDERS</Text>
              <Text style={[styles.kpiValue, { color: colors.success }]}>{totals.orders}</Text>
            </View>
          </View>

          <View style={[styles.kpiCard, { borderColor: colors.warning + '30', backgroundColor: colors.bg.card }]}>
            <View style={[styles.kpiIconBadge, { backgroundColor: colors.warning + '15' }]}>
              <Ionicons name="cash" size={20} color={colors.warning} />
            </View>
            <View>
              <Text style={styles.kpiLabel}>TOTAL ORDER VALUE</Text>
              <Text style={[styles.kpiValue, { color: colors.warning }]}>₹{(totals.orderValue || 0).toLocaleString('en-IN')}</Text>
            </View>
          </View>

          <View style={[styles.kpiCard, { borderColor: colors.danger + '30', backgroundColor: colors.bg.card }]}>
            <View style={[styles.kpiIconBadge, { backgroundColor: colors.danger + '15' }]}>
              <Ionicons name="wallet-outline" size={20} color={colors.danger} />
            </View>
            <View>
              <Text style={styles.kpiLabel}>EXPENSES SUBMITTED</Text>
              <Text style={[styles.kpiValue, { color: colors.danger }]}>₹{(totals.expenses || 0).toLocaleString('en-IN')}</Text>
            </View>
          </View>

          <View style={[styles.kpiCard, { borderColor: colors.info + '30', backgroundColor: colors.bg.card }]}>
            <View style={[styles.kpiIconBadge, { backgroundColor: colors.info + '15' }]}>
              <Ionicons name="navigate-outline" size={20} color={colors.info} />
            </View>
            <View>
              <Text style={styles.kpiLabel}>DISTANCE COVERED</Text>
              <Text style={[styles.kpiValue, { color: colors.info }]}>{(totals.distance || 0).toFixed(0)} <Text style={{ ...Typography.body }}>km</Text></Text>
            </View>
          </View>
        </View>

        {/* MR Performance Breakdown */}
        {mrData.length === 0 ? (
          <EmptyState title={<>No Activity Records</>} message={<>No doctor visits or field logs recorded for the selected window.</>} />
        ) : (
          <View style={{ marginTop: Spacing.md }}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>MR FIELD PERFORMANCE & ROI</Text>
              <Text style={styles.sectionSubtitle}>{mrData.length} Representatives Active</Text>
            </View>

            {mrData.map(m => {
              const roi = m.expenses > 0 ? (((m.orderValue - m.expenses) / m.expenses) * 100).toFixed(0) : '100+';
              const targetAchievement = m.monthlyTarget > 0 ? Math.min(100, Math.round((m.orderValue / m.monthlyTarget) * 100)) : 0;
              return (
                <View key={m._id} style={styles.performanceCard}>
                  <View style={styles.performanceCardHeader}>
                    <View style={[styles.avatarLarge, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}>
                      <Text style={[styles.avatarLargeText, { color: colors.primary }]}>{m.name.charAt(0)}</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={styles.mrNameText}>{m.name}</Text>
                        <StatusPill  label={<>
                            ROI: {roi}%
                          </>} textStyle={[styles.roiBadgeText, { color: Number(roi) > 0 ? colors.success : colors.warning }]} />
                      </View>
                      <Text style={styles.mrSubText}>
                        {m.territory || 'Headquarters'}  •  Target: <Text style={{ fontWeight: '700', color: colors.text.primary }}>₹{(m.monthlyTarget || 0).toLocaleString('en-IN')}</Text>
                      </Text>
                    </View>
                  </View>

                  {/* Target Achievement Progress Bar */}
                  <View style={{ marginTop: 12, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ ...Typography.caption, fontWeight: '700', color: colors.text.muted }}>MONTHLY TARGET PROGRESS</Text>
                      <Text style={{ ...Typography.caption, fontWeight: '800', color: colors.primary }}>{targetAchievement}% Achieved</Text>
                    </View>
                    <View style={styles.progressBarTrack}>
                      <View style={[styles.progressBarFill, { width: `${targetAchievement}%`, backgroundColor: targetAchievement >= 100 ? colors.success : colors.primary }]} />
                    </View>
                  </View>

                  {/* Stat Metrics Grid */}
                  <View style={styles.statsGrid}>
                    <View style={styles.statGridCell}>
                      <Text style={styles.statGridValue}>{m.visits}</Text>
                      <Text style={styles.statGridLabel}>Visits</Text>
                    </View>
                    <View style={styles.statGridCell}>
                      <Text style={styles.statGridValue}>{m.orders}</Text>
                      <Text style={styles.statGridLabel}>Orders</Text>
                    </View>
                    <View style={styles.statGridCell}>
                      <Text style={[styles.statGridValue, { color: colors.success }]}>₹{(m.orderValue || 0).toLocaleString('en-IN')}</Text>
                      <Text style={styles.statGridLabel}>Sales Value</Text>
                    </View>
                    <View style={styles.statGridCell}>
                      <Text style={[styles.statGridValue, { color: colors.danger }]}>₹{(m.expenses || 0).toLocaleString('en-IN')}</Text>
                      <Text style={styles.statGridLabel}>Expenses</Text>
                    </View>
                    <View style={styles.statGridCell}>
                      <Text style={styles.statGridValue}>{m.daysWorked}</Text>
                      <Text style={styles.statGridLabel}>Days Field</Text>
                    </View>
                    <View style={styles.statGridCell}>
                      <Text style={styles.statGridValue}>{m.totalDistance.toFixed(0)} km</Text>
                      <Text style={styles.statGridLabel}>GPS Dist.</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    );
  };

  // ── 2. MR LIST RENDER ───────────────────────────────────────────────────────
  const renderMrList = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.rosterToolbar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageSectionTitle}>Medical Representatives</Text>
          <Text style={styles.pageSectionSubtitle}>Manage your field team and sales targets.</Text>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={17} color={colors.text.muted} />
          <TextInput
            value={mrSearch}
            onChangeText={setMrSearch}
            placeholder="Search name, phone or territory"
            placeholderTextColor={colors.text.muted}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>
      </View>
      <FlatList
        data={mrs}
        keyExtractor={(m) => m._id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.cardsGrid}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={({ item: m }) => (
            <View key={m._id} style={[styles.mrDirectoryCard, !m.isActive && { opacity: 0.7 }]}> 
              <View style={styles.directoryCardHeader}>
                <View style={[styles.avatarLarge, { backgroundColor: m.isActive ? colors.primary + '15' : colors.text.muted + '15', borderColor: m.isActive ? colors.primary : colors.text.muted }]}>
                  <Text style={[styles.avatarLargeText, { color: m.isActive ? colors.primary : colors.text.muted }]}>{m.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.mrDirectoryName}>{m.name}</Text>
                    {m.code ? <StatusPill  label={<>{m.code}</>} textStyle={styles.codePillText} /> : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <View style={[styles.statusDot, { backgroundColor: m.isActive ? colors.success : colors.danger }]} />
                    <Text style={{ ...Typography.caption, fontWeight: '700', color: m.isActive ? colors.success : colors.danger }}>
                      {m.isActive ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {perm.can('mr:edit') && (
                    <TouchableOpacity style={styles.circleActionBtn} onPress={() => { setEditMr(m); setMrForm({ name: m.name, phone: m.phone, email: m.email || '', code: m.code || '', territory: m.territory || '', monthlyTarget: m.monthlyTarget || 0, address: m.address || '', notes: m.notes || '' }); setMrModal(true); }}>
                      <Ionicons name="pencil-outline" size={15} color={colors.primary} />
                    </TouchableOpacity>
                  )}
                  {perm.can('mr:delete') && (
                    <TouchableOpacity style={[styles.circleActionBtn, { backgroundColor: colors.danger + '10' }]} onPress={() => handleDeleteMr(m._id)}>
                      <Ionicons name="trash-outline" size={15} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={styles.directoryInfoBox}>
                <View style={styles.directoryInfoRow}>
                  <Ionicons name="call-outline" size={14} color={colors.text.muted} />
                  <Text style={styles.directoryInfoText}>{m.phone}</Text>
                </View>
                {m.email ? (
                  <View style={styles.directoryInfoRow}>
                    <Ionicons name="mail-outline" size={14} color={colors.text.muted} />
                    <Text style={styles.directoryInfoText}>{m.email}</Text>
                  </View>
                ) : null}
                <View style={styles.directoryInfoRow}>
                  <Ionicons name="location-outline" size={14} color={colors.text.muted} />
                  <Text style={styles.directoryInfoText}>{m.territory || 'No territory assigned'}</Text>
                </View>
                <View style={styles.directoryInfoRow}>
                  <Ionicons name="trophy-outline" size={14} color={colors.warning} />
                  <Text style={styles.directoryInfoText}>
                    Target: <Text style={{ fontWeight: '800', color: colors.text.primary }}>₹{(m.monthlyTarget || 0).toLocaleString('en-IN')}</Text>
                  </Text>
                </View>
              </View>

              {m.notes ? (
                <Text style={styles.directoryNotesText} numberOfLines={2}>{m.notes}</Text>
              ) : null}
            </View>
        )}
        ListEmptyComponent={<EmptyState title={<>No Medical Representatives Found</>} message={<>Add your first representative to start tracking visits, targets and field activity.</>} actionLabel="Add Representative" onAction={handleOpenNewMrModal} />}
      />

      {/* Modal: Add/Edit MR */}
      <Modal visible={mrModal} animationType="fade" transparent onRequestClose={() => setMrModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitleText}>{editMr ? 'Edit representative' : 'Add representative'}</Text>
              <TouchableOpacity onPress={() => setMrModal(false)}>
                <Ionicons name="close" size={22} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: Spacing.lg }}>
              {[
                ['name', 'Full Name', 'Enter name...', true],
                ['phone', 'Phone Number', 'Enter phone...', true],
                ['email', 'Email Address', 'Enter email...', false],
                ['code', 'MR Code / Badge ID', 'e.g. MR-001', false],
                ['territory', 'Territory / Area Headquarters', 'e.g. Varanasi North', false],
              ].map(([k, label, ph, required]) => {
                 let errorMsg;
                 if (showErrors && required && !(mrForm as any)[k as string].trim()) errorMsg = `${label} is required`;
                 if (showErrors && k === 'email' && (mrForm as any)[k].trim() && !/^\S+@\S+\.\S+$/.test((mrForm as any)[k])) errorMsg = 'Invalid email address';
                 
                 return (
                  <FormField key={k as string} label={label as string} required={required as boolean} error={errorMsg}>
                    <TextInput
                      style={styles.fieldInput}
                      value={(mrForm as any)[k as string]}
                      onChangeText={v => setMrForm({ ...mrForm, [k as string]: v })}
                      placeholder={ph as string}
                      placeholderTextColor={colors.text.muted}
                    />
                  </FormField>
                 );
              })}
              <FormField label="Monthly Sales Target (₹)" error={showErrors && (mrForm.monthlyTarget < 0 || !Number.isFinite(mrForm.monthlyTarget)) ? 'Monthly target must be 0 or more' : undefined}>
                <TextInput
                  style={styles.fieldInput}
                  value={mrForm.monthlyTarget.toString()}
                  onChangeText={v => setMrForm({ ...mrForm, monthlyTarget: Number(v) || 0 })}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.text.muted}
                />
              </FormField>
              <FormField label="Address">
                <TextInput
                  style={[styles.fieldInput, { height: 60, textAlignVertical: 'top', paddingTop: 8 }]}
                  value={mrForm.address}
                  onChangeText={v => setMrForm({ ...mrForm, address: v })}
                  placeholder="Residential address..."
                  placeholderTextColor={colors.text.muted}
                  multiline
                />
              </FormField>
              <FormField label="Notes">
                <TextInput
                  style={[styles.fieldInput, { height: 60, textAlignVertical: 'top', paddingTop: 8 }]}
                  value={mrForm.notes}
                  onChangeText={v => setMrForm({ ...mrForm, notes: v })}
                  placeholder="Additional notes..."
                  placeholderTextColor={colors.text.muted}
                  multiline
                />
              </FormField>
            </ScrollView>
            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setMrModal(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmitBtn, mrSaving && { opacity: 0.65 }]} onPress={handleSaveMr} disabled={mrSaving}>
                <>{mrSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalSubmitBtnText}>{editMr ? 'Save changes' : 'Create representative'}</Text>}</>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  // ── 3. ATTENDANCE RENDER ────────────────────────────────────────────────────
  const renderAttendance = () => (
    <View style={{ flex: 1 }}>
      {mrSelector(setSelectedMrId, selectedMrId)}
      {selectedMrId ? (
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
          {/* Action Header for Field Attendance */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, backgroundColor: colors.bg.card, padding: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border }}>
            <View>
              <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.text.primary }}>FIELD ATTENDANCE & ODOMETER</Text>
              <Text style={{ ...Typography.caption, color: colors.text.secondary }}>Track daily check-in, check-out times & travel KM</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {perm.can('mr:attendance') && (
                <>
                  <TouchableOpacity
                    style={[styles.primaryCtaBtn, { height: 32, paddingHorizontal: 10, backgroundColor: colors.success }]}
                    onPress={handleOpenCheckInModal}
                  >
                    <Ionicons name="enter-outline" size={15} color="#fff" />
                    <Text style={{ ...Typography.bodySm, color: '#fff', fontWeight: '700' }}>Check-In</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryCtaBtn, { height: 32, paddingHorizontal: 10, backgroundColor: colors.warning }]}
                    onPress={handleOpenCheckOutModal}
                  >
                    <Ionicons name="exit-outline" size={15} color="#fff" />
                    <Text style={{ ...Typography.bodySm, color: '#fff', fontWeight: '700' }}>Check-Out</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          <View style={{ gap: 10 }}>
            {attendanceLogs.map(log => {
              const isCheckedIn = log.status === 'checked_in';
              return (
                <View key={log._id} style={styles.attendanceCard}>
                  <View style={styles.attendanceCardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                      <Text style={{ ...Typography.body, fontWeight: '800', color: colors.text.primary }}>
                        {new Date(log.date).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    <View style={[styles.statusBadgePill, { backgroundColor: isCheckedIn ? colors.successLight : colors.primaryLight }]}>
                      <View style={[styles.statusDot, { backgroundColor: isCheckedIn ? colors.success : colors.primary }]} />
                      <Text style={[styles.statusBadgePillText, { color: isCheckedIn ? colors.success : colors.primary }]}>
                        {isCheckedIn ? 'ON FIELD (CHECKED IN)' : 'CHECKED OUT'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.timeTimelineGrid}>
                    <View style={styles.timeTimelineBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="enter-outline" size={14} color={colors.success} />
                        <Text style={styles.timeBoxLabel}>CHECK-IN TIME</Text>
                      </View>
                      <Text style={styles.timeBoxValue}>
                        {log.checkIn?.time ? new Date(log.checkIn.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </Text>
                      {log.checkIn?.location ? <Text style={styles.timeBoxSub}>{log.checkIn.location}</Text> : null}
                      {log.checkIn?.latitude && log.checkIn?.longitude ? (
                        <TouchableOpacity
                          style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          onPress={() => Platform.OS === 'web' && window.open(`https://www.google.com/maps?q=${log.checkIn?.latitude},${log.checkIn?.longitude}`, '_blank')}
                        >
                          <Ionicons name="location" size={12} color={colors.primary} />
                          <Text style={{ ...Typography.eyebrow, fontWeight: '800', color: colors.primary }}>
                            GPS: {log.checkIn.latitude.toFixed(4)}, {log.checkIn.longitude.toFixed(4)} (Open Map)
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <View style={styles.timeTimelineBox}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="exit-outline" size={14} color={colors.warning} />
                        <Text style={styles.timeBoxLabel}>CHECK-OUT TIME</Text>
                      </View>
                      <Text style={styles.timeBoxValue}>
                        {log.checkOut?.time ? new Date(log.checkOut.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </Text>
                      {log.checkOut?.location ? <Text style={styles.timeBoxSub}>{log.checkOut.location}</Text> : null}
                      {log.checkOut?.latitude && log.checkOut?.longitude ? (
                        <TouchableOpacity
                          style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                          onPress={() => Platform.OS === 'web' && window.open(`https://www.google.com/maps?q=${log.checkOut?.latitude},${log.checkOut?.longitude}`, '_blank')}
                        >
                          <Ionicons name="location" size={12} color={colors.warning} />
                          <Text style={{ ...Typography.eyebrow, fontWeight: '800', color: colors.warning }}>
                            GPS: {log.checkOut.latitude.toFixed(4)}, {log.checkOut.longitude.toFixed(4)} (Open Map)
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>

                  {/* Odometer & GPS Distance Panel */}
                  {(log.startKmReading || log.endKmReading || log.totalDistance || log.gpsDistance) ? (
                    <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                      {/* Odometer Row */}
                      {(log.startKmReading || log.endKmReading) ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <Ionicons name="speedometer-outline" size={14} color={colors.text.primary} />
                          <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary }}>
                            Odometer: <Text style={{ color: colors.text.muted }}>{log.startKmReading || 0} km</Text>
                            <Text style={{ color: colors.text.muted }}> → </Text>
                            <Text style={{ color: colors.text.muted }}>{log.endKmReading || '—'} km</Text>
                            {log.totalDistance ? (
                              <Text style={{ color: colors.info, fontWeight: '800' }}> = {log.totalDistance} km</Text>
                            ) : null}
                          </Text>
                        </View>
                      ) : null}
                      {/* GPS Distance Row */}
                      {log.gpsDistance ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <Ionicons name="navigate-outline" size={14} color={colors.success} />
                          <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary }}>
                            GPS Distance (straight line): <Text style={{ color: colors.success, fontWeight: '800' }}>{log.gpsDistance} km</Text>
                          </Text>
                        </View>
                      ) : null}
                      {/* Discrepancy Warning */}
                      {log.totalDistance && log.gpsDistance && log.totalDistance > 0 && log.gpsDistance > 0 ? (() => {
                        const diff = Math.abs(log.totalDistance - log.gpsDistance);
                        const pct = (diff / Math.max(log.totalDistance, log.gpsDistance)) * 100;
                        if (pct > 30) {
                          return (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.warningLight, paddingVertical: 4, paddingHorizontal: 8, borderRadius: Radius.sm }}>
                              <Ionicons name="warning-outline" size={13} color={colors.warning} />
                              <Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.warning }}>
                                Odometer vs GPS differs by {pct.toFixed(0)}% — please verify
                              </Text>
                            </View>
                          );
                        }
                        return null;
                      })() : null}
                    </View>
                  ) : null}
                </View>
              );
            })}

            {attendanceLogs.length === 0 && (
              <EmptyState title={<>No Attendance Records</>} message={<>Selected MR has not submitted any field check-ins yet.</>} />
            )}
          </View>
        </ScrollView>
      ) : (
        <EmptyState title={<>Select a Medical Representative</>} message={<>Choose an MR from the chips above to inspect field attendance.</>} />
      )}

      {/* Modal: Field Check-In */}
      <Modal visible={checkInModal} animationType="fade" transparent onRequestClose={() => setCheckInModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitleText}>Record Field Check-In</Text>
              <TouchableOpacity onPress={() => setCheckInModal(false)}>
                <Ionicons name="close" size={22} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: Spacing.lg }}>
              {/* Auto GPS Status Badge */}
              <View style={{ backgroundColor: (checkInForm.latitude && checkInForm.longitude) ? colors.success + '15' : colors.primary + '15', padding: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: (checkInForm.latitude && checkInForm.longitude) ? colors.success + '30' : colors.primary + '30', marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="location" size={16} color={(checkInForm.latitude && checkInForm.longitude) ? colors.success : colors.primary} />
                  <Text style={{ ...Typography.caption, fontWeight: '800', color: (checkInForm.latitude && checkInForm.longitude) ? colors.success : colors.primary }}>
                    {(checkInForm.latitude && checkInForm.longitude)
                      ? `GPS acquired: ${checkInForm.latitude.toFixed(4)}, ${checkInForm.longitude.toFixed(4)}`
                      : 'Acquiring device GPS location...'}
                  </Text>
                </View>
                <TouchableOpacity onPress={async () => {
                  const coords = await fetchGpsLocation();
                  if (coords.latitude && coords.longitude) {
                    setCheckInForm(prev => ({ ...prev, latitude: coords.latitude, longitude: coords.longitude }));
                    showToast('GPS re-acquired!', 'success');
                  }
                }}>
                  <Ionicons name="refresh" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabelText}>Start Location / HQ Area</Text>
                <TextInput style={styles.fieldInput} value={checkInForm.location} onChangeText={v => setCheckInForm({ ...checkInForm, location: v })} placeholder="e.g. Varanasi HQ" placeholderTextColor={colors.text.muted} />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabelText}>Start Odometer Reading (KM)</Text>
                <TextInput style={styles.fieldInput} value={checkInForm.startKmReading ? checkInForm.startKmReading.toString() : ''} onChangeText={v => setCheckInForm({ ...checkInForm, startKmReading: Number(v) || 0 })} keyboardType="numeric" placeholder="e.g. 14200" placeholderTextColor={colors.text.muted} />
              </View>
            </View>
            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCheckInModal(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: colors.success }]} onPress={handleCheckInSubmit}>
                <Text style={styles.modalSubmitBtnText}>Check In</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Field Check-Out */}
      <Modal visible={checkOutModal} animationType="fade" transparent onRequestClose={() => setCheckOutModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitleText}>Record Field Check-Out</Text>
              <TouchableOpacity onPress={() => setCheckOutModal(false)}>
                <Ionicons name="close" size={22} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: Spacing.lg }}>
              {/* Auto GPS Status Badge */}
              <View style={{ backgroundColor: (checkOutForm.latitude && checkOutForm.longitude) ? colors.success + '15' : colors.warning + '15', padding: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: (checkOutForm.latitude && checkOutForm.longitude) ? colors.success + '30' : colors.warning + '30', marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="location" size={16} color={(checkOutForm.latitude && checkOutForm.longitude) ? colors.success : colors.warning} />
                  <Text style={{ ...Typography.caption, fontWeight: '800', color: (checkOutForm.latitude && checkOutForm.longitude) ? colors.success : colors.warning }}>
                    {(checkOutForm.latitude && checkOutForm.longitude)
                      ? `GPS acquired: ${checkOutForm.latitude.toFixed(4)}, ${checkOutForm.longitude.toFixed(4)}`
                      : 'Acquiring device GPS location...'}
                  </Text>
                </View>
                <TouchableOpacity onPress={async () => {
                  const coords = await fetchGpsLocation();
                  if (coords.latitude && coords.longitude) {
                    setCheckOutForm(prev => ({ ...prev, latitude: coords.latitude, longitude: coords.longitude }));
                    showToast('GPS re-acquired!', 'success');
                  }
                }}>
                  <Ionicons name="refresh" size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabelText}>End Location</Text>
                <TextInput style={styles.fieldInput} value={checkOutForm.location} onChangeText={v => setCheckOutForm({ ...checkOutForm, location: v })} placeholder="e.g. Home Base" placeholderTextColor={colors.text.muted} />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabelText}>End Odometer Reading (KM)</Text>
                <TextInput style={styles.fieldInput} value={checkOutForm.endKmReading ? checkOutForm.endKmReading.toString() : ''} onChangeText={v => setCheckOutForm({ ...checkOutForm, endKmReading: Number(v) || 0 })} keyboardType="numeric" placeholder="e.g. 14265" placeholderTextColor={colors.text.muted} />
                {/* GPS distance hint: estimate end KM from today's check-in GPS */}
                {(() => {
                  const todayLog = attendanceLogs.find(l => l.status === 'checked_in');
                  if (todayLog?.startKmReading && todayLog.startKmReading > 0 && checkOutForm.latitude && checkOutForm.longitude && todayLog.checkIn?.latitude && todayLog.checkIn?.longitude) {
                    const R = 6371;
                    const dLat = ((checkOutForm.latitude - todayLog.checkIn.latitude) * Math.PI) / 180;
                    const dLon = ((checkOutForm.longitude - todayLog.checkIn.longitude) * Math.PI) / 180;
                    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos((todayLog.checkIn.latitude * Math.PI)/180) * Math.cos((checkOutForm.latitude * Math.PI)/180) * Math.sin(dLon/2) * Math.sin(dLon/2);
                    const gpsDist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
                    if (gpsDist > 0) {
                      const suggestedEnd = todayLog.startKmReading + gpsDist;
                      return (
                        <Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.info, marginTop: 4 }}>
                           GPS suggests ~{gpsDist} km travelled. Estimated end: {suggestedEnd} km
                        </Text>
                      );
                    }
                  }
                  return null;
                })()}
              </View>
            </View>
            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCheckOutModal(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: colors.warning }]} onPress={handleCheckOutSubmit}>
                <Text style={styles.modalSubmitBtnText}>Check Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  // ── 4. VISITS RENDER ────────────────────────────────────────────────────────
  const renderVisits = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <View style={{ flex: 1 }}>
          {mrSelector(setSelectedMrId, selectedMrId)}
        </View>
      </View>

      {selectedMrId ? (
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
          <View style={{ gap: 10 }}>
            {visits.map(v => (
              <View key={v._id} style={styles.visitCard}>
                <View style={styles.visitCardHeader}>
                  <View style={[styles.avatarLarge, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
                    <Ionicons name="person-outline" size={18} color={colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...Typography.body, fontWeight: '800', color: colors.text.primary }}>{v.doctorName}</Text>
                    <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>
                      {v.clinicName} {v.specialization ? `(${v.specialization})` : ''} {v.city ? `• ${v.city}` : ''}
                    </Text>
                  </View>

                  <StatusPill  label={<>
                      {v.purpose.toUpperCase()}
                    </>} textStyle={[styles.statusBadgePillText, { color: v.purpose === 'promotion' ? colors.primary : colors.warning }]} />
                </View>

                <View style={styles.visitCardMetaRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="calendar-outline" size={13} color={colors.text.muted} />
                    <Text style={{ ...Typography.bodySm, color: colors.text.muted }}>{new Date(v.date).toLocaleDateString('en-IN')}</Text>
                  </View>

                  {v.checkIn?.time ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="time-outline" size={13} color={colors.text.muted} />
                      <Text style={{ ...Typography.bodySm, color: colors.text.muted }}>
                        {new Date(v.checkIn.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  ) : null}

                  {v.orderTaken ? (
                    <View style={[styles.statusBadgePill, { backgroundColor: colors.successLight }]}>
                      <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                      <Text style={{ ...Typography.caption, fontWeight: '800', color: colors.success }}>
                        Order: ₹{(v.orderAmount || 0).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ) : (
                    <StatusPill  label={<>No Order Taken</>} textStyle={{ ...Typography.caption, fontWeight: '600', color: colors.text.muted }} />
                  )}
                </View>

                {v.sampleDetails && v.sampleDetails.length > 0 && (
                  <View style={{ marginTop: 8, backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, padding: 8, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ ...Typography.eyebrow, fontWeight: '800', color: colors.primary, marginBottom: 4 }}>
                      FREE SAMPLES DISTRIBUTED
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {v.sampleDetails.map((s: any, idx: number) => (
                        <View key={idx} style={{ backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm }}>
                          <Text style={{ ...Typography.caption, fontWeight: '700', color: colors.text.primary }}>
                            {s.productId?.name || s.name || 'Sample Product'} × {s.qty || 1}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {v.feedback ? (
                  <View style={styles.feedbackBox}>
                    <Text style={{ ...Typography.caption, fontWeight: '700', color: colors.primary }}>DOCTOR FEEDBACK</Text>
                    <Text style={{ ...Typography.bodySm, color: colors.text.primary, marginTop: 2 }}>{v.feedback}</Text>
                  </View>
                ) : null}
              </View>
            ))}

            {visits.length === 0 && (
              <EmptyState title={<>No Doctor Visits Recorded</>} message={<>No doctor calls or clinic visits logged for this Medical Representative.</>} />
            )}
          </View>
        </ScrollView>
      ) : (
        <EmptyState title={<>Select a Medical Representative</>} message={<>Choose an MR from above to view their recorded clinic visits.</>} />
      )}

      {/* Modal: Add Visit */}
      <Modal visible={visitModal} animationType="fade" transparent onRequestClose={() => setVisitModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitleText}>Record Doctor Visit</Text>
              <TouchableOpacity onPress={() => setVisitModal(false)}>
                <Ionicons name="close" size={22} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: Spacing.lg }}>
              {/* Mandatory GPS Location Capture Section */}
              <View style={{ backgroundColor: (visitForm.latitude && visitForm.longitude) ? colors.success + '10' : colors.primary + '10', padding: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: (visitForm.latitude && visitForm.longitude) ? colors.success + '30' : colors.primary + '30', marginBottom: 16 }}>
                <Text style={{ ...Typography.caption, fontWeight: '800', color: (visitForm.latitude && visitForm.longitude) ? colors.success : colors.primary, marginBottom: 4 }}>
                  CLINIC GPS LOCATION *
                </Text>
                <Text style={{ ...Typography.eyebrow, color: colors.text.secondary, marginBottom: 10 }}>
                  Doctor visit records cannot be saved without logging physical GPS coordinates.
                </Text>

                <TouchableOpacity
                  style={{
                    height: 40,
                    borderRadius: Radius.md,
                    backgroundColor: (visitForm.latitude && visitForm.longitude) ? colors.success : colors.primary,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                  onPress={handleLogVisitLocation}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={(visitForm.latitude && visitForm.longitude) ? "checkmark-circle" : "location-outline"}
                    size={18}
                    color="#fff"
                  />
                  <Text style={{ ...Typography.bodySm, fontWeight: '700', color: '#fff' }}>
                    {(visitForm.latitude && visitForm.longitude)
                      ? `GPS logged: ${visitForm.latitude.toFixed(4)}, ${visitForm.longitude.toFixed(4)}`
                      : 'Log GPS clinic location *'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.formField, { zIndex: 10 }]}>
                <Text style={styles.fieldLabelText}>Doctor Name *</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={visitForm.doctorName}
                  onChangeText={handleDoctorNameChange}
                  placeholder="e.g. Dr. A. K. Sharma"
                  placeholderTextColor={colors.text.muted}
                  onFocus={() => { if (doctorSuggestions.length > 0) setShowDoctorSuggestions(true); }}
                />
                {showDoctorSuggestions && doctorSuggestions.length > 0 && (
                  <View style={{
                    backgroundColor: colors.bg.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: Radius.md,
                    marginTop: 4,
                    maxHeight: 180,
                    ...Shadows.card, 
                  }}>
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {doctorSuggestions.map((doc) => (
                        <TouchableOpacity
                          key={doc._id}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.border,
                          }}
                          onPress={() => handleSelectDoctorSuggestion(doc)}
                        >
                          <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary }}>{doc.name}</Text>
                          <Text style={{ ...Typography.caption, color: colors.text.secondary }}>
                            {[doc.clinicName, doc.specialization, doc.city].filter(Boolean).join(' • ')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabelText}>Clinic / Hospital Name</Text>
                <TextInput style={styles.fieldInput} value={visitForm.clinicName} onChangeText={v => setVisitForm({ ...visitForm, clinicName: v })} placeholder="e.g. City Health Clinic" placeholderTextColor={colors.text.muted} />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={[styles.formField, { flex: 1 }]}>
                  <Text style={styles.fieldLabelText}>Specialization</Text>
                  <TextInput style={styles.fieldInput} value={visitForm.specialization} onChangeText={v => setVisitForm({ ...visitForm, specialization: v })} placeholder="e.g. Physician" placeholderTextColor={colors.text.muted} />
                </View>
                <View style={[styles.formField, { flex: 1 }]}>
                  <Text style={styles.fieldLabelText}>City</Text>
                  <TextInput style={styles.fieldInput} value={visitForm.city} onChangeText={v => setVisitForm({ ...visitForm, city: v })} placeholder="e.g. Varanasi" placeholderTextColor={colors.text.muted} />
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabelText}>Visit Purpose</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {['promotion', 'sampling', 'collection', 'followup', 'meeting'].map(p => (
                    <TouchableOpacity key={p} style={[styles.chipPill, visitForm.purpose === p && styles.chipPillActive]} onPress={() => setVisitForm({ ...visitForm, purpose: p })}>
                      <Text style={[styles.chipPillText, visitForm.purpose === p && styles.chipPillTextActive]}>{p.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Free Samples Distribution Dropdown Selector */}
              <View style={[styles.formField, { backgroundColor: colors.bg.secondary, padding: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.primary, marginBottom: 8 }}>
                  ADD FREE SAMPLES (CREATES SAMPLE CHALLAN & DEDUCTS INVENTORY)
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {Platform.OS === 'web' ? (
                    <select
                      style={{ ...Typography.bodySm, flex: 1, minWidth: 180, height: 38, borderRadius: Radius.md, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.bg.card, color: colors.text.primary, paddingLeft: 10, outline: 'none' }}
                      value={sampleProdId}
                      onChange={(e) => setSampleProdId(e.target.value)}
                    >
                      <option value="">-- Select Sample Product --</option>
                      {products.map(prod => (
                        <option key={prod._id} value={prod._id}>
                          {prod.name} (Stock: {prod.stockLevel || 0})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <View style={{ flex: 1, minWidth: 180 }}>
                      <TextInput
                        style={styles.fieldInput}
                        value={sampleProdId}
                        onChangeText={setSampleProdId}
                        placeholder="Product ID or select..."
                        placeholderTextColor={colors.text.muted}
                      />
                    </View>
                  )}
                  <TextInput
                    style={[styles.fieldInput, { width: 75, height: 38, textAlign: 'center' }]}
                    value={sampleQty}
                    onChangeText={v => setSampleQty(v)}
                    keyboardType="numeric"
                    placeholder="Qty"
                  />
                  <TouchableOpacity
                    style={[styles.primaryCtaBtn, { height: 38, paddingHorizontal: 12 }]}
                    onPress={handleAddSampleProduct}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#fff" />
                    <Text style={{ ...Typography.bodySm, color: '#fff', fontWeight: '700' }}>Add Sample</Text>
                  </TouchableOpacity>
                </View>

                {visitForm.sampleDetails.length > 0 && (
                  <View style={{ gap: 6, marginTop: 12 }}>
                    <Text style={{ ...Typography.caption, fontWeight: '700', color: colors.text.muted }}>ADDED SAMPLES LIST:</Text>
                    {visitForm.sampleDetails.map((s, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm }}>
                        <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary, flex: 1 }}>{s.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <TouchableOpacity style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }} onPress={() => handleUpdateSampleQty(s.productId, -1)}>
                            <Ionicons name="remove" size={14} color={colors.text.primary} />
                          </TouchableOpacity>
                          <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.primary, minWidth: 20, textAlign: 'center' }}>{s.qty}</Text>
                          <TouchableOpacity style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }} onPress={() => handleUpdateSampleQty(s.productId, 1)}>
                            <Ionicons name="add" size={14} color={colors.text.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleRemoveSampleProduct(s.productId)} style={{ marginLeft: 6 }}>
                            <Ionicons name="trash-outline" size={16} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={[styles.formField, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.bg.secondary, padding: 10, borderRadius: Radius.md }]}>
                <Text style={{ ...Typography.bodySm, fontWeight: '700', color: colors.text.primary }}>Was an order booked during this call?</Text>
                <TouchableOpacity style={[styles.chipPill, visitForm.orderTaken && { backgroundColor: colors.success }]} onPress={() => setVisitForm({ ...visitForm, orderTaken: !visitForm.orderTaken })}>
                  <Text style={{ ...Typography.bodySm, fontWeight: '700', color: visitForm.orderTaken ? '#fff' : colors.text.primary }}>
                    {visitForm.orderTaken ? ' YES, ORDER BOOKED' : 'NO ORDER'}
                  </Text>
                </TouchableOpacity>
              </View>

              {visitForm.orderTaken && (
                <View style={styles.formField}>
                  <Text style={styles.fieldLabelText}>Booked Order Amount (₹)</Text>
                  <TextInput style={styles.fieldInput} value={visitForm.orderAmount.toString()} onChangeText={v => setVisitForm({ ...visitForm, orderAmount: Number(v) || 0 })} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.text.muted} />
                </View>
              )}

              <View style={styles.formField}>
                <Text style={styles.fieldLabelText}>Doctor Feedback</Text>
                <TextInput style={[styles.fieldInput, { height: 60, textAlignVertical: 'top', paddingTop: 8 }]} value={visitForm.feedback} onChangeText={v => setVisitForm({ ...visitForm, feedback: v })} placeholder="Doctor response / product feedback..." placeholderTextColor={colors.text.muted} multiline />
              </View>
            </ScrollView>
            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setVisitModal(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleSaveVisit}>
                <Text style={styles.modalSubmitBtnText}>Save Visit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  // ── 5. EXPENSES RENDER ──────────────────────────────────────────────────────
  const renderPortfolio = () => {
    const selectedMr = mrs.find(m => m._id === selectedMrId);
    const grouped = assignments.reduce<Record<string, MrAssignment[]>>((acc, a) => { (acc[a.entityType] ||= []).push(a); return acc; }, {});
    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.sectionHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageSectionTitle}>MR Portfolio & Assignments</Text>
            <Text style={styles.pageSectionSubtitle}>Assign people, accounts and territories with primary, backup or temporary ownership.</Text>
          </View>
          {perm.can('mr:edit') && selectedMrId ? <TouchableOpacity style={styles.primaryCtaBtn} onPress={() => { setAssignmentForm({ entityType: 'doctor', entityName: '', area: '', territory: selectedMr?.territory || '', role: 'primary', priority: 'normal', preferredVisitDays: [], notes: '' }); setAssignmentModal(true); }}><Ionicons name="add" size={18} color="#fff" /><Text style={styles.primaryCtaBtnText}>Add Assignment</Text></TouchableOpacity> : null}
        </View>
        {mrSelector(setSelectedMrId, selectedMrId)}
        {selectedMrId ? <>
          <View style={styles.infoBanner}>
            <Ionicons name="options-outline" size={20} color={colors.primary} />
            <Text style={styles.infoBannerText}>One MR can have multiple doctors, chemists, stockists, institutions and distributors. Assignments can be primary, secondary or temporary and can carry their own area, priority and visit-day rules.</Text>
          </View>
          {Object.keys(grouped).length === 0 ? <EmptyState title={<>No portfolio assignments</>} message={<>Start by assigning a doctor, chemist, stockist or another field account.</>} /> : Object.entries(grouped).map(([type, list]) => (
            <View key={type} style={styles.sectionCard}>
              <Text style={styles.cardTitle}>{type.charAt(0).toUpperCase()+type.slice(1)}s ({list.length})</Text>
              {list.map(a => <View key={a._id} style={styles.assignmentRow}>
                <View style={styles.assignmentIcon}><Ionicons name={type === 'doctor' ? 'medkit-outline' : 'business-outline'} size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}><Text style={styles.assignmentName}>{a.entityName}</Text><Text style={styles.assignmentMeta}>{[a.area, a.territory, a.role, `Priority ${a.priority}`].filter(Boolean).join(' • ')}</Text>{a.preferredVisitDays?.length ? <Text style={styles.assignmentMeta}>Visits: {a.preferredVisitDays.join(', ')}</Text> : null}</View>
                {perm.can('mr:edit') ? <TouchableOpacity style={styles.circleActionBtn} onPress={async () => { try { await api.endMrAssignment(a._id); showToast('Assignment ended', 'success'); loadAssignments(selectedMrId); } catch (e:any) { showToast(e.message || 'Could not end assignment', 'error'); } }}><Ionicons name="close-circle-outline" size={18} color={colors.danger} /></TouchableOpacity> : null}
              </View>)}
            </View>
          ))}
        </> : null}
        <Modal visible={assignmentModal} animationType="fade" transparent onRequestClose={() => setAssignmentModal(false)}>
          <View style={styles.modalOverlay}><View style={styles.modalCard}><View style={styles.modalHeader}><Text style={styles.modalTitleText}>Add portfolio assignment</Text><TouchableOpacity onPress={() => setAssignmentModal(false)}><Ionicons name="close" size={22} color={colors.text.primary}/></TouchableOpacity></View><ScrollView style={{padding: Spacing.lg}}>
            <Text style={styles.fieldLabelText}>Type</Text><View style={styles.choiceRow}>{['doctor','chemist','stockist','institution','distributor','other'].map(t => <TouchableOpacity key={t} style={[styles.choicePill, assignmentForm.entityType===t && styles.choicePillActive]} onPress={()=>setAssignmentForm({...assignmentForm, entityType:t as any})}><Text style={[styles.choicePillText, assignmentForm.entityType===t && styles.choicePillTextActive]}>{t}</Text></TouchableOpacity>)}</View>
            {([['entityName','Name *','Doctor / chemist / institution name'],['entityId','Linked ID','Optional record ID'],['area','Area','e.g. Civil Lines'],['territory','Territory','e.g. Prayagraj North'],['preferredVisitTime','Preferred time','e.g. 11:00 AM'],['notes','Notes','Optional notes']] as const).map(([k,label,ph]) => <View key={k} style={styles.formField}><Text style={styles.fieldLabelText}>{label}</Text><TextInput style={styles.fieldInput} value={(assignmentForm as any)[k] || ''} onChangeText={v=>setAssignmentForm({...assignmentForm,[k]:v})} placeholder={ph} placeholderTextColor={colors.text.muted}/></View>)}
            <Text style={styles.fieldLabelText}>Assignment role</Text><View style={styles.choiceRow}>{['primary','secondary','temporary'].map(t=><TouchableOpacity key={t} style={[styles.choicePill,assignmentForm.role===t&&styles.choicePillActive]} onPress={()=>setAssignmentForm({...assignmentForm,role:t as any})}><Text style={[styles.choicePillText,assignmentForm.role===t&&styles.choicePillTextActive]}>{t}</Text></TouchableOpacity>)}</View>
            <Text style={styles.fieldLabelText}>Priority</Text><View style={styles.choiceRow}>{['A','B','C','normal'].map(t=><TouchableOpacity key={t} style={[styles.choicePill,assignmentForm.priority===t&&styles.choicePillActive]} onPress={()=>setAssignmentForm({...assignmentForm,priority:t as any})}><Text style={[styles.choicePillText,assignmentForm.priority===t&&styles.choicePillTextActive]}>{t}</Text></TouchableOpacity>)}</View>
            <TouchableOpacity style={styles.modalSubmitBtn} onPress={async()=>{if(!selectedMrId || !assignmentForm.entityName?.trim()){showToast('Enter an account name','error');return;} try{await api.createMrAssignment(selectedMrId,assignmentForm);showToast('Assignment added','success');setAssignmentModal(false);loadAssignments(selectedMrId);}catch(e:any){showToast(e.message||'Could not add assignment','error');}}}><Text style={styles.modalSubmitBtnText}>Save Assignment</Text></TouchableOpacity>
          </ScrollView></View></View>
        </Modal>
      </ScrollView>
    );
  };

  const renderExpenses = () => (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <View style={{ flex: 1 }}>
          {mrSelector(setSelectedMrId, selectedMrId)}
        </View>
      </View>

      {selectedMrId ? (
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
          {/* Expense Summary Metric Cards */}
          {(() => {
            const total = expenses.reduce((a, b) => a + (b.amount || 0), 0);
            const approved = expenses.filter(e => e.status === 'approved').reduce((a, b) => a + (b.amount || 0), 0);
            const pending = expenses.filter(e => e.status === 'pending').reduce((a, b) => a + (b.amount || 0), 0);
            return (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <View style={[styles.kpiCard, { flex: 1, padding: 12, backgroundColor: colors.bg.card }]}>
                  <Text style={styles.kpiLabel}>TOTAL CLAIMED</Text>
                  <Text style={[styles.kpiValue, { ...Typography.h3, color: colors.primary }]}>₹{total.toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.kpiCard, { flex: 1, padding: 12, backgroundColor: colors.bg.card }]}>
                  <Text style={styles.kpiLabel}>APPROVED</Text>
                  <Text style={[styles.kpiValue, { ...Typography.h3, color: colors.success }]}>₹{approved.toLocaleString('en-IN')}</Text>
                </View>
                <View style={[styles.kpiCard, { flex: 1, padding: 12, backgroundColor: colors.bg.card }]}>
                  <Text style={styles.kpiLabel}>PENDING APPROVAL</Text>
                  <Text style={[styles.kpiValue, { ...Typography.h3, color: colors.warning }]}>₹{pending.toLocaleString('en-IN')}</Text>
                </View>
              </View>
            );
          })()}

          {/* Status Filters */}
          <View style={styles.filterChipRow}>
            {['all', 'pending', 'approved', 'rejected'].map(s => {
              const isActive = expenseFilter === s;
              const count = expenses.filter(e => s === 'all' || e.status === s).length;
              return (
                <TouchableOpacity key={s} style={[styles.filterChipItem, isActive && styles.filterChipItemActive]} onPress={() => setExpenseFilter(s)}>
                  <Text style={[styles.filterChipItemText, isActive && styles.filterChipItemTextActive]}>
                    {s.toUpperCase()} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ gap: 10 }}>
            {expenses.filter(e => expenseFilter === 'all' || e.status === expenseFilter).map(e => {
              const iconName = categoryIcons[e.category] || 'cash-outline';
              const statusBg = e.status === 'approved' ? colors.successLight : e.status === 'rejected' ? colors.dangerLight : colors.warningLight;
              const statusFg = e.status === 'approved' ? colors.success : e.status === 'rejected' ? colors.danger : colors.warning;

              // Resolve MR name for display
              const mrName = typeof e.mrId === 'object' && e.mrId?.name
                ? e.mrId.name
                : mrs.find(m => m._id === (typeof e.mrId === 'string' ? e.mrId : e.mrId?._id))?.name || '';

              return (
                <View key={e._id} style={styles.expenseCard}>
                  <View style={styles.expenseCardHeader}>
                    <View style={[styles.avatarLarge, { backgroundColor: colors.primary + '15', borderColor: colors.primary }]}>
                      <Ionicons name={iconName} size={18} color={colors.primary} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ ...Typography.body, fontWeight: '800', color: colors.text.primary, textTransform: 'capitalize' }}>{e.category} Claim</Text>
                        <Text style={{ ...Typography.h3, fontWeight: '800', color: colors.primary }}>₹{e.amount.toLocaleString('en-IN')}</Text>
                      </View>
                      {mrName ? (
                        <Text style={{ ...Typography.caption, fontWeight: '700', color: colors.primary, marginTop: 2 }}>
                          {mrName}
                        </Text>
                      ) : null}
                      <Text style={{ ...Typography.bodySm, color: colors.text.secondary, marginTop: 2 }}>
                        Submitted on {new Date(e.date).toLocaleDateString('en-IN')} {e.description ? `• ${e.description}` : ''}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.expenseCardFooter}>
                    <View style={[styles.statusBadgePill, { backgroundColor: statusBg }]}>
                      <View style={[styles.statusDot, { backgroundColor: statusFg }]} />
                      <Text style={[styles.statusBadgePillText, { color: statusFg }]}>{e.status.toUpperCase()}</Text>
                    </View>

                    {e.status === 'pending' && perm.can('mr:approveExpenses') && (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity style={[styles.miniApproveBtn, { backgroundColor: colors.success }]} onPress={() => handleApproveExpense(e._id, 'approved')}>
                          <Ionicons name="checkmark" size={14} color="#fff" />
                          <Text style={{ ...Typography.caption, color: '#fff', fontWeight: '700' }}>Approve</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.miniApproveBtn, { backgroundColor: colors.danger }]} onPress={() => handleApproveExpense(e._id, 'rejected')}>
                          <Ionicons name="close" size={14} color="#fff" />
                          <Text style={{ ...Typography.caption, color: '#fff', fontWeight: '700' }}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}

            {expenses.length === 0 && (
              <EmptyState title={<>No Expense Claims</>} message={<>No travel or field expenses logged for this Medical Representative.</>} />
            )}
          </View>
        </ScrollView>
      ) : (
        <EmptyState title={<>Select a Medical Representative</>} message={<>Choose an MR from above to inspect their submitted expense claims.</>} />
      )}

      {/* Modal: Add Expense */}
      <Modal visible={expenseModal} animationType="fade" transparent onRequestClose={() => setExpenseModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitleText}>Submit Expense Claim</Text>
              <TouchableOpacity onPress={() => setExpenseModal(false)}>
                <Ionicons name="close" size={22} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: Spacing.lg }}>
              <View style={styles.formField}>
                <Text style={styles.fieldLabelText}>Expense Category *</Text>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {['travel', 'food', 'stay', 'conveyance', 'stationery', 'mobile', 'misc'].map(c => (
                    <TouchableOpacity key={c} style={[styles.chipPill, expenseForm.category === c && styles.chipPillActive]} onPress={() => setExpenseForm({ ...expenseForm, category: c })}>
                      <Text style={[styles.chipPillText, expenseForm.category === c && styles.chipPillTextActive]}>{c.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabelText}>Amount (₹) *</Text>
                <TextInput style={styles.fieldInput} value={expenseForm.amount > 0 ? expenseForm.amount.toString() : ''} onChangeText={v => setExpenseForm({ ...expenseForm, amount: Number(v) || 0 })} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.text.muted} />
              </View>

              <View style={styles.formField}>
                <Text style={styles.fieldLabelText}>Description / Purpose</Text>
                <TextInput style={[styles.fieldInput, { height: 60, textAlignVertical: 'top', paddingTop: 8 }]} value={expenseForm.description} onChangeText={v => setExpenseForm({ ...expenseForm, description: v })} placeholder="Details of expense..." placeholderTextColor={colors.text.muted} multiline />
              </View>
            </ScrollView>
            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setExpenseModal(false)}>
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleSaveExpense}>
                <Text style={styles.modalSubmitBtnText}>Submit Claim</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  return (
    <View style={styles.screen}>
      <WorkspaceHeader
        eyebrow="Field sales"
        title="Medical Representatives"
        subtitle="Manage the field team, account portfolio, attendance, visits and expenses from one consistent workspace."
        actions={[
          ...(activeTab === 'mrs' && perm.can('mr:create') ? [{ label: 'New MR', icon: 'add' as const, onPress: handleOpenNewMrModal }] : []),
          ...(activeTab === 'visits' && selectedMrId && perm.can('mr:visits') ? [{ label: 'Record visit', icon: 'add' as const, onPress: () => setVisitModal(true) }] : []),
          ...(activeTab === 'expenses' && selectedMrId && perm.can('mr:expenses') ? [{ label: 'Claim expense', icon: 'add' as const, onPress: () => setExpenseModal(true) }] : []),
        ]}
      />
      <WorkspaceTabs
        tabs={TABS.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))}
        value={activeTab}
        onChange={setActiveTab}
      />

      <WorkspaceTransition value={activeTab} style={styles.mainScreenContainer}>
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'mrs' && renderMrList()}
        {activeTab === 'portfolio' && renderPortfolio()}
        {activeTab === 'attendance' && renderAttendance()}
        {activeTab === 'visits' && renderVisits()}
        {activeTab === 'expenses' && renderExpenses()}
      </WorkspaceTransition>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },

  // Top Control Bar
  topControlBar: {
    paddingHorizontal: Spacing.lg,
    marginTop: 8,
    marginBottom: 4,
  },
  topBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 42,
  },
  subNavTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.sm,
    backgroundColor: 'transparent',
  },
  subNavTabActive: {
    backgroundColor: colors.primaryLight,
  },
  subNavTabText: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary },
  subNavTabTextActive: {
    color: colors.primary,
  },
  primaryCtaBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryCtaBtnText: { ...Typography.bodySm, color: '#fff', fontWeight: '700' },

  mainScreenContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 1240,
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },

  rosterToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 10,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  pageSectionTitle: { ...Typography.h2, fontWeight: '800', color: colors.text.primary },
  pageSectionSubtitle: { ...Typography.bodySm, color: colors.text.muted, marginTop: 2 },
  searchBox: {
    minWidth: 220,
    maxWidth: 380,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    height: 44,
    paddingHorizontal: 11,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg.card,
  },
  searchInput: { borderWidth: 0, backgroundColor: 'transparent', ...Typography.bodySm, flex: 1, minHeight: 44, height: 44, color: colors.text.primary },

  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 50,
  },

  // Selector
  selectorWrapper: {
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  selectorLabel: { ...Typography.eyebrow, fontWeight: '700', color: colors.text.muted, marginBottom: 8 },
  mrSelectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mrSelectorChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  mrSelectorAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mrSelectorAvatarText: { ...Typography.bodySm, fontWeight: '800', color: colors.primary },
  mrSelectorChipText: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary },
  mrSelectorChipTextActive: {
    color: '#fff',
  },
  mrSelectorChipSub: { ...Typography.eyebrow, color: colors.text.muted },

  // Hero Filter Bar & Segmented Control
  heroFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg.card,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
    gap: 10,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.sm,
    padding: 3,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentedBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.sm - 2,
  },
  segmentedBtnActive: {
    backgroundColor: colors.primary,
  },
  segmentedBtnText: { ...Typography.caption, fontWeight: '700', color: colors.text.secondary },
  segmentedBtnTextActive: {
    color: '#fff',
  },

  // KPI Grid
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: Spacing.md,
  },
  kpiCard: {
    flex: 1,
    minWidth: 150,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg.card,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  kpiIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabel: { ...Typography.eyebrow, fontWeight: '800', color: colors.text.muted },
  kpiValue: { ...Typography.h2, fontWeight: '800', marginTop: 2 },

  // Performance Card
  sectionHeaderRow: {
    marginBottom: Spacing.sm,
  },
  sectionTitle: { ...Typography.bodySm, fontWeight: '800', color: colors.text.muted },
  sectionSubtitle: { ...Typography.caption, color: colors.text.muted, marginTop: 1 },
  performanceCard: {
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  performanceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarLarge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLargeText: { ...Typography.h2, fontWeight: '800' },
  mrNameText: { ...Typography.body, fontWeight: '800', color: colors.text.primary },
  mrSubText: { ...Typography.caption, color: colors.text.secondary, marginTop: 2 },
  roiBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  roiBadgeText: { ...Typography.eyebrow, fontWeight: '800' },
  progressBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bg.secondary,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  statGridCell: {
    flex: 1,
    minWidth: 70,
    alignItems: 'center',
  },
  statGridValue: { ...Typography.bodySm, fontWeight: '800', color: colors.text.primary },
  statGridLabel: { ...Typography.eyebrow, color: colors.text.muted, fontWeight: '600', marginTop: 2 },

  // MR Directory Cards
  cardsGrid: {
    gap: Spacing.md,
    paddingTop: Spacing.sm,
  },
  mrDirectoryCard: {
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
    ...Shadows.card,
  },
  directoryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  mrDirectoryName: { ...Typography.h3, fontWeight: '800', color: colors.text.primary },
  codePill: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  codePillText: { ...Typography.eyebrow, fontWeight: '800', color: colors.text.secondary },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  circleActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directoryInfoBox: {
    backgroundColor: 'transparent',
    borderRadius: Radius.sm,
    padding: 0,
    gap: 6,
  },
  directoryInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  directoryInfoText: { ...Typography.bodySm, color: colors.text.primary },
  directoryNotesText: { ...Typography.caption, color: colors.text.muted, fontStyle: 'italic', marginTop: 8 },

  // Attendance
  attendanceCard: {
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.md,
    ...Shadows.card,
  },
  attendanceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    justifyContent: 'center',
  },
  statusBadgePillText: { ...Typography.eyebrow, fontWeight: '800' },
  timeTimelineGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  timeTimelineBox: {
    flex: 1,
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.sm,
    padding: 10,
  },
  timeBoxLabel: { ...Typography.eyebrow, fontWeight: '800', color: colors.text.muted },
  timeBoxValue: { ...Typography.body, fontWeight: '800', color: colors.text.primary, marginTop: 4 },
  timeBoxSub: { ...Typography.eyebrow, color: colors.text.muted, marginTop: 2 },
  distanceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  // Visits
  visitCard: {
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.md,
    ...Shadows.card,
  },
  visitCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  visitCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  feedbackBox: {
    backgroundColor: colors.primary + '08',
    borderRadius: Radius.sm,
    padding: 8,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },

  // Expenses
  filterChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.md,
    flexWrap: 'wrap',
  },
  filterChipItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipItemActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipItemText: { ...Typography.caption, fontWeight: '700', color: colors.text.secondary },
  filterChipItemTextActive: {
    color: '#fff',
  },
  expenseCard: {
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.md,
    ...Shadows.card,
  },
  expenseCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expenseCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  miniApproveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },

  // Empty Containers
  emptyCardContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 34,
    gap: 7,
    ...Shadows.card,
  },
  emptyCardTitle: { ...Typography.h3, fontWeight: '800', color: colors.text.primary },
  emptyCardSubtitle: { ...Typography.bodySm, color: colors.text.muted, textAlign: 'center' },
  emptyInlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: Spacing.md,
  },
  emptyInlineText: { ...Typography.bodySm, color: colors.text.muted },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.bg.card,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...Shadows.hover,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg.card,
  },
  modalTitleText: { ...Typography.h3, fontWeight: '800', color: colors.text.primary },
  formField: {
    marginBottom: 12,
  },
  fieldLabelText: { ...Typography.caption, fontWeight: '700', color: colors.text.secondary, marginBottom: 4 },
  fieldInput: { ...Typography.bodySm, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, minHeight: 42, color: colors.text.primary },
  chipPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipPillText: { ...Typography.eyebrow, fontWeight: '700', color: colors.text.secondary },
  chipPillTextActive: {
    color: '#fff',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginVertical: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  infoBannerText: { ...Typography.bodySm, flex: 1, color: colors.text.secondary },
  sectionCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { ...Typography.bodySm, marginBottom: 8, fontWeight: '800', color: colors.text.primary },
  assignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  assignmentIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  assignmentName: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary },
  assignmentMeta: { ...Typography.caption, marginTop: 2, color: colors.text.muted },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.md,
  },
  choicePill: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 16,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choicePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  choicePillText: { ...Typography.caption, fontWeight: '700', color: colors.text.secondary, textTransform: 'capitalize' },
  choicePillTextActive: {
    color: '#fff',
  },
  modalFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg.secondary,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Radius.sm,
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelBtnText: { ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary },
  modalSubmitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: Radius.sm,
    backgroundColor: colors.primary,
  },
  modalSubmitBtnText: { ...Typography.bodySm, fontWeight: '700', color: '#fff' },
});
