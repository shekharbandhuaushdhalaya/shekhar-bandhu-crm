import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, Pressable, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';
import { lookupAyurvedicHerb, AYURVEDIC_HERB_DICTIONARY, HerbDictionaryEntry } from '../../../utils/ayurvedicHerbs';
import { api } from '../../../utils/api';

interface Props {
  visible: boolean;
  editingMaterialId: string | null;
  rmName: string; setRmName: (v: string) => void;
  rmBotanicalName: string; setRmBotanicalName: (v: string) => void;
  rmPartUsed: string; setRmPartUsed: (v: string) => void;
  rmSku: string;
  rmUnit: string; setRmUnit: (v: string) => void;
  rmCategory: string; setRmCategory: (v: string) => void;
  rmPharmacopoeialStandard: string; setRmPharmacopoeialStandard: (v: string) => void;
  rmMonographRef: string; setRmMonographRef: (v: string) => void;
  rmIsScheduleE1: boolean; setRmIsScheduleE1: (v: boolean) => void;
  rmMinReorder: string; setRmMinReorder: (v: string) => void;
  rmCleaningLossPercent: string; setRmCleaningLossPercent: (v: string) => void;
  rmError: string;
  rmStockLevel?: string; setRmStockLevel?: (v: string) => void;
  rmOriginalStockLevel?: number;
  rmAdjustmentReason?: string; setRmAdjustmentReason?: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export default function RawMaterialModal({
  visible,
  editingMaterialId,
  rmName, setRmName,
  rmBotanicalName, setRmBotanicalName,
  rmPartUsed, setRmPartUsed,
  rmSku,
  rmUnit, setRmUnit,
  rmCategory, setRmCategory,
  rmPharmacopoeialStandard, setRmPharmacopoeialStandard,
  rmMonographRef, setRmMonographRef,
  rmIsScheduleE1, setRmIsScheduleE1,
  rmMinReorder, setRmMinReorder,
  rmCleaningLossPercent, setRmCleaningLossPercent,
  rmError,
  onClose,
  onSave,
  rmStockLevel = '', setRmStockLevel,
  rmOriginalStockLevel = 0,
  rmAdjustmentReason = '', setRmAdjustmentReason
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [autoFilledBadge, setAutoFilledBadge] = useState<string | null>(null);
  const [dbSuggestions, setDbSuggestions] = useState<any[]>([]);

  const PLANT_PARTS = [
    { key: 'Root (Mool)', label: '🪵 Root' },
    { key: 'Leaf (Patra)', label: '🍃 Leaf' },
    { key: 'Bark (Twak)', label: '🌳 Bark' },
    { key: 'Fruit (Phala)', label: '🫐 Fruit' },
    { key: 'Seed (Beej)', label: '🌾 Seed' },
    { key: 'Whole Plant (Panchang)', label: '🌿 Whole Plant' },
    { key: 'Resin / Gum (Niryasa)', label: '🍯 Resin / Gum' },
    { key: 'Flower (Pushpa)', label: '🌸 Flower' },
    { key: 'Bhasma / Mineral', label: '🪨 Bhasma / Mineral' },
    { key: 'Kashaya / Extract', label: '🧪 Extract' }
  ];

  const CATEGORIES = [
    { key: 'Dry Herb', label: '🌿 Dry Herb' },
    { key: 'Fresh Herb', label: '🌱 Fresh Herb' },
    { key: 'Metallic/Mineral', label: '🪨 Mineral / Bhasma' },
    { key: 'Animal Source', label: '🥛 Milk / Honey / Ghee' },
    { key: 'Plant Concentrate', label: '🧪 Plant Extract' },
    { key: 'Volatile Oil', label: '💧 Essential Oil' },
    { key: 'Excipient', label: '🌾 Excipient / Base' },
    { key: 'Packaging', label: '📦 Bottle / Label / Box' },
    { key: 'General', label: '⚙️ General Material' }
  ];

  const STANDARDS = [
    { key: 'API', label: 'API (Ayurvedic Pharmacopoeia)' },
    { key: 'AFI', label: 'AFI (Ayurvedic Formulary)' },
    { key: 'IP', label: 'IP (Indian Pharmacopoeia)' },
    { key: 'BP', label: 'BP' },
    { key: 'USP', label: 'USP' },
    { key: 'House Standard', label: 'House Specification' }
  ];

  const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'units', 'boxes', 'rolls'];

  const isPackaging = rmCategory === 'Packaging';
  const isExcipient = rmCategory === 'Excipient';
  const isHerb = !isPackaging && rmCategory !== 'General';

  // Live query to backend database for matching pharmacopoeia monographs
  useEffect(() => {
    if (!rmName || rmName.length < 2 || isPackaging) {
      setDbSuggestions([]);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchPharmacopoeia(rmName);
        if (active) {
          setDbSuggestions(results || []);
        }
      } catch (err) {
        // Silently ignore network search errors
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [rmName, isPackaging]);

  const applyHerbData = (entry: { commonNames?: string[]; ayurvedicName?: string; botanicalName: string; partUsed?: string; category?: string; monographRef?: string; isScheduleE1?: boolean }, nameToSet?: string) => {
    const finalName = nameToSet || entry.ayurvedicName || (entry.commonNames ? entry.commonNames[0] : '');
    if (finalName) setRmName(finalName.toUpperCase());
    setRmBotanicalName(entry.botanicalName);
    if (entry.partUsed) setRmPartUsed(entry.partUsed);
    if (entry.category) setRmCategory(entry.category);
    if (entry.monographRef) setRmMonographRef(entry.monographRef);
    if (entry.isScheduleE1 !== undefined) setRmIsScheduleE1(entry.isScheduleE1);
    setAutoFilledBadge(entry.botanicalName);
  };

  const applyNonHerbPreset = (preset: { name: string; category: string; unit: string; std: string }) => {
    setRmName(preset.name);
    setRmCategory(preset.category);
    setRmUnit(preset.unit);
    setRmPharmacopoeialStandard(preset.std);
  };

  const applyCustomHerbPreset = () => {
    if (!rmCategory || rmCategory === 'Packaging') setRmCategory('Dry Herb');
    if (!rmUnit) setRmUnit('kg');
    if (!rmPharmacopoeialStandard) setRmPharmacopoeialStandard('API');
    setAutoFilledBadge(rmName);
  };

  const handleNameChange = (text: string) => {
    const upper = text.toUpperCase();
    setRmName(upper);

    // Auto-populate parallel Latin botanical name if matched
    const matched = lookupAyurvedicHerb(upper);
    if (matched) {
      setRmBotanicalName(matched.botanicalName);
      if (matched.partUsed && (!rmPartUsed || rmPartUsed.trim() === '')) {
        setRmPartUsed(matched.partUsed);
      }
      if (matched.category && (!rmCategory || rmCategory === 'Herb')) {
        setRmCategory(matched.category);
      }
      if (matched.monographRef && (!rmMonographRef || rmMonographRef.trim() === '')) {
        setRmMonographRef(matched.monographRef);
      }
      if (matched.isScheduleE1 !== undefined) {
        setRmIsScheduleE1(matched.isScheduleE1);
      }
      setAutoFilledBadge(matched.botanicalName);
    } else {
      setAutoFilledBadge(null);
    }
  };

  // Live Herb Search Suggestions — Combines static dictionary + live backend pharmacopoeia search results
  const suggestions = useMemo(() => {
    if (!rmName || rmName.length < 2 || isPackaging) return [];
    const search = rmName.toUpperCase();

    // 1. Static Dictionary
    const staticMatches = AYURVEDIC_HERB_DICTIONARY.filter(h =>
      h.commonNames.some(cn => cn.includes(search))
    ).map(h => ({
      name: h.commonNames[0],
      botanicalName: h.botanicalName,
      partUsed: h.partUsed,
      category: h.category,
      monographRef: h.monographRef,
      isScheduleE1: h.isScheduleE1
    }));

    // 2. Database Pharmacopoeia Matches
    const dbMatches = dbSuggestions.map(d => ({
      name: d.ayurvedicName,
      botanicalName: d.botanicalName,
      partUsed: d.partUsed,
      category: d.pharmacopoeialStandard === 'AFI' ? 'Metallic/Mineral' : 'Dry Herb',
      monographRef: d.monographRef,
      isScheduleE1: d.isScheduleE1
    }));

    // Merge and deduplicate by botanicalName
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const item of [...staticMatches, ...dbMatches]) {
      if (!seen.has(item.botanicalName.toLowerCase())) {
        seen.add(item.botanicalName.toLowerCase());
        merged.push(item);
      }
    }
    return merged.slice(0, 6);
  }, [rmName, isPackaging, dbSuggestions]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalContainer, { maxWidth: 640 }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>
                {editingMaterialId ? 'Edit Material / Item' : 'Define New Material / Item'}
              </Text>
              <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 2 }}>
                Raw Materials Master • Supports Herbs, Packaging (Boxes/Bottles/Labels), Excipients (Sugar/Salt), Oils & Minerals
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {rmError ? (
            <View style={{ backgroundColor: colors.danger + '15', borderRadius: 6, padding: 10, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: colors.danger }}>
              <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700' }}>{rmError}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={true}>
            {/* SECTION 1: ITEM & IDENTITY SPECIFICATION */}
            <View style={{ marginBottom: 16, backgroundColor: colors.bg.secondary + '40', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary, marginBottom: 10, letterSpacing: 0.5 }}>
                {isPackaging ? '📦 1. PACKAGING SPECIFICATION & IDENTITY' : (isExcipient ? '🌾 1. EXCIPIENT & BASE MATERIAL IDENTITY' : '🌿 1. INGREDIENT & BOTANICAL IDENTITY')}
              </Text>

              <Text style={styles.inputLabel}>
                {isPackaging ? 'Packaging Item Name / Description *' : 'Material Item Name *'}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={
                  isPackaging
                    ? 'e.g. MONO CARTON BOX 100ML, PET BOTTLE AMBER 200ML, FRONT BOTTLE LABEL'
                    : isExcipient
                      ? 'e.g. PHARMA GRADE SUGAR, PURIFIED ROCK SALT, SODIUM BENZOATE'
                      : 'e.g. ASHWAGANDHA, PURIFIED GUGGULU, TULSI'
                }
                placeholderTextColor={colors.text.muted}
                value={rmName}
                onChangeText={handleNameChange}
                autoCapitalize="characters"
              />
              <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: -6, marginBottom: 6 }}>
                {isPackaging
                  ? 'Standard commercial name or dimension specification for boxes, bottles, caps, foils, or labels.'
                  : 'Commercial trade name or vernacular ingredient title.'}
              </Text>

              {/* Quick Preset Chips for Packaging / Excipients */}
              {isPackaging && !rmName && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary, marginBottom: 4 }}>
                    Quick Packaging Presets:
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { name: 'MONO CARTON BOX 100ML', category: 'Packaging', unit: 'pcs', std: 'House Standard' },
                      { name: 'OUTER CORRUGATED BOX (50 PCS)', category: 'Packaging', unit: 'pcs', std: 'House Standard' },
                      { name: '100ML PET BOTTLE (AMBER)', category: 'Packaging', unit: 'pcs', std: 'House Standard' },
                      { name: 'FRONT BOTTLE LABEL STICKER', category: 'Packaging', unit: 'pcs', std: 'House Standard' },
                      { name: 'FLIP TOP BOTTLE CAP 28MM', category: 'Packaging', unit: 'pcs', std: 'House Standard' }
                    ].map((preset, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => applyNonHerbPreset(preset)}
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.primary + '15', borderWidth: 0.5, borderColor: colors.primary + '40' }}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.primary }}>📦 {preset.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {isExcipient && !rmName && (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary, marginBottom: 4 }}>
                    Quick Excipient Presets:
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { name: 'PHARMA GRADE SUGAR (SHARKARA)', category: 'Excipient', unit: 'kg', std: 'IP' },
                      { name: 'PURIFIED ROCK SALT (SAINDHAVA)', category: 'Excipient', unit: 'kg', std: 'API' },
                      { name: 'SODIUM BENZOATE (PRESERVATIVE)', category: 'Excipient', unit: 'kg', std: 'IP' },
                      { name: 'LIQUID GLUCOSE', category: 'Excipient', unit: 'kg', std: 'IP' }
                    ].map((preset, idx) => (
                      <TouchableOpacity
                        key={idx}
                        onPress={() => applyNonHerbPreset(preset)}
                        style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.primary + '15', borderWidth: 0.5, borderColor: colors.primary + '40' }}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.primary }}>🌾 {preset.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Live & Static Herb Suggestions chips */}
              {suggestions.length > 0 ? (
                <View style={{ marginBottom: 10 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary, marginBottom: 4 }}>
                    Suggested Ayurvedic Herbs (Auto-matched from Library):
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {suggestions.map((herb, idx) => {
                      const displayName = herb.name;
                      return (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => applyHerbData(herb, displayName)}
                          style={{
                            paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                            backgroundColor: colors.primary + '15', borderWidth: 0.5, borderColor: colors.primary + '40'
                          }}
                        >
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.primary }}>
                            🌿 {displayName} <Text style={{ fontStyle: 'italic', fontWeight: '400', color: colors.text.secondary }}>({herb.botanicalName})</Text>
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : (rmName.length >= 2 && !isPackaging ? (
                <View style={{ marginBottom: 10 }}>
                  <TouchableOpacity
                    onPress={applyCustomHerbPreset}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
                      backgroundColor: colors.success + '15', borderWidth: 1, borderColor: colors.success + '50',
                      flexDirection: 'row', alignItems: 'center', gap: 6
                    }}
                  >
                    <Ionicons name="sparkles-outline" size={14} color={colors.success} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.success }}>
                      New Ingredient: Quick-Setup "{rmName.toUpperCase()}" as Ayurvedic Herb
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null)}

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={styles.inputLabel}>
                  {isPackaging ? 'Material Grade / Spec Code (Optional)' : 'Botanical / Scientific Binomial (Latin Name)'}
                </Text>
                {autoFilledBadge && (
                  <View style={{ backgroundColor: colors.success + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: colors.success + '40' }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: colors.success }}>
                      ✨ Auto-matched Latin Binomial
                    </Text>
                  </View>
                )}
              </View>
              <TextInput
                style={[styles.input, autoFilledBadge ? { borderColor: colors.success, backgroundColor: colors.success + '05' } : null]}
                placeholder={isPackaging ? 'e.g. 300 GSM Duplex Board / Amber PET / Food Grade HDPE' : 'e.g. Withania somnifera (L.) Dunal'}
                placeholderTextColor={colors.text.muted}
                value={rmBotanicalName}
                onChangeText={(v) => {
                  setRmBotanicalName(v);
                  setAutoFilledBadge(null);
                }}
              />
              <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: -6, marginBottom: 10 }}>
                {isPackaging ? 'Physical material grade or thickness specification for boxes, bottles, caps, or labels.' : 'Latin botanical binomial for plant herbs / chemical formula for Rasa Shastra minerals.'}
              </Text>

              <Text style={styles.inputLabel}>
                {isPackaging ? 'Packaging Sub-type / Form Factor' : 'Plant Part Used / Plant Organ'}
              </Text>
              {isHerb && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {PLANT_PARTS.map(part => {
                    const selected = rmPartUsed === part.key;
                    return (
                      <TouchableOpacity
                        key={part.key}
                        onPress={() => setRmPartUsed(part.key)}
                        style={{
                          paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, borderWidth: 1,
                          backgroundColor: selected ? colors.primary : colors.bg.secondary,
                          borderColor: selected ? colors.primary : colors.border
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: selected ? '#fff' : colors.text.secondary }}>
                          {part.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <TextInput
                style={styles.input}
                placeholder={isPackaging ? 'e.g. Outer Box, Mono Carton, Bottle Cap, Sticker Label...' : 'Or enter plant part (e.g. Bark & Leaves)...'}
                placeholderTextColor={colors.text.muted}
                value={rmPartUsed}
                onChangeText={setRmPartUsed}
              />
            </View>

            {/* SECTION 2: CATEGORY & AYUSH COMPLIANCE */}
            <View style={{ marginBottom: 16, backgroundColor: colors.bg.secondary + '40', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary, marginBottom: 10, letterSpacing: 0.5 }}>
                🏷️ 2. AYUSH CLASSIFICATION & STANDARDS
              </Text>

              <Text style={styles.inputLabel}>Material Category / AYUSH Type *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {CATEGORIES.map(c => {
                  const selected = rmCategory === c.key;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      onPress={() => setRmCategory(c.key)}
                      style={{
                        paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, borderWidth: 1,
                        backgroundColor: selected ? colors.primary : colors.bg.secondary,
                        borderColor: selected ? colors.primary : colors.border
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: selected ? '#fff' : colors.text.secondary }}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={[styles.input, { marginBottom: 10 }]}
                placeholder="Or custom classification..."
                placeholderTextColor={colors.text.muted}
                value={rmCategory}
                onChangeText={setRmCategory}
              />

              <Text style={styles.inputLabel}>Pharmacopoeial Standard</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {STANDARDS.map(s => {
                  const selected = rmPharmacopoeialStandard === s.key;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      onPress={() => setRmPharmacopoeialStandard(s.key)}
                      style={{
                        paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, borderWidth: 1,
                        backgroundColor: selected ? colors.primary + '20' : colors.bg.secondary,
                        borderColor: selected ? colors.primary : colors.border
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: selected ? colors.primary : colors.text.secondary }}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.inputLabel}>Monograph Reference / Page</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. API Part I, Vol II, Page 45"
                placeholderTextColor={colors.text.muted}
                value={rmMonographRef}
                onChangeText={setRmMonographRef}
              />

              {/* Schedule E1 Toxic Drug Flag */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: rmIsScheduleE1 ? colors.danger + '15' : colors.bg.secondary,
                padding: 10, borderRadius: 8, borderWidth: 1,
                borderColor: rmIsScheduleE1 ? colors.danger : colors.border, marginTop: 4
              }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: rmIsScheduleE1 ? colors.danger : colors.text.primary }}>
                    ⚠️ Schedule E1 Controlled Toxic Herb / Poison Flag
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>
                    Mark true if ingredient is listed under Schedule E1 of Drugs & Cosmetics Act (e.g. Vatsanabha, Bhang, Jayapala, Gunja).
                  </Text>
                </View>
                <Switch
                  value={rmIsScheduleE1}
                  onValueChange={setRmIsScheduleE1}
                  trackColor={{ false: colors.border, true: colors.danger }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            {/* SECTION 3: INVENTORY & YIELD SETTINGS */}
            <View style={{ marginBottom: 16, backgroundColor: colors.bg.secondary + '40', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary, marginBottom: 10, letterSpacing: 0.5 }}>
                ⚖️ 3. INVENTORY & YIELD SETTINGS
              </Text>

              <Text style={styles.inputLabel}>Unit of Measurement *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {UNITS.map(u => {
                  const selected = rmUnit === u;
                  return (
                    <TouchableOpacity
                      key={u}
                      onPress={() => setRmUnit(u)}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1,
                        backgroundColor: selected ? colors.primary : colors.bg.secondary,
                        borderColor: selected ? colors.primary : colors.border
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: selected ? '#fff' : colors.text.secondary }}>
                        {u}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Custom unit (e.g. drum, quintal)..."
                placeholderTextColor={colors.text.muted}
                value={rmUnit}
                onChangeText={setRmUnit}
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Min Reorder Stock Level ({rmUnit})</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 10"
                    placeholderTextColor={colors.text.muted}
                    value={rmMinReorder}
                    onChangeText={setRmMinReorder}
                    keyboardType="numeric"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Process Cleaning Loss %</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 5"
                    placeholderTextColor={colors.text.muted}
                    value={rmCleaningLossPercent}
                    onChangeText={setRmCleaningLossPercent}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: -4 }}>
                Cleaning loss % accounts for dirt, sifting, sorting, and drying moisture loss during raw material processing.
              </Text>
            </View>

            {/* SECTION 4: SKU & PHYSICAL STOCK (IF EDITING) */}
            {editingMaterialId !== null && (
              <View style={{ marginTop: 4, padding: 12, backgroundColor: colors.bg.secondary, borderRadius: 8, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, marginBottom: 6 }}>
                  📦 MATERIAL CODE & PHYSICAL STOCK LEVEL
                </Text>

                <Text style={styles.inputLabel}>SKU / System Code</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bg.secondary, color: colors.text.muted }]}
                  value={rmSku}
                  editable={false}
                />

                <Text style={styles.inputLabel}>Current Physical Stock Quantity ({rmUnit})</Text>
                <TextInput
                  style={[styles.input, { fontWeight: '700' }]}
                  placeholder="Enter current physical stock qty"
                  placeholderTextColor={colors.text.muted}
                  value={rmStockLevel}
                  onChangeText={setRmStockLevel}
                  keyboardType="numeric"
                />

                {setRmStockLevel && parseFloat(rmStockLevel) !== rmOriginalStockLevel && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={[styles.inputLabel, { color: colors.warning }]}>Reason for Stock Adjustment *</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Sorting loss mismatch, moisture absorption, spillage"
                      placeholderTextColor={colors.text.muted}
                      value={rmAdjustmentReason}
                      onChangeText={setRmAdjustmentReason}
                    />
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitBtn} onPress={onSave}>
              <Text style={styles.submitBtnText}>
                {editingMaterialId ? 'Save Material Changes' : 'Define Material'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
