import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from '../components/AppText';
import { PageHeader as ScreenHeader } from '../components/PageHeader';
import { EmptyState, Panel, StatusPill, WorkspaceError, WorkspaceLoading } from '../components/WorkspacePrimitives';
import { LightColors, Spacing, Typography } from '../constants/theme';
import { api } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';

type Reconciliation = {
  ok: boolean;
  discrepancies: Array<{ warehouseId: string; productId: string; vendorId: string; packing: number; batchNo: string; storedQty: number; ledgerQty: number; difference: number }>;
  rawMaterialDiscrepancies: Array<{ warehouseId: string; rawMaterialId: string; batchNo: string; storedQty: number; ledgerQty: number; difference: number }>;
  orphanPostedChallans: Array<{ _id: string; challanNo?: string }>;
  checkedInventorySlots: number;
  checkedLedgerRows: number;
};

export default function InventoryReconciliationScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [report, setReport] = useState<Reconciliation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setReport(await api.getInventoryReconciliation({ limit: 500 })); }
    catch (e: any) { setError(e.message || 'Unable to load reconciliation report'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !report) return <WorkspaceLoading title="Checking inventory integrity" message="Comparing inventory slots with the append-only stock ledger." />;
  if (error && !report) return <WorkspaceError message={error} onRetry={load} />;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Inventory Reconciliation" subtitle="Read-only integrity check for stock and posted Challans" />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <Panel title="Integrity status" subtitle="No records are repaired automatically by this report.">
          <View style={styles.statusRow}>
            <Ionicons name={report?.ok ? 'checkmark-circle' : 'warning'} size={28} color={report?.ok ? colors.success : colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>{report?.ok ? 'No variance detected' : 'Review required'}</Text>
              <Text style={styles.statusCopy}>{report?.checkedInventorySlots || 0} inventory slots and {report?.checkedLedgerRows || 0} ledger rows checked.</Text>
            </View>
            <StatusPill label={report?.ok ? 'Healthy' : 'Variance'} tone={report?.ok ? 'success' : 'danger'} />
          </View>
        </Panel>

        <Panel title="Quantity variances" subtitle="InventoryEntry quantity compared with net StockLedger movement.">
          {!report?.discrepancies?.length ? <EmptyState icon="checkmark-done-outline" title="No quantity variances" message="Stock slots and ledger movements are aligned." /> : report.discrepancies.map((row, index) => (
            <View key={`${row.warehouseId}-${row.productId}-${row.batchNo}-${index}`} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Product {row.productId}</Text>
                <Text style={styles.rowMeta}>Warehouse {row.warehouseId} · Batch {row.batchNo || 'Unbatched'} · Packing {row.packing}</Text>
              </View>
              <Text style={[styles.delta, { color: row.difference < 0 ? colors.danger : colors.warning }]}>{row.difference > 0 ? '+' : ''}{row.difference}</Text>
            </View>
          ))}
        </Panel>

        <Panel title="Raw-material ledger variances" subtitle="New raw-material movements are tracked separately from finished-goods stock.">
          {!report?.rawMaterialDiscrepancies?.length ? <EmptyState icon="flask-outline" title="No raw-material variances" /> : report.rawMaterialDiscrepancies.map((row, index) => (
            <View key={`${row.warehouseId}-${row.rawMaterialId}-${row.batchNo}-${index}`} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Material {row.rawMaterialId}</Text>
                <Text style={styles.rowMeta}>Warehouse {row.warehouseId} · Batch {row.batchNo || 'Unbatched'}</Text>
              </View>
              <Text style={[styles.delta, { color: row.difference < 0 ? colors.danger : colors.warning }]}>{row.difference > 0 ? '+' : ''}{row.difference}</Text>
            </View>
          ))}
        </Panel>

        <Panel title="Posted Challans without ledger references" subtitle="A posted Sale Challan should have a corresponding physical movement.">
          {!report?.orphanPostedChallans?.length ? <EmptyState icon="link-outline" title="All posted Challans are linked" /> : report.orphanPostedChallans.map(item => (
            <View key={String(item._id)} style={styles.row}>
              <Ionicons name="document-text-outline" size={18} color={colors.danger} />
              <Text style={[styles.rowTitle, { flex: 1, marginLeft: Spacing.sm }]}>{item.challanNo || item._id}</Text>
              <StatusPill label="Unlinked" tone="danger" />
            </View>
          ))}
        </Panel>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  content: { padding: Spacing.lg, gap: Spacing.md },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  statusTitle: { ...Typography.h3, color: colors.text.primary },
  statusCopy: { ...Typography.bodySm, color: colors.text.secondary, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowTitle: { ...Typography.body, color: colors.text.primary, fontWeight: '700' },
  rowMeta: { ...Typography.caption, color: colors.text.muted, marginTop: 2 },
  delta: { ...Typography.h3, minWidth: 54, textAlign: 'right' },
  error: { ...Typography.bodySm, color: colors.danger, padding: Spacing.sm },
});
