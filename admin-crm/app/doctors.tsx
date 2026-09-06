import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Modal, RefreshControl, useWindowDimensions,
  Platform, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { useTheme, useStyles } from '../utils/themeContext';
import { useToast } from '../utils/ToastContext';
import { api, Doctor, MedicalRepresentative } from '../utils/api';
import { useDebouncedValue } from '../utils/useDebouncedValue';
import { LightColors, Spacing, Radius, Shadows } from '../constants/theme';

type ViewTab = 'directory' | 'matrix' | 'events';

export default function DoctorsScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const perm = usePermission();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [activeTab, setActiveTab] = useState<ViewTab>('directory');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Doctors & Search / Filter
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDoctors, setTotalDoctors] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Classification Matrix & Events
  const [matrixReport, setMatrixReport] = useState<any[]>([]);
  const [eventsList, setEventsList] = useState<any[]>([]);

  // MR List for Selector
  const [mrs, setMrs] = useState<MedicalRepresentative[]>([]);

  // Doctor Add/Edit Modal
  const [doctorModal, setDoctorModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [doctorForm, setDoctorForm] = useState<{
    name: string;
    clinicName: string;
    specialization: string;
    category: 'A' | 'B' | 'C' | '';
    phone: string;
    email: string;
    address: string;
    city: string;
    pincode: string;
    preferredTime: string;
    preferredVisitDay: string;
    monthlySampleQuota: string;
    assignedMrId: string;
    birthday: string;
    anniversary: string;
    notes: string;
  }>({
    name: '', clinicName: '', specialization: '', category: '', phone: '', email: '',
    address: '', city: '', pincode: '', preferredTime: '', preferredVisitDay: '',
    monthlySampleQuota: '', assignedMrId: '', birthday: '', anniversary: '', notes: ''
  });

  const loadMRs = useCallback(async () => {
    try {
      const data = await api.getMRs('', 'true');
      setMrs(data);
    } catch { }
  }, []);

  const loadDoctors = useCallback(async (targetPage = 1, isAppend = false) => {
    if (targetPage === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const catParam = selectedCategory !== 'all' ? selectedCategory : undefined;
      const res = await api.getDoctors(debouncedSearch, catParam, undefined, targetPage, 25);
      
      if (Array.isArray(res)) {
        setDoctors(res);
        setTotalDoctors(res.length);
        setTotalPages(1);
      } else {
        if (isAppend) {
          setDoctors(prev => {
            const existingIds = new Set(prev.map(d => d._id));
            const newItems = res.data.filter(d => !existingIds.has(d._id));
            return [...prev, ...newItems];
          });
        } else {
          setDoctors(res.data);
        }
        setTotalDoctors(res.total);
        setTotalPages(res.totalPages);
        setPage(res.page);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load doctors', 'error');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearch, selectedCategory, showToast]);

  const loadMatrix = useCallback(async () => {
    try {
      const data = await api.getDoctorMatrix();
      setMatrixReport(data);
    } catch { }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const data = await api.getDoctorEvents();
      setEventsList(data);
    } catch { }
  }, []);

  useEffect(() => {
    loadMRs();
  }, [loadMRs]);

  useEffect(() => {
    if (activeTab === 'directory') {
      loadDoctors(1, false);
    } else if (activeTab === 'matrix') {
      loadMatrix();
    } else if (activeTab === 'events') {
      loadEvents();
    }
  }, [activeTab, debouncedSearch, selectedCategory, loadDoctors, loadMatrix, loadEvents]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    api.clearCache('doctors');
    if (activeTab === 'directory') await loadDoctors(1, false);
    else if (activeTab === 'matrix') await loadMatrix();
    else if (activeTab === 'events') await loadEvents();
    setRefreshing(false);
  }, [activeTab, loadDoctors, loadMatrix, loadEvents]);

  const handleLoadMore = () => {
    if (!loadingMore && page < totalPages) {
      loadDoctors(page + 1, true);
    }
  };

  const handleOpenAddModal = () => {
    setEditingDoctor(null);
    setDoctorForm({
      name: '', clinicName: '', specialization: '', category: 'B', phone: '', email: '',
      address: '', city: '', pincode: '', preferredTime: '', preferredVisitDay: '',
      monthlySampleQuota: '', assignedMrId: '', birthday: '', anniversary: '', notes: ''
    });
    setDoctorModal(true);
  };

  const handleOpenEditModal = (doc: Doctor) => {
    setEditingDoctor(doc);
    setDoctorForm({
      name: doc.name || '',
      clinicName: doc.clinicName || '',
      specialization: doc.specialization || doc.specialty || '',
      category: doc.category || '',
      phone: doc.phone || '',
      email: doc.email || '',
      address: doc.address || '',
      city: doc.city || '',
      pincode: doc.pincode || '',
      preferredTime: doc.preferredTime || '',
      preferredVisitDay: doc.preferredVisitDay || '',
      monthlySampleQuota: doc.monthlySampleQuota ? doc.monthlySampleQuota.toString() : '',
      assignedMrId: typeof doc.assignedMrId === 'object' ? doc.assignedMrId?._id || '' : doc.assignedMrId || '',
      birthday: doc.birthday ? new Date(doc.birthday).toISOString().split('T')[0] : '',
      anniversary: doc.anniversary ? new Date(doc.anniversary).toISOString().split('T')[0] : '',
      notes: doc.notes || ''
    });
    setDoctorModal(true);
  };

  const handleSaveDoctor = async () => {
    if (!doctorForm.name.trim()) {
      showToast('Doctor name is required', 'info');
      return;
    }

    try {
      const payload: Partial<Doctor> = {
        name: doctorForm.name.trim(),
        clinicName: doctorForm.clinicName.trim(),
        specialization: doctorForm.specialization.trim(),
        category: doctorForm.category,
        phone: doctorForm.phone.trim(),
        email: doctorForm.email.trim(),
        address: doctorForm.address.trim(),
        city: doctorForm.city.trim(),
        pincode: doctorForm.pincode.trim(),
        preferredTime: doctorForm.preferredTime.trim(),
        preferredVisitDay: doctorForm.preferredVisitDay,
        monthlySampleQuota: doctorForm.monthlySampleQuota ? Number(doctorForm.monthlySampleQuota) : null,
        assignedMrId: doctorForm.assignedMrId || null,
        birthday: doctorForm.birthday ? new Date(doctorForm.birthday) : undefined,
        anniversary: doctorForm.anniversary ? new Date(doctorForm.anniversary) : undefined,
        notes: doctorForm.notes.trim()
      };

      if (editingDoctor) {
        await api.updateDoctor(editingDoctor._id, payload);
        showToast('Doctor record updated successfully', 'success');
      } else {
        await api.createDoctor(payload);
        showToast('New Doctor created successfully', 'success');
      }

      setDoctorModal(false);
      setEditingDoctor(null);
      loadDoctors(1, false);
    } catch (err: any) {
      showToast(err.message || 'Failed to save doctor', 'error');
    }
  };

  const handleDeleteDoctor = (id: string) => {
    const action = () => {
      api.deleteDoctor(id)
        .then(() => {
          showToast('Doctor deleted successfully', 'success');
          loadDoctors(1, false);
        })
        .catch(err => showToast(err.message, 'error'));
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete this Doctor record?')) action();
    } else {
      action();
    }
  };

  const categoryBadgeColors: Record<string, { bg: string; text: string }> = {
    A: { bg: colors.danger + '15', text: colors.danger },
    B: { bg: colors.info + '15', text: colors.info },
    C: { bg: colors.text.muted + '15', text: colors.text.secondary },
  };

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="medkit" size={24} color={colors.primary} />
            <Text style={styles.screenTitle}>Doctor Directory</Text>
          </View>
          <Text style={styles.screenSubtitle}>
            {totalDoctors} Doctors Managed | Classification & Field Promotion Portfolio
          </Text>
        </View>

        {perm.can('mr:create') && (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleOpenAddModal} activeOpacity={0.8}>
            <Ionicons name="add-circle" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>+ New Doctor</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {[
          { id: 'directory', label: 'Doctor Directory List', icon: 'list-outline' },
          { id: 'matrix', label: 'Classification & Call Compliance', icon: 'grid-outline' },
          { id: 'events', label: 'Birthdays & Reminders', icon: 'gift-outline' },
        ].map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabItem, activeTab === t.id && styles.tabItemActive]}
            onPress={() => setActiveTab(t.id as ViewTab)}
            activeOpacity={0.7}
          >
            <Ionicons name={t.icon as any} size={16} color={activeTab === t.id ? colors.primary : colors.text.muted} />
            <Text style={[styles.tabText, activeTab === t.id && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── 1. DIRECTORY LIST TAB ────────────────────────────────────────── */}
      {activeTab === 'directory' && (
        <View style={{ flex: 1 }}>
          {/* Controls Bar: Search & Category Filter */}
          <View style={styles.controlsBar}>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={16} color={colors.text.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search Doctor by name, clinic, specialization or city..."
                placeholderTextColor={colors.text.muted}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color={colors.text.muted} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.filterChips}>
              {['all', 'A', 'B', 'C'].map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, selectedCategory === cat && styles.chipActive]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text style={[styles.chipText, selectedCategory === cat && styles.chipTextActive]}>
                    {cat === 'all' ? 'All Tiers' : `Category ${cat}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : doctors.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="medkit-outline" size={48} color={colors.text.muted} />
              <Text style={styles.emptyTitle}>No Doctor Records Found</Text>
              <Text style={styles.emptySub}>Add doctors to your field force directory to manage MR promotions and sample quotas.</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >
              <View style={styles.gridContainer}>
                {doctors.map(doc => {
                  const catStyle = categoryBadgeColors[doc.category || ''] || categoryBadgeColors['C'];
                  const assignedMrName = typeof doc.assignedMrId === 'object' ? doc.assignedMrId?.name : '';

                  return (
                    <View key={doc._id} style={styles.doctorCard}>
                      <View style={styles.cardHeader}>
                        <View style={styles.avatarCircle}>
                          <Text style={styles.avatarText}>{doc.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.doctorName}>{doc.name}</Text>
                            {doc.category ? (
                              <View style={[styles.catBadge, { backgroundColor: catStyle.bg }]}>
                                <Text style={[styles.catBadgeText, { color: catStyle.text }]}>Cat {doc.category}</Text>
                              </View>
                            ) : null}
                          </View>
                          {doc.specialization || doc.specialty ? (
                            <Text style={styles.specText}>🔬 {doc.specialization || doc.specialty}</Text>
                          ) : null}
                        </View>

                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          {perm.can('mr:edit') && (
                            <TouchableOpacity style={styles.iconBtn} onPress={() => handleOpenEditModal(doc)}>
                              <Ionicons name="pencil-outline" size={15} color={colors.primary} />
                            </TouchableOpacity>
                          )}
                          {perm.can('mr:delete') && (
                            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.danger + '10' }]} onPress={() => handleDeleteDoctor(doc._id)}>
                              <Ionicons name="trash-outline" size={15} color={colors.danger} />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>

                      <View style={styles.cardDetails}>
                        {doc.clinicName ? (
                          <View style={styles.detailRow}>
                            <Ionicons name="business-outline" size={14} color={colors.text.muted} />
                            <Text style={styles.detailText}>{doc.clinicName}</Text>
                          </View>
                        ) : null}
                        {doc.city ? (
                          <View style={styles.detailRow}>
                            <Ionicons name="location-outline" size={14} color={colors.text.muted} />
                            <Text style={styles.detailText}>{doc.city}{doc.areaName ? ` (${doc.areaName})` : ''}</Text>
                          </View>
                        ) : null}
                        {doc.phone ? (
                          <View style={styles.detailRow}>
                            <Ionicons name="call-outline" size={14} color={colors.text.muted} />
                            <Text style={styles.detailText}>{doc.phone}</Text>
                          </View>
                        ) : null}
                        {assignedMrName ? (
                          <View style={styles.detailRow}>
                            <Ionicons name="person-outline" size={14} color={colors.primary} />
                            <Text style={[styles.detailText, { color: colors.primary, fontWeight: '600' }]}>MR: {assignedMrName}</Text>
                          </View>
                        ) : null}
                        {doc.preferredVisitDay || doc.preferredTime ? (
                          <View style={styles.detailRow}>
                            <Ionicons name="time-outline" size={14} color={colors.warning} />
                            <Text style={styles.detailText}>
                              Visit: {doc.preferredVisitDay || 'Anyday'} {doc.preferredTime ? `@ ${doc.preferredTime}` : ''}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Load More Control */}
              {page < totalPages && (
                <TouchableOpacity
                  style={styles.loadMoreBtn}
                  onPress={handleLoadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.loadMoreText}>Load More Doctors ({doctors.length} of {totalDoctors})</Text>
                  )}
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      )}

      {/* ── 2. CLASSIFICATION MATRIX TAB ──────────────────────────────────── */}
      {activeTab === 'matrix' && (
        <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Doctor Classification & Monthly Call Compliance</Text>
            <Text style={styles.sectionSub}>Required visits by tier: Category A = 4 calls/mo, B = 2 calls/mo, C = 1 call/mo</Text>

            {matrixReport.map(item => (
              <View key={item._id} style={styles.matrixRow}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.doctorName}>{item.name}</Text>
                    <View style={[styles.catBadge, { backgroundColor: (categoryBadgeColors[item.category] || categoryBadgeColors['C']).bg }]}>
                      <Text style={[styles.catBadgeText, { color: (categoryBadgeColors[item.category] || categoryBadgeColors['C']).text }]}>Cat {item.category}</Text>
                    </View>
                  </View>
                  <Text style={styles.specText}>{item.clinic ? `${item.clinic} • ` : ''}{item.specialization || item.specialty || 'General Practitioner'}</Text>
                </View>

                <View style={{ alignItems: 'flex-end', width: 140 }}>
                  <Text style={styles.complianceText}>
                    {item.actualVisits} / {item.requiredVisits} Calls ({item.compliancePct}%)
                  </Text>
                  <View style={styles.progressBarTrack}>
                    <View style={[styles.progressBarFill, { width: `${item.compliancePct}%`, backgroundColor: item.compliancePct >= 100 ? colors.success : colors.primary }]} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── 3. EVENTS & REMINDERS TAB ─────────────────────────────────────── */}
      {activeTab === 'events' && (
        <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: Spacing.md }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Upcoming Birthdays & Anniversaries</Text>
            {eventsList.length === 0 ? (
              <Text style={{ marginTop: 8, color: colors.text.muted }}>No upcoming events recorded for doctors.</Text>
            ) : (
              eventsList.map((evt, idx) => (
                <View key={idx} style={styles.eventRow}>
                  <View style={[styles.eventBadge, { backgroundColor: evt.eventType === 'Birthday' ? colors.primary + '15' : colors.warning + '15' }]}>
                    <Ionicons name={evt.eventType === 'Birthday' ? 'gift-outline' : 'heart-outline'} size={18} color={evt.eventType === 'Birthday' ? colors.primary : colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.doctorName}>{evt.doctorName}</Text>
                    <Text style={styles.specText}>{evt.clinic || 'Clinic'} | {evt.eventType}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                    {new Date(evt.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}

      {/* ── CREATE / EDIT DOCTOR MODAL ─────────────────────────────────────── */}
      <Modal visible={doctorModal} animationType="fade" transparent onRequestClose={() => setDoctorModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitleText}>{editingDoctor ? 'Edit Doctor Record' : 'Add New Doctor'}</Text>
              <TouchableOpacity onPress={() => setDoctorModal(false)}>
                <Ionicons name="close" size={22} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: Spacing.lg }}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Doctor Full Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Dr. Rajesh Kumar"
                  placeholderTextColor={colors.text.muted}
                  value={doctorForm.name}
                  onChangeText={v => setDoctorForm({ ...doctorForm, name: v })}
                />
              </View>

              <View style={styles.rowForm}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Clinic / Hospital Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Kumar Ayurvedic Clinic"
                    placeholderTextColor={colors.text.muted}
                    value={doctorForm.clinicName}
                    onChangeText={v => setDoctorForm({ ...doctorForm, clinicName: v })}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Specialization</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Kayachikitsa / BAMS"
                    placeholderTextColor={colors.text.muted}
                    value={doctorForm.specialization}
                    onChangeText={v => setDoctorForm({ ...doctorForm, specialization: v })}
                  />
                </View>
              </View>

              <View style={styles.rowForm}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Tier Category</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                    {(['A', 'B', 'C'] as const).map(cat => (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.catSelectBtn, doctorForm.category === cat && styles.catSelectBtnActive]}
                        onPress={() => setDoctorForm({ ...doctorForm, category: cat })}
                      >
                        <Text style={[styles.catSelectText, doctorForm.category === cat && styles.catSelectTextActive]}>Tier {cat}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Monthly Sample Quota (Units)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 10 (Defaults by Tier)"
                    placeholderTextColor={colors.text.muted}
                    keyboardType="numeric"
                    value={doctorForm.monthlySampleQuota}
                    onChangeText={v => setDoctorForm({ ...doctorForm, monthlySampleQuota: v })}
                  />
                </View>
              </View>

              <View style={styles.rowForm}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Phone Number</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Phone number"
                    placeholderTextColor={colors.text.muted}
                    keyboardType="phone-pad"
                    value={doctorForm.phone}
                    onChangeText={v => setDoctorForm({ ...doctorForm, phone: v })}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={colors.text.muted}
                    keyboardType="email-address"
                    value={doctorForm.email}
                    onChangeText={v => setDoctorForm({ ...doctorForm, email: v })}
                  />
                </View>
              </View>

              <View style={styles.rowForm}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>City</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Varanasi"
                    placeholderTextColor={colors.text.muted}
                    value={doctorForm.city}
                    onChangeText={v => setDoctorForm({ ...doctorForm, city: v })}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Assigned MR</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 4 }}>
                    <TouchableOpacity
                      style={[styles.mrChip, !doctorForm.assignedMrId && styles.mrChipActive]}
                      onPress={() => setDoctorForm({ ...doctorForm, assignedMrId: '' })}
                    >
                      <Text style={[styles.mrChipText, !doctorForm.assignedMrId && styles.mrChipTextActive]}>Unassigned</Text>
                    </TouchableOpacity>
                    {mrs.map(m => (
                      <TouchableOpacity
                        key={m._id}
                        style={[styles.mrChip, doctorForm.assignedMrId === m._id && styles.mrChipActive]}
                        onPress={() => setDoctorForm({ ...doctorForm, assignedMrId: m._id })}
                      >
                        <Text style={[styles.mrChipText, doctorForm.assignedMrId === m._id && styles.mrChipTextActive]}>{m.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <View style={styles.rowForm}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Preferred Visit Day</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Monday"
                    placeholderTextColor={colors.text.muted}
                    value={doctorForm.preferredVisitDay}
                    onChangeText={v => setDoctorForm({ ...doctorForm, preferredVisitDay: v })}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Preferred Visit Time</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 05:00 PM - 07:00 PM"
                    placeholderTextColor={colors.text.muted}
                    value={doctorForm.preferredTime}
                    onChangeText={v => setDoctorForm({ ...doctorForm, preferredTime: v })}
                  />
                </View>
              </View>

              <View style={styles.rowForm}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Birthday (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="1985-05-15"
                    placeholderTextColor={colors.text.muted}
                    value={doctorForm.birthday}
                    onChangeText={v => setDoctorForm({ ...doctorForm, birthday: v })}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Anniversary (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="2010-12-04"
                    placeholderTextColor={colors.text.muted}
                    value={doctorForm.anniversary}
                    onChangeText={v => setDoctorForm({ ...doctorForm, anniversary: v })}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Notes & Special Instructions</Text>
                <TextInput
                  style={[styles.input, { height: 60, textAlignVertical: 'top', paddingTop: 8 }]}
                  placeholder="Notes..."
                  placeholderTextColor={colors.text.muted}
                  multiline
                  value={doctorForm.notes}
                  onChangeText={v => setDoctorForm({ ...doctorForm, notes: v })}
                />
              </View>

              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveDoctor} activeOpacity={0.8}>
                <Text style={styles.submitBtnText}>{editingDoctor ? 'Save Changes' : 'Create Doctor'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: colors.bg.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
  },
  screenSubtitle: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bg.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: Spacing.md,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  searchBox: {
    flex: 1,
    minWidth: 240,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
  },
  filterChips: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
  },
  chipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    marginTop: 10,
  },
  emptySub: {
    fontSize: 13,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 320,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  doctorCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.md,
    gap: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
  },
  doctorName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  catBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  specText: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 1,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '10',
  },
  cardDetails: {
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  loadMoreBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: Spacing.md,
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  sectionCard: {
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary,
  },
  sectionSub: {
    fontSize: 12,
    color: colors.text.muted,
  },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  complianceText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eventBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 580,
    maxHeight: '90%',
    backgroundColor: colors.bg.secondary,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitleText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
  },
  formGroup: {
    marginBottom: 12,
  },
  rowForm: {
    flexDirection: 'row',
    gap: 10,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
    height: 38,
    fontSize: 13,
    color: colors.text.primary,
  },
  catSelectBtn: {
    flex: 1,
    height: 34,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.primary,
  },
  catSelectBtnActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  catSelectText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.muted,
  },
  catSelectTextActive: {
    color: colors.primary,
  },
  mrChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg.primary,
  },
  mrChipActive: {
    backgroundColor: colors.primary + '15',
    borderColor: colors.primary,
  },
  mrChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.muted,
  },
  mrChipTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
});
