import React, { useId } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../utils/themeContext';
import { Typography, Spacing, Radius } from '../constants/theme';
import { HelpTooltip } from './HelpTooltip';

export interface FormFieldProps {
  label: string;
  description?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  style?: any;
  id?: string;
  /** Optional help tooltip shown inline next to the label */
  helpTooltip?: { title: string; description: string };
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  description,
  required,
  error,
  children,
  style,
  id: customId,
  helpTooltip,
}) => {
  const { colors } = useTheme();
  
  const generatedId = useId();
  const fieldId = customId || `field-${generatedId}`;
  const labelId = `${fieldId}-label`;
  const descriptionId = `${fieldId}-desc`;
  const errorId = `${fieldId}-error`;

  const ariaDescribedBy = [
    description ? descriptionId : null,
    error ? errorId : null,
  ].filter(Boolean).join(' ') || undefined;

  const enhancedChildren = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      return React.cloneElement(child, {
        nativeID: fieldId,
        accessibilityLabelledBy: labelId,
        accessibilityDescribedBy: ariaDescribedBy,
        accessibilityInvalid: !!error,
      } as any);
    }
    return child;
  });

  return (
    <View style={[styles.container, style]} accessible={false}>
      <View style={styles.labelRow}>
        <Text nativeID={labelId} accessibilityRole="header" style={[styles.label, { color: colors.text.primary }]}>
          {label}
        </Text>
        {required && <Text style={[styles.asterisk, { color: colors.danger }]} aria-hidden={true}>*</Text>}
        {helpTooltip && <HelpTooltip title={helpTooltip.title} description={helpTooltip.description} />}
      </View>

      {description && (
        <Text nativeID={descriptionId} style={[styles.description, { color: colors.text.muted }]}>
          {description}
        </Text>
      )}

      <View style={styles.inputWrapper}>
        {enhancedChildren}
      </View>

      {error ? (
        <Text nativeID={errorId} accessibilityLiveRegion="polite" style={[styles.error, { color: colors.danger }]}>
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
