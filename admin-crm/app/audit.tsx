import { PageHeader as ScreenHeader } from '../components/PageHeader';
import { DataTable, Column } from '../components/DataTable';
import { ListToolbar } from '../components/ListToolbar';
import { StatusPill, WorkspaceLoading, EmptyState } from './../components/WorkspacePrimitives';
import { AppTextInput as TextInput } from './../components/AppTextInput';
import { PressableOpacity as TouchableOpacity } from './../components/PressableOpacity';
import { AppText as Text } from './../components/AppText';
import { useEffect, useState, useCallback } from 'react';
import { useListState } from '../utils/useListState';
import { View, StyleSheet, ScrollView, Modal, ActivityIndicator, useWindowDimensions, RefreshControl, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { api } from '../utils/api';
import { Spacing, Radius, LightColors, Typography } from '../constants/theme';
import UnauthorizedScreen from '../components/UnauthorizedScreen';
import { useDebouncedValue } from '../utils/useDebouncedValue';

type AuditLogItem = {
  _id: string;
  userId: string | null;
  userName: string;
  userEmail: string;
  action: string;
  description: string;
  ipAddress: string;
  deviceInfo: string;
  details: any;
  createdAt: string;
};

export default function AuditLogsScreen() {
  const { user } = useAuth();
  const perm = usePermission();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useListState('auditSearchText', '');
  const debouncedSearchText = useDebouncedValue(searchText, 300);
  const [searchVal, setSearchVal] = useListState('auditSearchVal', '');

  // Date range
  const [dateFrom, setDateFrom] = useListState('auditDateFrom', '');
  const [dateTo, setDateTo] = useListState('auditDateTo', '');

  // Pagination
  const [page, setPage] = useListState('auditPage', 1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Sorting
  const [sortField, setSortField] = useState<'timestamp' | 'user' | 'action'>('timestamp');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Selected Log detail Modal
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const sortedLogs = (() => {
    const sorted = [...logs].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'timestamp') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortField === 'user') cmp = (a.userName || '').localeCompare(b.userName || '');
      else if (sortField === 'action') cmp = a.action.localeCompare(b.action);
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  })();

  const fetchLogs = useCallback(async (pageNum: number, searchString: string) => {
    try {
      setLoading(true);
      const data = await api.getAuditLogs(searchString, pageNum, 20, dateFrom || undefined, dateTo || undefined);
      setLogs(data.logs || []);
      setTotalPages(data.pages || 1);
      setTotalItems(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateFrom, dateTo]);

  const activeSearch = debouncedSearchText || searchVal;

  useEffect(() => {
    if (perm.can('audit:view')) {
      fetchLogs(page, activeSearch);
    } else {
      setLoading(false);
    }
  }, [page, activeSearch, user, fetchLogs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    api.clearCache();
    setPage(1);
    await fetchLogs(1, searchVal);
  }, [searchVal, fetchLogs]);

  const handleSearchSubmit = () => {
    setPage(1);
    setSearchVal(searchText);
  };

  const handleClearSearch = () => {
    setSearchText('');
    setSearchVal('');
    setPage(1);
  };

  // Render Access Denied for non-admins
  if (!perm.can('audit:view')) {
    return (
      <UnauthorizedScreen
        title="Audit Logs Chamber Restricted"
        description="Administrative credentials are required for inspecting security logs, system events & audit trails."
        requiredPermission="audit:view"
      />
    );
  }


  const columns: Column<any>[] = [
    {
      key: 'timestamp',
      title: 'Timestamp',
      flex: 1.5,
      render: (item) => {
        const dateObj = new Date(item.createdAt || item.timestamp);
        const dateStr = dateObj.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        return (
          <View style={{ flex: 1, paddingVertical: 6, justifyContent: 'center' }}>
            <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>{dateStr} {timeStr}</Text>
          </View>
        );
      }
    },
    {
      key: 'user',
      title: 'User',
      flex: 2,
      render: (item) => (
        <View style={{ flex: 1, paddingVertical: 6, justifyContent: 'center' }}>
          <Text style={styles.logUser}>{item.userName}</Text>
          <Text style={styles.logEmail}>{item.userEmail || 'anonymous'}</Text>
        </View>
      )
    },
    {
      key: 'action',
      title: 'Action',
      flex: 2,
      render: (item) => {
        let actionColor = colors.text.muted;
        const a = item.action.toUpperCase();
        if (a.includes('CREATE') || a.includes('ADD')) actionColor = colors.success;
        else if (a.includes('UPDATE') || a.includes('EDIT')) actionColor = colors.info;
        else if (a.includes('DELETE') || a.includes('REMOVE')) actionColor = colors.danger;
        else if (a.includes('LOGIN')) actionColor = colors.primary;

        return (
          <View style={{ flex: 1, paddingVertical: 6, justifyContent: 'center', alignItems: 'flex-start' }}>
            <StatusPill label={<>{item.action}</>} textStyle={[styles.actionBadgeText, { color: actionColor }]} />
          </View>
        );
      }
    },
    {
      key: 'description',
      title: 'Description',
      flex: 4,
      render: (item) => (
        <View style={{ flex: 1, paddingVertical: 6, justifyContent: 'center' }}>
          <Text style={{ ...Typography.bodySm, color: colors.text.primary }}>{item.description}</Text>
        </View>
      )
    },
    {
      key: 'ip',
      title: 'IP & Detail',
      flex: 1.5,
      align: 'right',
      render: (item) => (
        <View style={{ flex: 1, paddingVertical: 6, justifyContent: 'center', alignItems: 'flex-end' }}>
          <Text style={styles.logIp}>{item.ipAddress || '—'}</Text>
          {item.details && (
            <Text style={{ ...Typography.eyebrow, color: colors.primary, fontWeight: '700', marginTop: 2 }}>
              VIEW DETAIL
            </Text>
          )}
        </View>
      )
    }
  ];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Audit log" subtitle="Review activity and changes across your workspace." />
      {/* Filter and Search Bar */}
      <ListToolbar
        searchValue={searchText}
        onSearchChange={setSearchText}
        itemCount={totalItems}
        onSubmitEditing={handleSearchSubmit}
        searchPlaceholder="Search email, action, details..."
        renderFilters={() => (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={styles.dateInput}
              placeholder="From date"
              placeholderTextColor={colors.text.muted}
              value={dateFrom}
              onChangeText={setDateFrom}
            />
            <TextInput
              style={styles.dateInput}
              placeholder="To date"
              placeholderTextColor={colors.text.muted}
              value={dateTo}
              onChangeText={setDateTo}
            />
          </View>
        )}
        primaryAction={{
          label: 'Search',
          onPress: handleSearchSubmit
        }}
        containerStyle={{ paddingBottom: Spacing.md }}
      />

      {/* Log Feed */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <WorkspaceLoading title="Loading audit records…" message="Fetching the latest activity log." />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: Spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {logs.length === 0 ? (
            <EmptyState title={<>No audit log entries found</>}  />
          ) : (
            <View style={styles.logsContainer}>
              <DataTable 
                data={sortedLogs || []} 
                columns={columns} 
                keyExtractor={(item: any, index: number) => item._id || String(index)} 
                minWidth={900} 
                embedded 
                onRowPress={(item: any) => setSelectedLog(item)}
                renderTableHeader={() => (
                  <View style={styles.tableHeader}>
                    <TouchableOpacity style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }} onPress={() => { setSortField('timestamp'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}>
                      <Text style={{ ...Typography.caption, fontWeight: '800', color: colors.text.secondary }}>Timestamp</Text>
                      {sortField === 'timestamp' && <Ionicons name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} color={colors.primary} style={{ marginLeft: 4 }} />}
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 2, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }} onPress={() => { setSortField('user'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}>
                      <Text style={{ ...Typography.caption, fontWeight: '800', color: colors.text.secondary }}>User</Text>
                      {sortField === 'user' && <Ionicons name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} color={colors.primary} style={{ marginLeft: 4 }} />}
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 2, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }} onPress={() => { setSortField('action'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}>
                      <Text style={{ ...Typography.caption, fontWeight: '800', color: colors.text.secondary }}>Action</Text>
                      {sortField === 'action' && <Ionicons name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} color={colors.primary} style={{ marginLeft: 4 }} />}
                    </TouchableOpacity>
                    <Text style={[styles.headerCell, { flex: 4, paddingHorizontal: 12 }]}>Description</Text>
                    <Text style={[styles.headerCell, { flex: 1.5, textAlign: 'right', paddingHorizontal: 12 }]}>IP & Detail</Text>
                  </View>
                )} 
              />
            </View>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <View style={styles.pagination}>
              <TouchableOpacity
                style={[styles.pagerBtn, page === 1 && styles.pagerBtnDisabled]}
                disabled={page === 1}
                onPress={() => setPage(prev => Math.max(1, prev - 1))}
              >
                <Ionicons name="arrow-back" size={16} color={page === 1 ? colors.text.muted : colors.primary} />
                <Text style={[styles.pagerText, page === 1 && { color: colors.text.muted }]}>Prev</Text>
              </TouchableOpacity>

              <Text style={styles.pageLabel}>
                Page {page} of {totalPages} ({totalItems} items)
              </Text>

              <TouchableOpacity
                style={[styles.pagerBtn, page === totalPages && styles.pagerBtnDisabled]}
                disabled={page === totalPages}
                onPress={() => setPage(prev => Math.min(totalPages, prev + 1))}
              >
                <Text style={[styles.pagerText, page === totalPages && { color: colors.text.muted }]}>Next</Text>
                <Ionicons name="arrow-forward" size={16} color={page === totalPages ? colors.text.muted : colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* Audit Detail Modal */}
      <Modal
        visible={!!selectedLog}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedLog(null)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedLog(null)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Details</Text>
              <TouchableOpacity onPress={() => setSelectedLog(null)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            {selectedLog && (
              <ScrollView contentContainerStyle={styles.modalScroll}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Timestamp</Text>
                  <Text style={styles.detailVal}>
                    {new Date(selectedLog.createdAt).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Action Event</Text>
                  <Text style={[styles.detailVal, { fontWeight: '800', color: colors.primary }]}>
                    {selectedLog.action}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>User Operator</Text>
                  <Text style={styles.detailVal}>
                    {selectedLog.userName} ({selectedLog.userEmail || 'anonymous'})
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>IP Address</Text>
                  <Text style={styles.detailVal}>{selectedLog.ipAddress || '—'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Client User-Agent</Text>
                  <Text style={styles.detailVal}>{selectedLog.deviceInfo || '—'}</Text>
                </View>
                <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.detailLabel}>Description</Text>
                  <Text style={styles.detailVal}>{selectedLog.description}</Text>
                </View>

                {selectedLog.details && (
                  <View style={styles.jsonContainer}>
                    <Text style={styles.jsonLabel}>Payload Metadata</Text>
                    <View style={styles.jsonBox}>
                      <Text style={styles.jsonText}>
                        {JSON.stringify(selectedLog.details, null, 2)}
                      </Text>
                    </View>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    padding: Spacing.lg,
    backgroundColor: colors.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { ...Typography.h1, fontWeight: '800', color: colors.text.primary },
  subtitle: { ...Typography.bodySm, color: colors.text.secondary, marginTop: 4 },
  deniedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: colors.bg.primary,
  },
  deniedCard: {
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.xl,
    alignItems: 'center',
    maxWidth: 500,
    gap: 16,
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }
    })
  },
  deniedTitle: { ...Typography.h1, fontWeight: '800', color: colors.text.primary },
  deniedText: { ...Typography.bodySm, color: colors.text.secondary, textAlign: 'center' },
  searchBar: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: 12,
  },
  searchFieldContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
  },
  searchInput: { borderWidth: 0, backgroundColor: 'transparent', ...Typography.bodySm, flex: 1, height: 40, color: colors.text.primary },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: { ...Typography.bodySm, color: '#fff', fontWeight: '700' },
  dateInput: { ...Typography.bodySm, width: 110, height: 40, color: colors.text.primary, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 10 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyContainer: {
    padding: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: { ...Typography.body, color: colors.text.muted },
  logsContainer: {
    paddingHorizontal: Spacing.lg,
  },
  table: {
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.02)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  headerCell: { ...Typography.caption, fontWeight: '800', color: colors.text.secondary },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cell: { ...Typography.bodySm, color: colors.text.primary },
  logUser: { ...Typography.bodySm, fontWeight: '700', color: colors.text.primary },
  logEmail: { ...Typography.caption, color: colors.text.secondary },
  logIp: { ...Typography.bodySm, color: colors.text.secondary, fontWeight: '500' },
  actionBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  actionBadgeText: { ...Typography.eyebrow, fontWeight: '800' },
  logCard: {
    backgroundColor: colors.bg.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.md,
    marginBottom: 12,
    gap: 8,
  },
  logCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logCardTime: { ...Typography.caption, color: colors.text.secondary },
  logCardDesc: { ...Typography.bodySm, color: colors.text.primary },
  logCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.02)',
    paddingTop: 8,
    marginTop: 4,
  },
  logCardUser: { ...Typography.caption, color: colors.text.secondary },
  logCardIp: { ...Typography.caption, color: colors.text.secondary },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  pagerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 6,
  },
  pagerBtnDisabled: {
    borderColor: colors.border,
    opacity: 0.5,
  },
  pagerText: { ...Typography.bodySm, fontWeight: '600', color: colors.primary },
  pageLabel: { ...Typography.bodySm, color: colors.text.secondary },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 600,
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { ...Typography.h3, fontWeight: '800', color: colors.text.primary },
  modalScroll: {
    padding: Spacing.lg,
  },
  detailRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.03)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 20,
  },
  detailLabel: { ...Typography.bodySm, fontWeight: '700', color: colors.text.secondary, width: 120 },
  detailVal: { ...Typography.bodySm, flex: 1, color: colors.text.primary, textAlign: 'right' },
  jsonContainer: {
    marginTop: 20,
  },
  jsonLabel: { ...Typography.caption, fontWeight: '700', color: colors.text.secondary, marginBottom: 8 },
  jsonBox: {
    backgroundColor: colors.bg.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.md,
  },
  jsonText: { ...Typography.bodySm, color: colors.text.primary },
});
