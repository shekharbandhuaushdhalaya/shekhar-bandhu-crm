import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { LightColors, Spacing, Radius } from '../constants/theme';

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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: colors.bg.primary,
  },
  titleArea: {
    flex: 1,
  },
  title: {
    fontSize: 21,
    fontWeight: '750',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary + '18',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
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
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {actions && actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map(action => (
            <TouchableOpacity
              key={action.key}
              style={styles.actionBtn}
              onPress={action.onPress}
              activeOpacity={0.7}
            >
              {action.icon && <Ionicons name={action.icon} size={16} color={action.color || colors.primary} />}
              <Text style={[styles.actionText, action.color ? { color: action.color } : undefined]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
