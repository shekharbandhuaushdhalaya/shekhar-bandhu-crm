import React, { forwardRef, useState } from 'react';
import { TextInput, TextInputProps, StyleSheet, TextStyle, Platform } from 'react-native';
import { useTheme } from '../utils/themeContext';
import { Radius, Spacing, Typography, ControlHeight } from '../constants/theme';
import { fontForStyle } from './AppText';

/** Keeps each field's value, validation, keyboard and callbacks unchanged. */
export const AppTextInput = forwardRef<TextInput, TextInputProps>(function AppTextInput({ style, onFocus, onBlur, placeholderTextColor, ...props }, ref) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const resolved: TextStyle = StyleSheet.flatten([style]);
  const hasNoBorder = resolved.borderWidth === 0;
  return <TextInput ref={ref} {...props} placeholderTextColor={placeholderTextColor || colors.text.muted}
    style={[Typography.body, { color: colors.text.primary, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.sm, paddingHorizontal: Spacing.sm }, 
      (Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}), style,
      { minHeight: Math.max(ControlHeight.input, Number(resolved.minHeight) || 0), fontFamily: fontForStyle(resolved) },
      focused && !hasNoBorder && { borderColor: colors.primary, borderWidth: 1 }]}
    onFocus={event => { setFocused(true); onFocus?.(event); }}
    onBlur={event => { setFocused(false); onBlur?.(event); }}
  />;
});
