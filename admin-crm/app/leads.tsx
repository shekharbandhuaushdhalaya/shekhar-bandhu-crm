import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, useWindowDimensions, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, STAGES, Stage, getStageColors, LightColors } from '../constants/theme';
import { api, Contact } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';
import { AddContactModal, ContactDetailModal } from './contacts';

function PipelineColumn({ stage, contacts, onMoveContact, onClickContact, width }: { stage: Stage; contacts: Contact[]; onMoveContact: (id: string, newStage: string) => void; onClickContact: (c: Contact) => void; width: number }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const stageColors = getStageColors(colors);
  
  const stageColor = stageColors[stage];
  const totalValue = contacts.reduce((s, c) => s + c.dealValue, 0);
  const stageIdx = STAGES.indexOf(stage);

  return (
    <View style={[styles.column, { borderTopColor: stageColor, width }]}>
      <View style={styles.columnHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.columnTitle}>{stage.charAt(0).toUpperCase() + stage.slice(1)}</Text>
          <Text style={styles.columnSub}>{contacts.length} deals · ₹{(totalValue / 1000).toFixed(0)}k</Text>
        </View>
        <View style={[styles.columnCount, { backgroundColor: stageColor + '25' }]}>
          <Text style={[styles.columnCountText, { color: stageColor }]}>{contacts.length}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {contacts.map(c => (
          <TouchableOpacity key={c._id} style={styles.dealCard} onPress={() => onClickContact(c)}>
            <View style={styles.dealTop}>
              <View style={[styles.dealAvatar, { borderColor: stageColor }]}>
                <Text style={styles.dealAvatarText}>{c.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dealName} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.dealCompany} numberOfLines={1}>{c.company}</Text>
              </View>
            </View>
            <View style={styles.dealMid}>
              <Ionicons name="cash-outline" size={12} color={colors.success} />
              <Text style={styles.dealValue}>₹{c.dealValue.toLocaleString()}</Text>
            </View>
            {/* Stage move buttons */}
            <View style={styles.moveRow}>
              {stageIdx > 0 && (
                <TouchableOpacity style={styles.moveBtn} onPress={() => onMoveContact(c._id, STAGES[stageIdx - 1])}>
                  <Ionicons name="arrow-back" size={14} color={colors.text.muted} />
                  <Text style={styles.moveBtnText}>{STAGES[stageIdx - 1].slice(0, 4).toUpperCase()}</Text>
                </TouchableOpacity>
              )}
              {stageIdx < STAGES.length - 1 && (
                <TouchableOpacity style={[styles.moveBtn, { marginLeft: 'auto' }]} onPress={() => onMoveContact(c._id, STAGES[stageIdx + 1])}>
                  <Text style={[styles.moveBtnText, { color: stageColors[STAGES[stageIdx + 1]] }]}>{STAGES[stageIdx + 1].slice(0, 4).toUpperCase()}</Text>
                  <Ionicons name="arrow-forward" size={14} color={stageColors[STAGES[stageIdx + 1]]} />
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        ))}
        {contacts.length === 0 && (
          <View style={styles.emptyColumn}>
            <Ionicons name="file-tray-outline" size={28} color={colors.text.muted} />
            <Text style={styles.emptyColText}>No leads</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

export default function LeadsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const { width: winWidth } = useWindowDimensions();
  
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  // If winWidth is large (desktop), fit all columns side by side. Otherwise horizontal scroll.
  const columnWidth = winWidth > 1100 ? (winWidth - 32 - (Spacing.md * 5)) / 6 : 280;

  const load = useCallback(async () => {
    const c = await api.getContacts();
    setContacts(c);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    api.clearCache();
    await load();
    setRefreshing(false);
  }, [load]);

  const handleMove = async (id: string, newStage: string) => {
    await api.updateContactStage(id, newStage);
    await load();
  };

  // Filter contacts by search query
  const filteredContacts = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.company && c.company.toLowerCase().includes(q)) || (c.email && c.email.toLowerCase().includes(q));
  });

  // Pipeline summary bar
  const totalPipeline = filteredContacts.filter(c => c.stage !== 'won' && c.stage !== 'lost').reduce((s, c) => s + c.dealValue, 0);
  const wonTotal = filteredContacts.filter(c => c.stage === 'won').reduce((s, c) => s + c.dealValue, 0);

  return (
    <View style={styles.screen}>
      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Active Pipeline</Text>
          <Text style={styles.summaryValue}>₹{(totalPipeline / 1000).toFixed(0)}k</Text>
        </View>
        <View style={[styles.summaryDivider]} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Won Revenue</Text>
          <Text style={[styles.summaryValue, { color: colors.success }]}>₹{(wonTotal / 1000).toFixed(0)}k</Text>
        </View>
        <View style={[styles.summaryDivider]} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Leads</Text>
          <Text style={styles.summaryValue}>{filteredContacts.length}</Text>
        </View>
      </View>

      {/* Top Bar with Search and Add Button */}
      <View style={styles.topBar}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.text.muted} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search leads..." 
            placeholderTextColor={colors.text.muted} 
            value={search} 
            onChangeText={setSearch} 
          />
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddVisible(true)}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Add Lead</Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal scrollable columns */}
      <ScrollView horizontal pagingEnabled={false} showsHorizontalScrollIndicator={winWidth <= 1100} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.lg }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        {STAGES.map(stage => (
          <PipelineColumn key={stage} stage={stage} contacts={filteredContacts.filter(c => c.stage === stage)} onMoveContact={handleMove} onClickContact={(c) => { setSelectedContact(c); setDetailVisible(true); }} width={columnWidth} />
        ))}
      </ScrollView>

      <AddContactModal visible={addVisible} onClose={() => setAddVisible(false)} onSaved={load} />
      <ContactDetailModal contact={selectedContact} visible={detailVisible} onClose={() => { setDetailVisible(false); load(); }} onDeleted={load} />
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  summaryBar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: colors.bg.card, marginHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg },
  summaryItem: { alignItems: 'center' },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: colors.text.muted, letterSpacing: 0.5, marginBottom: 4 },
  summaryValue: { fontSize: 20, fontWeight: '800', color: colors.text.primary },
  summaryDivider: { width: 1, height: 30, backgroundColor: colors.border },
  column: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, borderTopWidth: 3, paddingBottom: Spacing.md, marginTop: Spacing.sm },
  columnHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, paddingBottom: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  columnTitle: { fontSize: 15, fontWeight: '800', color: colors.text.primary },
  columnSub: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
  columnCount: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  columnCountText: { fontSize: 13, fontWeight: '800' },
  dealCard: { backgroundColor: colors.bg.primary, borderRadius: Radius.md, marginHorizontal: Spacing.md, marginTop: Spacing.sm, padding: Spacing.md, borderWidth: 1, borderColor: colors.border },
  dealTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  dealAvatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  dealAvatarText: { fontSize: 14, fontWeight: '800', color: colors.text.primary },
  dealName: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  dealCompany: { fontSize: 11, color: colors.text.secondary },
  dealMid: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  dealValue: { fontSize: 12, color: colors.success, fontWeight: '700' },
  moveRow: { flexDirection: 'row', justifyContent: 'space-between' },
  moveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)' },
  moveBtnText: { fontSize: 9, fontWeight: '800', color: colors.text.muted },
  emptyColumn: { alignItems: 'center', paddingTop: 30 },
  emptyColText: { fontSize: 12, color: colors.text.muted, marginTop: 6 },
  
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, marginRight: Spacing.md },
  searchInput: { flex: 1, height: 40, color: colors.text.primary, fontSize: 14, marginLeft: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: 16, height: 40, borderRadius: Radius.md },
  addBtnText: { color: '#fff', fontWeight: '700', marginLeft: 6, fontSize: 14 }
});
