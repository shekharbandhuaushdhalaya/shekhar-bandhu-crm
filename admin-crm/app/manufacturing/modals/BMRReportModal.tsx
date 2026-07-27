import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Pressable, ActivityIndicator, Platform, Alert } from 'react-native';
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

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalContainer, { maxWidth: 800, width: '90%', height: '85%' }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Batch Manufacturing Record (BMR)</Text>
              <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>GMP Quality Compliance & Costing Audit</Text>
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
              </View>

              {/* Section I: Batch Identification */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section I: Batch Identification</Text>
                </View>
                <View style={{ padding: 12, gap: 8 }}>
                  {[
                    { label: 'Batch Reference No:', val: bmrReport.batchNo },
                    { label: 'Product Name / Sku:', val: `${bmrReport.productName} (${bmrReport.productSku})` },
                    { label: 'Planned Run Qty:', val: `${bmrReport.plannedQty} bottles` },
                    { label: 'Actual Yield Output:', val: `${bmrReport.actualYieldQty} bottles`, valColor: colors.success },
                    { label: 'Manufacturing Timeline:', val: `${new Date(bmrReport.startDate).toLocaleDateString('en-IN')} ➔ ${bmrReport.endDate ? new Date(bmrReport.endDate).toLocaleDateString('en-IN') : 'Ongoing'}` }
                  ].map(({ label, val, valColor }) => (
                    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.text.secondary }}>{label}</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: valColor || colors.text.primary }}>{val}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Size-wise Yield Breakdown (multi-size batches) */}
              {bmrReport.plannedYields && bmrReport.plannedYields.length > 0 && (
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                  <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Size-wise Yield Breakdown</Text>
                  </View>
                  <View style={{ padding: 8 }}>
                    <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6 }}>
                      {['Product / Size', 'Planned Qty', 'Actual Qty', 'Variance'].map((h, i) => (
                        <Text key={h} style={{ flex: i === 0 ? 2 : 1, fontSize: 11, fontWeight: '700', color: colors.text.secondary, textAlign: i > 0 ? 'right' : 'left' }}>{h}</Text>
                      ))}
                    </View>
                    {bmrReport.plannedYields.map((py: any, idx: number) => {
                      const actual = bmrReport.yields?.find((y: any) => y.productId === py.productId);
                      const actualQty = actual ? actual.actualYieldQty : 0;
                      const variance = py.plannedQty > 0 ? (((actualQty - py.plannedQty) / py.plannedQty) * 100).toFixed(1) : '0.0';
                      const isDown = parseFloat(variance) < 0;
                      return (
                        <View key={idx} style={{ flexDirection: 'row', paddingVertical: 4 }}>
                          <Text style={{ flex: 2, fontSize: 11, color: colors.text.primary }}>{py.productName || py.productId} ({py.size || 'Std'})</Text>
                          <Text style={{ flex: 1, fontSize: 11, color: colors.text.primary, textAlign: 'right' }}>{py.plannedQty}</Text>
                          <Text style={{ flex: 1, fontSize: 11, color: colors.text.primary, textAlign: 'right' }}>{actualQty}</Text>
                          <Text style={{ flex: 1, fontSize: 11, color: isDown ? colors.danger : colors.success, textAlign: 'right', fontWeight: '600' }}>{isDown ? '' : '+'}{variance}%</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Section II: Financial Audit */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section II: Financial Audit & Production Costing</Text>
                </View>
                <View style={{ padding: 12, gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: colors.text.secondary }}>Total Raw Material Input Cost:</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>₹{(bmrReport.rawMaterialCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                  </View>
                  {bmrReport.overheadCost > 0 && (
                    <>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: colors.text.secondary }}>Allocated Process Overhead Cost:</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>₹{bmrReport.overheadCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: colors.text.secondary }}>Total Batch Production Cost:</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>₹{(bmrReport.rawMaterialCost + bmrReport.overheadCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                      </View>
                    </>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: colors.text.secondary }}>Calculated Production Unit Cost:</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>₹{(bmrReport.unitProductionCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} / unit</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 13, color: colors.text.secondary }}>Product MSRP Retail Price:</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>₹{(bmrReport.productPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} / unit</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>Gross Manufacturing Profit Margin:</Text>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: colors.success }}>
                      {bmrReport.productPrice > 0 && bmrReport.unitProductionCost > 0
                        ? (((bmrReport.productPrice - bmrReport.unitProductionCost) / bmrReport.productPrice) * 100).toFixed(1)
                        : 0}%
                    </Text>
                  </View>
                </View>
              </View>

              {/* Section III: Consumed Ingredients */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section III: Consumed Raw Ingredients Details</Text>
                </View>
                <View style={{ padding: 8 }}>
                  <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6 }}>
                    {['Ingredient', 'Batch No', 'Qty', 'Rate', 'Total Cost'].map((h, i) => (
                      <Text key={h} style={{ flex: i === 0 || i === 1 ? 1.5 : 1.2, fontSize: 11, fontWeight: '700', color: colors.text.secondary, textAlign: i > 1 ? 'right' : 'left' }}>{h}</Text>
                    ))}
                  </View>
                  {bmrReport.ingredients.map((ing: any, idx: number) => (
                    <View key={idx} style={{ flexDirection: 'row', paddingVertical: 4 }}>
                      <Text style={{ flex: 2, fontSize: 11, color: colors.text.primary }} numberOfLines={1}>{ing.name}</Text>
                      <Text style={{ flex: 1.5, fontSize: 11, color: colors.text.primary }}>{ing.batchNo}</Text>
                      <Text style={{ flex: 1.2, fontSize: 11, color: colors.text.primary, textAlign: 'right' }}>{ing.qtyConsumed} {ing.unit}</Text>
                      <Text style={{ flex: 1.2, fontSize: 11, color: colors.text.primary, textAlign: 'right' }}>₹{ing.purchaseRate}</Text>
                      <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '600', color: colors.text.primary, textAlign: 'right' }}>₹{ing.itemCost.toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Section IV: Process Execution Log */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section IV: Detailed Process Execution Log</Text>
                </View>
                <View style={{ padding: 8 }}>
                  <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6 }}>
                    {[{ label: 'Stage / Process Step', flex: 1.5 }, { label: 'Status', flex: 1 }, { label: 'Operator Sign-Off', flex: 1.5 }, { label: 'Notes / Justification', flex: 2 }].map(({ label, flex }) => (
                      <Text key={label} style={{ flex, fontSize: 11, fontWeight: '700', color: colors.text.secondary }}>{label}</Text>
                    ))}
                  </View>
                  {bmrReport.stages && bmrReport.stages.map((st: any, idx: number) => {
                    const fmt = (val: any) => val ? new Date(val).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '—';
                    return (
                      <View key={idx} style={{ paddingVertical: 6, borderBottomWidth: idx === bmrReport.stages.length - 1 ? 0 : 0.5, borderBottomColor: colors.border }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '700', color: colors.text.primary }} numberOfLines={1}>{st.name}</Text>
                          <Text style={{ flex: 1, fontSize: 11, color: st.status === 'completed' ? colors.success : st.status === 'skipped' ? colors.warning : colors.text.muted, fontWeight: '600' }}>{st.status.toUpperCase()}</Text>
                          <Text style={{ flex: 1.5, fontSize: 11, color: colors.text.primary }}>{st.completedBy || '—'}</Text>
                          <Text style={{ flex: 2, fontSize: 10, color: colors.text.secondary, fontStyle: 'italic' }}>{st.notes || 'No remarks recorded'}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                          <Text style={{ fontSize: 9, color: colors.text.muted }}>Started: {fmt(st.startedAt)}</Text>
                          <Text style={{ fontSize: 9, color: colors.text.muted }}>Finished: {fmt(st.completedAt)}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Section V: QC Sign-Off */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section V: GMP Quality Assurance Sign-Off</Text>
                  <View style={{ backgroundColor: bmrReport.qcStatus === 'rejected' ? colors.danger : colors.success, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>{bmrReport.qcStatus === 'rejected' ? 'REJECTED' : 'APPROVED'}</Text>
                  </View>
                </View>
                <View style={{ padding: 12, gap: 8 }}>
                  {bmrReport.qcParameters && (
                    <View style={{ backgroundColor: colors.bg.primary, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.border, gap: 6, marginBottom: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.text.secondary, letterSpacing: 0.5 }}>🔬 LABORATORY TEST SPECIFICATIONS SUMMARY</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                        {[
                          bmrReport.qcParameters.organoleptic && { label: 'Organoleptic Check', val: bmrReport.qcParameters.organoleptic },
                          bmrReport.qcParameters.moistureContent !== null && { label: 'Moisture Content', val: `${bmrReport.qcParameters.moistureContent}% w/w` },
                          bmrReport.qcParameters.ashValue !== null && { label: 'Ash Value', val: `${bmrReport.qcParameters.ashValue}% w/w` },
                          bmrReport.qcParameters.pHValue !== null && { label: 'pH Value', val: `${bmrReport.qcParameters.pHValue}` },
                          bmrReport.qcParameters.disintegrationTime !== null && { label: 'Disintegration Time', val: `${bmrReport.qcParameters.disintegrationTime} mins` },
                          bmrReport.qcParameters.labReportRef && { label: 'Lab Report Ref No', val: bmrReport.qcParameters.labReportRef },
                        ].filter(Boolean).map((item: any) => (
                          <View key={item.label} style={{ minWidth: 160, flex: 1 }}>
                            <Text style={{ fontSize: 11, color: colors.text.secondary }}>{item.label}: <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{item.val}</Text></Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                  <Text style={{ fontSize: 12, color: colors.text.primary }}><Text style={{ fontWeight: '700' }}>QC Inspector Remarks: </Text>{bmrReport.qcNotes}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 8 }}>
                    <Text style={{ fontSize: 11, color: colors.text.secondary }}>Inspector: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{bmrReport.qcPassedBy}</Text></Text>
                    <Text style={{ fontSize: 11, color: colors.text.secondary }}>Signature: <Text style={{ fontFamily: 'serif', fontStyle: 'italic', fontWeight: '700', color: colors.primary }}>{bmrReport.qcPassedBy}</Text></Text>
                  </View>
                </View>
              </View>
              {/* Section VI: Costed BOM Versioning (Snapshot at Launch) */}
              {bmrReport.bomSnapshot && (
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                  <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section VI: Costed BOM Versioning</Text>
                  </View>
                  <View style={{ padding: 12, gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.text.secondary }}>Recipe Name:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{bmrReport.bomSnapshot.recipeName || 'N/A'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.text.secondary }}>Recipe Version:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{bmrReport.bomSnapshot.recipeVersion || 'N/A'}</Text>
                    </View>
                    {bmrReport.bomSnapshot.ingredients && bmrReport.bomSnapshot.ingredients.length > 0 && (
                      <View style={{ marginTop: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.secondary, marginBottom: 4 }}>Snapshotted Formulation (at launch):</Text>
                        <View style={{ padding: 6, backgroundColor: colors.bg.primary, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                          <View style={{ flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 4 }}>
                            {['Ingredient', 'Qty Required', 'Type'].map(h => (
                              <Text key={h} style={{ flex: 1, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>{h}</Text>
                            ))}
                          </View>
                          {bmrReport.bomSnapshot.ingredients.map((ing: any, idx: number) => (
                            <View key={idx} style={{ flexDirection: 'row', paddingVertical: 2 }}>
                              <Text style={{ flex: 1, fontSize: 11, color: colors.text.primary }}>{ing.rawMaterialId?.name || ing.rawMaterialId || 'Unknown'}</Text>
                              <Text style={{ flex: 1, fontSize: 11, color: colors.text.primary }}>{ing.qtyRequired}</Text>
                              <Text style={{ flex: 1, fontSize: 11, color: colors.text.secondary }}>{ing.itemType}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                    {bmrReport.bomSnapshot.stages && bmrReport.bomSnapshot.stages.length > 0 && (
                      <View style={{ marginTop: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.secondary, marginBottom: 4 }}>Planned Stages (at launch):</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {bmrReport.bomSnapshot.stages.map((st: any, idx: number) => (
                            <View key={idx} style={{ backgroundColor: colors.bg.primary, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: colors.border }}>
                              <Text style={{ fontSize: 10, color: colors.text.primary }}>{st.name}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              )}
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