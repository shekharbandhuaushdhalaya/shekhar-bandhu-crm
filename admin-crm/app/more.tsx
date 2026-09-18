import { useFocusEffect } from 'expo-router';
import { DeviceEventEmitter, View, StyleSheet } from 'react-native';
import { useCallback } from 'react';
import { PageHeader as ScreenHeader } from '../components/PageHeader';
import { WorkspaceButton } from '../components/WorkspaceButton';
import { Panel } from '../components/WorkspacePrimitives';
import { Spacing, Typography } from '../constants/theme';
import { AppText as Text } from '../components/AppText';
import { useTheme, useStyles } from '../utils/themeContext';

/** Mobile entry point for the complete navigation drawer. */
export default function MoreScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  useFocusEffect(useCallback(() => {
    DeviceEventEmitter.emit('open_sidebar');
  }, []));

  return (
    <View style={styles.screen}>
      <ScreenHeader title="More" subtitle="Open the full CRM workspace navigation." />
      <View style={styles.content}>
        <Panel title="Workspace navigation" subtitle="All destinations remain available from the drawer.">
          <WorkspaceButton
            label="Open navigation"
            icon="menu-outline"
            variant="primary"
            onPress={() => DeviceEventEmitter.emit('open_sidebar')}
          />
          <Text style={styles.hint}>Use the menu to reach customers, inventory, finance, reports and administration.</Text>
        </Panel>
      </View>
    </View>
  );
}

const createStyles = (colors: typeof import('../constants/theme').LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: Spacing.lg, gap: Spacing.md },
  hint: { ...Typography.bodySm, color: colors.text.secondary, marginTop: Spacing.md },
});
