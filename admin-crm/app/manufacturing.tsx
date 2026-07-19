import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Pressable,
  Platform,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import {
  api,
  RawMaterial,
  RawMaterialEntry,
  BillOfMaterials,
  BatchProduction,
  Product,
  Vendor
} from '../utils/api';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { FIRM_DETAILS } from '../constants/firm';

export default function ManufacturingScreen() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [activeTab, setActiveTab] = useState<'materials' | 'bom' | 'batches' | 'scheduler' | 'analytics'>('materials');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Core Data Lists
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [entries, setEntries] = useState<RawMaterialEntry[]>([]);
  const [boms, setBoms] = useState<BillOfMaterials[]>([]);
  const [batches, setBatches] = useState<BatchProduction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [expiryAlerts, setExpiryAlerts] = useState<RawMaterialEntry[]>([]);
  const [mfgAnalytics, setMfgAnalytics] = useState<any>(null);
  const [bmrReport, setBmrReport] = useState<any>(null);
  const [bmrModalVisible, setBmrModalVisible] = useState(false);
  const [loadingBmr, setLoadingBmr] = useState(false);

  const [materialModalVisible, setMaterialModalVisible] = useState(false);
  const [inwardModalVisible, setInwardModalVisible] = useState(false);
  const [bomModalVisible, setBomModalVisible] = useState(false);
  const [productionModalVisible, setProductionModalVisible] = useState(false);
  const [qcModalVisible, setQcModalVisible] = useState(false);
  const [genealogyModalVisible, setGenealogyModalVisible] = useState(false);
  const [genealogyData, setGenealogyData] = useState<any>(null);
  const [genealogyLoading, setGenealogyLoading] = useState(false);
  const [genealogyType, setGenealogyType] = useState<'batch' | 'material'>('batch');
  const [traceModalVisible, setTraceModalVisible] = useState(false);
  const [traceBatchNo, setTraceBatchNo] = useState('');
  const [traceResult, setTraceResult] = useState<any>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [currentInProgressStage, setCurrentInProgressStage] = useState<{ batchId: string; stageIndex: number } | null>(null);
  const [stageNotes, setStageNotes] = useState('');

  // Form States — Raw Material
  const [rmName, setRmName] = useState('');
  const [rmSku, setRmSku] = useState('');
  const [rmUnit, setRmUnit] = useState('kg');
  const [rmMinReorder, setRmMinReorder] = useState('10');
  const [rmError, setRmError] = useState('');

  // Form States — Stock Inward
  const [selectedRmId, setSelectedRmId] = useState('');
  const [inwardBatchNo, setInwardBatchNo] = useState('');
  const [inwardQty, setInwardQty] = useState('');
  const [inwardRate, setInwardRate] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [inwardVendorName, setInwardVendorName] = useState('');
  const [inwardExpiryDate, setInwardExpiryDate] = useState('');
  const [inwardError, setInwardError] = useState('');

  // Form States — BOM Recipe
  const [selectedProdId, setSelectedProdId] = useState('');
  const [bomYield, setBomYield] = useState('100');
  const [bomIngredients, setBomIngredients] = useState<{ rawMaterialId: string; qtyRequired: string }[]>([
    { rawMaterialId: '', qtyRequired: '' }
  ]);
  const [bomError, setBomError] = useState('');

  // Form States — Production Launch
  const [prodProductId, setProdProductId] = useState('');
  const [prodPlannedQty, setProdPlannedQty] = useState('');
  const [prodBatchNo, setProdBatchNo] = useState('');
  const [prodError, setProdError] = useState('');

  // Form States — QC Signoff
  const [selectedBatchRun, setSelectedBatchRun] = useState<BatchProduction | null>(null);
  const [qcYieldQty, setQcYieldQty] = useState('');
  const [qcPacking, setQcPacking] = useState('');
  const [qcWasteQty, setQcWasteQty] = useState('');
  const [qcWasteReason, setQcWasteReason] = useState('');
  const [qcNotes, setQcNotes] = useState('');
  const [qcPassedBy, setQcPassedBy] = useState('');
  const [qcError, setQcError] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [rmsData, entriesData, bomsData, batchesData, prodsData, vendsData, alertsData, analyticsData] = await Promise.all([
        api.getRawMaterials(),
        api.getRawMaterialEntries(),
        api.getBOMs(),
        api.getBatchProductions(),
        api.getProducts(),
        api.getVendors(),
        api.getRawMaterialExpiryAlerts(),
        api.getManufacturingAnalytics()
      ]);

      setMaterials(rmsData);
      setEntries(entriesData);
      setBoms(bomsData);
      setBatches(batchesData);
      setProducts(prodsData);
      setVendors(vendsData);
      setExpiryAlerts(alertsData);
      setMfgAnalytics(analyticsData);
    } catch (err) {
      console.error('Failed to load manufacturing workspace data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // --- Handlers: Raw Material Definition ---
  const handleSaveMaterial = async () => {
    if (!rmName.trim() || !rmSku.trim()) {
      setRmError('Name and SKU are required.');
      return;
    }
    setRmError('');
    try {
      await api.createRawMaterial({
        name: rmName.trim(),
        sku: rmSku.trim().toUpperCase(),
        unit: rmUnit,
        minReorder: Number(rmMinReorder) || 0
      });
      setRmName('');
      setRmSku('');
      setRmUnit('kg');
      setRmMinReorder('10');
      setMaterialModalVisible(false);
      loadData();
    } catch (err: any) {
      setRmError(err.message || 'Failed to save material definition');
    }
  };

  // --- Handlers: Stock Inward ---
  const handleInwardStock = async () => {
    if (!selectedRmId || !inwardBatchNo.trim() || !inwardQty || !inwardRate) {
      setInwardError('Please fill in all required fields.');
      return;
    }
    setInwardError('');
    try {
      const selectedVendor = vendors.find(v => v._id === selectedVendorId);
      await api.inwardRawMaterial({
        rawMaterialId: selectedRmId,
        batchNo: inwardBatchNo.trim().toUpperCase(),
        qty: Number(inwardQty),
        purchaseRate: Number(inwardRate),
        vendorId: selectedVendorId || undefined,
        vendorName: selectedVendor ? (selectedVendor.company || selectedVendor.name) : inwardVendorName || undefined,
        expiryDate: inwardExpiryDate || undefined
      });

      setSelectedRmId('');
      setInwardBatchNo('');
      setInwardQty('');
      setInwardRate('');
      setSelectedVendorId('');
      setInwardVendorName('');
      setInwardExpiryDate('');
      setInwardModalVisible(false);
      loadData();
    } catch (err: any) {
      setInwardError(err.message || 'Failed to inward raw materials');
    }
  };

  const handleVoidInward = async (entryId: string) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Are you sure you want to void this stock entry? This will revert the raw stock inventory.')
      : await new Promise(resolve => {
          Alert.alert('Void Stock Entry', 'Are you sure you want to void this stock entry?', [
            { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Void', onPress: () => resolve(true), style: 'destructive' }
          ]);
        });

    if (!confirmed) return;
    try {
      await api.deleteRawMaterialEntry(entryId);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to void stock entry');
    }
  };

  // --- Handlers: BOM Formula ---
  const handleAddIngredientRow = () => {
    setBomIngredients([...bomIngredients, { rawMaterialId: '', qtyRequired: '' }]);
  };

  const handleRemoveIngredientRow = (index: number) => {
    setBomIngredients(bomIngredients.filter((_, idx) => idx !== index));
  };

  const handleIngredientChange = (index: number, key: 'rawMaterialId' | 'qtyRequired', value: string) => {
    const updated = bomIngredients.map((item, idx) => {
      if (idx === index) {
        return { ...item, [key]: value };
      }
      return item;
    });
    setBomIngredients(updated);
  };

  const handleSaveBOM = async () => {
    if (!selectedProdId || !bomYield) {
      setBomError('Finished product and standard batch size are required.');
      return;
    }
    const invalid = bomIngredients.some(ing => !ing.rawMaterialId || !ing.qtyRequired || isNaN(Number(ing.qtyRequired)));
    if (invalid) {
      setBomError('Please enter valid ingredients and quantities.');
      return;
    }
    setBomError('');

    try {
      await api.configureBOM({
        productId: selectedProdId,
        batchYieldSize: Number(bomYield),
        ingredients: bomIngredients.map(ing => ({
          rawMaterialId: ing.rawMaterialId,
          qtyRequired: Number(ing.qtyRequired)
        }))
      });

      setSelectedProdId('');
      setBomYield('100');
      setBomIngredients([{ rawMaterialId: '', qtyRequired: '' }]);
      setBomModalVisible(false);
      loadData();
    } catch (err: any) {
      setBomError(err.message || 'Failed to configure recipe');
    }
  };

  // --- Handlers: Batch Productions ---
  const handleStartProduction = async () => {
    if (!prodProductId || !prodPlannedQty || !prodBatchNo.trim()) {
      setProdError('Please fill in all launch requirements.');
      return;
    }
    setProdError('');
    try {
      await api.startBatchProduction({
        productId: prodProductId,
        plannedQty: Number(prodPlannedQty),
        batchNo: prodBatchNo.trim().toUpperCase()
      });

      setProdProductId('');
      setProdPlannedQty('');
      setProdBatchNo('');
      setProductionModalVisible(false);
      loadData();
    } catch (err: any) {
      setProdError(err.message || 'Failed to launch production batch');
    }
  };

  const handleCompleteProduction = async () => {
    if (!selectedBatchRun || !qcYieldQty || !qcPassedBy.trim()) {
      setQcError('Actual yield quantity and Inspector name are required.');
      return;
    }
    setQcError('');
    try {
      const payload: any = {
        actualYieldQty: Number(qcYieldQty),
        packing: Number(qcPacking) || undefined,
        qcNotes: qcNotes.trim(),
        qcPassedBy: qcPassedBy.trim()
      };
      if (qcWasteQty) payload.wasteQty = Number(qcWasteQty);
      if (qcWasteReason.trim()) payload.wasteReason = qcWasteReason.trim();

      await api.completeBatchProduction(selectedBatchRun._id, payload);

      setSelectedBatchRun(null);
      setQcYieldQty('');
      setQcPacking('');
      setQcWasteQty('');
      setQcWasteReason('');
      setQcNotes('');
      setQcPassedBy('');
      setQcModalVisible(false);
      loadData();
    } catch (err: any) {
      setQcError(err.message || 'Failed to complete batch QC');
    }
  };

  const handleCancelProduction = async (batchId: string) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Are you sure you want to cancel this batch run? Consumed raw materials will be returned to stock.')
      : await new Promise(resolve => {
          Alert.alert('Cancel Production Run', 'Are you sure you want to cancel this batch run?', [
            { text: 'No', onPress: () => resolve(false), style: 'cancel' },
            { text: 'Yes, Revert Stock', onPress: () => resolve(true), style: 'destructive' }
          ]);
        });

    if (!confirmed) return;
    try {
      await api.cancelBatchProduction(batchId);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel production run');
    }
  };

  const handleAdvanceStage = async (batchId: string, stageIndex: number) => {
    try {
      setCurrentInProgressStage({ batchId, stageIndex });
      await api.advanceStage(batchId, stageIndex, {
        status: 'completed',
        completedBy: 'Operator',
        notes: stageNotes
      });
      setStageNotes('');
      setCurrentInProgressStage(null);
      loadData();
    } catch (err: any) {
      setCurrentInProgressStage(null);
      alert(err.message || 'Failed to advance stage');
    }
  };

  const handleSkipStage = async (batchId: string, stageIndex: number) => {
    try {
      await api.advanceStage(batchId, stageIndex, { status: 'skipped' });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to skip stage');
    }
  };

  const handleOpenGenealogy = async (type: 'batch' | 'material', id: string) => {
    try {
      setGenealogyType(type);
      setGenealogyLoading(true);
      setGenealogyModalVisible(true);
      const data = type === 'batch'
        ? await api.getBatchGenealogy(id)
        : await api.getRawMaterialGenealogy(id);
      setGenealogyData(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load genealogy data');
      setGenealogyModalVisible(false);
    } finally {
      setGenealogyLoading(false);
    }
  };

  const handleTrace = async () => {
    if (!traceBatchNo.trim()) return;
    try {
      setTraceLoading(true);
      setTraceModalVisible(true);
      const data = await api.traceBatch(traceBatchNo.trim().toUpperCase());
      setTraceResult(data);
    } catch (err: any) {
      alert(err.message || 'Trace lookup failed');
      setTraceModalVisible(false);
    } finally {
      setTraceLoading(false);
    }
  };

  const handleOpenBMR = async (batchId: string) => {
    try {
      setLoadingBmr(true);
      const report = await api.getBMRReport(batchId);
      setBmrReport(report);
      setBmrModalVisible(true);
    } catch (err: any) {
      console.error('Failed to load BMR Report:', err);
      Alert.alert('Error', err.message || 'Failed to retrieve batch manufacturing record.');
    } finally {
      setLoadingBmr(false);
    }
  };

  const handlePrintBMR = () => {
    if (Platform.OS === 'web') {
      window.print();
    } else {
      Alert.alert('Print Report', 'BMR Report formatted. Connection to wireless label/receipt printer active!');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return colors.primary;
      case 'qc_hold': return colors.warning;
      case 'completed': return colors.success;
      case 'cancelled': return colors.danger;
      default: return colors.text.muted;
    }
  };
  const matchingBom = boms.find(b => {
    const bPid = b.productId && typeof b.productId === 'object' ? b.productId._id : b.productId;
    return bPid === prodProductId;
  });

  const plannedVal = Number(prodPlannedQty);
  let previewIngredients: { name: string; qtyNeeded: number; unit: string; available: number }[] = [];
  if (matchingBom && !isNaN(plannedVal) && plannedVal > 0) {
    const scale = plannedVal / matchingBom.batchYieldSize;
    previewIngredients = matchingBom.ingredients.map(ing => {
      const ingId = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId._id : ing.rawMaterialId;
      const ingName = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.name : 'Unknown Raw Material';
      const ingUnit = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.unit : 'kg';
      
      const qtyNeeded = ing.qtyRequired * scale;
      
      const matchingMaterial = materials.find(m => m._id === ingId);
      const available = matchingMaterial ? (matchingMaterial.stockLevel || 0) : 0;
      
      return {
        name: ingName,
        qtyNeeded,
        unit: ingUnit,
        available
      };
    });
  }
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Manufacturing Hub...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Sub tabs Row */}
      <View style={styles.tabRow}>
        {[
          { id: 'materials', label: 'Raw Materials & Batches', icon: 'leaf-outline' },
          { id: 'bom', label: 'Formulations (BOM)', icon: 'flask-outline' },
          { id: 'batches', label: 'Production Runs (BMR)', icon: 'hammer-outline' },
          { id: 'scheduler', label: 'Production Timeline', icon: 'calendar-outline' },
          { id: 'analytics', label: 'Manufacturing Analytics', icon: 'analytics-outline' },
        ].map(t => (
          <TouchableOpacity
            key={t.id}
            style={[styles.tabButton, activeTab === t.id && { borderBottomColor: colors.primary, borderBottomWidth: 3 }]}
            onPress={() => setActiveTab(t.id as any)}
          >
            <Ionicons name={t.icon as any} size={15} color={activeTab === t.id ? colors.primary : colors.text.secondary} />
            <Text style={[styles.tabText, activeTab === t.id && { color: colors.primary, fontWeight: '700' }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Trace Lookup Bar */}
      <View style={[styles.card, { margin: Spacing.lg, marginBottom: 0, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
        <Ionicons name="git-network-outline" size={16} color={colors.text.secondary} />
        <TextInput
          style={{ flex: 1, fontSize: 13, color: colors.text.primary, paddingVertical: 6 }}
          placeholder="Trace batch no. (raw or finished)..."
          placeholderTextColor={colors.text.muted}
          value={traceBatchNo}
          onChangeText={setTraceBatchNo}
          onSubmitEditing={handleTrace}
          returnKeyType="search"
        />
        <TouchableOpacity style={[styles.primaryBtn, { opacity: traceBatchNo.trim() ? 1 : 0.5 }]} disabled={!traceBatchNo.trim()} onPress={handleTrace}>
          <Ionicons name="search-outline" size={14} color="#fff" />
          <Text style={styles.primaryBtnText}>Trace</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* ======================================================== */}
        {/* TAB 1: RAW MATERIALS */}
        {/* ======================================================== */}
        {activeTab === 'materials' && (
          <View style={styles.tabContent}>
            {/* Header / Buttons */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Ingredients Directory</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.outlineBtn} onPress={() => setMaterialModalVisible(true)}>
                  <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                  <Text style={styles.outlineBtnText}>Define Herb/Material</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => setInwardModalVisible(true)}>
                  <Ionicons name="log-in-outline" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Inward Stock Batch</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Expiry Alerts Warning Card */}
            {expiryAlerts.length > 0 && (
              <View style={[styles.card, { borderColor: colors.danger, backgroundColor: colors.danger + '08' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="warning" size={18} color={colors.danger} />
                  <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '800' }}>
                    Near Expiry Warning ({expiryAlerts.length} Batches)
                  </Text>
                </View>
                {expiryAlerts.map(alert => (
                  <View key={alert._id} style={{ paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.text.primary }}>
                      🌿 {alert.rawMaterialId && typeof alert.rawMaterialId === 'object' ? alert.rawMaterialId.name : 'Unknown Material'}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                      Batch: <Text style={{ fontWeight: '700' }}>{alert.batchNo}</Text> • Stock: {alert.qty.toFixed(2)} {alert.rawMaterialId && typeof alert.rawMaterialId === 'object' ? alert.rawMaterialId.unit : ''} • Expires on: <Text style={{ color: colors.danger, fontWeight: '700' }}>{new Date(alert.expiryDate!).toLocaleDateString()}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* General Stock Summary Card */}
            <View style={styles.card}>
              <Text style={styles.cardSubTitle}>Raw Stocks & Reorder Status</Text>
              {materials.map(rm => {
                const lowStock = (rm.stockLevel || 0) < rm.minReorder;
                return (
                  <View key={rm._id} style={styles.materialRow}>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.rmName}>{rm.name}</Text>
                      <Text style={styles.rmSku}>{rm.sku}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={[styles.rmStock, lowStock && { color: colors.danger, fontWeight: '800' }]}>
                        {rm.stockLevel?.toFixed(2) || '0.00'} {rm.unit}
                      </Text>
                      <Text style={styles.rmMin}>Min: {rm.minReorder} {rm.unit}</Text>
                    </View>
                    <TouchableOpacity style={{ width: 30, alignItems: 'center' }} onPress={() => handleOpenGenealogy('material', rm._id)}>
                      <Ionicons name="git-network-outline" size={16} color={colors.text.muted} />
                    </TouchableOpacity>
                  </View>
                );
              })}
              {materials.length === 0 && <Text style={styles.emptyText}>No raw material definitions added yet.</Text>}
            </View>

            {/* Live Inward Batches List */}
            <View style={[styles.card, { marginTop: 16 }]}>
              <Text style={styles.cardTitle}>Inward Batches currently in Stock</Text>
              {entries.map(e => (
                <View key={e._id} style={styles.batchRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.batchRmName}>
                      {e.rawMaterialId && typeof e.rawMaterialId === 'object' ? e.rawMaterialId.name : 'Unknown Raw Material'}
                    </Text>
                    <Text style={styles.batchNoLabel}>Batch: {e.batchNo} • Vendor: {e.vendorName || 'Direct'}</Text>
                    {e.expiryDate && (
                      <Text style={styles.batchExpLabel}>Exp: {new Date(e.expiryDate).toLocaleDateString()}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.batchStock}>
                      {e.qty.toFixed(2)} {e.rawMaterialId && typeof e.rawMaterialId === 'object' ? e.rawMaterialId.unit : ''}
                    </Text>
                    <Text style={styles.batchRate}>₹{e.purchaseRate}/unit</Text>
                  </View>
                  <TouchableOpacity style={styles.voidBtn} onPress={() => handleVoidInward(e._id)}>
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              {entries.length === 0 && <Text style={styles.emptyText}>No active stock batches. Inward ingredients to start.</Text>}
            </View>
          </View>
        )}

        {/* ======================================================== */}
        {/* TAB 2: BILL OF MATERIALS */}
        {/* ======================================================== */}
        {activeTab === 'bom' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Product Recipes & Formulations</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setBomModalVisible(true)}>
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Configure Recipe</Text>
              </TouchableOpacity>
            </View>

            {boms.map(bom => (
              <View key={bom._id} style={[styles.card, { marginBottom: 12 }]}>
                <View style={styles.recipeHeader}>
                  <View>
                    <Text style={styles.recipeTitle}>
                      {bom.productId && typeof bom.productId === 'object' ? bom.productId.name : 'Finished Product'}
                    </Text>
                    <Text style={styles.recipeYield}>
                      Standard Yield Output size: {bom.batchYieldSize} units ({bom.productId && typeof bom.productId === 'object' ? bom.productId.size : ''})
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.deleteRecipeBtn} onPress={async () => {
                    const confirmed = Platform.OS === 'web'
                      ? window.confirm('Are you sure you want to delete this recipe?')
                      : await new Promise(resolve => {
                          Alert.alert('Delete Recipe', 'Delete this recipe?', [
                            { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
                            { text: 'Delete', onPress: () => resolve(true), style: 'destructive' }
                          ]);
                        });
                    if (confirmed) {
                      try {
                        await api.deleteBOM(bom._id);
                        loadData();
                      } catch (err: any) {
                        alert(err.message || 'Failed to delete recipe');
                      }
                    }
                  }}>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  </TouchableOpacity>
                </View>

                <View style={styles.ingredientsList}>
                  <Text style={styles.ingredientsHeaderLabel}>Required Ingredients Consumed:</Text>
                  {bom.ingredients.map((ing, index) => (
                    <View key={index} style={styles.ingredientItem}>
                      <Text style={styles.ingredientName}>
                        🌿 {ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.name : 'Unknown Material'}
                      </Text>
                      <Text style={styles.ingredientQty}>
                        {ing.qtyRequired} {ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.unit : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
            {boms.length === 0 && <Text style={styles.emptyText}>No recipe formulations built yet.</Text>}
          </View>
        )}

        {/* ======================================================== */}
        {/* TAB 3: BATCH PRODUCTION */}
        {/* ======================================================== */}
        {activeTab === 'batches' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Active & Finished Production Runs</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setProductionModalVisible(true)}>
                <Ionicons name="play-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Start Production Batch</Text>
              </TouchableOpacity>
            </View>

            {batches.map(batch => {
              const isFinished = batch.status === 'completed';
              const isCancelled = batch.status === 'cancelled';
              const isInProgress = batch.status === 'in_progress';

              const productPrice = batch.productId && typeof batch.productId === 'object' ? batch.productId.price || 0 : 0;
              const hasCosting = batch.rawMaterialCost !== undefined;
              const hasUnitCost = isFinished && batch.unitProductionCost !== undefined && batch.unitProductionCost > 0;
              const grossMargin = hasUnitCost && productPrice > 0 && batch.unitProductionCost !== undefined
                ? Math.max(0, ((productPrice - batch.unitProductionCost) / productPrice) * 100)
                : 0;

              return (
                <View key={batch._id} style={[styles.card, { marginBottom: 12 }]}>
                  <View style={styles.batchCardHeader}>
                    <View>
                      <Text style={styles.batchTitle}>
                        {batch.productId && typeof batch.productId === 'object' ? batch.productId.name : 'Product'}
                      </Text>
                      <Text style={styles.batchSubNo}>Batch No: {batch.batchNo}</Text>
                    </View>
                    <View style={[styles.statusBadge, { borderColor: getStatusColor(batch.status), backgroundColor: getStatusColor(batch.status) + '10' }]}>
                      <Text style={[styles.statusBadgeText, { color: getStatusColor(batch.status) }]}>
                        {batch.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.batchMetaGrid}>
                    <Text style={styles.metaLabel}>Planned Qty: <Text style={styles.metaVal}>{batch.plannedQty} units</Text></Text>
                    {isFinished && (
                      <Text style={styles.metaLabel}>Actual Yield: <Text style={[styles.metaVal, { color: colors.success }]}>{batch.actualYieldQty} units</Text></Text>
                    )}
                    {batch.startDate && (
                      <Text style={styles.metaLabel}>Started: <Text style={styles.metaVal}>{new Date(batch.startDate).toLocaleDateString()}</Text></Text>
                    )}
                    {batch.endDate && (
                      <Text style={styles.metaLabel}>Ended: <Text style={styles.metaVal}>{new Date(batch.endDate).toLocaleDateString()}</Text></Text>
                    )}
                    {batch.rawMaterialCost !== undefined && (
                      <Text style={styles.metaLabel}>Ingredient Cost: <Text style={[styles.metaVal, { color: colors.warning }]}>₹{batch.rawMaterialCost.toFixed(2)}</Text></Text>
                    )}
                    {batch.unitProductionCost !== undefined && batch.unitProductionCost > 0 && (
                      <Text style={styles.metaLabel}>Unit Cost: <Text style={styles.metaVal}>₹{batch.unitProductionCost.toFixed(2)}</Text></Text>
                    )}
                    {batch.unitProductionCost !== undefined && batch.unitProductionCost > 0 && productPrice > 0 && (
                      <Text style={styles.metaLabel}>Gross Margin: <Text style={[styles.metaVal, { color: grossMargin > 40 ? colors.success : colors.warning }]}>{grossMargin.toFixed(0)}% (MSRP ₹{productPrice})</Text></Text>
                    )}
                  </View>

                  {/* Stage Stepper */}
                  {batch.stages && batch.stages.length > 0 && (
                    <View style={styles.stageStepperContainer}>
                      <Text style={styles.ingredientsHeaderLabel}>Manufacturing Stages:</Text>
                      <View style={styles.stageStepperRow}>
                        {batch.stages.map((stage, sIdx) => {
                          const stageColors: Record<string, string> = {
                            pending: colors.text.muted,
                            in_progress: colors.primary,
                            completed: colors.success,
                            skipped: colors.warning,
                          };
                          const isActive = stage.status === 'in_progress';
                          const isDone = stage.status === 'completed' || stage.status === 'skipped';
                          const isInProgress = batch.status === 'in_progress' && stage.status === 'in_progress';
                          const isCancelled = batch.status === 'cancelled';
                          return (
                            <TouchableOpacity
                              key={sIdx}
                              style={styles.stageStep}
                              disabled={!isInProgress || isCancelled}
                              onPress={() => {
                                if (isInProgress) {
                                  handleAdvanceStage(batch._id, sIdx);
                                }
                              }}
                            >
                              <View style={[
                                styles.stageDot,
                                { backgroundColor: isDone ? stageColors[stage.status] : isActive ? colors.primary : colors.border }
                              ]}>
                                {isDone ? (
                                  <Ionicons name="checkmark" size={10} color="#fff" />
                                ) : isActive ? (
                                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
                                ) : null}
                              </View>
                              <Text style={[
                                styles.stageLabel,
                                { color: isDone || isActive ? stageColors[stage.status] : colors.text.muted }
                              ]} numberOfLines={2}>
                                {stage.name}
                              </Text>
                              {isInProgress && (
                                <TouchableOpacity
                                  style={styles.stageSkipBtn}
                                  onPress={() => handleSkipStage(batch._id, sIdx)}
                                >
                                  <Text style={styles.stageSkipText}>skip</Text>
                                </TouchableOpacity>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Waste / Variance Info for Completed Batches */}
                  {isFinished && batch.wasteQty > 0 && (
                    <View style={[styles.wasteBox, { marginBottom: 8 }]}>
                      <Ionicons name="trending-down-outline" size={13} color={colors.warning} />
                      <Text style={styles.wasteText}>
                        Waste: {batch.wasteQty} units ({batch.variancePercent > 0 ? '+' : ''}{batch.variancePercent}% variance)
                        {batch.wasteReason ? ` — ${batch.wasteReason}` : ''}
                      </Text>
                    </View>
                  )}

                  {/* Consumed Ingredients Info */}
                  <View style={styles.batchIngredientsConsumedSection}>
                    <Text style={styles.ingredientsHeaderLabel}>Raw Material Batches Consumed:</Text>
                    {batch.ingredientsConsumed.map((ing, idx) => (
                      <Text key={idx} style={styles.consumedIngItem}>
                        • {ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.name : 'Raw Material'} (Batch: {ing.batchNo}) — {ing.qtyConsumed.toFixed(2)} {ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.unit : ''}
                      </Text>
                    ))}
                  </View>

                  {isFinished && batch.qcNotes && (
                    <View style={styles.qcBox}>
                      <Text style={styles.qcBoxTitle}>QC Inspector: {batch.qcPassedBy}</Text>
                      <Text style={styles.qcBoxText}>Notes: {batch.qcNotes}</Text>
                    </View>
                  )}

                  {/* Action Controls */}
                  {isInProgress && (
                    <View style={styles.batchActionsRow}>
                      <TouchableOpacity style={styles.cancelBatchBtn} onPress={() => handleCancelProduction(batch._id)}>
                        <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
                        <Text style={styles.cancelBatchBtnText}>Cancel & Revert Stock</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.completeBatchBtn} onPress={() => {
                        setSelectedBatchRun(batch);
                        setQcYieldQty(batch.plannedQty.toString());
                        setQcWasteQty('');
                        setQcWasteReason('');
                        setQcPassedBy('');
                        setQcNotes('');
                        setQcModalVisible(true);
                      }}>
                        <Ionicons name="checkmark-done-circle-outline" size={15} color="#fff" />
                        <Text style={styles.completeBatchBtnText}>QC Sign-off & Inward Stock</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {isFinished && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      <TouchableOpacity 
                        style={[styles.outlineBtn, { paddingVertical: 6, paddingHorizontal: 12 }]} 
                        onPress={() => handleOpenBMR(batch._id)}
                      >
                        <Ionicons name="document-text-outline" size={15} color={colors.primary} />
                        <Text style={styles.outlineBtnText}>BMR Report</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={[styles.outlineBtn, { paddingVertical: 6, paddingHorizontal: 12, borderColor: colors.text.secondary }]} 
                        onPress={() => handleOpenGenealogy('batch', batch._id)}
                      >
                        <Ionicons name="git-network-outline" size={15} color={colors.text.secondary} />
                        <Text style={[styles.outlineBtnText, { color: colors.text.secondary }]}>Genealogy</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {!isFinished && !isCancelled && (
                    <TouchableOpacity 
                      style={[styles.outlineBtn, { marginTop: 12, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start', borderColor: colors.text.secondary }]} 
                      onPress={() => handleOpenGenealogy('batch', batch._id)}
                    >
                      <Ionicons name="git-network-outline" size={15} color={colors.text.secondary} />
                      <Text style={[styles.outlineBtnText, { color: colors.text.secondary }]}>Genealogy</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
            {batches.length === 0 && <Text style={styles.emptyText}>No batch productions logged. Start a batch to track BMR.</Text>}
          </View>
        )}

        {/* ======================================================== */}
        {/* TAB 4: TIMELINE / SCHEDULER */}
        {/* ======================================================== */}
        {activeTab === 'scheduler' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Visual Batch Timeline</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setProductionModalVisible(true)}>
                <Ionicons name="play-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Launch New Batch</Text>
              </TouchableOpacity>
            </View>

            {mfgAnalytics?.timeline && mfgAnalytics.timeline.length > 0 ? (
              <View style={{ gap: 12 }}>
                {mfgAnalytics.timeline.map((run: any) => {
                  const start = new Date(run.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                  const end = run.endDate ? new Date(run.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'In Progress';
                  const statusColor = getStatusColor(run.status);
                  return (
                    <View key={run.id} style={[styles.card, { borderLeftColor: statusColor, borderLeftWidth: 5, padding: 16 }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary }}>Batch: {run.batchNo}</Text>
                          <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>{run.productName}</Text>
                        </View>
                        <View style={[styles.statusBadge, { borderColor: statusColor, backgroundColor: statusColor + '10', alignSelf: 'center' }]}>
                          <Text style={{ color: statusColor, fontSize: 10, fontWeight: '800' }}>{run.status.toUpperCase()}</Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 8, padding: 12, backgroundColor: colors.bg.secondary, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                        <View>
                          <Text style={{ fontSize: 10, color: colors.text.secondary, fontWeight: '700' }}>PLANNED QTY</Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginTop: 2 }}>{run.plannedQty} units</Text>
                        </View>
                        <View>
                          <Text style={{ fontSize: 10, color: colors.text.secondary, fontWeight: '700' }}>ACTUAL YIELD</Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginTop: 2 }}>{run.actualYieldQty || '-'} units</Text>
                        </View>
                        <View>
                          <Text style={{ fontSize: 10, color: colors.text.secondary, fontWeight: '700' }}>TIMEFRAME</Text>
                          <Text style={{ fontSize: 11, color: colors.text.primary, marginTop: 2 }}>{start} ➔ {end}</Text>
                        </View>
                      </View>

                      {run.status === 'completed' && (
                        <TouchableOpacity 
                          style={[styles.outlineBtn, { marginTop: 4, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12 }]}
                          onPress={() => handleOpenBMR(run.id)}
                        >
                          <Ionicons name="document-text-outline" size={14} color={colors.primary} />
                          <Text style={[styles.outlineBtnText, { fontSize: 12 }]}>Generate BMR Report</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={48} color={colors.text.secondary} />
                <Text style={styles.emptyText}>No active or completed production timeline found.</Text>
              </View>
            )}
          </View>
        )}

        {/* ======================================================== */}
        {/* TAB 5: MANUFACTURING ANALYTICS */}
        {/* ======================================================== */}
        {activeTab === 'analytics' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionTitle}>Facility Financial & Asset Valuation</Text>
            
            <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 16, marginVertical: 16 }}>
              {/* Raw Materials Valuation */}
              <View style={[styles.card, { flex: 1, padding: 16 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.success + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="leaf-outline" size={20} color={colors.success} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 11, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}>Raw Stock Valuation</Text>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text.primary, marginTop: 4 }}>
                      ₹{(mfgAnalytics?.netRawMaterialValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Finished Goods Valuation */}
              <View style={[styles.card, { flex: 1, padding: 16 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="cube-outline" size={20} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 11, color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}>Finished Goods Value</Text>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text.primary, marginTop: 4 }}>
                      ₹{(mfgAnalytics?.netFinishedGoodsValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Facility Total Value */}
              <View style={[styles.card, { flex: 1, padding: 16, backgroundColor: colors.primary + '05' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + '25', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="wallet-outline" size={20} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Facility Assets</Text>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary, marginTop: 4 }}>
                      ₹{((mfgAnalytics?.netRawMaterialValue || 0) + (mfgAnalytics?.netFinishedGoodsValue || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Yield Efficiencies */}
            <View style={[styles.card, { padding: 16 }]}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary, marginBottom: 16 }}>Yield Performance & Recipe Efficiency</Text>
              
              {mfgAnalytics?.yieldPerformance && mfgAnalytics.yieldPerformance.length > 0 ? (
                <View style={{ gap: 16 }}>
                  {mfgAnalytics.yieldPerformance.map((item: any, idx: number) => {
                    const isLow = item.efficiency < 95;
                    const barColor = isLow ? colors.warning : colors.success;
                    return (
                      <View key={idx}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }}>Batch: {item.batchNo} · {item.productName}</Text>
                            <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>Yielded {item.actualYieldQty} / {item.plannedQty} planned units</Text>
                          </View>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: barColor }}>{item.efficiency}%</Text>
                        </View>
                        {/* Progress bar */}
                        <View style={{ height: 8, width: '100%', backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${Math.min(100, item.efficiency)}%`, backgroundColor: barColor }} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={{ alignItems: 'center', padding: 24 }}>
                  <Ionicons name="bar-chart-outline" size={32} color={colors.text.secondary} />
                  <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 8 }}>No completed yield batches to analyze.</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ======================================================== */}
      {/* MODAL 1: ADD RAW MATERIAL DEFINITION */}
      {/* ======================================================== */}
      <Modal visible={materialModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setMaterialModalVisible(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Define New Raw Material</Text>
              <TouchableOpacity onPress={() => setMaterialModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            {rmError ? <Text style={styles.modalError}>{rmError}</Text> : null}
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Ingredient Name *</Text>
              <TextInput style={styles.input} placeholder="e.g. Purified Guggulu" placeholderTextColor={colors.text.muted} value={rmName} onChangeText={setRmName} />
              
              <Text style={styles.inputLabel}>SKU / Code *</Text>
              <TextInput style={styles.input} placeholder="e.g. RAW-GUG-PUR" placeholderTextColor={colors.text.muted} value={rmSku} onChangeText={setRmSku} />

              <Text style={styles.inputLabel}>Measurement Unit *</Text>
              <TextInput style={styles.input} placeholder="e.g. kg, liters, g, units" placeholderTextColor={colors.text.muted} value={rmUnit} onChangeText={setRmUnit} />

              <Text style={styles.inputLabel}>Min Reorder Stock level</Text>
              <TextInput style={styles.input} placeholder="e.g. 10" placeholderTextColor={colors.text.muted} value={rmMinReorder} onChangeText={setRmMinReorder} keyboardType="numeric" />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setMaterialModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveMaterial}>
                <Text style={styles.submitBtnText}>Define Material</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 2: INWARD STOCK BATCH */}
      {/* ======================================================== */}
      <Modal visible={inwardModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setInwardModalVisible(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Inward Raw Material Stock</Text>
              <TouchableOpacity onPress={() => setInwardModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            {inwardError ? <Text style={styles.modalError}>{inwardError}</Text> : null}
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Select Raw Material *</Text>
              <View style={styles.pickerWrapper}>
                {Platform.OS === 'web' ? (
                  <select
                    value={selectedRmId}
                    onChange={(e: any) => setSelectedRmId(e.target.value)}
                    style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                  >
                    <option value="">-- Choose Ingredient --</option>
                    {materials.map(rm => (
                      <option key={rm._id} value={rm._id}>{rm.name} ({rm.sku})</option>
                    ))}
                  </select>
                ) : (
                  <TextInput style={styles.input} placeholder="Raw Material ID (Web only picker)" value={selectedRmId} onChangeText={setSelectedRmId} />
                )}
              </View>

              <Text style={styles.inputLabel}>Vendor Batch Number *</Text>
              <TextInput style={styles.input} placeholder="e.g. B-SUG-102" placeholderTextColor={colors.text.muted} value={inwardBatchNo} onChangeText={setInwardBatchNo} />

              <Text style={styles.inputLabel}>Inward Quantity *</Text>
              <TextInput style={styles.input} placeholder="e.g. 50" placeholderTextColor={colors.text.muted} value={inwardQty} onChangeText={setInwardQty} keyboardType="numeric" />

              <Text style={styles.inputLabel}>Purchase Rate per unit (₹) *</Text>
              <TextInput style={styles.input} placeholder="e.g. 240" placeholderTextColor={colors.text.muted} value={inwardRate} onChangeText={setInwardRate} keyboardType="numeric" />

              <Text style={styles.inputLabel}>Select Vendor (Optional)</Text>
              <View style={styles.pickerWrapper}>
                {Platform.OS === 'web' ? (
                  <select
                    value={selectedVendorId}
                    onChange={(e: any) => setSelectedVendorId(e.target.value)}
                    style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                  >
                    <option value="">-- Choose Vendor --</option>
                    {vendors.map(v => (
                      <option key={v._id} value={v._id}>{v.company || v.name}</option>
                    ))}
                  </select>
                ) : (
                  <TextInput style={styles.input} placeholder="Vendor ID" value={selectedVendorId} onChangeText={setSelectedVendorId} />
                )}
              </View>

              <Text style={styles.inputLabel}>Expiry Date (Optional)</Text>
              <TextInput style={styles.input} placeholder="e.g. YYYY-MM-DD" placeholderTextColor={colors.text.muted} value={inwardExpiryDate} onChangeText={setInwardExpiryDate} />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setInwardModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleInwardStock}>
                <Text style={styles.submitBtnText}>Inward Stock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 3: CONFIGURE RECIPE / BOM */}
      {/* ======================================================== */}
      <Modal visible={bomModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setBomModalVisible(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Configure Bill of Materials</Text>
              <TouchableOpacity onPress={() => setBomModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            {bomError ? <Text style={styles.modalError}>{bomError}</Text> : null}
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Finished Output Product *</Text>
              <View style={styles.pickerWrapper}>
                {Platform.OS === 'web' ? (
                  <select
                    value={selectedProdId}
                    onChange={(e: any) => setSelectedProdId(e.target.value)}
                    style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                  >
                    <option value="">-- Choose Product --</option>
                    {products.map(p => (
                      <option key={p._id} value={p._id}>{p.name} ({p.size || 'Standard'})</option>
                    ))}
                  </select>
                ) : (
                  <TextInput style={styles.input} placeholder="Finished Product ID" value={selectedProdId} onChangeText={setSelectedProdId} />
                )}
              </View>

              <Text style={styles.inputLabel}>Standard Batch Yield Output Size *</Text>
              <TextInput style={styles.input} placeholder="Quantity of bottles/caps standard run yields (e.g. 100)" placeholderTextColor={colors.text.muted} value={bomYield} onChangeText={setBomYield} keyboardType="numeric" />

              <Text style={styles.formIngredientsTitle}>Formulation Recipe (Ingredients consumed):</Text>
              {bomIngredients.map((item, idx) => (
                <View key={idx} style={styles.bomIngredientInputRow}>
                  <View style={[styles.pickerWrapper, { flex: 2, marginBottom: 0 }]}>
                    {Platform.OS === 'web' ? (
                      <select
                        value={item.rawMaterialId}
                        onChange={(e: any) => handleIngredientChange(idx, 'rawMaterialId', e.target.value)}
                        style={{ flex: 1, padding: 8, fontSize: 11, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                      >
                        <option value="">-- Select Material --</option>
                        {materials.map(rm => (
                          <option key={rm._id} value={rm._id}>{rm.name} ({rm.sku})</option>
                        ))}
                      </select>
                    ) : (
                      <TextInput style={styles.input} placeholder="RM ID" value={item.rawMaterialId} onChangeText={(val) => handleIngredientChange(idx, 'rawMaterialId', val)} />
                    )}
                  </View>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="Qty needed"
                    placeholderTextColor={colors.text.muted}
                    value={item.qtyRequired}
                    onChangeText={(val) => handleIngredientChange(idx, 'qtyRequired', val)}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity style={styles.removeRowBtn} onPress={() => handleRemoveIngredientRow(idx)}>
                    <Ionicons name="remove-circle" size={20} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={styles.addIngredientRowBtn} onPress={handleAddIngredientRow}>
                <Ionicons name="add" size={16} color={colors.primary} />
                <Text style={styles.addIngredientRowBtnText}>Add Ingredient</Text>
              </TouchableOpacity>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setBomModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveBOM}>
                <Text style={styles.submitBtnText}>Save Recipe</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 4: START PRODUCTION BATCH */}
      {/* ======================================================== */}
      <Modal visible={productionModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setProductionModalVisible(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Launch Production Batch</Text>
              <TouchableOpacity onPress={() => setProductionModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            {prodError ? <Text style={styles.modalError}>{prodError}</Text> : null}
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Select Finished Goods Product *</Text>
              <View style={styles.pickerWrapper}>
                {Platform.OS === 'web' ? (
                  <select
                    value={prodProductId}
                    onChange={(e: any) => setProdProductId(e.target.value)}
                    style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                  >
                    <option value="">-- Choose Product --</option>
                    {products.map(p => (
                      <option key={p._id} value={p._id}>{p.name} ({p.size || 'Standard'})</option>
                    ))}
                  </select>
                ) : (
                  <TextInput style={styles.input} placeholder="Product ID" value={prodProductId} onChangeText={setProdProductId} />
                )}
              </View>

              <Text style={styles.inputLabel}>Planned Yield Quantity (units) *</Text>
              <TextInput style={styles.input} placeholder="Planned output units (e.g. 500)" placeholderTextColor={colors.text.muted} value={prodPlannedQty} onChangeText={setProdPlannedQty} keyboardType="numeric" />

              <Text style={styles.inputLabel}>Finished Goods Production Batch No. *</Text>
              <TextInput style={styles.input} placeholder="e.g. ABH-JUL26-01" placeholderTextColor={colors.text.muted} value={prodBatchNo} onChangeText={setProdBatchNo} />
              
              <Text style={styles.warningDisclaimer}>
                ⚠️ Starting this batch will automatically deduct the corresponding raw material quantities from active stock batches (FIFO). If stocks are insufficient, the launch will be blocked.
              </Text>

              {/* Recipe preview checklist */}
              {previewIngredients.length > 0 && (
                <View style={{ marginTop: 16, padding: 12, backgroundColor: colors.bg.secondary, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>
                    📋 Auto-Deduction Ingredients Preview:
                  </Text>
                  {previewIngredients.map((item, idx) => {
                    const isShortage = item.available < item.qtyNeeded;
                    return (
                      <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: idx === previewIngredients.length - 1 ? 0 : 0.5, borderBottomColor: colors.border }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ fontSize: 12, color: colors.text.primary }}>🌿 {item.name}</Text>
                          <Text style={{ fontSize: 10.5, color: isShortage ? colors.danger : colors.text.secondary, marginTop: 2 }}>
                            Available: {item.available.toFixed(2)} {item.unit}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: isShortage ? colors.danger : colors.text.primary }}>
                            {item.qtyNeeded.toFixed(2)} {item.unit}
                          </Text>
                          {isShortage && (
                            <View style={{ backgroundColor: colors.danger + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 }}>
                              <Text style={{ fontSize: 9, color: colors.danger, fontWeight: '800' }}>SHORTAGE</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setProductionModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleStartProduction}>
                <Text style={styles.submitBtnText}>Launch Batch</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 5: QC SIGNOFF & COMPLETION */}
      {/* ======================================================== */}
      <Modal visible={qcModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setQcModalVisible(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Quality Control Sign-Off</Text>
              <TouchableOpacity onPress={() => setQcModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            {qcError ? <Text style={styles.modalError}>{qcError}</Text> : null}
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Actual Output Yield Size (units) *</Text>
              <TextInput style={styles.input} placeholder="e.g. 498" placeholderTextColor={colors.text.muted} value={qcYieldQty} onChangeText={setQcYieldQty} keyboardType="numeric" />

              <Text style={styles.inputLabel}>Packing (pcs per box)</Text>
              <TextInput style={styles.input} placeholder="e.g. 10" placeholderTextColor={colors.text.muted} value={qcPacking} onChangeText={setQcPacking} keyboardType="numeric" />

              <Text style={styles.inputLabel}>Waste / Shrinkage Quantity</Text>
              <TextInput style={styles.input} placeholder="e.g. 2 (leave empty to auto-calculate)" placeholderTextColor={colors.text.muted} value={qcWasteQty} onChangeText={setQcWasteQty} keyboardType="numeric" />

              <Text style={styles.inputLabel}>Waste / Variance Reason</Text>
              <TextInput style={styles.input} placeholder="e.g. Drying loss, spillage, QC rejects" placeholderTextColor={colors.text.muted} value={qcWasteReason} onChangeText={setQcWasteReason} />

              <Text style={styles.inputLabel}>QC Inspector Name *</Text>
              <TextInput style={styles.input} placeholder="e.g. Dr. P. K. Sharma" placeholderTextColor={colors.text.muted} value={qcPassedBy} onChangeText={setQcPassedBy} />

              <Text style={styles.inputLabel}>Quality Check Notes / Lab Remarks</Text>
              <TextInput
                style={[styles.input, { height: 80, paddingVertical: 8 }]}
                placeholder="Enter quality verification notes..."
                placeholderTextColor={colors.text.muted}
                value={qcNotes}
                onChangeText={setQcNotes}
                multiline
                numberOfLines={3}
              />
              
              <Text style={styles.warningDisclaimer}>
                ✅ Submitting this approval will officially complete the batch, close the manufacturing run, and add the actual yield stock to the Finished Goods Warehouse.
              </Text>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setQcModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleCompleteProduction}>
                <Text style={styles.submitBtnText}>Approve & Stock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 6: PRINTABLE BMR COMPLIANCE REPORT */}
      {/* ======================================================== */}
      <Modal visible={bmrModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setBmrModalVisible(false)} />
          <View style={[styles.modalContainer, { maxWidth: 800, width: '90%', height: '85%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Batch Manufacturing Record (BMR)</Text>
                <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>GMP Quality Compliance & Costing Audit</Text>
              </View>
              <TouchableOpacity onPress={() => setBmrModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {loadingBmr ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : bmrReport ? (
              <ScrollView style={[styles.modalForm, { padding: 16 }]} contentContainerStyle={{ gap: 16 }}>
                
                {/* 1. Header branding for printing */}
                <View style={{ alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.primary, paddingBottom: 12, marginBottom: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 }}>{FIRM_DETAILS.name}</Text>
                  <Text style={{ fontSize: 10, color: colors.text.secondary, marginTop: 2 }}>{FIRM_DETAILS.address}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary, marginTop: 8, letterSpacing: 0.5 }}>OFFICIAL BATCH RECORD SUMMARY</Text>
                </View>

                {/* 2. Batch Identification Metadata */}
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                  <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section I: Batch Identification</Text>
                  </View>
                  <View style={{ padding: 12, gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.text.secondary }}>Batch Reference No:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{bmrReport.batchNo}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.text.secondary }}>Product Name / Sku:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{bmrReport.productName} ({bmrReport.productSku})</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.text.secondary }}>Planned Run Qty:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{bmrReport.plannedQty} bottles</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.text.secondary }}>Actual Yield Output:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.success }}>{bmrReport.actualYieldQty} bottles</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.text.secondary }}>Manufacturing Timeline:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.primary }}>
                        {new Date(bmrReport.startDate).toLocaleDateString('en-IN')} ➔ {bmrReport.endDate ? new Date(bmrReport.endDate).toLocaleDateString('en-IN') : 'Ongoing'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 3. Batch Costing & Profit Margins Analysis */}
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                  <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section II: Financial Audit & Production Costing</Text>
                  </View>
                  <View style={{ padding: 12, gap: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.text.secondary }}>Total Raw Material Input Cost:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>₹{(bmrReport.rawMaterialCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.text.secondary }}>Calculated Production Unit Cost:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>₹{(bmrReport.unitProductionCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} / unit</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.text.secondary }}>Product MSRP Retail Price:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>₹{(bmrReport.productPrice || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} / unit</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>Gross Manufacturing Profit Margin:</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.success }}>
                        {bmrReport.productPrice > 0 && bmrReport.unitProductionCost > 0
                          ? (((bmrReport.productPrice - bmrReport.unitProductionCost) / bmrReport.productPrice) * 100).toFixed(1)
                          : 0}%
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 4. Consumed Ingredients Details List */}
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                  <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section III: Consumed Raw Ingredients Details</Text>
                  </View>
                  <View style={{ padding: 8 }}>
                    <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6 }}>
                      <Text style={{ flex: 2, fontSize: 11, fontWeight: '700', color: colors.text.secondary }}>Ingredient</Text>
                      <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '700', color: colors.text.secondary }}>Batch No</Text>
                      <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Qty</Text>
                      <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Rate</Text>
                      <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Total Cost</Text>
                    </View>
                    {bmrReport.ingredients.map((ing: any, idx: number) => (
                      <View key={idx} style={{ flexDirection: 'row', paddingVertical: 4 }}>
                        <Text style={{ flex: 2, fontSize: 11, color: colors.text.primary }} numberOfLines={1}>{ing.name}</Text>
                        <Text style={{ flex: 1.5, fontSize: 11, color: colors.text.primary }}>{ing.batchNo}</Text>
                        <Text style={{ flex: 1.2, fontSize: 11, color: colors.text.primary, textAlign: 'right' }}>{ing.qtyConsumed} {ing.unit}</Text>
                        <Text style={{ flex: 1.2, fontSize: 11, color: colors.text.primary, textAlign: 'right' }}>₹{ing.purchaseRate}</Text>
                        <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '600', color: colors.text.primary, textAlign: 'right' }}>₹{ing.itemCost.toFixed(2)}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* 5. QC Inspection Clearance Certification */}
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                  <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section IV: GMP Quality Assurance Sign-Off</Text>
                  </View>
                  <View style={{ padding: 12, gap: 6 }}>
                    <Text style={{ fontSize: 12, color: colors.text.primary }}><Text style={{ fontWeight: '700' }}>QC Inspector Remarks: </Text>{bmrReport.qcNotes}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 8 }}>
                      <Text style={{ fontSize: 11, color: colors.text.secondary }}>Inspector: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{bmrReport.qcPassedBy}</Text></Text>
                      <Text style={{ fontSize: 11, color: colors.text.secondary }}>Signature: <Text style={{ fontFamily: 'serif', fontStyle: 'italic', fontWeight: '700', color: colors.primary }}>{bmrReport.qcPassedBy}</Text></Text>
                    </View>
                  </View>
                </View>
              </ScrollView>
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: colors.text.secondary }}>Failed to display report details.</Text>
              </View>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setBmrModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
              {bmrReport && (
                <TouchableOpacity style={styles.submitBtn} onPress={handlePrintBMR}>
                  <Ionicons name="print-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.submitBtnText}>Print PDF Record</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 7: BATCH / RAW MATERIAL GENEALOGY */}
      {/* ======================================================== */}
      <Modal visible={genealogyModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setGenealogyModalVisible(false)} />
          <View style={[styles.modalContainer, { maxWidth: 760, width: '92%', height: '85%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {genealogyType === 'batch' ? 'Batch Genealogy Trace' : 'Raw Material Genealogy'}
                </Text>
                <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                  {genealogyType === 'batch' ? 'Raw material source trace for this batch' : 'Finished batches using this material'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setGenealogyModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {genealogyLoading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : genealogyData ? (
              <ScrollView style={[styles.modalForm, { padding: 16 }]} contentContainerStyle={{ gap: 16 }}>
                {genealogyType === 'batch' ? (
                  <>
                    {/* Batch Genealogy: Show sources of raw materials */}
                    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                      <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Batch Identity</Text>
                      </View>
                      <View style={{ padding: 12, gap: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 13, color: colors.text.secondary }}>Batch No:</Text>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{genealogyData.batchNo}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 13, color: colors.text.secondary }}>Product:</Text>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{genealogyData.productName} ({genealogyData.productSku})</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 13, color: colors.text.secondary }}>Status:</Text>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{genealogyData.status}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 13, color: colors.text.secondary }}>Planned → Actual:</Text>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{genealogyData.plannedQty} → {genealogyData.actualYieldQty} units</Text>
                        </View>
                        {genealogyData.wasteQty > 0 && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 13, color: colors.text.secondary }}>Waste / Variance:</Text>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.warning }}>{genealogyData.wasteQty} units ({genealogyData.variancePercent}%){genealogyData.wasteReason ? ` — ${genealogyData.wasteReason}` : ''}</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Raw Material Sources */}
                    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                      <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Raw Materials Consumed</Text>
                      </View>
                      <View style={{ padding: 8 }}>
                        <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6 }}>
                          <Text style={{ flex: 2, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Material</Text>
                          <Text style={{ flex: 1.3, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Batch</Text>
                          <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Qty Used</Text>
                          <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Vendor</Text>
                          <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Rate</Text>
                        </View>
                        {genealogyData.ingredients.map((ing: any, idx: number) => (
                          <View key={idx} style={{ flexDirection: 'row', paddingVertical: 5, borderBottomWidth: idx === genealogyData.ingredients.length - 1 ? 0 : 0.5, borderBottomColor: colors.border }}>
                            <Text style={{ flex: 2, fontSize: 11, color: colors.text.primary }} numberOfLines={1}>
                              {ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.name : 'Material'}
                            </Text>
                            <Text style={{ flex: 1.3, fontSize: 11, color: colors.text.primary }}>{ing.batchNo}</Text>
                            <Text style={{ flex: 1, fontSize: 11, color: colors.text.primary, textAlign: 'right' }}>{ing.qtyConsumed?.toFixed(2)}</Text>
                            <Text style={{ flex: 1, fontSize: 11, color: colors.text.primary, textAlign: 'right' }}>{ing.sourceBatch?.vendorName || '—'}</Text>
                            <Text style={{ flex: 1, fontSize: 11, color: colors.text.primary, textAlign: 'right' }}>₹{ing.sourceBatch?.purchaseRate || 0}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    {/* Raw Material Genealogy: Show batches that used this material */}
                    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                      <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Material Identity</Text>
                      </View>
                      <View style={{ padding: 12, gap: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 13, color: colors.text.secondary }}>Material:</Text>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{genealogyData.rawMaterial?.name} ({genealogyData.rawMaterial?.sku})</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 13, color: colors.text.secondary }}>Used in:</Text>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{genealogyData.totalBatchesUsedIn} finished batch(es)</Text>
                        </View>
                      </View>
                    </View>

                    {genealogyData.batches?.length > 0 ? (
                      <View style={{ gap: 12 }}>
                        {genealogyData.batches.map((b: any) => (
                          <View key={b.batchProductionId} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <View style={{ flex: 1, marginRight: 8 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>{b.batchNo}</Text>
                                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>{b.productName} ({b.productSku})</Text>
                              </View>
                              <View style={[styles.statusBadge, { borderColor: getStatusColor(b.status), backgroundColor: getStatusColor(b.status) + '10' }]}>
                                <Text style={[styles.statusBadgeText, { color: getStatusColor(b.status) }]}>{b.status.toUpperCase()}</Text>
                              </View>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                              <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                                Consumed: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{b.totalConsumed?.toFixed(2)} {b.unit}</Text>
                              </Text>
                              <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                                Planned: <Text style={{ fontWeight: '700', color: colors.text.primary }}>{b.plannedQty}</Text>
                              </Text>
                              <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                                Yield: <Text style={{ fontWeight: '700', color: colors.success }}>{b.actualYieldQty}</Text>
                              </Text>
                              {b.wasteQty > 0 && (
                                <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                                  Waste: <Text style={{ fontWeight: '700', color: colors.warning }}>{b.wasteQty} ({b.variancePercent > 0 ? '+' : ''}{b.variancePercent}%)</Text>
                                </Text>
                              )}
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.emptyText}>This raw material has not been used in any finished batch yet.</Text>
                    )}
                  </>
                )}
              </ScrollView>
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: colors.text.secondary }}>No genealogy data available.</Text>
              </View>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setGenealogyModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 8: END-TO-END BATCH TRACE */}
      {/* ======================================================== */}
      <Modal visible={traceModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setTraceModalVisible(false)} />
          <View style={[styles.modalContainer, { maxWidth: 800, width: '92%', height: '90%' }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>End-to-End Batch Trace</Text>
                <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                  {traceResult ? `Batch: ${traceResult.batchNo}` : 'Enter a batch number to trace'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTraceModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {traceLoading ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : traceResult ? (
              <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ gap: 16 }}>
                {/* Raw Material Entries */}
                {traceResult.rawMaterialEntries?.length > 0 && (
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: colors.warning + '15', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.warning }}>📦 Raw Material Inward ({traceResult.rawMaterialEntries.length})</Text>
                    </View>
                    {traceResult.rawMaterialEntries.map((e: any) => (
                      <View key={e._id} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{e.materialName} ({e.materialSku})</Text>
                        <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                          Qty: {e.qty} {e.unit} • Vendor: {e.vendorName || 'Direct'} • Rate: ₹{e.purchaseRate}
                          {e.expiryDate ? ` • Exp: ${new Date(e.expiryDate).toLocaleDateString()}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Production Batches */}
                {traceResult.productionBatches?.length > 0 && (
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: colors.primary + '15', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>🏭 Production Batches ({traceResult.productionBatches.length})</Text>
                    </View>
                    {traceResult.productionBatches.map((b: any, idx: number) => (
                      <View key={idx} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{b.productName}</Text>
                          <View style={[styles.statusBadge, { borderColor: getStatusColor(b.status), backgroundColor: getStatusColor(b.status) + '10' }]}>
                            <Text style={[styles.statusBadgeText, { color: getStatusColor(b.status) }]}>{b.status.toUpperCase()}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                          {b.relation === 'raw_material_consumed_in' ? '→ Consumed in batch: ' : '→ Finished batch: '}
                          {b.batchNo}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                          Planned: {b.plannedQty} • Yield: {b.actualYieldQty}
                          {b.qtyConsumed ? ` • Qty Consumed: ${b.qtyConsumed}` : ''}
                          {b.wasteQty > 0 ? ` • Waste: ${b.wasteQty} (${b.variancePercent}%)` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Finished Goods Stock */}
                {traceResult.finishedGoodsEntries?.length > 0 && (
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: colors.success + '15', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.success }}>📊 Finished Goods Stock ({traceResult.finishedGoodsEntries.length})</Text>
                    </View>
                    {traceResult.finishedGoodsEntries.map((e: any) => (
                      <View key={e._id} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{e.productName}</Text>
                        <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                          {e.qtyBoxes} boxes × {e.packing} pcs • {e.warehouseName}
                          {e.mfgDate ? ` • Mfg: ${new Date(e.mfgDate).toLocaleDateString()}` : ''}
                          {e.expiryDate ? ` • Exp: ${new Date(e.expiryDate).toLocaleDateString()}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Challans */}
                {traceResult.challans?.length > 0 && (
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: colors.primary + '10', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>📋 Challans ({traceResult.challans.length})</Text>
                    </View>
                    {traceResult.challans.map((c: any) => (
                      <View key={c._id} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{c.challanNo} — {c.partyName}</Text>
                        <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                          {c.items.map((i: any) => `${i.name}: ${i.qty} boxes`).join(', ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Invoices */}
                {traceResult.invoices?.length > 0 && (
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: colors.success + '10', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.success }}>🧾 Invoices ({traceResult.invoices.length})</Text>
                    </View>
                    {traceResult.invoices.map((inv: any) => (
                      <View key={inv._id} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{inv.invoiceNo} — {inv.customerName}</Text>
                        <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                          ₹{inv.amount} • {inv.status.toUpperCase()}
                          {inv.paymentTransactionId ? ` • TXN: ${inv.paymentTransactionId}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Dispatches */}
                {traceResult.dispatches?.length > 0 && (
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: colors.warning + '10', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.warning }}>🚚 Dispatches ({traceResult.dispatches.length})</Text>
                    </View>
                    {traceResult.dispatches.map((d: any) => (
                      <View key={d._id} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{d.dispatchNo} — {d.customerName}</Text>
                        <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                          {d.transporter} • LR: {d.lrNo || '—'} • {d.status.toUpperCase()}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.text.secondary }}>
                          Items: {d.items.map((i: any) => `${i.name}: ${i.qty} boxes`).join(', ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {!traceResult.rawMaterialEntries?.length && !traceResult.productionBatches?.length && 
                 !traceResult.finishedGoodsEntries?.length && !traceResult.challans?.length &&
                 !traceResult.invoices?.length && !traceResult.dispatches?.length && (
                  <View style={{ alignItems: 'center', padding: 24 }}>
                    <Ionicons name="search-outline" size={40} color={colors.text.muted} />
                    <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 8 }}>
                      No trace records found for batch "{traceResult.batchNo}"
                    </Text>
                  </View>
                )}
              </ScrollView>
            ) : null}

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTraceModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.bg.primary,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.bg.primary,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.text.secondary,
      fontWeight: '600',
    },
    tabRow: {
      flexDirection: 'row',
      backgroundColor: colors.bg.secondary,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tabButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      gap: 6,
      borderBottomWidth: 3,
      borderBottomColor: 'transparent',
    },
    tabText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    scrollContent: {
      padding: Spacing.lg,
    },
    tabContent: {
      gap: 16,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
    },
    outlineBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: Radius.md,
      paddingHorizontal: 12,
      paddingVertical: 6,
      gap: 4,
    },
    outlineBtnText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: Radius.md,
      paddingHorizontal: 12,
      paddingVertical: 6,
      gap: 4,
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
    },
    card: {
      backgroundColor: colors.bg.card,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: Spacing.lg,
    },
    cardTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text.primary,
      marginBottom: 12,
    },
    cardSubTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.secondary,
      marginBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: 4,
    },
    materialRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rmName: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.primary,
    },
    rmSku: {
      fontSize: 10,
      color: colors.text.muted,
      marginTop: 2,
    },
    rmStock: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.primary,
    },
    rmMin: {
      fontSize: 10,
      color: colors.text.muted,
      marginTop: 2,
    },
    batchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    batchRmName: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text.primary,
    },
    batchNoLabel: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    batchExpLabel: {
      fontSize: 10,
      color: colors.danger,
      marginTop: 2,
    },
    batchStock: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text.primary,
    },
    batchRate: {
      fontSize: 10,
      color: colors.text.muted,
      marginTop: 2,
    },
    voidBtn: {
      padding: 6,
      marginLeft: 12,
    },
    emptyText: {
      fontSize: 12.5,
      color: colors.text.muted,
      fontStyle: 'italic',
      textAlign: 'center',
      paddingVertical: 20,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      gap: 12,
    },
    // Recipe BOM styles
    recipeHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: 10,
      marginBottom: 10,
    },
    recipeTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
    },
    recipeYield: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    deleteRecipeBtn: {
      padding: 6,
    },
    ingredientsList: {
      gap: 6,
    },
    ingredientsHeaderLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.secondary,
      marginBottom: 4,
    },
    ingredientItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    ingredientName: {
      fontSize: 12,
      color: colors.text.primary,
    },
    ingredientQty: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.primary,
    },
    // Production batches styles
    batchCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: 10,
      marginBottom: 10,
    },
    batchTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text.primary,
    },
    batchSubNo: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
    },
    statusBadge: {
      borderWidth: 1,
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    statusBadgeText: {
      fontSize: 9,
      fontWeight: '800',
    },
    batchMetaGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16,
      marginBottom: 12,
    },
    metaLabel: {
      fontSize: 11.5,
      color: colors.text.secondary,
    },
    metaVal: {
      fontWeight: '700',
      color: colors.text.primary,
    },
    batchIngredientsConsumedSection: {
      backgroundColor: colors.bg.secondary,
      borderRadius: Radius.md,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
      marginBottom: 12,
    },
    consumedIngItem: {
      fontSize: 11,
      color: colors.text.secondary,
    },
    qcBox: {
      backgroundColor: colors.success + '0a',
      borderColor: colors.success + '20',
      borderWidth: 1,
      borderRadius: Radius.md,
      padding: 10,
      gap: 2,
      marginBottom: 8,
    },
    qcBoxTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.success,
    },
    qcBoxText: {
      fontSize: 11,
      color: colors.text.secondary,
    },
    batchActionsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 4,
    },
    cancelBatchBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderWidth: 1,
      borderColor: colors.danger + '30',
      borderRadius: Radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    cancelBatchBtnText: {
      color: colors.danger,
      fontSize: 11,
      fontWeight: '700',
    },
    completeBatchBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.success,
      borderRadius: Radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    completeBatchBtnText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
    },
    // Modal layout
    modalOverlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContainer: {
      width: '90%',
      maxWidth: 520,
      maxHeight: '90%',
      backgroundColor: colors.bg.card,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      elevation: 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.bg.secondary,
    },
    modalTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text.primary,
    },
    modalError: {
      backgroundColor: colors.danger + '10',
      borderColor: colors.danger + '35',
      borderWidth: 1,
      color: colors.danger,
      fontSize: 12,
      fontWeight: '600',
      padding: 10,
      marginHorizontal: Spacing.lg,
      marginTop: Spacing.md,
      borderRadius: Radius.sm,
    },
    modalForm: {
      padding: Spacing.lg,
    },
    inputLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.secondary,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: colors.bg.primary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: colors.text.primary,
      marginBottom: 16,
    },
    pickerWrapper: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.md,
      backgroundColor: colors.bg.primary,
      marginBottom: 16,
      height: 40,
      justifyContent: 'center',
    },
    formIngredientsTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.text.primary,
      marginTop: 8,
      marginBottom: 12,
    },
    bomIngredientInputRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 10,
      alignItems: 'center',
    },
    removeRowBtn: {
      padding: 4,
    },
    addIngredientRowBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: colors.primary + '30',
      borderRadius: Radius.sm,
      marginTop: 4,
      marginBottom: 16,
    },
    addIngredientRowBtnText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    warningDisclaimer: {
      fontSize: 11,
      color: colors.text.muted,
      lineHeight: 14,
      backgroundColor: colors.bg.secondary,
      padding: 10,
      borderRadius: Radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    modalFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: Spacing.lg,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 12,
      backgroundColor: colors.bg.secondary,
    },
    cancelBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelBtnText: {
      color: colors.text.secondary,
      fontSize: 12.5,
      fontWeight: '700',
    },
    submitBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: Radius.md,
    },
    submitBtnText: {
      color: '#fff',
      fontSize: 12.5,
      fontWeight: '700',
    },
    // Stage Stepper Styles
    stageStepperContainer: {
      marginBottom: 12,
    },
    stageStepperRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginTop: 4,
    },
    stageStep: {
      alignItems: 'center',
      width: 80,
      paddingVertical: 4,
    },
    stageDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 3,
    },
    stageLabel: {
      fontSize: 8,
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: 10,
    },
    stageSkipBtn: {
      marginTop: 2,
      paddingHorizontal: 4,
      paddingVertical: 1,
      backgroundColor: 'transparent',
    },
    stageSkipText: {
      fontSize: 8,
      color: '#888',
      textDecorationLine: 'underline',
    },
    // Waste Box Styles
    wasteBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.warning + '0a',
      borderColor: colors.warning + '30',
      borderWidth: 1,
      borderRadius: Radius.md,
      padding: 8,
    },
    wasteText: {
      fontSize: 11,
      color: colors.text.secondary,
      flex: 1,
    },
  }); // End of style sheet
