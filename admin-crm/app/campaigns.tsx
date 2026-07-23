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
  RefreshControl,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { api, Campaign } from '../utils/api';
import { usePermission } from '../utils/permissions';
import { Spacing, Radius, LightColors } from '../constants/theme';

const STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280',
  scheduled: '#3b82f6',
  running: '#10b981',
  paused: '#f59e0b',
  completed: '#6366f1',
  cancelled: '#ef4444',
};

const PLATFORM_LABELS: Record<string, string> = {
  social_media: 'Social Media',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  google: 'Google Ads',
  other: 'Other',
};

export default function CampaignsScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const perm = usePermission();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create/Edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', platform: 'social_media', startDate: '', endDate: '',
    budget: '', targetAudience: '', content: '', notes: '',
  });
  const [modalError, setModalError] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // Detail modal
  const [detailCampaign, setDetailCampaign] = useState<Campaign | null>(null);

  const fetchCampaigns = useCallback(async () => {
    try {
      const data = await api.getCampaigns(search || undefined, statusFilter || undefined);
      setCampaigns(data);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCampaigns();
  }, [fetchCampaigns]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm({ name: '', platform: 'social_media', startDate: '', endDate: '', budget: '', targetAudience: '', content: '', notes: '' });
    setModalError('');
    setIsModalOpen(true);
  };

  const openEditModal = (c: Campaign) => {
    setEditingId(c._id);
    setForm({
      name: c.name, platform: c.platform,
      startDate: c.startDate ? c.startDate.slice(0, 10) : '',
      endDate: c.endDate ? c.endDate.slice(0, 10) : '',
      budget: String(c.budget), targetAudience: c.targetAudience,
      content: c.content, notes: c.notes,
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setModalError('Campaign name is required'); return; }
    setModalSubmitting(true);
    setModalError('');
    try {
      const payload: any = {
        name: form.name.trim(), platform: form.platform,
        startDate: form.startDate || null, endDate: form.endDate || null,
        budget: parseFloat(form.budget) || 0, targetAudience: form.targetAudience.trim(),
        content: form.content.trim(), notes: form.notes.trim(),
      };
      if (editingId) {
        const updated = await api.updateCampaign(editingId, payload);
        setCampaigns(prev => prev.map(c => c._id === editingId ? updated : c));
      } else {
        const created = await api.createCampaign(payload);
        setCampaigns(prev => [created, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setModalError(err.message || 'Failed to save campaign');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleLaunch = async (id: string) => {
    setActionLoading(id);
    try {
      const updated = await api.launchCampaign(id);
      setCampaigns(prev => prev.map(c => c._id === id ? updated : c));
    } catch (err: any) {
      alert(err.message || 'Failed to launch campaign');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (id: string) => {
    setActionLoading(id);
    try {
      const updated = await api.pauseCampaign(id);
      setCampaigns(prev => prev.map(c => c._id === id ? updated : c));
    } catch (err: any) {
      alert(err.message || 'Failed to pause campaign');
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = async (id: string) => {
    setActionLoading(id);
    try {
      const updated = await api.completeCampaign(id);
      setCampaigns(prev => prev.map(c => c._id === id ? updated : c));
    } catch (err: any) {
      alert(err.message || 'Failed to complete campaign');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Delete campaign "${name}"?`)
      : false;
    if (!confirmed) return;
    setActionLoading(id);
    try {
      await api.deleteCampaign(id);
      setCampaigns(prev => prev.filter(c => c._id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete campaign');
    } finally {
      setActionLoading(null);
    }
  };

  const formatCurrency = (v: number) => `₹${v.toLocaleString('en-IN')}`;
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

  const stats = {
    total: campaigns.length,
    running: campaigns.filter(c => c.status === 'running').length,
    draft: campaigns.filter(c => c.status === 'draft').length,
    completed: campaigns.filter(c => c.status === 'completed').length,
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Campaigns...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Stats Bar */}
      <View style={styles.statsRow}>
        {[
          { label: 'Total', value: stats.total, color: colors.text.primary },
          { label: 'Running', value: stats.running, color: '#10b981' },
          { label: 'Draft', value: stats.draft, color: '#6b7280' },
          { label: 'Completed', value: stats.completed, color: '#6366f1' },
        ].map(s => (
          <View key={s.label} style={styles.statBox}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Standardized Search & Title Topbar */}
      <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.xs }}>
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
          <Ionicons name="megaphone-outline" size={18} color={colors.text.muted} />

          <TextInput
            style={{ flex: 1, height: 42, color: colors.text.primary, fontSize: 13, minWidth: 120 }}
            placeholder="Search campaigns..."
            placeholderTextColor={colors.text.muted}
            value={search}
            onChangeText={setSearch}
          />

          {/* Status Dropdown */}
          <View style={{ position: 'relative', zIndex: 100 }}>
            <Pressable
              onPress={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: Radius.sm,
                backgroundColor: colors.bg.secondary,
                borderWidth: 1,
                borderColor: colors.border,
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.secondary }}>
                {statusFilter ? statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1) : 'All Statuses'}
              </Text>
              <Ionicons name={isStatusDropdownOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.secondary} />
            </Pressable>

            {isStatusDropdownOpen && (
              <View style={{
                position: 'absolute',
                top: 38,
                right: 0,
                backgroundColor: colors.bg.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: Radius.md,
                width: 130,
                zIndex: 9999,
                elevation: 8,
                overflow: 'hidden',
              }}>
                {[
                  { label: 'All Statuses', val: '' },
                  { label: 'Draft', val: 'draft' },
                  { label: 'Running', val: 'running' },
                  { label: 'Paused', val: 'paused' },
                  { label: 'Completed', val: 'completed' },
                  { label: 'Cancelled', val: 'cancelled' },
                ].map(item => (
                  <Pressable
                    key={item.val}
                    onPress={() => {
                      setStatusFilter(item.val);
                      setIsStatusDropdownOpen(false);
                    }}
                    style={({ pressed }) => ({
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      backgroundColor: statusFilter === item.val
                        ? colors.primaryLight
                        : (pressed ? colors.bg.secondary : colors.bg.card),
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border + '40',
                    })}
                  >
                    <Text style={{
                      fontSize: 11,
                      fontWeight: statusFilter === item.val ? '700' : '600',
                      color: statusFilter === item.val ? colors.primary : colors.text.secondary,
                    }}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {perm.can('campaign:create') && (
            <TouchableOpacity
              style={{ height: 34, paddingHorizontal: 14, borderRadius: Radius.sm, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              onPress={openCreateModal}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>New Campaign</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {campaigns.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="megaphone-outline" size={48} color={colors.text.muted} />
            <Text style={styles.emptyText}>No campaigns yet</Text>
            {perm.can('campaign:create') && (
              <TouchableOpacity style={styles.emptyBtn} onPress={openCreateModal}>
                <Text style={styles.emptyBtnText}>Create your first campaign</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {campaigns.map(c => (
          <TouchableOpacity key={c._id} style={styles.card} onPress={() => setDetailCampaign(c)} activeOpacity={0.8}>
            <View style={styles.cardTop}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>{c.name}</Text>
                <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[c.status] || '#6b7280') + '15', borderColor: STATUS_COLORS[c.status] || '#6b7280' }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[c.status] || '#6b7280' }]}>{c.status.toUpperCase()}</Text>
                </View>
              </View>
              <Text style={styles.cardPlatform}>{PLATFORM_LABELS[c.platform] || c.platform}</Text>
            </View>

            <View style={styles.cardMeta}>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={12} color={colors.text.muted} />
                <Text style={styles.metaText}>{formatDate(c.startDate)} — {formatDate(c.endDate)}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="cash-outline" size={12} color={colors.text.muted} />
                <Text style={styles.metaText}>{formatCurrency(c.budget)}</Text>
              </View>
            </View>

            <View style={styles.cardAnalytics}>
              <View style={styles.analyticsItem}>
                <Text style={styles.analyticsValue}>{c.analytics.impressions}</Text>
                <Text style={styles.analyticsLabel}>Impressions</Text>
              </View>
              <View style={styles.analyticsItem}>
                <Text style={styles.analyticsValue}>{c.analytics.clicks}</Text>
                <Text style={styles.analyticsLabel}>Clicks</Text>
              </View>
              <View style={styles.analyticsItem}>
                <Text style={styles.analyticsValue}>{c.analytics.leads}</Text>
                <Text style={styles.analyticsLabel}>Leads</Text>
              </View>
              <View style={styles.analyticsItem}>
                <Text style={[styles.analyticsValue, { color: colors.success }]}>{formatCurrency(c.analytics.revenue)}</Text>
                <Text style={styles.analyticsLabel}>Revenue</Text>
              </View>
            </View>

            {/* Action buttons */}
            {perm.can('campaign:publish') && (
              <View style={styles.cardActions}>
                {c.status === 'draft' && (
                  <TouchableOpacity style={styles.actionBtnLaunch} onPress={() => handleLaunch(c._id)} disabled={actionLoading === c._id}>
                    <Ionicons name="play" size={14} color="#fff" />
                    <Text style={styles.actionBtnText}>Launch</Text>
                  </TouchableOpacity>
                )}
                {c.status === 'running' && (
                  <>
                    <TouchableOpacity style={styles.actionBtnPause} onPress={() => handlePause(c._id)} disabled={actionLoading === c._id}>
                      <Ionicons name="pause" size={14} color="#fff" />
                      <Text style={styles.actionBtnText}>Pause</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtnComplete} onPress={() => handleComplete(c._id)} disabled={actionLoading === c._id}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                      <Text style={styles.actionBtnText}>Complete</Text>
                    </TouchableOpacity>
                  </>
                )}
                {c.status === 'paused' && (
                  <TouchableOpacity style={styles.actionBtnLaunch} onPress={() => handleLaunch(c._id)} disabled={actionLoading === c._id}>
                    <Ionicons name="play" size={14} color="#fff" />
                    <Text style={styles.actionBtnText}>Resume</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {actionLoading === c._id && (
              <View style={styles.rowOverlay}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
          </TouchableOpacity>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Create/Edit Modal */}
      <Modal visible={isModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsModalOpen(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Edit Campaign' : 'New Campaign'}</Text>
              <TouchableOpacity onPress={() => setIsModalOpen(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            {modalError ? (
              <View style={styles.errorAlert}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errorAlertText}>{modalError}</Text>
              </View>
            ) : null}
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Campaign Name *</Text>
              <TextInput style={styles.input} placeholder="e.g. Monsoon Offer 2026" placeholderTextColor={colors.text.muted} value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} />
              <Text style={styles.inputLabel}>Platform</Text>
              <View style={styles.platformRow}>
                {Object.entries(PLATFORM_LABELS).map(([key, label]) => (
                  <TouchableOpacity key={key} style={[styles.platformChip, form.platform === key && { backgroundColor: colors.primary + '15', borderColor: colors.primary }]} onPress={() => setForm(p => ({ ...p, platform: key }))}>
                    <Text style={[styles.platformChipText, form.platform === key && { color: colors.primary, fontWeight: '700' }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Start Date</Text>
                  <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.muted} value={form.startDate} onChangeText={v => setForm(p => ({ ...p, startDate: v }))} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>End Date</Text>
                  <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.muted} value={form.endDate} onChangeText={v => setForm(p => ({ ...p, endDate: v }))} />
                </View>
              </View>
              <Text style={styles.inputLabel}>Budget (₹)</Text>
              <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.text.muted} keyboardType="numeric" value={form.budget} onChangeText={v => setForm(p => ({ ...p, budget: v }))} />
              <Text style={styles.inputLabel}>Target Audience</Text>
              <TextInput style={styles.input} placeholder="e.g. Doctors in Patna, age 30-50" placeholderTextColor={colors.text.muted} value={form.targetAudience} onChangeText={v => setForm(p => ({ ...p, targetAudience: v }))} />
              <Text style={styles.inputLabel}>Content / Message</Text>
              <TextInput style={[styles.input, { minHeight: 60 }]} placeholder="Campaign message, offer details..." placeholderTextColor={colors.text.muted} multiline value={form.content} onChangeText={v => setForm(p => ({ ...p, content: v }))} />
              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput style={[styles.input, { minHeight: 60 }]} placeholder="Internal notes..." placeholderTextColor={colors.text.muted} multiline value={form.notes} onChangeText={v => setForm(p => ({ ...p, notes: v }))} />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsModalOpen(false)} disabled={modalSubmitting}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSave} disabled={modalSubmitting}>
                {modalSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnText}>{editingId ? 'Update' : 'Create Campaign'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={!!detailCampaign} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setDetailCampaign(null)} />
          <View style={[styles.modalContainer, { maxWidth: 560 }]}>
            {detailCampaign && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle} numberOfLines={1}>{detailCampaign.name}</Text>
                  <TouchableOpacity onPress={() => setDetailCampaign(null)} style={styles.modalCloseBtn}>
                    <Ionicons name="close" size={20} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.modalForm}>
                  <View style={[styles.statusBadge, { alignSelf: 'flex-start', backgroundColor: (STATUS_COLORS[detailCampaign.status] || '#6b7280') + '15', borderColor: STATUS_COLORS[detailCampaign.status] || '#6b7280', marginBottom: 12 }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[detailCampaign.status] || '#6b7280' }]}>{detailCampaign.status.toUpperCase()}</Text>
                  </View>
                  <DetailRow label="Platform" value={PLATFORM_LABELS[detailCampaign.platform] || detailCampaign.platform} />
                  <DetailRow label="Period" value={`${formatDate(detailCampaign.startDate)} — ${formatDate(detailCampaign.endDate)}`} />
                  <DetailRow label="Budget" value={formatCurrency(detailCampaign.budget)} />
                  <DetailRow label="Spent" value={formatCurrency(detailCampaign.spent)} />
                  {detailCampaign.targetAudience ? <DetailRow label="Target Audience" value={detailCampaign.targetAudience} /> : null}
                  {detailCampaign.content ? <DetailRow label="Content" value={detailCampaign.content} /> : null}
                  {detailCampaign.notes ? <DetailRow label="Notes" value={detailCampaign.notes} /> : null}
                  {detailCampaign.createdBy ? <DetailRow label="Created By" value={detailCampaign.createdBy.name} /> : null}
                  {detailCampaign.launchedAt ? <DetailRow label="Launched At" value={formatDate(detailCampaign.launchedAt)} /> : null}

                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text.primary, marginTop: 16, marginBottom: 8 }}>Analytics</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {[
                      { label: 'Impressions', value: detailCampaign.analytics.impressions },
                      { label: 'Clicks', value: detailCampaign.analytics.clicks },
                      { label: 'Leads', value: detailCampaign.analytics.leads },
                      { label: 'Conversions', value: detailCampaign.analytics.conversions },
                      { label: 'Revenue', value: formatCurrency(detailCampaign.analytics.revenue) },
                    ].map(a => (
                      <View key={a.label} style={{ backgroundColor: colors.bg.secondary, borderRadius: Radius.md, padding: 12, minWidth: 100, flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text.primary }}>{a.value}</Text>
                        <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: '600' }}>{a.label}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                <View style={styles.modalFooter}>
                  {perm.can('campaign:edit') && (
                    <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.warning }]} onPress={() => { const c = detailCampaign; setDetailCampaign(null); openEditModal(c); }}>
                      <Text style={styles.submitBtnText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                  {perm.can('campaign:delete') && (
                    <TouchableOpacity style={[styles.submitBtn, { backgroundColor: colors.danger }]} onPress={() => { handleDelete(detailCampaign._id, detailCampaign.name); setDetailCampaign(null); }}>
                      <Text style={styles.submitBtnText}>Delete</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setDetailCampaign(null)}>
                    <Text style={styles.cancelBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border + '50' }}>
      <Text style={{ flex: 0.35, fontSize: 12, fontWeight: '700', color: colors.text.secondary }}>{label}</Text>
      <Text style={{ flex: 0.65, fontSize: 12, color: colors.text.primary }}>{value}</Text>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg.primary },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.primary },
    loadingText: { marginTop: 12, fontSize: 14, color: colors.text.secondary, fontWeight: '600' },
    statsRow: { flexDirection: 'row', gap: 8, padding: Spacing.lg, paddingBottom: 0 },
    statBox: { flex: 1, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, alignItems: 'center' },
    statValue: { fontSize: 20, fontWeight: '800' },
    statLabel: { fontSize: 10, color: colors.text.muted, fontWeight: '600', marginTop: 2 },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.lg, paddingBottom: 0 },
    searchInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, height: 40 },
    searchInput: { flex: 1, fontSize: 13, color: colors.text.primary, marginLeft: 6 },
    filterGroup: { flexDirection: 'row', gap: 4 },
    filterChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
    filterChipText: { fontSize: 10, fontWeight: '600', color: colors.text.secondary, textTransform: 'capitalize' },
    addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    scrollContent: { padding: Spacing.lg, gap: 12 },
    card: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.md, position: 'relative' },
    cardTop: { marginBottom: 8 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text.primary, flex: 1 },
    statusBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1.5 },
    statusText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.3 },
    cardPlatform: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
    cardMeta: { flexDirection: 'row', gap: 16, marginBottom: 8 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 11, color: colors.text.secondary },
    cardAnalytics: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border + '50', borderBottomWidth: 1, borderBottomColor: colors.border + '50' },
    analyticsItem: { flex: 1, alignItems: 'center' },
    analyticsValue: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
    analyticsLabel: { fontSize: 8, color: colors.text.muted, fontWeight: '600' },
    cardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
    actionBtnLaunch: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10b981', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm },
    actionBtnPause: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f59e0b', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm },
    actionBtnComplete: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#6366f1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm },
    actionBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    rowOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.6)', justifyContent: 'center', alignItems: 'center', borderRadius: Radius.lg },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
    emptyText: { fontSize: 14, color: colors.text.muted, fontWeight: '600' },
    emptyBtn: { backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: Radius.md },
    emptyBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    // Modal
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContainer: { width: '90%', maxWidth: 520, maxHeight: '90%', backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', elevation: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
    modalTitle: { fontSize: 16, fontWeight: '800', color: colors.text.primary, flex: 1 },
    modalCloseBtn: { padding: 4 },
    modalForm: { padding: Spacing.lg },
    inputLabel: { fontSize: 11, fontWeight: '700', color: colors.text.secondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text.primary, marginBottom: 14 },
    platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
    platformChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.primary },
    platformChipText: { fontSize: 10, fontWeight: '600', color: colors.text.secondary },
    modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: Spacing.lg, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border, gap: 12, backgroundColor: colors.bg.secondary },
    cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border },
    cancelBtnText: { color: colors.text.secondary, fontSize: 13, fontWeight: '700' },
    submitBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', minWidth: 100 },
    submitBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    errorAlert: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.danger + '10', borderWidth: 1, borderColor: colors.danger + '30', borderRadius: Radius.md, marginHorizontal: Spacing.lg, marginTop: Spacing.md, padding: 10 },
    errorAlertText: { color: colors.danger, fontSize: 12, fontWeight: '600', flex: 1 },
  });