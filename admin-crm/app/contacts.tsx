import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl, Modal, FlatList, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, STAGES, Stage, getStageColors, LightColors } from '../constants/theme';
import { api, Contact } from '../utils/api';
import { useAuth } from '../utils/auth';
import { useTheme, useStyles } from '../utils/themeContext';

export function ContactDetailModal({ contact, visible, onClose, onDeleted }: { contact: Contact | null; visible: boolean; onClose: () => void; onDeleted: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const stageColors = getStageColors(colors);
  
  const [logType, setLogType] = useState('Call');
  const [logNote, setLogNote] = useState('');
  const [logVisible, setLogVisible] = useState(false);
  const [currentContact, setCurrentContact] = useState<Contact | null>(contact);
  const { user } = useAuth();

  useEffect(() => { setCurrentContact(contact); }, [contact]);
  if (!currentContact) return null;

  const stageColor = stageColors[currentContact.stage as Stage] || colors.text.muted;

  const handleLog = async () => {
    if (!logNote.trim()) return;
    const updated = await api.logInteraction(currentContact._id, logType, logNote);
    if (updated) setCurrentContact(updated);
    setLogNote('');
    setLogVisible(false);
  };

  const handleDelete = async () => {
    try {
      const success = await api.deleteContact(currentContact._id);
      if (success) {
        onDeleted();
        onClose();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete contact');
    }
  };

  const timeAgo = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Contact Profile</Text>
          <TouchableOpacity onPress={() => setLogVisible(true)}>
            <Ionicons name="add-circle" size={26} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          {/* Profile Header */}
          <View style={styles.profileHeader}>
            <View style={[styles.profileAvatar, { borderColor: stageColor }]}>
              <Text style={styles.profileAvatarText}>{currentContact.name.charAt(0)}</Text>
            </View>
            <Text style={styles.profileName}>{currentContact.name}</Text>
            <Text style={styles.profileCompany}>{currentContact.company}</Text>
            <View style={[styles.statusBadge, { borderColor: stageColor, backgroundColor: stageColor + '18', marginTop: 8 }]}>
              <Text style={[styles.statusText, { color: stageColor }]}>{currentContact.stage.toUpperCase()}</Text>
            </View>
          </View>

          {/* Info Grid */}
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="mail" size={16} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{currentContact.email || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.successLight }]}>
                <Ionicons name="call" size={16} color={colors.success} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{currentContact.phone || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.warningLight }]}>
                <Ionicons name="location" size={16} color={colors.warning} />
              </View>
              <View>
                <Text style={styles.infoLabel}>City / Location</Text>
                <Text style={styles.infoValue}>{currentContact.city || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.purple + '20' }]}>
                <Ionicons name="cube" size={16} color={colors.purple} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Product Interest</Text>
                <Text style={styles.infoValue}>{(currentContact.productInterest && currentContact.productInterest.length > 0) ? currentContact.productInterest.join(', ') : 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.infoLight }]}>
                <Ionicons name="podium" size={16} color={colors.info} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Estimated Volume</Text>
                <Text style={styles.infoValue}>{currentContact.estimatedVolume || 'N/A'}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.dangerLight }]}>
                <Ionicons name="cash" size={16} color={colors.danger} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Est. Deal Value</Text>
                <Text style={styles.infoValue}>₹{currentContact.dealValue.toLocaleString()}</Text>
              </View>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.text.muted + '20' }]}>
                <Ionicons name="megaphone" size={16} color={colors.text.secondary} />
              </View>
              <View>
                <Text style={styles.infoLabel}>Lead Source</Text>
                <Text style={styles.infoValue}>{currentContact.leadSource}</Text>
              </View>
            </View>
          </View>

          {/* Timeline */}
          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Activity Timeline</Text>
          {currentContact.interactions.map((int, i) => (
            <View key={i} style={styles.timelineItem}>
              <View style={styles.timelineDot}>
                <Ionicons name={int.type === 'Call' ? 'call' : int.type === 'Email' ? 'mail' : int.type === 'Meeting' ? 'calendar' : 'information-circle'} size={14} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.timelineType}>{int.type}</Text>
                <Text style={styles.timelineNote}>{int.note}</Text>
                <Text style={styles.timelineTime}>{timeAgo(int.date)}</Text>
              </View>
            </View>
          ))}

          {user?.role === 'admin' && (
            <TouchableOpacity style={styles.deleteContactBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.deleteContactBtnText}>Delete Contact</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Log interaction overlay */}
        {logVisible && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.logOverlay}>
            <View style={styles.logSheet}>
              <Text style={styles.logTitle}>Log Interaction</Text>
              <View style={styles.logTypes}>
                {['Call', 'Email', 'Meeting', 'Note'].map(t => (
                  <TouchableOpacity key={t} onPress={() => setLogType(t)} style={[styles.logTypeBtn, logType === t && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    <Text style={[styles.logTypeBtnText, logType === t && { color: '#fff' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={styles.logInput} placeholder="What happened?" placeholderTextColor={colors.text.muted} value={logNote} onChangeText={setLogNote} multiline />
              <View style={styles.logActions}>
                <TouchableOpacity style={styles.logCancel} onPress={() => setLogVisible(false)}>
                  <Text style={{ color: colors.text.secondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.logSave} onPress={handleLog}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

export function AddContactModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const stageColors = getStageColors(colors);

  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [city, setCity] = useState('');
  const [estimatedVolume, setEstimatedVolume] = useState('');
  const [leadSource, setLeadSource] = useState('Direct Walk-in');
  const [productInterests, setProductInterests] = useState<string[]>([]);
  const [stage, setStage] = useState<string>('lead');

  const availableInterests = ['PET Bottles', 'Glass Bottles', 'Caps / Closures', 'Holograms', 'Custom Molds'];
  const leadSources = ['IndiaMart', 'JustDial', 'TradeIndia', 'WhatsApp', 'Reference', 'Website', 'Direct Walk-in', 'Cold Call'];

  const handleSave = async () => {
    if (!name.trim()) return;
    await api.createContact({ 
      name, company, email, phone, 
      dealValue: parseInt(dealValue) || 0, 
      stage,
      city,
      estimatedVolume,
      leadSource,
      productInterest: productInterests
    });
    setName(''); setCompany(''); setEmail(''); setPhone(''); setDealValue(''); setCity(''); setEstimatedVolume(''); setLeadSource('Direct Walk-in'); setProductInterests([]); setStage('lead');
    onSaved();
    onClose();
  };

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>New Contact</Text>
          <TouchableOpacity onPress={handleSave}>
            <Ionicons name="checkmark-circle" size={26} color={colors.success} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          {[
            { label: 'Full Name', value: name, set: setName, icon: 'person', ph: 'e.g. Bruce Wayne' },
            { label: 'Company', value: company, set: setCompany, icon: 'business', ph: 'e.g. Wayne Enterprises' },
            { label: 'Email', value: email, set: setEmail, icon: 'mail', ph: 'bruce@example.com' },
            { label: 'Phone', value: phone, set: setPhone, icon: 'call', ph: '+1 555 123 456' },
            { label: 'City / Location', value: city, set: setCity, icon: 'location', ph: 'e.g. Mumbai' },
            { label: 'Estimated Volume', value: estimatedVolume, set: setEstimatedVolume, icon: 'cube', ph: 'e.g. 50k pcs' },
            { label: 'Est. Deal Value (₹)', value: dealValue, set: setDealValue, icon: 'cash', ph: '50000' },
          ].map((f, i) => (
            <View key={i} style={styles.formGroup}>
              <Text style={styles.formLabel}>{f.label}</Text>
              <View style={styles.formInput}>
                <Ionicons name={f.icon as any} size={16} color={colors.text.muted} />
                <TextInput style={styles.formInputText} placeholder={f.ph} placeholderTextColor={colors.text.muted} value={f.value} onChangeText={f.set} keyboardType={f.label.includes('Value') ? 'numeric' : 'default'} />
              </View>
            </View>
          ))}

          <Text style={[styles.formLabel, { marginTop: 8 }]}>Product Interest</Text>
          <View style={styles.stageSelector}>
            {availableInterests.map(int => {
              const isSelected = productInterests.includes(int);
              return (
                <TouchableOpacity 
                  key={int} 
                  style={[styles.stageSelectorBtn, isSelected && { backgroundColor: colors.primary + '30', borderColor: colors.primary }]} 
                  onPress={() => {
                    if (isSelected) setProductInterests(productInterests.filter(i => i !== int));
                    else setProductInterests([...productInterests, int]);
                  }}
                >
                  <Text style={[styles.stageSelectorText, isSelected && { color: colors.primary }]}>{int}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={[styles.formLabel, { marginTop: 16 }]}>Lead Source</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
            {leadSources.map(s => (
              <TouchableOpacity key={s} style={[styles.stageSelectorBtn, leadSource === s && { backgroundColor: colors.success + '30', borderColor: colors.success }]} onPress={() => setLeadSource(s)}>
                <Text style={[styles.stageSelectorText, leadSource === s && { color: colors.success }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.formLabel, { marginTop: 8 }]}>Stage</Text>
          <View style={styles.stageSelector}>
            {STAGES.filter(s => s !== 'won' && s !== 'lost').map(s => (
              <TouchableOpacity key={s} style={[styles.stageSelectorBtn, stage === s && { backgroundColor: stageColors[s] + '30', borderColor: stageColors[s] }]} onPress={() => setStage(s)}>
                <Text style={[styles.stageSelectorText, stage === s && { color: stageColors[s] }]}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ContactsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const stageColors = getStageColors(colors);

  const load = useCallback(async () => {
    const res = await api.getContacts(search, filterStage);
    setContacts(res);
  }, [search, filterStage]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.screen}>
      <View style={styles.innerContainer}>
        <View style={{ zIndex: 1100, position: 'relative' }}>
          {showFilterDropdown && (
            <Pressable
              style={[
                StyleSheet.absoluteFill,
                { 
                  zIndex: 900,
                  ...(Platform.OS === 'web' ? { position: 'fixed' as any } : {})
                }
              ]}
              onPress={() => setShowFilterDropdown(false)}
            />
          )}
          <View style={[styles.searchBar, { paddingRight: 8, paddingLeft: 12 }]}>
            <Ionicons name="search" size={18} color={colors.text.muted} />
            <TextInput style={[styles.searchInput, { minWidth: 100 }]} placeholder="Search contacts..." placeholderTextColor={colors.text.muted} value={search} onChangeText={setSearch} />
            
            <View style={{ position: 'relative', zIndex: showFilterDropdown ? 1000 : 1 }}>
              <TouchableOpacity
                style={[styles.filterDropdownButton, { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 4 }]}
                onPress={() => setShowFilterDropdown(!showFilterDropdown)}
              >
                <Text style={styles.filterDropdownButtonText}>
                  {filterStage === 'all' ? 'All Stages' : filterStage.charAt(0).toUpperCase() + filterStage.slice(1)}
                </Text>
                <Ionicons name={showFilterDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.muted} />
              </TouchableOpacity>

              {showFilterDropdown && (
                <View style={[styles.filterDropdownPanel, { top: 40, right: 0 }]}>
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 250 }}>
                    {['all', ...STAGES].map(s => (
                      <TouchableOpacity
                        key={s}
                        style={[styles.filterDropdownItem, filterStage === s && styles.filterDropdownItemActive]}
                        onPress={() => {
                          setFilterStage(s);
                          setShowFilterDropdown(false);
                        }}
                      >
                        <Text style={[styles.filterDropdownItemText, filterStage === s && { fontWeight: '700', color: colors.primary }]}>
                          {s === 'all' ? 'All Stages' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            <TouchableOpacity style={styles.addBtn} onPress={() => setAddVisible(true)}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md }}>
            <View style={styles.table}>
              {/* Table Header Row */}
              <View style={styles.tableHeaderRow}>
                <View style={[styles.tableHeaderCellContainer, { width: 160 }]}><Text style={styles.tableHeaderCell}>Name</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 140 }]}><Text style={styles.tableHeaderCell}>Company</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 120 }]}><Text style={styles.tableHeaderCell}>Stage</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 120 }]}><Text style={styles.tableHeaderCell}>Deal Value</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 120 }]}><Text style={styles.tableHeaderCell}>Lead Source</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 180 }]}><Text style={styles.tableHeaderCell}>Phone / Email</Text></View>
                <View style={[styles.tableHeaderCellContainer, { width: 80, borderRightWidth: 0 }]}><Text style={[styles.tableHeaderCell, { textAlign: 'center' }]}>Action</Text></View>
              </View>

              {/* Table Body Rows */}
              {contacts.map((item) => {
                const stageColor = stageColors[item.stage as Stage] || colors.text.muted;
                return (
                  <View key={item._id} style={styles.tableBodyRow}>
                    <View style={[styles.tableCellContainer, { width: 160 }]}>
                      <Text style={styles.primaryText}>{item.name}</Text>
                      {item.company ? <Text style={styles.secondaryText}>{item.company}</Text> : null}
                    </View>
                    <View style={[styles.tableCellContainer, { width: 140 }]}>
                      <Text style={styles.tableCell} numberOfLines={1}>{item.company || 'N/A'}</Text>
                    </View>
                    <View style={[styles.tableCellContainer, { width: 120 }]}>
                      <View style={[styles.statusBadge, { borderColor: stageColor, backgroundColor: stageColor + '12' }]}>
                        <Text style={[styles.statusText, { color: stageColor }]}>{item.stage.toUpperCase()}</Text>
                      </View>
                    </View>
                    <View style={[styles.tableCellContainer, { width: 120 }]}>
                      <Text style={[styles.tableCell, { fontWeight: '700' }]}>₹{item.dealValue.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={[styles.tableCellContainer, { width: 120 }]}>
                      <Text style={styles.tableCell} numberOfLines={1}>{item.leadSource}</Text>
                    </View>
                    <View style={[styles.tableCellContainer, { width: 180 }]}>
                      <Text style={{ fontSize: 12, color: colors.text.primary }} numberOfLines={1}>{item.phone || 'N/A'}</Text>
                      {item.email ? <Text style={styles.secondaryText} numberOfLines={1}>{item.email}</Text> : null}
                    </View>
                    <View style={[styles.tableCellContainer, { width: 80, borderRightWidth: 0, alignItems: 'center', justifyContent: 'center' }]}>
                      <TouchableOpacity style={styles.actionIconButton} onPress={() => { setSelectedContact(item); setDetailVisible(true); }}>
                        <Ionicons name="eye" size={16} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}

              {contacts.length === 0 && (
                <View style={styles.emptyTableContainer}>
                  <Ionicons name="folder-open-outline" size={28} color={colors.text.muted} />
                  <Text style={styles.emptyText}>No contacts found</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </ScrollView>
      </View>

      <ContactDetailModal contact={selectedContact} visible={detailVisible} onClose={() => { setDetailVisible(false); load(); }} onDeleted={load} />
      <AddContactModal visible={addVisible} onClose={() => setAddVisible(false)} onSaved={load} />
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  innerContainer: { flex: 1, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, margin: Spacing.lg, marginBottom: 0, paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, gap: 10 },
  searchInput: { flex: 1, height: 46, color: colors.text.primary, fontSize: 14 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.text.muted, textAlign: 'center', marginTop: 40, fontSize: 13 },

  filterDropdownButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, height: 36, gap: 6 },
  filterDropdownButtonText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  filterDropdownPanel: { position: 'absolute', backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, width: 220, zIndex: 9999, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 12 },
  filterDropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterDropdownItemActive: { backgroundColor: colors.primary + '08' },
  filterDropdownItemText: { fontSize: 13, color: colors.text.primary },

  table: { flex: 1, backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, alignSelf: 'flex-start', marginVertical: Spacing.md, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  tableHeaderCell: { fontSize: 11, fontWeight: '800', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableHeaderCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  tableBodyRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tableCell: { fontSize: 13, color: colors.text.primary },
  tableCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  primaryText: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  secondaryText: { fontSize: 10, color: colors.text.muted, marginTop: 1 },
  outstandingText: { fontSize: 13, fontWeight: '800' },
  actionIconButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  emptyTableContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontWeight: '800' },

  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: colors.bg.primary, width: '100%', maxWidth: 650, alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text.primary },
  profileHeader: { alignItems: 'center', marginBottom: 20 },
  profileAvatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', marginBottom: 10 },
  profileAvatarText: { fontSize: 28, fontWeight: '800', color: colors.text.primary },
  profileName: { fontSize: 22, fontWeight: '800', color: colors.text.primary },
  profileCompany: { fontSize: 14, color: colors.text.secondary },
  infoGrid: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg, gap: 16 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11, color: colors.text.muted, fontWeight: '600' },
  infoValue: { fontSize: 14, color: colors.text.primary, fontWeight: '500' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text.primary, marginBottom: 12 },
  timelineItem: { flexDirection: 'row', gap: 12, marginBottom: 16, paddingLeft: 4 },
  timelineDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  timelineType: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 2 },
  timelineNote: { fontSize: 13, color: colors.text.secondary },
  timelineTime: { fontSize: 11, color: colors.text.muted, marginTop: 2 },

  // Log interaction
  logOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', height: '100%' },
  logSheet: { backgroundColor: colors.bg.secondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.lg, paddingBottom: 32 },
  logTitle: { fontSize: 18, fontWeight: '800', color: colors.text.primary, marginBottom: 14 },
  logTypes: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  logTypeBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  logTypeBtnText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  logInput: { backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, padding: 14, color: colors.text.primary, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  logActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 14 },
  logCancel: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  logSave: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.primary },

  // Add Contact Form
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 12, fontWeight: '700', color: colors.text.secondary, marginBottom: 6 },
  formInput: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 },
  formInputText: { flex: 1, height: 46, color: colors.text.primary, fontSize: 14 },
  stageSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  stageSelectorBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  stageSelectorText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  deleteContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.danger,
    borderRadius: Radius.md,
    paddingVertical: 12,
    marginTop: 24,
    marginBottom: 16,
  },
  deleteContactBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
