import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, FlatList, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Typography, Spacing, Radius, Shadows, ControlHeight } from '../constants/theme';

export interface SelectOption {
  value: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export interface ResponsiveSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: any;
}

export const ResponsiveSelect: React.FC<ResponsiveSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  style,
}) => {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find(o => o.value === value);

  if (Platform.OS === 'web') {
    // Native select element is universally better for accessibility on Web
    return (
      <View style={[styles.webWrapper, style, { backgroundColor: colors.bg.secondary, borderColor: colors.border }]}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            ...Typography.bodySm,
            width: '100%',
            height: ControlHeight.input,
            border: 'none',
            background: 'transparent',
            color: colors.text.primary,
            paddingLeft: Spacing.sm,
            paddingRight: Spacing.xl,
            outline: 'none',
            appearance: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <option value="" disabled>{placeholder}</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Ionicons name="chevron-down" size={16} color={colors.text.muted} style={styles.webIcon} pointerEvents="none" />
      </View>
    );
  }

  // Mobile Implementation (Modal Bottom Sheet / Dropdown)
  return (
    <>
      <TouchableOpacity
        style={[
          styles.mobileTrigger,
          style,
          { backgroundColor: colors.bg.secondary, borderColor: colors.border },
          disabled && { opacity: 0.5 }
        ]}
        onPress={() => !disabled && setIsOpen(true)}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          {selectedOption?.icon && (
            <Ionicons name={selectedOption.icon} size={16} color={colors.text.secondary} />
          )}
          <Text style={[styles.triggerText, { color: selectedOption ? colors.text.primary : colors.text.muted }]} numberOfLines={1}>
            {selectedOption ? selectedOption.label : placeholder}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={16} color={colors.text.muted} />
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsOpen(false)} />
          <View style={[styles.modalContent, { backgroundColor: colors.bg.primary }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>{placeholder}</Text>
              <TouchableOpacity onPress={() => setIsOpen(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={options}
              keyExtractor={item => item.value}
              contentContainerStyle={{ padding: Spacing.md, gap: 4 }}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <TouchableOpacity
                    style={[
                      styles.optionItem,
                      isSelected && { backgroundColor: colors.primary + '15' }
                    ]}
                    onPress={() => {
                      onChange(item.value);
                      setIsOpen(false);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {item.icon && (
                        <Ionicons name={item.icon} size={20} color={isSelected ? colors.primary : colors.text.muted} />
                      )}
                      <Text style={[
                        styles.optionText,
                        { color: isSelected ? colors.primary : colors.text.primary },
                        isSelected && { fontWeight: '700' }
                      ]}>
                        {item.label}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  webWrapper: {
    borderWidth: 1,
    borderRadius: Radius.md,
    height: ControlHeight.input,
    position: 'relative',
    overflow: 'hidden',
  },
  webIcon: {
    position: 'absolute',
    right: Spacing.md,
    top: 14,
  },
  mobileTrigger: {
    borderWidth: 1,
    borderRadius: Radius.md,
    height: ControlHeight.input,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
  },
  triggerText: {
    ...Typography.bodySm,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '80%',
    ...Shadows.hover,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  modalTitle: {
    ...Typography.h3,
  },
  closeBtn: {
    padding: 4,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  optionText: {
    ...Typography.body,
  },
});
