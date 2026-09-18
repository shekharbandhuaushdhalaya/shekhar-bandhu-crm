import { AppText as Text } from './AppText';
import { WorkspaceButton } from './WorkspaceButton';
import { View, StyleSheet, ViewStyle, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { LightColors, Spacing, Radius, Shadows, Typography, ControlHeight } from '../constants/theme';
import { PressableOpacity as TouchableOpacity } from './PressableOpacity';
import React from 'react';
import { useRouter } from 'expo-router';

type Action = {
  key?: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
};

export type PageHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: Action[];
  renderActions?: () => React.ReactNode;
  backButton?: boolean | (() => void);
  style?: ViewStyle;
};

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    backgroundColor: colors.bg.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    flex: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  titleArea: {
    flex: 1,
    maxWidth: 800,
  },
  eyebrow: {
    ...Typography.eyebrow,
    color: colors.primary,
    fontWeight: '800',
    marginBottom: 4,
  },
  title: {
    ...Typography.h1,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    ...Typography.bodySm,
    color: colors.text.secondary,
    marginTop: 6,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
});

export function PageHeader({ title, subtitle, eyebrow, actions, renderActions, backButton, style }: PageHeaderProps) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const router = useRouter();

  const handleBack = () => {
    if (typeof backButton === 'function') {
      backButton();
    } else {
      router.back();
    }
  };

  return (
    <View style={[styles.container, width < 768 && { flexDirection: 'column', alignItems: 'stretch', paddingHorizontal: Spacing.md }, style]}>
      <View style={styles.leftGroup}>
        {backButton ? (
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.titleArea}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      
      <View style={[styles.actions, width < 768 && { justifyContent: 'flex-start', marginTop: Spacing.sm }]}>
        {renderActions ? renderActions() : null}
        {actions?.map((action, i) => (
          <WorkspaceButton key={action.key || String(i)} {...action} />
        ))}
      </View>
    </View>
  );
}
