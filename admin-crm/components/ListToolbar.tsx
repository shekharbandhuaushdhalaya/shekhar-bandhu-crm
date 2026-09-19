import React, { ReactNode } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
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
  totalCount?: number;
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
  totalCount,
  containerStyle,
}: ListToolbarProps) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.toolbarInner}>
        <View style={[styles.searchBox, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={17} color={colors.text.muted} />
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
              <Ionicons name="close-circle" size={17} color={colors.text.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {renderFilters ? <View style={styles.filters}>{renderFilters()}</View> : null}

        <View style={styles.toolbarSpacer} />

        {itemCount !== undefined ? (
          <Text style={styles.countText}>
            {totalCount !== undefined ? `${itemCount} of ${totalCount} results` : `${itemCount} results`}
          </Text>
        ) : null}

        {renderActions ? renderActions() : primaryAction ? (
          <TouchableOpacity
            style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
            onPress={primaryAction.onPress}
          >
            {primaryAction.icon && <Ionicons name={primaryAction.icon} size={14} color="#fff" />}
            <Text style={styles.primaryActionText}>{primaryAction.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  toolbarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 10,
    flexWrap: 'wrap',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 280,
    minWidth: 200,
    minHeight: 42,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    ...Typography.bodySm,
    flex: 1,
    minWidth: 120,
    height: 38,
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  clearBtn: { padding: 4 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  toolbarSpacer: { flexGrow: 1 },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: Radius.sm,
  },
  primaryActionText: {
    ...Typography.bodySm,
    color: '#fff',
    fontWeight: '700',
  },
  countText: {
    ...Typography.caption,
    color: colors.text.muted,
    fontWeight: '500',
  },
});
