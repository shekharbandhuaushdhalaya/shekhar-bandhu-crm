import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl, Modal, ActivityIndicator, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'];

function AccountsPage() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [view, setView] = useState<'accounts' | 'trial' | 'pnl' | 'bs'>('accounts');

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/accounts');
      setAccounts(res.data);
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  };

  useEffect(() => { fetchAccounts() }, []);

  const grouped = ACCOUNT_TYPES.map(t => ({
    type: t,
    list: accounts.filter(a => a.type === t),
  }));

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAccounts} />}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: Spacing.md, flexWrap: 'wrap' }}>
        {[
          { key: 'accounts', label: 'Accounts' },
          { key: 'trial', label: 'Trial Balance' },
          { key: 'pnl', label: 'P&L' },
          { key: 'bs', label: 'Balance Sheet' },
        ].map(v => (
          <TouchableOpacity key={v.key} style={[styles.filterChip, view === v.key && styles.filterChipActive]} onPress={() => setView(v.key as any)}>
            <Text style={[styles.filterChipText, view === v.key && { color: '#fff' }]}>{v.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {view === 'accounts' && grouped.map(g => g.list.length > 0 && (
        <View key={g.type} style={{ marginBottom: Spacing.md }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>{g.type}</Text>
          {g.list.map(a => (
            <View key={a._id} style={[styles.card, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
              <View>
                <Text style={styles.cardTitle}>{a.name}</Text>
                <Text style={styles.cardSub}>{a.code}</Text>
              </View>
              {a.parent && <Text style={styles.cardSub}>Parent: {a.parent}</Text>}
            </View>
          ))}
        </View>
      ))}

      {view === 'trial' && <TrialBalanceView />}
      {view === 'pnl' && <ProfitLossView />}
      {view === 'bs' && <BalanceSheetView />}

      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>

      <CreateAccountModal visible={showModal} onClose={() => { setShowModal(false); fetchAccounts() }} accounts={accounts} />
    </ScrollView>
  );
}

function TrialBalanceView() {
  const { colors } = useTheme();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get('/api/accounts/trial-balance').then(r => setData(r.data)).catch(console.error);
  }, []);

  if (!data) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, marginBottom: Spacing.sm }}>
        <Text style={{ fontWeight: '700', color: colors.text.primary, flex: 1 }}>Account</Text>
        <Text style={{ fontWeight: '700', color: colors.text.primary, width: 80, textAlign: 'right' }}>Debit</Text>
        <Text style={{ fontWeight: '700', color: colors.text.primary, width: 80, textAlign: 'right' }}>Credit</Text>
      </View>
      {data.rows?.map((r: any, i: number) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.text.secondary, flex: 1 }}>{r.code} - {r.name}</Text>
          <Text style={{ color: colors.text.primary, width: 80, textAlign: 'right', fontWeight: '600' }}>₹{r.debit.toLocaleString()}</Text>
          <Text style={{ color: colors.text.primary, width: 80, textAlign: 'right', fontWeight: '600' }}>₹{r.credit.toLocaleString()}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, marginTop: Spacing.sm }}>
        <Text style={{ fontWeight: '800', color: colors.text.primary, flex: 1 }}>Total</Text>
        <Text style={{ fontWeight: '800', color: colors.text.primary, width: 80, textAlign: 'right' }}>₹{data.totalDebit?.toLocaleString()}</Text>
        <Text style={{ fontWeight: '800', color: colors.text.primary, width: 80, textAlign: 'right' }}>₹{data.totalCredit?.toLocaleString()}</Text>
      </View>
    </View>
  );
}

function ProfitLossView() {
  const { colors } = useTheme();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get('/api/accounts/profit-loss').then(r => setData(r.data)).catch(console.error);
  }, []);

  if (!data) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <View>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text.primary, marginBottom: Spacing.md }}>Profit & Loss</Text>
      <Text style={{ color: colors.text.muted, marginBottom: Spacing.md, fontSize: 12 }}>{new Date(data.from).toLocaleDateString()} - {new Date(data.to).toLocaleDateString()}</Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.success, marginBottom: 8 }}>Income</Text>
      {data.income?.map((i: any, idx: number) => (
        <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.text.secondary }}>{i.name}</Text>
          <Text style={{ color: colors.text.primary, fontWeight: '600' }}>₹{i.amount.toLocaleString()}</Text>
        </View>
      ))}
      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.danger, marginTop: Spacing.md, marginBottom: 8 }}>Expenses</Text>
      {data.expenses?.map((e: any, idx: number) => (
        <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.text.secondary }}>{e.name}</Text>
          <Text style={{ color: colors.text.primary, fontWeight: '600' }}>₹{e.amount.toLocaleString()}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, marginTop: Spacing.md }}>
        <Text style={{ fontWeight: '800', color: data.netProfit >= 0 ? colors.success : colors.danger }}>Net {data.netProfit >= 0 ? 'Profit' : 'Loss'}</Text>
        <Text style={{ fontWeight: '800', color: data.netProfit >= 0 ? colors.success : colors.danger }}>₹{Math.abs(data.netProfit).toLocaleString()}</Text>
      </View>
    </View>
  );
}

function BalanceSheetView() {
  const { colors } = useTheme();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get('/api/accounts/balance-sheet').then(r => setData(r.data)).catch(console.error);
  }, []);

  if (!data) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <View>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text.primary, marginBottom: Spacing.md }}>Balance Sheet</Text>
      <Text style={{ color: colors.text.muted, marginBottom: Spacing.md, fontSize: 12 }}>As of {new Date(data.asOf).toLocaleDateString()}</Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary, marginBottom: 8 }}>Assets</Text>
      {data.assets?.map((a: any, i: number) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.text.secondary }}>{a.name}</Text>
          <Text style={{ color: colors.text.primary, fontWeight: '600' }}>₹{a.balance.toLocaleString()}</Text>
        </View>
      ))}
      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.warning, marginTop: Spacing.md, marginBottom: 8 }}>Liabilities</Text>
      {data.liabilities?.map((l: any, i: number) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.text.secondary }}>{l.name}</Text>
          <Text style={{ color: colors.text.primary, fontWeight: '600' }}>₹{l.balance.toLocaleString()}</Text>
        </View>
      ))}
      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.success, marginTop: Spacing.md, marginBottom: 8 }}>Equity</Text>
      {data.equity?.map((e: any, i: number) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.text.secondary }}>{e.name}</Text>
          <Text style={{ color: colors.text.primary, fontWeight: '600' }}>₹{e.balance.toLocaleString()}</Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, marginTop: Spacing.md }}>
        <Text style={{ fontWeight: '800', color: colors.text.primary }}>Total Assets</Text>
        <Text style={{ fontWeight: '800', color: colors.text.primary }}>₹{data.totalAssets?.toLocaleString()}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, backgroundColor: colors.bg.secondary, borderRadius: Radius.sm, marginTop: 4 }}>
        <Text style={{ fontWeight: '800', color: colors.text.primary }}>Liabilities + Equity</Text>
        <Text style={{ fontWeight: '800', color: colors.text.primary }}>₹{data.totalLiabilitiesEquity?.toLocaleString()}</Text>
      </View>
    </View>
  );
}

function CreateAccountModal({ visible, onClose, accounts }: { visible: boolean; onClose: () => void; accounts: any[] }) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState('asset');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name || !code) { alert('Name and code required'); return }
    try {
      setSaving(true);
      await api.post('/api/accounts', { name, code, type });
      onClose();
    } catch (err: any) { alert(err.response?.data?.error || err.message) }
    finally { setSaving(false) }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: colors.bg.card, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, padding: Spacing.lg }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text.primary, marginBottom: Spacing.md }}>New Account</Text>
          <TextInput style={{ backgroundColor: colors.bg.primary, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.text.primary, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.sm }} placeholder="Account name" placeholderTextColor={colors.text.muted} value={name} onChangeText={setName} />
          <TextInput style={{ backgroundColor: colors.bg.primary, borderRadius: Radius.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: colors.text.primary, borderWidth: 1, borderColor: colors.border, marginBottom: Spacing.sm }} placeholder="Code (e.g. 10001)" placeholderTextColor={colors.text.muted} value={code} onChangeText={setCode} />
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: Spacing.lg, flexWrap: 'wrap' }}>
            {ACCOUNT_TYPES.map(t => (
              <TouchableOpacity key={t} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: type === t ? colors.primary : colors.bg.primary, borderWidth: 1, borderColor: type === t ? colors.primary : colors.border }} onPress={() => setType(t)}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: type === t ? '#fff' : colors.text.secondary }}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={{ padding: 14, borderRadius: Radius.sm, backgroundColor: colors.primary, alignItems: 'center' }} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary, padding: Spacing.md },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  card: { backgroundColor: colors.bg.card, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  cardSub: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  fab: { position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 6 },
});

export default AccountsPage;
