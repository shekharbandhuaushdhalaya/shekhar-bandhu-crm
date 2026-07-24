import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Pressable, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';
import { BatchProduction, Warehouse } from '../../../utils/api';

interface QcYield { productId: string; actualYieldQty: string; packing: string; }

interface Props {
  visible: boolean;
  selectedBatchRun: BatchProduction | null;
  warehouses: Warehouse[];
  products: any[];
  qcYieldQty: string; setQcYieldQty: (v: string) => void;
  qcPacking: string; setQcPacking: (v: string) => void;
  qcWasteQty: string; setQcWasteQty: (v: string) => void;
  qcWasteReason: string; setQcWasteReason: (v: string) => void;
  qcNotes: string; setQcNotes: (v: string) => void;
  qcPassedBy: string; setQcPassedBy: (v: string) => void;
  qcStatus: 'approved' | 'rejected'; setQcStatus: (v: 'approved' | 'rejected') => void;
  qcOrganoleptic: string; setQcOrganoleptic: (v: string) => void;
  qcMoisture: string; setQcMoisture: (v: string) => void;
  qcAsh: string; setQcAsh: (v: string) => void;
  qcPh: string; setQcPh: (v: string) => void;
  qcDisintegration: string; setQcDisintegration: (v: string) => void;
  qcHeavyMetals: string; setQcHeavyMetals: (v: string) => void;
  qcMicrobial: string; setQcMicrobial: (v: string) => void;
  qcLabReportRef: string; setQcLabReportRef: (v: string) => void;
  qcJobWorkerCertificateRef: string; setQcJobWorkerCertificateRef: (v: string) => void;
  qcCoaDocumentRef: string; setQcCoaDocumentRef: (v: string) => void;
  qcJobWorkCharges: string; setQcJobWorkCharges: (v: string) => void;
  qcWarehouseId: string; setQcWarehouseId: (v: string) => void;
  qcError: string;
  qcEnableSplit: boolean; setQcEnableSplit: (v: boolean) => void;
  qcYields: QcYield[];
  onClose: () => void;
  onComplete: () => void;
  onAddQcYieldRow: () => void;
  onRemoveQcYieldRow: (i: number) => void;
  onQcYieldChange: (i: number, key: 'productId' | 'actualYieldQty' | 'packing', val: string) => void;
}

export default function QCSignoffModal({
  visible, selectedBatchRun, warehouses, products,
  qcYieldQty, setQcYieldQty, qcPacking, setQcPacking,
  qcWasteQty, setQcWasteQty, qcWasteReason, setQcWasteReason,
  qcNotes, setQcNotes, qcPassedBy, setQcPassedBy,
  qcStatus, setQcStatus, qcOrganoleptic, setQcOrganoleptic,
  qcMoisture, setQcMoisture, qcAsh, setQcAsh, qcPh, setQcPh,
  qcDisintegration, setQcDisintegration, qcHeavyMetals, setQcHeavyMetals,
  qcMicrobial, setQcMicrobial, qcLabReportRef, setQcLabReportRef,
  qcJobWorkerCertificateRef, setQcJobWorkerCertificateRef,
  qcCoaDocumentRef, setQcCoaDocumentRef, qcJobWorkCharges, setQcJobWorkCharges,
  qcWarehouseId, setQcWarehouseId, qcError,
  qcEnableSplit, setQcEnableSplit, qcYields,
  onClose, onComplete, onAddQcYieldRow, onRemoveQcYieldRow, onQcYieldChange
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Quality Control Sign-Off</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          {qcError ? <Text style={styles.modalError}>{qcError}</Text> : null}
          <ScrollView style={styles.modalForm}>
            {/* QC Decision */}
            <Text style={styles.inputLabel}>QC Decision *</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              {(['approved', 'rejected'] as const).map(opt => (
                <TouchableOpacity
                  key={opt}
                  onPress={() => setQcStatus(opt)}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    paddingVertical: 10, borderRadius: 6, borderWidth: 1,
                    backgroundColor: qcStatus === opt ? (opt === 'approved' ? colors.success : colors.danger) : colors.bg.secondary,
                    borderColor: qcStatus === opt ? (opt === 'approved' ? colors.success : colors.danger) : colors.border
                  }}
                >
                  <Ionicons name={opt === 'approved' ? 'checkmark-circle-outline' : 'close-circle-outline'} size={16} color={qcStatus === opt ? '#fff' : (opt === 'approved' ? colors.success : colors.danger)} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: qcStatus === opt ? '#fff' : colors.text.secondary }}>
                    {opt === 'approved' ? 'APPROVE BATCH' : 'REJECT BATCH'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Actual Output Yield Size (units) *</Text>
            <TextInput style={styles.input} placeholder="e.g. 498" placeholderTextColor={colors.text.muted} value={qcYieldQty} onChangeText={setQcYieldQty} keyboardType="numeric" />

            {/* Split Yield Toggle */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 12 }}>
              <Text style={[styles.inputLabel, { marginBottom: 0 }]}>Split Yield into Multiple Sizes / Packages?</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[{ val: true, label: 'Yes' }, { val: false, label: 'No' }].map(({ val, label }) => (
                  <TouchableOpacity
                    key={label}
                    onPress={() => setQcEnableSplit(val)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, borderWidth: 1,
                      backgroundColor: qcEnableSplit === val ? (val ? colors.primary : colors.text.muted) : colors.bg.secondary,
                      borderColor: qcEnableSplit === val ? (val ? colors.primary : colors.text.muted) : colors.border
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: qcEnableSplit === val ? '#fff' : colors.text.secondary }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {qcEnableSplit && (
              <View style={{ marginBottom: 16 }}>
                <Text style={[styles.formIngredientsTitle, { fontSize: 12, marginBottom: 8 }]}>Split Quantities across Products:</Text>
                {qcYields.map((item, idx) => (
                  <View key={idx} style={[styles.bomIngredientInputRow, { gap: 6 }]}>
                    <View style={[styles.pickerWrapper, { flex: 2, marginBottom: 0 }]}>
                      {Platform.OS === 'web' ? (
                        <select value={item.productId} onChange={(e: any) => onQcYieldChange(idx, 'productId', e.target.value)} style={{ flex: 1, padding: 8, fontSize: 11, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}>
                          <option value="">-- Choose Product/Size --</option>
                          {products.map(p => <option key={p._id} value={p._id}>{p.name} ({p.size || 'Std'})</option>)}
                        </select>
                      ) : (
                        <TextInput style={styles.input} placeholder="Product ID" value={item.productId} onChangeText={(val) => onQcYieldChange(idx, 'productId', val)} />
                      )}
                    </View>
                    <TextInput style={[styles.input, { flex: 1.2, marginBottom: 0 }]} placeholder="Qty (pcs)" placeholderTextColor={colors.text.muted} value={item.actualYieldQty} onChangeText={(val) => onQcYieldChange(idx, 'actualYieldQty', val)} keyboardType="numeric" />
                    <TouchableOpacity style={styles.removeRowBtn} onPress={() => onRemoveQcYieldRow(idx)}>
                      <Ionicons name="remove-circle" size={20} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={[styles.addIngredientRowBtn, { marginTop: 8 }]} onPress={onAddQcYieldRow}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={styles.addIngredientRowBtnText}>Add Split Package</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.inputLabel}>Target Storage Warehouse (Finished Goods) *</Text>
            <View style={styles.pickerWrapper}>
              {Platform.OS === 'web' ? (
                <select value={qcWarehouseId} onChange={(e: any) => setQcWarehouseId(e.target.value)} style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}>
                  <option value="">-- Choose Warehouse --</option>
                  {warehouses.map(w => <option key={w._id} value={w._id}>{w.name} ({(w as any).city || 'Default'})</option>)}
                </select>
              ) : (
                <TextInput style={styles.input} placeholder="Warehouse ID" value={qcWarehouseId} onChangeText={setQcWarehouseId} />
              )}
            </View>

            <Text style={styles.inputLabel}>Waste / Shrinkage Quantity</Text>
            <TextInput style={styles.input} placeholder="e.g. 2 (leave empty to auto-calculate)" placeholderTextColor={colors.text.muted} value={qcWasteQty} onChangeText={setQcWasteQty} keyboardType="numeric" />

            <Text style={styles.inputLabel}>Waste / Variance Reason</Text>
            <TextInput style={styles.input} placeholder="e.g. Drying loss, spillage, QC rejects" placeholderTextColor={colors.text.muted} value={qcWasteReason} onChangeText={setQcWasteReason} />

            {/* GMP Lab Parameters */}
            <View style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, marginVertical: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>🔬 GMP Lab Specifications & Testing</Text>
              <Text style={styles.inputLabel}>Organoleptic Description</Text>
              <TextInput style={styles.input} placeholder="Color, odour, taste (e.g. Dark brown, herbal odour)" placeholderTextColor={colors.text.muted} value={qcOrganoleptic} onChangeText={setQcOrganoleptic} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Moisture Content (% w/w)</Text>
                  <TextInput style={styles.input} placeholder="e.g. 4.5" placeholderTextColor={colors.text.muted} value={qcMoisture} onChangeText={setQcMoisture} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Ash Value (% w/w)</Text>
                  <TextInput style={styles.input} placeholder="e.g. 6.2" placeholderTextColor={colors.text.muted} value={qcAsh} onChangeText={setQcAsh} keyboardType="numeric" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>pH Value</Text>
                  <TextInput style={styles.input} placeholder="e.g. 5.5" placeholderTextColor={colors.text.muted} value={qcPh} onChangeText={setQcPh} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Disintegration Time (min)</Text>
                  <TextInput style={styles.input} placeholder="e.g. 15" placeholderTextColor={colors.text.muted} value={qcDisintegration} onChangeText={setQcDisintegration} keyboardType="numeric" />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginVertical: 6 }}>
                {[{ label: 'Heavy Metals Limit', val: qcHeavyMetals, set: setQcHeavyMetals }, { label: 'Microbial Limit', val: qcMicrobial, set: setQcMicrobial }].map(({ label, val, set }) => (
                  <View key={label} style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>{label}</Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {['Pass', 'Fail'].map(opt => (
                        <TouchableOpacity
                          key={opt}
                          onPress={() => set(opt)}
                          style={{
                            flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1, alignItems: 'center',
                            backgroundColor: val === opt ? (opt === 'Pass' ? colors.success : colors.danger) : colors.bg.primary,
                            borderColor: val === opt ? (opt === 'Pass' ? colors.success : colors.danger) : colors.border
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: val === opt ? '#fff' : colors.text.secondary }}>{opt.toUpperCase()}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
              <Text style={styles.inputLabel}>Lab Report Reference No. / File Link</Text>
              <TextInput style={styles.input} placeholder="e.g. LAB-2026-07-23-01" placeholderTextColor={colors.text.muted} value={qcLabReportRef} onChangeText={setQcLabReportRef} />
              {selectedBatchRun && selectedBatchRun.productionType === 'job_work' && (
                <>
                  <Text style={styles.inputLabel}>Job Worker Batch Certificate No. *</Text>
                  <TextInput style={styles.input} placeholder="e.g. JW-CERT-88762" placeholderTextColor={colors.text.muted} value={qcJobWorkerCertificateRef} onChangeText={setQcJobWorkerCertificateRef} />
                  <Text style={styles.inputLabel}>Certificate of Analysis (COA) Document Link</Text>
                  <TextInput style={styles.input} placeholder="e.g. https://cloudinary.com/docs/coa.pdf" placeholderTextColor={colors.text.muted} value={qcCoaDocumentRef} onChangeText={setQcCoaDocumentRef} />
                  <Text style={styles.inputLabel}>Job Work Processing Service Charges (₹)</Text>
                  <TextInput style={styles.input} placeholder="e.g. 5000" placeholderTextColor={colors.text.muted} value={qcJobWorkCharges} onChangeText={setQcJobWorkCharges} keyboardType="numeric" />
                </>
              )}
            </View>

            <Text style={styles.inputLabel}>QC Inspector Name *</Text>
            <TextInput style={styles.input} placeholder="e.g. Dr. P. K. Sharma" placeholderTextColor={colors.text.muted} value={qcPassedBy} onChangeText={setQcPassedBy} />

            <Text style={styles.inputLabel}>Quality Check Notes / Lab Remarks</Text>
            <TextInput style={[styles.input, { height: 80, paddingVertical: 8 }]} placeholder="Enter quality verification notes..." placeholderTextColor={colors.text.muted} value={qcNotes} onChangeText={setQcNotes} multiline numberOfLines={3} />

            <Text style={styles.warningDisclaimer}>
              ✅ Submitting this approval will officially complete the batch, close the manufacturing run, and add the actual yield stock to the Finished Goods Warehouse.
            </Text>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={onComplete}>
              <Text style={styles.submitBtnText}>Approve & Stock</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
