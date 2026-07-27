import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';
import { RawMaterial, BillOfMaterials, Vendor, ManufacturingUnit } from '../../../utils/api';

interface Props {
  visible: boolean;
  products: any[];
  vendors: Vendor[];
  manufacturingUnits: ManufacturingUnit[];
  boms: BillOfMaterials[];
  materials: RawMaterial[];
  prodProductId: string; setProdProductId: (v: string) => void;
  prodBomId: string; setProdBomId: (v: string) => void;
  prodPlannedQty: string; setProdPlannedQty: (v: string) => void;
  prodBatchNo: string; setProdBatchNo: (v: string) => void;
  prodProductionType: 'in_house' | 'job_work'; setProdProductionType: (v: 'in_house' | 'job_work') => void;
  prodJobWorkMode: 'raw_materials_supplied' | 'direct_purchase' | 'none'; setProdJobWorkMode: (v: 'raw_materials_supplied' | 'direct_purchase' | 'none') => void;
  prodPackagingMode: 'packed_by_vendor' | 'self_packed'; setProdPackagingMode: (v: 'packed_by_vendor' | 'self_packed') => void;
  prodJobWorkerId: string; setProdJobWorkerId: (v: string) => void;
  prodJobWorkerName: string; setProdJobWorkerName: (v: string) => void;
  prodJobWorkerChallanRef: string; setProdJobWorkerChallanRef: (v: string) => void;
  prodManufacturingUnitId: string; setProdManufacturingUnitId: (v: string) => void;
  prodError: string;
  previewIngredients: { name: string; qtyNeeded: number; unit: string; available: number; ratioPct: number; itemType: 'formulation' | 'packaging' }[];
  onClose: () => void;
  onLaunch: () => void;
}

export default function LaunchBatchModal({
  visible, products, vendors, manufacturingUnits, boms, materials,
  prodProductId, setProdProductId, prodBomId, setProdBomId,
  prodPlannedQty, setProdPlannedQty,
  prodBatchNo, setProdBatchNo, prodProductionType, setProdProductionType,
  prodJobWorkMode, setProdJobWorkMode, prodPackagingMode, setProdPackagingMode,
  prodJobWorkerId, setProdJobWorkerId, prodJobWorkerName, setProdJobWorkerName,
  prodJobWorkerChallanRef, setProdJobWorkerChallanRef,
  prodManufacturingUnitId, setProdManufacturingUnitId,
  prodError, previewIngredients, onClose, onLaunch
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const isDirectPurchaseJobWork = prodProductionType === 'job_work' && prodJobWorkMode === 'direct_purchase';

  const selectedProduct = products.find(p => p._id === prodProductId);
  const getYieldUnitLabel = () => {
    if (!selectedProduct) return 'units';
    const s = (selectedProduct.shape || '').toLowerCase().trim();
    if (s === 'liquid') return 'Liters (L)';
    if (s === 'tablet') return 'Tablets (pcs)';
    if (s === 'capsule') return 'Capsules (pcs)';
    if (s === 'powder' || s === 'paste') return 'Kilograms (Kg)';
    return 'units';
  };

  // Recipes available for the selected product
  const productRecipes = boms.filter(b => {
    const bPid = b.productId && typeof b.productId === 'object' ? (b.productId as any)._id : b.productId;
    return bPid === prodProductId;
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Launch Production Batch</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          {prodError ? <Text style={styles.modalError}>{prodError}</Text> : null}
          <ScrollView style={styles.modalForm}>
            <Text style={styles.inputLabel}>Select Finished Goods Product *</Text>
            <View style={styles.pickerWrapper}>
              {Platform.OS === 'web' ? (
                <select
                  value={prodProductId}
                  onChange={(e: any) => {
                    const val = e.target.value;
                    setProdProductId(val);
                    // Auto-select recipe: default or first available
                    const productBoms = boms.filter(b => {
                      const bPid = b.productId && typeof b.productId === 'object' ? (b.productId as any)._id : b.productId;
                      return bPid === val;
                    });
                    const activeBom = productBoms.find(b => b.isDefault) || productBoms[0];
                    setProdBomId(activeBom ? activeBom._id : '');
                    if (activeBom) {
                      setProdProductionType((activeBom as any).defaultProductionType || 'in_house');
                      setProdJobWorkMode((activeBom as any).defaultJobWorkMode || 'none');
                      setProdPackagingMode((activeBom as any).defaultPackagingMode || 'self_packed');
                      const jwId = (activeBom as any).defaultJobWorkerId ? ((activeBom as any).defaultJobWorkerId._id || (activeBom as any).defaultJobWorkerId) : '';
                      setProdJobWorkerId(jwId);
                      const matchV = vendors.find(v => v._id === jwId);
                      setProdJobWorkerName(matchV ? ((matchV as any).company || matchV.name) : '');
                    } else {
                      setProdProductionType('in_house');
                      setProdJobWorkMode('none');
                      setProdPackagingMode('self_packed');
                      setProdJobWorkerId('');
                      setProdJobWorkerName('');
                    }
                  }}
                  style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                >
                  <option value="">-- Choose Product --</option>
                  {products.filter(p => !p.parentId).map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              ) : (
                <TextInput style={styles.input} placeholder="Product ID" value={prodProductId} onChangeText={setProdProductId} />
              )}
            </View>

            {productRecipes.length > 1 && (
              <>
                <Text style={styles.inputLabel}>Select Recipe *</Text>
                <View style={styles.pickerWrapper}>
                  {Platform.OS === 'web' ? (
                    <select
                      value={prodBomId}
                      onChange={(e: any) => setProdBomId(e.target.value)}
                      style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                    >
                      {productRecipes.map(b => (
                        <option key={b._id} value={b._id}>
                          {b.recipeName || 'Standard Recipe'}{b.isDefault ? ' ⭐ (Default)' : ''}{b.isActive === false ? ' (Inactive)' : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <TextInput style={styles.input} placeholder="Recipe ID" value={prodBomId} onChangeText={setProdBomId} />
                  )}
                </View>
              </>
            )}

            {productRecipes.length === 1 && (
              <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12, marginTop: -4 }}>
                📋 Recipe: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{productRecipes[0].recipeName || 'Standard Recipe'}</Text>
              </Text>
            )}

            <Text style={styles.inputLabel}>Manufacturing Unit *</Text>
            <View style={styles.pickerWrapper}>
              {Platform.OS === 'web' ? (
                <select
                  value={prodManufacturingUnitId}
                  onChange={(e: any) => setProdManufacturingUnitId(e.target.value)}
                  style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                >
                  <option value="">-- Select Manufacturing Unit --</option>
                  {manufacturingUnits.map(m => <option key={m._id} value={m._id}>{m.name} ({(m as any).city || 'Default'})</option>)}
                </select>
              ) : (
                <TextInput style={styles.input} placeholder="Manufacturing Unit ID" value={prodManufacturingUnitId} onChangeText={setProdManufacturingUnitId} />
              )}
            </View>

            <Text style={styles.inputLabel}>Production Execution Type *</Text>
            <View style={styles.pickerWrapper}>
              {Platform.OS === 'web' ? (
                <select
                  value={prodProductionType}
                  onChange={(e: any) => {
                    const val = e.target.value;
                    setProdProductionType(val);
                    if (val === 'in_house') setProdJobWorkMode('none');
                    else setProdJobWorkMode('raw_materials_supplied');
                  }}
                  style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                >
                  <option value="in_house">In-House Manufacturing</option>
                  <option value="job_work">Third-Party Job Work (Outsourced)</option>
                </select>
              ) : (
                <TextInput style={styles.input} placeholder="in_house or job_work" value={prodProductionType} onChangeText={(val: any) => setProdProductionType(val)} />
              )}
            </View>

            {prodProductionType === 'job_work' && (
              <>
                <Text style={styles.inputLabel}>Job Worker (Contract Manufacturer) *</Text>
                <View style={styles.pickerWrapper}>
                  {Platform.OS === 'web' ? (
                    <select
                      value={prodJobWorkerId}
                      onChange={(e: any) => {
                        const val = e.target.value;
                        setProdJobWorkerId(val);
                        const matchingV = vendors.find(v => v._id === val);
                        setProdJobWorkerName(matchingV ? ((matchingV as any).company || matchingV.name) : '');
                      }}
                      style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                    >
                      <option value="">-- Choose Job Worker Vendor --</option>
                      {vendors.map(v => (
                        <option key={v._id} value={v._id}>{(v as any).company || v.name} {(v as any).manufacturingLicenseNo ? `(Lic: ${(v as any).manufacturingLicenseNo})` : ''}</option>
                      ))}
                    </select>
                  ) : (
                    <TextInput style={styles.input} placeholder="Job Worker ID" value={prodJobWorkerId} onChangeText={setProdJobWorkerId} />
                  )}
                </View>

                <Text style={styles.inputLabel}>Job Work Mode *</Text>
                <View style={styles.pickerWrapper}>
                  {Platform.OS === 'web' ? (
                    <select
                      value={prodJobWorkMode}
                      onChange={(e: any) => setProdJobWorkMode(e.target.value)}
                      style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                    >
                      <option value="raw_materials_supplied">Raw Materials Supplied (We Provide Ingredients)</option>
                      <option value="direct_purchase">Direct Purchase of Finished Bulk (Vendor Raw Materials)</option>
                    </select>
                  ) : (
                    <TextInput style={styles.input} placeholder="raw_materials_supplied or direct_purchase" value={prodJobWorkMode} onChangeText={(val: any) => setProdJobWorkMode(val)} />
                  )}
                </View>

                {prodJobWorkMode === 'raw_materials_supplied' && (
                  <>
                    <Text style={styles.inputLabel}>Outward Delivery Challan Reference No. (Form 15/Rule 55)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. CH-2026-045 / Outward Jobwork reference"
                      placeholderTextColor={colors.text.muted}
                      value={prodJobWorkerChallanRef}
                      onChangeText={setProdJobWorkerChallanRef}
                    />
                  </>
                )}

                <Text style={styles.inputLabel}>Packaging & Labeling *</Text>
                <View style={styles.pickerWrapper}>
                  {Platform.OS === 'web' ? (
                    <select
                      value={prodPackagingMode}
                      onChange={(e: any) => setProdPackagingMode(e.target.value)}
                      style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                    >
                      <option value="self_packed">Self-Packed (Deduct Bottles/Labels/Caps from our Stock)</option>
                      <option value="packed_by_vendor">Packed by Vendor (Finished Goods Received fully Boxed)</option>
                    </select>
                  ) : (
                    <TextInput style={styles.input} placeholder="self_packed or packed_by_vendor" value={prodPackagingMode} onChangeText={(val: any) => setProdPackagingMode(val)} />
                  )}
                </View>
              </>
            )}

            <Text style={styles.inputLabel}>Planned Yield Quantity ({getYieldUnitLabel()}) *</Text>
            <TextInput style={styles.input} placeholder={`Planned output quantity (e.g. 500)`} placeholderTextColor={colors.text.muted} value={prodPlannedQty} onChangeText={setProdPlannedQty} keyboardType="numeric" />

            <Text style={styles.inputLabel}>Finished Goods Production Batch No. *</Text>
            <TextInput style={styles.input} placeholder="e.g. ABH-JUL26-01" placeholderTextColor={colors.text.muted} value={prodBatchNo} onChangeText={setProdBatchNo} />

            {!isDirectPurchaseJobWork && (
              <Text style={styles.warningDisclaimer}>
                ⚠️ Starting this batch will automatically deduct the corresponding raw material quantities from active stock batches (FIFO). If stocks are insufficient, the launch will be blocked.
              </Text>
            )}
            {isDirectPurchaseJobWork && (
              <Text style={[styles.warningDisclaimer, { color: colors.primary, borderColor: colors.primary + '30', backgroundColor: colors.primary + '08' }]}>
                ℹ️ Under Direct Purchase Job Work, raw material stock deductions are skipped since ingredients are provided and processed by the third-party vendor.
              </Text>
            )}

            {previewIngredients.length > 0 && (
              <View style={{ marginTop: 16, padding: 12, backgroundColor: colors.bg.secondary, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>
                  📋 Auto-Deduction Ingredients Preview:
                </Text>
                {previewIngredients.map((item, idx) => {
                  const isShortage = item.available < item.qtyNeeded;
                  return (
                    <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: idx === previewIngredients.length - 1 ? 0 : 0.5, borderBottomColor: colors.border }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 12, color: colors.text.primary }}>
                          {item.itemType === 'packaging' ? '📦' : '🌿'} {item.name}{' '}
                          <Text style={{ fontSize: 10.5, color: colors.text.muted }}>
                            ({item.ratioPct} {item.unit}{item.itemType === 'packaging' ? '/unit' : '/batch'})
                          </Text>
                        </Text>
                        <Text style={{ fontSize: 10.5, color: isShortage ? colors.danger : colors.text.secondary, marginTop: 2 }}>
                          Available in Unit: {item.available.toFixed(2)} {item.unit}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: isShortage ? colors.danger : colors.text.primary }}>
                          {item.qtyNeeded.toFixed(2)} {item.unit}
                        </Text>
                        {isShortage && (
                          <View style={{ backgroundColor: colors.danger + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 }}>
                            <Text style={{ fontSize: 9, color: colors.danger, fontWeight: '800' }}>SHORTAGE</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={onLaunch}>
              <Text style={styles.submitBtnText}>Launch Batch</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
