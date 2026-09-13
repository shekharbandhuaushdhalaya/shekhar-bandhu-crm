import { WorkspaceLoading, StatusPill } from './../../../components/WorkspacePrimitives';
import { PressableOpacity as TouchableOpacity } from './../../../components/PressableOpacity';
import { AppTextInput as TextInput } from './../../../components/AppTextInput';
import { AppText as Text } from './../../../components/AppText';
import { Typography } from './../../../constants/theme';
import React from 'react';
import { View, Modal, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';

interface Props {
  visible: boolean;
  traceLoading: boolean;
  traceResult: any;
  traceBatchNo: string;
  traceSearch: string;
  setTraceSearch: (v: string) => void;
  traceSubTab: 'in' | 'out';
  setTraceSubTab: (v: 'in' | 'out') => void;
  isDesktop: boolean;
  onClose: () => void;
  isIntegerQty: (unit: string, category: string) => boolean;
}

export default function StockTraceModal({
  visible, traceLoading, traceResult, traceBatchNo, traceSearch, setTraceSearch,
  traceSubTab, setTraceSubTab, isDesktop, onClose, isIntegerQty
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const parseDate = (val: any) => {
    if (!val) return new Date();
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalContainer, { maxWidth: 1200, width: '98%', height: '90%' }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>End-to-End Batch Trace</Text>
              <Text style={{ ...Typography.caption, color: colors.text.secondary, marginTop: 2 }}>
                {traceResult ? `Batch: ${traceResult.batchNo}` : 'Enter a batch number to trace'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {traceLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <WorkspaceLoading />
              <Text style={{ ...Typography.bodySm, color: colors.text.secondary, marginTop: 12, fontWeight: '600' }}>Fetching raw material stock ledger...</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ gap: 16 }}>
              {/* Raw Material Stock Ledger (IN/OUT) */}
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.bg.card }}>
                {/* Header */}
                <View style={{ backgroundColor: colors.primary + '10', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ ...Typography.body, fontWeight: '800', color: colors.primary }}>
                       Raw Material Stock Ledger: {traceResult?.materialName || traceResult?.rawMaterialEntries?.[0]?.materialName || traceBatchNo || traceResult?.batchNo || 'Stock Trace'}
                    </Text>
                    {(traceResult?.materialSku || traceResult?.rawMaterialEntries?.[0]?.materialSku) && (
                      <View style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: colors.primary + '40' }}>
                        <Text style={{ ...Typography.caption, fontWeight: '800', color: colors.primary }}>
                          SKU: {traceResult?.materialSku || traceResult?.rawMaterialEntries?.[0]?.materialSku}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Search Bar */}
                <View style={{ paddingHorizontal: 12, backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8, height: 38 }}>
                  <Ionicons name="search-outline" size={15} color={colors.text.muted} />
                  <TextInput
                    style={{ ...Typography.bodySm, flex: 1, color: colors.text.primary, padding: 0 }}
                    placeholder="Search by batch number..."
                    placeholderTextColor={colors.text.muted}
                    value={traceSearch}
                    onChangeText={setTraceSearch}
                  />
                  {traceSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setTraceSearch('')}>
                      <Ionicons name="close-circle" size={15} color={colors.text.muted} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Sub-Tabs Header */}
                <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary }}>
                  <TouchableOpacity
                    onPress={() => setTraceSubTab('in')}
                    style={[
                      { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', flexDirection: 'row', justifyContent: 'center', gap: 6 },
                      traceSubTab === 'in' && { borderBottomColor: colors.success, backgroundColor: colors.success + '08' }
                    ]}
                  >
                    <Ionicons name="arrow-down-circle-outline" size={16} color={traceSubTab === 'in' ? colors.success : colors.text.muted} />
                    <Text style={[{ ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary }, traceSubTab === 'in' && { color: colors.success }]}>
                      Incoming Stock (IN)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setTraceSubTab('out')}
                    style={[
                      { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', flexDirection: 'row', justifyContent: 'center', gap: 6 },
                      traceSubTab === 'out' && { borderBottomColor: colors.warning, backgroundColor: colors.warning + '08' }
                    ]}
                  >
                    <Ionicons name="arrow-up-circle-outline" size={16} color={traceSubTab === 'out' ? colors.warning : colors.text.muted} />
                    <Text style={[{ ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary }, traceSubTab === 'out' && { color: colors.warning }]}>
                      Outgoing Stock (OUT)
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Table View */}
                <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                  <View style={{ minWidth: '100%', flex: 1 }}>
                    {traceSubTab === 'in' ? (
                      <>
                        {/* Table Header for IN */}
                        <View style={{ flexDirection: 'row', backgroundColor: colors.bg.secondary, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                          <Text style={{ ...Typography.eyebrow, width: 95, fontWeight: '700', color: colors.text.secondary }}>Date</Text>
                          <Text style={{ ...Typography.eyebrow, width: 125, fontWeight: '700', color: colors.text.secondary }}>Batch No</Text>
                          <Text style={{ ...Typography.eyebrow, flex: 1.2, minWidth: 120, fontWeight: '700', color: colors.text.secondary }}>Raw Material</Text>
                          <Text style={{ ...Typography.eyebrow, width: 100, fontWeight: '700', color: colors.text.secondary }}>Purchase Ref</Text>
                          <Text style={{ ...Typography.eyebrow, flex: 1.2, minWidth: 110, fontWeight: '700', color: colors.text.secondary }}>Vendor / Source</Text>
                          <Text style={{ ...Typography.eyebrow, width: 100, fontWeight: '700', color: colors.text.secondary, textAlign: 'left', paddingLeft: 8 }}>IN Qty</Text>
                          <Text style={{ ...Typography.eyebrow, width: 130, fontWeight: '700', color: colors.text.secondary, textAlign: 'left' }}>Warehouse</Text>
                        </View>
                        {/* Table Body for IN */}
                        {(() => {
                          const inEntries = traceResult?.rawMaterialEntries || [];
                          const filtered = inEntries.filter((e: any) => {
                            if (!traceSearch) return true;
                            return e.batchNo?.toLowerCase().includes(traceSearch.toLowerCase()) ||
                              e.materialName?.toLowerCase().includes(traceSearch.toLowerCase()) ||
                              e.purchaseRef?.toLowerCase().includes(traceSearch.toLowerCase());
                          });

                          if (filtered.length === 0) {
                            return <Text style={{ padding: 16, textAlign: 'center', color: colors.text.secondary }}>No matching incoming stock found.</Text>;
                          }

                          return filtered.map((row: any, idx: number) => (
                            <View key={idx} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: idx < filtered.length - 1 ? 0.5 : 0, borderBottomColor: colors.border, alignItems: 'center' }}>
                              <Text style={{ ...Typography.caption, width: 95, color: colors.text.secondary }}>
                                {parseDate(row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </Text>
                              <View style={{ width: 125 }}>
                                <Text style={{ ...Typography.caption, fontWeight: '700', color: colors.text.primary }}>
                                  {row.batchNo}
                                </Text>
                                {row.cleaningNotes ? (
                                  <Text style={{ ...Typography.eyebrow, color: colors.warning, fontStyle: 'italic', marginTop: 1 }}>
                                    {row.cleaningNotes}
                                  </Text>
                                ) : null}
                              </View>
                              <Text style={{ ...Typography.caption, flex: 1.2, minWidth: 120, fontWeight: '600', color: colors.text.primary }} numberOfLines={1}>
                                 {row.materialName || 'Raw Material'}
                              </Text>
                              <Text style={{ ...Typography.caption, width: 100, color: colors.text.primary, fontWeight: '600' }}>
                                {row.purchaseRef || 'Inward'}
                              </Text>
                              <Text style={{ ...Typography.caption, flex: 1.2, minWidth: 110, color: colors.text.primary }} numberOfLines={1}>
                                {row.vendorName || 'Direct'}
                              </Text>
                              <View style={{ width: 130, paddingLeft: 8 }}>
                                <Text style={{ ...Typography.caption, fontWeight: '700', color: colors.success }}>
                                  {(() => {
                                    const val = row.initialQty !== undefined ? row.initialQty : row.qty;
                                    return isIntegerQty(row.unit, row.category) ? val.toFixed(0) : val.toFixed(1);
                                  })()} {row.unit}
                                </Text>
                                {row.initialQty !== undefined && row.initialQty !== row.qty && (
                                  <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginTop: 1 }}>
                                    ({isIntegerQty(row.unit, row.category) ? row.qty.toFixed(0) : row.qty.toFixed(1)} remaining)
                                  </Text>
                                )}
                              </View>
                              <Text style={{ ...Typography.caption, width: 130, color: colors.primary, fontWeight: '600', textAlign: 'left' }} numberOfLines={1}>
                                {row.warehouseName || '-'}
                              </Text>
                            </View>
                          ));
                        })()}
                      </>
                    ) : (
                      <>
                        {/* Table Header for OUT */}
                        <View style={{ flexDirection: 'row', backgroundColor: colors.bg.secondary, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                          <Text style={{ ...Typography.eyebrow, width: 90, fontWeight: '700', color: colors.text.secondary }}>Date</Text>
                          <Text style={{ ...Typography.eyebrow, width: 140, fontWeight: '700', color: colors.text.secondary }}>Production Batch No</Text>
                          <Text style={{ ...Typography.eyebrow, flex: 1.5, fontWeight: '700', color: colors.text.secondary }}>Product Name</Text>
                          <Text style={{ ...Typography.eyebrow, width: 100, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Consumed Qty</Text>
                          <Text style={{ ...Typography.eyebrow, width: 140, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Manufacturing Unit</Text>
                        </View>
                        {/* Table Body for OUT */}
                        {(() => {
                          const unit = traceResult?.rawMaterial?.unit || traceResult?.rawMaterialEntries?.[0]?.unit || '';
                          const category = traceResult?.rawMaterial?.category || traceResult?.rawMaterialEntries?.[0]?.category || '';
                          const isInt = isIntegerQty(unit, category);
                          const outItems = (traceResult?.productionBatches || []).filter((b: any) => b.relation === 'raw_material_consumed_in');
                          const filtered = outItems.filter((b: any) => {
                            if (!traceSearch) return true;
                            return b.batchNo?.toLowerCase().includes(traceSearch.toLowerCase()) ||
                              b.productName?.toLowerCase().includes(traceSearch.toLowerCase()) ||
                              b.warehouseName?.toLowerCase().includes(traceSearch.toLowerCase());
                          });

                          if (filtered.length === 0) {
                            return <Text style={{ padding: 16, textAlign: 'center', color: colors.text.secondary }}>No matching outgoing consumption found.</Text>;
                          }

                          return filtered.map((row: any, idx: number) => (
                            <View key={idx} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: idx < filtered.length - 1 ? 0.5 : 0, borderBottomColor: colors.border, alignItems: 'center' }}>
                              <Text style={{ ...Typography.caption, width: 90, color: colors.text.secondary }}>
                                {parseDate(row.startDate || row.endDate || row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </Text>
                              <Text style={{ ...Typography.caption, width: 140, fontWeight: '700', color: colors.text.primary }}>
                                {row.batchNo}
                              </Text>
                              <Text style={{ ...Typography.caption, flex: 1.5, color: colors.text.primary }} numberOfLines={1}>
                                {row.productName}
                              </Text>
                              <Text style={{ ...Typography.caption, width: 100, fontWeight: '700', color: colors.warning, textAlign: 'right' }}>
                                {isInt ? row.qtyConsumed.toFixed(0) : row.qtyConsumed.toFixed(1)} {unit}
                              </Text>
                              <Text style={{ ...Typography.caption, width: 140, color: colors.primary, fontWeight: '600', textAlign: 'right' }} numberOfLines={1}>
                                 {row.warehouseName || 'Factory Unit'}
                              </Text>
                            </View>
                          ));
                        })()}
                      </>
                    )}
                  </View>
                </ScrollView>
              </View>

              {/* Finished Goods Stock */}
              {!!traceResult?.finishedGoodsEntries?.length && (
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.bg.card }}>
                  <View style={{ backgroundColor: colors.success + '15', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.success }}> Finished Goods Stock ({traceResult.finishedGoodsEntries.length})</Text>
                  </View>
                  <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                    <View style={{ minWidth: '100%', flex: 1 }}>
                      <View style={{ flexDirection: 'row', backgroundColor: colors.bg.secondary, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ ...Typography.eyebrow, flex: 1.5, minWidth: 150, fontWeight: '700', color: colors.text.secondary }}>Product Name</Text>
                        <Text style={{ ...Typography.eyebrow, width: 100, fontWeight: '700', color: colors.text.secondary, textAlign: 'left' }}>In-Stock Qty</Text>
                        <Text style={{ ...Typography.eyebrow, width: 140, fontWeight: '700', color: colors.text.secondary }}>Warehouse</Text>
                        <Text style={{ ...Typography.eyebrow, width: 100, fontWeight: '700', color: colors.text.secondary }}>Mfg Date</Text>
                        <Text style={{ ...Typography.eyebrow, width: 100, fontWeight: '700', color: colors.text.secondary }}>Exp Date</Text>
                      </View>
                      {traceResult.finishedGoodsEntries.map((e: any, idx: number) => (
                        <View key={e._id} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: idx < traceResult.finishedGoodsEntries.length - 1 ? 0.5 : 0, borderBottomColor: colors.border, alignItems: 'center' }}>
                          <Text style={{ ...Typography.caption, flex: 1.5, minWidth: 150, fontWeight: '600', color: colors.text.primary }}>{e.productName}</Text>
                          <Text style={{ ...Typography.caption, width: 100, fontWeight: '700', color: colors.success }}>{e.qtyBoxes * (e.packing || 1)} Pcs</Text>
                          <Text style={{ ...Typography.caption, width: 140, color: colors.primary, fontWeight: '600' }}>{e.warehouseName}</Text>
                          <Text style={{ ...Typography.caption, width: 100, color: colors.text.secondary }}>{e.mfgDate ? new Date(e.mfgDate).toLocaleDateString('en-IN') : '—'}</Text>
                          <Text style={{ ...Typography.caption, width: 100, color: colors.text.secondary }}>{e.expiryDate ? new Date(e.expiryDate).toLocaleDateString('en-IN') : '—'}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Challans */}
              {!!traceResult?.challans?.length && (
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.bg.card }}>
                  <View style={{ backgroundColor: colors.primary + '10', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.primary }}> Challans / Delivery Challans ({traceResult.challans.length})</Text>
                  </View>
                  <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                    <View style={{ minWidth: '100%', flex: 1 }}>
                      <View style={{ flexDirection: 'row', backgroundColor: colors.bg.secondary, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ ...Typography.eyebrow, width: 120, fontWeight: '700', color: colors.text.secondary }}>Doc No</Text>
                        <Text style={{ ...Typography.eyebrow, width: 90, fontWeight: '700', color: colors.text.secondary }}>Date</Text>
                        <Text style={{ ...Typography.eyebrow, flex: 1, minWidth: 220, fontWeight: '700', color: colors.text.secondary }}>Party</Text>
                        <Text style={{ ...Typography.eyebrow, width: 130, fontWeight: '700', color: colors.text.secondary }}>Warehouse</Text>
                        <Text style={{ ...Typography.eyebrow, width: 100, fontWeight: '700', color: colors.text.secondary }}>Type</Text>
                        <Text style={{ ...Typography.eyebrow, width: 100, fontWeight: '700', color: colors.text.secondary }}>Status</Text>
                      </View>
                      {traceResult.challans.map((c: any, idx: number) => (
                        <View key={c._id} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: idx < traceResult.challans.length - 1 ? 0.5 : 0, borderBottomColor: colors.border, alignItems: 'center' }}>
                          <Text style={{ ...Typography.caption, width: 120, fontWeight: '700', color: colors.primary }}>{c.challanNo}</Text>
                          <Text style={{ ...Typography.caption, width: 90, color: colors.text.secondary }}>{new Date(c.date).toLocaleDateString('en-IN')}</Text>
                          <Text style={{ ...Typography.caption, flex: 1, minWidth: 220, color: colors.text.primary }} numberOfLines={1}>{c.partyName}</Text>
                          <Text style={{ ...Typography.caption, width: 130, color: colors.text.secondary }} numberOfLines={1}>{c.warehouseName || '—'}</Text>
                          <Text style={{ ...Typography.caption, width: 100, color: colors.text.secondary }}>{c.type ? (c.type.charAt(0).toUpperCase() + c.type.slice(1)) : 'Sale'}</Text>
                          <View style={{ width: 100 }}>
                            <StatusPill  label={<>
                                {c.status.toUpperCase()}
                              </>} textStyle={{ ...Typography.eyebrow, color: c.status === 'dispatched' ? colors.success : (c.status === 'draft' ? colors.primary : colors.text.muted), fontWeight: '800' }} />
                          </View>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Invoices */}
              {!!traceResult?.invoices?.length && (
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.bg.card }}>
                  <View style={{ backgroundColor: colors.success + '10', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.success }}> Invoices / Customer Bills ({traceResult.invoices.length})</Text>
                  </View>
                  <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                    <View style={{ minWidth: '100%', flex: 1 }}>
                      <View style={{ flexDirection: 'row', backgroundColor: colors.bg.secondary, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ ...Typography.eyebrow, width: 120, fontWeight: '700', color: colors.text.secondary }}>Doc No</Text>
                        <Text style={{ ...Typography.eyebrow, width: 90, fontWeight: '700', color: colors.text.secondary }}>Date</Text>
                        <Text style={{ ...Typography.eyebrow, flex: 1, minWidth: 220, fontWeight: '700', color: colors.text.secondary }}>Party</Text>
                        <Text style={{ ...Typography.eyebrow, width: 130, fontWeight: '700', color: colors.text.secondary }}>Warehouse</Text>
                        <Text style={{ ...Typography.eyebrow, width: 100, fontWeight: '700', color: colors.text.secondary }}>Status</Text>
                        <Text style={{ ...Typography.eyebrow, width: 100, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Amount</Text>
                      </View>
                      {traceResult.invoices.map((inv: any, idx: number) => (
                        <View key={inv._id} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: idx < traceResult.invoices.length - 1 ? 0.5 : 0, borderBottomColor: colors.border, alignItems: 'center' }}>
                          <Text style={{ ...Typography.caption, width: 120, fontWeight: '700', color: colors.primary }}>{inv.invoiceNo}</Text>
                          <Text style={{ ...Typography.caption, width: 90, color: colors.text.secondary }}>{new Date(inv.date).toLocaleDateString('en-IN')}</Text>
                          <Text style={{ ...Typography.caption, flex: 1, minWidth: 220, color: colors.text.primary }} numberOfLines={1}>{inv.customerName}</Text>
                          <Text style={{ ...Typography.caption, width: 130, color: colors.text.secondary }} numberOfLines={1}>{inv.warehouseName || '—'}</Text>
                          <View style={{ width: 100 }}>
                            <StatusPill  label={<>
                                {inv.status === 'Cancelled' ? 'CANCELLED' : (inv.isFinalized ? (inv.status === 'paid' ? 'PAID' : 'FINALIZED') : 'DRAFT')}
                              </>} textStyle={{ ...Typography.eyebrow, color: inv.status === 'Cancelled' ? colors.danger : (inv.isFinalized ? (inv.status === 'paid' ? colors.success : colors.success) : colors.warning), fontWeight: '800' }} />
                          </View>
                          <Text style={{ ...Typography.caption, width: 100, fontWeight: '700', color: colors.text.primary, textAlign: 'right' }}>₹{inv.amount.toLocaleString('en-IN')}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Dispatches */}
              {!!traceResult?.dispatches?.length && (
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.bg.card }}>
                  <View style={{ backgroundColor: colors.warning + '10', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.warning }}> Dispatch Logistics ({traceResult.dispatches.length})</Text>
                  </View>
                  <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                    <View style={{ minWidth: '100%', flex: 1 }}>
                      <View style={{ flexDirection: 'row', backgroundColor: colors.bg.secondary, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ ...Typography.eyebrow, width: 95, fontWeight: '700', color: colors.text.secondary }}>Date</Text>
                        <Text style={{ ...Typography.eyebrow, width: 110, fontWeight: '700', color: colors.text.secondary }}>Doc No</Text>
                        <Text style={{ ...Typography.eyebrow, flex: 1.2, minWidth: 140, fontWeight: '700', color: colors.text.secondary }}>Consignee Name</Text>
                        <Text style={{ ...Typography.eyebrow, flex: 1, minWidth: 110, fontWeight: '700', color: colors.text.secondary }}>Transporter / LR No</Text>
                        <Text style={{ ...Typography.eyebrow, width: 100, fontWeight: '700', color: colors.text.secondary }}>Tracking ID</Text>
                      </View>
                      {traceResult.dispatches.map((d: any, idx: number) => (
                        <View key={d._id} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: idx < traceResult.dispatches.length - 1 ? 0.5 : 0, borderBottomColor: colors.border, alignItems: 'center' }}>
                          <Text style={{ ...Typography.caption, width: 95, color: colors.text.secondary }}>{d.dispatchDate ? new Date(d.dispatchDate).toLocaleDateString('en-IN') : '—'}</Text>
                          <Text style={{ ...Typography.caption, width: 110, fontWeight: '700', color: colors.text.primary }}>{d.dispatchNo}</Text>
                          <Text style={{ ...Typography.caption, flex: 1.2, minWidth: 140, color: colors.text.primary }}>{d.customerName}</Text>
                          <Text style={{ ...Typography.caption, flex: 1, minWidth: 110, color: colors.text.primary }} numberOfLines={1}>
                            {d.transporter || '—'} {d.lrNo ? `| LR: ${d.lrNo}` : ''}
                          </Text>
                          <Text style={{ ...Typography.caption, width: 100, color: colors.primary, fontWeight: '600' }} numberOfLines={1}>{d.trackingId || '—'}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {!traceResult?.rawMaterialEntries?.length && !traceResult?.productionBatches?.length &&
                !traceResult?.finishedGoodsEntries?.length && !traceResult?.challans?.length &&
                !traceResult?.invoices?.length && !traceResult?.dispatches?.length && (
                  <View style={{ alignItems: 'center', padding: 24 }}>
                    <Ionicons name="search-outline" size={40} color={colors.text.muted} />
                    <Text style={{ ...Typography.bodySm, color: colors.text.muted, marginTop: 8 }}>
                      No trace records found for "{decodeURIComponent(traceResult?.materialName || traceResult?.batchNo || traceBatchNo || '')}"
                    </Text>
                  </View>
                )}
            </ScrollView>
          )}

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
