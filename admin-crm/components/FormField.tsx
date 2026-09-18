import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Typography, Spacing, Radius } from '../constants/theme';

export interface FormFieldProps {
  label: string;
  description?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  style?: any;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  description,
  required,
  error,
  children,
  style,
}) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.text.primary }]}>
          {label}
        </Text>
        {required && <Text style={[styles.asterisk, { color: colors.danger }]}>*</Text>}
      </View>

      {description && (
        <Text style={[styles.description, { color: colors.text.muted }]}>
          {description}
        </Text>
      )}

      <View style={styles.inputWrapper}>
        {children}
      </View>

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    ...Typography.bodySm,
    fontWeight: '700',
  },
  asterisk: {
    ...Typography.bodySm,
    fontWeight: '700',
    marginLeft: 2,
  },
  description: {
    ...Typography.caption,
    marginBottom: 8,
  },
  inputWrapper: {
    // The inner input component will handle its own border/focus states.
  },
  error: {
    ...Typography.caption,
    marginTop: 6,
    fontWeight: '600',
  },
});
