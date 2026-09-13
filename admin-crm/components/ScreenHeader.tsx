import { PressableOpacity as TouchableOpacity } from './PressableOpacity';
import { AppText as Text } from './AppText';
import { WorkspaceButton } from './WorkspaceButton';
import { View, StyleSheet, ViewStyle, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { LightColors, Spacing, Radius, Shadows, Typography } from '../constants/theme';

type Action = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
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
  title: { ...Typography.h1, fontWeight: '800', color: colors.text.primary },
  subtitle: { ...Typography.bodySm, color: colors.text.secondary, marginTop: 4 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  actionBtn: {
    minHeight: 44,
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
  actionText: { ...Typography.bodySm, fontWeight: '700', color: colors.primary },
});

export default function ScreenHeader({ title, subtitle, actions, style }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.container, width < 600 && { flexDirection: 'column', alignItems: 'stretch', paddingHorizontal: Spacing.md }, style]}>
      <View style={styles.titleArea}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actions?.length ? (
        <View style={styles.actions}>
          {actions.map(({ key, ...action }) => <WorkspaceButton key={key} {...action} variant={action.variant || 'secondary'} />)}
        </View>
      ) : null}
    </View>
  );
}
