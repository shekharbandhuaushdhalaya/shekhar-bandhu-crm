import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';
import { RawMaterial, Vendor } from '../../../utils/api';

interface Ingredient { rawMaterialId: string; qtyRequired: string; }
interface Stage { name: string; targetDurationDays: string; }

interface Props {
  visible: boolean;
  editingBomId: string | null;
  selectedProdId: string; setSelectedProdId: (v: string) => void;
  bomYield: string; setBomYield: (v: string) => void;
  bomIngredients: Ingredient[];
  bomError: string;
  bomIsActive: boolean; setBomIsActive: (v: boolean) => void;
  bomIsDefault: boolean; setBomIsDefault: (v: boolean) => void;
  bomRecipeName: string; setBomRecipeName: (v: string) => void;
  bomNotes: string; setBomNotes: (v: string) => void;
  bomOverhead: string; setBomOverhead: (v: string) => void;
  bomDefaultProductionType: 'in_house' | 'job_work';
  setBomDefaultProductionType: (v: 'in_house' | 'job_work') => void;
  bomDefaultJobWorkMode: 'raw_materials_supplied' | 'direct_purchase' | 'none';
  setBomDefaultJobWorkMode: (v: 'raw_materials_supplied' | 'direct_purchase' | 'none') => void;
  bomDefaultPackagingMode: 'packed_by_vendor' | 'self_packed';
  setBomDefaultPackagingMode: (v: 'packed_by_vendor' | 'self_packed') => void;
  bomDefaultJobWorkerId: string; setBomDefaultJobWorkerId: (v: string) => void;
  bomStages: Stage[];
  products: any[];
  materials: RawMaterial[];
  vendors: Vendor[];
  onClose: () => void;
  onSave: () => void;
  onAddIngredient: () => void;
  onRemoveIngredient: (i: number) => void;
  onIngredientChange: (i: number, key: 'rawMaterialId' | 'qtyRequired', val: string) => void;
  onAddStage: () => void;
  onRemoveStage: (i: number) => void;
  onStageChange: (i: number, key: 'name' | 'targetDurationDays', val: string) => void;
}

export default function BOMModal({
  visible, editingBomId, selectedProdId, setSelectedProdId, bomYield, setBomYield,
  bomIngredients, bomError, bomIsActive, setBomIsActive, bomIsDefault, setBomIsDefault,
  bomRecipeName, setBomRecipeName, bomNotes, setBomNotes,
  bomOverhead, setBomOverhead, bomDefaultProductionType, setBomDefaultProductionType,
  bomDefaultJobWorkMode, setBomDefaultJobWorkMode, bomDefaultPackagingMode, setBomDefaultPackagingMode,
  bomDefaultJobWorkerId, setBomDefaultJobWorkerId, bomStages,
  products, materials, vendors,
  onClose, onSave, onAddIngredient, onRemoveIngredient, onIngredientChange,
  onAddStage, onRemoveStage, onStageChange
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingBomId ? 'Edit Recipe / BOM' : 'Configure Recipe / BOM'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          {bomError ? <Text style={styles.modalError}>{bomError}</Text> : null}
          <ScrollView style={styles.modalForm}>

            <Text style={styles.inputLabel}>Finished Goods Product *</Text>
            <View style={styles.pickerWrapper}>
              {Platform.OS === 'web' ? (
                <select
                  value={selectedProdId}
                  onChange={(e: any) => setSelectedProdId(e.target.value)}
                  style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                >
                  <option value="">-- Choose Product --</option>
                  {products.map(p => <option key={p._id} value={p._id}>{p.name} ({p.size || 'Standard'})</option>)}
                </select>
              ) : (
                <TextInput style={styles.input} placeholder="Product ID" value={selectedProdId} onChangeText={setSelectedProdId} />
              )}
            </View>

            <Text style={styles.inputLabel}>Recipe Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Standard Recipe, Sugar-Free Formula"
              placeholderTextColor={colors.text.muted}
              value={bomRecipeName}
              onChangeText={setBomRecipeName}
            />

            <Text style={styles.inputLabel}>Standard Batch Yield Size (units) *</Text>
            <TextInput style={styles.input} placeholder="e.g. 100" placeholderTextColor={colors.text.muted} value={bomYield} onChangeText={setBomYield} keyboardType="numeric" />

            <Text style={styles.inputLabel}>Default Production Type</Text>
            <View style={styles.pickerWrapper}>
              {Platform.OS === 'web' ? (
                <select
                  value={bomDefaultProductionType}
                  onChange={(e: any) => {
                    setBomDefaultProductionType(e.target.value);
                    if (e.target.value === 'in_house') setBomDefaultJobWorkMode('none');
                  }}
                  style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                >
                  <option value="in_house">In-House Manufacturing</option>
                  <option value="job_work">Third-Party Job Work (Outsourced)</option>
                </select>
              ) : (
                <TextInput style={styles.input} value={bomDefaultProductionType} onChangeText={(v: any) => setBomDefaultProductionType(v)} />
              )}
            </View>

            {bomDefaultProductionType === 'job_work' && (
              <>
                <Text style={styles.inputLabel}>Default Job Work Mode</Text>
                <View style={styles.pickerWrapper}>
                  {Platform.OS === 'web' ? (
                    <select
                      value={bomDefaultJobWorkMode}
                      onChange={(e: any) => setBomDefaultJobWorkMode(e.target.value)}
                      style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                    >
                      <option value="raw_materials_supplied">Raw Materials Supplied</option>
                      <option value="direct_purchase">Direct Purchase of Finished Bulk</option>
                    </select>
                  ) : (
                    <TextInput style={styles.input} value={bomDefaultJobWorkMode} onChangeText={(v: any) => setBomDefaultJobWorkMode(v)} />
                  )}
                </View>

                <Text style={styles.inputLabel}>Default Preferred Job Worker (Vendor)</Text>
                <View style={styles.pickerWrapper}>
                  {Platform.OS === 'web' ? (
                    <select
                      value={bomDefaultJobWorkerId}
                      onChange={(e: any) => setBomDefaultJobWorkerId(e.target.value)}
                      style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                    >
                      <option value="">-- No Preferred Vendor --</option>
                      {vendors.map(v => (
                        <option key={v._id} value={v._id}>{v.company || v.name} {(v as any).manufacturingLicenseNo ? `(Lic: ${(v as any).manufacturingLicenseNo})` : ''}</option>
                      ))}
                    </select>
                  ) : (
                    <TextInput style={styles.input} value={bomDefaultJobWorkerId} onChangeText={setBomDefaultJobWorkerId} />
                  )}
                </View>
              </>
            )}

            {/* Ingredients */}
            <Text style={styles.formIngredientsTitle}>Formulation Ingredients *</Text>
            {bomIngredients.map((ing, idx) => (
              <View key={idx} style={styles.bomIngredientInputRow}>
                <View style={[styles.pickerWrapper, { flex: 2, marginBottom: 0 }]}>
                  {Platform.OS === 'web' ? (
                    <select
                      value={ing.rawMaterialId}
                      onChange={(e: any) => onIngredientChange(idx, 'rawMaterialId', e.target.value)}
                      style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                    >
                      <option value="">-- Choose Ingredient --</option>
                      {materials.map(m => <option key={m._id} value={m._id}>{m.name} ({m.unit})</option>)}
                    </select>
                  ) : (
                    <TextInput style={styles.input} placeholder="Ingredient ID" value={ing.rawMaterialId} onChangeText={(v) => onIngredientChange(idx, 'rawMaterialId', v)} />
                  )}
                </View>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="Qty / 100 units"
                  placeholderTextColor={colors.text.muted}
                  value={ing.qtyRequired}
                  onChangeText={(v) => onIngredientChange(idx, 'qtyRequired', v)}
                  keyboardType="numeric"
                />
                <TouchableOpacity style={styles.removeRowBtn} onPress={() => onRemoveIngredient(idx)}>
                  <Ionicons name="remove-circle" size={20} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addIngredientRowBtn} onPress={onAddIngredient}>
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={styles.addIngredientRowBtnText}>Add Ingredient Row</Text>
            </TouchableOpacity>

            {/* Manufacturing Stages */}
            <Text style={styles.formIngredientsTitle}>Manufacturing Process Stages (SOP)</Text>
            {bomStages.map((stage, idx) => (
              <View key={idx} style={styles.bomIngredientInputRow}>
                <TextInput
                  style={[styles.input, { flex: 2, marginBottom: 0 }]}
                  placeholder="Stage name (e.g. Granulation)"
                  placeholderTextColor={colors.text.muted}
                  value={stage.name}
                  onChangeText={(v) => onStageChange(idx, 'name', v)}
                />
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="Days"
                  placeholderTextColor={colors.text.muted}
                  value={stage.targetDurationDays}
                  onChangeText={(v) => onStageChange(idx, 'targetDurationDays', v)}
                  keyboardType="numeric"
                />
                <TouchableOpacity style={styles.removeRowBtn} onPress={() => onRemoveStage(idx)}>
                  <Ionicons name="remove-circle" size={20} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addIngredientRowBtn} onPress={onAddStage}>
              <Ionicons name="add" size={16} color={colors.primary} />
              <Text style={styles.addIngredientRowBtnText}>Add Process Stage</Text>
            </TouchableOpacity>

            <Text style={styles.inputLabel}>Overhead / Fixed Process Cost (₹)</Text>
            <TextInput style={styles.input} placeholder="e.g. 500" placeholderTextColor={colors.text.muted} value={bomOverhead} onChangeText={setBomOverhead} keyboardType="numeric" />

            <Text style={styles.inputLabel}>Production Notes (Optional)</Text>
            <TextInput
              style={[styles.input, { height: 80, paddingVertical: 8 }]}
              placeholder="Internal notes about this formulation..."
              placeholderTextColor={colors.text.muted}
              value={bomNotes}
              onChangeText={setBomNotes}
              multiline
              numberOfLines={3}
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <Text style={styles.inputLabel}>Mark as Active Recipe</Text>
              <TouchableOpacity
                onPress={() => setBomIsActive(!bomIsActive)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, backgroundColor: bomIsActive ? colors.success : colors.bg.secondary, borderColor: bomIsActive ? colors.success : colors.border }}
              >
                <Ionicons name={bomIsActive ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={bomIsActive ? '#fff' : colors.text.muted} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: bomIsActive ? '#fff' : colors.text.secondary }}>{bomIsActive ? 'Active' : 'Inactive'}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <Text style={styles.inputLabel}>Set as Default Recipe</Text>
              <TouchableOpacity
                onPress={() => setBomIsDefault(!bomIsDefault)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, backgroundColor: bomIsDefault ? colors.primary : colors.bg.secondary, borderColor: bomIsDefault ? colors.primary : colors.border }}
              >
                <Ionicons name={bomIsDefault ? 'star' : 'star-outline'} size={16} color={bomIsDefault ? '#fff' : colors.text.muted} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: bomIsDefault ? '#fff' : colors.text.secondary }}>{bomIsDefault ? 'Default' : 'Not Default'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={onSave}>
              <Text style={styles.submitBtnText}>{editingBomId ? 'Save Changes' : 'Save Recipe'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
