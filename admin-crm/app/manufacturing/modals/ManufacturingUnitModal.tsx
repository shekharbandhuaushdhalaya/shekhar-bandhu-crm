import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';
import { ManufacturingUnit } from '../../../utils/api';

interface Props {
  visible: boolean;
  unitName: string; setUnitName: (v: string) => void;
  unitCode: string; setUnitCode: (v: string) => void;
  unitAddress: string; setUnitAddress: (v: string) => void;
  unitCity: string; setUnitCity: (v: string) => void;
  unitState: string; setUnitState: (v: string) => void;
  unitPincode: string; setUnitPincode: (v: string) => void;
  unitContact: string; setUnitContact: (v: string) => void;
  unitPhone: string; setUnitPhone: (v: string) => void;
  unitError: string;
  onClose: () => void;
  onSave: () => void;
}

export default function ManufacturingUnitModal({
  visible,
  unitName, setUnitName, unitCode, setUnitCode, unitAddress, setUnitAddress,
  unitCity, setUnitCity, unitState, setUnitState, unitPincode, setUnitPincode,
  unitContact, setUnitContact, unitPhone, setUnitPhone,
  unitError, onClose, onSave
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Define New Manufacturing Unit</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          {unitError ? <Text style={styles.modalError}>{unitError}</Text> : null}
          <ScrollView style={styles.modalForm}>
            <Text style={styles.inputLabel}>Unit Name *</Text>
            <TextInput style={styles.input} placeholder="e.g. Varanasi Factory" placeholderTextColor={colors.text.muted} value={unitName} onChangeText={setUnitName} />
            <Text style={styles.inputLabel}>Unit Code / Abbreviation *</Text>
            <TextInput style={styles.input} placeholder="e.g. MFG-VARANASI" placeholderTextColor={colors.text.muted} value={unitCode} onChangeText={setUnitCode} />
            <Text style={styles.inputLabel}>Address Line 1</Text>
            <TextInput style={styles.input} placeholder="e.g. Phase 2 Industrial Area" placeholderTextColor={colors.text.muted} value={unitAddress} onChangeText={setUnitAddress} />
            <Text style={styles.inputLabel}>City</Text>
            <TextInput style={styles.input} placeholder="e.g. Varanasi" placeholderTextColor={colors.text.muted} value={unitCity} onChangeText={setUnitCity} />
            <Text style={styles.inputLabel}>State</Text>
            <TextInput style={styles.input} placeholder="e.g. Uttar Pradesh" placeholderTextColor={colors.text.muted} value={unitState} onChangeText={setUnitState} />
            <Text style={styles.inputLabel}>Pincode</Text>
            <TextInput style={styles.input} placeholder="e.g. 221002" placeholderTextColor={colors.text.muted} value={unitPincode} onChangeText={setUnitPincode} keyboardType="numeric" />
            <Text style={styles.inputLabel}>Contact Person</Text>
            <TextInput style={styles.input} placeholder="Name" placeholderTextColor={colors.text.muted} value={unitContact} onChangeText={setUnitContact} />
            <Text style={styles.inputLabel}>Phone Number</Text>
            <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={colors.text.muted} value={unitPhone} onChangeText={setUnitPhone} keyboardType="phone-pad" />
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={onSave}>
              <Text style={styles.submitBtnText}>Save Unit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
