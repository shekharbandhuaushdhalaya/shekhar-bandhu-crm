import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getApiBaseUrl } from '../utils/api';
import { authStorage } from '../utils/storage';
import { useTheme, useStyles } from '../utils/themeContext';
import { LightColors, Radius, Spacing } from '../constants/theme';
import { EmptyState, MetricTile, Panel, StatusPill, WorkspaceHeader, WorkspaceTabs } from '../components/WorkspacePrimitives';

async function req(path: string, init: RequestInit = {}) {
  const token = await authStorage.getItem('vp_crm_token');
  const r = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error || 'Request failed');
  return b;
}

type Tab = 'actions' | 'customer' | 'collections' | 'lost' | 'margin';
const money = (v: unknown) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

export default function SalesIntelligence() {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [tab, setTab] = useState<Tab>('actions');
  const [actions, setActions] = useState<any>(null);
  const [collections, setCollections] = useState<any>(null);
  const [lost, setLost] = useState<any>(null);
  const [margin, setMargin] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [c360, setC360] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [a, c, l, m, cu] = await Promise.all([
        req('/sales-intelligence/action-center'),
        req('/sales-intelligence/collections'),
        req('/sales-intelligence/lost-sales'),
        req('/sales-intelligence/margin-report'),
        req('/customers?page=1&limit=300'),
      ]);
      setActions(a);
      setCollections(c);
      setLost(l);
      setMargin(m);
      setCustomers(Array.isArray(cu) ? cu : cu.data || []);
    } catch (e: any) {
      Alert.alert('Sales intelligence', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadCustomer = async (id: string) => {
    setCustomerId(id);
    if (!id) return setC360(null);
    try {
      setC360(await req(`/sales-intelligence/customers/${id}/360`));
    } catch (e: any) {
      Alert.alert('Customer 360', e.message);
    }
  };

  const tabs = useMemo(() => [
    { id: 'actions' as Tab, label: 'Action Center', icon: 'flash-outline' as const, badge: Number(actions?.counts?.overdueInvoices || 0) + Number(actions?.counts?.partialOrders || 0) },
    { id: 'customer' as Tab, label: 'Customer 360', icon: 'person-circle-outline' as const },
    { id: 'collections' as Tab, label: 'Collections', icon: 'wallet-outline' as const },
    { id: 'lost' as Tab, label: 'Lost Sales', icon: 'trending-down-outline' as const },
    { id: 'margin' as Tab, label: 'Margins', icon: 'analytics-outline' as const },
  ], [actions]);

  const counts = actions?.counts || {};
  const customerSelectStyle = {
    minHeight: 42,
    padding: '0 12px',
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
    background: colors.bg.card,
    color: colors.text.primary,
    fontSize: 13,
    minWidth: 280,
    maxWidth: 440,
    outline: 'none',
  } as any;

  return (
    <View style={styles.screen}>
      <WorkspaceHeader
        eyebrow="Decision support"
        title="Sales Intelligence"
        subtitle="A focused view of what needs attention, customer health, collections and profitability."
        actions={[{ label: loading ? 'Refreshing…' : 'Refresh', icon: 'refresh', onPress: load, variant: 'secondary' }]}
      />
      <WorkspaceTabs tabs={tabs} value={tab} onChange={setTab} />

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'actions' ? (
          <>
            <View style={styles.metrics}>
              <MetricTile label="Overdue invoices" value={String(counts.overdueInvoices || 0)} icon="alert-circle-outline" tone={counts.overdueInvoices ? 'danger' : 'success'} helper="Collection attention" />
              <MetricTile label="Partial orders" value={String(counts.partialOrders || 0)} icon="layers-outline" tone={counts.partialOrders ? 'warning' : 'success'} helper="Still awaiting fulfillment" />
              <MetricTile label="Dormant customers" value={String(counts.dormantCustomers || 0)} icon="moon-outline" tone={counts.dormantCustomers ? 'warning' : 'success'} helper="45+ days without business" />
              <MetricTile label="Promises due" value={String(counts.paymentPromises || counts.promisesDue || 0)} icon="calendar-outline" tone="info" helper="Payment commitments" />
            </View>
            <View style={styles.twoColumn}>
              <ListPanel title="Overdue invoices" icon="alert-circle-outline" empty="No overdue invoices" rows={(actions?.overdueInvoices || []).map((x: any) => ({ a: x.invoiceNo || x.customerName, b: `${x.customerName || ''} • ${money(x.balance)}`, tone: 'danger' }))} />
              <ListPanel title="Partially fulfilled orders" icon="layers-outline" empty="No partial orders" rows={(actions?.partialOrders || []).map((x: any) => ({ a: x.orderNo, b: `${x.name} • ${money(x.totalAmount)}`, tone: 'warning' }))} />
            </View>
            <ListPanel title="Dormant customers" icon="person-remove-outline" empty="No dormant customers" rows={(actions?.dormantCustomers || []).map((x: any) => ({ a: x.name, b: x.company || x.phone || 'No recent activity', tone: 'neutral' }))} />
          </>
        ) : null}

        {tab === 'customer' ? (
          <>
            <Panel title="Customer 360" subtitle="Choose a customer to see sales, credit health and recent activity in one place.">
              {Platform.OS === 'web' ? (
                <select value={customerId} onChange={(e: any) => loadCustomer(e.target.value)} style={customerSelectStyle}>
                  <option value="">Choose customer</option>
                  {customers.map((c) => <option key={c._id} value={c._id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>)}
                </select>
              ) : (
                <TextInput style={styles.input} value={customerId} onChangeText={loadCustomer} placeholder="Customer ID" placeholderTextColor={colors.text.muted} />
              )}
            </Panel>
            {c360 ? (
              <>
                <View style={styles.metrics}>
                  <MetricTile label="This month" value={money(c360.summary?.monthSales)} icon="trending-up-outline" tone="success" />
                  <MetricTile label="Outstanding" value={money(c360.summary?.creditHealth?.totalOutstanding)} icon="wallet-outline" tone={Number(c360.summary?.creditHealth?.totalOutstanding || 0) > 0 ? 'warning' : 'success'} />
                  <MetricTile label="Credit health" value={c360.summary?.creditHealth?.label || '-'} icon="shield-checkmark-outline" tone={String(c360.summary?.creditHealth?.label || '').toLowerCase().includes('risk') ? 'danger' : 'info'} />
                  <MetricTile label="Open orders" value={String(c360.summary?.openOrders || 0)} icon="cart-outline" />
                </View>
                <ListPanel title="Recent activity" icon="time-outline" empty="No recent activity" rows={(c360.activity || []).map((x: any) => ({ a: x.label, b: `${x.type}${x.amount ? ` • ${money(x.amount)}` : ''}${x.status ? ` • ${x.status}` : ''}` }))} />
              </>
            ) : <EmptyState icon="person-circle-outline" title="Select a customer" message="Their orders, invoices, payments and credit context will appear here." />}
          </>
        ) : null}

        {tab === 'collections' ? (
          <>
            <View style={styles.metrics}>
              {Object.entries(collections?.buckets || {}).map(([key, value]: any, index) => (
                <MetricTile key={key} label={key} value={money(value)} icon="hourglass-outline" tone={index > 1 ? 'warning' : 'info'} />
              ))}
            </View>
            <ListPanel title="Promises to pay" icon="calendar-outline" empty="No payment promises" rows={(collections?.promises || []).map((x: any) => ({ a: x.customerName, b: `${money(x.amount)} • ${new Date(x.promisedDate).toLocaleDateString('en-IN')} • ${x.status}`, tone: x.status === 'missed' ? 'danger' : 'info' }))} />
          </>
        ) : null}

        {tab === 'lost' ? (
          <>
            <View style={styles.metrics}><MetricTile label="Estimated sales lost" value={money(lost?.totalLostValue)} icon="trending-down-outline" tone="danger" helper="Current month" /></View>
            <View style={styles.twoColumn}>
              <ListPanel title="Loss reasons" icon="analytics-outline" empty="No lost-sale reasons" rows={Object.entries(lost?.byReason || {}).map(([a, b]: any) => ({ a, b: money(b) }))} />
              <ListPanel title="Recent lost opportunities" icon="close-circle-outline" empty="No lost opportunities" rows={(lost?.rows || []).slice(0, 50).map((x: any) => ({ a: x.productName, b: `${x.customerName || 'Unknown'} • ${x.reason} • ${money(x.estimatedValue)}`, tone: 'danger' }))} />
            </View>
          </>
        ) : null}

        {tab === 'margin' ? (
          <ListPanel title="Estimated order margins" icon="analytics-outline" empty="No margin data" rows={margin.map((x: any) => ({ a: `${x.orderNo} • ${x.customer}`, b: `Revenue ${money(x.revenue)} • Margin ${x.marginPercent}%`, tone: Number(x.marginPercent) < 10 ? 'danger' : Number(x.marginPercent) < 20 ? 'warning' : 'success' }))} />
        ) : null}
      </ScrollView>
    </View>
  );

  function ListPanel({ title, icon, rows, empty }: { title: string; icon: keyof typeof Ionicons.glyphMap; rows: { a: string; b: string; tone?: string }[]; empty: string }) {
    return (
      <Panel title={title} style={styles.listPanel}>
        {!rows.length ? <EmptyState icon={icon} title={empty} /> : rows.map((row, i) => (
          <View style={styles.row} key={`${row.a}-${i}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowA}>{row.a}</Text>
              <Text style={styles.rowB}>{row.b}</Text>
            </View>
            {row.tone ? <StatusPill label={row.tone === 'danger' ? 'Attention' : row.tone === 'warning' ? 'Review' : row.tone === 'success' ? 'Healthy' : 'Open'} tone={row.tone as any} /> : null}
          </View>
        ))}
      </Panel>
    );
  }
}

const makeStyles = (c: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg.primary },
  content: { padding: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.md, paddingBottom: 64, maxWidth: 1240, width: '100%', alignSelf: 'center' },
  metrics: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  twoColumn: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap', alignItems: 'flex-start' },
  listPanel: { flexGrow: 1, flexShrink: 1, flexBasis: 430, minWidth: 290 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  rowA: { fontSize: 13, fontWeight: '750', color: c.text.primary },
  rowB: { fontSize: 11.5, lineHeight: 17, color: c.text.secondary, marginTop: 3 },
  input: { minHeight: 42, paddingHorizontal: 12, borderWidth: 1, borderColor: c.border, borderRadius: Radius.md, color: c.text.primary, backgroundColor: c.bg.card, maxWidth: 440 },
});
