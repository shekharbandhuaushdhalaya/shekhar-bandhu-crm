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
  Alert,
  DeviceEventEmitter
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { useRouter } from 'expo-router';
import AyurvedicLoader from '../components/AyurvedicLoader';
import {
  api,
  RawMaterial,
  RawMaterialEntry,
  BillOfMaterials,
  BatchProduction,
  Product,
  Vendor,
  Warehouse,
  ManufacturingUnit
} from '../utils/api';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { FIRM_DETAILS } from '../constants/firm';

export default function ManufacturingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width: winWidth } = useWindowDimensions();
  const isDesktop = winWidth > 768;

  const [activeTab, setActiveTab] = useState<'materials' | 'batches' | 'scheduler' | 'units'>('materials');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Core Data Lists
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [entries, setEntries] = useState<RawMaterialEntry[]>([]);
  const [boms, setBoms] = useState<BillOfMaterials[]>([]);
  const [batches, setBatches] = useState<BatchProduction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [qcWarehouseId, setQcWarehouseId] = useState('');
  const [manufacturingUnits, setManufacturingUnits] = useState<ManufacturingUnit[]>([]);
  const [prodManufacturingUnitId, setProdManufacturingUnitId] = useState('');
  const [expiryAlerts, setExpiryAlerts] = useState<RawMaterialEntry[]>([]);
  const [mfgAnalytics, setMfgAnalytics] = useState<any>(null);
  const [bmrReport, setBmrReport] = useState<any>(null);
  const [bmrModalVisible, setBmrModalVisible] = useState(false);
  const [loadingBmr, setLoadingBmr] = useState(false);

  const [materialModalVisible, setMaterialModalVisible] = useState(false);
  const [bomModalVisible, setBomModalVisible] = useState(false);
  const [productionModalVisible, setProductionModalVisible] = useState(false);
  const [qcModalVisible, setQcModalVisible] = useState(false);
  const [genealogyModalVisible, setGenealogyModalVisible] = useState(false);
  const [genealogyData, setGenealogyData] = useState<any>(null);
  const [genealogyLoading, setGenealogyLoading] = useState(false);
  const [genealogyType, setGenealogyType] = useState<'batch' | 'material'>('batch');
  const [genealogySearchQuery, setGenealogySearchQuery] = useState('');
  const [genealogySearchError, setGenealogySearchError] = useState('');
  const [traceModalVisible, setTraceModalVisible] = useState(false);
  const [traceBatchNo, setTraceBatchNo] = useState('');
  const [traceResult, setTraceResult] = useState<any>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceSubTab, setTraceSubTab] = useState<'in' | 'out'>('in');
  const [traceSearch, setTraceSearch] = useState('');
  const [expandedMaterials, setExpandedMaterials] = useState<Record<string, boolean>>({});
  const [currentInProgressStage, setCurrentInProgressStage] = useState<{ batchId: string; stageIndex: number } | null>(null);
  const [stageAction, setStageAction] = useState<'advance' | 'skip' | null>(null);
  const [stageBatchId, setStageBatchId] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState<number | null>(null);
  const [stageOperator, setStageOperator] = useState('Operator');
  const [stageNotes, setStageNotes] = useState('');
  const [stageModalVisible, setStageModalVisible] = useState(false);
  const [stageError, setStageError] = useState('');

  // Search & Filter States — Raw Materials tab
  const [materialSearch, setMaterialSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'in_stock'>('all');

  // Form States — Raw Material
  const [rmName, setRmName] = useState('');
  const [rmSku, setRmSku] = useState('');
  const [rmUnit, setRmUnit] = useState('kg');
  const [rmCategory, setRmCategory] = useState<string>('Herb');
  const [rmMinReorder, setRmMinReorder] = useState('10');
  const [rmError, setRmError] = useState('');
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);



  // Form States — BOM Recipe
  const [selectedProdId, setSelectedProdId] = useState('');
  const [bomYield, setBomYield] = useState('100');
  const [bomIngredients, setBomIngredients] = useState<{ rawMaterialId: string; qtyRequired: string }[]>([
    { rawMaterialId: '', qtyRequired: '' }
  ]);
  const [bomError, setBomError] = useState('');
  const [bomIsActive, setBomIsActive] = useState(true);
  const [bomNotes, setBomNotes] = useState('');
  const [bomOverhead, setBomOverhead] = useState('0');
  const [editingBomId, setEditingBomId] = useState<string | null>(null);
  const [bomStages, setBomStages] = useState<{ name: string; targetDurationDays: string }[]>([
    { name: '', targetDurationDays: '1' }
  ]);

  // Form States — Production Launch
  const [prodProductId, setProdProductId] = useState('');
  const [prodPlannedQty, setProdPlannedQty] = useState('');
  const [prodBatchNo, setProdBatchNo] = useState('');
  const [prodError, setProdError] = useState('');

  // Form States — Manufacturing Unit Definition
  const [unitModalVisible, setUnitModalVisible] = useState(false);
  const [unitName, setUnitName] = useState('');
  const [unitCode, setUnitCode] = useState('');
  const [unitAddress, setUnitAddress] = useState('');
  const [unitCity, setUnitCity] = useState('');
  const [unitState, setUnitState] = useState('');
  const [unitPincode, setUnitPincode] = useState('');
  const [unitContact, setUnitContact] = useState('');
  const [unitPhone, setUnitPhone] = useState('');
  const [unitError, setUnitError] = useState('');

  // Form States — QC Signoff
  const [selectedBatchRun, setSelectedBatchRun] = useState<BatchProduction | null>(null);
  const [qcYieldQty, setQcYieldQty] = useState('');
  const [qcPacking, setQcPacking] = useState('');
  const [qcWasteQty, setQcWasteQty] = useState('');
  const [qcWasteReason, setQcWasteReason] = useState('');
  const [qcNotes, setQcNotes] = useState('');
  const [qcPassedBy, setQcPassedBy] = useState('');
  const [qcStatus, setQcStatus] = useState<'approved' | 'rejected'>('approved');
  const [qcOrganoleptic, setQcOrganoleptic] = useState('');
  const [qcMoisture, setQcMoisture] = useState('');
  const [qcAsh, setQcAsh] = useState('');
  const [qcPh, setQcPh] = useState('');
  const [qcDisintegration, setQcDisintegration] = useState('');
  const [qcHeavyMetals, setQcHeavyMetals] = useState('Pass');
  const [qcMicrobial, setQcMicrobial] = useState('Pass');
  const [qcLabReportRef, setQcLabReportRef] = useState('');
  const [qcError, setQcError] = useState('');
  const [qcYields, setQcYields] = useState<{ productId: string; actualYieldQty: string; packing: string }[]>([
    { productId: '', actualYieldQty: '', packing: '' }
  ]);
  const [qcEnableSplit, setQcEnableSplit] = useState(false);
  const [expandedBatchIds, setExpandedBatchIds] = useState<Record<string, boolean>>({});
  const toggleBatchExpanded = (id: string) => setExpandedBatchIds(prev => ({ ...prev, [id]: !prev[id] }));

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [rmsData, entriesData, bomsData, batchesData, prodsData, vendsData, alertsData, analyticsData, whData, mfgUnitsData] = await Promise.all([
        api.getRawMaterials(),
        api.getRawMaterialEntries(),
        api.getBOMs(),
        api.getBatchProductions(),
        api.getProducts(),
        api.getVendors(),
        api.getRawMaterialExpiryAlerts(),
        api.getManufacturingAnalytics(),
        api.getWarehouses(),
        api.getManufacturingUnits()
      ]);

      setMaterials(rmsData);
      setEntries(entriesData);
      setBoms(bomsData);
      setBatches(batchesData);
      setProducts(prodsData);
      setVendors(vendsData);
      setExpiryAlerts(alertsData);
      setMfgAnalytics(analyticsData);
      setWarehouses(whData);
      setManufacturingUnits(mfgUnitsData);
      if (mfgUnitsData && mfgUnitsData.length > 0) {
        setProdManufacturingUnitId(prev => prev || mfgUnitsData[0]._id);
      }
    } catch (err) {
      console.error('Failed to load manufacturing workspace data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const sub1 = DeviceEventEmitter.addListener('mfg_stage_updated_event', () => loadData());
    const sub2 = DeviceEventEmitter.addListener('mfg_batch_created_event', () => loadData());
    const sub3 = DeviceEventEmitter.addListener('inventory_updated_event', () => loadData());

    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
    };
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // --- Handlers: Raw Material Definition ---
  const handleSaveMaterial = async () => {
    if (!rmName.trim()) {
      setRmError('Name is required.');
      return;
    }
    setRmError('');
    try {
      if (editingMaterialId) {
        await api.updateRawMaterial(editingMaterialId, {
          name: rmName.trim(),
          unit: rmUnit,
          category: rmCategory,
          minReorder: Number(rmMinReorder) || 0
        });
      } else {
        await api.createRawMaterial({
          name: rmName.trim(),
          sku: rmSku.trim() || undefined,
          unit: rmUnit,
          category: rmCategory,
          minReorder: Number(rmMinReorder) || 0
        });
      }
      setRmName('');
      setRmSku('');
      setRmUnit('kg');
      setRmCategory('Herb');
      setRmMinReorder('10');
      setEditingMaterialId(null);
      setMaterialModalVisible(false);
      loadData();
    } catch (err: any) {
      setRmError(err.message || 'Failed to save material definition');
    }
  };

  const handleEditMaterial = (rm: RawMaterial) => {
    setEditingMaterialId(rm._id);
    setRmName(rm.name);
    setRmSku(rm.sku || '');
    setRmUnit(rm.unit);
    setRmCategory(rm.category || 'Herb');
    setRmMinReorder(rm.minReorder ? rm.minReorder.toString() : '0');
    setRmError('');
    setMaterialModalVisible(true);
  };

  const handleCloseMaterialModal = () => {
    setRmName('');
    setRmSku('');
    setRmUnit('kg');
    setRmCategory('Herb');
    setRmMinReorder('10');
    setEditingMaterialId(null);
    setRmError('');
    setMaterialModalVisible(false);
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

  const handleStageChange = (index: number, key: 'name' | 'targetDurationDays', value: string) => {
    const updated = [...bomStages];
    updated[index][key] = value;
    setBomStages(updated);
  };

  const handleAddStageRow = () => {
    setBomStages([...bomStages, { name: '', targetDurationDays: '1' }]);
  };

  const handleRemoveStageRow = (index: number) => {
    if (bomStages.length <= 1) return;
    const updated = bomStages.filter((_, i) => i !== index);
    setBomStages(updated);
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
    const stageInvalid = bomStages.some(st => st.name.trim().length > 0 && (isNaN(Number(st.targetDurationDays)) || Number(st.targetDurationDays) <= 0));
    if (stageInvalid) {
      setBomError('Please enter valid target durations (in days) for all stages.');
      return;
    }
    setBomError('');

    const filteredStages = bomStages
      .filter(st => st.name.trim().length > 0)
      .map(st => ({
        name: st.name.trim(),
        targetDurationDays: parseFloat(st.targetDurationDays) || 1
      }));

    try {
      await api.configureBOM({
        productId: selectedProdId,
        batchYieldSize: Number(bomYield),
        ingredients: bomIngredients.map(ing => ({
          rawMaterialId: ing.rawMaterialId,
          qtyRequired: Number(ing.qtyRequired)
        })),
        isActive: bomIsActive,
        productionNotes: bomNotes.trim(),
        overheadCost: parseFloat(bomOverhead) || 0,
        stages: filteredStages
      });

      setSelectedProdId('');
      setBomYield('100');
      setBomIngredients([{ rawMaterialId: '', qtyRequired: '' }]);
      setBomIsActive(true);
      setBomNotes('');
      setBomOverhead('0');
      setBomStages([{ name: '', targetDurationDays: '1' }]);
      setEditingBomId(null);
      setBomModalVisible(false);
      loadData();
    } catch (err: any) {
      setBomError(err.message || 'Failed to configure recipe');
    }
  };

  const handleStartProduction = async () => {
    if (!prodProductId || !prodPlannedQty || !prodBatchNo.trim() || !prodManufacturingUnitId) {
      setProdError('Please fill in all launch requirements, including the manufacturing unit.');
      return;
    }
    setProdError('');
    try {
      await api.startBatchProduction({
        productId: prodProductId,
        plannedQty: Number(prodPlannedQty),
        batchNo: prodBatchNo.trim().toUpperCase(),
        manufacturingUnitId: prodManufacturingUnitId
      });

      setProdProductId('');
      setProdPlannedQty('');
      setProdBatchNo('');
      setProdManufacturingUnitId('');
      setProductionModalVisible(false);
      loadData();
    } catch (err: any) {
      setProdError(err.message || 'Failed to launch production batch');
    }
  };

  const handleSaveUnit = async () => {
    if (!unitName.trim() || !unitCode.trim()) {
      setUnitError('Name and Code are required.');
      return;
    }
    setUnitError('');
    try {
      await api.createManufacturingUnit({
        name: unitName.trim(),
        code: unitCode.trim().toUpperCase(),
        addressLine1: unitAddress.trim(),
        city: unitCity.trim(),
        state: unitState.trim(),
        pincode: unitPincode.trim(),
        contactPerson: unitContact.trim(),
        phone: unitPhone.trim()
      });
      setUnitName('');
      setUnitCode('');
      setUnitAddress('');
      setUnitCity('');
      setUnitState('');
      setUnitPincode('');
      setUnitContact('');
      setUnitPhone('');
      setUnitModalVisible(false);
      loadData();
    } catch (err: any) {
      setUnitError(err.message || 'Failed to save manufacturing unit');
    }
  };

  const handleAddQcYieldRow = () => {
    setQcYields([...qcYields, { productId: '', actualYieldQty: '', packing: '1' }]);
  };

  const handleRemoveQcYieldRow = (index: number) => {
    if (qcYields.length <= 1) return;
    const updated = qcYields.filter((_, i) => i !== index);
    setQcYields(updated);
  };

  const handleQcYieldChange = (index: number, key: 'productId' | 'actualYieldQty' | 'packing', value: string) => {
    const updated = [...qcYields];
    updated[index][key] = value;
    setQcYields(updated);
  };

  const handleCompleteProduction = async () => {
    if (!selectedBatchRun) {
      setQcError('No active batch selected.');
      return;
    }
    if (!qcYieldQty || isNaN(Number(qcYieldQty)) || Number(qcYieldQty) <= 0) {
      setQcError('Please enter a valid positive number for Actual Output Yield Size.');
      return;
    }
    if (!qcPassedBy || !qcPassedBy.trim()) {
      setQcError('QC Inspector Name is mandatory.');
      return;
    }
    if (!qcWarehouseId) {
      setQcError('Target Storage Warehouse selection is mandatory.');
      return;
    }

    let yieldsPayload = undefined;
    if (qcEnableSplit) {
      const invalid = qcYields.some(y => !y.productId || !y.actualYieldQty || isNaN(Number(y.actualYieldQty)) || Number(y.actualYieldQty) < 0);
      if (invalid) {
        setQcError('Please enter valid product sizes and quantities for the split.');
        return;
      }
      yieldsPayload = qcYields.map(y => ({
        productId: y.productId,
        actualYieldQty: Number(y.actualYieldQty),
        packing: Number(y.packing) || 1
      }));
      const sum = yieldsPayload.reduce((acc, y) => acc + y.actualYieldQty, 0);
      if (sum !== Number(qcYieldQty)) {
        setQcError(`Sum of split quantities (${sum}) must match the total actual yield quantity (${qcYieldQty}).`);
        return;
      }
    }

    setQcError('');
    try {
      const payload: any = {
        actualYieldQty: Number(qcYieldQty),
        packing: Number(qcPacking) || undefined,
        qcNotes: qcNotes.trim(),
        qcPassedBy: qcPassedBy.trim(),
        yields: yieldsPayload,
        qcStatus,
        organoleptic: qcOrganoleptic.trim(),
        moistureContent: qcMoisture ? parseFloat(qcMoisture) : null,
        ashValue: qcAsh ? parseFloat(qcAsh) : null,
        pHValue: qcPh ? parseFloat(qcPh) : null,
        disintegrationTime: qcDisintegration ? parseInt(qcDisintegration) : null,
        heavyMetals: qcHeavyMetals,
        microbialLimit: qcMicrobial,
        labReportRef: qcLabReportRef.trim(),
        warehouseId: qcWarehouseId
      };
      if (qcWasteQty) payload.wasteQty = Number(qcWasteQty);
      if (qcWasteReason.trim()) payload.wasteReason = qcWasteReason.trim();

      await api.completeBatchProduction(selectedBatchRun._id, payload);

      setSelectedBatchRun(null);
      setQcYieldQty('');
      setQcPacking('');
      setQcWarehouseId('');
      setQcWasteQty('');
      setQcWasteReason('');
      setQcNotes('');
      setQcPassedBy('');
      setQcStatus('approved');
      setQcOrganoleptic('');
      setQcMoisture('');
      setQcAsh('');
      setQcPh('');
      setQcDisintegration('');
      setQcHeavyMetals('Pass');
      setQcMicrobial('Pass');
      setQcLabReportRef('');
      setQcEnableSplit(false);
      setQcYields([{ productId: '', actualYieldQty: '', packing: '1' }]);
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

  const handleAdvanceStage = (batchId: string, idx: number) => {
    setStageAction('advance');
    setStageBatchId(batchId);
    setStageIndex(idx);
    setStageOperator('Operator');
    setStageNotes('');
    setStageError('');
    setStageModalVisible(true);
  };

  const handleSkipStage = (batchId: string, idx: number) => {
    setStageAction('skip');
    setStageBatchId(batchId);
    setStageIndex(idx);
    setStageOperator('Operator');
    setStageNotes('');
    setStageError('');
    setStageModalVisible(true);
  };

  const handleFailStage = (batchId: string, idx: number) => {
    setStageAction('fail');
    setStageBatchId(batchId);
    setStageIndex(idx);
    setStageOperator('QC Inspector');
    setStageNotes('');
    setStageError('');
    setStageModalVisible(true);
  };

  const handleSaveStageAction = async () => {
    if (!stageBatchId || stageIndex === null || !stageAction) return;
    if (!stageOperator.trim()) {
      setStageError('Operator name is required.');
      return;
    }
    if ((stageAction === 'skip' || stageAction === 'fail') && !stageNotes.trim()) {
      setStageError(`Justification / failure reason is required when ${stageAction === 'fail' ? 'rejecting the batch' : 'skipping a stage'}.`);
      return;
    }
    setStageError('');

    try {
      if (stageAction === 'advance') {
        setCurrentInProgressStage({ batchId: stageBatchId, stageIndex: stageIndex });
      }
      let statusVal = 'completed';
      if (stageAction === 'skip') statusVal = 'skipped';
      if (stageAction === 'fail') statusVal = 'failed';

      await api.advanceStage(stageBatchId, stageIndex, {
        status: statusVal,
        completedBy: stageOperator.trim(),
        notes: stageNotes.trim()
      });
      
      setStageAction(null);
      setStageBatchId(null);
      setStageIndex(null);
      setStageOperator('Operator');
      setStageNotes('');
      setCurrentInProgressStage(null);
      setStageModalVisible(false);
      loadData();
    } catch (err: any) {
      setCurrentInProgressStage(null);
      setStageError(err.message || 'Failed to update stage');
    }
  };

  const handleOpenGenealogy = async (type: 'batch' | 'material', id: string) => {
    try {
      setGenealogySearchQuery('');
      setGenealogySearchError('');
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

  const handleExecuteGenealogySearch = async () => {
    if (!genealogySearchQuery.trim()) return;
    try {
      setGenealogyLoading(true);
      setGenealogySearchError('');
      const res = await api.searchGenealogy(genealogySearchQuery.trim());
      if (res.type === 'batch') {
        setGenealogyType('batch');
        setGenealogyData(res.data);
      } else {
        setGenealogyType('material');
        setGenealogyData(res.data);
      }
    } catch (err: any) {
      setGenealogySearchError(err.message || 'No genealogy record found matching that search query');
    } finally {
      setGenealogyLoading(false);
    }
  };

  const handleUploadBatchDoc = async (batchId: string) => {
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,application/pdf';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const dataUrl = reader.result as string;
              // Upload file once to Cloudinary and link it to batch
              const uploadRes = await api.uploadFile(dataUrl, file.name);
              await api.addDocument('batch', batchId, {
                name: uploadRes.name,
                url: uploadRes.url
              });
              loadData();
            } catch (err: any) {
              alert(err.message || 'Failed to upload document');
            }
          };
          reader.readAsDataURL(file);
        } catch (err: any) {
          alert('Failed to read file');
        }
      };
      input.click();
    } else {
      Alert.prompt(
        'Attach Document',
        'Enter document or certificate URL:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Attach',
            onPress: async (url) => {
              if (!url) return;
              try {
                await api.addDocument('batch', batchId, { name: 'Attached Certificate', url });
                loadData();
              } catch (err: any) {
                alert(err.message || 'Failed to attach document');
              }
            }
          }
        ]
      );
    }
  };

  const handleDeleteBatchDoc = async (batchId: string, url: string) => {
    const confirmed = Platform.OS === 'web'
      ? confirm('Are you sure you want to delete this document?')
      : await new Promise(resolve => {
          Alert.alert('Delete Document', 'Are you sure?', [
            { text: 'No', onPress: () => resolve(false) },
            { text: 'Yes, Delete', onPress: () => resolve(true) }
          ]);
        });
    if (!confirmed) return;
    try {
      await api.deleteDocument('batch', batchId, url);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete document');
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
      case 'rejected': return colors.danger;
      default: return colors.text.muted;
    }
  };
  const matchingBom = boms.find(b => {
    const bPid = b.productId && typeof b.productId === 'object' ? b.productId._id : b.productId;
    return bPid === prodProductId;
  });

  const plannedVal = Number(prodPlannedQty);
  let previewIngredients: { name: string; qtyNeeded: number; unit: string; available: number; ratioPct: number; itemType: 'formulation' | 'packaging' }[] = [];
  if (matchingBom && !isNaN(plannedVal) && plannedVal > 0) {
    const scale = plannedVal / (matchingBom.batchYieldSize || 100);
    previewIngredients = matchingBom.ingredients.map(ing => {
      const ingId = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId._id : ing.rawMaterialId;
      const ingName = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.name : 'Unknown Raw Material';
      const ingUnit = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.unit : 'kg';
      const matchingMaterial = materials.find(m => m._id === ingId);
      const available = matchingMaterial ? (matchingMaterial.stockLevel || 0) : 0;
      const isPkg = ing.itemType === 'packaging' || (matchingMaterial && matchingMaterial.category === 'Packaging');

      const qtyNeeded = isPkg ? ing.qtyRequired * plannedVal : ing.qtyRequired * scale;

      return {
        name: ingName,
        qtyNeeded,
        unit: ingUnit,
        available,
        ratioPct: ing.qtyRequired,
        itemType: isPkg ? 'packaging' : 'formulation'
      };
    });
  }
  if (loading) {
    return <AyurvedicLoader />;
  }

  const filteredMaterials = materials.filter(rm => {
    const matchText = (rm.name || '').toLowerCase().includes(materialSearch.toLowerCase()) ||
                      (rm.sku || '').toLowerCase().includes(materialSearch.toLowerCase());
    if (!matchText) return false;
    if (stockFilter === 'low') {
      return (rm.stockLevel || 0) < rm.minReorder;
    }
    if (stockFilter === 'in_stock') {
      return (rm.stockLevel || 0) > 0;
    }
    return true;
  });

  const filteredEntries = entries.filter(e => {
    const name = e.rawMaterialId && typeof e.rawMaterialId === 'object' ? e.rawMaterialId.name : '';
    const matchText = name.toLowerCase().includes(materialSearch.toLowerCase()) ||
                      (e.batchNo || '').toLowerCase().includes(materialSearch.toLowerCase());
    return matchText;
  });

  return (
    <View style={styles.screen}>
      {/* Sub tabs Row */}
      <View style={styles.tabRow}>
        {[
          { id: 'materials', label: 'Raw Materials & Batches', icon: 'leaf-outline' },
          { id: 'batches', label: 'Production Runs (BMR)', icon: 'hammer-outline' },
          { id: 'scheduler', label: 'Production Timeline', icon: 'calendar-outline' },
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

        <TouchableOpacity 
          style={{ 
            flexDirection: 'row', 
            alignItems: 'center', 
            borderColor: colors.primary, 
            borderWidth: 1, 
            borderRadius: 6, 
            paddingHorizontal: 12, 
            paddingVertical: 8,
            backgroundColor: colors.bg.primary
          }} 
          onPress={() => setMaterialModalVisible(true)}
        >
          <Ionicons name="add-circle-outline" size={15} color={colors.primary} style={{ marginRight: 4 }} />
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Define Material</Text>
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


            {/* Expiry Alerts Warning Card */}
            {expiryAlerts.length > 0 && (
              <View style={[styles.card, { borderColor: colors.danger, backgroundColor: colors.danger + '08', marginBottom: 16 }]}>
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

            {/* Single Unified Raw Material Stock & Batch Breakdown List */}
            <View style={[styles.card, { padding: 10 }]}>
              <View style={{ flexDirection: isDesktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: isDesktop ? 'center' : 'stretch', gap: 8, marginBottom: 12 }}>
                <Text style={[styles.cardSubTitle, { marginBottom: 0 }]}>Raw Stocks & Reorder Status (Click to view active batches)</Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, width: isDesktop ? 260 : undefined }}>
                  <Ionicons name="search-outline" size={14} color={colors.text.muted} style={{ marginRight: 4 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 12, color: colors.text.primary, padding: 0 }}
                    placeholder="Search stocks..."
                    placeholderTextColor={colors.text.muted}
                    value={materialSearch}
                    onChangeText={setMaterialSearch}
                  />
                  {materialSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setMaterialSearch('')} style={{ marginRight: 6 }}>
                      <Ionicons name="close-circle" size={14} color={colors.text.muted} />
                    </TouchableOpacity>
                  )}
                  
                  <View style={{ width: 1, height: 14, backgroundColor: colors.border, marginRight: 6 }} />

                  {Platform.OS === 'web' ? (
                    <select
                      value={stockFilter}
                      onChange={(e: any) => setStockFilter(e.target.value)}
                      style={{
                        borderWidth: 0,
                        backgroundColor: 'transparent',
                        color: colors.text.primary,
                        fontSize: 11,
                        fontWeight: '600',
                        outlineWidth: 0,
                        cursor: 'pointer'
                      }}
                    >
                      <option value="all">All</option>
                      <option value="low">Low</option>
                      <option value="in_stock">In Stock</option>
                    </select>
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        const nextFilter = stockFilter === 'all' ? 'low' : (stockFilter === 'low' ? 'in_stock' : 'all');
                        setStockFilter(nextFilter);
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.primary }}>
                        {stockFilter === 'all' ? 'All' : (stockFilter === 'low' ? 'Low' : 'In Stock')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              
              <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, backgroundColor: colors.bg.secondary, borderTopLeftRadius: 6, borderTopRightRadius: 6 }}>
                  <Text style={{ flex: 2, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Material (SKU)</Text>
                  <Text style={{ flex: 1.2, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Stock</Text>
                  <Text style={{ flex: 1.2, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Min</Text>
                  <Text style={{ width: 140, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'center' }}>Actions</Text>
                </View>
                {/* Body */}
                {filteredMaterials.map((rm, idx) => {
                  const lowStock = (rm.stockLevel || 0) < rm.minReorder;

                  return (
                    <View key={rm._id} style={{ borderBottomWidth: idx === filteredMaterials.length - 1 ? 0 : 0.5, borderBottomColor: colors.border, paddingVertical: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8 }}>
                        <View style={{ flex: 2, paddingLeft: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{rm.name}</Text>
                            <View style={{ backgroundColor: colors.bg.secondary, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 0.5, borderColor: colors.border }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: colors.text.secondary }}>
                                {rm.category === 'Packaging' ? '📦 Pkg' : (rm.category === 'Excipient' ? '💧 Base' : (rm.category === 'General' ? '⚙️ Gen' : '🌿 Herb'))}
                              </Text>
                            </View>
                          </View>
                          {rm.sku ? <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 1 }}>SKU: {rm.sku}</Text> : null}
                        </View>
                        <Text style={{ flex: 1.2, fontSize: 13, fontWeight: '700', color: lowStock ? colors.danger : colors.text.primary, textAlign: 'right' }}>
                          {rm.stockLevel?.toFixed(1) || '0.0'} {rm.unit}
                        </Text>
                        <Text style={{ flex: 1.2, fontSize: 11, color: colors.text.secondary, textAlign: 'right' }}>
                          {rm.minReorder} {rm.unit}
                        </Text>
                        <View style={{ width: 140, flexDirection: 'row', justifyContent: 'center', gap: 6, alignItems: 'center' }}>
                          <TouchableOpacity
                            onPress={() => handleEditMaterial(rm)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, backgroundColor: colors.primary + '10', borderWidth: 0.5, borderColor: colors.primary + '30' }}
                          >
                            <Ionicons name="pencil-outline" size={13} color={colors.primary} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={async () => {
                              const rawName = rm.name ? rm.name.trim() : rm._id;
                              setTraceBatchNo(rawName);
                              setTraceModalVisible(true);
                              setTraceLoading(true);
                              setTraceResult(null);
                              try {
                                const data = await api.traceBatch(rawName);
                                if (data && !data.materialSku && rm.sku) data.materialSku = rm.sku;
                                setTraceResult(data);
                              } catch (err: any) {
                                try {
                                  const data = await api.traceBatch(rm._id);
                                  if (data && !data.materialSku && rm.sku) data.materialSku = rm.sku;
                                  setTraceResult(data);
                                } catch(e) {
                                  console.log('Trace fetch error', e);
                                }
                              } finally {
                                setTraceLoading(false);
                              }
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 4, backgroundColor: colors.success + '10', borderWidth: 0.5, borderColor: colors.success + '30' }}
                          >
                            <Ionicons name="list-outline" size={13} color={colors.success} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.success }}>Ledger</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
              {filteredMaterials.length === 0 && <Text style={styles.emptyText}>No matching materials found.</Text>}
            </View>
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
              const isQcHold = batch.status === 'qc_hold';

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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.batchSubNo}>Batch No: {batch.batchNo} {batch.manufacturingUnitName ? `· Unit: ${batch.manufacturingUnitName}` : ''}</Text>
                        <TouchableOpacity style={{ padding: 2 }} onPress={async () => {
                          setTraceBatchNo(batch.batchNo);
                          setTraceLoading(true);
                          setTraceModalVisible(true);
                          try {
                            const data = await api.traceBatch(batch.batchNo.trim().toUpperCase());
                            setTraceResult(data);
                          } catch (err: any) {
                            alert(err.message || 'Trace lookup failed');
                            setTraceModalVisible(false);
                          } finally {
                            setTraceLoading(false);
                          }
                        }}>
                          <Ionicons name="git-network-outline" size={13} color={colors.primary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { borderColor: getStatusColor(batch.status), backgroundColor: getStatusColor(batch.status) + '10' }]}>
                      <Text style={[styles.statusBadgeText, { color: getStatusColor(batch.status) }]}>
                        {batch.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {/* Essential Key Metrics Bar */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, backgroundColor: colors.bg.secondary, padding: 10, borderRadius: 8, marginVertical: 8 }}>
                    <View style={{ flex: 1, minWidth: 90 }}>
                      <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: '700' }}>OUTPUT QTY</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text.primary }}>
                        {isFinished ? `${batch.actualYieldQty} / ${batch.plannedQty} Pcs` : `${batch.plannedQty} Pcs`}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 100 }}>
                      <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: '700' }}>TOTAL COST</Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.warning }}>
                        ₹{((batch.rawMaterialCost || 0) + (batch.overheadCost || 0)).toFixed(2)}
                        {hasUnitCost ? ` (₹${batch.unitProductionCost?.toFixed(2)}/pc)` : ''}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 90 }}>
                      <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: '700' }}>STARTED</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.secondary }}>
                        {batch.startDate ? new Date(batch.startDate).toLocaleDateString('en-IN') : '—'}
                      </Text>
                    </View>
                    {batch.qcPassedBy ? (
                      <View style={{ flex: 1, minWidth: 110 }}>
                        <Text style={{ fontSize: 10, color: colors.text.muted, fontWeight: '700' }}>QC INSPECTOR</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.success }} numberOfLines={1}>
                          ✓ {batch.qcPassedBy}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Full-Width Connected Timeline Stepper */}
                  {batch.stages && batch.stages.length > 0 && (
                    <View style={{ marginVertical: 12, width: '100%' }}>
                      <View style={{ position: 'relative', width: '100%', paddingHorizontal: 10, minHeight: 65 }}>
                        {/* Background & Active Progress Connecting Lines (Strictly bounded between first and last dot center) */}
                        {(() => {
                          const N = batch.stages.length;
                          if (N < 2) return null;
                          const stepPct = 100 / N;
                          const startLeftPct = stepPct / 2;
                          const totalLineWidthPct = ((N - 1) / N) * 100;

                          const lastDoneIdx = batch.stages.reduce((acc: number, s: any, i: number) => (s.status === 'completed' || s.status === 'skipped' || s.status === 'in_progress') ? i : acc, 0);
                          const activeWidthPct = (lastDoneIdx / (N - 1)) * totalLineWidthPct;

                          return (
                            <>
                              {/* Background Line */}
                              <View style={{
                                position: 'absolute',
                                top: 11,
                                left: `${startLeftPct}%`,
                                width: `${totalLineWidthPct}%`,
                                height: 3,
                                backgroundColor: colors.border,
                                borderRadius: 2,
                                zIndex: 1
                              }} />
                              {/* Active Progress Line */}
                              <View style={{
                                position: 'absolute',
                                top: 11,
                                left: `${startLeftPct}%`,
                                width: `${Math.min(totalLineWidthPct, activeWidthPct)}%`,
                                height: 3,
                                backgroundColor: colors.success,
                                borderRadius: 2,
                                zIndex: 2
                              }} />
                            </>
                          );
                        })()}

                        {/* Stage Step Nodes */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 3, width: '100%' }}>
                          {batch.stages.map((stage, sIdx) => {
                            const isCompleted = stage.status === 'completed';
                            const isSkipped = stage.status === 'skipped';
                            const isFailed = stage.status === 'failed';
                            const isActive = stage.status === 'in_progress';
                            const isInProgress = batch.status === 'in_progress' && stage.status === 'in_progress';

                            const dotBgColor = isCompleted ? colors.success : (isSkipped ? colors.warning : (isFailed ? colors.danger : (isActive ? colors.primary : colors.bg.card)));
                            const borderColor = isCompleted ? colors.success : (isSkipped ? colors.warning : (isFailed ? colors.danger : (isActive ? colors.primary : colors.border)));

                            return (
                              <TouchableOpacity
                                key={sIdx}
                                style={{ flex: 1, alignItems: 'center', minWidth: 40 }}
                                disabled={!isInProgress}
                                onPress={() => handleAdvanceStage(batch._id, sIdx)}
                              >
                                {/* Connected Dot Node */}
                                <View style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 11,
                                  backgroundColor: dotBgColor,
                                  borderWidth: 2,
                                  borderColor: borderColor,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  boxShadow: isActive ? `0 0 6px ${colors.primary}60` : undefined,
                                  elevation: isActive ? 3 : 0
                                }}>
                                  {isCompleted ? (
                                    <Ionicons name="checkmark" size={12} color="#fff" />
                                  ) : isSkipped ? (
                                    <Ionicons name="play-forward" size={10} color="#fff" />
                                  ) : isFailed ? (
                                    <Ionicons name="close" size={12} color="#fff" />
                                  ) : isActive ? (
                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
                                  ) : null}
                                </View>

                                {/* Stage Title Label */}
                                <Text style={{
                                  fontSize: 10,
                                  fontWeight: isActive ? '800' : (isCompleted ? '700' : '500'),
                                  color: isActive ? colors.primary : (isCompleted ? colors.text.primary : colors.text.muted),
                                  textAlign: 'center',
                                  marginTop: 6,
                                  lineHeight: 12
                                }} numberOfLines={2}>
                                  {stage.name}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* Active stage action buttons — prominent & discoverable */}
                      {batch.status === 'in_progress' && (() => {
                        const activeIdx = batch.stages.findIndex((s: any) => s.status === 'in_progress');
                        if (activeIdx === -1) return null;
                        const activeStageName = batch.stages[activeIdx].name;
                        return (
                          <View style={{ marginTop: 10, flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                            <TouchableOpacity
                              style={{ flex: 2, minWidth: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.success }}
                              onPress={() => handleAdvanceStage(batch._id, activeIdx)}
                            >
                              <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                                Complete: {activeStageName}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{ flex: 1, minWidth: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.warning + '20', borderWidth: 1, borderColor: colors.warning }}
                              onPress={() => handleSkipStage(batch._id, activeIdx)}
                            >
                              <Ionicons name="play-forward-outline" size={14} color={colors.warning} />
                              <Text style={{ color: colors.warning, fontSize: 12, fontWeight: '700' }}>Skip</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{ flex: 1, minWidth: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, borderRadius: 8, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger }}
                              onPress={() => handleFailStage(batch._id, activeIdx)}
                            >
                              <Ionicons name="close-circle-outline" size={14} color={colors.danger} />
                              <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700' }}>Fail</Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })()}
                    </View>
                  )}

                  {/* Collapsible Details Toggle (Consumed Raw Materials & Stage Logs) */}
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6 }}
                    onPress={() => toggleBatchExpanded(batch._id)}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>
                      {expandedBatchIds[batch._id] ? 'Hide Materials & Operator Logs' : `View Materials Consumed (${batch.ingredientsConsumed.length}) & Logs`}
                    </Text>
                    <Ionicons name={expandedBatchIds[batch._id] ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
                  </TouchableOpacity>

                  {/* Collapsible Drawer Body */}
                  {expandedBatchIds[batch._id] && (
                    <View style={{ backgroundColor: colors.bg.secondary, padding: 10, borderRadius: 6, marginTop: 4, gap: 8 }}>
                      {batch.stages.some((s: any) => s.status === 'completed' || s.status === 'skipped') && (
                        <View style={{ gap: 4 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Operator Audit Log:</Text>
                          {batch.stages
                            .filter((s: any) => s.status === 'completed' || s.status === 'skipped')
                            .map((s: any, idx: number) => (
                              <Text key={idx} style={{ fontSize: 10, color: colors.text.secondary }}>
                                • <Text style={{ fontWeight: '700', color: colors.text.primary }}>{s.name}</Text>: {s.status === 'completed' ? 'Completed' : 'Skipped'} by <Text style={{ color: colors.primary, fontWeight: '600' }}>{s.completedBy || 'Operator'}</Text>
                                {s.notes ? ` — "${s.notes}"` : ''}
                              </Text>
                            ))}
                        </View>
                      )}

                      {batch.ingredientsConsumed.length > 0 && (
                        <View style={{ gap: 3 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Raw Materials Consumed (FIFO):</Text>
                          {batch.ingredientsConsumed.map((ing, idx) => (
                            <Text key={idx} style={{ fontSize: 10, color: colors.text.secondary }}>
                              • {ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.name : 'Material'} (Batch: {ing.batchNo}) — {ing.qtyConsumed.toFixed(2)} {ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.unit : ''}
                            </Text>
                          ))}
                        </View>
                      )}

                      {/* QC Parameters Log */}
                      {batch.qcParameters && (
                        <View style={{ gap: 4, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>🔬 QC Testing Parameters Log:</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                            {batch.qcParameters.organoleptic ? (
                              <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Organoleptic: <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{batch.qcParameters.organoleptic}</Text></Text></View>
                            ) : null}
                            {batch.qcParameters.moistureContent !== null ? (
                              <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Moisture: <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{batch.qcParameters.moistureContent}% w/w</Text></Text></View>
                            ) : null}
                            {batch.qcParameters.ashValue !== null ? (
                              <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Ash Value: <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{batch.qcParameters.ashValue}% w/w</Text></Text></View>
                            ) : null}
                            {batch.qcParameters.pHValue !== null ? (
                              <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>pH: <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{batch.qcParameters.pHValue}</Text></Text></View>
                            ) : null}
                            {batch.qcParameters.disintegrationTime !== null ? (
                              <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Disintegration: <Text style={{ color: colors.text.primary, fontWeight: '600' }}>{batch.qcParameters.disintegrationTime} mins</Text></Text></View>
                            ) : null}
                            {batch.qcParameters.heavyMetals ? (
                              <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Heavy Metals: <Text style={{ color: batch.qcParameters.heavyMetals === 'Pass' ? colors.success : colors.danger, fontWeight: '800' }}>{batch.qcParameters.heavyMetals}</Text></Text></View>
                            ) : null}
                            {batch.qcParameters.microbialLimit ? (
                              <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Microbial: <Text style={{ color: batch.qcParameters.microbialLimit === 'Pass' ? colors.success : colors.danger, fontWeight: '800' }}>{batch.qcParameters.microbialLimit}</Text></Text></View>
                            ) : null}
                            {batch.qcParameters.labReportRef ? (
                              <View style={{ minWidth: 120, flex: 1 }}><Text style={{ fontSize: 9.5, color: colors.text.secondary }}>Lab Ref: <Text style={{ color: colors.primary, fontWeight: '700' }}>{batch.qcParameters.labReportRef}</Text></Text></View>
                            ) : null}
                          </View>
                        </View>
                      )}

                      {/* Supporting Documents Vault */}
                      <View style={{ gap: 6, marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>📎 Supporting Documents & Certification:</Text>
                        
                        {batch.supportingDocuments && batch.supportingDocuments.length > 0 ? (
                          <View style={{ gap: 4, marginTop: 2 }}>
                            {batch.supportingDocuments.map((doc: any, docIdx: number) => (
                              <View key={docIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg.primary, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
                                <TouchableOpacity onPress={() => Platform.OS === 'web' ? window.open(doc.url, '_blank') : Alert.alert('View Document', doc.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                                  <Ionicons name="document-attach-outline" size={13} color={colors.primary} />
                                  <Text style={{ fontSize: 10.5, color: colors.text.primary, fontWeight: '600' }} numberOfLines={1}>{doc.name}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => handleDeleteBatchDoc(batch._id, doc.url)} style={{ padding: 2 }}>
                                  <Ionicons name="trash-outline" size={12} color={colors.danger} />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={{ fontSize: 10, color: colors.text.muted, fontStyle: 'italic' }}>No supporting documents uploaded.</Text>
                        )}
                      </View>
                    </View>
                  )}

                  {isFinished && !!batch.qcNotes && (
                    <View style={[styles.qcBox, { marginTop: 6, marginBottom: 4 }]}>
                      <Text style={styles.qcBoxText}>QC Note: {batch.qcNotes}</Text>
                    </View>
                  )}

                  {/* Action Controls */}
                  {isQcHold && (
                    <View style={{ marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: colors.warning + '15', borderWidth: 1, borderColor: colors.warning, marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Ionicons name="flask-outline" size={15} color={colors.warning} />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.warning }}>ALL STAGES COMPLETE — QC SIGN-OFF REQUIRED</Text>
                      </View>
                      <Text style={{ fontSize: 11, color: colors.text.secondary }}>All manufacturing stages are done. Complete QC inspection to inward finished stock into inventory.</Text>
                    </View>
                  )}
                  {/* Action Controls Row */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
                    {/* Left Side: Report & Genealogy Actions */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {isFinished && (
                        <TouchableOpacity 
                          style={[styles.outlineBtn, { paddingVertical: 6, paddingHorizontal: 12 }]} 
                          onPress={() => handleOpenBMR(batch._id)}
                        >
                          <Ionicons name="document-text-outline" size={15} color={colors.primary} />
                          <Text style={styles.outlineBtnText}>BMR Report</Text>
                        </TouchableOpacity>
                      )}
                      {!isCancelled && (
                        <>
                          <TouchableOpacity 
                            style={[styles.outlineBtn, { paddingVertical: 6, paddingHorizontal: 12, borderColor: colors.primary }]} 
                            onPress={() => {
                              setTraceBatchNo(batch.batchNo);
                              setTraceModalVisible(true);
                              setTraceLoading(true);
                              api.traceBatch(batch.batchNo.trim().toUpperCase())
                                .then(data => setTraceResult(data))
                                .catch(err => alert(err.message || 'Trace lookup failed'))
                                .finally(() => setTraceLoading(false));
                            }}
                          >
                            <Ionicons name="list-outline" size={15} color={colors.primary} />
                            <Text style={[styles.outlineBtnText, { color: colors.primary }]}>Stock Trace & Genealogy</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={[styles.outlineBtn, { paddingVertical: 6, paddingHorizontal: 12, borderColor: colors.success }]} 
                            onPress={() => handleUploadBatchDoc(batch._id)}
                          >
                            <Ionicons name="cloud-upload-outline" size={15} color={colors.success} />
                            <Text style={[styles.outlineBtnText, { color: colors.success }]}>Upload Doc</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>

                    {/* Right Side: Active Process State Actions */}
                    {(isInProgress || isQcHold) && (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity style={styles.cancelBatchBtn} onPress={() => handleCancelProduction(batch._id)}>
                          <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
                          <Text style={styles.cancelBatchBtnText}>Cancel & Revert Stock</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.completeBatchBtn} onPress={() => {
                          setSelectedBatchRun(batch);
                          setQcYieldQty(batch.plannedQty.toString());
                          setQcWarehouseId(warehouses.length > 0 ? warehouses[0]._id : '');
                          setQcWasteQty('');
                          setQcWasteReason('');
                          setQcPassedBy('');
                          setQcNotes('');
                          setQcError('');
                          setQcModalVisible(true);
                        }}>
                          <Ionicons name="checkmark-done-circle-outline" size={15} color="#fff" />
                          <Text style={styles.completeBatchBtnText}>QC Sign-off & Inward Stock</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
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

                      {/* Current Active Stage & Timeline Warnings */}
                      {run.status === 'in_progress' && (() => {
                        const activeStage = run.stages?.find((s: any) => s.status === 'in_progress');
                        if (!activeStage) return null;
                        const targetDate = activeStage.targetCompletionDate ? new Date(activeStage.targetCompletionDate) : null;
                        const isOverdue = targetDate ? new Date() > targetDate : false;
                        let daysDiff = 0;
                        if (targetDate) {
                          const timeDiff = new Date().getTime() - targetDate.getTime();
                          daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
                        }
                        return (
                          <View style={{ padding: 10, backgroundColor: isOverdue ? colors.danger + '08' : colors.primary + '08', borderRadius: 8, borderWidth: 1, borderColor: isOverdue ? colors.danger : colors.primary + '20', marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.secondary }}>
                                Active Stage: <Text style={{ color: colors.text.primary }}>{activeStage.name}</Text>
                              </Text>
                              {targetDate && (
                                <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>
                                  Target Completion: {targetDate.toLocaleDateString('en-IN')} ({activeStage.targetDurationDays} day{activeStage.targetDurationDays > 1 ? 's' : ''})
                                </Text>
                              )}
                            </View>
                            {targetDate && (
                              <View style={[styles.statusBadge, { 
                                borderColor: isOverdue ? colors.danger : colors.success, 
                                backgroundColor: isOverdue ? colors.danger + '12' : colors.success + '12',
                              }]}>
                                <Text style={{ fontSize: 8, fontWeight: '700', color: isOverdue ? colors.danger : colors.success }}>
                                  {isOverdue ? `OVERDUE BY ${daysDiff} DAYS` : 'ON TRACK'}
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })()}

                      {/* Mini Visual Process Flow Stepper */}
                      {run.stages && run.stages.length > 0 && (
                        <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: colors.text.secondary, marginBottom: 6, letterSpacing: 0.5 }}>PROCESS FLOW STAGES:</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                            {run.stages.map((st: any, idx: number) => {
                              const isDone = st.status === 'completed' || st.status === 'skipped';
                              const isCurrent = st.status === 'in_progress';
                              const isFailed = st.status === 'failed';
                              let dotColor = colors.border;
                              if (isDone) dotColor = colors.success;
                              else if (isCurrent) dotColor = colors.primary;
                              else if (isFailed) dotColor = colors.danger;

                              return (
                                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
                                  <Text style={{ fontSize: 10, fontWeight: isCurrent ? '700' : '400', color: isCurrent ? colors.text.primary : colors.text.secondary }}>
                                    {st.name}
                                  </Text>
                                  {idx < run.stages.length - 1 && (
                                    <Ionicons name="arrow-forward" size={8} color={colors.text.muted} />
                                  )}
                                </View>
                              );
                            })}
                          </ScrollView>
                        </View>
                      )}

                      {run.status === 'completed' && (
                        <TouchableOpacity 
                          style={[styles.outlineBtn, { marginTop: 12, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12 }]}
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
        {/* TAB 4: MANUFACTURING UNITS DIRECTORY */}
        {/* ======================================================== */}
        {activeTab === 'units' && (
          <View style={styles.tabContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text.primary }}>Manufacturing Facilities & Units</Text>
                <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                  Directory of manufacturing factories, units, and plant facilities ({manufacturingUnits.length} configured)
                </Text>
              </View>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => setUnitModalVisible(true)}
              >
                <Ionicons name="add-circle-outline" size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>+ Define New Unit</Text>
              </TouchableOpacity>
            </View>

            {manufacturingUnits.length > 0 ? (
              <View style={{ gap: 12 }}>
                {manufacturingUnits.map(unit => (
                  <View key={unit._id} style={[styles.card, { padding: 16, borderLeftColor: colors.primary, borderLeftWidth: 4 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="business" size={18} color={colors.primary} />
                        </View>
                        <View>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text.primary }}>{unit.name}</Text>
                          <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                            Code: <Text style={{ fontWeight: '700', color: colors.primary }}>{unit.code || 'N/A'}</Text>
                          </Text>
                        </View>
                      </View>

                      <View style={{ backgroundColor: colors.success + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.sm }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.success }}>OPERATIONAL</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, backgroundColor: colors.bg.secondary, padding: 12, borderRadius: Radius.md, marginTop: 8 }}>
                      <View style={{ flex: 1, minWidth: 140 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>LOCATION / ADDRESS</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.primary, marginTop: 2 }}>
                          {[unit.addressLine1, unit.city, unit.state, unit.pincode].filter(Boolean).join(', ') || 'No address specified'}
                        </Text>
                      </View>

                      {unit.contactPerson ? (
                        <View style={{ flex: 1, minWidth: 120 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>FACILITY CONTACT</Text>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.primary, marginTop: 2 }}>
                            👤 {unit.contactPerson} {unit.phone ? `(${unit.phone})` : ''}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="business-outline" size={48} color={colors.text.secondary} />
                <Text style={styles.emptyText}>No manufacturing units defined yet.</Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, { marginTop: 12 }]}
                  onPress={() => setUnitModalVisible(true)}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Define First Unit</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* ======================================================== */}
      {/* MODAL 0: ADD MANUFACTURING UNIT DEFINITION */}
      {/* ======================================================== */}
      <Modal visible={unitModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setUnitModalVisible(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Define New Manufacturing Unit</Text>
              <TouchableOpacity onPress={() => setUnitModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            {unitError ? <Text style={styles.modalError}>{unitError}</Text> : null}
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Unit Name *</Text>
              <TextInput style={styles.input} placeholder="e.g. Varanasi Factory" placeholderTextColor={colors.text.muted} value={unitName} onChangeText={setUnitName} />
              
              <Text style={styles.inputLabel}>Unit Code / Abbreviation *</Text>
              <TextInput style={styles.input} placeholder="e.g. MFG-VARANASI" placeholderTextColor={colors.text.muted} value={unitCode} onChangeText={setUnitCode} />

              <Text style={styles.inputLabel}>Address Line 1</Text>
              <TextInput style={styles.input} placeholder="e.g. Phase 2 Industrial Area" placeholderTextColor={colors.text.muted} value={unitAddress} onChangeText={setUnitAddress} />

              <Text style={styles.inputLabel}>City</Text>
              <TextInput style={styles.input} placeholder="e.g. Varanasi" placeholderTextColor={colors.text.muted} value={unitCity} onChangeText={setUnitCity} />

              <Text style={styles.inputLabel}>State</Text>
              <TextInput style={styles.input} placeholder="e.g. Uttar Pradesh" placeholderTextColor={colors.text.muted} value={unitState} onChangeText={setUnitState} />

              <Text style={styles.inputLabel}>Pincode</Text>
              <TextInput style={styles.input} placeholder="e.g. 221002" placeholderTextColor={colors.text.muted} value={unitPincode} onChangeText={setUnitPincode} keyboardType="numeric" />

              <Text style={styles.inputLabel}>Contact Person</Text>
              <TextInput style={styles.input} placeholder="Name" placeholderTextColor={colors.text.muted} value={unitContact} onChangeText={setUnitContact} />

              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput style={styles.input} placeholder="Phone" placeholderTextColor={colors.text.muted} value={unitPhone} onChangeText={setUnitPhone} keyboardType="phone-pad" />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setUnitModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveUnit}>
                <Text style={styles.submitBtnText}>Save Unit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 1: ADD RAW MATERIAL DEFINITION */}
      {/* ======================================================== */}
      <Modal visible={materialModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={handleCloseMaterialModal} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingMaterialId ? 'Edit Raw Material' : 'Define New Raw Material'}</Text>
              <TouchableOpacity onPress={handleCloseMaterialModal}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            {rmError ? <Text style={styles.modalError}>{rmError}</Text> : null}
            <ScrollView style={styles.modalForm}>
              <Text style={styles.inputLabel}>Ingredient Name *</Text>
              <TextInput style={styles.input} placeholder="e.g. Purified Guggulu" placeholderTextColor={colors.text.muted} value={rmName} onChangeText={setRmName} />
              
              <Text style={styles.inputLabel}>SKU / Code {editingMaterialId ? '' : '(Auto-Generated)'}</Text>
              <TextInput style={[styles.input, { backgroundColor: colors.bg.secondary, color: colors.text.muted }]} placeholder={editingMaterialId ? "Material SKU" : "Auto-generated on save"} placeholderTextColor={colors.text.muted} value={rmSku} editable={false} />

              <Text style={styles.inputLabel}>Material Classification / Category *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {[
                  { key: 'Herb', label: '🌿 Herb / Extract' },
                  { key: 'Packaging', label: '📦 Bottle / Label / Box' },
                  { key: 'Excipient', label: '💧 Liquid / Base' },
                  { key: 'General', label: '⚙️ General Material' }
                ].map(c => (
                  <TouchableOpacity
                    key={c.key}
                    onPress={() => setRmCategory(c.key)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 6,
                      borderWidth: 1,
                      backgroundColor: rmCategory === c.key ? colors.primary : colors.bg.secondary,
                      borderColor: rmCategory === c.key ? colors.primary : colors.border
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: rmCategory === c.key ? '#fff' : colors.text.secondary }}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={[styles.input, { marginBottom: 12 }]}
                placeholder="Or enter custom classification (e.g. Mineral, Solvent, Preservative)..."
                placeholderTextColor={colors.text.muted}
                value={rmCategory}
                onChangeText={setRmCategory}
              />

              <Text style={styles.inputLabel}>Measurement Unit *</Text>
              <TextInput style={styles.input} placeholder="e.g. kg, liters, g, units" placeholderTextColor={colors.text.muted} value={rmUnit} onChangeText={setRmUnit} />

              <Text style={styles.inputLabel}>Min Reorder Stock level</Text>
              <TextInput style={styles.input} placeholder="e.g. 10" placeholderTextColor={colors.text.muted} value={rmMinReorder} onChangeText={setRmMinReorder} keyboardType="numeric" />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleCloseMaterialModal}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveMaterial}>
                <Text style={styles.submitBtnText}>{editingMaterialId ? 'Save Changes' : 'Define Material'}</Text>
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

              <Text style={styles.inputLabel}>Manufacturing Unit *</Text>
              <View style={styles.pickerWrapper}>
                {Platform.OS === 'web' ? (
                  <select
                    value={prodManufacturingUnitId}
                    onChange={(e: any) => setProdManufacturingUnitId(e.target.value)}
                    style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                  >
                    <option value="">-- Select Manufacturing Unit --</option>
                    {manufacturingUnits.map(m => (
                      <option key={m._id} value={m._id}>{m.name} ({m.city || 'Default'})</option>
                    ))}
                  </select>
                ) : (
                  <TextInput style={styles.input} placeholder="Manufacturing Unit ID" value={prodManufacturingUnitId} onChangeText={setProdManufacturingUnitId} />
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
                          <Text style={{ fontSize: 12, color: colors.text.primary }}>
                            {item.itemType === 'packaging' ? '📦' : '🌿'} {item.name} {item.itemType === 'packaging' ? `(${item.ratioPct} Pcs/unit)` : `(${item.ratioPct}%)`}
                          </Text>
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
              <Text style={styles.inputLabel}>QC Decision *</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => setQcStatus('approved')}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 10,
                    borderRadius: 6,
                    borderWidth: 1,
                    backgroundColor: qcStatus === 'approved' ? colors.success : colors.bg.secondary,
                    borderColor: qcStatus === 'approved' ? colors.success : colors.border
                  }}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={qcStatus === 'approved' ? '#fff' : colors.success} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: qcStatus === 'approved' ? '#fff' : colors.text.secondary }}>
                    APPROVE BATCH
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setQcStatus('rejected')}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 10,
                    borderRadius: 6,
                    borderWidth: 1,
                    backgroundColor: qcStatus === 'rejected' ? colors.danger : colors.bg.secondary,
                    borderColor: qcStatus === 'rejected' ? colors.danger : colors.border
                  }}
                >
                  <Ionicons name="close-circle-outline" size={16} color={qcStatus === 'rejected' ? '#fff' : colors.danger} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: qcStatus === 'rejected' ? '#fff' : colors.text.secondary }}>
                    REJECT BATCH
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Actual Output Yield Size (units) *</Text>
              <TextInput style={styles.input} placeholder="e.g. 498" placeholderTextColor={colors.text.muted} value={qcYieldQty} onChangeText={setQcYieldQty} keyboardType="numeric" />

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 12 }}>
                <Text style={[styles.inputLabel, { marginBottom: 0 }]}>Split Yield into Multiple Sizes / Packages?</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setQcEnableSplit(true)}
                    style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: qcEnableSplit ? colors.primary : colors.bg.secondary, borderWidth: 1, borderColor: qcEnableSplit ? colors.primary : colors.border }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: qcEnableSplit ? '#fff' : colors.text.secondary }}>Yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setQcEnableSplit(false)}
                    style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: !qcEnableSplit ? colors.text.muted : colors.bg.secondary, borderWidth: 1, borderColor: !qcEnableSplit ? colors.text.muted : colors.border }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: !qcEnableSplit ? '#fff' : colors.text.secondary }}>No</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {qcEnableSplit && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.formIngredientsTitle, { fontSize: 12, marginBottom: 8 }]}>Split Quantities across Products:</Text>
                  {qcYields.map((item, idx) => (
                    <View key={idx} style={[styles.bomIngredientInputRow, { gap: 6 }]}>
                      <View style={[styles.pickerWrapper, { flex: 2, marginBottom: 0 }]}>
                        {Platform.OS === 'web' ? (
                          <select
                            value={item.productId}
                            onChange={(e: any) => handleQcYieldChange(idx, 'productId', e.target.value)}
                            style={{ flex: 1, padding: 8, fontSize: 11, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                          >
                            <option value="">-- Choose Product/Size --</option>
                            {products.map(p => (
                              <option key={p._id} value={p._id}>{p.name} ({p.size || 'Std'})</option>
                            ))}
                          </select>
                        ) : (
                          <TextInput style={styles.input} placeholder="Product ID" value={item.productId} onChangeText={(val) => handleQcYieldChange(idx, 'productId', val)} />
                        )}
                      </View>
                      <TextInput
                        style={[styles.input, { flex: 1.2, marginBottom: 0 }]}
                        placeholder="Qty (pcs)"
                        placeholderTextColor={colors.text.muted}
                        value={item.actualYieldQty}
                        onChangeText={(val) => handleQcYieldChange(idx, 'actualYieldQty', val)}
                        keyboardType="numeric"
                      />
                      <TouchableOpacity style={styles.removeRowBtn} onPress={() => handleRemoveQcYieldRow(idx)}>
                        <Ionicons name="remove-circle" size={20} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={[styles.addIngredientRowBtn, { marginTop: 8 }]} onPress={handleAddQcYieldRow}>
                    <Ionicons name="add" size={16} color={colors.primary} />
                    <Text style={styles.addIngredientRowBtnText}>Add Split Package</Text>
                  </TouchableOpacity>
                </View>
              )}

              <Text style={styles.inputLabel}>Target Storage Warehouse (Finished Goods) *</Text>
              <View style={styles.pickerWrapper}>
                {Platform.OS === 'web' ? (
                  <select
                    value={qcWarehouseId}
                    onChange={(e: any) => setQcWarehouseId(e.target.value)}
                    style={{ flex: 1, padding: 8, fontSize: 13, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                  >
                    <option value="">-- Choose Warehouse --</option>
                    {warehouses.map(w => (
                      <option key={w._id} value={w._id}>{w.name} ({w.city || 'Default'})</option>
                    ))}
                  </select>
                ) : (
                  <TextInput style={styles.input} placeholder="Warehouse ID" value={qcWarehouseId} onChangeText={setQcWarehouseId} />
                )}
              </View>

              <Text style={styles.inputLabel}>Waste / Shrinkage Quantity</Text>
              <TextInput style={styles.input} placeholder="e.g. 2 (leave empty to auto-calculate)" placeholderTextColor={colors.text.muted} value={qcWasteQty} onChangeText={setQcWasteQty} keyboardType="numeric" />

              <Text style={styles.inputLabel}>Waste / Variance Reason</Text>
              <TextInput style={styles.input} placeholder="e.g. Drying loss, spillage, QC rejects" placeholderTextColor={colors.text.muted} value={qcWasteReason} onChangeText={setQcWasteReason} />

              {/* GMP Quality Parameters card section */}
              <View style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, marginVertical: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>🔬 GMP Lab Specifications & Testing</Text>
                
                <Text style={styles.inputLabel}>Organoleptic Description</Text>
                <TextInput style={styles.input} placeholder="Color, odour, taste (e.g. Dark brown, herbal odour)" placeholderTextColor={colors.text.muted} value={qcOrganoleptic} onChangeText={setQcOrganoleptic} />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Moisture Content (% w/w)</Text>
                    <TextInput style={styles.input} placeholder="e.g. 4.5" placeholderTextColor={colors.text.muted} value={qcMoisture} onChangeText={setQcMoisture} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Ash Value (% w/w)</Text>
                    <TextInput style={styles.input} placeholder="e.g. 6.2" placeholderTextColor={colors.text.muted} value={qcAsh} onChangeText={setQcAsh} keyboardType="numeric" />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>pH Value</Text>
                    <TextInput style={styles.input} placeholder="e.g. 5.5" placeholderTextColor={colors.text.muted} value={qcPh} onChangeText={setQcPh} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Disintegration Time (min)</Text>
                    <TextInput style={styles.input} placeholder="e.g. 15" placeholderTextColor={colors.text.muted} value={qcDisintegration} onChangeText={setQcDisintegration} keyboardType="numeric" />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginVertical: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Heavy Metals Limit</Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {['Pass', 'Fail'].map(opt => (
                        <TouchableOpacity
                          key={opt}
                          onPress={() => setQcHeavyMetals(opt)}
                          style={{
                            flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1, alignItems: 'center',
                            backgroundColor: qcHeavyMetals === opt ? (opt === 'Pass' ? colors.success : colors.danger) : colors.bg.primary,
                            borderColor: qcHeavyMetals === opt ? (opt === 'Pass' ? colors.success : colors.danger) : colors.border
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: qcHeavyMetals === opt ? '#fff' : colors.text.secondary }}>{opt.toUpperCase()}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>Microbial Limit</Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {['Pass', 'Fail'].map(opt => (
                        <TouchableOpacity
                          key={opt}
                          onPress={() => setQcMicrobial(opt)}
                          style={{
                            flex: 1, paddingVertical: 6, borderRadius: 6, borderWidth: 1, alignItems: 'center',
                            backgroundColor: qcMicrobial === opt ? (opt === 'Pass' ? colors.success : colors.danger) : colors.bg.primary,
                            borderColor: qcMicrobial === opt ? (opt === 'Pass' ? colors.success : colors.danger) : colors.border
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: qcMicrobial === opt ? '#fff' : colors.text.secondary }}>{opt.toUpperCase()}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                <Text style={styles.inputLabel}>Lab Report Reference No. / File Link</Text>
                <TextInput style={styles.input} placeholder="e.g. LAB-2026-07-23-01" placeholderTextColor={colors.text.muted} value={qcLabReportRef} onChangeText={setQcLabReportRef} />
              </View>

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
                    {bmrReport.overheadCost !== undefined && bmrReport.overheadCost > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: colors.text.secondary }}>Allocated Process Overhead Cost:</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>₹{bmrReport.overheadCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                      </View>
                    )}
                    {bmrReport.overheadCost !== undefined && bmrReport.overheadCost > 0 && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 13, color: colors.text.secondary }}>Total Batch Production Cost:</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>₹{(bmrReport.rawMaterialCost + bmrReport.overheadCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                      </View>
                    )}
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

                {/* 5. Process Execution Log (Timeline & SOP Sign-off) */}
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                  <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section IV: Detailed Process Execution Log</Text>
                  </View>
                  <View style={{ padding: 8 }}>
                    <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 6 }}>
                      <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '700', color: colors.text.secondary }}>Stage / Process Step</Text>
                      <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: colors.text.secondary }}>Status</Text>
                      <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '700', color: colors.text.secondary }}>Operator Sign-Off</Text>
                      <Text style={{ flex: 2, fontSize: 11, fontWeight: '700', color: colors.text.secondary }}>Notes / Justification</Text>
                    </View>
                    {bmrReport.stages && bmrReport.stages.map((st: any, idx: number) => {
                      const start = st.startedAt ? new Date(st.startedAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '—';
                      const end = st.completedAt ? new Date(st.completedAt).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : '—';
                      
                      return (
                        <View key={idx} style={{ paddingVertical: 6, borderBottomWidth: idx === bmrReport.stages.length - 1 ? 0 : 0.5, borderBottomColor: colors.border }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '700', color: colors.text.primary }} numberOfLines={1}>
                              {st.name}
                            </Text>
                            <Text style={{ flex: 1, fontSize: 11, color: st.status === 'completed' ? colors.success : st.status === 'skipped' ? colors.warning : colors.text.muted, fontWeight: '600' }}>
                              {st.status.toUpperCase()}
                            </Text>
                            <Text style={{ flex: 1.5, fontSize: 11, color: colors.text.primary }}>
                              {st.completedBy || '—'}
                            </Text>
                            <Text style={{ flex: 2, fontSize: 10, color: colors.text.secondary, fontStyle: 'italic' }}>
                              {st.notes || 'No remarks recorded'}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                            <Text style={{ fontSize: 9, color: colors.text.muted }}>
                              Started: {start}
                            </Text>
                            <Text style={{ fontSize: 9, color: colors.text.muted }}>
                              Finished: {end}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* 6. QC Inspection Clearance Certification */}
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                  <View style={{ backgroundColor: colors.bg.secondary, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.primary }}>Section V: GMP Quality Assurance Sign-Off</Text>
                    {bmrReport.qcStatus === 'rejected' ? (
                      <View style={{ backgroundColor: colors.danger, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>REJECTED</Text>
                      </View>
                    ) : (
                      <View style={{ backgroundColor: colors.success, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#fff' }}>APPROVED</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ padding: 12, gap: 8 }}>
                    {bmrReport.qcParameters ? (
                      <View style={{ backgroundColor: colors.bg.primary, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.border, gap: 6, marginBottom: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: colors.text.secondary, letterSpacing: 0.5 }}>🔬 LABORATORY TEST SPECIFICATIONS SUMMARY</Text>
                        
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                          {bmrReport.qcParameters.organoleptic ? (
                            <View style={{ minWidth: 160, flex: 1 }}><Text style={{ fontSize: 11, color: colors.text.secondary }}>Organoleptic Check: <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{bmrReport.qcParameters.organoleptic}</Text></Text></View>
                          ) : null}
                          {bmrReport.qcParameters.moistureContent !== null ? (
                            <View style={{ minWidth: 160, flex: 1 }}><Text style={{ fontSize: 11, color: colors.text.secondary }}>Moisture Content: <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{bmrReport.qcParameters.moistureContent}% w/w</Text></Text></View>
                          ) : null}
                          {bmrReport.qcParameters.ashValue !== null ? (
                            <View style={{ minWidth: 160, flex: 1 }}><Text style={{ fontSize: 11, color: colors.text.secondary }}>Ash Value: <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{bmrReport.qcParameters.ashValue}% w/w</Text></Text></View>
                          ) : null}
                          {bmrReport.qcParameters.pHValue !== null ? (
                            <View style={{ minWidth: 160, flex: 1 }}><Text style={{ fontSize: 11, color: colors.text.secondary }}>pH Value: <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{bmrReport.qcParameters.pHValue}</Text></Text></View>
                          ) : null}
                          {bmrReport.qcParameters.disintegrationTime !== null ? (
                            <View style={{ minWidth: 160, flex: 1 }}><Text style={{ fontSize: 11, color: colors.text.secondary }}>Disintegration Time: <Text style={{ color: colors.text.primary, fontWeight: '700' }}>{bmrReport.qcParameters.disintegrationTime} mins</Text></Text></View>
                          ) : null}
                          {bmrReport.qcParameters.heavyMetals ? (
                            <View style={{ minWidth: 160, flex: 1 }}><Text style={{ fontSize: 11, color: colors.text.secondary }}>Heavy Metals Limit: <Text style={{ color: bmrReport.qcParameters.heavyMetals === 'Pass' ? colors.success : colors.danger, fontWeight: '800' }}>{bmrReport.qcParameters.heavyMetals.toUpperCase()}</Text></Text></View>
                          ) : null}
                          {bmrReport.qcParameters.microbialLimit ? (
                            <View style={{ minWidth: 160, flex: 1 }}><Text style={{ fontSize: 11, color: colors.text.secondary }}>Microbial Limits: <Text style={{ color: bmrReport.qcParameters.microbialLimit === 'Pass' ? colors.success : colors.danger, fontWeight: '800' }}>{bmrReport.qcParameters.microbialLimit.toUpperCase()}</Text></Text></View>
                          ) : null}
                          {bmrReport.qcParameters.labReportRef ? (
                            <View style={{ minWidth: 160, flex: 1 }}><Text style={{ fontSize: 11, color: colors.text.secondary }}>Lab Report Ref No: <Text style={{ color: colors.primary, fontWeight: '800' }}>{bmrReport.qcParameters.labReportRef}</Text></Text></View>
                          ) : null}
                        </View>
                      </View>
                    ) : null}

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
      {/* MODAL 8: END-TO-END BATCH TRACE */}
      {/* ======================================================== */}
      <Modal visible={traceModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setTraceModalVisible(false)} />
          <View style={[styles.modalContainer, { maxWidth: 1200, width: '98%', height: '90%' }]}>
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
                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 12, fontWeight: '600' }}>Fetching raw material stock ledger...</Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ gap: 16 }}>
                {/* Raw Material Stock Ledger (IN/OUT) */}
                <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.bg.card }}>
                  {/* Header */}
                  <View style={{ backgroundColor: colors.primary + '10', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: colors.primary }}>
                        📋 Raw Material Stock Ledger: {traceResult?.materialName || traceResult?.rawMaterialEntries?.[0]?.materialName || traceBatchNo || traceResult?.batchNo || 'Stock Trace'}
                      </Text>
                      {(traceResult?.materialSku || traceResult?.rawMaterialEntries?.[0]?.materialSku) && (
                        <View style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: colors.primary + '40' }}>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>
                            SKU: {traceResult?.materialSku || traceResult?.rawMaterialEntries?.[0]?.materialSku}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                    {/* Search Bar */}
                    <View style={{ paddingHorizontal: 12, backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 8, height: 38 }}>
                      <Ionicons name="search-outline" size={15} color={colors.text.muted} />
                      <TextInput
                        style={{ flex: 1, fontSize: 12, color: colors.text.primary, padding: 0 }}
                        placeholder="Search by batch number..."
                        placeholderTextColor={colors.text.muted}
                        value={traceSearch}
                        onChangeText={setTraceSearch}
                      />
                      {traceSearch.length > 0 && (
                        <TouchableOpacity onPress={() => setTraceSearch('')}>
                          <Ionicons name="close-circle" size={15} color={colors.text.muted} />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Sub-Tabs Header */}
                    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary }}>
                      <TouchableOpacity
                        onPress={() => setTraceSubTab('in')}
                        style={[
                          { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', flexDirection: 'row', justifyContent: 'center', gap: 6 },
                          traceSubTab === 'in' && { borderBottomColor: colors.success, backgroundColor: colors.success + '08' }
                        ]}
                      >
                        <Ionicons name="arrow-down-circle-outline" size={16} color={traceSubTab === 'in' ? colors.success : colors.text.muted} />
                        <Text style={[{ fontSize: 12, fontWeight: '700', color: colors.text.secondary }, traceSubTab === 'in' && { color: colors.success }]}>
                          Incoming Stock (IN)
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setTraceSubTab('out')}
                        style={[
                          { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', flexDirection: 'row', justifyContent: 'center', gap: 6 },
                          traceSubTab === 'out' && { borderBottomColor: colors.warning, backgroundColor: colors.warning + '08' }
                        ]}
                      >
                        <Ionicons name="arrow-up-circle-outline" size={16} color={traceSubTab === 'out' ? colors.warning : colors.text.muted} />
                        <Text style={[{ fontSize: 12, fontWeight: '700', color: colors.text.secondary }, traceSubTab === 'out' && { color: colors.warning }]}>
                          Outgoing Stock (OUT)
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Table View */}
                    <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                      <View style={{ minWidth: '100%', flex: 1 }}>
                        {traceSubTab === 'in' ? (
                          <>
                            {/* Table Header for IN */}
                            <View style={{ flexDirection: 'row', backgroundColor: colors.bg.secondary, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                              <Text style={{ width: 95, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Date</Text>
                              <Text style={{ width: 125, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Batch No</Text>
                              <Text style={{ flex: 1.2, minWidth: 120, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Raw Material</Text>
                              <Text style={{ width: 100, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Purchase Ref</Text>
                              <Text style={{ flex: 1.2, minWidth: 110, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Vendor / Source</Text>
                              <Text style={{ width: 100, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'left', paddingLeft: 8 }}>IN Qty</Text>
                              <Text style={{ width: 130, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'left' }}>Warehouse</Text>
                            </View>
                            {/* Table Body for IN */}
                            {(() => {
                              const parseDate = (val: any) => {
                                if (!val) return new Date();
                                const d = new Date(val);
                                return isNaN(d.getTime()) ? new Date() : d;
                              };
                              const inEntries = traceResult?.rawMaterialEntries || [];
                              const filtered = inEntries.filter((e: any) => {
                                if (!traceSearch) return true;
                                return e.batchNo?.toLowerCase().includes(traceSearch.toLowerCase()) ||
                                       e.materialName?.toLowerCase().includes(traceSearch.toLowerCase()) ||
                                       e.purchaseRef?.toLowerCase().includes(traceSearch.toLowerCase());
                              });

                              if (filtered.length === 0) {
                                return <Text style={{ padding: 16, textAlign: 'center', color: colors.text.secondary }}>No matching incoming stock found.</Text>;
                              }

                              return filtered.map((row: any, idx: number) => (
                                <View key={idx} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: idx < filtered.length - 1 ? 0.5 : 0, borderBottomColor: colors.border, alignItems: 'center' }}>
                                  <Text style={{ width: 95, fontSize: 11, color: colors.text.secondary }}>
                                    {parseDate(row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </Text>
                                  <Text style={{ width: 125, fontSize: 11, fontWeight: '700', color: colors.text.primary }}>
                                    {row.batchNo}
                                  </Text>
                                  <Text style={{ flex: 1.2, minWidth: 120, fontSize: 11, fontWeight: '600', color: colors.text.primary }} numberOfLines={1}>
                                    🌿 {row.materialName || 'Raw Material'}
                                  </Text>
                                  <Text style={{ width: 100, fontSize: 11, color: colors.text.primary, fontWeight: '600' }}>
                                    {row.purchaseRef || 'Inward'}
                                  </Text>
                                  <Text style={{ flex: 1.2, minWidth: 110, fontSize: 11, color: colors.text.primary }} numberOfLines={1}>
                                    {row.vendorName || 'Direct'}
                                  </Text>
                                  <Text style={{ width: 100, fontSize: 11, fontWeight: '700', color: colors.success, textAlign: 'left', paddingLeft: 8 }} numberOfLines={1}>
                                    {row.qty.toFixed(1)} {row.unit}
                                  </Text>
                                  <Text style={{ width: 130, fontSize: 11, color: colors.primary, fontWeight: '600', textAlign: 'left' }} numberOfLines={1}>
                                    {row.warehouseName || '-'}
                                  </Text>
                                </View>
                              ));
                            })()}
                          </>
                        ) : (
                          <>
                            {/* Table Header for OUT */}
                            <View style={{ flexDirection: 'row', backgroundColor: colors.bg.secondary, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                              <Text style={{ width: 90, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Date</Text>
                              <Text style={{ width: 140, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Production Batch No</Text>
                              <Text style={{ flex: 1.5, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Product Name</Text>
                              <Text style={{ width: 100, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Consumed Qty</Text>
                              <Text style={{ width: 140, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Manufacturing Unit</Text>
                            </View>
                            {/* Table Body for OUT */}
                            {(() => {
                              const parseDate = (val: any) => {
                                if (!val) return new Date();
                                const d = new Date(val);
                                return isNaN(d.getTime()) ? new Date() : d;
                              };
                              const outItems = (traceResult?.productionBatches || []).filter((b: any) => b.relation === 'raw_material_consumed_in');
                              const filtered = outItems.filter((b: any) => {
                                if (!traceSearch) return true;
                                return b.batchNo?.toLowerCase().includes(traceSearch.toLowerCase()) ||
                                       b.productName?.toLowerCase().includes(traceSearch.toLowerCase()) ||
                                       b.warehouseName?.toLowerCase().includes(traceSearch.toLowerCase());
                              });

                              if (filtered.length === 0) {
                                return <Text style={{ padding: 16, textAlign: 'center', color: colors.text.secondary }}>No matching outgoing consumption found.</Text>;
                              }

                              return filtered.map((row: any, idx: number) => (
                                <View key={idx} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: idx < filtered.length - 1 ? 0.5 : 0, borderBottomColor: colors.border, alignItems: 'center' }}>
                                  <Text style={{ width: 90, fontSize: 11, color: colors.text.secondary }}>
                                    {parseDate(row.startDate || row.endDate || row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                  </Text>
                                  <Text style={{ width: 140, fontSize: 11, fontWeight: '700', color: colors.text.primary }}>
                                    {row.batchNo}
                                  </Text>
                                  <Text style={{ flex: 1.5, fontSize: 11, color: colors.text.primary }} numberOfLines={1}>
                                    {row.productName}
                                  </Text>
                                  <Text style={{ width: 100, fontSize: 11, fontWeight: '700', color: colors.warning, textAlign: 'right' }}>
                                    {row.qtyConsumed.toFixed(1)} {traceResult.rawMaterialEntries?.[0]?.unit || ''}
                                  </Text>
                                  <Text style={{ width: 140, fontSize: 11, color: colors.primary, fontWeight: '600', textAlign: 'right' }} numberOfLines={1}>
                                    🏭 {row.warehouseName || 'Factory Unit'}
                                  </Text>
                                </View>
                              ));
                            })()}
                          </>
                        )}
                      </View>
                    </ScrollView>
                  </View>

                {/* Finished Goods Stock */}
                {!!traceResult?.finishedGoodsEntries?.length && (
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: colors.success + '15', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.success }}>📊 Finished Goods Stock ({traceResult.finishedGoodsEntries.length})</Text>
                    </View>
                    {traceResult.finishedGoodsEntries.map((e: any) => (
                      <View key={e._id} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{e.productName}</Text>
                        <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                          {e.qtyBoxes * (e.packing || 1)} pcs • {e.warehouseName} {e.manufacturingUnitName ? `• 🏭 ${e.manufacturingUnitName}` : ''}
                          {e.mfgDate ? ` • Mfg: ${new Date(e.mfgDate).toLocaleDateString()}` : ''}
                          {e.expiryDate ? ` • Exp: ${new Date(e.expiryDate).toLocaleDateString()}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Challans */}
                {!!traceResult?.challans?.length && (
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' }}>
                    <View style={{ backgroundColor: colors.primary + '10', padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>📋 Challans ({traceResult.challans.length})</Text>
                    </View>
                    {traceResult.challans.map((c: any) => (
                      <View key={c._id} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>{c.challanNo} — {c.partyName}</Text>
                        <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                          {c.items.map((i: any) => `${i.name}: ${i.qty} pcs`).join(', ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Invoices */}
                {!!traceResult?.invoices?.length && (
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
                {!!traceResult?.dispatches?.length && (
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
                          Items: {d.items.map((i: any) => `${i.name}: ${i.qty} pcs`).join(', ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {!traceResult?.rawMaterialEntries?.length && !traceResult?.productionBatches?.length && 
                 !traceResult?.finishedGoodsEntries?.length && !traceResult?.challans?.length &&
                 !traceResult?.invoices?.length && !traceResult?.dispatches?.length && (
                  <View style={{ alignItems: 'center', padding: 24 }}>
                    <Ionicons name="search-outline" size={40} color={colors.text.muted} />
                    <Text style={{ color: colors.text.muted, fontSize: 13, marginTop: 8 }}>
                      No trace records found for "{decodeURIComponent(traceResult?.materialName || traceResult?.batchNo || traceBatchNo || '')}"
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTraceModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 9: STAGE ADVANCE / SKIP CONFIRMATION */}
      {/* ======================================================== */}
      <Modal visible={stageModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => setStageModalVisible(false)} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {stageAction === 'advance' ? 'Complete Manufacturing Stage' : 'Skip Manufacturing Stage'}
              </Text>
              <TouchableOpacity onPress={() => setStageModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            {stageError ? <Text style={styles.modalError}>{stageError}</Text> : null}
            <ScrollView style={styles.modalForm}>
              <Text style={{ fontSize: 13, color: colors.text.secondary, marginBottom: 12 }}>
                {stageAction === 'advance' 
                  ? 'Confirm that this production stage has been successfully processed and completed.'
                  : 'Specify the justification reason for bypassing this manufacturing step.'}
              </Text>

              <Text style={styles.inputLabel}>Operator / Signoff By *</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Enter operator or supervisor name" 
                placeholderTextColor={colors.text.muted} 
                value={stageOperator} 
                onChangeText={setStageOperator} 
              />

              <Text style={styles.inputLabel}>
                {stageAction === 'advance' ? 'Process Notes / Observations (Optional)' : 'Reason for Skipping *'}
              </Text>
              <TextInput
                style={[styles.input, { height: 80, paddingVertical: 8 }]}
                placeholder={stageAction === 'advance' ? "e.g. Temperature stable, mixing completed in 40 mins" : "e.g. Stage not required for this specific formulation run"}
                placeholderTextColor={colors.text.muted}
                value={stageNotes}
                onChangeText={setStageNotes}
                multiline
                numberOfLines={3}
              />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setStageModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.submitBtn, stageAction === 'skip' ? { backgroundColor: colors.warning } : null]} 
                onPress={handleSaveStageAction}
              >
                <Text style={styles.submitBtnText}>
                  {stageAction === 'advance' ? 'Complete Stage' : 'Skip Stage'}
                </Text>
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
