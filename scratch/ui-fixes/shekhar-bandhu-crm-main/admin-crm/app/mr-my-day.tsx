import { AppText as Text } from './../components/AppText';
import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';
import { LightColors, Radius, Spacing, Typography } from '../constants/theme';
import { EmptyState, MetricTile, Panel, StatusPill, WorkspaceHeader, WorkspaceLoading, WorkspaceError } from '../components/WorkspacePrimitives';

const req = <T = any,>(path: string) => api.requestJson<T>(path);

const money = (v: unknown) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

export default function MrMyDay() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [mrs, setMrs] = useState<any[]>([]);
  const [id, setId] = useState('');
  const [day, setDay] = useState<any>(null);
  const [coverage, setCoverage] = useState<any>(null);
  const [focus, setFocus] = useState<any[]>([]);
  const [attr, setAttr] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRepresentatives = async () => {
    setLoading(true); setError('');
    try {
      const rows = await req<any[]>('/medical-reps?active=true');
      setMrs(rows);
      if (rows[0]) await load(rows[0]._id, true);
      else setLoading(false);
    } catch (e: any) { setError(e.message || 'Unable to load representatives'); setLoading(false); }
  };
  useEffect(() => { loadRepresentatives(); }, []);

  const load = async (mrId: string, keepLoading = false) => {
    setId(mrId);
    setError('');
    if (!keepLoading) setLoading(true);
    try {
      const [d, c, f, a] = await Promise.all([
        req(`/mr-field/${mrId}/my-day`),
        req(`/mr-field/${mrId}/coverage`),
        req(`/mr-field/${mrId}/focus-products`),
        req(`/mr-field/${mrId}/attribution`),
      ]);
      setDay(d);
      setCoverage(c);
      setFocus(f);
      setAttr(a);
    } catch (e: any) {
      setError(e.message || 'Unable to load MR workboard');
    } finally { setLoading(false); }
  };

  const selectedMr = mrs.find((m) => m._id === id);
  const summary = day?.summary || {};
  const mrSelectStyle = { ...Typography.bodySm, minHeight: 40, padding: '0 12px', borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.bg.card, color: colors.text.primary, minWidth: 220, outline: 'none' } as any;

  return (
    <View style={styles.screen}>
      <WorkspaceHeader
        eyebrow="Field execution"
        title="MR My Day"
        subtitle={selectedMr ? `Today’s priorities for ${selectedMr.name}. Calls, follow-ups, collections and focus products in one view.` : 'Today’s calls, follow-ups, collections and focus products.'}
        actions={Platform.OS === 'web' ? [] : undefined}
      />
      <View style={styles.selectorRow}>
        <View style={styles.selectorLabelWrap}>
          <Ionicons name="person-outline" size={16} color={colors.primary} />
          <Text style={styles.selectorLabel}>Medical Representative</Text>
        </View>
        {Platform.OS === 'web' ? (
          <select value={id} onChange={(e: any) => load(e.target.value)} style={mrSelectStyle}>
            {mrs.map((m) => <option key={m._id} value={m._id}>{m.name}</option>)}
          </select>
        ) : null}
      </View>

      {loading ? <WorkspaceLoading title="Loading MR workboard…" message="Fetching today’s visits, coverage, focus products and attribution." /> : null}
      {!loading && error ? <WorkspaceError message={error} onRetry={() => id ? load(id) : loadRepresentatives()} /> : null}
      {!loading && !error ? <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.metrics}>
          <MetricTile label="Visits today" value={String(summary.visits || summary.calls || 0)} icon="medkit-outline" tone="info" />
          <MetricTile label="Follow-ups" value={String(summary.followups || summary.followUps || 0)} icon="repeat-outline" tone={Number(summary.followups || summary.followUps || 0) ? 'warning' : 'success'} />
          <MetricTile label="Collections" value={String(summary.collections || summary.paymentPromises || 0)} icon="wallet-outline" tone="success" />
          <MetricTile label="Orders" value={String(summary.pendingOrders || summary.orders || 0)} icon="cart-outline" tone="primary" />
        </View>

        {day?.nextVisit ? (
          <Panel title="Next visit" subtitle="The most immediate field action.">
            <View style={styles.nextVisit}>
              <View style={styles.nextIcon}><Ionicons name="navigate-outline" size={22} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.main}>{day.nextVisit.doctorName}</Text>
                <Text style={styles.muted}>{day.nextVisit.clinicName || day.nextVisit.city || 'Planned visit'}</Text>
              </View>
              <StatusPill label="Next" tone="info" />
            </View>
          </Panel>
        ) : null}

        <View style={styles.twoColumn}>
          <Panel title="Follow-ups due" subtitle="Conversations that need a response today." style={styles.columnPanel}>
            {(day?.followups || []).length ? (day.followups || []).map((x: any) => <Line key={x._id} a={x.doctorName} b={x.outcome || x.purpose || 'Follow-up due'} icon="repeat-outline" />) : <EmptyState icon="checkmark-circle-outline" title="No follow-ups due" />}
          </Panel>
          <Panel title="Collections" subtitle="Payment promises and collection commitments." style={styles.columnPanel}>
            {(day?.paymentPromises || []).length ? (day.paymentPromises || []).map((x: any) => <Line key={x._id} a={x.customerName} b={`${money(x.amount)} • ${x.status}`} icon="wallet-outline" />) : <EmptyState icon="checkmark-circle-outline" title="No collections due" />}
          </Panel>
        </View>

        <View style={styles.twoColumn}>
          <Panel title="Coverage" subtitle="Assigned accounts visited in the current cycle." style={styles.columnPanel}>
            <View style={styles.coverageHeader}><Text style={styles.coverageValue}>{coverage?.coveragePercent ?? 0}%</Text><Text style={styles.coverageLabel}>{coverage?.covered || 0} of {coverage?.totalAssigned || 0} accounts visited</Text></View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, Number(coverage?.coveragePercent || 0)))}%` }]} /></View>
            {(coverage?.missedPriorityA || []).slice(0, 8).map((x: any) => <Line key={x._id} a={x.entityName} b={x.area || x.territory || 'Not visited'} icon="alert-circle-outline" badge="Priority A" />)}
          </Panel>

          <Panel title="Focus products" subtitle="Promotion effort against configured focus targets." style={styles.columnPanel}>
            {focus.length ? focus.map((x: any) => <Line key={x._id} a={x.productName} b={`${x.calls}/${x.targetCalls || '-'} calls • ${x.orders}/${x.targetOrders || '-'} orders • ${money(x.sales)}`} icon="star-outline" />) : <EmptyState icon="star-outline" title="No focus products configured" />}
          </Panel>
        </View>

        <Panel title="Field effectiveness" subtitle="A concise outcome view — activity, business and field cost.">
          <View style={styles.metrics}>
            <MetricTile label="Attributed sales" value={money(attr?.sales)} icon="trending-up-outline" tone="success" />
            <MetricTile label="Calls" value={String(attr?.calls || 0)} icon="call-outline" tone="info" />
            <MetricTile label="Orders" value={String(attr?.orders || 0)} icon="cart-outline" />
            <MetricTile label="Visit → order" value={`${attr?.visitToOrderPercent || 0}%`} icon="git-compare-outline" tone="purple" />
            <MetricTile label="Field cost" value={money(attr?.fieldCost)} icon="cash-outline" tone="warning" />
          </View>
        </Panel>
      </ScrollView> : null}
    </View>
  );

  function Line({ a, b, icon, badge }: { a: string; b: string; icon: keyof typeof Ionicons.glyphMap; badge?: string }) {
    return (
      <View style={styles.line}>
        <View style={styles.lineIcon}><Ionicons name={icon} size={15} color={colors.text.muted} /></View>
        <View style={{ flex: 1 }}><Text style={styles.lineA}>{a}</Text><Text style={styles.muted}>{b}</Text></View>
        {badge ? <StatusPill label={badge} tone="warning" /> : null}
      </View>
    );
  }
}

const createStyles = (c: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg.primary },
  selectorRow: { marginHorizontal: Spacing.lg, marginBottom: Spacing.sm, padding: 10, paddingLeft: 13, borderRadius: Radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg.card, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  selectorLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  selectorLabel: { ...Typography.bodySm, fontWeight: '700', color: c.text.secondary },
  content: { padding: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.md, paddingBottom: 64, maxWidth: 1240, width: '100%', alignSelf: 'center' },
  metrics: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  twoColumn: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap', alignItems: 'flex-start' },
  columnPanel: { flexGrow: 1, flexShrink: 1, flexBasis: 430, minWidth: 290 },
  nextVisit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primaryLight },
  main: { ...Typography.h3, fontWeight: '800', color: c.text.primary },
  muted: { ...Typography.caption, color: c.text.secondary, marginTop: 2 },
  line: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  lineIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg.secondary },
  lineA: { ...Typography.bodySm, fontWeight: '700', color: c.text.primary },
  coverageHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  coverageValue: { ...Typography.display, fontWeight: '800', color: c.text.primary },
  coverageLabel: { ...Typography.caption, color: c.text.secondary },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: c.bg.secondary, overflow: 'hidden', marginTop: 8, marginBottom: 7 },
  progressFill: { height: '100%', backgroundColor: c.primary, borderRadius: 999 },
});
