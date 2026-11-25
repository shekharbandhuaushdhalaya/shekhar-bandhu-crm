import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from '../components/AppText';
import { PressableOpacity as TouchableOpacity } from '../components/PressableOpacity';
import { PageHeader } from '../components/PageHeader';
import { WorkspaceLoading, StatusPill } from '../components/WorkspacePrimitives';
import { api } from '../utils/api';
import { useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { useTheme, useStyles } from '../utils/themeContext';
import { useToast } from '../utils/ToastContext';
import { Spacing, Typography, Radius } from '../constants/theme';

type InspectionValue = { result: string; outcome: 'pass' | 'fail'; evidenceRef: string };
type QuarantineLot = {
  _id: string; quarantineLotNo: string; herbName: string; botanicalName?: string;
  batchNo: string; supplierName: string; qty: number; unit: string; expiryDate: string;
  quarantineStatus: 'under_testing' | 'released' | 'rejected';
  qcSpecificationVersion?: string;
  qcSpecificationTests?: Array<{ code: string; name: string; specification: string; unit?: string; methodReference: string; mandatory?: boolean }>;
  inspectionResults?: Array<{ testCode: string; outcome: 'pass' | 'fail'; result: string }>;
  inspectionRecordedByUserId?: string; inspectionRecordedByName?: string; inspectionRecordedAt?: string;
  testReportNo?: string; remarks?: string;
};
type RawEntry = {
  _id: string; rawMaterialId: string | { _id: string; name: string; sku?: string; unit?: string; botanicalName?: string };
  batchNo: string; qty: number; reservedQty?: number; vendorName?: string; expiryDate?: string; qcStatus?: string;
};

const valueOf = (value: any) => value && typeof value === 'object' ? value : null;
const idOf = (value: any) => valueOf(value)?._id || value || '';

export default function IncomingQcScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuth();
  const permission = usePermission();
  const { showToast } = useToast();
  const canView = permission.can('inventory:view');
  const canRegister = permission.can('inventory:create');
  const canInspect = permission.can('quality:approve');
  const [lots, setLots] = useState<QuarantineLot[]>([]);
  const [entries, setEntries] = useState<RawEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inspectionLot, setInspectionLot] = useState<QuarantineLot | null>(null);
  const [inspection, setInspection] = useState<Record<string, InspectionValue>>({});
  const [dispositionLot, setDispositionLot] = useState<QuarantineLot | null>(null);
  const [reportNo, setReportNo] = useState('');
  const [remarks, setRemarks] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (!canView) { setLoading(false); return; }
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const [nextLots, nextEntries] = await Promise.all([
        api.getQuarantineLots(),
        api.getRawMaterialEntries()
      ]);
      setLots(Array.isArray(nextLots) ? nextLots : []);
      setEntries(Array.isArray(nextEntries) ? nextEntries : []);
    } catch (err: any) {
      setError(err?.message || 'Unable to load incoming QC records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canView]);

  useEffect(() => { load(); }, [load]);

  const eligibleEntries = useMemo(() => entries.filter(entry =>
    entry.qcStatus === 'under_test' && Number(entry.qty) > 0 && Number(entry.reservedQty || 0) === 0 &&
    Boolean(entry.expiryDate) && Boolean(entry.vendorName?.trim()) &&
    !lots.some(lot => String(lot.rawMaterialEntryId) === String(entry._id))
  ), [entries, lots]);

  const registerEntry = async (entry: RawEntry) => {
    const material = valueOf(entry.rawMaterialId);
    const materialId = idOf(entry.rawMaterialId);
    if (!materialId || !material || !entry.vendorName || !entry.expiryDate) {
      showToast('This stock entry is missing its material, supplier or expiry details.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.registerQuarantineLot({
        herbName: material.name,
        botanicalName: material.botanicalName || '',
        batchNo: entry.batchNo,
        supplierName: entry.vendorName,
        qty: Number(entry.qty),
        unit: material.unit || 'kg',
        expiryDate: entry.expiryDate,
        rawMaterialId: String(materialId),
        rawMaterialEntryId: entry._id
      });
      showToast('Stock lot registered in incoming QC quarantine.', 'success');
      await load(true);
    } catch (err: any) {
      showToast(err?.message || 'Unable to register quarantine lot', 'error');
    } finally { setBusy(false); }
  };

  const openInspection = (lot: QuarantineLot) => {
    const initial: Record<string, InspectionValue> = {};
    (lot.qcSpecificationTests || []).forEach(test => {
      initial[test.code] = { result: '', outcome: 'pass', evidenceRef: '' };
    });
    setInspection(initial);
    setInspectionLot(lot);
  };

  const submitInspection = async () => {
    if (!inspectionLot) return;
    const tests = inspectionLot.qcSpecificationTests || [];
    const missing = tests.filter(test => test.mandatory !== false && !inspection[test.code]?.result.trim());
    if (missing.length) {
      showToast('Enter actual results for all mandatory tests: ' + missing.map(test => test.code).join(', '), 'error');
      return;
    }
    const results = tests.filter(test => inspection[test.code]?.result.trim()).map(test => ({
      testCode: test.code, testName: test.name, methodReference: test.methodReference,
      specification: test.specification, result: inspection[test.code].result.trim(),
      unit: test.unit || '', outcome: inspection[test.code].outcome,
      evidenceRef: inspection[test.code].evidenceRef.trim()
    }));
    if (!results.length) return;
    setBusy(true);
    try {
      await api.recordIncomingInspection(inspectionLot._id, results);
      showToast('Incoming QC results recorded. Independent QA disposition is now required.', 'success');
      setInspectionLot(null);
      await load(true);
    } catch (err: any) {
      showToast(err?.message || 'Unable to record incoming QC results', 'error');
    } finally { setBusy(false); }
  };

  const openDisposition = (lot: QuarantineLot) => {
    setDispositionLot(lot);
    setReportNo('');
    setRemarks('');
  };

  const submitDisposition = async () => {
    if (!dispositionLot) return;
    const results = dispositionLot.inspectionResults || [];
    const failed = results.some(result => result.outcome === 'fail');
    const recordedBy = dispositionLot.inspectionRecordedByUserId;
    if (!recordedBy || String(recordedBy) === String(user?.id || user?._id || '')) {
      showToast('The QC analyst cannot approve their own inspection. Sign in as an independent QA reviewer.', 'error');
      return;
    }
    if (!reportNo.trim() || !remarks.trim()) return;
    setBusy(true);
    try {
      await api.disposeQuarantineLot(dispositionLot._id, {
        quarantineStatus: failed ? 'rejected' : 'released',
        testReportNo: reportNo.trim(),
        remarks: remarks.trim()
      });
      showToast(failed ? 'Lot rejected and remains unavailable for production.' : 'Lot released to approved raw-material stock.', 'success');
      setDispositionLot(null);
      await load(true);
    } catch (err: any) {
      showToast(err?.message || 'Unable to submit QC disposition', 'error');
    } finally { setBusy(false); }
  };

  if (!canView && permission.permissions !== null) {
    return <View style={styles.screen}><PageHeader title="Incoming Material QC" subtitle="Access requires inventory view permission." /></View>;
  }

  return (
    <View style={styles.screen}>
      <PageHeader title="Incoming Material QC" subtitle="Quarantine, specification-linked inspection and independent lot disposition." />
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Stock awaiting quarantine registration</Text>
          <Text style={styles.muted}>Only unreserved stock under test with supplier and expiry evidence is eligible.</Text>
        </View>
        {loading ? <WorkspaceLoading /> : eligibleEntries.length ? eligibleEntries.map(entry => {
          const material = valueOf(entry.rawMaterialId);
          return (
            <View key={entry._id} style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{material?.name || 'Raw material'}</Text>
                  <Text style={styles.muted}>Batch {entry.batchNo} · {entry.vendorName}</Text>
                  <Text style={styles.muted}>{entry.qty} {material?.unit || ''} · Expires {new Date(entry.expiryDate!).toLocaleDateString('en-IN')}</Text>
                </View>
                {canRegister ? <TouchableOpacity disabled={busy} onPress={() => registerEntry(entry)} style={styles.primaryButton}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Register QC</Text>}
                </TouchableOpacity> : null}
              </View>
            </View>
          );
        }) : !loading ? <Text style={styles.muted}>No eligible raw-material entries are waiting for quarantine registration.</Text> : null}

        <View style={[styles.sectionHeader, { marginTop: Spacing.lg }]}>
          <Text style={styles.sectionTitle}>Quarantine lots</Text>
          <Text style={styles.muted}>Each lot is tied to its approved incoming specification version.</Text>
        </View>
        {loading ? null : lots.length ? lots.map(lot => {
          const hasResults = Boolean(lot.inspectionRecordedAt || lot.inspectionResults?.length);
          const failed = (lot.inspectionResults || []).some(result => result.outcome === 'fail');
          const sameAnalyst = Boolean(lot.inspectionRecordedByUserId && String(lot.inspectionRecordedByUserId) === String(user?.id || user?._id || ''));
          return (
            <View key={lot._id} style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{lot.herbName} · {lot.quarantineLotNo}</Text>
                  <Text style={styles.muted}>Batch {lot.batchNo} · {lot.supplierName}</Text>
                  <Text style={styles.muted}>{lot.qty} {lot.unit} · Spec {lot.qcSpecificationVersion || '—'}</Text>
                  <Text style={styles.muted}>Expiry {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('en-IN') : '—'}</Text>
                  <View style={{ marginTop: 6 }}>
                    <StatusPill status={lot.quarantineStatus} />
                  </View>
                  {hasResults ? <Text style={styles.muted}>Inspection by {lot.inspectionRecordedByName || 'QC analyst'} · {(lot.inspectionResults || []).length} results · {failed ? 'Failure recorded' : 'No failures recorded'}</Text> : null}
                </View>
                {lot.quarantineStatus === 'under_testing' && canInspect && !hasResults ? (
                  <TouchableOpacity disabled={busy} onPress={() => openInspection(lot)} style={styles.primaryButton}><Text style={styles.buttonText}>Record tests</Text></TouchableOpacity>
                ) : null}
                {lot.quarantineStatus === 'under_testing' && canInspect && hasResults ? (
                  <TouchableOpacity disabled={busy || sameAnalyst} onPress={() => openDisposition(lot)} style={[styles.primaryButton, (busy || sameAnalyst) && { opacity: 0.5 }]}>
                    <Text style={styles.buttonText}>{failed ? 'Reject lot' : 'QA release'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {sameAnalyst && hasResults && lot.quarantineStatus === 'under_testing' ? <Text style={styles.warning}>The analyst who recorded these results cannot approve the disposition.</Text> : null}
            </View>
          );
        }) : <Text style={styles.muted}>No quarantine lots found.</Text>}
      </ScrollView>

      <Modal visible={Boolean(inspectionLot)} transparent animationType="slide" onRequestClose={() => setInspectionLot(null)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Record incoming inspection</Text>
          <Text style={styles.muted}>{inspectionLot?.herbName} · {inspectionLot?.batchNo} · Spec {inspectionLot?.qcSpecificationVersion}</Text>
          <ScrollView style={{ maxHeight: 480 }}>
            {(inspectionLot?.qcSpecificationTests || []).map(test => {
              const value = inspection[test.code] || { result: '', outcome: 'pass' as const, evidenceRef: '' };
              return <View key={test.code} style={styles.testCard}>
                <Text style={styles.cardTitle}>{test.name} ({test.code}){test.mandatory === false ? ' · Optional' : ' · Mandatory'}</Text>
                <Text style={styles.muted}>Specification: {test.specification} · Method: {test.methodReference}</Text>
                <TextInput value={value.result} onChangeText={next => setInspection(prev => ({ ...prev, [test.code]: { ...value, result: next } }))} placeholder="Actual observed result" placeholderTextColor={colors.text.muted} style={styles.input} />
                <TextInput value={value.evidenceRef} onChangeText={next => setInspection(prev => ({ ...prev, [test.code]: { ...value, evidenceRef: next } }))} placeholder="Lab report / evidence reference (optional)" placeholderTextColor={colors.text.muted} style={styles.input} />
                <View style={styles.row}>
                  <TouchableOpacity onPress={() => setInspection(prev => ({ ...prev, [test.code]: { ...value, outcome: 'pass' } }))} style={[styles.choiceButton, value.outcome === 'pass' && styles.choiceSelected]}><Text style={styles.choiceText}>Pass</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setInspection(prev => ({ ...prev, [test.code]: { ...value, outcome: 'fail' } }))} style={[styles.choiceButton, value.outcome === 'fail' && styles.choiceFailed]}><Text style={styles.choiceText}>Fail</Text></TouchableOpacity>
                </View>
              </View>;
            })}
          </ScrollView>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => setInspectionLot(null)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={submitInspection} style={styles.primaryButton}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save results</Text>}</TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      <Modal visible={Boolean(dispositionLot)} transparent animationType="slide" onRequestClose={() => setDispositionLot(null)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{(dispositionLot?.inspectionResults || []).some(result => result.outcome === 'fail') ? 'Reject incoming lot' : 'Approve incoming lot'}</Text>
          <Text style={styles.muted}>Independent QA review for {dispositionLot?.quarantineLotNo}. A real laboratory report reference and review remarks are required.</Text>
          <TextInput value={reportNo} onChangeText={setReportNo} placeholder="Laboratory test report number" placeholderTextColor={colors.text.muted} style={styles.input} />
          <TextInput value={remarks} onChangeText={setRemarks} placeholder="QA review remarks" placeholderTextColor={colors.text.muted} style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline />
          <View style={styles.row}>
            <TouchableOpacity onPress={() => setDispositionLot(null)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity disabled={busy || !reportNo.trim() || !remarks.trim()} onPress={submitDisposition} style={styles.primaryButton}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Confirm disposition</Text>}</TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: Spacing.lg, gap: Spacing.sm, paddingBottom: 48 },
  sectionHeader: { gap: 4, marginBottom: Spacing.sm },
  sectionTitle: { ...Typography.h3, color: colors.text.primary },
  card: { backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, flexWrap: 'wrap' },
  cardTitle: { ...Typography.body, fontWeight: '700', color: colors.text.primary },
  muted: { ...Typography.caption, color: colors.text.secondary, marginTop: 3 },
  warning: { ...Typography.caption, color: colors.warning, marginTop: 8 },
  primaryButton: { minHeight: 38, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.primary, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  buttonText: { ...Typography.bodySm, color: '#fff', fontWeight: '700' },
  secondaryButton: { minHeight: 38, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, justifyContent: 'center' },
  secondaryText: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: Spacing.md },
  modalCard: { maxHeight: '92%', backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  modalTitle: { ...Typography.h2, color: colors.text.primary },
  testCard: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, padding: Spacing.md, marginVertical: 6, gap: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text.primary, backgroundColor: colors.bg.secondary, ...Typography.body },
  choiceButton: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  choiceSelected: { borderColor: colors.success, backgroundColor: colors.success + '18' },
  choiceFailed: { borderColor: colors.danger, backgroundColor: colors.danger + '18' },
  choiceText: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '700' }
});
