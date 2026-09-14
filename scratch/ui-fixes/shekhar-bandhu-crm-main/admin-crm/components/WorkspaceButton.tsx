import React from 'react';
import { ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/themeContext';
import { Radius, Spacing, Typography, ControlHeight } from '../constants/theme';
import { AppText } from './AppText';
import { PressableOpacity } from './PressableOpacity';

export function WorkspaceButton({ label, icon, onPress, variant = 'primary', disabled, loading, color, style }: {
  label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; loading?: boolean; color?: string; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const foreground = variant === 'primary' ? '#fff' : color || colors.primary;
  return <PressableOpacity onPress={onPress} disabled={disabled || loading} accessibilityState={{ disabled: disabled || loading, busy: loading }}
    style={[{ minHeight: ControlHeight.buttonMd, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
      borderWidth: variant === 'ghost' ? 0 : 1, borderColor: variant === 'primary' ? color || colors.primary : colors.border,
      backgroundColor: variant === 'primary' ? color || colors.primary : variant === 'secondary' ? colors.bg.card : 'transparent', opacity: disabled ? 0.5 : 1 }, style]}>
    {loading ? <ActivityIndicator color={foreground} size="small" /> : icon ? <Ionicons name={icon} size={18} color={foreground} /> : null}
    <AppText style={[Typography.bodySm, { color: foreground, fontWeight: '700' }]}>{label}</AppText>
  </PressableOpacity>;
}
