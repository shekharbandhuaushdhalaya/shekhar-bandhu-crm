import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { LightColors, Spacing, Radius, Shadows } from '../constants/theme';

type Action = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: colors.bg.primary,
  },
  titleArea: {
    flex: 1,
    maxWidth: 760,
  },
  title: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.text.secondary,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  actionBtn: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 13,
    borderRadius: Radius.md,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...Shadows.card,
  },
  actionText: {
    fontSize: 12.5,
    fontWeight: '750',
    color: colors.primary,
  },
});

export default function ScreenHeader({ title, subtitle, actions, style }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.titleArea}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actions?.length ? (
        <View style={styles.actions}>
          {actions.map((action) => (
            <TouchableOpacity key={action.key} style={styles.actionBtn} onPress={action.onPress} activeOpacity={0.72}>
              {action.icon ? <Ionicons name={action.icon} size={16} color={action.color || colors.primary} /> : null}
              <Text style={[styles.actionText, action.color ? { color: action.color } : undefined]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}
