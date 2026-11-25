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
  _id: string; rawMaterialEntryId?: string; quarantineLotNo: string; herbName: string; botanicalName?: string;
  batchNo: string; supplierName: string; qty: number; unit: string; expiryDate: string;
  quarantineStatus: 'under_testing' | 'released' | 'rejected';
  qcSpecificationVersion?: string;
  qcSpecificationTests?: Array<{ code: string; name: string; specification: string; unit?: string; methodReference: string; mandatory?: boolean }>;
  inspectionResults?: Array<{ testCode: string; outcome: 'pass' | 'fail'; result: string }>;
  inspectionRecordedByUserId?: string; inspectionRecordedByName?: string; inspectionRecordedAt?: string;
  rawMaterialId?: string;
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
  const canView = permission.can('inventory:view') && permission.can('manufacturing:view');
  const canViewSpecs = permission.can('quality:view');
  const canCreateSpec = permission.can('quality:create');
  const canRegister = permission.can('inventory:create');
  const canInspect = permission.can('quality:approve');
  const [lots, setLots] = useState<QuarantineLot[]>([]);
  const [entries, setEntries] = useState<RawEntry[]>([]);
  const [specifications, setSpecifications] = useState<any[]>([]);
  const [specModal, setSpecModal] = useState(false);
  const [specMaterialId, setSpecMaterialId] = useState('');
  const [specForm, setSpecForm] = useState({
    specificationVersion: '', pharmacopoeialStandard: 'API', monographReference: '',
    effectiveDate: new Date().toISOString().slice(0, 10), sourceNote: ''
  });
  const [specTests, setSpecTests] = useState<Array<{
    code: string; name: string; specification: string; methodReference: string; unit: string; mandatory: boolean;
  }>>([{ code: '', name: '', specification: '', methodReference: '', unit: '', mandatory: true }]);
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
      const [nextLots, nextEntries, nextSpecs] = await Promise.all([
        api.getQuarantineLots(),
        api.getRawMaterialEntries(),
        canViewSpecs ? api.getRawMaterialQualitySpecifications() : Promise.resolve([])
      ]);
      setLots(Array.isArray(nextLots) ? nextLots : []);
      setEntries(Array.isArray(nextEntries) ? nextEntries : []);
      setSpecifications(Array.isArray(nextSpecs) ? nextSpecs : []);
    } catch (err: any) {
      setError(err?.message || 'Unable to load incoming QC records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canView, canViewSpecs]);

  useEffect(() => { load(); }, [load]);

  const eligibleEntries = useMemo(() => entries.filter(entry =>
    entry.qcStatus === 'under_test' && Number(entry.qty) > 0 && Number(entry.reservedQty || 0) === 0 &&
    Boolean(entry.expiryDate) && Boolean(entry.vendorName?.trim()) &&
    !lots.some(lot => String(lot.rawMaterialEntryId) === String(entry._id))
  ), [entries, lots]);

  const materials = useMemo(() => {
    const seen = new Set<string>();
    return entries.map(entry => valueOf(entry.rawMaterialId)).filter((material: any) => {
      if (!material?._id || seen.has(String(material._id))) return false;
      seen.add(String(material._id));
      return true;
    });
  }, [entries]);

  const openSpecModal = () => {
    setSpecMaterialId(specMaterialId || String(materials[0]?._id || ''));
    setSpecForm({
      specificationVersion: '', pharmacopoeialStandard: 'API', monographReference: '',
      effectiveDate: new Date().toISOString().slice(0, 10), sourceNote: ''
    });
    setSpecTests([{ code: '', name: '', specification: '', methodReference: '', unit: '', mandatory: true }]);
    setSpecModal(true);
  };

  const updateSpecTest = (index: number, key: string, value: string | boolean) => {
    setSpecTests(prev => prev.map((test, i) => i === index ? { ...test, [key]: value } : test));
  };

  const createSpecification = async () => {
    if (!specMaterialId || !specForm.specificationVersion.trim() || !specForm.pharmacopoeialStandard.trim() || !specForm.effectiveDate.trim()) {
      showToast('Select a material and enter specification version, standard and effective date.', 'error');
      return;
    }
    if (!specTests.some(test => test.mandatory) || specTests.some(test =>
      !test.code.trim() || !test.name.trim() || !test.specification.trim() || !test.methodReference.trim()
    )) {
      showToast('Complete every test field and include at least one mandatory test.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.createRawMaterialQualitySpecification({
        rawMaterialId: specMaterialId,
        ...specForm,
        tests: specTests.map(test => ({ ...test, category: 'other' }))
      });
      showToast('Draft incoming QC specification created. A different QA approver must approve it.', 'success');
      setSpecModal(false);
      await load(true);
    } catch (err: any) {
      showToast(err?.message || 'Unable to create incoming QC specification', 'error');
    } finally { setBusy(false); }
  };

  const approveSpecification = async (spec: any) => {
    if (String(spec.createdByUserId || '') === String(user?.id || '')) {
      showToast('The specification author cannot approve their own specification.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.approveRawMaterialQualitySpecification(spec._id);
      showToast('Incoming QC specification independently approved.', 'success');
      await load(true);
    } catch (err: any) {
      showToast(err?.message || 'Unable to approve incoming QC specification', 'error');
    } finally { setBusy(false); }
  };

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
    if (!recordedBy || String(recordedBy) === String(user?.id || '')) {
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
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Material-specific incoming QC specifications</Text>
              <Text style={styles.muted}>Create draft test requirements for each raw material; approval must be independent.</Text>
            </View>
            {canCreateSpec ? <TouchableOpacity disabled={busy || materials.length === 0} onPress={openSpecModal} style={styles.primaryButton}>
              <Text style={styles.buttonText}>New specification</Text>
            </TouchableOpacity> : null}
          </View>
        </View>
        {canViewSpecs ? (specifications.length ? specifications.map(spec => {
          const sameAuthor = String(spec.createdByUserId || '') === String(user?.id || '');
          return <View key={spec._id} style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{spec.materialName} · v{spec.specificationVersion}</Text>
                <Text style={styles.muted}>{spec.pharmacopoeialStandard} · {spec.tests?.length || 0} configured tests · Effective {spec.effectiveDate ? new Date(spec.effectiveDate).toLocaleDateString('en-IN') : '—'}</Text>
                <Text style={styles.muted}>Author: {spec.createdByName || '—'}{spec.approvedByName ? ' · Approved by ' + spec.approvedByName : ''}</Text>
                <View style={{ marginTop: 6 }}>
                  <StatusPill label={spec.status} tone={spec.status === 'approved' ? 'success' : spec.status === 'superseded' ? 'neutral' : 'warning'} />
                </View>
              </View>
              {spec.status === 'draft' && permission.can('quality:approve') ? (
                <TouchableOpacity disabled={busy || sameAuthor} onPress={() => approveSpecification(spec)} style={[styles.primaryButton, (busy || sameAuthor) && { opacity: 0.5 }]}>
                  <Text style={styles.buttonText}>Approve</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {spec.status === 'draft' && sameAuthor ? <Text style={styles.warning}>The author cannot approve this specification.</Text> : null}
          </View>;
        }) : <Text style={styles.muted}>No incoming QC specifications found. Create a material-specific draft to begin.</Text>) : <Text style={styles.muted}>Specification visibility requires quality view permission.</Text>}

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
          const sameAnalyst = Boolean(lot.inspectionRecordedByUserId && String(lot.inspectionRecordedByUserId) === String(user?.id || ''));
          return (
            <View key={lot._id} style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{lot.herbName} · {lot.quarantineLotNo}</Text>
                  <Text style={styles.muted}>Batch {lot.batchNo} · {lot.supplierName}</Text>
                  <Text style={styles.muted}>{lot.qty} {lot.unit} · Spec {lot.qcSpecificationVersion || '—'}</Text>
                  <Text style={styles.muted}>Expiry {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString('en-IN') : '—'}</Text>
                  <View style={{ marginTop: 6 }}>
                    <StatusPill label={lot.quarantineStatus.replace('_', ' ')} tone={lot.quarantineStatus === 'released' ? 'success' : lot.quarantineStatus === 'rejected' ? 'danger' : 'warning'} />
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

      <Modal visible={specModal} transparent animationType="slide" onRequestClose={() => setSpecModal(false)}>
        <View style={styles.modalBackdrop}><View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Create incoming QC specification</Text>
          <Text style={styles.muted}>Define tests for this material only. Do not copy a generic panel across formulations or herbs.</Text>
          <ScrollView style={{ maxHeight: 520 }}>
            <Text style={styles.fieldLabel}>Raw material</Text>
            <View style={styles.row}>
              {materials.map((material: any) => <TouchableOpacity key={material._id} onPress={() => setSpecMaterialId(String(material._id))} style={[styles.choiceButton, specMaterialId === String(material._id) && styles.choiceSelected]}>
                <Text style={styles.choiceText}>{material.name}</Text>
              </TouchableOpacity>)}
            </View>
            <Text style={styles.fieldLabel}>Specification version</Text>
            <TextInput value={specForm.specificationVersion} onChangeText={value => setSpecForm(prev => ({ ...prev, specificationVersion: value }))} placeholder="e.g. 1.0" placeholderTextColor={colors.text.muted} style={styles.input} />
            <Text style={styles.fieldLabel}>Pharmacopoeial / approved standard</Text>
            <TextInput value={specForm.pharmacopoeialStandard} onChangeText={value => setSpecForm(prev => ({ ...prev, pharmacopoeialStandard: value }))} placeholder="API / AFI / IP / approved in-house standard" placeholderTextColor={colors.text.muted} style={styles.input} />
            <Text style={styles.fieldLabel}>Monograph reference</Text>
            <TextInput value={specForm.monographReference} onChangeText={value => setSpecForm(prev => ({ ...prev, monographReference: value }))} placeholder="Exact volume / part / page / reference" placeholderTextColor={colors.text.muted} style={styles.input} />
            <Text style={styles.fieldLabel}>Effective date (YYYY-MM-DD)</Text>
            <TextInput value={specForm.effectiveDate} onChangeText={value => setSpecForm(prev => ({ ...prev, effectiveDate: value }))} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.muted} style={styles.input} />
            <Text style={styles.fieldLabel}>Source note</Text>
            <TextInput value={specForm.sourceNote} onChangeText={value => setSpecForm(prev => ({ ...prev, sourceNote: value }))} placeholder="Controlled source / internal approval reference" placeholderTextColor={colors.text.muted} style={styles.input} />
            {specTests.map((test, index) => <View key={index} style={styles.testCard}>
              <View style={styles.row}>
                <Text style={styles.cardTitle}>Test {index + 1}</Text>
                {specTests.length > 1 ? <TouchableOpacity onPress={() => setSpecTests(prev => prev.filter((_, i) => i !== index))}><Text style={styles.warning}>Remove</Text></TouchableOpacity> : null}
              </View>
              <TextInput value={test.code} onChangeText={value => updateSpecTest(index, 'code', value)} placeholder="Unique test code" placeholderTextColor={colors.text.muted} style={styles.input} />
              <TextInput value={test.name} onChangeText={value => updateSpecTest(index, 'name', value)} placeholder="Test name" placeholderTextColor={colors.text.muted} style={styles.input} />
              <TextInput value={test.specification} onChangeText={value => updateSpecTest(index, 'specification', value)} placeholder="Acceptance specification / limit" placeholderTextColor={colors.text.muted} style={styles.input} />
              <TextInput value={test.methodReference} onChangeText={value => updateSpecTest(index, 'methodReference', value)} placeholder="Approved test method reference" placeholderTextColor={colors.text.muted} style={styles.input} />
              <TextInput value={test.unit} onChangeText={value => updateSpecTest(index, 'unit', value)} placeholder="Unit (if applicable)" placeholderTextColor={colors.text.muted} style={styles.input} />
              <TouchableOpacity onPress={() => updateSpecTest(index, 'mandatory', !test.mandatory)} style={styles.row}>
                <Text style={styles.muted}>Mandatory test</Text>
                <StatusPill label={test.mandatory ? 'Required' : 'Optional'} tone={test.mandatory ? 'primary' : 'neutral'} />
              </TouchableOpacity>
            </View>)}
            <TouchableOpacity onPress={() => setSpecTests(prev => [...prev, { code: '', name: '', specification: '', methodReference: '', unit: '', mandatory: true }])} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>+ Add test</Text>
            </TouchableOpacity>
          </ScrollView>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => setSpecModal(false)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity disabled={busy || !materials.length} onPress={createSpecification} style={styles.primaryButton}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save draft</Text>}</TouchableOpacity>
          </View>
        </View></View>
      </Modal>

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
  fieldLabel: { ...Typography.caption, color: colors.text.secondary, marginTop: 8, marginBottom: 2 },
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
