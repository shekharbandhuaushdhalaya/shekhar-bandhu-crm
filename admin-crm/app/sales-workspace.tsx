import { AppTextInput as TextInput } from './../components/AppTextInput';
import { PressableOpacity as TouchableOpacity } from './../components/PressableOpacity';
import { AppText as Text } from './../components/AppText';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, ScrollView, StyleSheet, RefreshControl, Alert, Platform, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { api } from '../utils/api';
import { LightColors, Radius, Shadows, Spacing, Typography } from '../constants/theme';
import { EmptyState, MetricTile, Panel, StatusPill, WorkspaceTransition, WorkspaceTabs, WorkspaceLoading, WorkspaceError } from '../components/WorkspacePrimitives';
import { PageHeader as WorkspaceHeader } from '../components/PageHeader';
import { ListToolbar } from '../components/ListToolbar';

type Tab = 'dashboard' | 'orders' | 'challans' | 'schemes' | 'returns' | 'commissions';

const request = <T = any,>(path: string, init: RequestInit = {}) => api.requestJson<T>(path, init);

const formatMoney = (value: unknown) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

export default function SalesWorkspace() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ tab?: string; orderId?: string }>();
  const styles = useStyles(createStyles);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [challans, setChallans] = useState<any[]>([]);
  const [schemes, setSchemes] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [showQuickSale, setShowQuickSale] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const autoFulfillOrderRef = useRef<string | null>(null);

  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [qsCustomer, setQsCustomer] = useState('');
  const [qsProduct, setQsProduct] = useState('');
  const [qsWarehouse, setQsWarehouse] = useState('');
  const [qsQty, setQsQty] = useState('1');
  const [qsBatch, setQsBatch] = useState('');

  const [schemeName, setSchemeName] = useState('');
  const [schemeCode, setSchemeCode] = useState('');
  const [schemeProductId, setSchemeProductId] = useState('');
  const [schemeMin, setSchemeMin] = useState('10');
  const [schemeFree, setSchemeFree] = useState('1');
  const [schemeDiscount, setSchemeDiscount] = useState('0');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [d, o, ch, s, r, c, cu, pr, wh] = await Promise.all([
        request('/sales-workflow/dashboard'),
        request('/orders?page=1&limit=100'),
        request('/challans?page=1&limit=100'),
        request('/sales-workflow/schemes'),
        request('/sales-workflow/returns'),
        request('/sales-workflow/commissions'),
        request('/customers?page=1&limit=300'),
        request('/products?page=1&limit=500'),
        request('/warehouses'),
      ]);
      setDashboard(d);
      setOrders(Array.isArray(o) ? o : o.data || []);
      setChallans(Array.isArray(ch) ? ch : ch.data || []);
      setSchemes(Array.isArray(s) ? s : []);
      setReturns(Array.isArray(r) ? r : []);
      setCommissions(c);
      setCustomers(Array.isArray(cu) ? cu : cu.data || cu.customers || []);
      setProducts(Array.isArray(pr) ? pr : pr.data || pr.products || []);
      setWarehouses(Array.isArray(wh) ? wh : wh.data || wh.warehouses || []);
    } catch (e: any) {
      setLoadError(e.message || 'Unable to load Sales Workspace');
    } finally { setInitialLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const requested = String(params.tab || '');
    if (['dashboard','orders','challans','schemes','returns','commissions'].includes(requested)) setTab(requested as Tab);
  }, [params.tab]);

  const refresh = async () => {
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  };

  const doSearch = async () => {
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      setSearchResults(await request(`/sales-workflow/search?q=${encodeURIComponent(search.trim())}`));
    } catch (e: any) {
      Alert.alert('Search', e.message);
    }
  };

  const approve = async (id: string) => {
    if (busyAction) return;
    setBusyAction(`approve:${id}`);
    try {
      await request(`/orders/${id}/approve`, { method: 'PATCH' });
      await load();
    } catch (e: any) {
      Alert.alert('Approval', e.message);
    } finally { setBusyAction(''); }
  };

  const createScheme = async () => {
    if (busyAction) return;
    setBusyAction('scheme');
    try {
      await request('/sales-workflow/schemes', {
        method: 'POST',
        body: JSON.stringify({
          name: schemeName,
          code: schemeCode,
          productId: schemeProductId,
          minQty: Number(schemeMin),
          freeQty: Number(schemeFree),
          discountPercent: Number(schemeDiscount),
          active: true,
        }),
      });
      setSchemeName('');
      setSchemeCode('');
      setSchemeProductId('');
      await load();
    } catch (e: any) {
      Alert.alert('Scheme', e.message);
    } finally { setBusyAction(''); }
  };

  const createQuickSale = async () => {
    if (busyAction) return;
    const idempotencyKey = `ui-quick-sale-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setBusyAction('quick-sale');
    try {
      if (!qsCustomer || !qsProduct || !qsWarehouse) {
        return Alert.alert('Quick Sale', 'Select customer, product and warehouse.');
      }
      const out = await request('/sales-workflow/quick-sale', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          customerId: qsCustomer,
          warehouseId: qsWarehouse,
          items: [{ productId: qsProduct, qty: Number(qsQty || 1), packing: 1, batchNo: qsBatch || '' }],
        }),
      });
      setShowQuickSale(false);
      setQsProduct('');
      setQsQty('1');
      setQsBatch('');
      await load();
      Alert.alert('Quick Sale', `Draft Challan ${out.challan?.challanNo || ''} created. Finalize the Challan to move stock.`);
    } catch (e: any) {
      Alert.alert('Quick Sale', e.message);
    } finally { setBusyAction(''); }
  };

  const prepareRemainingChallan = async (order: any) => {
    if (busyAction) return;
    setBusyAction(`fulfill:${order._id}`);
    try {
      const items = (order.items || [])
        .map((item: any) => ({
          productId: item.productId,
          qty: Math.max(0, Number(item.qty || 0) + Number(item.freeQty || 0) - Number(item.fulfilledQty || 0)),
          packing: 1,
        }))
        .filter((item: any) => item.qty > 0);
      if (!items.length) return Alert.alert('Fulfillment', 'This order is already fully fulfilled.');
      const out = await request(`/sales-workflow/orders/${order._id}/fulfill`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `ui-fulfill-${order._id}-${Date.now()}` },
        body: JSON.stringify({ warehouseId: order.warehouseId || qsWarehouse, items }),
      });
      await load();
      Alert.alert('Challan prepared', `${out.challan.challanNo} is a draft. Review and finalize it to move stock.`);
    } catch (e: any) {
      Alert.alert('Fulfillment', e.message);
    } finally { setBusyAction(''); }
  };

  // Deep links from Website Orders land here instead of the retired
  // StockMovement archive. Prepare the draft Challan once the order list is
  // available, then leave finalization as an explicit user action.
  useEffect(() => {
    const orderId = String(params.orderId || '');
    if (!orderId || !orders.length || autoFulfillOrderRef.current === orderId) return;
    const order = orders.find((row) => String(row._id) === orderId);
    if (!order) return;
    autoFulfillOrderRef.current = orderId;
    prepareRemainingChallan(order);
  }, [params.orderId, orders]);

  const renderOrderCard = ({ item: order }: { item: any }) => {
    const fulfilled = (order.items || []).reduce((sum: number, item: any) => sum + Number(item.fulfilledQty || 0), 0);
    const ordered = (order.items || []).reduce((sum: number, item: any) => sum + Number(item.qty || 0) + Number(item.freeQty || 0), 0);
    const pendingApproval = order.approvalStatus === 'pending_approval';
    return (
      <View style={styles.orderCard}>
        <View style={styles.orderTop}>
          <View style={{ flex: 1, minWidth: 220 }}>
            <View style={styles.orderTitleRow}>
              <Text style={styles.rowMain}>{order.orderNo || `#${order._id.slice(-6)}`}</Text>
              <StatusPill label={(order.status || 'draft').replaceAll('_', ' ')} tone={order.status === 'fulfilled' ? 'success' : order.status === 'cancelled' ? 'danger' : pendingApproval ? 'warning' : 'info'} />
            </View>
            <Text style={styles.customerName}>{order.name || order.customerName || 'Customer'}</Text>
            <Text style={styles.rowSub}>{order.items?.length || 0} items • {order.sourcePersonName || order.mrName || order.sourceType || 'Direct'}</Text>
          </View>
          <Text style={styles.orderAmount}>{formatMoney(order.totalAmount)}</Text>
        </View>
        <View style={styles.fulfillmentTrack}><View style={[styles.fulfillmentFill, { width: `${ordered ? Math.min(100, (fulfilled / ordered) * 100) : 0}%` }]} /></View>
        <View style={styles.orderFooter}>
          <Text style={styles.fulfillmentText}>Fulfilled {fulfilled} of {ordered}</Text>
          <View style={styles.rowActions}>
            {pendingApproval ? <TouchableOpacity style={styles.secondaryButton} onPress={() => approve(order._id)}><Text style={styles.secondaryButtonText}>Approve</Text></TouchableOpacity> : null}
            {!pendingApproval && !['fulfilled', 'cancelled', 'delivered'].includes(order.status) ? <TouchableOpacity style={styles.primarySmallButton} onPress={() => prepareRemainingChallan(order)}><Ionicons name="document-text-outline" size={14} color="#fff" /><Text style={styles.primarySmallButtonText}>Prepare Challan</Text></TouchableOpacity> : null}
          </View>
        </View>
      </View>
    );
  };

  const actOnChallan = async (challan: any, action: 'finalize' | 'convert' | 'reverse') => {
    if (busyAction) return;
    const key = `${action}:${challan._id}`;
    setBusyAction(key);
    try {
      if (action === 'finalize') await request(`/challans/${challan._id}/finalize`, { method: 'PATCH', headers: { 'Idempotency-Key': `ui-finalize-${challan._id}` } });
      if (action === 'convert') await request(`/challans/${challan._id}/convert`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `ui-convert-${challan._id}` },
      });
      if (action === 'reverse') {
        const run = async () => { await request(`/challans/${challan._id}/reverse`, { method: 'POST', headers: { 'Idempotency-Key': `ui-reverse-${challan._id}-${Date.now()}` } }); await load(); };
        if (Platform.OS === 'web') { if (typeof window !== 'undefined' && window.confirm(`Reverse ${challan.challanNo}? This creates compensating inventory entries.`)) await run(); }
        else Alert.alert('Reverse Challan', `Reverse ${challan.challanNo}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Reverse', style: 'destructive', onPress: run }]);
        return;
      }
      await load();
      Alert.alert('Challan', action === 'finalize' ? 'Challan finalized.' : 'Sale Invoice created from Challan.');
    } catch (e: any) { Alert.alert('Challan', e.message || `Unable to ${action} Challan`); }
    finally { setBusyAction(''); }
  };

  const k = dashboard?.kpis || {};
  const tabs = useMemo(() => [
    { id: 'dashboard' as Tab, label: 'Overview', icon: 'grid-outline' as const },
    { id: 'orders' as Tab, label: 'Orders', icon: 'cart-outline' as const, badge: Number(k.pendingApprovals || 0) },
    { id: 'challans' as Tab, label: 'Challans', icon: 'document-text-outline' as const, badge: challans.filter((x) => x.status === 'draft').length },
    { id: 'schemes' as Tab, label: 'Schemes', icon: 'pricetags-outline' as const },
    { id: 'returns' as Tab, label: 'Returns', icon: 'return-down-back-outline' as const },
    { id: 'commissions' as Tab, label: 'Commissions', icon: 'cash-outline' as const },
  ], [k.pendingApprovals, challans]);

  const resultGroups = searchResults
    ? Object.entries(searchResults).flatMap(([type, rows]: any) => (rows || []).map((x: any) => ({ type, ...x })))
    : [];

  const webSelectStyle = { ...Typography.bodySm, minHeight: 42, padding: '0 12px', borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.bg.card, color: colors.text.primary, outline: 'none' } as any;

  return (
    <View style={styles.screen}>
      <WorkspaceHeader
        eyebrow="Sales operations"
        title="Sales Workspace"
        subtitle="A cleaner operating view for orders, fulfillment, schemes, returns and commissions."
        actions={[{ label: showQuickSale ? 'Close quick sale' : 'New sale', icon: showQuickSale ? 'close' : 'add', onPress: () => setShowQuickSale((v) => !v) }]}
      />

      {showQuickSale ? (
        <View style={styles.inlinePanelWrap}>
          <Panel title="Quick Sale" subtitle="Prepare a Sales Order and draft Sale Challan together. Stock moves only after Challan finalization.">
            {Platform.OS === 'web' ? (
              <View style={styles.formRow}>
                <select value={qsCustomer} onChange={(e: any) => setQsCustomer(e.target.value)} style={{ ...webSelectStyle, minWidth: 220 }}>
                  <option value="">Select customer</option>
                  {customers.map((c) => <option key={c._id} value={c._id}>{c.name || c.company}</option>)}
                </select>
                <select value={qsWarehouse} onChange={(e: any) => setQsWarehouse(e.target.value)} style={{ ...webSelectStyle, minWidth: 190 }}>
                  <option value="">Select warehouse</option>
                  {warehouses.map((w) => <option key={w._id} value={w._id}>{w.name}</option>)}
                </select>
                <select value={qsProduct} onChange={(e: any) => setQsProduct(e.target.value)} style={{ ...webSelectStyle, minWidth: 230 }}>
                  <option value="">Select product</option>
                  {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </View>
            ) : (
              <>
                <TextInput style={styles.inputWide} placeholder="Customer ID" placeholderTextColor={colors.text.muted} value={qsCustomer} onChangeText={setQsCustomer} />
                <TextInput style={styles.inputWide} placeholder="Warehouse ID" placeholderTextColor={colors.text.muted} value={qsWarehouse} onChangeText={setQsWarehouse} />
                <TextInput style={styles.inputWide} placeholder="Product ID" placeholderTextColor={colors.text.muted} value={qsProduct} onChangeText={setQsProduct} />
              </>
            )}
            <View style={styles.formRow}>
              <TextInput style={styles.input} placeholder="Quantity" placeholderTextColor={colors.text.muted} keyboardType="numeric" value={qsQty} onChangeText={setQsQty} />
              <TextInput style={styles.input} placeholder="Batch (optional — blank uses FEFO)" placeholderTextColor={colors.text.muted} value={qsBatch} onChangeText={setQsBatch} />
              <TouchableOpacity style={styles.primaryButton} onPress={createQuickSale} activeOpacity={0.8}>
                <Ionicons name="document-text-outline" size={16} color="#fff" />
                <Text style={styles.primaryButtonText}>Prepare sale</Text>
              </TouchableOpacity>
            </View>
          </Panel>
        </View>
      ) : null}

      <ListToolbar
        searchValue={search}
        onSearchChange={setSearch}
        onSubmitEditing={doSearch}
        searchPlaceholder="Search customer, order, challan, invoice or product"
        primaryAction={{
          label: 'Search',
          onPress: doSearch
        }}
        containerStyle={{ paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm }}
      />

      {resultGroups.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.searchResults}>
          {resultGroups.map((x: any) => (
            <View key={`${x.type}-${x._id}`} style={styles.searchChip}>
              <Text style={styles.searchChipType}>{String(x.type).toUpperCase()}</Text>
              <Text style={styles.searchChipText} numberOfLines={1}>{x.orderNo || x.challanNo || x.invoiceNo || x.name || x.customerName || x.partyName}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <WorkspaceTabs tabs={tabs} value={tab} onChange={setTab} />

      {initialLoading ? <WorkspaceLoading title="Loading Sales Workspace…" message="Fetching orders, schemes, returns, commissions and stock choices." /> : null}
      {!initialLoading && loadError ? <WorkspaceError message={loadError} onRetry={load} /> : null}
      {!initialLoading && !loadError ? (tab === 'orders' ? (
        <FlatList
          data={orders}
          keyExtractor={(order) => order._id}
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          ListHeaderComponent={<View style={styles.orderListHeader}><Text style={styles.panelListTitle}>Order pipeline</Text><Text style={styles.panelListSubtitle}>Review fulfillment, approvals and remaining quantities from one place.</Text></View>}
          renderItem={renderOrderCard}
          ListEmptyComponent={<EmptyState icon="cart-outline" title="No sales orders" message="New and website orders will appear here." />}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
        />
      ) : (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      ><WorkspaceTransition value={tab}>
        {tab === 'dashboard' ? (
          <>
            <View style={styles.metricsGrid}>
              <MetricTile label="Sales" value={formatMoney(k.sales)} icon="trending-up-outline" tone="success" helper="Confirmed sales value" />
              <MetricTile label="Orders" value={Number(k.orders || 0).toLocaleString('en-IN')} icon="cart-outline" helper="Open and recent orders" />
              <MetricTile label="Collections" value={formatMoney(k.collections)} icon="wallet-outline" tone="info" helper="Receipts captured" />
              <MetricTile label="Needs approval" value={String(k.pendingApprovals || 0)} icon="shield-checkmark-outline" tone={Number(k.pendingApprovals || 0) ? 'warning' : 'success'} helper="Orders awaiting review" />
            </View>

            <View style={styles.twoColumn}>
              <Panel title="Sales attribution" subtitle="Business credited to the person or channel that generated it." style={styles.columnPanel}>
                {Object.entries(dashboard?.bySource || {}).length ? Object.entries(dashboard.bySource).map(([name, val]: any) => (
                  <View style={styles.dataRow} key={name}>
                    <View style={styles.rowLabelWrap}>
                      <View style={styles.dot} />
                      <Text style={styles.rowMain}>{name}</Text>
                    </View>
                    <Text style={styles.money}>{formatMoney(val)}</Text>
                  </View>
                )) : <EmptyState icon="git-branch-outline" title="No attribution data yet" message="Attributed sales will appear here as orders are created." />}
              </Panel>

              <Panel title="Fulfillment health" subtitle="The Challan remains the physical stock movement document." style={styles.columnPanel}>
                <View style={styles.healthRow}><Text style={styles.healthLabel}>Invoices</Text><Text style={styles.healthValue}>{Number(k.invoices || 0).toLocaleString('en-IN')}</Text></View>
                <View style={styles.healthRow}><Text style={styles.healthLabel}>Partially fulfilled</Text><Text style={styles.healthValue}>{Number(k.partiallyFulfilled || 0).toLocaleString('en-IN')}</Text></View>
                <View style={styles.ruleBox}>
                  <Ionicons name="cube-outline" size={18} color={colors.primary} />
                  <Text style={styles.ruleText}>Orders capture intent. Finalized Sale Challans move stock. One order can be fulfilled through multiple Challans.</Text>
                </View>
              </Panel>
            </View>
          </>
        ) : null}

        {tab === 'challans' ? (
          <Panel title="Authoritative Sale Challans" subtitle="Finalize physical movement here, then create the financial invoice. Posted Challans remain immutable except through controlled reversal.">
            {!challans.length ? <EmptyState icon="document-text-outline" title="No Challans" message="Draft Challans prepared from Sales Orders will appear here." /> : challans.map((ch) => {
              const posted = ch.status === 'finalized' && ch.inventoryPostingStatus === 'posted';
              const sale = (ch.challanType || 'sale') === 'sale';
              return (
                <View style={styles.orderCard} key={ch._id}>
                  <View style={styles.orderTop}>
                    <View style={{ flex: 1, minWidth: 220 }}>
                      <View style={styles.orderTitleRow}>
                        <Text style={styles.rowMain}>{ch.challanNo}</Text>
                        <StatusPill label={posted ? 'Posted' : (ch.status || 'draft')} tone={posted ? 'success' : ch.status === 'cancelled' ? 'danger' : 'warning'} />
                        <StatusPill label={(ch.challanType || 'sale').replaceAll('_', ' ')} tone="neutral" />
                      </View>
                      <Text style={styles.customerName}>{ch.partyName || 'Internal transfer'}</Text>
                      <Text style={styles.rowSub}>{ch.items?.length || 0} items • {ch.warehouseName || 'Source warehouse'}{ch.destinationWarehouseName ? ` → ${ch.destinationWarehouseName}` : ''}</Text>
                    </View>
                    <Text style={styles.orderAmount}>{formatMoney(ch.nettTotal || ch.amount)}</Text>
                  </View>
                  <View style={styles.orderFooter}>
                    <Text style={styles.fulfillmentText}>{ch.invoiceNo ? `Invoice ${ch.invoiceNo}` : posted && sale ? 'Ready for invoice' : posted ? 'Inventory posted' : 'No stock moved yet'}</Text>
                    <View style={styles.rowActions}>
                      {ch.status === 'draft' ? <TouchableOpacity disabled={!!busyAction} style={styles.primarySmallButton} onPress={() => actOnChallan(ch, 'finalize')}><Text style={styles.primarySmallButtonText}>{busyAction === `finalize:${ch._id}` ? 'Finalizing…' : 'Finalize'}</Text></TouchableOpacity> : null}
                      {posted && sale && !ch.invoiceId && !ch.convertedToInvoice ? <TouchableOpacity disabled={!!busyAction} style={styles.primarySmallButton} onPress={() => actOnChallan(ch, 'convert')}><Text style={styles.primarySmallButtonText}>{busyAction === `convert:${ch._id}` ? 'Creating…' : 'Create Invoice'}</Text></TouchableOpacity> : null}
                      {posted && !ch.invoiceId ? <TouchableOpacity disabled={!!busyAction} style={styles.secondaryButton} onPress={() => actOnChallan(ch, 'reverse')}><Text style={styles.secondaryButtonText}>Reverse</Text></TouchableOpacity> : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </Panel>
        ) : null}

        {tab === 'schemes' ? (
          <View style={styles.twoColumn}>
            <Panel title="Create sales scheme" subtitle="Configure Buy X Get Y or percentage discount rules." style={styles.columnPanel}>
              <View style={styles.formRow}>
                <TextInput style={styles.input} placeholder="Scheme name" placeholderTextColor={colors.text.muted} value={schemeName} onChangeText={setSchemeName} />
                <TextInput style={styles.input} placeholder="Code" placeholderTextColor={colors.text.muted} value={schemeCode} onChangeText={setSchemeCode} />
              </View>
              <TextInput style={styles.inputWide} placeholder="Product ID" placeholderTextColor={colors.text.muted} value={schemeProductId} onChangeText={setSchemeProductId} />
              <View style={styles.formRow}>
                <TextInput style={styles.input} placeholder="Buy qty" placeholderTextColor={colors.text.muted} keyboardType="numeric" value={schemeMin} onChangeText={setSchemeMin} />
                <TextInput style={styles.input} placeholder="Free qty" placeholderTextColor={colors.text.muted} keyboardType="numeric" value={schemeFree} onChangeText={setSchemeFree} />
                <TextInput style={styles.input} placeholder="Discount %" placeholderTextColor={colors.text.muted} keyboardType="numeric" value={schemeDiscount} onChangeText={setSchemeDiscount} />
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={createScheme}><Ionicons name="save-outline" size={16} color="#fff" /><Text style={styles.primaryButtonText}>Save scheme</Text></TouchableOpacity>
            </Panel>
            <Panel title="Active schemes" subtitle="Current promotional rules." style={styles.columnPanel}>
              {!schemes.length ? <EmptyState icon="pricetags-outline" title="No schemes configured" /> : schemes.map((scheme) => (
                <View style={styles.dataRow} key={scheme._id}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowMain}>{scheme.name}</Text>
                    <Text style={styles.rowSub}>{scheme.code} • Buy {scheme.minQty}, free {scheme.freeQty} • {scheme.discountPercent}% off</Text>
                  </View>
                  <StatusPill label={scheme.active === false ? 'Inactive' : 'Active'} tone={scheme.active === false ? 'neutral' : 'success'} />
                </View>
              ))}
            </Panel>
          </View>
        ) : null}

        {tab === 'returns' ? (
          <Panel title="Sales returns" subtitle="Controlled incoming stock transaction linked to the original Challan.">
            {!returns.length ? <EmptyState icon="return-down-back-outline" title="No sales returns" message="Posted returns and credit-note resolutions will appear here." /> : returns.map((r) => (
              <View style={styles.dataRow} key={r._id}>
                <View style={{ flex: 1 }}>
                  <View style={styles.orderTitleRow}><Text style={styles.rowMain}>{r.returnNo}</Text><StatusPill label={r.status || 'draft'} tone={r.status === 'posted' || r.status === 'completed' ? 'success' : 'info'} /></View>
                  <Text style={styles.rowSub}>{r.customerName} • {r.resolution} • {r.items?.length || 0} items</Text>
                </View>
                <Text style={styles.money}>{formatMoney(r.totalAmount)}</Text>
              </View>
            ))}
          </Panel>
        ) : null}

        {tab === 'commissions' ? (
          <Panel title="MR / salesperson commissions" subtitle="Calculated from attributed business, not the operator who entered the order.">
            {!commissions?.rows?.length ? <EmptyState icon="cash-outline" title="No commission rows yet" /> : commissions.rows.map((row: any) => (
              <View style={styles.dataRow} key={row.orderId}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowMain}>{row.personName || 'Unassigned'}</Text>
                  <Text style={styles.rowSub}>{row.orderNo} • {formatMoney(row.netSales)} × {row.rate}%</Text>
                </View>
                <Text style={styles.money}>{formatMoney(row.commission)}</Text>
              </View>
            ))}
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Total commission</Text><Text style={styles.totalValue}>{formatMoney(commissions?.total)}</Text></View>
          </Panel>
        ) : null}
      </WorkspaceTransition></ScrollView>
      )) : null}
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  inlinePanelWrap: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  searchWrap: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  searchBar: { minHeight: 44, maxWidth: 760, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card, borderRadius: Radius.md, paddingLeft: 13, paddingRight: 5, flexDirection: 'row', alignItems: 'center', gap: 9, ...Shadows.card },
  searchInput: { borderWidth: 0, backgroundColor: 'transparent', ...Typography.bodySm, flex: 1, minHeight: 42, color: colors.text.primary },
  iconButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  searchButton: { minHeight: 34, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: colors.primaryLight },
  searchButtonText: { ...Typography.caption, color: colors.primary, fontWeight: '800' },
  searchResults: { gap: 8, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  searchChip: { backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 11, paddingVertical: 9, width: 170 },
  searchChipType: { ...Typography.eyebrow, fontWeight: '800', color: colors.primary },
  searchChipText: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary, marginTop: 2 },
  content: { padding: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 64, gap: Spacing.md, maxWidth: 1240, width: '100%', alignSelf: 'center' },
  orderListHeader: { paddingBottom: Spacing.sm },
  panelListTitle: { ...Typography.h2, fontWeight: '800', color: colors.text.primary },
  panelListSubtitle: { ...Typography.bodySm, color: colors.text.secondary, marginTop: 3 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  twoColumn: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, alignItems: 'flex-start' },
  columnPanel: { flexGrow: 1, flexShrink: 1, flexBasis: 420, minWidth: 290 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  rowMain: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary },
  rowSub: { ...Typography.caption, color: colors.text.muted, marginTop: 3 },
  customerName: { ...Typography.bodySm, fontWeight: '600', color: colors.text.secondary, marginTop: 3 },
  money: { ...Typography.bodySm, fontWeight: '800', color: colors.text.primary },
  healthRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  healthLabel: { ...Typography.bodySm, color: colors.text.secondary },
  healthValue: { ...Typography.body, fontWeight: '800', color: colors.text.primary },
  ruleBox: { marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 11, borderRadius: Radius.md, backgroundColor: colors.primaryLight },
  ruleText: { ...Typography.caption, flex: 1, color: colors.text.secondary },
  orderCard: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  orderTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  orderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  orderAmount: { ...Typography.h3, fontWeight: '800', color: colors.text.primary },
  fulfillmentTrack: { height: 5, borderRadius: 999, backgroundColor: colors.bg.secondary, overflow: 'hidden', marginTop: 12 },
  fulfillmentFill: { height: '100%', backgroundColor: colors.success, borderRadius: 999 },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 9, flexWrap: 'wrap' },
  fulfillmentText: { ...Typography.eyebrow, fontWeight: '600', color: colors.text.muted },
  rowActions: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  primarySmallButton: { minHeight: 32, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 5 },
  primarySmallButtonText: { ...Typography.eyebrow, color: '#fff', fontWeight: '800' },
  secondaryButton: { minHeight: 32, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { ...Typography.eyebrow, color: colors.primary, fontWeight: '800' },
  primaryButton: { minHeight: 42, paddingHorizontal: 15, borderRadius: Radius.md, backgroundColor: colors.primary, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  primaryButtonText: { ...Typography.bodySm, color: '#fff', fontWeight: '800' },
  formRow: { flexDirection: 'row', gap: 9, flexWrap: 'wrap', marginBottom: 9, alignItems: 'center' },
  input: { ...Typography.bodySm, minWidth: 145, flexGrow: 1, flexShrink: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 11, color: colors.text.primary, backgroundColor: colors.bg.card },
  inputWide: { ...Typography.bodySm, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 11, color: colors.text.primary, backgroundColor: colors.bg.card, marginBottom: 9 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, marginTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  totalLabel: { ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary },
  totalValue: { ...Typography.h1, fontWeight: '800', color: colors.text.primary },
});
