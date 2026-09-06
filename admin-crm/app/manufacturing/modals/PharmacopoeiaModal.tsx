import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';
import { api } from '../../../utils/api';
import { useDebouncedValue } from '../../../utils/useDebouncedValue';

interface Props {
  visible: boolean;
  onClose: () => void;
  onRefreshMaterials: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function PharmacopoeiaModal({ visible, onClose, onRefreshMaterials, showToast }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const [viewTab, setViewTab] = useState<'all' | 'unverified'>('all');
  const [unverifiedCount, setUnverifiedCount] = useState<number>(0);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [editingRefId, setEditingRefId] = useState<string | null>(null);
  const [refText, setRefText] = useState<string>('');

  const fetchUnverifiedCount = async () => {
    try {
      const list = await api.getUnverifiedPharmacopoeia();
      if (Array.isArray(list)) {
        setUnverifiedCount(list.length);
        if (viewTab === 'unverified') {
          setMonographs(list);
        }
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (!visible) return;

    let active = true;
    fetchUnverifiedCount();

    const fetchMonographs = async () => {
      try {
        if (monographs.length === 0) {
          setLoading(true);
        } else {
          setIsSearching(true);
        }

        if (viewTab === 'unverified') {
          const list = await api.getUnverifiedPharmacopoeia();
          if (active) {
            let filtered = Array.isArray(list) ? list : [];
            if (debouncedSearch) {
              const q = debouncedSearch.toLowerCase();
              filtered = filtered.filter(m =>
                (m.ayurvedicName || '').toLowerCase().includes(q) ||
                (m.botanicalName || '').toLowerCase().includes(q) ||
                (m.monographRef || '').toLowerCase().includes(q)
              );
            }
            setMonographs(filtered);
            setHasMore(false);
          }
        } else {
          const data = await api.getPharmacopoeia(debouncedSearch, selectedStandard, { page: 1, limit: 50 });
          if (active) {
            const list = Array.isArray(data) ? data : (data?.data || []);
            setMonographs(list);
            setPage(1);
            setHasMore(list.length === 50);
          }
        }
      } catch (err: any) {
        if (active) {
          showToast(err.message || 'Failed to load Ayurvedic pharmacopoeia monographs', 'error');
        }
      } finally {
        if (active) {
          setLoading(false);
          setIsSearching(false);
        }
      }
    };

    fetchMonographs();

    return () => {
      active = false;
    };
  }, [visible, debouncedSearch, selectedStandard, viewTab]);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || viewTab === 'unverified') return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await api.getPharmacopoeia(debouncedSearch, selectedStandard, { page: nextPage, limit: 50 });
      const list = Array.isArray(data) ? data : (data?.data || []);
      setMonographs(prev => [...prev, ...list]);
      setPage(nextPage);
      setHasMore(list.length === 50);
    } catch (err: any) {
      showToast(err.message || 'Failed to load more monographs', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleImportSingle = async (monograph: any) => {
    try {
      setImportingId(monograph._id);
      const res = await api.importPharmacopoeiaToRawMaterials({ monographId: monograph._id });
      showToast(res.message || `Imported ${monograph.ayurvedicName} into Raw Materials`, 'success');
      onRefreshMaterials();
    } catch (err: any) {
      showToast(err.message || `Failed to import ${monograph.ayurvedicName}`, 'error');
    } finally {
      setImportingId(null);
    }
  };

  const handleImportAll = async () => {
    try {
      setImportingAll(true);
      const res = await api.importPharmacopoeiaToRawMaterials({ importAll: true });
      showToast(res.message || 'Imported all Ayurvedic ingredients!', 'success');
      onRefreshMaterials();
    } catch (err: any) {
      showToast(err.message || 'Failed to import all ingredients', 'error');
    } finally {
      setImportingAll(false);
    }
  };

  const handleVerify = async (monograph: any) => {
    try {
      setVerifyingId(monograph._id);
      const updatedRef = editingRefId === monograph._id ? refText : monograph.monographRef;
      await api.verifyPharmacopoeia(monograph._id, { monographRef: updatedRef });
      showToast(`Verified & approved ${monograph.ayurvedicName}`, 'success');
      setEditingRefId(null);
      setMonographs(prev => prev.map(m => m._id === monograph._id ? { ...m, verified: true, monographRef: updatedRef } : m));
      setUnverifiedCount(prev => Math.max(0, prev - 1));
      if (viewTab === 'unverified') {
        setMonographs(prev => prev.filter(m => m._id !== monograph._id));
      }
    } catch (err: any) {
      showToast(err.message || `Failed to verify ${monograph.ayurvedicName}`, 'error');
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalContainer, { maxWidth: 880, width: '94%', height: '90%' }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>📖 Ayurvedic Pharmacopoeia Library (API / AFI)</Text>
              <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                Official Ayurvedic Ingredients Master Monograph Database & Verification Review
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {/* Verification Tab Selector */}
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, backgroundColor: colors.bg.secondary }}>
            <TouchableOpacity
              onPress={() => setViewTab('all')}
              style={{
                paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 2,
                borderBottomColor: viewTab === 'all' ? colors.primary : 'transparent'
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: viewTab === 'all' ? colors.primary : colors.text.secondary }}>
                📚 All Monograph Database
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setViewTab('unverified')}
              style={{
                paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 2,
                borderBottomColor: viewTab === 'unverified' ? colors.warning || '#f59e0b' : 'transparent',
                flexDirection: 'row', alignItems: 'center', gap: 6
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: viewTab === 'unverified' ? (colors.warning || '#f59e0b') : colors.text.secondary }}>
                ⚠️ Pending Review
              </Text>
              <View style={{ backgroundColor: (colors.warning || '#f59e0b') + '20', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.warning || '#f59e0b' }}>
                  {unverifiedCount}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Quick Bulk Seed Action Bar */}
          {viewTab === 'all' && (
            <View style={{
              backgroundColor: colors.primary + '12', padding: 12, borderRadius: 8,
              borderWidth: 1, borderColor: colors.primary + '30', marginHorizontal: 16, marginTop: 12,
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10
            }}>
              <View style={{ flex: 1, minWidth: 240 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary }}>
                  ⚡ Bulk Import Ayurvedic Ingredients
                </Text>
                <Text style={{ fontSize: 10.5, color: colors.text.secondary, marginTop: 2 }}>
                  Instantly populate your Raw Materials Master with all standard Ayurvedic herbs, oils & Rasa Shastra minerals.
                </Text>
              </View>
              <TouchableOpacity
                style={{
                  backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8,
                  borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: importingAll ? 0.6 : 1
                }}
                disabled={importingAll}
                onPress={handleImportAll}
              >
                {importingAll ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="cloud-download-outline" size={16} color="#fff" />
                )}
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                  {importingAll ? 'Importing All...' : 'Import All Monograph Ingredients'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Search & Filter Toolbar */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <View style={{ flex: 2, minWidth: 200, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Ionicons name="search-outline" size={16} color={colors.text.muted} style={{ marginRight: 6 }} />
              <TextInput
                style={{ flex: 1, fontSize: 13, color: colors.text.primary, padding: 0 }}
                placeholder="Search Ayurvedic name, botanical binomial, or monograph ref..."
                placeholderTextColor={colors.text.muted}
                value={search}
                onChangeText={setSearch}
              />
              {isSearching && (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 6 }} />
              )}
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={15} color={colors.text.muted} />
                </TouchableOpacity>
              )}
            </View>

            {viewTab === 'all' && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {['all', 'API', 'AFI'].map(std => {
                  const active = selectedStandard === std;
                  return (
                    <TouchableOpacity
                      key={std}
                      onPress={() => setSelectedStandard(std)}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1,
                        backgroundColor: active ? colors.primary : colors.bg.secondary,
                        borderColor: active ? colors.primary : colors.border
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#fff' : colors.text.secondary }}>
                        {std === 'all' ? 'All Standards' : std}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* List Content */}
          {loading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.text.secondary, marginTop: 8, fontSize: 12 }}>Loading Ayurvedic Pharmacopoeia database...</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ gap: 12 }}>
              {monographs.length === 0 ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={{ color: colors.text.muted, fontSize: 13 }}>
                    {viewTab === 'unverified' ? 'All pharmacopoeia entries have been verified!' : 'No pharmacopoeia monographs match your search.'}
                  </Text>
                </View>
              ) : (
                monographs.map(m => (
                  <View key={m._id} style={{
                    backgroundColor: colors.bg.card, borderRadius: 8, borderWidth: 1,
                    borderColor: m.verified === false ? (colors.warning || '#f59e0b') + '60' : colors.border, padding: 14, gap: 8
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <View style={{ flex: 1, minWidth: 240 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.primary }}>
                            🌿 {m.ayurvedicName}
                          </Text>
                          <View style={{ backgroundColor: colors.primary + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: colors.primary + '40' }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary }}>
                              {m.pharmacopoeialStandard || 'API'} Monograph
                            </Text>
                          </View>
                          {m.verified === false ? (
                            <View style={{ backgroundColor: (colors.warning || '#f59e0b') + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: (colors.warning || '#f59e0b') + '50' }}>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.warning || '#d97706' }}>
                                ⚠️ Pending Review (AI-generated)
                              </Text>
                            </View>
                          ) : (
                            <View style={{ backgroundColor: colors.success + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: colors.success + '40' }}>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.success }}>
                                ✅ Verified Official
                              </Text>
                            </View>
                          )}
                          {m.isScheduleE1 && (
                            <View style={{ backgroundColor: colors.danger + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: colors.danger + '40' }}>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: colors.danger }}>
                                ⚠️ Schedule E1 Toxic Herb
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 12, fontStyle: 'italic', fontWeight: '600', color: colors.text.secondary, marginTop: 3 }}>
                          {m.botanicalName} {m.family ? `(${m.family})` : ''}
                        </Text>
                      </View>

                      {/* Actions */}
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        {m.verified === false && (
                          <TouchableOpacity
                            style={{
                              backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 6,
                              borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 6,
                              opacity: verifyingId === m._id ? 0.6 : 1
                            }}
                            disabled={verifyingId === m._id}
                            onPress={() => handleVerify(m)}
                          >
                            {verifyingId === m._id ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                            )}
                            <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#fff' }}>
                              Approve & Verify
                            </Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={{
                            backgroundColor: colors.success + '15', borderColor: colors.success, borderWidth: 1,
                            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, flexDirection: 'row',
                            alignItems: 'center', gap: 6, opacity: importingId === m._id ? 0.6 : 1
                          }}
                          disabled={importingId === m._id}
                          onPress={() => handleImportSingle(m)}
                        >
                          {importingId === m._id ? (
                            <ActivityIndicator size="small" color={colors.success} />
                          ) : (
                            <Ionicons name="add-circle-outline" size={16} color={colors.success} />
                          )}
                          <Text style={{ fontSize: 11.5, fontWeight: '800', color: colors.success }}>
                            Import to Raw Materials
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Metadata Specs & Monograph Citation Edit */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, backgroundColor: colors.bg.secondary, padding: 8, borderRadius: 6, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                        Part Used: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{m.partUsed || 'Whole'}</Text>
                      </Text>
                      {editingRefId === m._id ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 220 }}>
                          <Text style={{ fontSize: 11, color: colors.text.secondary }}>Ref:</Text>
                          <TextInput
                            style={{ flex: 1, fontSize: 11, color: colors.text.primary, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}
                            value={refText}
                            onChangeText={setRefText}
                          />
                          <TouchableOpacity onPress={() => handleVerify(m)} style={{ backgroundColor: colors.success, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>Save</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity onPress={() => { setEditingRefId(m._id); setRefText(m.monographRef || ''); }}>
                          <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                            Ref: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{m.monographRef || '(Click to edit ref)'}</Text>
                            <Ionicons name="pencil-outline" size={11} color={colors.primary} style={{ marginLeft: 4 }} />
                          </Text>
                        </TouchableOpacity>
                      )}
                      {m.dosage && (
                        <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                          Dosage: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{m.dosage}</Text>
                        </Text>
                      )}
                    </View>

                    {/* Ayurvedic Dravyaguna Attributes */}
                    {(m.rasa?.length > 0 || m.virya || m.vipaka) && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                        {m.rasa?.length > 0 && (
                          <View style={{ backgroundColor: colors.bg.secondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, color: colors.text.muted }}>Rasa: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{m.rasa.join(', ')}</Text></Text>
                          </View>
                        )}
                        {m.virya && (
                          <View style={{ backgroundColor: colors.bg.secondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, color: colors.text.muted }}>Virya: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{m.virya}</Text></Text>
                          </View>
                        )}
                        {m.vipaka && (
                          <View style={{ backgroundColor: colors.bg.secondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, color: colors.text.muted }}>Vipaka: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{m.vipaka}</Text></Text>
                          </View>
                        )}
                      </View>
                    )}

                    {m.therapeuticUses?.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.primary }}>Therapeutic Uses:</Text>
                        {m.therapeuticUses.map((use: string, uIdx: number) => (
                          <View key={uIdx} style={{ backgroundColor: colors.primary + '10', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 9.5, fontWeight: '600', color: colors.primary }}>{use}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {m.description && (
                      <Text style={{ fontSize: 11, color: colors.text.secondary, lineHeight: 15 }}>
                        {m.description}
                      </Text>
                    )}
                  </View>
                ))
              )}
              {hasMore && viewTab === 'all' && (
                <TouchableOpacity
                  style={{
                    padding: 12, borderRadius: 8, backgroundColor: colors.bg.secondary,
                    borderWidth: 1, borderColor: colors.border, alignItems: 'center', marginVertical: 8
                  }}
                  disabled={loadingMore}
                  onPress={handleLoadMore}
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
                      Load More Monographs (Page {page + 1})
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </ScrollView>
          )}

          {/* Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Close Library</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
