import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';
import { FIRM_DETAILS } from '../../../constants/firm';

interface Props {
  visible: boolean;
  loadingBmr: boolean;
  bmrReport: any;
  onClose: () => void;
  onPrint: () => void;
}

export default function BMRReportModal({ visible, loadingBmr, bmrReport, onClose, onPrint }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-IN') : '—';
  const fmtDateTime = (d: any) => d ? new Date(d).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '—';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalContainer, { maxWidth: 840, width: '92%', height: '88%' }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Batch Manufacturing Record (BMR)</Text>
              <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>GMP Quality Compliance & Pharmacopoeial Audit</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {loadingBmr ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : bmrReport ? (
            <ScrollView style={[styles.modalForm, { padding: 16 }]} contentContainerStyle={{ gap: 16 }}>
              {/* Header branding */}
              <View style={{ alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 12, marginBottom: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>{FIRM_DETAILS.name}</Text>
                <Text style={{ fontSize: 10, color: colors.text.secondary, marginTop: 2 }}>{FIRM_DETAILS.address}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary, marginTop: 8, letterSpacing: 0.5 }}>OFFICIAL BATCH RECORD SUMMARY</Text>
                {bmrReport.bomSnapshot?.formulationStandardRef ? (
                  <Text style={{ fontSize: 11, fontStyle: 'italic', color: colors.primary, marginTop: 2 }}>
                    Standard Ref: {bmrReport.bomSnapshot.formulationStandardRef}
                  </Text>
                ) : null}
              </View>

              {/* Section I: Batch Identification */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section I: Batch Identification & Shelf Life</Text>
                </View>
                <View style={{ padding: 12, gap: 8 }}>
                  {[
                    { label: 'Batch Reference No:', val: bmrReport.batchNo },
                    { label: 'Product Name / SKU:', val: `${bmrReport.productName} (${bmrReport.productSku})` },
                    { label: 'Planned Run Qty:', val: `${bmrReport.plannedQty} units` },
                    { label: 'Actual Yield Output:', val: `${bmrReport.actualYieldQty} units`, valColor: colors.success },
                    { label: 'Mfg Date / Expiry Date:', val: `${fmtDate(bmrReport.mfgDate)} ➔ ${fmtDate(bmrReport.expiryDate)} (${bmrReport.shelfLifeMonths || 36} Months)` },
                    { label: 'Manufacturing Timeline:', val: `${fmtDate(bmrReport.startDate)} ➔ ${bmrReport.endDate ? fmtDate(bmrReport.endDate) : 'Ongoing'}` }
                  ].map(({ label, val, valColor }) => (
                    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.text.secondary }}>{label}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: valColor || colors.text.primary }}>{val}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Section II: Raw Material Identity & Pharmacopoeial Compliance */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section II: Raw Material Identity & Pharmacopoeial Compliance</Text>
                </View>
                <View style={{ padding: 8 }}>
                  <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6 }}>
                    {['Ingredient / Botanical Name', 'Part Used', 'Batch No', 'Standard / Monograph'].map((h, i) => (
                      <Text key={h} style={{ flex: i === 0 ? 2 : 1.2, fontSize: 11, fontWeight: '700', color: colors.text.secondary }}>{h}</Text>
                    ))}
                  </View>
                  {bmrReport.ingredients && bmrReport.ingredients.map((ing: any, idx: number) => (
                    <View key={idx} style={{ flexDirection: 'row', paddingVertical: 4 }}>
                      <View style={{ flex: 2 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.primary }}>{ing.name}</Text>
                        <Text style={{ fontSize: 10, fontStyle: 'italic', color: colors.text.secondary }}>{ing.botanicalName || 'Botanical name not specified'}</Text>
                      </View>
                      <Text style={{ flex: 1.2, fontSize: 11, color: colors.text.primary }}>{ing.partUsed || 'Not specified'}</Text>
                      <Text style={{ flex: 1.2, fontSize: 11, color: colors.text.primary }}>{ing.batchNo}</Text>
                      <View style={{ flex: 1.2 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>{ing.pharmacopoeialStandard || 'API'}</Text>
                        <Text style={{ fontSize: 9, color: colors.text.muted }}>{ing.monographRef || 'N/A'}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Section III: Consumed Raw Ingredients Costing */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section III: Consumed Raw Ingredients Details & Costing</Text>
                </View>
                <View style={{ padding: 8 }}>
                  <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6 }}>
                    {['Ingredient', 'Batch No', 'Qty Consumed', 'Rate', 'Item Cost'].map((h, i) => (
                      <Text key={h} style={{ flex: i === 0 ? 2 : 1.2, fontSize: 11, fontWeight: '700', color: colors.text.secondary, textAlign: i > 1 ? 'right' : 'left' }}>{h}</Text>
                    ))}
                  </View>
                  {bmrReport.ingredients && bmrReport.ingredients.map((ing: any, idx: number) => (
                    <View key={idx} style={{ flexDirection: 'row', paddingVertical: 4 }}>
                      <Text style={{ flex: 2, fontSize: 11, color: colors.text.primary }} numberOfLines={1}>{ing.name}</Text>
                      <Text style={{ flex: 1.2, fontSize: 11, color: colors.text.primary }}>{ing.batchNo}</Text>
                      <Text style={{ flex: 1.2, fontSize: 11, color: colors.text.primary, textAlign: 'right' }}>{ing.qtyConsumed} {ing.unit}</Text>
                      <Text style={{ flex: 1.2, fontSize: 11, color: colors.text.primary, textAlign: 'right' }}>₹{ing.purchaseRate}</Text>
                      <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '600', color: colors.text.primary, textAlign: 'right' }}>₹{(ing.itemCost || 0).toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Section IV: Detailed Process Execution Log */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section IV: Detailed Process Execution & Verification Log</Text>
                </View>
                <View style={{ padding: 8 }}>
                  <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6 }}>
                    {[{ label: 'Process Stage', flex: 1.5 }, { label: 'Status', flex: 1 }, { label: 'Performed By', flex: 1.5 }, { label: 'Verified By (4-Eye)', flex: 1.5 }].map(({ label, flex }) => (
                      <Text key={label} style={{ flex, fontSize: 11, fontWeight: '700', color: colors.text.secondary }}>{label}</Text>
                    ))}
                  </View>
                  {bmrReport.stages && bmrReport.stages.map((st: any, idx: number) => (
                    <View key={idx} style={{ paddingVertical: 6, borderBottomWidth: idx === bmrReport.stages.length - 1 ? 0 : 0.5, borderBottomColor: colors.border }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '700', color: colors.text.primary }} numberOfLines={1}>{st.name}</Text>
                        <Text style={{ flex: 1, fontSize: 11, color: st.status === 'completed' ? colors.success : st.status === 'skipped' ? colors.warning : colors.text.muted, fontWeight: '600' }}>{st.status.toUpperCase()}</Text>
                        <Text style={{ flex: 1.5, fontSize: 11, color: colors.text.primary }}>{st.performedByName || st.completedBy || '—'}</Text>
                        <Text style={{ flex: 1.5, fontSize: 11, color: st.verifiedByName ? colors.success : colors.text.muted, fontWeight: '600' }}>{st.verifiedByName ? `${st.verifiedByName} (${fmtDate(st.verifiedAt)})` : 'Pending Verification'}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Section V: QC Specifications & Limits */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section V: QC Laboratory Testing Specifications & Limits</Text>
                  <View style={{ backgroundColor: bmrReport.qcStatus === 'rejected' ? colors.danger : colors.success, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{bmrReport.qcStatus === 'rejected' ? 'REJECTED' : 'APPROVED'}</Text>
                  </View>
                </View>
                <View style={{ padding: 12, gap: 8 }}>
                  {bmrReport.qcParameters && (
                    <View style={{ backgroundColor: colors.bg.primary, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.border, gap: 6, marginBottom: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.text.secondary, letterSpacing: 0.5 }}>🔬 PARAMETER SPECIFICATIONS VS TEST RESULTS</Text>
                      <View style={{ gap: 4, marginTop: 4 }}>
                        {[
                          bmrReport.qcParameters.organoleptic && { label: 'Organoleptic', val: bmrReport.qcParameters.organoleptic, limit: 'Standard' },
                          bmrReport.qcParameters.moistureContent !== null && { label: 'Moisture Content', val: `${bmrReport.qcParameters.moistureContent}% w/w`, limit: bmrReport.qcParameters.moistureLimit || 'NMT 10% w/w' },
                          bmrReport.qcParameters.ashValue !== null && { label: 'Ash Value', val: `${bmrReport.qcParameters.ashValue}% w/w`, limit: bmrReport.qcParameters.ashValueLimit || 'NMT 5% w/w' },
                          bmrReport.qcParameters.pHValue !== null && { label: 'pH Value', val: `${bmrReport.qcParameters.pHValue}`, limit: bmrReport.qcParameters.pHLimit || '4.0 - 7.0' },
                          bmrReport.qcParameters.disintegrationTime !== null && { label: 'Disintegration Time', val: `${bmrReport.qcParameters.disintegrationTime} mins`, limit: bmrReport.qcParameters.disintegrationLimit || 'NMT 30 mins' },
                        ].filter(Boolean).map((item: any) => (
                          <View key={item.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 11, color: colors.text.secondary }}>{item.label}: <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{item.val}</Text></Text>
                            <Text style={{ fontSize: 10, color: colors.text.muted }}>Limit: {item.limit}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  <Text style={{ fontSize: 12, color: colors.text.primary }}><Text style={{ fontWeight: '700' }}>QC Inspector Remarks: </Text>{bmrReport.qcNotes}</Text>
                </View>
              </View>

              {/* Section VI: Authenticated Signatures & Market Release */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section VI: Authenticated Maker-Checker & Market Release Signatures</Text>
                </View>
                <View style={{ padding: 12, gap: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 11, color: colors.text.secondary }}>QC Inspector Sign-Off:</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>{bmrReport.qcPassedBy || 'Pending'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 11, color: colors.text.secondary }}>Authorized Quality Market Releaser:</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: bmrReport.releasedByName ? colors.success : colors.warning }}>
                      {bmrReport.releasedByName ? `${bmrReport.releasedByName} (${fmtDateTime(bmrReport.releasedAt)})` : 'Pending Market Release'}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: colors.text.secondary }}>Failed to display report details.</Text>
            </View>
          )}

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
            {bmrReport && (
              <TouchableOpacity style={styles.submitBtn} onPress={onPrint}>
                <Ionicons name="print-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.submitBtnText}>Print PDF Record</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}