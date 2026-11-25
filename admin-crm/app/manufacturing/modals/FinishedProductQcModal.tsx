import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { StatusPill } from '../../../components/WorkspacePrimitives';
import { PressableOpacity as TouchableOpacity } from '../../../components/PressableOpacity';
import { AppText as Text } from '../../../components/AppText';
import { api } from '../../../utils/api';
import { useAuth } from '../../../utils/auth';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { useToast } from '../../../utils/ToastContext';
import { Radius, Spacing, Typography } from '../../../constants/theme';

type TestValue = { result: string; status: 'pass' | 'fail'; remarks: string };
interface Props { visible: boolean; batch: any | null; onClose: () => void; onCompleted: () => void; }

export default function FinishedProductQcModal({ visible, batch, onClose, onCompleted }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuth();
  const { showToast } = useToast();
  const [specifications, setSpecifications] = useState<any[]>([]);
  const [selectedSpecId, setSelectedSpecId] = useState('');
  const [values, setValues] = useState<Record<string, TestValue>>({});
  const [qaNotes, setQaNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const productId = batch?.productId && typeof batch.productId === 'object' ? batch.productId._id : batch?.productId;
  useEffect(() => {
    if (!visible || !batch || !productId) return;
    let active = true;
    setLoading(true);
    setLoadError('');
    api.getQualitySpecifications(productId).then((result: any[]) => {
      if (!active) return;
      const approved = (Array.isArray(result) ? result : []).filter(spec => spec.status === 'approved');
      setSpecifications(approved);
      setSelectedSpecId(batch.qcSpecificationId || approved[0]?._id || '');
      setQaNotes('');
      setValues({});
    }).catch((err: any) => {
      if (active) setLoadError(err?.message || 'Unable to load approved product quality specifications');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [visible, batch?._id, productId]);

  const specification = specifications.find(spec => String(spec._id) === String(selectedSpecId));
  const latestResults = useMemo(() => {
    const map = new Map<string, any>();
    for (const test of (batch?.qcTests || [])) map.set(String(test.code || '').trim().toLowerCase(), test);
    return map;
  }, [batch?.qcTests]);
  const availableTests = (specification?.tests || []).filter((test: any) => {
    const previous = latestResults.get(String(test.code || '').trim().toLowerCase());
    return !previous || String(previous.status || '').toLowerCase() === 'fail';
  });
  const mode = batch?.qcStatus === 'pending_qa_review' ? 'qa' : batch?.qcStatus === 'approved' ? 'release' : 'tests';
  const sameAnalyst = Boolean(batch?.qcPassedByUser && String(batch.qcPassedByUser) === String(user?.id || ''));

  const updateValue = (code: string, key: 'result' | 'status' | 'remarks', value: string) => {
    setValues(prev => ({
      ...prev,
      [code]: { ...(prev[code] || { result: '', status: 'pass', remarks: '' }), [key]: value } as TestValue
    }));
  };

  const submitTests = async () => {
    if (!specification) { showToast('Select an approved product-specific quality specification.', 'error'); return; }
    const tests = availableTests.filter((test: any) => values[test.code]?.result.trim()).map((test: any) => ({
      code: test.code, result: values[test.code].result.trim(), status: values[test.code].status,
      remarks: values[test.code].remarks.trim()
    }));
    if (!tests.length) { showToast('Enter at least one actual QC result before saving.', 'error'); return; }
    setBusy(true);
    try {
      const result = await api.recordBatchQcTests(batch._id, { qcSpecificationId: specification._id, tests });
      const deviations = result?.deviations || [];
      showToast(deviations.length
        ? 'QC failure recorded. Deviation/CAPA ' + deviations.map((item: any) => item.deviationNo).join(', ') + ' opened; batch placed on hold.'
        : result?.message || 'Finished-product QC results recorded.', deviations.length ? 'error' : 'success');
      onCompleted();
    } catch (err: any) { showToast(err?.message || 'Unable to record finished-product QC results', 'error'); }
    finally { setBusy(false); }
  };

  const approveQc = async () => {
    if (!qaNotes.trim()) { showToast('Independent QA review notes are required.', 'error'); return; }
    if (sameAnalyst) { showToast('The QC analyst cannot approve their own test disposition.', 'error'); return; }
    setBusy(true);
    try {
      await api.approveBatchQcDisposition(batch._id, qaNotes.trim());
      showToast('QC disposition independently approved. Separate market release is still required.', 'success');
      onCompleted();
    } catch (err: any) { showToast(err?.message || 'Unable to approve QC disposition', 'error'); }
    finally { setBusy(false); }
  };

  const releaseBatch = async () => {
    if (sameAnalyst) { showToast('The QC analyst cannot release the same batch.', 'error'); return; }
    setBusy(true);
    try {
      await api.releaseBatchProduction(batch._id);
      showToast('Independent market release recorded. Finished stock is now market released.', 'success');
      onCompleted();
    } catch (err: any) { showToast(err?.message || 'Market release was blocked by outstanding GMP / QA evidence', 'error'); }
    finally { setBusy(false); }
  };

  const recorded = batch?.qcTests || [];
  const pinned = Boolean(batch?.qcSpecificationId);
  const analystName = batch?.qcPassedBy || recorded[recorded.length - 1]?.testedByName || '—';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Finished-product QC & market release</Text>
              <Text style={styles.muted}>Batch {batch?.batchNo || '—'} · {batch?.productId?.name || 'Product'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>Close</Text></TouchableOpacity>
          </View>
          {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
          {loading ? <ActivityIndicator color={colors.primary} /> : null}

          {mode === 'tests' && !loading ? (
            <>
              {!pinned ? <>
                <Text style={styles.fieldLabel}>Approved product-specific quality specification</Text>
                <View style={styles.row}>
                  {specifications.map(spec => <TouchableOpacity key={spec._id} onPress={() => setSelectedSpecId(spec._id)} style={[styles.choice, selectedSpecId === spec._id && styles.choiceSelected]}>
                    <Text style={styles.choiceText}>v{spec.specificationVersion} · {spec.pharmacopoeialStandard}</Text>
                  </TouchableOpacity>)}
                </View>
              </> : <Text style={styles.muted}>Pinned approved specification: {specification?.specificationVersion || batch?.qcSpecificationVersion || 'Loading…'}</Text>}
              {!specifications.length ? <Text style={styles.error}>No approved product-specific QC specification is available. Create and independently approve one in GMP & Compliance before recording results.</Text> : null}
              {specification ? (specification.tests || []).map((test: any) => {
                const previous = latestResults.get(String(test.code || '').trim().toLowerCase());
                const editable = !previous || String(previous.status || '').toLowerCase() === 'fail';
                const value = values[test.code] || { result: '', status: 'pass' as const, remarks: '' };
                return <View key={test.code} style={styles.testCard}>
                  <View style={styles.row}>
                    <Text style={styles.testTitle}>{test.name} ({test.code}){test.mandatory === false ? ' · Optional' : ' · Mandatory'}</Text>
                    {previous && !editable ? <StatusPill label="Passed" tone="success" /> : previous ? <StatusPill label="Retest after CAPA" tone="warning" /> : null}
                  </View>
                  <Text style={styles.muted}>Acceptance: {test.specification} · Method: {test.methodReference || '—'}</Text>
                  {previous ? <Text style={styles.muted}>Previous attempt #{previous.attemptNo || 1}: {previous.result || previous.numericResult} {previous.unit || ''} · {previous.status} · {previous.testedByName || '—'}</Text> : null}
                  {editable ? <>
                    <TextInput value={value.result} onChangeText={next => updateValue(test.code, 'result', next)} placeholder="Actual observed result" placeholderTextColor={colors.text.muted} style={styles.input} />
                    <TextInput value={value.remarks} onChangeText={next => updateValue(test.code, 'remarks', next)} placeholder="Analyst remarks (optional)" placeholderTextColor={colors.text.muted} style={styles.input} />
                    <View style={styles.row}>
                      <TouchableOpacity onPress={() => updateValue(test.code, 'status', 'pass')} style={[styles.choice, value.status === 'pass' && styles.passSelected]}><Text style={styles.choiceText}>Pass</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => updateValue(test.code, 'status', 'fail')} style={[styles.choice, value.status === 'fail' && styles.failSelected]}><Text style={styles.choiceText}>Fail</Text></TouchableOpacity>
                    </View>
                  </> : null}
                </View>;
              }) : null}
              {availableTests.length === 0 && specification ? <Text style={styles.muted}>No unrecorded or failed test parameters remain for this specification.</Text> : null}
              <TouchableOpacity disabled={busy || !specification || availableTests.length === 0} onPress={submitTests} style={styles.primaryButton}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{batch?.qcStatus === 'rejected' ? 'Submit controlled retest' : 'Save QC results'}</Text>}
              </TouchableOpacity>
            </>
          ) : null}

          {mode === 'qa' ? <>
            <StatusPill label="Pending independent QA review" tone="warning" />
            <Text style={styles.muted}>QC analyst: {analystName}. Review actual results against the approved specification.</Text>
            {recorded.map((test: any, index: number) => <Text key={index} style={styles.historyText}>{test.code} · {test.result || test.numericResult} {test.unit || ''} · {test.status} · {test.testedByName || '—'}</Text>)}
            <TextInput value={qaNotes} onChangeText={setQaNotes} placeholder="Independent QA review notes (required)" placeholderTextColor={colors.text.muted} style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]} multiline />
            {sameAnalyst ? <Text style={styles.error}>The QC analyst cannot approve their own disposition. Use a different QA account.</Text> : null}
            <TouchableOpacity disabled={busy || sameAnalyst || !qaNotes.trim()} onPress={approveQc} style={styles.primaryButton}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Approve QC disposition</Text>}
            </TouchableOpacity>
          </> : null}

          {mode === 'release' ? <>
            <StatusPill label="QC approved · Market release pending" tone="success" />
            <Text style={styles.muted}>QC analyst: {analystName} · QA approver: {batch?.qcApprovedByName || '—'}</Text>
            <Text style={styles.muted}>Market release rechecks BMR approval, line clearance, retention samples, packaging reconciliation, material genealogy and closed QC CAPAs. This action is separately authorised.</Text>
            {sameAnalyst ? <Text style={styles.error}>The QC analyst cannot release the same batch.</Text> : null}
            <TouchableOpacity disabled={busy || sameAnalyst} onPress={releaseBatch} style={styles.primaryButton}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Confirm independent market release</Text>}
            </TouchableOpacity>
          </> : null}
          <View style={styles.footer}><TouchableOpacity onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryText}>Close</Text></TouchableOpacity></View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: Spacing.md },
  modal: { maxHeight: '94%', backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, gap: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  title: { ...Typography.h2, color: colors.text.primary },
  muted: { ...Typography.caption, color: colors.text.secondary, marginTop: 3 },
  error: { ...Typography.bodySm, color: colors.danger },
  closeButton: { paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md },
  closeText: { ...Typography.bodySm, color: colors.text.primary },
  fieldLabel: { ...Typography.caption, color: colors.text.secondary, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
  passSelected: { borderColor: colors.success, backgroundColor: colors.success + '18' },
  failSelected: { borderColor: colors.danger, backgroundColor: colors.danger + '18' },
  choiceText: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '700' },
  testCard: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, padding: Spacing.md, gap: 8 },
  testTitle: { ...Typography.body, color: colors.text.primary, fontWeight: '700', flex: 1 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, color: colors.text.primary, backgroundColor: colors.bg.secondary, ...Typography.body },
  primaryButton: { minHeight: 42, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...Typography.bodySm, color: '#fff', fontWeight: '800' },
  secondaryButton: { paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md },
  secondaryText: { ...Typography.bodySm, color: colors.text.primary, fontWeight: '700' },
  historyText: { ...Typography.caption, color: colors.text.primary, paddingVertical: 4 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: Spacing.sm }
});
