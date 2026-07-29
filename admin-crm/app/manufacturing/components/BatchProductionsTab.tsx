import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';

interface Props {
  batches: any[];
  products: any[];
  warehouses: any[];
  expandedBatchIds: Record<string, boolean>;
  toggleBatchExpanded: (id: string) => void;
  onStartProductionBatch: () => void;
  onTraceBatch: (batchNo: string) => void;
  onAdvanceStage: (batchId: string, idx: number) => void;
  onSkipStage: (batchId: string, idx: number) => void;
  onFailStage: (batchId: string, idx: number) => void;
  onDeleteBatchDoc: (batchId: string, docUrl: string) => void;
  onUploadBatchDoc: (batchId: string) => void;
  onOpenBMR: (batchId: string) => void;
  onCancelProduction: (batchId: string) => void;
  onQcSignOff: (batch: any) => void;
  isIntegerQty: (unit: string, category: string) => boolean;
  getStatusColor: (status: string) => string;
}

export default function BatchProductionsTab({
  batches, products, warehouses, expandedBatchIds, toggleBatchExpanded,
  onStartProductionBatch, onTraceBatch, onAdvanceStage, onSkipStage, onFailStage,
  onDeleteBatchDoc, onUploadBatchDoc, onOpenBMR, onCancelProduction, onQcSignOff,
  isIntegerQty, getStatusColor
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.tabContent}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Active & Finished Production Runs</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={onStartProductionBatch}>
          <Ionicons name="play-outline" size={16} color="#fff" />
          <Text style={styles.primaryBtnText}>Start Production Batch</Text>
        </TouchableOpacity>
      </View>

      {batches.map(batch => {
        const isFinished = batch.status === 'completed';
        const isCancelled = batch.status === 'cancelled';
        const isInProgress = batch.status === 'in_progress';
        const isQcHold = batch.status === 'qc_hold';

        const productPrice = batch.productId && typeof batch.productId === 'object' ? batch.productId.price || 0 : 0;
        const hasCosting = batch.rawMaterialCost !== undefined;
        const hasUnitCost = isFinished && batch.unitProductionCost !== undefined && batch.unitProductionCost > 0;
        const grossMargin = hasUnitCost && productPrice > 0 && batch.unitProductionCost !== undefined
          ? Math.max(0, ((productPrice - batch.unitProductionCost) / productPrice) * 100)
          : 0;

        return (
          <View key={batch._id} style={[styles.card, { marginBottom: 12 }]}>
            <View style={styles.batchCardHeader}>
              <View>
                <Text style={styles.batchTitle}>
                  {batch.productId && typeof batch.productId === 'object' ? batch.productId.name : 'Product'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.batchSubNo}>Batch No: {batch.batchNo} {batch.manufacturingUnitName ? `· Unit: ${batch.manufacturingUnitName}` : ''}</Text>
                  <TouchableOpacity style={{ padding: 2 }} onPress={() => onTraceBatch(batch.batchNo)}>
                    <Ionicons name="git-network-outline" size={13} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.statusBadge, { borderColor: getStatusColor(batch.status), backgroundColor: getStatusColor(batch.status) + '10' }]}>
                <Text style={[styles.statusBadgeText, { color: getStatusColor(batch.status) }]}>
                  {batch.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Planned Sizes (multi-size batch) */}
            {batch.plannedYields?.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                {batch.plannedYields.map((py: any, idx: number) => {
                  const pId = typeof py.productId === 'object' ? py.productId._id || py.productId : py.productId;
                  const prod = products.find(p => p._id === pId);
                  return (
                    <View key={idx} style={{ backgroundColor: colors.primary + '15', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: colors.primary }}>
                        {prod ? `${prod.size || prod.name}` : '?'}: {py.plannedQty}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Essential Key Metrics Bar */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, backgroundColor: colors.bg.secondary, padding: 10, borderRadius: 8, marginVertical: 8 }}>
              <View style={{ flex: 1, minWidth: 90 }}>
                <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: '700' }}>OUTPUT QTY</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text.primary }}>
                  {isFinished ? `${batch.actualYieldQty} / ${batch.plannedQty} Pcs` : `${batch.plannedQty} Pcs`}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 100 }}>
                <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: '700' }}>TOTAL COST</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.warning }}>
                  ₹{((batch.rawMaterialCost || 0) + (batch.overheadCost || 0)).toFixed(2)}
                  {hasUnitCost ? ` (₹${batch.unitProductionCost?.toFixed(2)}/pc)` : ''}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 90 }}>
                <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: '700' }}>STARTED</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.secondary }}>
                  {batch.startDate ? new Date(batch.startDate).toLocaleDateString('en-IN') : '—'}
                </Text>
              </View>
              {batch.qcPassedBy ? (
                <View style={{ flex: 1, minWidth: 110 }}>
                  <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: '700' }}>QC INSPECTOR</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.success }} numberOfLines={1}>
                    ✓ {batch.qcPassedBy}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Full-Width Connected Timeline Stepper */}
            {batch.stages && batch.stages.length > 0 && (
              <View style={{ marginVertical: 12, width: '100%' }}>
                <View style={{ position: 'relative', width: '100%', paddingHorizontal: 10, minHeight: 65 }}>
                  {/* Background & Active Progress Connecting Lines (Strictly bounded between first and last dot center) */}
                  {(() => {
                    const N = batch.stages.length;
                    if (N < 2) return null;
                    const stepPct = 100 / N;
                    const startLeftPct = stepPct / 2;
                    const totalLineWidthPct = ((N - 1) / N) * 100;

                    const lastDoneIdx = batch.stages.reduce((acc: number, s: any, i: number) => (s.status === 'completed' || s.status === 'skipped' || s.status === 'in_progress') ? i : acc, 0);
                    const activeWidthPct = (lastDoneIdx / (N - 1)) * totalLineWidthPct;

                    return (
                      <>
                        {/* Background Line */}
                        <View style={{
                          position: 'absolute',
                          top: 11,
                          left: `${startLeftPct}%`,
                          width: `${totalLineWidthPct}%`,
                          height: 3,
                          backgroundColor: colors.border,
                          borderRadius: 2,
                          zIndex: 1
                        }} />
                        {/* Active Progress Line */}
                        <View style={{
                          position: 'absolute',
                          top: 11,
                          left: `${startLeftPct}%`,
                          width: `${Math.min(totalLineWidthPct, activeWidthPct)}%`,
                          height: 3,
                          backgroundColor: colors.success,
                          borderRadius: 2,
                          zIndex: 2
                        }} />
                      </>
                    );
                  })()}

                  {/* Stage Step Nodes */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 3, width: '100%' }}>
                    {batch.stages.map((stage: any, sIdx: number) => {
                      const isStageCompleted = stage.status === 'completed';
                      const isSkipped = stage.status === 'skipped';
                      const isFailed = stage.status === 'failed';
                      const isActive = stage.status === 'in_progress';
                      const isInProgress = batch.status === 'in_progress' && stage.status === 'in_progress';

                      const dotBgColor = isStageCompleted ? colors.success : (isSkipped ? colors.warning : (isFailed ? colors.danger : (isActive ? colors.primary : colors.bg.card)));
                      const borderColor = isStageCompleted ? colors.success : (isSkipped ? colors.warning : (isFailed ? colors.danger : (isActive ? colors.primary : colors.border)));

                      return (
                        <TouchableOpacity
                          key={sIdx}
                          style={{ flex: 1, alignItems: 'center', minWidth: 40 }}
                          disabled={!isInProgress}
                          onPress={() => onAdvanceStage(batch._id, sIdx)}
                        >
                          {/* Connected Dot Node */}
                          <View style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: dotBgColor,
                            borderWidth: 2,
                            borderColor: borderColor,
                            alignItems: 'center',
                            justifyContent: 'center',
                            elevation: isActive ? 3 : 0
                          }}>
                            {isStageCompleted ? (
                              <Ionicons name="checkmark" size={12} color="#fff" />
                            ) : isSkipped ? (
                              <Ionicons name="play-forward" size={10} color="#fff" />
                            ) : isFailed ? (
                              <Ionicons name="close" size={12} color="#fff" />
                            ) : isActive ? (
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
                            ) : null}
                          </View>

                          {/* Stage Title Label */}
                          <Text style={{
                            fontSize: 10,
                            fontWeight: isActive ? '800' : (isStageCompleted ? '700' : '500'),
                            color: isActive ? colors.primary : (isStageCompleted ? colors.text.primary : colors.text.muted),
                            textAlign: 'center',
                            marginTop: 6,
                            lineHeight: 12
                          }} numberOfLines={2}>
                            {stage.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* Active stage action buttons — prominent & discoverable */}
                {batch.status === 'in_progress' && (() => {
                  const activeIdx = batch.stages.findIndex((s: any) => s.status === 'in_progress');
                  if (activeIdx === -1) return null;
                  const activeStageName = batch.stages[activeIdx].name;
                  return (
                    <View style={{ marginTop: 10, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      <TouchableOpacity
                        style={{ flex: 2, minWidth: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.success }}
                        onPress={() => onAdvanceStage(batch._id, activeIdx)}
                      >
                        <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                          Complete: {activeStageName}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, minWidth: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.warning + '20', borderWidth: 1, borderColor: colors.warning }}
                        onPress={() => onSkipStage(batch._id, activeIdx)}
                      >
                        <Ionicons name="play-forward-outline" size={14} color={colors.warning} />
                        <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '700' }}>Skip</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, minWidth: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger }}
                        onPress={() => onFailStage(batch._id, activeIdx)}
                      >
                        <Ionicons name="close-circle-outline" size={14} color={colors.danger} />
                        <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700' }}>Fail</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })()}
              </View>
            )}

            {/* Collapsible Details Toggle (Consumed Raw Materials & Stage Logs) */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6 }}
              onPress={() => toggleBatchExpanded(batch._id)}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>
                {expandedBatchIds[batch._id] ? 'Hide Materials & Operator Logs' : `View Materials Consumed (${batch.ingredientsConsumed.length}) & Logs`}
              </Text>
              <Ionicons name={expandedBatchIds[batch._id] ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
            </TouchableOpacity>

            {/* Collapsible Drawer Body */}
            {expandedBatchIds[batch._id] && (
              <View style={{ backgroundColor: colors.bg.secondary, padding: 10, borderRadius: 6, marginTop: 4, gap: 8 }}>
                {batch.stages.some((s: any) => s.status === 'completed' || s.status === 'skipped') && (
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Operator Audit Log:</Text>
                    {batch.stages
                      .filter((s: any) => s.status === 'completed' || s.status === 'skipped')
                      .map((s: any, idx: number) => (
                        <Text key={idx} style={{ fontSize: 10, color: colors.text.secondary }}>
                          • <Text style={{ fontWeight: '700', color: colors.text.primary }}>{s.name}</Text>: {s.status === 'completed' ? 'Completed' : 'Skipped'} by <Text style={{ color: colors.primary, fontWeight: '600' }}>{s.completedBy || 'Operator'}</Text>
                          {s.notes ? ` — "${s.notes}"` : ''}
                        </Text>
                      ))}
                  </View>
                )}

                {batch.ingredientsConsumed.length > 0 && (
                  <View style={{ gap: 3 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Raw Materials Consumed (FIFO):</Text>
                    {batch.ingredientsConsumed.map((ing: any, idx: number) => (
                      <Text key={idx} style={{ fontSize: 10, color: colors.text.secondary }}>
                        • {ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.name : 'Material'} (Batch: {ing.batchNo}) — {(() => {
                          const r = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId : null;
                          return r && isIntegerQty(r.unit, r.category) ? ing.qtyConsumed.toFixed(0) : ing.qtyConsumed.toFixed(2);
                        })()} {ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.unit : ''}
                      </Text>
                    ))}
                  </View>
                )}

                {/* QC Parameters Log */}
                {batch.qcParameters && (
                  <View style={{ gap: 4, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>🔬 QC Testing Parameters Log:</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                      {batch.qcParameters.organoleptic ? (
                        <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Organoleptic: <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{batch.qcParameters.organoleptic}</Text></Text></View>
                      ) : null}
                      {batch.qcParameters.moistureContent !== null ? (
                        <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Moisture: <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{batch.qcParameters.moistureContent}% w/w</Text></Text></View>
                      ) : null}
                      {batch.qcParameters.ashValue !== null ? (
                        <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Ash Value: <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{batch.qcParameters.ashValue}% w/w</Text></Text></View>
                      ) : null}
                      {batch.qcParameters.pHValue !== null ? (
                        <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>pH: <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{batch.qcParameters.pHValue}</Text></Text></View>
                      ) : null}
                      {batch.qcParameters.disintegrationTime !== null ? (
                        <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Disintegration: <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{batch.qcParameters.disintegrationTime} mins</Text></Text></View>
                      ) : null}
                      {batch.qcParameters.heavyMetals ? (
                        <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Heavy Metals: <Text style={{ color: batch.qcParameters.heavyMetals === 'Pass' ? colors.success : colors.danger, fontWeight: '800' }}>{batch.qcParameters.heavyMetals}</Text></Text></View>
                      ) : null}
                      {batch.qcParameters.microbialLimit ? (
                        <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Microbial: <Text style={{ color: batch.qcParameters.microbialLimit === 'Pass' ? colors.success : colors.danger, fontWeight: '800' }}>{batch.qcParameters.microbialLimit}</Text></Text></View>
                      ) : null}
                      {batch.qcParameters.labReportRef ? (
                        <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Lab Ref: <Text style={{ color: colors.primary, fontWeight: '700' }}>{batch.qcParameters.labReportRef}</Text></Text></View>
                      ) : null}
                    </View>
                  </View>
                )}

                {/* Supporting Documents Vault */}
                <View style={{ gap: 6, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>📎 Supporting Documents & Certification:</Text>

                  {batch.supportingDocuments && batch.supportingDocuments.length > 0 ? (
                    <View style={{ gap: 4, marginTop: 2 }}>
                      {batch.supportingDocuments.map((doc: any, docIdx: number) => (
                        <View key={docIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg.primary, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                          <TouchableOpacity onPress={() => Platform.OS === 'web' ? window.open(doc.url, '_blank') : Alert.alert('View Document', doc.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                            <Ionicons name="document-attach-outline" size={13} color={colors.primary} />
                            <Text style={{ fontSize: 10.5, color: colors.text.primary, fontWeight: '600' }} numberOfLines={1}>{doc.name}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => onDeleteBatchDoc(batch._id, doc.url)} style={{ padding: 2 }}>
                            <Ionicons name="trash-outline" size={12} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 10, color: colors.text.muted, fontStyle: 'italic' }}>No supporting documents uploaded.</Text>
                  )}
                </View>
              </View>
            )}

            {isFinished && !!batch.qcNotes && (
              <View style={[styles.qcBox, { marginTop: 6, marginBottom: 4 }]}>
                <Text style={styles.qcBoxText}>QC Note: {batch.qcNotes}</Text>
              </View>
            )}

            {/* Action Controls */}
            {isQcHold && (
              <View style={{ marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: colors.warning + '15', borderWidth: 1, borderColor: colors.warning, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Ionicons name="flask-outline" size={15} color={colors.warning} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: colors.warning }}>ALL STAGES COMPLETE — QC SIGN-OFF REQUIRED</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.text.secondary }}>All manufacturing stages are done. Complete QC inspection to inward finished stock into inventory.</Text>
              </View>
            )}
            {/* Action Controls Row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
              {/* Left Side: Report & Genealogy Actions */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {isFinished && (
                  <TouchableOpacity
                    style={[styles.outlineBtn, { paddingVertical: 6, paddingHorizontal: 12 }]}
                    onPress={() => onOpenBMR(batch._id)}
                  >
                    <Ionicons name="document-text-outline" size={15} color={colors.primary} />
                    <Text style={styles.outlineBtnText}>BMR Report</Text>
                  </TouchableOpacity>
                )}
                {!isCancelled && (
                  <>
                    <TouchableOpacity
                      style={[styles.outlineBtn, { paddingVertical: 6, paddingHorizontal: 12, borderColor: colors.primary }]}
                      onPress={() => onTraceBatch(batch.batchNo)}
                    >
                      <Ionicons name="list-outline" size={15} color={colors.primary} />
                      <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Stock Trace & Genealogy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.outlineBtn, { paddingVertical: 6, paddingHorizontal: 12, borderColor: colors.success }]}
                      onPress={() => onUploadBatchDoc(batch._id)}
                    >
                      <Ionicons name="cloud-upload-outline" size={15} color={colors.success} />
                      <Text style={[styles.outlineBtnText, { color: colors.success }]}>Upload Doc</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Right Side: Active Process State Actions */}
              {(isInProgress || isQcHold) && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={styles.cancelBatchBtn} onPress={() => onCancelProduction(batch._id)}>
                    <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
                    <Text style={styles.cancelBatchBtnText}>Cancel & Revert Stock</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.completeBatchBtn} onPress={() => onQcSignOff(batch)}>
                    <Ionicons name="checkmark-done-circle-outline" size={15} color="#fff" />
                    <Text style={styles.completeBatchBtnText}>QC Sign-off & Inward Stock</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
