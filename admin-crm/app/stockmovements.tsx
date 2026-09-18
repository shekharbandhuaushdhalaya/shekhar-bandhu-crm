import { AppTextInput as TextInput } from './../components/AppTextInput';
import { AppText as Text } from './../components/AppText';
import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { api, StockMovement } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';
import { LightColors, Spacing, Radius, Typography } from '../constants/theme';
import { PageHeader as ScreenHeader } from '../components/PageHeader';
import { DataTable, Column } from '../components/DataTable';
import { WorkspaceTabs, EmptyState, WorkspaceError, StatusPill, WorkspaceTransition } from './../components/WorkspacePrimitives';
import InventoryDispatchScreen from './inventorydispatch';

const typeLabel = (value?: string) => ({
  sale: 'Legacy sale', sample: 'Legacy sample', order: 'Legacy online order', return: 'Legacy return',
  purchase: 'Legacy purchase', transfer_out: 'Legacy transfer out', transfer_in: 'Legacy transfer in',
  damage: 'Damage / write-off', production: 'Legacy production receipt',
}[value || ''] || value || '—');

export default function StockMovementsArchive() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [tab, setTab] = useState<'archive' | 'dispatches'>('archive');
  const [rows, setRows] = useState<StockMovement[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try { setRows(await api.getStockMovements({ search: search.trim() || undefined })); }
    catch (e: any) { setError(e.message || 'Unable to load historical stock movements'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [search]);

  useFocusEffect(useCallback(() => { load(false); }, [load]));

  const columns = useMemo<Column<StockMovement>[]>(() => [
    { key: 'docNo', title: 'Document', width: 150, render: (r) => <Text style={styles.strong}>{r.docNo}</Text> },
    { key: 'date', title: 'Date', width: 120, render: (r) => <Text style={styles.text}>{new Date(r.date).toLocaleDateString('en-IN')}</Text> },
    { key: 'type', title: 'Legacy type', width: 170, render: (r) => <Text style={styles.text}>{typeLabel(r.type)}</Text> },
    { key: 'partyName', title: 'Party / reference', flex: 1, render: (r) => <Text style={styles.text} numberOfLines={1}>{r.partyName || r.sourceDocType || '—'}</Text> },
    { key: 'warehouseName', title: 'Warehouse', width: 170 },
    { key: 'status', title: 'Status', width: 110, render: (r) => <StatusPill  label={<>{r.status}</>} textStyle={styles.statusText} /> },
    { key: 'items', title: 'Items', width: 80, align: 'right', render: (r) => <Text style={styles.strong}>{r.items?.length || 0}</Text> },
  ], [styles]);

  if (tab === 'dispatches') return (
    <View style={styles.screen}>
      <ScreenHeader title="Logistics" subtitle="Dispatches are created only from posted authoritative Challans." />
      <WorkspaceTabs tabs={[{ id: 'archive', label: 'Movement Archive', icon: 'archive-outline' }, { id: 'dispatches', label: 'Dispatches', icon: 'car-outline' }]} value={tab} onChange={(v) => setTab(v as any)} />
      <WorkspaceTransition value={tab} style={{ flex: 1 }}><InventoryDispatchScreen /></WorkspaceTransition>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Stock Movement Archive"
        subtitle="Read-only history from the retired StockMovement engine. New sales/transfers use Challans; samples, production, returns and write-offs use their dedicated workflows."
      />
      <WorkspaceTabs tabs={[{ id: 'archive', label: 'Movement Archive', icon: 'archive-outline' }, { id: 'dispatches', label: 'Dispatches', icon: 'car-outline' }]} value={tab} onChange={(v) => setTab(v as any)} />
      <WorkspaceTransition value={tab} style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={17} color={colors.text.muted} />
          <TextInput
            style={styles.input}
            placeholder="Search historical document or party"
            placeholderTextColor={colors.text.muted}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => load(false)}
          />
        </View>
        <View style={styles.notice}>
          <Ionicons name="lock-closed-outline" size={15} color={colors.primary} />
          <Text style={styles.noticeText}>Archive is read-only</Text>
        </View>
      </WorkspaceTransition>
      {error ? <View style={styles.errorWrap}><WorkspaceError message={error} onRetry={() => load(false)} /></View> : (
        <View style={styles.tableWrap}>
          <DataTable
            data={rows}
            columns={columns}
            keyExtractor={(item) => item._id}
            isLoading={loading}
            isRefreshing={refreshing}
            onRefresh={() => load(true)}
            ListEmptyComponent={<EmptyState icon="archive-outline" title="No historical stock movements" message="New physical transactions are recorded in their authoritative modules instead." />}
          />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, flexWrap: 'wrap' },
  searchBox: { flex: 1, minWidth: 260, maxWidth: 620, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, backgroundColor: colors.bg.card },
  // borderWidth:0 + transparent bg opts this out of AppTextInput's own border/fill,
  // which would otherwise draw a second border inside the bordered `searchBox` wrapper.
  input: { ...Typography.bodySm, flex: 1, minHeight: 40, color: colors.text.primary, borderWidth: 0, backgroundColor: 'transparent' },
  notice: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.secondary },
  noticeText: { ...Typography.caption, color: colors.text.secondary, fontWeight: '700' },
  tableWrap: { flex: 1, marginHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  errorWrap: { paddingHorizontal: Spacing.lg },
  text: { ...Typography.bodySm, color: colors.text.secondary },
  strong: { ...Typography.bodySm, fontWeight: '800', color: colors.text.primary },
  status: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border },
  statusText: { ...Typography.eyebrow, fontWeight: '700', color: colors.text.secondary, textTransform: 'capitalize' },
});
