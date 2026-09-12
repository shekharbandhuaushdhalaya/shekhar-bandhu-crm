import { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ViewStyle, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { LightColors, Radius, Shadows, Spacing } from '../constants/theme';

type Action = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
};

export function WorkspaceHeader({ title, subtitle, eyebrow, actions = [] }: { title: string; subtitle?: string; eyebrow?: string; actions?: Action[] }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {actions.length ? (
        <View style={styles.headerActions}>
          {actions.map((action) => {
            const primary = action.variant !== 'secondary';
            return (
              <TouchableOpacity
                key={action.label}
                style={[styles.action, primary ? styles.actionPrimary : styles.actionSecondary]}
                onPress={action.onPress}
                activeOpacity={0.78}
              >
                {action.icon ? <Ionicons name={action.icon} size={17} color={primary ? '#fff' : colors.primary} /> : null}
                <Text style={[styles.actionText, primary ? styles.actionTextPrimary : styles.actionTextSecondary]}>{action.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function WorkspaceTabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: keyof typeof Ionicons.glyphMap; badge?: number }[]; value: T; onChange: (id: T) => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <TouchableOpacity key={tab.id} style={[styles.tab, active && styles.tabActive]} onPress={() => onChange(tab.id)} activeOpacity={0.75}>
            {tab.icon ? <Ionicons name={tab.icon} size={16} color={active ? colors.primary : colors.text.muted} /> : null}
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            {typeof tab.badge === 'number' && tab.badge > 0 ? (
              <View style={[styles.tabBadge, active && styles.tabBadgeActive]}><Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>{tab.badge}</Text></View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function MetricTile({ label, value, icon, tone = 'primary', helper }: { label: string; value: string; icon?: keyof typeof Ionicons.glyphMap; tone?: 'primary'|'success'|'warning'|'info'|'purple'|'danger'; helper?: string }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const toneColor = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'info' ? colors.info : tone === 'purple' ? colors.purple : tone === 'danger' ? colors.danger : colors.primary;
  const toneBg = tone === 'success' ? colors.successLight : tone === 'warning' ? colors.warningLight : tone === 'info' ? colors.infoLight : tone === 'danger' ? colors.dangerLight : colors.primaryLight;
  return (
    <View style={styles.metric}>
      <View style={styles.metricTop}>
        <Text style={styles.metricLabel}>{label}</Text>
        {icon ? <View style={[styles.metricIcon, { backgroundColor: toneBg }]}><Ionicons name={icon} size={15} color={toneColor} /></View> : null}
      </View>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
      {helper ? <Text style={styles.metricHelper}>{helper}</Text> : null}
    </View>
  );
}

export function Panel({ title, subtitle, action, children, style }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; style?: ViewStyle }) {
  const styles = useStyles(createStyles);
  return (
    <View style={[styles.panel, style]}>
      {(title || subtitle || action) ? (
        <View style={styles.panelHeader}>
          <View style={{ flex: 1 }}>
            {title ? <Text style={styles.panelTitle}>{title}</Text> : null}
            {subtitle ? <Text style={styles.panelSubtitle}>{subtitle}</Text> : null}
          </View>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function EmptyState({ icon = 'file-tray-outline', title, message }: { icon?: keyof typeof Ionicons.glyphMap; title: string; message?: string }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={22} color={colors.text.muted} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
    </View>
  );
}

export function WorkspaceLoading({ title = 'Loading workspace…', message = 'Fetching the latest business data.' }: { title?: string; message?: string }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.stateCard}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
    </View>
  );
}

export function WorkspaceError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.stateCard}>
      <View style={styles.emptyIcon}><Ionicons name="alert-circle-outline" size={22} color={colors.danger} /></View>
      <Text style={styles.stateTitle}>Unable to load this workspace</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {onRetry ? <TouchableOpacity style={styles.retryButton} onPress={onRetry}><Text style={styles.retryText}>Try again</Text></TouchableOpacity> : null}
    </View>
  );
}

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral'|'success'|'warning'|'danger'|'info' }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const fg = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : tone === 'info' ? colors.info : colors.text.secondary;
  const bg = tone === 'success' ? colors.successLight : tone === 'warning' ? colors.warningLight : tone === 'danger' ? colors.dangerLight : tone === 'info' ? colors.infoLight : colors.bg.secondary;
  return <View style={[styles.statusPill, { backgroundColor: bg }]}><Text style={[styles.statusText, { color: fg }]}>{label}</Text></View>;
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  headerCopy: { flex: 1, maxWidth: 760 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase', color: colors.primary, marginBottom: 5 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.35 },
  subtitle: { fontSize: 13, lineHeight: 19, color: colors.text.secondary, marginTop: 5, maxWidth: 680 },
  headerActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  action: { minHeight: 38, paddingHorizontal: 14, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1 },
  actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionSecondary: { backgroundColor: colors.bg.card, borderColor: colors.border },
  actionText: { fontSize: 12.5, fontWeight: '700' },
  actionTextPrimary: { color: '#fff' },
  actionTextSecondary: { color: colors.primary },
  tabs: { paddingHorizontal: Spacing.lg, paddingBottom: 1, gap: 4, minHeight: 42, alignItems: 'flex-end' },
  tab: { minHeight: 38, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 12.5, fontWeight: '600', color: colors.text.secondary },
  tabTextActive: { color: colors.text.primary, fontWeight: '800' },
  tabBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary },
  tabBadgeActive: { backgroundColor: colors.primaryLight },
  tabBadgeText: { fontSize: 9.5, fontWeight: '800', color: colors.text.muted },
  tabBadgeTextActive: { color: colors.primary },
  metric: { flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 155, backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: 15, ...Shadows.card },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  metricLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3, color: colors.text.muted, textTransform: 'uppercase' },
  metricIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  metricValue: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.3, marginTop: 8 },
  metricHelper: { fontSize: 11, lineHeight: 16, color: colors.text.secondary, marginTop: 3 },
  panel: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, ...Shadows.card },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  panelTitle: { fontSize: 15, lineHeight: 20, fontWeight: '800', color: colors.text.primary },
  panelSubtitle: { fontSize: 11.5, lineHeight: 17, color: colors.text.secondary, marginTop: 2 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, paddingHorizontal: 18 },
  emptyIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: colors.text.primary, textAlign: 'center' },
  emptyMessage: { fontSize: 11.5, lineHeight: 17, color: colors.text.muted, textAlign: 'center', maxWidth: 360, marginTop: 4 },
  stateCard: { margin: Spacing.lg, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.lg, padding: 28, alignItems: 'center', justifyContent: 'center', minHeight: 180, ...Shadows.card },
  stateTitle: { fontSize: 14, fontWeight: '800', color: colors.text.primary, marginTop: 10, textAlign: 'center' },
  stateMessage: { fontSize: 11.5, lineHeight: 17, color: colors.text.muted, marginTop: 4, textAlign: 'center', maxWidth: 420 },
  retryButton: { marginTop: 14, minHeight: 36, paddingHorizontal: 14, borderRadius: Radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  statusText: { fontSize: 9.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.35 },
});
