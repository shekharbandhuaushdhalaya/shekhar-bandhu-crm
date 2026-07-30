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
  Switch,
  Image,
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

  // Social Promotions States
  const [socialPosts, setSocialPosts] = useState<any[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<any[]>([]);
  const [previewPlatform, setPreviewPlatform] = useState<'facebook' | 'instagram' | 'google' | 'email' | 'sms'>('facebook');
  const [imageLoadError, setImageLoadError] = useState(false);
  const [publishSocialNow, setPublishSocialNow] = useState(false);
  const [campaignSelectedPlatforms, setCampaignSelectedPlatforms] = useState<Record<string, boolean>>({
    facebook: true,
    instagram: true,
    linkedin: false,
    whatsapp: false,
  });
  const [campaignSocialImage, setCampaignSocialImage] = useState('');

  // Fetch social accounts connected status
  useEffect(() => {
    api.getSocialAccounts().then(setSocialAccounts).catch(err => console.error('Failed to load accounts:', err));
  }, []);

  const fetchCampaigns = useCallback(async () => {
    try {
      const data = await api.getCampaigns(search || undefined, statusFilter || undefined);
      setCampaigns(data);

      // Derive active social posts from social_media campaigns dynamically
      const socialMediaCampaigns = data.filter((c: any) => c.platform === 'social_media' || c.content);
      if (socialMediaCampaigns.length > 0) {
        const derivedPosts = socialMediaCampaigns.map((c: any) => ({
          id: c._id || c.id || `sp_${Math.random()}`,
          text: c.content || c.notes || c.name || 'Ayurvedic Wellness Campaign',
          image: c.imageUrl || 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80',
          platforms: c.selectedPlatforms 
            ? Object.keys(c.selectedPlatforms).filter(k => c.selectedPlatforms[k]) 
            : ['facebook', 'instagram'],
          status: c.status ? (c.status.charAt(0).toUpperCase() + c.status.slice(1)) : 'Active',
          publishedAt: c.startDate || c.createdAt || new Date().toISOString(),
          metrics: c.metrics || { reach: '0', clicks: '0', likes: 0, comments: 0 }
        }));
        setSocialPosts(derivedPosts);
      } else {
        setSocialPosts([]);
      }
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
    api.clearCache();
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

      let activePlatforms: string[] = [];
      if (form.platform === 'social_media' && publishSocialNow) {
        activePlatforms = Object.keys(campaignSelectedPlatforms).filter(k => campaignSelectedPlatforms[k]);
        if (activePlatforms.length === 0) {
          throw new Error('Please select at least one social media platform to publish.');
        }
        payload.status = 'running'; // Auto launch if publishing
      }

      let savedCampaign: Campaign;
      if (editingId) {
        savedCampaign = await api.updateCampaign(editingId, payload);
        setCampaigns(prev => prev.map(c => c._id === editingId ? savedCampaign : c));
      } else {
        savedCampaign = await api.createCampaign(payload);
        setCampaigns(prev => [savedCampaign, ...prev]);
      }

      // Publish to social media if checked
      if (form.platform === 'social_media' && publishSocialNow) {
        try {
          const response = await api.publishSocialPost(activePlatforms, form.content, campaignSocialImage || undefined);
          
          // Also append to our mock feed list for visual consistency
          const newPost = {
            id: 'sp_' + Date.now(),
            text: form.content,
            image: campaignSocialImage || 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80',
            platforms: activePlatforms,
            status: response.errors && response.errors.length > 0 ? 'Partial Error' : 'Published',
            publishedAt: new Date().toISOString(),
            metrics: { 
              reach: response.errors && response.errors.length > 0 ? '-' : '1', 
              clicks: '0', 
              likes: response.errors && response.errors.length > 0 ? 0 : 1, 
              comments: 0 
            }
          };
          setSocialPosts(prev => [newPost, ...prev]);

          if (response.errors && response.errors.length > 0) {
            const errDetails = response.errors.map((e: any) => `${e.platform}: ${e.error}`).join('\n');
            alert(`Campaign created/updated, but social media publishing completed with some errors:\n\n${errDetails}`);
          } else {
            alert('Campaign created and promotion successfully posted to your social pages!');
          }
        } catch (errSoc: any) {
          alert(`Campaign created successfully, but social media publishing failed: ${errSoc.message}`);
        }
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
      <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md, marginBottom: Spacing.xs, zIndex: 50 }}>
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
          minHeight: 46,
          zIndex: 60
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

        {/* Active & Scheduled Social Promotions Feed */}
        <Text style={[styles.sectionTitle, { marginTop: 24, paddingHorizontal: Spacing.sm }]}>Active & Scheduled Social Promotions Feed</Text>
        {socialPosts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="megaphone-outline" size={48} color={colors.text.muted} />
            <Text style={styles.emptyText}>No social promotions published yet.</Text>
          </View>
        ) : (
          socialPosts.map(post => (
            <View key={post.id} style={styles.socialFeedCard}>
              <View style={styles.feedCardHeader}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}>
                  <Image source={{ uri: post.image }} style={styles.feedCardImageThumb} />
                  <View style={styles.feedCardContentTextCol}>
                    <Text style={styles.feedCardText} numberOfLines={1}>{post.text}</Text>
                    <Text style={styles.feedCardTime}>{formatDate(post.publishedAt)}</Text>
                  </View>
                </View>
                <View style={[styles.statusBadge, post.status === 'Published' ? { backgroundColor: '#10b98115', borderColor: '#10b981' } : { backgroundColor: '#3b82f615', borderColor: '#3b82f6' }]}>
                  <Text style={[styles.statusText, post.status === 'Published' ? { color: '#10b981' } : { color: '#3b82f6' }]}>{post.status.toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.feedCardPlatforms}>
                {post.platforms.map(p => {
                  const details = {
                    facebook: { name: 'Facebook', icon: 'logo-facebook' as const, color: '#1877f2' },
                    instagram: { name: 'Instagram', icon: 'logo-instagram' as const, color: '#e1306c' },
                    linkedin: { name: 'LinkedIn', icon: 'logo-linkedin' as const, color: '#0a66c2' },
                    whatsapp: { name: 'WhatsApp', icon: 'logo-whatsapp' as const, color: '#25d366' },
                  }[p] || { name: p, icon: 'globe-outline' as const, color: colors.primary };

                  return (
                    <View key={p} style={[styles.feedPlatformBadge, { backgroundColor: details.color + '15' }]}>
                      <Ionicons name={details.icon} size={12} color={details.color} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: details.color }}>{details.name}</Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.feedCardMetrics}>
                <View style={styles.feedMetricItem}>
                  <Text style={styles.feedMetricValue}>{post.metrics.reach}</Text>
                  <Text style={styles.feedMetricLabel}>Est. Reach</Text>
                </View>
                <View style={styles.feedMetricItem}>
                  <Text style={styles.feedMetricValue}>{post.metrics.clicks}</Text>
                  <Text style={styles.feedMetricLabel}>Clicks</Text>
                </View>
                <View style={styles.feedMetricItem}>
                  <Text style={styles.feedMetricValue}>{post.metrics.likes}</Text>
                  <Text style={styles.feedMetricLabel}>Likes</Text>
                </View>
                <View style={styles.feedMetricItem}>
                  <Text style={styles.feedMetricValue}>{post.metrics.comments}</Text>
                  <Text style={styles.feedMetricLabel}>Comments</Text>
                </View>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Create/Edit Modal */}
      <Modal visible={isModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setIsModalOpen(false)} />
          <View style={[styles.modalContainer, Platform.OS === 'web' && { maxWidth: 960, width: '90%' }]}>
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
            
            <View style={{ flexDirection: Platform.OS === 'web' ? 'row' : 'column', flex: 1, maxHeight: 600 }}>
              <ScrollView style={[styles.modalForm, { flex: 1, borderRightWidth: Platform.OS === 'web' ? 1 : 0, borderRightColor: colors.border }]}>
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
                    {Platform.OS === 'web' ? (
                      <input
                        type="date"
                        value={form.startDate}
                        onChange={(e: any) => setForm(p => ({ ...p, startDate: e.target.value }))}
                        style={{
                          padding: '8px 10px',
                          borderRadius: Radius.md,
                          border: `1px solid ${colors.border}`,
                          backgroundColor: colors.bg.primary,
                          color: colors.text.primary,
                          fontSize: 13,
                          height: 40,
                          width: '100%',
                          outline: 'none',
                          boxSizing: 'border-box',
                          marginBottom: 14,
                        } as any}
                      />
                    ) : (
                      <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.muted} value={form.startDate} onChangeText={v => setForm(p => ({ ...p, startDate: v }))} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>End Date</Text>
                    {Platform.OS === 'web' ? (
                      <input
                        type="date"
                        value={form.endDate}
                        onChange={(e: any) => setForm(p => ({ ...p, endDate: e.target.value }))}
                        style={{
                          padding: '8px 10px',
                          borderRadius: Radius.md,
                          border: `1px solid ${colors.border}`,
                          backgroundColor: colors.bg.primary,
                          color: colors.text.primary,
                          fontSize: 13,
                          height: 40,
                          width: '100%',
                          outline: 'none',
                          boxSizing: 'border-box',
                          marginBottom: 14,
                        } as any}
                      />
                    ) : (
                      <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.muted} value={form.endDate} onChangeText={v => setForm(p => ({ ...p, endDate: v }))} />
                    )}
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

                {form.platform === 'social_media' && (
                  <View style={{ backgroundColor: colors.bg.secondary, padding: 12, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: colors.text.primary }}>Publish directly to connected social pages?</Text>
                      <Switch
                        value={publishSocialNow}
                        onValueChange={setPublishSocialNow}
                        trackColor={{ false: '#767577', true: colors.primary + '80' }}
                        thumbColor={publishSocialNow ? colors.primary : '#f4f3f4'}
                      />
                    </View>
                    
                    {publishSocialNow && (
                      <>
                        <Text style={styles.inputLabel}>Social Platforms</Text>
                        <View style={[styles.platformSelectorRow, { marginBottom: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }]}>
                          {[
                            { id: 'facebook', name: 'Facebook', icon: 'logo-facebook' as const, color: '#1877f2', connected: true },
                            { id: 'instagram', name: 'Instagram', icon: 'logo-instagram' as const, color: '#e1306c', connected: true },
                            { id: 'linkedin', name: 'LinkedIn', icon: 'logo-linkedin' as const, color: '#0a66c2', connected: false },
                            { id: 'whatsapp', name: 'WhatsApp', icon: 'logo-whatsapp' as const, color: '#25d366', connected: true },
                          ].map(acc => {
                            const isSelected = campaignSelectedPlatforms[acc.id];
                            const isDisabled = !acc.connected;
                            return (
                              <TouchableOpacity
                                key={acc.id}
                                disabled={isDisabled}
                                style={[
                                  styles.platformSelectorChip,
                                  isSelected && { borderColor: acc.color, backgroundColor: acc.color + '10' },
                                  isDisabled && { opacity: 0.4 }
                                ]}
                                onPress={() => setCampaignSelectedPlatforms(prev => ({ ...prev, [acc.id]: !prev[acc.id] }))}
                              >
                                <Ionicons name={acc.icon} size={14} color={isSelected ? acc.color : colors.text.muted} />
                                <Text style={[styles.platformSelectorText, isSelected && { color: acc.color, fontWeight: '700' }]}>{acc.name}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        <Text style={styles.inputLabel}>Banner / Graphic URL</Text>
                        <TextInput 
                          style={styles.input} 
                          placeholder="Attach image URL..." 
                          placeholderTextColor={colors.text.muted} 
                          value={campaignSocialImage} 
                          onChangeText={setCampaignSocialImage} 
                        />
                      </>
                    )}
                  </View>
                )}
              </ScrollView>

              {/* Live Preview Side Panel */}
              <ScrollView style={{ flex: 1, padding: Spacing.lg, backgroundColor: colors.bg.secondary }} contentContainerStyle={{ gap: 12 }}>
                <View style={styles.previewToggleRow}>
                  <Text style={styles.previewTitle}>Live Platform Preview</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewPills}>
                    <TouchableOpacity 
                      style={[styles.previewPill, previewPlatform === 'facebook' && styles.previewPillActive]}
                      onPress={() => setPreviewPlatform('facebook')}
                    >
                      <Ionicons name="logo-facebook" size={12} color={previewPlatform === 'facebook' ? '#1877f2' : colors.text.secondary} />
                      <Text style={[styles.previewPillText, previewPlatform === 'facebook' && { color: '#1877f2' }]}>Facebook</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.previewPill, previewPlatform === 'instagram' && styles.previewPillActive]}
                      onPress={() => setPreviewPlatform('instagram')}
                    >
                      <Ionicons name="logo-instagram" size={12} color={previewPlatform === 'instagram' ? '#e1306c' : colors.text.secondary} />
                      <Text style={[styles.previewPillText, previewPlatform === 'instagram' && { color: '#e1306c' }]}>Instagram</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.previewPill, previewPlatform === 'google' && styles.previewPillActive]}
                      onPress={() => setPreviewPlatform('google')}
                    >
                      <Ionicons name="logo-google" size={12} color={previewPlatform === 'google' ? '#ea4335' : colors.text.secondary} />
                      <Text style={[styles.previewPillText, previewPlatform === 'google' && { color: '#ea4335' }]}>Google Ad</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.previewPill, previewPlatform === 'email' && styles.previewPillActive]}
                      onPress={() => setPreviewPlatform('email')}
                    >
                      <Ionicons name="mail" size={12} color={previewPlatform === 'email' ? colors.primary : colors.text.secondary} />
                      <Text style={[styles.previewPillText, previewPlatform === 'email' && { color: colors.primary }]}>Email</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.previewPill, previewPlatform === 'sms' && styles.previewPillActive]}
                      onPress={() => setPreviewPlatform('sms')}
                    >
                      <Ionicons name="chatbox-ellipses" size={12} color={previewPlatform === 'sms' ? '#25d366' : colors.text.secondary} />
                      <Text style={[styles.previewPillText, previewPlatform === 'sms' && { color: '#25d366' }]}>SMS</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>

                {previewPlatform === 'facebook' && (
                  <View style={styles.fbMockCard}>
                    <View style={styles.mockHeader}>
                      <Image source={require('../assets/logo.png')} style={styles.mockAvatar} />
                      <View style={styles.mockUserInfo}>
                        <Text style={styles.mockProfileName}>Shekhar Bandhu Aushadhalaya</Text>
                        <View style={styles.mockTimeRow}>
                          <Text style={styles.mockTime}>Just now</Text>
                          <Ionicons name="earth" size={12} color="#8f9296" />
                        </View>
                      </View>
                      <Ionicons name="ellipsis-horizontal" size={16} color="#65676b" />
                    </View>
                    <Text style={styles.mockText}>
                      {form.content || 'Write your campaign content message to preview here...'}
                    </Text>
                    {campaignSocialImage ? (
                      imageLoadError ? (
                        <View style={{ padding: 12, backgroundColor: '#f0f2f5', borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginBottom: 8, gap: 4 }}>
                          <Ionicons name="warning-outline" size={20} color={colors.warning} />
                          <Text style={{ fontSize: 11, color: colors.text.secondary, textAlign: 'center' }}>Not a direct image URL</Text>
                        </View>
                      ) : (
                        <Image source={{ uri: campaignSocialImage }} style={styles.mockImage} resizeMode="cover" onError={() => setImageLoadError(true)} />
                      )
                    ) : null}
                    <View style={styles.mockStatsRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ backgroundColor: '#1877f2', borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="thumbs-up" size={10} color="#fff" />
                        </View>
                        <Text style={styles.mockStatsText}>1</Text>
                      </View>
                      <Text style={styles.mockStatsText}>0 comments • 0 shares</Text>
                    </View>
                    <View style={styles.mockActionsRow}>
                      <View style={styles.mockActionBtn}>
                        <Ionicons name="thumbs-up-outline" size={16} color="#65676b" />
                        <Text style={styles.mockActionText}>Like</Text>
                      </View>
                      <View style={styles.mockActionBtn}>
                        <Ionicons name="chatbubble-outline" size={16} color="#65676b" />
                        <Text style={styles.mockActionText}>Comment</Text>
                      </View>
                      <View style={styles.mockActionBtn}>
                        <Ionicons name="share-social-outline" size={16} color="#65676b" />
                        <Text style={styles.mockActionText}>Share</Text>
                      </View>
                    </View>
                  </View>
                )}

                {previewPlatform === 'instagram' && (
                  <View style={styles.igMockCard}>
                    <View style={styles.mockHeader}>
                      <Image source={require('../assets/logo.png')} style={styles.mockAvatar} />
                      <View style={styles.mockUserInfo}>
                        <Text style={styles.mockProfileName}>shekhar_bandhu_official</Text>
                        <Text style={styles.mockLocation}>Sponsored</Text>
                      </View>
                      <Ionicons name="ellipsis-horizontal" size={16} color="#262626" />
                    </View>
                    {campaignSocialImage ? (
                      imageLoadError ? (
                        <View style={[styles.mockImagePlaceholderIg, { gap: 6 }]}>
                          <Ionicons name="warning-outline" size={24} color={colors.warning} />
                          <Text style={{ fontSize: 11, color: colors.text.muted, paddingHorizontal: 16, textAlign: 'center' }}>Not a direct image URL</Text>
                        </View>
                      ) : (
                        <Image source={{ uri: campaignSocialImage }} style={styles.mockImageIg} resizeMode="cover" onError={() => setImageLoadError(true)} />
                      )
                    ) : (
                      <View style={styles.mockImagePlaceholderIg}>
                        <Ionicons name="image-outline" size={40} color={colors.text.muted} />
                      </View>
                    )}
                    <View style={styles.mockActionsIg}>
                      <View style={{ flexDirection: 'row', gap: 14 }}>
                        <Ionicons name="heart-outline" size={22} color="#262626" />
                        <Ionicons name="chatbubble-outline" size={22} color="#262626" />
                        <Ionicons name="paper-plane-outline" size={22} color="#262626" />
                      </View>
                      <Ionicons name="bookmark-outline" size={22} color="#262626" />
                    </View>
                    <Text style={styles.mockLikesIg}>1 like</Text>
                    <Text style={styles.mockCaptionIg} numberOfLines={3}>
                      <Text style={{ fontWeight: '700' }}>shekhar_bandhu_official </Text>
                      {form.content || 'Write your campaign content message to preview here...'}
                    </Text>
                  </View>
                )}

                {previewPlatform === 'google' && (
                  <View style={styles.googleMockCard}>
                    <View style={styles.googleMockHeader}>
                      <View style={styles.googleAdBadge}>
                        <Text style={styles.googleAdBadgeText}>Sponsored</Text>
                      </View>
                      <Text style={styles.googleMockUrl} numberOfLines={1}>https://www.shekharbandhu.com/products</Text>
                    </View>
                    <Text style={styles.googleMockTitle} numberOfLines={1}>
                      Shekhar Bandhu Aushadhalaya - Ayurvedic Medicine
                    </Text>
                    <Text style={styles.googleMockDesc} numberOfLines={3}>
                      {form.content || 'Experience the purity of traditional wellness formulas. Certified natural ingredients, direct shipping nationwide. Order online now.'}
                    </Text>
                  </View>
                )}

                {previewPlatform === 'email' && (
                  <View style={styles.emailMockCard}>
                    <View style={styles.emailMockHeader}>
                      <Text style={styles.emailMockLabel} numberOfLines={1}>From: Shekhar Bandhu &lt;info@shekharbandhu.com&gt;</Text>
                      <Text style={styles.emailMockLabel} numberOfLines={1}>Subject: Monsoon Wellness Special - 15% Off</Text>
                    </View>
                    <ScrollView style={styles.emailMockBody} nestedScrollEnabled>
                      <Text style={styles.emailMockLogo}>SHEKHAR BANDHU</Text>
                      {campaignSocialImage ? (
                        imageLoadError ? (
                          <View style={[styles.emailMockImage, { backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', gap: 6 }]}>
                            <Ionicons name="warning-outline" size={20} color={colors.warning} />
                            <Text style={{ fontSize: 10, color: colors.text.muted, textAlign: 'center', paddingHorizontal: 12 }}>Not a direct image URL</Text>
                          </View>
                        ) : (
                          <Image source={{ uri: campaignSocialImage }} style={styles.emailMockImage} resizeMode="cover" onError={() => setImageLoadError(true)} />
                        )
                      ) : null}
                      <Text style={styles.emailMockContentText}>
                        {form.content || 'Experience the purity of traditional wellness formulas. Certified natural ingredients, direct shipping nationwide. Order online now.'}
                      </Text>
                      <View style={styles.emailMockBtn}>
                        <Text style={styles.emailMockBtnText}>Shop Now</Text>
                      </View>
                    </ScrollView>
                  </View>
                )}

                {previewPlatform === 'sms' && (
                  <View style={styles.smsMockCard}>
                    <View style={styles.smsHeader}>
                      <View style={styles.smsAvatar}>
                        <Ionicons name="person" size={14} color="#8e8e93" />
                      </View>
                      <Text style={styles.smsSender}>Shekhar Bandhu</Text>
                    </View>
                    <View style={styles.smsBubble}>
                      <Text style={styles.smsText}>
                        {form.content || 'Experience the purity of traditional wellness formulas. Certified natural ingredients, direct shipping nationwide. Order online now.'}
                      </Text>
                      <Text style={styles.smsTime}>Just now</Text>
                    </View>
                  </View>
                )}
              </ScrollView>
            </View>
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

    // Social feed card styles
    socialFeedCard: { backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.lg, padding: Spacing.md, gap: 10, marginBottom: 12 },
    feedCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    feedCardImageThumb: { width: 36, height: 36, borderRadius: 4 },
    feedCardContentTextCol: { marginLeft: 2, justifyContent: 'center' },
    feedCardText: { fontSize: 12.5, fontWeight: '700', color: colors.text.primary, maxWidth: 200 },
    feedCardTime: { fontSize: 10, color: colors.text.muted, marginTop: 2 },
    feedCardPlatforms: { flexDirection: 'row', gap: 6 },
    feedPlatformBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm },
    feedCardMetrics: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border + '50', paddingTop: 8, gap: 12 },
    feedMetricItem: { flex: 1, alignItems: 'center' },
    feedMetricValue: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
    feedMetricLabel: { fontSize: 8, color: colors.text.muted, fontWeight: '600' },

    // Social platforms select row
    platformSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    platformSelectorChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.bg.primary },
    platformSelectorText: { fontSize: 11, fontWeight: '600', color: colors.text.secondary },

    // Live preview styles
    previewToggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
    previewTitle: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
    previewPills: { flexDirection: 'row', gap: 6, backgroundColor: colors.bg.secondary, padding: 3, borderRadius: Radius.sm },
    previewPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.sm },
    previewPillActive: { backgroundColor: colors.bg.card, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    previewPillText: { fontSize: 10, fontWeight: '700', color: colors.text.secondary },

    // Facebook mock styles
    fbMockCard: { backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#e4e6eb', padding: 12, width: '100%' },
    mockHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    mockAvatar: { width: 36, height: 36, borderRadius: 18 },
    mockUserInfo: { flex: 1, marginLeft: 8 },
    mockProfileName: { fontSize: 12.5, fontWeight: '700', color: '#050505' },
    mockLocation: { fontSize: 11, color: '#65676b', marginTop: 1 },
    mockTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
    mockTime: { fontSize: 11, color: '#65676b' },
    mockText: { fontSize: 13, color: '#050505', marginBottom: 8, lineHeight: 18 },
    mockImage: { width: '100%', height: 180, borderRadius: 4, marginBottom: 8 },
    mockStatsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#ced0d4' },
    mockStatsText: { fontSize: 11.5, color: '#65676b' },
    mockActionsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 6 },
    mockActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
    mockActionText: { fontSize: 12, fontWeight: '600', color: '#65676b' },

    // Instagram mock styles
    igMockCard: { backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#dbdbdb', paddingVertical: 10, width: '100%' },
    mockImageIg: { width: '100%', height: 260 },
    mockImagePlaceholderIg: { width: '100%', height: 260, backgroundColor: '#fafafa', alignItems: 'center', justifyContent: 'center' },
    mockActionsIg: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
    mockLikesIg: { fontSize: 12.5, fontWeight: '700', color: '#262626', paddingHorizontal: 12, marginBottom: 4 },
    mockCaptionIg: { fontSize: 12.5, color: '#262626', paddingHorizontal: 12, lineHeight: 16 },

    // Google Ad mock styles
    googleMockCard: { backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#dadce0', padding: 16, width: '100%', gap: 6 },
    googleMockHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    googleAdBadge: { backgroundColor: '#f1f3f4', borderWidth: 1, borderColor: '#dadce0', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
    googleAdBadgeText: { fontSize: 9, fontWeight: '700', color: '#202124' },
    googleMockUrl: { fontSize: 11, color: '#202124', flex: 1 },
    googleMockTitle: { fontSize: 16, color: '#1a0dab', fontWeight: '500' },
    googleMockDesc: { fontSize: 13, color: '#4d5156', lineHeight: 18 },

    // Email mock styles
    emailMockCard: { backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#e0e0e0', width: '100%', height: 350, overflow: 'hidden' },
    emailMockHeader: { backgroundColor: '#f5f5f5', padding: 10, borderBottomWidth: 1, borderBottomColor: '#e0e0e0', gap: 4 },
    emailMockLabel: { fontSize: 10.5, color: '#444444', fontWeight: '500' },
    emailMockBody: { padding: 16, backgroundColor: '#ffffff', flex: 1 },
    emailMockLogo: { fontSize: 15, fontWeight: '800', color: colors.primary, textAlign: 'center', marginVertical: 8 },
    emailMockImage: { width: '100%', height: 120, borderRadius: 4, marginBottom: 12 },
    emailMockContentText: { fontSize: 12, color: '#333333', lineHeight: 18, marginBottom: 16 },
    emailMockBtn: { backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 4, alignSelf: 'center', marginBottom: 16 },
    emailMockBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },

    // SMS mock styles
    smsMockCard: { backgroundColor: '#f4f4f7', borderRadius: 8, borderWidth: 1, borderColor: '#d1d1d6', padding: 12, width: '100%', gap: 10 },
    smsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', marginBottom: 4 },
    smsAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#e5e5ea', alignItems: 'center', justifyContent: 'center' },
    smsSender: { fontSize: 10.5, fontWeight: '600', color: '#8e8e93' },
    smsBubble: { backgroundColor: '#e5e5ea', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '85%', alignSelf: 'flex-start', position: 'relative' },
    smsText: { fontSize: 13, color: '#000000', lineHeight: 17 },
    smsTime: { fontSize: 8.5, color: '#8e8e93', marginTop: 4, alignSelf: 'flex-end' },
    sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text.primary, marginBottom: 12, letterSpacing: 0.3 },
  });