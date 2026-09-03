import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';

interface Props {
  visible: boolean;
  editingMaterialId: string | null;
  rmName: string; setRmName: (v: string) => void;
  rmSku: string;
  rmUnit: string; setRmUnit: (v: string) => void;
  rmCategory: string; setRmCategory: (v: string) => void;
  rmMinReorder: string; setRmMinReorder: (v: string) => void;
  rmError: string;
  rmStockLevel?: string; setRmStockLevel?: (v: string) => void;
  rmOriginalStockLevel?: number;
  rmAdjustmentReason?: string; setRmAdjustmentReason?: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export default function RawMaterialModal({
  visible, editingMaterialId, rmName, setRmName, rmSku, rmUnit, setRmUnit,
  rmCategory, setRmCategory, rmMinReorder, setRmMinReorder,
  rmError, onClose, onSave,
  rmStockLevel = '', setRmStockLevel,
  rmOriginalStockLevel = 0,
  rmAdjustmentReason = '', setRmAdjustmentReason
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingMaterialId ? 'Edit Raw Material' : 'Define New Raw Material'}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          {rmError ? <Text style={styles.modalError}>{rmError}</Text> : null}
          <ScrollView style={styles.modalForm}>
            <Text style={styles.inputLabel}>Ingredient Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. PURIFIED GUGGULU"
              placeholderTextColor={colors.text.muted}
              value={rmName}
              onChangeText={(v) => setRmName(v.toUpperCase())}
              autoCapitalize="characters"
            />

            <Text style={styles.inputLabel}>SKU / Code {editingMaterialId ? '' : '(Auto-Generated)'}</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bg.secondary, color: colors.text.muted }]} placeholder={editingMaterialId ? 'Material SKU' : 'Auto-generated on save'} placeholderTextColor={colors.text.muted} value={rmSku} editable={false} />

            <Text style={styles.inputLabel}>Material Classification / Category *</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {[
                { key: 'Herb', label: '🌿 Herb / Extract' },
                { key: 'Packaging', label: '📦 Bottle / Label / Box' },
                { key: 'Excipient', label: '💧 Liquid / Base' },
                { key: 'General', label: '⚙️ General Material' }
              ].map(c => (
                <TouchableOpacity
                  key={c.key}
                  onPress={() => setRmCategory(c.key)}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1,
                    backgroundColor: rmCategory === c.key ? colors.primary : colors.bg.secondary,
                    borderColor: rmCategory === c.key ? colors.primary : colors.border
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: rmCategory === c.key ? '#fff' : colors.text.secondary }}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, { marginBottom: 12 }]}
              placeholder="Or enter custom classification..."
              placeholderTextColor={colors.text.muted}
              value={rmCategory}
              onChangeText={setRmCategory}
            />

            <Text style={styles.inputLabel}>Measurement Unit *</Text>
            <TextInput style={styles.input} placeholder="e.g. kg, liters, g, units" placeholderTextColor={colors.text.muted} value={rmUnit} onChangeText={setRmUnit} />

            <Text style={styles.inputLabel}>Min Reorder Stock level</Text>
            <TextInput style={styles.input} placeholder="e.g. 10" placeholderTextColor={colors.text.muted} value={rmMinReorder} onChangeText={setRmMinReorder} keyboardType="numeric" />

            {editingMaterialId !== null && (
              <View style={{ marginTop: 8, padding: 12, backgroundColor: colors.bg.secondary, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, marginBottom: 6 }}>📦 PHYSICAL STOCK LEVEL ADJUSTMENT</Text>
                
                <Text style={styles.inputLabel}>Current Stock Quantity ({rmUnit})</Text>
                <TextInput
                  style={[styles.input, { fontWeight: '700' }]}
                  placeholder="Enter current physical stock qty"
                  placeholderTextColor={colors.text.muted}
                  value={rmStockLevel}
                  onChangeText={setRmStockLevel}
                  keyboardType="numeric"
                />
                
                {parseFloat(rmStockLevel) !== rmOriginalStockLevel && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={[styles.inputLabel, { color: colors.warning }]}>Reason for Stock Adjustment *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Physical count mismatch, spillage loss, moisture absorption adjustment"
                      placeholderTextColor={colors.text.muted}
                      value={rmAdjustmentReason}
                      onChangeText={setRmAdjustmentReason}
                    />
                  </View>
                )}
              </View>
            )}
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={onSave}>
              <Text style={styles.submitBtnText}>{editingMaterialId ? 'Save Changes' : 'Define Material'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
