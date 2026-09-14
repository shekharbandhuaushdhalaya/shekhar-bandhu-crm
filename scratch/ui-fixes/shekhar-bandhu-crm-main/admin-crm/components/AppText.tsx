import React, { forwardRef } from 'react';
import { Text as NativeText, TextProps, StyleSheet, TextStyle } from 'react-native';
import { Typography } from '../constants/theme';

export function fontForStyle(style: TextStyle) {
  const family = style.fontFamily || Typography.body.fontFamily;
  if (!family.startsWith('Inter') && !family.startsWith('Manrope')) return family;
  const heading = family.startsWith('Manrope');
  const weight = style.fontWeight === 'bold' ? 700 : Number(style.fontWeight || 500);
  const matched = weight >= 750 ? 800 : weight >= 650 ? 700 : weight >= 550 ? 600 : 500;
  return `${heading ? 'Manrope' : 'Inter'}_${matched}`;
}

export const AppText = forwardRef<NativeText, TextProps>(function AppText({ style, ...props }, ref) {
  const resolved = StyleSheet.flatten([Typography.body, style]);
  return <NativeText ref={ref} {...props} style={[Typography.body, style, { fontFamily: fontForStyle(resolved) }]} />;
});
