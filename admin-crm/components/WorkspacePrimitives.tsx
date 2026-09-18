import { PressableOpacity as TouchableOpacity } from './PressableOpacity';
import { AppText as Text } from './AppText';
import { WorkspaceButton } from './WorkspaceButton';
import { Skeleton } from './Skeleton';
export { WorkspaceButton } from './WorkspaceButton';
export { WorkspaceTransition } from './WorkspaceTransition';
import React, { ReactNode } from 'react';
import { View, StyleSheet, ScrollView, ViewStyle, useWindowDimensions, StyleProp, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { LightColors, Radius, Shadows, Spacing, withAlpha, Typography } from '../constants/theme';



export function selectedIcon(icon: keyof typeof Ionicons.glyphMap, active: boolean): keyof typeof Ionicons.glyphMap {
  const filled = icon.toString().replace(/-outline$/, '') as keyof typeof Ionicons.glyphMap;
  return active && filled in Ionicons.glyphMap ? filled : icon;
}


export function WorkspaceBreadcrumbs({ items }: { items: { label: string; onPress?: () => void }[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: Spacing.md }}>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && <Ionicons name="chevron-forward" size={14} color={colors.text.muted} style={{ marginHorizontal: 6 }} />}
          <TouchableOpacity onPress={item.onPress} disabled={!item.onPress}>
            <Text style={{ ...Typography.bodySm, fontWeight: item.onPress ? '600' : '800', color: item.onPress ? colors.text.secondary : colors.text.primary }}>
              {item.label}
            </Text>
          </TouchableOpacity>
        </React.Fragment>
      ))}
    </View>
  );
}

export function WorkspaceTabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: keyof typeof Ionicons.glyphMap; badge?: number }[]; value: T; onChange: (id: T) => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScrollView} contentContainerStyle={styles.tabs}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <TouchableOpacity key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.tab, active && styles.tabActive]} onPress={() => onChange(tab.id)} activeOpacity={0.75}>
            {tab.icon ? <Ionicons name={selectedIcon(tab.icon, active)} size={18} color={active ? colors.primary : colors.text.muted} /> : null}
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

export function MetricTile({ label, value, icon, tone = 'primary', helper, loading = false }: { loading?: boolean; label: string; value: string; icon?: keyof typeof Ionicons.glyphMap; tone?: 'primary'|'success'|'warning'|'info'|'purple'|'danger'; helper?: string }) {
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
      <View style={{ marginTop: Spacing.sm }}>{loading ? <Skeleton width="65%" height={28} /> : <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>}</View>
      {helper ? <Text style={styles.metricHelper}>{helper}</Text> : null}
    </View>
  );
}

export function Panel({ title, subtitle, action, children, style }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
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

export function EmptyState({ icon = 'file-tray-outline', title, message, actionLabel, onAction }: { icon?: keyof typeof Ionicons.glyphMap; title: ReactNode; message?: ReactNode; actionLabel?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={icon} size={22} color={colors.text.muted} /></View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={{ marginTop: 16, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 }} onPress={onAction}>
          <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 13 }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function WorkspaceLoading({ title = 'Loading workspace…', message = 'Fetching the latest business data.' }: { title?: string; message?: string }) {
  const styles = useStyles(createStyles);
  return <View style={styles.stateCard} accessibilityRole="progressbar" accessibilityLabel={title} accessibilityState={{ busy: true }}>
    <View style={{ width: '100%', maxWidth: 680, gap: Spacing.md }}>
      <View style={{ flexDirection: 'row', gap: Spacing.md }}>
        {[0, 1, 2].map(i => <View key={i} style={{ flex: 1, gap: Spacing.sm }}><Skeleton width="65%" height={12} /><Skeleton width="85%" height={28} /></View>)}
      </View>
      {[0, 1, 2].map(i => <Skeleton key={i} width={i === 2 ? '70%' : '100%'} height={14} />)}
    </View>
    <Text style={styles.stateTitle}>{title}</Text>
    <Text style={styles.stateMessage}>{message}</Text>
  </View>;
}

export function WorkspaceError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  return (
    <View style={styles.stateCard}>
      <View style={styles.emptyIcon}><Ionicons name="alert-circle-outline" size={22} color={colors.danger} /></View>
      <Text style={styles.stateTitle}>Unable to load this workspace</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {onRetry ? <WorkspaceButton label="Try again" onPress={onRetry} style={{ marginTop: Spacing.md }} /> : null}
    </View>
  );
}

export function StatusPill({ label, tone = 'neutral', color, style, textStyle }: { textStyle?: StyleProp<TextStyle>; label: ReactNode; tone?: 'neutral'|'success'|'warning'|'danger'|'info'|'purple'|'primary'; color?: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const fg = color || StyleSheet.flatten(textStyle)?.color || (tone === 'neutral' ? colors.text.secondary : colors[tone]);
  return <View style={[styles.statusPill, style, { backgroundColor: withAlpha(String(fg)), flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />
    <Text style={[styles.statusText, { color: fg }]}>{label}</Text>
  </View>;
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  headerCopy: { flex: 1, maxWidth: 760 },
  eyebrow: { ...Typography.eyebrow, fontWeight: '800', color: colors.primary, marginBottom: 5 },
  title: { ...Typography.h1, fontWeight: '800', color: colors.text.primary },
  subtitle: { ...Typography.bodySm, color: colors.text.secondary, marginTop: 5, maxWidth: 680 },
  headerActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  action: { minHeight: 44, paddingHorizontal: 14, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1 },
  actionPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionSecondary: { backgroundColor: colors.bg.card, borderColor: colors.border },
  actionText: { ...Typography.bodySm, fontWeight: '700' },
  actionTextPrimary: { color: '#fff' },
  actionTextSecondary: { color: colors.primary },
  // ScrollView defaults to flexGrow:1 on web when no `style` is given, which lets
  // this tab strip stretch to fill the container's remaining height (with its
  // short content then pinned to the bottom by `tabs.alignItems: 'flex-end'`
  // below) — producing a large blank gap above the tabs. Pin it to its content
  // height instead.
  tabsScrollView: { flexGrow: 0, flexShrink: 0 },
  tabs: { paddingHorizontal: Spacing.lg, paddingBottom: 1, gap: 4, minHeight: 42, alignItems: 'flex-end' },
  tab: { minHeight: 44, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...Typography.bodySm, fontWeight: '600', color: colors.text.secondary },
  tabTextActive: { color: colors.text.primary, fontWeight: '800' },
  tabBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary },
  tabBadgeActive: { backgroundColor: colors.primaryLight },
  tabBadgeText: { ...Typography.eyebrow, fontWeight: '800', color: colors.text.muted },
  tabBadgeTextActive: { color: colors.primary },
  metric: { flexGrow: 1, flexShrink: 1, flexBasis: 180, minWidth: 155, backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.md, ...Shadows.card },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  metricLabel: { ...Typography.caption, fontWeight: '600', color: colors.text.secondary },
  metricIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  metricValue: { ...Typography.h1, fontWeight: '800', color: colors.text.primary, marginTop: 8 },
  metricHelper: { ...Typography.caption, color: colors.text.secondary, marginTop: 3 },
  panel: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, ...Shadows.card },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  panelTitle: { ...Typography.h3, fontWeight: '800', color: colors.text.primary },
  panelSubtitle: { ...Typography.caption, color: colors.text.secondary, marginTop: 2 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, paddingHorizontal: 18 },
  emptyIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  emptyTitle: { ...Typography.bodySm, fontWeight: '800', color: colors.text.primary, textAlign: 'center' },
  emptyMessage: { ...Typography.caption, color: colors.text.muted, textAlign: 'center', maxWidth: 360, marginTop: 4 },
  stateCard: { margin: Spacing.lg, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.lg, padding: 28, alignItems: 'center', justifyContent: 'center', minHeight: 180, ...Shadows.card },
  stateTitle: { ...Typography.body, fontWeight: '800', color: colors.text.primary, marginTop: 10, textAlign: 'center' },
  stateMessage: { ...Typography.caption, color: colors.text.muted, marginTop: 4, textAlign: 'center', maxWidth: 420 },
  retryButton: { marginTop: 14, minHeight: 44, paddingHorizontal: 14, borderRadius: Radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  retryText: { ...Typography.bodySm, color: '#fff', fontWeight: '800' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm, alignSelf: 'flex-start' },
  statusText: { ...Typography.caption, fontWeight: '600' },
});
