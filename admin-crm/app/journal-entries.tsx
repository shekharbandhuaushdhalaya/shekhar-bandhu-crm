import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl, Modal, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';

function JournalEntriesPage() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await api.get(`/api/journal-entries${params}`);
      setEntries(res.data);
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  };

  useEffect(() => { fetchEntries() }, [search]);

  const handlePost = async (id: string) => {
    try {
      await api.patch(`/api/journal-entries/${id}/post`);
      fetchEntries();
    } catch (err: any) { alert(err.response?.data?.error || err.message) }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/journal-entries/${id}`);
      fetchEntries();
    } catch (err: any) { alert(err.response?.data?.error || err.message) }
  };

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchEntries} />}>
      <TextInput style={styles.searchBar} placeholder="Search entries..." placeholderTextColor={colors.text.muted} value={search} onChangeText={setSearch} />

      {entries.map(entry => (
        <View key={entry._id} style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.cardTitle}>{entry.entryNo}</Text>
            <View style={[styles.badge, { backgroundColor: entry.status === 'posted' ? colors.successLight : colors.warningLight }]}>
              <Text style={[styles.badgeText, { color: entry.status === 'posted' ? colors.success : colors.warning }]}>{entry.status}</Text>
            </View>
          </View>
          <Text style={styles.cardSub}>{entry.description}</Text>
          <Text style={{ fontSize: 12, color: colors.text.muted, marginBottom: 6 }}>{new Date(entry.date).toLocaleDateString()}</Text>
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 }}>
            {entry.lines?.map((l: any, i: number) => (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                <Text style={{ fontSize: 12, color: colors.text.secondary, flex: 1 }}>{l.accountName}</Text>
                <Text style={{ fontSize: 12, color: colors.success, width: 70, textAlign: 'right' }}>{l.debit > 0 ? `₹${l.debit}` : ''}</Text>
                <Text style={{ fontSize: 12, color: colors.danger, width: 70, textAlign: 'right' }}>{l.credit > 0 ? `₹${l.credit}` : ''}</Text>
              </View>
            ))}
          </View>
          {entry.status === 'draft' && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: colors.success }} onPress={() => handlePost(entry._id)}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Post</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: colors.danger }} onPress={() => handleDelete(entry._id)}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
      {!loading && entries.length === 0 && <Text style={{ textAlign: 'center', color: colors.text.muted, marginTop: 40 }}>No journal entries found</Text>}

      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>

      <CreateJournalModal visible={showModal} onClose={() => { setShowModal(false); fetchEntries() }} />
    </ScrollView>
  );
}

function CreateJournalModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState([{ accountId: '', accountCode: '', accountName: '', debit: 0, credit: 0 }]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/accounts').then(r => setAccounts(r.data)).catch(console.error);
  }, []);

  const addLine = () => setLines([...lines, { accountId: '', accountCode: '', accountName: '', debit: 0, credit: 0 }]);

  const updateLine = (i: number, field: string, value: any) => {
    const updated = [...lines];
    (updated[i] as any)[field] = value;
    if (field === 'accountId') {
      const account = accounts.find(a => a._id === value);
      if (account) { updated[i].accountCode = account.code; updated[i].accountName = account.name }
    }
    setLines(updated);
  };

  const handleSave = async () => {
    if (!description || lines.length < 2) { alert('Description and at least 2 lines required'); return }
    try {
      setSaving(true);
      await api.post('/api/journal-entries', { description, lines });
      onClose();
    } catch (err: any) { alert(err.response?.data?.error || err.message) }
    finally { setSaving(false) }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <ScrollView style={{ maxHeight: '80%' }} contentContainerStyle={{ backgroundColor: colors.bg.card, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.lg }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: Spacing.md }}>New Journal Entry</Text>
          <TextInput style={{ backgroundColor: colors.bg.primary, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.text.primary, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.md }} placeholder="Description" placeholderTextColor={colors.text.muted} value={description} onChangeText={setDescription} />
          {lines.map((line, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <TextInput style={{ backgroundColor: colors.bg.primary, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: colors.text.primary, borderWidth: 1, borderColor: colors.border }} placeholder="Account ID" placeholderTextColor={colors.text.muted} value={line.accountId} onChangeText={v => updateLine(i, 'accountId', v)} />
              </View>
              <TextInput style={{ width: 70, backgroundColor: colors.bg.primary, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 8, fontSize: 12, color: colors.text.primary, borderWidth: 1, borderColor: colors.border }} placeholder="Dr" placeholderTextColor={colors.text.muted} value={line.debit ? String(line.debit) : ''} onChangeText={v => updateLine(i, 'debit', parseFloat(v) || 0)} keyboardType="numeric" />
              <TextInput style={{ width: 70, backgroundColor: colors.bg.primary, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 8, fontSize: 12, color: colors.text.primary, borderWidth: 1, borderColor: colors.border }} placeholder="Cr" placeholderTextColor={colors.text.muted} value={line.credit ? String(line.credit) : ''} onChangeText={v => updateLine(i, 'credit', parseFloat(v) || 0)} keyboardType="numeric" />
            </View>
          ))}
          <TouchableOpacity onPress={addLine} style={{ marginBottom: Spacing.md }}>
            <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add Line</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ padding: 14, borderRadius: Radius.sm, backgroundColor: colors.primary, alignItems: 'center' }} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary, padding: Spacing.md },
  searchBar: { backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.text.primary, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.md },
  card: { backgroundColor: colors.bg.card, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  cardSub: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 6 },
});

export default JournalEntriesPage;
