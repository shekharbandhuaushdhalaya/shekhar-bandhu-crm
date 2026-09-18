import { StatusPill, WorkspaceLoading } from './../components/WorkspacePrimitives';
import { AppTextInput as TextInput } from './../components/AppTextInput';
import { PressableOpacity as TouchableOpacity } from './../components/PressableOpacity';
import { AppText as Text } from './../components/AppText';
import { Typography } from './../constants/theme';
import React, { useEffect, useState, useCallback } from 'react';
import { ScrollView, View, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../utils/api';
import { PageHeader as ScreenHeader } from '../components/PageHeader';
import { useTheme } from '../utils/themeContext';
import { useToast } from '../utils/ToastContext';

type ModuleKey = 'equipment' | 'deviations' | 'stability' | 'recalls' | 'vendors' | 'specifications';

export default function ComplianceScreen() {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ eq: [], dev: [], st: [], rec: [], vq: [], spec: [] });
  const [warehouses, setWarehouses] = useState<any[]>([]);

  // Selected Category Detail Modal
  const [activeCategory, setActiveCategory] = useState<ModuleKey | null>(null);

  // Add Equipment Modal
  const [addEquipmentModal, setAddEquipmentModal] = useState(false);
  const [eqForm, setEqForm] = useState({
    code: '',
    name: '',
    category: 'tableting',
    manufacturingUnitId: '',
    calibrationFrequencyDays: '180',
    notes: ''
  });

  // Calibrate Modal
  const [calibrateModal, setCalibrateModal] = useState(false);
  const [selectedEqId, setSelectedEqId] = useState<string | null>(null);
  const [calibForm, setCalibForm] = useState({
    certificateNo: '',
    calibratedBy: '',
    nextCalibrationDue: '',
    notes: ''
  });

  const loadWarehouses = useCallback(async () => {
    try {
      const list = await api.getWarehouses();
      setWarehouses(list || []);
      if (list && list.length > 0) {
        setEqForm(prev => ({ ...prev, manufacturingUnitId: prev.manufacturingUnitId || list[0]._id }));
      }
    } catch { }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eq, dev, st, rec, vq, spec] = await Promise.all([
        api.getManufacturingEquipment().catch(() => []),
        api.getManufacturingDeviations().catch(() => []),
        api.getStabilityStudies().catch(() => []),
        api.getRecalls().catch(() => []),
        api.getVendorQualifications().catch(() => []),
        api.getQualitySpecifications().catch(() => []),
      ]);
      setData({
        eq: Array.isArray(eq) ? eq : [],
        dev: Array.isArray(dev) ? dev : [],
        st: Array.isArray(st) ? st : [],
        rec: Array.isArray(rec) ? rec : [],
        vq: Array.isArray(vq) ? vq : [],
        spec: Array.isArray(spec) ? spec : [],
      });
    } catch {
      setData({ eq: [], dev: [], st: [], rec: [], vq: [], spec: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadWarehouses();
  }, [load, loadWarehouses]);

  const handleCreateEquipment = async () => {
    if (!eqForm.code.trim() || !eqForm.name.trim()) {
      showToast('Machine Code and Name are required', 'info');
      return;
    }
    try {
      await api.createManufacturingEquipment({
        ...eqForm,
        calibrationFrequencyDays: parseInt(eqForm.calibrationFrequencyDays, 10) || 180,
        manufacturingUnitId: eqForm.manufacturingUnitId || warehouses[0]?._id
      });
      showToast('Manufacturing equipment / machine registered successfully!', 'success');
      setAddEquipmentModal(false);
      setEqForm({
        code: '',
        name: '',
        category: 'tableting',
        manufacturingUnitId: warehouses[0]?._id || '',
        calibrationFrequencyDays: '180',
        notes: ''
      });
      load();
    } catch (err: any) {
      showToast(err.message || 'Failed to register machine', 'error');
    }
  };

  const handleCalibrateSubmit = async () => {
    if (!selectedEqId) return;
    try {
      await api.calibrateEquipment(selectedEqId, calibForm);
      showToast('Equipment calibration log recorded!', 'success');
      setCalibrateModal(false);
      setCalibForm({ certificateNo: '', calibratedBy: '', nextCalibrationDue: '', notes: '' });
      setSelectedEqId(null);
      load();
    } catch (err: any) {
      showToast(err.message || 'Failed to record calibration', 'error');
    }
  };

  const cards: [string, any[], ModuleKey, string, string][] = [
    ['Equipment & Machines', data.eq, 'equipment', 'build-outline', 'Mixers, Driers, Tablet Presses, Filling & Packaging Machines'],
    ['Deviations & CAPA', data.dev, 'deviations', 'alert-circle-outline', 'Quality Non-Conformances & Corrective Action Logs'],
    ['Stability Studies', data.st, 'stability', 'flask-outline', 'Real-time & Accelerated Shelf-Life Testing Protocols'],
    ['Recalls & Traceability', data.rec, 'recalls', 'archive-outline', 'Mock Recalls, Genealogies & Batch Quarantine Trace'],
    ['Vendor Qualification', data.vq, 'vendors', 'shield-checkmark-outline', 'Approved Raw Material Supplier Audit Scorecards'],
    ['AYUSH QC Specifications', data.spec, 'specifications', 'ribbon-outline', 'Botanical Limits, Organoleptic & Heavy Metal Tests'],
  ];

  const renderActiveCategoryDetails = () => {
    if (!activeCategory) return null;
    let title = '';
    let items: any[] = [];

    switch (activeCategory) {
      case 'equipment':
        title = 'Manufacturing Equipment & Machinery Roster';
        items = data.eq;
        break;
      case 'deviations':
        title = 'Deviations & CAPA Records';
        items = data.dev;
        break;
      case 'stability':
        title = 'Stability Testing Protocols';
        items = data.st;
        break;
      case 'recalls':
        title = 'Product Recalls & Tracing Logs';
        items = data.rec;
        break;
      case 'vendors':
        title = 'Vendor Audit Qualifications';
        items = data.vq;
        break;
      case 'specifications':
        title = 'AYUSH Quality Specifications';
        items = data.spec;
        break;
    }

    return (
      <Modal visible={!!activeCategory} animationType="slide" transparent onRequestClose={() => setActiveCategory(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.bg.card }]}>
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.text.primary }]}>{title}</Text>
                <Text style={[styles.modalSub, { color: colors.text.secondary }]}>{items.length} Total Records</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {activeCategory === 'equipment' && (
                  <TouchableOpacity
                    style={[styles.smallAddBtn, { backgroundColor: colors.primary }]}
                    onPress={() => setAddEquipmentModal(true)}
                  >
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={styles.smallAddBtnText}>+ Machine</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setActiveCategory(null)}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={{ flex: 1, padding: 16 }}>
              {items.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="documents-outline" size={36} color={colors.text.secondary} />
                  <Text style={[styles.emptyText, { color: colors.text.secondary }]}>No records found in this category.</Text>
                  {activeCategory === 'equipment' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
                      onPress={() => setAddEquipmentModal(true)}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Register First Machine</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                items.map((item: any, idx: number) => (
                  <View key={item._id || idx} style={[styles.detailItemCard, { borderColor: colors.border, backgroundColor: colors.bg.primary }]}>
                    {activeCategory === 'equipment' && (
                      <View>
                        <View style={styles.detailHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.codePill}>{item.code || `EQ-${idx + 1}`}</Text>
                            <Text style={[styles.itemTitle, { color: colors.text.primary }]}>{item.name}</Text>
                          </View>
                          <StatusPill  label={<>
                              {(item.status || 'ACTIVE').toUpperCase()}
                            </>} textStyle={[styles.statusBadgeText, { color: item.status === 'active' ? colors.success : colors.warning }]} />
                        </View>

                        <Text style={[styles.itemDetailText, { color: colors.text.secondary }]}>
                           Category: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{item.category?.toUpperCase() || 'MANUFACTURING'}</Text>
                          {'  |  '}
                           Unit: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{item.manufacturingUnitId?.name || 'Main Plant'}</Text>
                        </Text>

                        {item.calibrationDueDate && (
                          <Text style={[styles.itemDetailText, { color: colors.text.secondary, marginTop: 4 }]}>
                             Next Calibration Due: <Text style={{ fontWeight: '700', color: colors.primary }}>{new Date(item.calibrationDueDate).toLocaleDateString()}</Text>
                          </Text>
                        )}

                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                          <TouchableOpacity
                            style={[styles.miniActionBtn, { backgroundColor: colors.primary }]}
                            onPress={() => {
                              setSelectedEqId(item._id);
                              setCalibForm({
                                certificateNo: `CAL-${Date.now().toString().slice(-5)}`,
                                calibratedBy: '',
                                nextCalibrationDue: new Date(Date.now() + (item.calibrationFrequencyDays || 180) * 86400000).toISOString().slice(0, 10),
                                notes: ''
                              });
                              setCalibrateModal(true);
                            }}
                          >
                            <Ionicons name="checkmark-done-circle-outline" size={14} color="#fff" />
                            <Text style={{ ...Typography.bodySm, color: '#fff', fontWeight: '700' }}>Log Calibration</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {activeCategory !== 'equipment' && (
                      <View>
                        <Text style={[styles.itemTitle, { color: colors.text.primary }]}>
                          {item.name || item.title || item.code || item.productName || `Record #${idx + 1}`}
                        </Text>
                        <Text style={[styles.itemDetailText, { color: colors.text.secondary, marginTop: 4 }]}>
                          {item.notes || item.reason || item.description || item.status || 'Connected GMP Quality Record'}
                        </Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setActiveCategory(null)}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Close Panel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg.primary }} contentContainerStyle={styles.container}>
      <ScreenHeader
        title="GMP & AYUSH Compliance"
        subtitle="Connected manufacturing quality controls & machinery mechanisms"
      />

      <View style={[styles.headerBanner, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '30' }]}>
        <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.bannerTitle, { color: colors.primary }]}>Manufacturing & Quality Mechanisms</Text>
          <Text style={[styles.bannerSub, { color: colors.text.secondary }]}>
            Includes Equipment/Machinery calibration tracking, Line Clearance checks, Deviations (CAPA), Stability Studies, and Vendor Qualification.
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <WorkspaceLoading />
          <Text style={{ marginTop: 10, color: colors.text.secondary }}>Loading compliance modules...</Text>
        </View>
      ) : (
        cards.map(([title, items, key, iconName, desc]) => (
          <TouchableOpacity
            key={key}
            style={[styles.card, { backgroundColor: colors.bg.card, borderColor: colors.border }]}
            onPress={() => setActiveCategory(key)}
            activeOpacity={0.7}
          >
            <View style={styles.row}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={[styles.iconBadge, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name={iconName as any} size={22} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
                  <Text style={[styles.count, { color: colors.text.secondary }]}>
                    {Array.isArray(items) ? items.length : 0} active records
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <StatusPill  label={<>CONNECTED</>} textStyle={[styles.badgeText, { color: colors.success }]} />
                <Ionicons name="chevron-forward" size={18} color={colors.text.secondary} />
              </View>
            </View>
            <Text style={[styles.note, { color: colors.text.secondary }]}>{desc}</Text>
          </TouchableOpacity>
        ))
      )}

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6, marginBottom: 20 }}>
        <TouchableOpacity
          onPress={() => setAddEquipmentModal(true)}
          style={[styles.actionBtn, { backgroundColor: colors.primary, flex: 1 }]}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
          <Text style={{ color: '#fff', fontWeight: '700' }}>+ Register Machine</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={load}
          style={[styles.actionBtn, { backgroundColor: colors.bg.card, borderColor: colors.border, borderWidth: 1, flex: 1 }]}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh-outline" size={18} color={colors.text.primary} style={{ marginRight: 6 }} />
          <Text style={{ color: colors.text.primary, fontWeight: '700' }}>Refresh Data</Text>
        </TouchableOpacity>
      </View>

      {/* Modal: Add Equipment */}
      <Modal visible={addEquipmentModal} animationType="fade" transparent onRequestClose={() => setAddEquipmentModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.bg.card }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Register Manufacturing Machine</Text>
              <TouchableOpacity onPress={() => setAddEquipmentModal(false)}>
                <Ionicons name="close" size={22} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }}>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.text.primary }]}>Machine Code / Tag ID *</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.text.primary }]}
                  placeholder="e.g. EQ-MIX-001 or TAB-PRESS-02"
                  placeholderTextColor={colors.text.muted}
                  value={eqForm.code}
                  onChangeText={v => setEqForm({ ...eqForm, code: v })}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.text.primary }]}>Machine / Equipment Name *</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.text.primary }]}
                  placeholder="e.g. High Speed Rotary Tablet Press"
                  placeholderTextColor={colors.text.muted}
                  value={eqForm.name}
                  onChangeText={v => setEqForm({ ...eqForm, name: v })}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.text.primary }]}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {['tableting', 'mixer', 'drier', 'pulverizer', 'filling', 'packaging', 'qc_instrument'].map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.chip, eqForm.category === cat && { backgroundColor: colors.primary }]}
                      onPress={() => setEqForm({ ...eqForm, category: cat })}
                    >
                      <Text style={[styles.chipText, eqForm.category === cat && { color: '#fff' }]}>{cat.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.text.primary }]}>Calibration Frequency (Days)</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.text.primary }]}
                  placeholder="180"
                  keyboardType="numeric"
                  placeholderTextColor={colors.text.muted}
                  value={eqForm.calibrationFrequencyDays}
                  onChangeText={v => setEqForm({ ...eqForm, calibrationFrequencyDays: v })}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.text.primary }]}>Notes / Specifications</Text>
                <TextInput
                  style={[styles.input, { height: 60, borderColor: colors.border, color: colors.text.primary }]}
                  placeholder="Capacity, model, maintenance rules..."
                  multiline
                  placeholderTextColor={colors.text.muted}
                  value={eqForm.notes}
                  onChangeText={v => setEqForm({ ...eqForm, notes: v })}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAddEquipmentModal(false)}>
                <Text style={{ color: colors.text.secondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }]} onPress={handleCreateEquipment}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Register Machine</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal: Calibrate Machine */}
      <Modal visible={calibrateModal} animationType="fade" transparent onRequestClose={() => setCalibrateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.bg.card }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Record Calibration Certificate</Text>
              <TouchableOpacity onPress={() => setCalibrateModal(false)}>
                <Ionicons name="close" size={22} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <View style={{ padding: 16 }}>
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.text.primary }]}>Certificate Number</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.text.primary }]}
                  value={calibForm.certificateNo}
                  onChangeText={v => setCalibForm({ ...calibForm, certificateNo: v })}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.text.primary }]}>Calibrated By (Inspector / Agency)</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.text.primary }]}
                  placeholder="e.g. NABL Accredited QC Lab / Inspector Name"
                  placeholderTextColor={colors.text.muted}
                  value={calibForm.calibratedBy}
                  onChangeText={v => setCalibForm({ ...calibForm, calibratedBy: v })}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.text.primary }]}>Next Calibration Due Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.text.primary }]}
                  value={calibForm.nextCalibrationDue}
                  onChangeText={v => setCalibForm({ ...calibForm, nextCalibrationDue: v })}
                />
              </View>

              <View style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.text.primary }]}>Notes</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.text.primary }]}
                  placeholder="Calibration observations..."
                  placeholderTextColor={colors.text.muted}
                  value={calibForm.notes}
                  onChangeText={v => setCalibForm({ ...calibForm, notes: v })}
                />
              </View>
            </View>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setCalibrateModal(false)}>
                <Text style={{ color: colors.text.secondary, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: colors.primary }]} onPress={handleCalibrateSubmit}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save Calibration Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {renderActiveCategoryDetails()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  headerBanner: { padding: 16, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 12, alignItems: 'center' },
  bannerTitle: { ...Typography.h3, fontWeight: '700' },
  bannerSub: { ...Typography.bodySm, marginTop: 2 },
  loadingBox: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 18, borderWidth: 1, borderRadius: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBadge: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { ...Typography.h3, fontWeight: '700' },
  count: { ...Typography.bodySm, marginTop: 2 },
  badgePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { ...Typography.caption, fontWeight: '800' },
  note: { ...Typography.bodySm, marginTop: 12 },
  actionBtn: { padding: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { width: '100%', maxWidth: 700, maxHeight: '85%', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column' },
  modalCard: { width: '100%', maxWidth: 500, borderRadius: 14, padding: 16 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  modalTitle: { ...Typography.h2, fontWeight: '800' },
  modalSub: { ...Typography.bodySm, marginTop: 2 },
  emptyCard: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...Typography.body, marginTop: 10 },
  detailItemCard: { padding: 14, borderWidth: 1, borderRadius: 10, marginBottom: 10 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  codePill: { ...Typography.caption, backgroundColor: 'rgba(0,0,0,0.06)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontWeight: '800' },
  itemTitle: { ...Typography.h3, fontWeight: '700' },
  itemDetailText: { ...Typography.bodySm },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  statusBadgeText: { ...Typography.eyebrow, fontWeight: '800' },
  miniActionBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  smallAddBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  smallAddBtnText: { ...Typography.bodySm, color: '#fff', fontWeight: '700' },
  closeBtn: { padding: 14, backgroundColor: '#333', borderRadius: 10, alignItems: 'center', marginTop: 10 },
  field: { marginBottom: 12 },
  fieldLabel: { ...Typography.bodySm, fontWeight: '700', marginBottom: 4 },
  input: { ...Typography.body, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.06)' },
  chipText: { ...Typography.caption, fontWeight: '700', color: '#555' },
  modalFooterRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' },
  modalCancelBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  modalSubmitBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
});
