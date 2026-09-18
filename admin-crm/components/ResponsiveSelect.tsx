import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, FlatList, Platform, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/themeContext';
import { Typography, Spacing, Radius, Shadows, ControlHeight } from '../constants/theme';

export interface SelectOption {
  value: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  description?: string;
}

export interface ResponsiveSelectProps {
  options?: SelectOption[]; // Optional if groups are provided
  groups?: { title: string; options: SelectOption[] }[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  style?: any;
}

export const ResponsiveSelect: React.FC<ResponsiveSelectProps> = ({
  options = [],
  groups,
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  disabled = false,
  searchable = false,
  searchPlaceholder = 'Search...',
  style,
}) => {
  const { colors } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const flatOptions = groups ? groups.flatMap(g => g.options) : options;
  const selectedOption = flatOptions.find(o => o.value === value);

  const handleClose = () => {
    setSearchQuery('');
    setIsOpen(false);
  };

  const isSearchMatch = (opt: SelectOption) => opt.label.toLowerCase().includes(searchQuery.toLowerCase()) || opt.description?.toLowerCase().includes(searchQuery.toLowerCase());

  const filteredOptions = searchable && searchQuery ? flatOptions.filter(isSearchMatch) : flatOptions;
  const filteredGroups = groups && searchable && searchQuery 
    ? groups.map(g => ({ ...g, options: g.options.filter(isSearchMatch) })).filter(g => g.options.length > 0)
    : groups;

  if (Platform.OS === 'web' && !searchable) {
    // Keep the native select for simple, non-searchable choices on Web
    return (
      <View style={[styles.webWrapper, style, { backgroundColor: colors.bg.secondary, borderColor: colors.border }]}>
        <select
          value={value || ''}
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
          {groups ? groups.map(g => (
            <optgroup key={g.title} label={g.title}>
              {g.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </optgroup>
          )) : options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Ionicons name="chevron-down" size={16} color={colors.text.muted} style={styles.webIcon} pointerEvents="none" />
      </View>
    );
  }

  // Searchable and mobile implementation (responsive modal selector)
  return (
    <>
      {label ? (
        <Text style={{ ...Typography.caption, color: colors.text.secondary, fontWeight: '600', marginBottom: 6 }}>
          {label}
        </Text>
      ) : null}
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
        onRequestClose={handleClose}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={handleClose} />
          <View style={[styles.modalContent, { backgroundColor: colors.bg.primary }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>{placeholder}</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close dialog">
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {searchable && (
              <View style={{ padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm }}>
                  <Ionicons name="search" size={16} color={colors.text.muted} />
                  <TextInput
                    style={{ flex: 1, height: 40, marginLeft: Spacing.sm, ...Typography.body, color: colors.text.primary, borderWidth: 0, outlineStyle: 'none' } as any}
                    placeholder={searchPlaceholder}
                    placeholderTextColor={colors.text.muted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoFocus={true}
                  />
                  {searchQuery ? (
                    <TouchableOpacity onPress={() => setSearchQuery('')} accessibilityRole="button" accessibilityLabel="Clear">
                      <Ionicons name="close-circle" size={16} color={colors.text.muted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )}

            {filteredGroups ? (
              <FlatList
                data={filteredGroups.flatMap(g => [{ _type: 'header' as const, title: g.title }, ...g.options.map(o => ({ _type: 'item' as const, ...o }))])}
                keyExtractor={(item, index) => item._type === 'header' ? `header-${item.title}` : (item as SelectOption).value}
                contentContainerStyle={{ padding: Spacing.md, gap: 4 }}
                renderItem={({ item }) => {
                  if (item._type === 'header') {
                    return <Text style={{ ...Typography.caption, fontWeight: '700', color: colors.text.muted, marginTop: Spacing.sm, marginBottom: 2 }}>{item.title.toUpperCase()}</Text>;
                  }
                  const opt = item as any;
                  const isSelected = opt.value === value;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.optionItem,
                        isSelected && { backgroundColor: colors.primary + '15' }
                      ]}
                      onPress={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        {opt.icon && (
                          <Ionicons name={opt.icon} size={20} color={isSelected ? colors.primary : colors.text.muted} />
                        )}
                        <Text style={[
                          styles.optionText,
                          { color: isSelected ? colors.primary : colors.text.primary },
                          isSelected && { fontWeight: '700' }
                        ]}>
                          {opt.label}
                        </Text>
                      </View>
                      {isSelected && (
                        <Ionicons name="checkmark" size={20} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            ) : (
              <FlatList
                data={filteredOptions}
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
            )}
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
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderBottomWidth: 1 },
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
