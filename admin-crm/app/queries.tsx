import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, TextInput, Image, Modal, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors, Shadows } from '../constants/theme';
import { api, ProductQuery, getImageUrl } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';

export default function QueriesScreen() {
  const [queries, setQueries] = useState<ProductQuery[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'contacted' | 'converted' | 'closed'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const load = useCallback(async () => {
    try {
      const data = await api.getQueries();
      setQueries(data);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', 'Failed to load queries: ' + err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    api.clearCache();
    await load();
    setRefreshing(false);
  }, [load]);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    setActionLoading(id);
    try {
      await api.updateQueryStatus(id, newStatus);
      await load();
    } catch (err: any) {
      Alert.alert('Error', 'Failed to update status: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleConvertToLead = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await api.convertQueryToLead(id);
      Alert.alert(
        'Success', 
        `Converted successfully!\nLead created for ${res.lead.name} with product interest: ${res.lead.productInterest?.join(', ')}.`
      );
      await load();
    } catch (err: any) {
      Alert.alert('Error', 'Failed to convert to lead: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredQueries = queries.filter(q => {
    const matchesTab = activeTab === 'all' || q.status === activeTab;
    if (!matchesTab) return false;
    if (!search) return true;
    const lower = search.toLowerCase();
    return (
      q.name.toLowerCase().includes(lower) ||
      q.email.toLowerCase().includes(lower) ||
      q.phone.toLowerCase().includes(lower) ||
      q.productName.toLowerCase().includes(lower) ||
      q.query.toLowerCase().includes(lower)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return colors.danger;
      case 'contacted': return colors.warning;
      case 'converted': return colors.success;
      case 'closed': return colors.text.muted;
      default: return colors.primary;
    }
  };

  return (
    <View style={styles.screen}>
      {/* Search Bar Container with Status Dropdown Inside */}
      <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.xs }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.bg.card,
          paddingHorizontal: 12,
          paddingRight: 8,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 10,
          minHeight: 46
        }}>
          <Ionicons name="search" size={18} color={colors.text.muted} />
          <TextInput
            style={{ flex: 1, height: 42, color: colors.text.primary, fontSize: 13, minWidth: 100 }}
            placeholder="Search queries by name, product, text..."
            placeholderTextColor={colors.text.muted}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.text.muted} />
            </TouchableOpacity>
          ) : null}

          {/* Status Dropdown inside search bar */}
          {Platform.OS === 'web' ? (
            <select
              value={activeTab}
              onChange={(e: any) => setActiveTab(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: `1px solid ${colors.border}`,
                backgroundColor: colors.bg.secondary,
                color: colors.text.primary,
                fontSize: 12,
                fontWeight: '600',
                outline: 'none',
                height: 34,
                cursor: 'pointer'
              }}
            >
              <option value="all">All Statuses ({queries.length})</option>
              <option value="pending">Pending ({queries.filter(q => q.status === 'pending').length})</option>
              <option value="contacted">Contacted ({queries.filter(q => q.status === 'contacted').length})</option>
              <option value="converted">Converted ({queries.filter(q => q.status === 'converted').length})</option>
              <option value="closed">Closed ({queries.filter(q => q.status === 'closed').length})</option>
            </select>
          ) : (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: colors.bg.secondary,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 6,
                paddingHorizontal: 10,
                height: 34,
                gap: 6
              }}
              onPress={() => {
                const opts = [
                  { label: `All Statuses (${queries.length})`, val: 'all' },
                  { label: `Pending (${queries.filter(q => q.status === 'pending').length})`, val: 'pending' },
                  { label: `Contacted (${queries.filter(q => q.status === 'contacted').length})`, val: 'contacted' },
                  { label: `Converted (${queries.filter(q => q.status === 'converted').length})`, val: 'converted' },
                  { label: `Closed (${queries.filter(q => q.status === 'closed').length})`, val: 'closed' },
                ];
                Alert.alert('Filter Status', '', opts.map(o => ({
                  text: o.label,
                  onPress: () => setActiveTab(o.val as any)
                })));
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary }}>
                {activeTab.toUpperCase()} ({activeTab === 'all' ? queries.length : queries.filter(q => q.status === activeTab).length})
              </Text>
              <Ionicons name="chevron-down" size={12} color={colors.text.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Query List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {filteredQueries.map(q => (
          <View key={q._id} style={[styles.queryCard, { borderLeftColor: getStatusColor(q.status), borderLeftWidth: 4 }]}>
            {/* Header info */}
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.submitterName}>{q.name}</Text>
                <Text style={styles.submissionDate}>
                  {new Date(q.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(q.status) + '15', borderColor: getStatusColor(q.status) }]}>
                <Text style={[styles.statusBadgeText, { color: getStatusColor(q.status) }]}>
                  {q.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Product Interest banner */}
            <View style={styles.productBanner}>
              <Ionicons name="cube-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.productBannerText}>Inquiry Product: </Text>
              <Text style={styles.productNameText}>{q.productName}</Text>
            </View>

            {/* Contact details */}
            <View style={styles.contactRow}>
              <TouchableOpacity 
                style={styles.contactItem}
                onPress={() => Alert.alert('Contact Info', `Email: ${q.email}\nPhone: ${q.phone}`)}
              >
                <Ionicons name="mail-outline" size={14} color={colors.text.secondary} />
                <Text style={styles.contactText}>{q.email}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.contactItem}
                onPress={() => Alert.alert('Contact Info', `Email: ${q.email}\nPhone: ${q.phone}`)}
              >
                <Ionicons name="call-outline" size={14} color={colors.text.secondary} />
                <Text style={styles.contactText}>{q.phone}</Text>
              </TouchableOpacity>
            </View>

            {/* Message/Query content */}
            <View style={styles.messageBox}>
              <Text style={styles.messageLabel}>Query Message:</Text>
              <Text style={styles.messageText}>{q.query}</Text>
            </View>

            {/* Attached Photo Preview */}
            {q.image ? (
              <View style={styles.attachmentBox}>
                <Text style={styles.attachmentLabel}>Attached Photo:</Text>
                <TouchableOpacity onPress={() => setSelectedImage(getImageUrl(q.image))}>
                  <Image 
                    source={{ uri: getImageUrl(q.image) }} 
                    style={styles.attachmentThumb} 
                    resizeMode="cover"
                  />
                  <View style={styles.zoomOverlay}>
                    <Ionicons name="search-outline" size={20} color="#fff" />
                    <Text style={styles.zoomText}>View Photo</Text>
                  </View>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Footer Actions */}
            <View style={styles.cardActions}>
              {actionLoading === q._id ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 8 }} />
              ) : (
                <>
                  {q.status === 'pending' && (
                    <TouchableOpacity 
                      style={[styles.actionBtn, { borderColor: colors.warning }]} 
                      onPress={() => handleUpdateStatus(q._id, 'contacted')}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.warning} />
                      <Text style={[styles.actionBtnText, { color: colors.warning }]}>Mark Contacted</Text>
                    </TouchableOpacity>
                  )}
                  {q.status !== 'converted' && q.status !== 'closed' && (
                    <TouchableOpacity 
                      style={[styles.actionBtn, { borderColor: colors.text.muted }]} 
                      onPress={() => handleUpdateStatus(q._id, 'closed')}
                    >
                      <Ionicons name="close-circle-outline" size={14} color={colors.text.muted} />
                      <Text style={[styles.actionBtnText, { color: colors.text.muted }]}>Close Query</Text>
                    </TouchableOpacity>
                  )}
                  {q.status !== 'converted' && (
                    <TouchableOpacity 
                      style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]} 
                      onPress={() => handleConvertToLead(q._id)}
                    >
                      <Ionicons name="person-add-outline" size={14} color="#fff" />
                      <Text style={styles.primaryActionBtnText}>Convert to Lead</Text>
                    </TouchableOpacity>
                  )}
                  {q.status === 'converted' && (
                    <View style={styles.successLabel}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                      <Text style={styles.successLabelText}>Converted to CRM Lead</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        ))}

        {filteredQueries.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="mail-unread-outline" size={48} color={colors.text.muted} />
            <Text style={styles.emptyTitle}>No Queries Found</Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'all' 
                ? 'No inquiries have been submitted yet.' 
                : `No queries with status "${activeTab}" found.`}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Image Overlay Modal */}
      <Modal visible={!!selectedImage} transparent animationType="fade" onRequestClose={() => setSelectedImage(null)}>
        <View style={styles.overlayContainer}>
          <TouchableOpacity style={styles.overlayCloseBtn} onPress={() => setSelectedImage(null)}>
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          {selectedImage && (
            <Image 
              source={{ uri: selectedImage }} 
              style={styles.overlayImage} 
              resizeMode="contain" 
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  topBar: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, height: '100%', color: colors.text.primary, fontSize: 14, marginLeft: 8 },
  tabsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border },
  tabBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  tabBtnTextActive: { color: '#fff', fontWeight: '700' },
  badge: { marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  queryCard: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, padding: Spacing.lg, borderWidth: 1, borderColor: colors.border, ...Shadows.card },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  submitterName: { fontSize: 16, fontWeight: '800', color: colors.text.primary },
  submissionDate: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
  statusBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  statusBadgeText: { fontSize: 9, fontWeight: '800' },
  productBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm, marginBottom: 12 },
  productBannerText: { fontSize: 12, color: colors.text.secondary },
  productNameText: { fontSize: 12, fontWeight: '700', color: colors.text.primary },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 12 },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contactText: { fontSize: 12, color: colors.text.secondary },
  messageBox: { backgroundColor: colors.bg.primary, padding: 12, borderRadius: Radius.sm, borderLeftColor: colors.primary, borderLeftWidth: 2, marginBottom: 12 },
  messageLabel: { fontSize: 11, fontWeight: '700', color: colors.text.muted, marginBottom: 4 },
  messageText: { fontSize: 13, color: colors.text.primary, lineHeight: 18 },
  attachmentBox: { marginBottom: 16 },
  attachmentLabel: { fontSize: 11, fontWeight: '700', color: colors.text.muted, marginBottom: 6 },
  attachmentThumb: { width: '100%', height: 160, borderRadius: Radius.sm, backgroundColor: '#000' },
  zoomOverlay: { position: 'absolute', bottom: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  zoomText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: Radius.sm, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.02)' },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  primaryActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 7, borderRadius: Radius.sm },
  primaryActionBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  successLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  successLabelText: { color: colors.success, fontSize: 12, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingVertical: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text.primary },
  emptySubtitle: { fontSize: 13, color: colors.text.muted, textAlign: 'center', paddingHorizontal: 20 },
  overlayContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  overlayImage: { width: '90%', height: '80%' },
  overlayCloseBtn: { position: 'absolute', top: 40, right: 24, zIndex: 10 }
});
