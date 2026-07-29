import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { api } from '../utils/api';
import { Spacing, Radius, LightColors } from '../constants/theme';
import UnauthorizedScreen from '../components/UnauthorizedScreen';

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
  const [searchText, setSearchText] = useState('');
  const [searchVal, setSearchVal] = useState('');

  // Date range
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
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

  useEffect(() => {
    if (perm.can('audit:view')) {
      fetchLogs(page, searchVal);
    } else {
      setLoading(false);
    }
  }, [page, searchVal, user, fetchLogs]);

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

  const renderLogItem = (item: AuditLogItem) => {
    const date = new Date(item.createdAt);
    const dateStr = date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Colour coding actions
    let actionBg = colors.infoLight;
    let actionColor = colors.info;
    if (item.action.includes('ERROR') || item.action.includes('FAILED') || item.action.includes('DELETE')) {
      actionBg = colors.dangerLight;
      actionColor = colors.danger;
    } else if (item.action.includes('SUCCESS') || item.action.includes('FINALIZE')) {
      actionBg = colors.successLight;
      actionColor = colors.success;
    } else if (item.action.includes('UPDATE')) {
      actionBg = colors.warningLight;
      actionColor = colors.warning;
    }

    if (isDesktop) {
      return (
        <TouchableOpacity
          key={item._id}
          style={styles.tableRow}
          onPress={() => setSelectedLog(item)}
          activeOpacity={0.7}
        >
          <Text style={[styles.cell, { flex: 1.5, color: colors.text.secondary }]}>{dateStr} {timeStr}</Text>
          <View style={[styles.cell, { flex: 2 }]}>
            <Text style={styles.logUser}>{item.userName}</Text>
            <Text style={styles.logEmail}>{item.userEmail || 'anonymous'}</Text>
          </View>
          <View style={[styles.cell, { flex: 2, alignItems: 'flex-start' }]}>
            <View style={[styles.actionBadge, { backgroundColor: actionBg }]}>
              <Text style={[styles.actionBadgeText, { color: actionColor }]}>{item.action}</Text>
            </View>
          </View>
          <Text style={[styles.cell, { flex: 4 }]}>{item.description}</Text>
          <View style={[styles.cell, { flex: 1.5, alignItems: 'flex-end' }]}>
            <Text style={styles.logIp}>{item.ipAddress || '—'}</Text>
            {item.details && (
              <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '700', marginTop: 2 }}>
                VIEW DETAIL
              </Text>
            )}
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={item._id}
        style={styles.logCard}
        onPress={() => setSelectedLog(item)}
        activeOpacity={0.7}
      >
        <View style={styles.logCardHeader}>
          <View style={[styles.actionBadge, { backgroundColor: actionBg }]}>
            <Text style={[styles.actionBadgeText, { color: actionColor }]}>{item.action}</Text>
          </View>
          <Text style={styles.logCardTime}>{dateStr} {timeStr}</Text>
        </View>
        
        <Text style={styles.logCardDesc}>{item.description}</Text>
        
        <View style={styles.logCardFooter}>
          <Text style={styles.logCardUser}>By: {item.userName} ({item.userEmail || 'anon'})</Text>
          <Text style={styles.logCardIp}>IP: {item.ipAddress || '—'}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      {/* Filter and Search Bar */}
      <View style={styles.searchBar}>
        <View style={styles.searchFieldContainer}>
          <Ionicons name="search-outline" size={18} color={colors.text.muted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search email, action, details..."
            placeholderTextColor={colors.text.muted}
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearchSubmit}
          />
          {searchText ? (
            <TouchableOpacity onPress={handleClearSearch} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={16} color={colors.text.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
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
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearchSubmit}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Log Feed */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.text.secondary }}>Loading audit records...</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: Spacing.xl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {logs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="folder-open-outline" size={48} color={colors.text.muted} />
              <Text style={styles.emptyText}>No audit log entries found</Text>
            </View>
          ) : (
            <View style={styles.logsContainer}>
              {isDesktop ? (
                <View style={styles.table}>
                  {/* Table Header */}
                  <View style={styles.tableHeader}>
                    <TouchableOpacity style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center' }} onPress={() => { setSortField('timestamp'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Timestamp</Text>
                      {sortField === 'timestamp' && <Ionicons name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} color={colors.primary} style={{ marginLeft: 4 }} />}
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }} onPress={() => { setSortField('user'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>User</Text>
                      {sortField === 'user' && <Ionicons name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} color={colors.primary} style={{ marginLeft: 4 }} />}
                    </TouchableOpacity>
                    <TouchableOpacity style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }} onPress={() => { setSortField('action'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Action</Text>
                      {sortField === 'action' && <Ionicons name={sortDir === 'asc' ? 'arrow-up' : 'arrow-down'} size={10} color={colors.primary} style={{ marginLeft: 4 }} />}
                    </TouchableOpacity>
                    <Text style={[styles.headerCell, { flex: 4 }]}>Description</Text>
                    <Text style={[styles.headerCell, { flex: 1.5, textAlign: 'right' }]}>IP & Detail</Text>
                  </View>
                  {/* Rows */}
                  {sortedLogs.map(renderLogItem)}
                </View>
              ) : (
                sortedLogs.map(renderLogItem)
              )}
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
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 4,
  },
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
  deniedTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.primary,
  },
  deniedText: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
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
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 13,
    color: colors.text.primary,
  },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  dateInput: {
    width: 110,
    height: 40,
    fontSize: 12,
    color: colors.text.primary,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 10,
  },
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
  emptyText: {
    fontSize: 14,
    color: colors.text.muted,
  },
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
  headerCell: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  cell: {
    fontSize: 13,
    color: colors.text.primary,
  },
  logUser: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  logEmail: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  logIp: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  actionBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
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
  logCardTime: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  logCardDesc: {
    fontSize: 13,
    color: colors.text.primary,
    lineHeight: 18,
  },
  logCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.02)',
    paddingTop: 8,
    marginTop: 4,
  },
  logCardUser: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  logCardIp: {
    fontSize: 11,
    color: colors.text.secondary,
  },
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
  pagerText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  pageLabel: {
    fontSize: 12,
    color: colors.text.secondary,
  },
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
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
  },
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
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: 120,
  },
  detailVal: {
    flex: 1,
    fontSize: 13,
    color: colors.text.primary,
    textAlign: 'right',
  },
  jsonContainer: {
    marginTop: 20,
  },
  jsonLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  jsonBox: {
    backgroundColor: colors.bg.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: Spacing.md,
  },
  jsonText: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', web: 'monospace' }),
    fontSize: 12,
    color: colors.text.primary,
  },
});
