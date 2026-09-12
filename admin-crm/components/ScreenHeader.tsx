import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { LightColors, Spacing, Radius, Shadows } from '../constants/theme';

type Action = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
  variant?: 'primary' | 'secondary' | 'danger';
};

type Props = {
  title: string;
  subtitle?: string;
  actions?: Action[];
  style?: ViewStyle;
};

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: colors.bg.primary,
  },
  titleArea: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  title: {
    fontSize: 23,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.25,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
    marginTop: 3,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  actionBtn: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg.card,
    ...Shadows.card,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dangerBtn: {
    backgroundColor: colors.dangerLight,
    borderColor: colors.danger + '35',
  },
  actionText: { fontSize: 13, fontWeight: '700', color: colors.primary },
});

export default function ScreenHeader({ title, subtitle, actions, style }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  const compact = width < 600;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.titleArea}>
        <Text style={styles.eyebrow}>Workspace</Text>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle && <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>}
      </View>
      {actions && actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map((action, index) => {
            const variant = action.variant || (index === 0 ? 'primary' : 'secondary');
            const isPrimary = variant === 'primary';
            const isDanger = variant === 'danger';
            return (
              <TouchableOpacity
                key={action.key}
                style={[styles.actionBtn, isPrimary && styles.primaryBtn, isDanger && styles.dangerBtn]}
                onPress={action.onPress}
                activeOpacity={0.78}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                {action.icon && (
                  <Ionicons
                    name={action.icon}
                    size={16}
                    color={action.color || (isPrimary ? colors.text.inverse : isDanger ? colors.danger : colors.primary)}
                  />
                )}
                {!compact && <Text style={[styles.actionText, isPrimary && { color: colors.text.inverse }, isDanger && { color: colors.danger }, action.color ? { color: action.color } : undefined]}>{action.label}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}
