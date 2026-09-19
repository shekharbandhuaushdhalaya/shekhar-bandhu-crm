import { PressableOpacity as TouchableOpacity } from './../../../components/PressableOpacity';
import { AppTextInput as TextInput } from './../../../components/AppTextInput';
import { AppText as Text } from './../../../components/AppText';
import { Typography } from './../../../constants/theme';
import React, { useState, useMemo, useEffect } from 'react';
import { View, Modal, ScrollView, Pressable, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { createStyles } from '../manufacturingStyles';
import { lookupAyurvedicHerb, AYURVEDIC_HERB_DICTIONARY, HerbDictionaryEntry } from '../../../utils/ayurvedicHerbs';
import { api } from '../../../utils/api';

interface Props {
  visible: boolean;
  editingMaterialId: string | null;
  rmName: string; setRmName: (v: string) => void;
  rmMaterialType: string; setRmMaterialType: (v: any) => void;
  rmPackagingType: string; setRmPackagingType: (v: string) => void;
  rmMaterialGrade: string; setRmMaterialGrade: (v: string) => void;
  rmSpecification: string; setRmSpecification: (v: string) => void;
  rmBotanicalName: string; setRmBotanicalName: (v: string) => void;
  rmAcceptedScientificName: string; setRmAcceptedScientificName: (v: string) => void;
  rmFamily: string; setRmFamily: (v: string) => void;
  rmGenus: string; setRmGenus: (v: string) => void;
  rmSpecies: string; setRmSpecies: (v: string) => void;
  rmBotanicalAuthority: string; setRmBotanicalAuthority: (v: string) => void;
  rmTaxonomicRank: string; setRmTaxonomicRank: (v: string) => void;
  rmTaxonomicStatus: string; setRmTaxonomicStatus: (v: string) => void;
  rmBotanicalSynonyms: string[]; setRmBotanicalSynonyms: (v: string[]) => void;
  rmCommonNames: string[]; setRmCommonNames: (v: string[]) => void;
  rmTaxonomySource: string; setRmTaxonomySource: (v: string) => void;
  rmTherapeuticUses: string[]; setRmTherapeuticUses: (v: string[]) => void;
  rmRasa: string[]; setRmRasa: (v: string[]) => void;
  rmVirya: string; setRmVirya: (v: string) => void;
  rmVipaka: string; setRmVipaka: (v: string) => void;
  rmGuna: string[]; setRmGuna: (v: string[]) => void;
  rmDosage: string; setRmDosage: (v: string) => void;
  rmBotanicalDescription: string; setRmBotanicalDescription: (v: string) => void;
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
  rmMaterialType, setRmMaterialType,
  rmPackagingType, setRmPackagingType,
  rmMaterialGrade, setRmMaterialGrade,
  rmSpecification, setRmSpecification,
  rmBotanicalName, setRmBotanicalName,
  rmAcceptedScientificName, setRmAcceptedScientificName, rmFamily, setRmFamily, rmGenus, setRmGenus, rmSpecies, setRmSpecies, rmBotanicalAuthority, setRmBotanicalAuthority, rmTaxonomicRank, setRmTaxonomicRank, rmTaxonomicStatus, setRmTaxonomicStatus, rmBotanicalSynonyms, setRmBotanicalSynonyms, rmCommonNames, setRmCommonNames, rmTaxonomySource, setRmTaxonomySource, rmTherapeuticUses, setRmTherapeuticUses, rmRasa, setRmRasa, rmVirya, setRmVirya, rmVipaka, setRmVipaka, rmGuna, setRmGuna, rmDosage, setRmDosage, rmBotanicalDescription, setRmBotanicalDescription,
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
  const [botanicalLookupLoading, setBotanicalLookupLoading] = useState(false);
  const [botanicalLookupMessage, setBotanicalLookupMessage] = useState('');

  const PLANT_PARTS = [
    { key: 'Root (Mool)', label: ' Root' },
    { key: 'Leaf (Patra)', label: ' Leaf' },
    { key: 'Bark (Twak)', label: ' Bark' },
    { key: 'Fruit (Phala)', label: ' Fruit' },
    { key: 'Seed (Beej)', label: ' Seed' },
    { key: 'Whole Plant (Panchang)', label: ' Whole Plant' },
    { key: 'Resin / Gum (Niryasa)', label: ' Resin / Gum' },
    { key: 'Flower (Pushpa)', label: ' Flower' },
    { key: 'Bhasma / Mineral', label: ' Bhasma / Mineral' },
    { key: 'Kashaya / Extract', label: ' Extract' }
  ];

  const CATEGORIES = [
    { key: 'Dry Herb', label: ' Dry Herb' },
    { key: 'Fresh Herb', label: ' Fresh Herb' },
    { key: 'Metallic/Mineral', label: ' Mineral / Bhasma' },
    { key: 'Animal Source', label: ' Milk / Honey / Ghee' },
    { key: 'Plant Concentrate', label: ' Plant Extract' },
    { key: 'Volatile Oil', label: ' Essential Oil' },
    { key: 'Excipient', label: ' Excipient / Base' },
    { key: 'Packaging', label: ' Bottle / Label / Box' },
    { key: 'General', label: ' General Material' }
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

  const isPackaging = rmMaterialType === 'packaging' || rmCategory === 'Packaging' || rmCategory === 'Packaging Material';
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

  const applyHerbData = (entry: { commonNames?: string[]; synonyms?: string[]; ayurvedicName?: string; botanicalName: string; partUsed?: string; category?: string; monographRef?: string; isScheduleE1?: boolean }, nameToSet?: string) => {
    const finalName = nameToSet || entry.ayurvedicName || (entry.commonNames ? entry.commonNames[0] : '');
    if (finalName) setRmName(finalName.toUpperCase());
    setRmBotanicalName(entry.botanicalName);
    setRmAcceptedScientificName((entry as any).acceptedScientificName || entry.botanicalName || '');
    setRmFamily((entry as any).family || ''); setRmGenus((entry as any).genus || ''); setRmSpecies((entry as any).species || ''); setRmBotanicalAuthority((entry as any).botanicalAuthority || ''); setRmTaxonomicRank((entry as any).taxonomicRank || ''); setRmTaxonomicStatus((entry as any).taxonomicStatus || ''); setRmBotanicalSynonyms((entry as any).botanicalSynonyms || entry.synonyms || []); setRmCommonNames((entry as any).commonNames || entry.commonNames || []); setRmTaxonomySource((entry as any).taxonomySource || ''); setRmTherapeuticUses((entry as any).therapeuticUses || []); setRmRasa((entry as any).rasa || []); setRmVirya((entry as any).virya || ''); setRmVipaka((entry as any).vipaka || ''); setRmGuna((entry as any).guna || []); setRmDosage((entry as any).dosage || ''); setRmBotanicalDescription((entry as any).description || '');
    if (entry.partUsed) setRmPartUsed(entry.partUsed);
    if (entry.category) setRmCategory(entry.category);
    if (entry.monographRef) setRmMonographRef(entry.monographRef);
    if (entry.isScheduleE1 !== undefined) setRmIsScheduleE1(entry.isScheduleE1);
    setAutoFilledBadge(entry.botanicalName);
  };

  const applyNonHerbPreset = (preset: { name: string; category: string; unit: string; std: string }) => {
    setRmName(preset.name);
    setRmCategory(preset.category);
    if (preset.category === 'Packaging') setRmMaterialType('packaging');
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

  const lookupExternalBotanicalProfile = async () => {
    if (!rmName.trim() || isPackaging) return;
    setBotanicalLookupLoading(true); setBotanicalLookupMessage('');
    try {
      const info = await api.lookupHerbDetails(rmName.trim());
      if (info && (info.scientificName || info.botanicalName)) {
        applyHerbData(info, info.matchedName || rmName);
        setBotanicalLookupMessage(`Verified via ${info.taxonomySource || 'botanical database'}`);
      } else {
        setBotanicalLookupMessage('No reliable botanical match found. You can enter the scientific name manually.');
      }
    } catch (e: any) {
      setBotanicalLookupMessage(e?.message || 'Botanical lookup failed');
    } finally { setBotanicalLookupLoading(false); }
  };

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
              <Text style={{ ...Typography.caption, color: colors.text.muted, marginTop: 2 }}>
                Raw Materials Master • Supports Herbs, Packaging (Boxes/Bottles/Labels), Excipients (Sugar/Salt), Oils & Minerals
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {rmError ? (
            <View style={{ backgroundColor: colors.danger + '15', borderRadius: 6, padding: 10, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: colors.danger }}>
              <Text style={{ ...Typography.bodySm, color: colors.danger, fontWeight: '700' }}>{rmError}</Text>
            </View>
          ) : null}

          <ScrollView style={styles.modalForm} contentContainerStyle={{ paddingBottom: 18 }} showsVerticalScrollIndicator={false}>
            {/* 1. CORE DETAILS */}
            <View style={{ marginBottom: 14, backgroundColor: 'transparent', paddingVertical: 10, borderRadius: Radius.md, borderWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ width: 24, height: 24, borderRadius: Radius.sm, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: 7 }}>
                  <Ionicons name="cube-outline" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.text.primary }}>Basic material details</Text>
                  <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginTop: 2 }}>Start with the few fields needed to identify this item.</Text>
                </View>
              </View>

              <Text style={styles.inputLabel}>Material Type *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {[
                  ['raw_material', ' Raw / Ingredient'], ['packaging', ' Packaging'], ['excipient', ' Excipient'],
                  ['consumable', ' Consumable'], ['semi_finished', ' Semi-finished'], ['other', 'Other']
                ].map(([key, label]) => (
                  <TouchableOpacity key={key} onPress={() => { setRmMaterialType(key); if (key === 'packaging') setRmCategory('Packaging'); else if (rmCategory === 'Packaging' || rmCategory === 'Packaging Material') setRmCategory(key === 'excipient' ? 'Excipient' : 'General'); }}
                    style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: rmMaterialType === key ? colors.primary : colors.border, backgroundColor: rmMaterialType === key ? colors.primary + '14' : colors.bg.secondary }}>
                    <Text style={{ ...Typography.eyebrow, fontWeight: '700', color: rmMaterialType === key ? colors.primary : colors.text.secondary }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>{isPackaging ? 'Packaging Item Name / Description *' : 'Material Item Name *'}</Text>
              <TextInput
                style={styles.input}
                placeholder={isPackaging ? 'e.g. MONO CARTON BOX 100ML' : isExcipient ? 'e.g. PHARMA GRADE SUGAR' : 'e.g. ASHWAGANDHA, TULSI'}
                placeholderTextColor={colors.text.muted}
                value={rmName}
                onChangeText={handleNameChange}
                autoCapitalize="characters"
              />
              <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginTop: -6, marginBottom: 10 }}>
                {isPackaging ? 'Use the commercial name or a clear size / specification.' : 'Use the commonly used ingredient or material name.'}
              </Text>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Category *</Text>
                  <TextInput style={styles.input} placeholder="e.g. Dry Herb" placeholderTextColor={colors.text.muted} value={rmCategory} onChangeText={setRmCategory} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Unit *</Text>
                  <TextInput style={styles.input} placeholder="kg / pcs / L" placeholderTextColor={colors.text.muted} value={rmUnit} onChangeText={setRmUnit} />
                </View>
              </View>
            </View>

            {/* Quick setup / suggestions */}
            {(isPackaging && !rmName) && (
              <View style={{ marginBottom: 14, padding: 12, borderRadius: 12, backgroundColor: colors.primary + '08', borderWidth: 0 }}>
                <Text style={{ ...Typography.caption, fontWeight: '800', color: colors.primary, marginBottom: 7 }}>Quick packaging setup</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { name: 'MONO CARTON BOX 100ML', category: 'Packaging', unit: 'pcs', std: 'House Standard' },
                    { name: 'OUTER CORRUGATED BOX (50 PCS)', category: 'Packaging', unit: 'pcs', std: 'House Standard' },
                    { name: '100ML PET BOTTLE (AMBER)', category: 'Packaging', unit: 'pcs', std: 'House Standard' },
                    { name: 'FRONT BOTTLE LABEL STICKER', category: 'Packaging', unit: 'pcs', std: 'House Standard' },
                    { name: 'FLIP TOP BOTTLE CAP 28MM', category: 'Packaging', unit: 'pcs', std: 'House Standard' }
                  ].map((preset, idx) => <TouchableOpacity key={idx} onPress={() => applyNonHerbPreset(preset)} style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.primary + '30' }}><Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.primary }}> {preset.name}</Text></TouchableOpacity>)}
                </View>
              </View>
            )}

            {(isExcipient && !rmName) && (
              <View style={{ marginBottom: 14, padding: 12, borderRadius: 12, backgroundColor: colors.primary + '08', borderWidth: 0 }}>
                <Text style={{ ...Typography.caption, fontWeight: '800', color: colors.primary, marginBottom: 7 }}>Quick excipient setup</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { name: 'PHARMA GRADE SUGAR (SHARKARA)', category: 'Excipient', unit: 'kg', std: 'IP' },
                    { name: 'PURIFIED ROCK SALT (SAINDHAVA)', category: 'Excipient', unit: 'kg', std: 'API' },
                    { name: 'SODIUM BENZOATE (PRESERVATIVE)', category: 'Excipient', unit: 'kg', std: 'IP' },
                    { name: 'LIQUID GLUCOSE', category: 'Excipient', unit: 'kg', std: 'IP' }
                  ].map((preset, idx) => <TouchableOpacity key={idx} onPress={() => applyNonHerbPreset(preset)} style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.primary + '30' }}><Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.primary }}> {preset.name}</Text></TouchableOpacity>)}
                </View>
              </View>
            )}

            {suggestions.length > 0 ? (
              <View style={{ marginBottom: 14, padding: 12, borderRadius: 12, backgroundColor: colors.success + '08', borderWidth: 0 }}>
                <Text style={{ ...Typography.caption, fontWeight: '800', color: colors.success, marginBottom: 7 }}>Suggested Ayurvedic matches</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {suggestions.map((herb, idx) => <TouchableOpacity key={idx} onPress={() => applyHerbData(herb, herb.name)} style={{ paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.success + '30' }}><Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.success }}> {herb.name} <Text style={{ fontStyle: 'italic', fontWeight: '400', color: colors.text.secondary }}>({herb.botanicalName})</Text></Text></TouchableOpacity>)}
                </View>
              </View>
            ) : (rmName.length >= 2 && !isPackaging ? <TouchableOpacity onPress={applyCustomHerbPreset} style={{ marginBottom: 14, padding: 10, borderRadius: 9, backgroundColor: colors.success + '10', borderWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 }}><Ionicons name="sparkles-outline" size={15} color={colors.success} /><Text style={{ ...Typography.caption, fontWeight: '700', color: colors.success }}>Quick-setup “{rmName.toUpperCase()}” as an Ayurvedic herb</Text></TouchableOpacity> : null)}

            {/* 2. MATERIAL SPECIFICATION */}
            <View style={{ marginBottom: 14, backgroundColor: 'transparent', paddingVertical: 10, borderRadius: Radius.md, borderWidth: 0 }}>
              <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.text.primary, marginBottom: 2 }}>{isPackaging ? 'Packaging specification' : 'Material specification'}</Text>
              <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginBottom: 12 }}>{isPackaging ? 'Capture physical packaging details.' : 'Add the physical and botanical details used for purchasing and quality control.'}</Text>

              {isPackaging && <>
                <Text style={styles.inputLabel}>Packaging Sub-type</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                  {['bottle','cap','label','carton','corrugated_box','pouch','sachet','foil','shrink_wrap','insert','tape','other'].map(type => <TouchableOpacity key={type} onPress={() => setRmPackagingType(type)} style={{ paddingHorizontal: 8, paddingVertical: 6, borderRadius: 7, borderWidth: 1, borderColor: rmPackagingType === type ? colors.primary : colors.border, backgroundColor: rmPackagingType === type ? colors.primary + '12' : colors.bg.secondary }}><Text style={{ ...Typography.eyebrow, fontWeight: '700', color: rmPackagingType === type ? colors.primary : colors.text.secondary }}>{type.replace('_',' ')}</Text></TouchableOpacity>)}
                </View>
                <Text style={styles.inputLabel}>Grade / Specification</Text>
                <TextInput style={styles.input} placeholder="e.g. Amber PET, 300 GSM Duplex Board, Food Grade HDPE" placeholderTextColor={colors.text.muted} value={rmMaterialGrade} onChangeText={setRmMaterialGrade} />
                <TextInput style={[styles.input, { marginTop: 7 }]} placeholder="Dimensions / print / pack details (optional)" placeholderTextColor={colors.text.muted} value={rmSpecification} onChangeText={setRmSpecification} />
              </>}

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.inputLabel}>{isPackaging ? 'Material grade / spec code' : 'Botanical / Scientific Name'}</Text>
                {autoFilledBadge && <View style={{ backgroundColor: colors.success + '12', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}><Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.success }}>Auto-matched</Text></View>}
              </View>
              <TextInput style={[styles.input, autoFilledBadge ? { borderColor: colors.success, backgroundColor: colors.success + '05' } : null]} placeholder={isPackaging ? 'e.g. 300 GSM Duplex Board / Amber PET' : 'e.g. Withania somnifera (L.) Dunal'} placeholderTextColor={colors.text.muted} value={rmBotanicalName} onChangeText={(v) => { setRmBotanicalName(v); setAutoFilledBadge(null); }} />
              <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginTop: -6, marginBottom: 10 }}>{isPackaging ? 'Physical material grade or thickness specification.' : 'Latin botanical binomial or mineral / chemical identity.'}</Text>

              <Text style={styles.inputLabel}>{isPackaging ? 'Form Factor / Part' : 'Plant Part Used'}</Text>
              {isHerb && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>{PLANT_PARTS.map(part => { const selected = rmPartUsed === part.key; return <TouchableOpacity key={part.key} onPress={() => setRmPartUsed(part.key)} style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, borderWidth: 1, backgroundColor: selected ? colors.primary : colors.bg.secondary, borderColor: selected ? colors.primary : colors.border }}><Text style={{ ...Typography.eyebrow, fontWeight: '700', color: selected ? '#fff' : colors.text.secondary }}>{part.label}</Text></TouchableOpacity>; })}</View>}
              <TextInput style={styles.input} placeholder={isPackaging ? 'e.g. Outer Box, Bottle Cap, Sticker Label...' : 'Or enter plant part (e.g. Bark & Leaves)...'} placeholderTextColor={colors.text.muted} value={rmPartUsed} onChangeText={setRmPartUsed} />
            </View>

            {/* 3. QUALITY & AYUSH */}
            <View style={{ marginBottom: 14, backgroundColor: 'transparent', paddingVertical: 10, borderRadius: Radius.md, borderWidth: 0 }}>
              <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.text.primary, marginBottom: 2 }}>Quality & AYUSH compliance</Text>
              <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginBottom: 12 }}>Standards and safety information used during procurement and quality review.</Text>
              <Text style={styles.inputLabel}>Material Category / AYUSH Type</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>{CATEGORIES.map(c => { const selected = rmCategory === c.key; return <TouchableOpacity key={c.key} onPress={() => setRmCategory(c.key)} style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7, borderWidth: 1, backgroundColor: selected ? colors.primary : colors.bg.secondary, borderColor: selected ? colors.primary : colors.border }}><Text style={{ ...Typography.eyebrow, fontWeight: '700', color: selected ? '#fff' : colors.text.secondary }}>{c.label}</Text></TouchableOpacity>; })}</View>
              <Text style={styles.inputLabel}>Pharmacopoeial Standard</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>{STANDARDS.map(s => { const selected = rmPharmacopoeialStandard === s.key; return <TouchableOpacity key={s.key} onPress={() => setRmPharmacopoeialStandard(s.key)} style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7, borderWidth: 1, backgroundColor: selected ? colors.primary + '14' : colors.bg.secondary, borderColor: selected ? colors.primary : colors.border }}><Text style={{ ...Typography.eyebrow, fontWeight: '700', color: selected ? colors.primary : colors.text.secondary }}>{s.label}</Text></TouchableOpacity>; })}</View>
              <Text style={styles.inputLabel}>Monograph Reference / Page</Text>
              <TextInput style={styles.input} placeholder="e.g. API Part I, Vol II, Page 45" placeholderTextColor={colors.text.muted} value={rmMonographRef} onChangeText={setRmMonographRef} />
              {!isPackaging && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, padding: 11, borderRadius: 9, backgroundColor: rmIsScheduleE1 ? colors.danger + '12' : colors.bg.secondary, borderWidth: 1, borderColor: rmIsScheduleE1 ? colors.danger : colors.border }}><View style={{ flex: 1, paddingRight: 10 }}><Text style={{ ...Typography.caption, fontWeight: '700', color: rmIsScheduleE1 ? colors.danger : colors.text.primary }}>Schedule E1 controlled / toxic flag</Text><Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginTop: 2 }}>Use only when the ingredient is listed under Schedule E1.</Text></View><Switch value={rmIsScheduleE1} onValueChange={setRmIsScheduleE1} trackColor={{ false: colors.border, true: colors.danger }} thumbColor="#fff" /></View>}
            </View>

            {/* 4. INVENTORY */}
            <View style={{ marginBottom: 14, backgroundColor: 'transparent', paddingVertical: 10, borderRadius: Radius.md, borderWidth: 0 }}>
              <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.text.primary, marginBottom: 2 }}>Inventory settings</Text>
              <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginBottom: 12 }}>Define the unit and stock controls used by inventory.</Text>
              <Text style={styles.inputLabel}>Unit of Measurement *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>{UNITS.map(u => { const selected = rmUnit === u; return <TouchableOpacity key={u} onPress={() => setRmUnit(u)} style={{ paddingHorizontal: 11, paddingVertical: 6, borderRadius: 7, borderWidth: 1, backgroundColor: selected ? colors.primary : colors.bg.secondary, borderColor: selected ? colors.primary : colors.border }}><Text style={{ ...Typography.eyebrow, fontWeight: '700', color: selected ? '#fff' : colors.text.secondary }}>{u}</Text></TouchableOpacity>; })}</View>
              <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Text style={styles.inputLabel}>Min reorder level ({rmUnit})</Text><TextInput style={styles.input} placeholder="e.g. 10" placeholderTextColor={colors.text.muted} value={rmMinReorder} onChangeText={setRmMinReorder} keyboardType="numeric" /></View><View style={{ flex: 1 }}><Text style={styles.inputLabel}>Cleaning loss %</Text><TextInput style={styles.input} placeholder="e.g. 5" placeholderTextColor={colors.text.muted} value={rmCleaningLossPercent} onChangeText={setRmCleaningLossPercent} keyboardType="numeric" /></View></View>
              <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginTop: -4 }}>Cleaning loss covers dirt, sorting, sifting, drying, and moisture loss during processing.</Text>
            </View>

            {/* Advanced botanical information is secondary; keep it available without dominating the form. */}
            {!isPackaging && (rmFamily || rmGenus || rmSpecies || rmBotanicalSynonyms.length || rmTherapeuticUses.length || rmAcceptedScientificName || rmBotanicalDescription) && (
              <View style={{ marginBottom: 14, backgroundColor: 'transparent', paddingVertical: 10, borderRadius: Radius.md, borderWidth: 0 }}>
                <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.text.primary, marginBottom: 10 }}>Botanical / pharmacognostic details</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{[['Accepted name', rmAcceptedScientificName], ['Family', rmFamily], ['Genus', rmGenus], ['Species', rmSpecies], ['Authority', rmBotanicalAuthority], ['Rank', rmTaxonomicRank], ['Taxonomic status', rmTaxonomicStatus]].map(([label,value]) => value ? <View key={label as string} style={{ width: '47%', marginBottom: 2 }}><Text style={{ ...Typography.eyebrow, color: colors.text.muted }}>{label}</Text><Text style={{ ...Typography.eyebrow, fontWeight: '700', color: colors.text.primary, fontStyle: label === 'Accepted name' ? 'italic' : 'normal' }}>{value}</Text></View> : null)}</View>
                {rmBotanicalSynonyms.length ? <Text style={{ ...Typography.eyebrow, color: colors.text.secondary, marginTop: 6 }}><Text style={{ fontWeight: '800' }}>Synonyms: </Text>{rmBotanicalSynonyms.join(', ')}</Text> : null}
                {rmCommonNames.length ? <Text style={{ ...Typography.eyebrow, color: colors.text.secondary, marginTop: 4 }}><Text style={{ fontWeight: '800' }}>Common names: </Text>{rmCommonNames.join(', ')}</Text> : null}
                {rmTherapeuticUses.length ? <Text style={{ ...Typography.eyebrow, color: colors.text.secondary, marginTop: 4 }}><Text style={{ fontWeight: '800' }}>Traditional uses: </Text>{rmTherapeuticUses.join(', ')}</Text> : null}
                {(rmRasa.length || rmVirya || rmVipaka || rmGuna.length || rmDosage) ? <Text style={{ ...Typography.eyebrow, color: colors.text.secondary, marginTop: 4 }}><Text style={{ fontWeight: '800' }}>Ayurvedic profile: </Text>{[rmRasa.length ? `Rasa: ${rmRasa.join(', ')}` : '', rmVirya ? `Virya: ${rmVirya}` : '', rmVipaka ? `Vipaka: ${rmVipaka}` : '', rmGuna.length ? `Guna: ${rmGuna.join(', ')}` : '', rmDosage ? `Dosage: ${rmDosage}` : ''].filter(Boolean).join(' • ')}</Text> : null}
                {rmBotanicalDescription ? <Text style={{ ...Typography.eyebrow, color: colors.text.secondary, marginTop: 4 }}>{rmBotanicalDescription}</Text> : null}
                {rmTaxonomySource ? <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginTop: 7 }}>Source: {rmTaxonomySource}</Text> : null}
              </View>
            )}

            {/* Existing stock is only relevant while editing. Keep it at the end so it doesn't distract from definition. */}
            {editingMaterialId !== null && (
              <View style={{ marginBottom: 4, backgroundColor: 'transparent', paddingVertical: 10, borderRadius: Radius.md, borderWidth: 0 }}>
                <Text style={{ ...Typography.bodySm, fontWeight: '800', color: colors.text.primary, marginBottom: 2 }}>Current stock adjustment</Text>
                <Text style={{ ...Typography.eyebrow, color: colors.text.muted, marginBottom: 12 }}>Only change physical stock here when it differs from the recorded quantity.</Text>
                <Text style={styles.inputLabel}>SKU / System Code</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.bg.secondary, color: colors.text.muted }]} value={rmSku} editable={false} />
                <Text style={styles.inputLabel}>Current Physical Stock ({rmUnit})</Text>
                <TextInput style={[styles.input, { fontWeight: '700' }]} placeholder="Enter current physical stock qty" placeholderTextColor={colors.text.muted} value={rmStockLevel} onChangeText={setRmStockLevel} keyboardType="numeric" />
                {setRmStockLevel && parseFloat(rmStockLevel) !== rmOriginalStockLevel && <View style={{ marginTop: 2 }}><Text style={[styles.inputLabel, { color: colors.warning }]}>Reason for stock adjustment *</Text><TextInput style={styles.input} placeholder="e.g. Sorting loss, moisture, spillage" placeholderTextColor={colors.text.muted} value={rmAdjustmentReason} onChangeText={setRmAdjustmentReason} /></View>}
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
