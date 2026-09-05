import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';
import { api } from '../../../utils/api';

interface Props {
  visible: boolean;
  onClose: () => void;
  onRefreshMaterials: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function PharmacopoeiaModal({ visible, onClose, onRefreshMaterials, showToast }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const [monographs, setMonographs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedStandard, setSelectedStandard] = useState('all');
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importingAll, setImportingAll] = useState(false);

  useEffect(() => {
    if (visible) {
      loadMonographs();
    }
  }, [visible, search, selectedStandard]);

  const loadMonographs = async () => {
    try {
      setLoading(true);
      const data = await api.getPharmacopoeia(search);
      setMonographs(data || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load Ayurvedic pharmacopoeia monographs', 'error');
    } finally {
      setLoading(false);
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
                Official Ayurvedic Ingredients Master Monograph Database & One-Click Raw Material Importer
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {/* Quick Bulk Seed Action Bar */}
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

          {/* Search & Filter Toolbar */}
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <View style={{ flex: 2, minWidth: 200, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Ionicons name="search-outline" size={16} color={colors.text.muted} style={{ marginRight: 6 }} />
              <TextInput
                style={{ flex: 1, fontSize: 13, color: colors.text.primary, padding: 0 }}
                placeholder="Search Ayurvedic name, botanical binomial, or therapeutic use..."
                placeholderTextColor={colors.text.muted}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={15} color={colors.text.muted} />
                </TouchableOpacity>
              )}
            </View>

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
                  <Text style={{ color: colors.text.muted, fontSize: 13 }}>No pharmacopoeia monographs match your search.</Text>
                </View>
              ) : (
                monographs.map(m => (
                  <View key={m._id} style={{
                    backgroundColor: colors.bg.card, borderRadius: 8, borderWidth: 1,
                    borderColor: colors.border, padding: 14, gap: 8
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

                      {/* Import Action */}
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

                    {/* Metadata Specs */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, backgroundColor: colors.bg.secondary, padding: 8, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                        Part Used: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{m.partUsed || 'Whole'}</Text>
                      </Text>
                      {m.monographRef && (
                        <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                          Ref: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{m.monographRef}</Text>
                        </Text>
                      )}
                      {m.dosage && (
                        <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                          Dosage: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{m.dosage}</Text>
                        </Text>
                      )}
                    </View>

                    {/* Ayurvedic Dravyaguna Attributes (Rasa, Virya, Vipaka, Guna) */}
                    {(m.rasa?.length > 0 || m.virya || m.vipaka) && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
                        {m.rasa?.length > 0 && (
                          <View style={{ backgroundColor: colors.bg.secondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, color: colors.text.muted }}>Rasa (Taste): <Text style={{ fontWeight: '700', color: colors.text.primary }}>{m.rasa.join(', ')}</Text></Text>
                          </View>
                        )}
                        {m.virya && (
                          <View style={{ backgroundColor: colors.bg.secondary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, color: colors.text.muted }}>Virya (Potency): <Text style={{ fontWeight: '700', color: colors.text.primary }}>{m.virya}</Text></Text>
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
