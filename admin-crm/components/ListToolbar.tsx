import React, { ReactNode } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppTextInput as TextInput } from './AppTextInput';
import { PressableOpacity as TouchableOpacity } from './PressableOpacity';
import { AppText as Text } from './AppText';
import { useTheme, useStyles } from '../utils/themeContext';
import { Radius, Spacing, Typography, LightColors } from '../constants/theme';

export interface ListToolbarProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (text: string) => void;
  onSubmitEditing?: () => void;
  renderFilters?: () => ReactNode;
  primaryAction?: {
    label: string;
    icon?: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
  renderActions?: () => ReactNode;
  itemCount?: number;
  containerStyle?: StyleProp<ViewStyle>;
}

export function ListToolbar({
  searchPlaceholder = 'Search...',
  searchValue,
  onSearchChange,
  onSubmitEditing,
  renderFilters,
  primaryAction,
  renderActions,
  itemCount,
  containerStyle,
}: ListToolbarProps) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={[styles.toolbarInner, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.text.muted} />
        
        <TextInput
          style={[styles.searchInput, { color: colors.text.primary }]}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.text.muted}
          value={searchValue}
          onChangeText={onSearchChange}
          onSubmitEditing={onSubmitEditing}
        />
        
        {searchValue ? (
          <TouchableOpacity onPress={() => onSearchChange('')} style={styles.clearBtn} accessibilityRole="button" accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.text.muted} />
          </TouchableOpacity>
        ) : null}

        {renderFilters && (
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        )}
        
        {renderFilters && renderFilters()}

        <View style={{ flexGrow: 1 }} />

        {itemCount !== undefined && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{itemCount} Items</Text>
          </View>
        )}

        {renderActions ? renderActions() : primaryAction && (
          <TouchableOpacity
            style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
            onPress={primaryAction.onPress}
          >
            {primaryAction.icon && <Ionicons name={primaryAction.icon} size={14} color="#fff" />}
            <Text style={styles.primaryActionText}>{primaryAction.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  toolbarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.md,
    borderWidth: 1,
    minHeight: 46,
    gap: 10,
    flexWrap: 'wrap',
  },
  searchInput: {
    ...Typography.bodySm,
    flex: 1,
    height: 40,
    minWidth: 120,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  clearBtn: {
    padding: 4,
  },
  divider: {
    width: 1,
    height: 24,
    marginHorizontal: 4,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    marginLeft: 'auto',
  },
  primaryActionText: {
    ...Typography.bodySm,
    color: '#fff',
    fontWeight: '700',
  },
  countBadge: {
    backgroundColor: colors.bg.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  countText: {
    ...Typography.caption,
    color: colors.text.secondary,
    fontWeight: '600',
  },
});
