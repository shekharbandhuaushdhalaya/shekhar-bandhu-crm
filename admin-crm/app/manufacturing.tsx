import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
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

// ── Extracted Modal Components ─────────────────────────────────────────────
import RawMaterialModal from './manufacturing/modals/RawMaterialModal';
import BOMModal from './manufacturing/modals/BOMModal';
import LaunchBatchModal from './manufacturing/modals/LaunchBatchModal';
import QCSignoffModal from './manufacturing/modals/QCSignoffModal';
import BMRReportModal from './manufacturing/modals/BMRReportModal';
import ManufacturingUnitModal from './manufacturing/modals/ManufacturingUnitModal';
import { createStyles } from './manufacturing/manufacturingStyles';

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
  const [bomDefaultProductionType, setBomDefaultProductionType] = useState<'in_house' | 'job_work'>('in_house');
  const [bomDefaultJobWorkMode, setBomDefaultJobWorkMode] = useState<'raw_materials_supplied' | 'direct_purchase' | 'none'>('none');
  const [bomDefaultPackagingMode, setBomDefaultPackagingMode] = useState<'packed_by_vendor' | 'self_packed'>('self_packed');
  const [bomDefaultJobWorkerId, setBomDefaultJobWorkerId] = useState('');
  const [editingBomId, setEditingBomId] = useState<string | null>(null);
  const [bomStages, setBomStages] = useState<{ name: string; targetDurationDays: string }[]>([
    { name: '', targetDurationDays: '1' }
  ]);

  // Form States — Production Launch
  const [prodProductId, setProdProductId] = useState('');
  const [prodPlannedQty, setProdPlannedQty] = useState('');
  const [prodBatchNo, setProdBatchNo] = useState('');
  const [prodProductionType, setProdProductionType] = useState<'in_house' | 'job_work'>('in_house');
  const [prodJobWorkMode, setProdJobWorkMode] = useState<'raw_materials_supplied' | 'direct_purchase' | 'none'>('none');
  const [prodPackagingMode, setProdPackagingMode] = useState<'packed_by_vendor' | 'self_packed'>('packed_by_vendor');
  const [prodJobWorkerId, setProdJobWorkerId] = useState('');
  const [prodJobWorkerName, setProdJobWorkerName] = useState('');
  const [prodJobWorkerChallanRef, setProdJobWorkerChallanRef] = useState('');
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
  const [qcJobWorkerCertificateRef, setQcJobWorkerCertificateRef] = useState('');
  const [qcCoaDocumentRef, setQcCoaDocumentRef] = useState('');
  const [qcJobWorkCharges, setQcJobWorkCharges] = useState('');
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
        stages: filteredStages,
        defaultProductionType: bomDefaultProductionType,
        defaultJobWorkMode: bomDefaultProductionType === 'job_work' ? bomDefaultJobWorkMode : 'none',
        defaultPackagingMode: bomDefaultProductionType === 'job_work' ? bomDefaultPackagingMode : 'self_packed',
        defaultJobWorkerId: bomDefaultProductionType === 'job_work' ? (bomDefaultJobWorkerId || null) : null
      });

      setSelectedProdId('');
      setBomYield('100');
      setBomIngredients([{ rawMaterialId: '', qtyRequired: '' }]);
      setBomIsActive(true);
      setBomNotes('');
      setBomOverhead('0');
      setBomDefaultProductionType('in_house');
      setBomDefaultJobWorkMode('none');
      setBomDefaultPackagingMode('self_packed');
      setBomDefaultJobWorkerId('');
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
        manufacturingUnitId: prodManufacturingUnitId,
        productionType: prodProductionType,
        jobWorkMode: prodProductionType === 'job_work' ? prodJobWorkMode : 'none',
        packagingMode: prodProductionType === 'in_house' ? 'self_packed' : prodPackagingMode,
        jobWorkerId: prodProductionType === 'job_work' ? (prodJobWorkerId || null) : null,
        jobWorkerName: prodProductionType === 'job_work' ? prodJobWorkerName : '',
        jobWorkerChallanRef: prodProductionType === 'job_work' ? prodJobWorkerChallanRef : ''
      });

      setProdProductId('');
      setProdPlannedQty('');
      setProdBatchNo('');
      setProdManufacturingUnitId('');
      setProdProductionType('in_house');
      setProdJobWorkMode('none');
      setProdPackagingMode('packed_by_vendor');
      setProdJobWorkerId('');
      setProdJobWorkerName('');
      setProdJobWorkerChallanRef('');
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
        warehouseId: qcWarehouseId,
        jobWorkerCertificateRef: selectedBatchRun.productionType === 'job_work' ? qcJobWorkerCertificateRef.trim() : '',
        coaDocumentRef: selectedBatchRun.productionType === 'job_work' ? qcCoaDocumentRef.trim() : '',
        jobWorkCharges: selectedBatchRun.productionType === 'job_work' ? (parseFloat(qcJobWorkCharges) || 0) : 0
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
      setQcJobWorkerCertificateRef('');
      setQcCoaDocumentRef('');
      setQcJobWorkCharges('');
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
  const isDirectPurchaseJobWork = prodProductionType === 'job_work' && prodJobWorkMode === 'direct_purchase';
  if (matchingBom && !isNaN(plannedVal) && plannedVal > 0 && !isDirectPurchaseJobWork) {
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

      {/* ── Modals (extracted into focused components) ─────────────────────────── */}

      <ManufacturingUnitModal
        visible={unitModalVisible}
        unitName={unitName} setUnitName={setUnitName}
        unitCode={unitCode} setUnitCode={setUnitCode}
        unitAddress={unitAddress} setUnitAddress={setUnitAddress}
        unitCity={unitCity} setUnitCity={setUnitCity}
        unitState={unitState} setUnitState={setUnitState}
        unitPincode={unitPincode} setUnitPincode={setUnitPincode}
        unitContact={unitContact} setUnitContact={setUnitContact}
        unitPhone={unitPhone} setUnitPhone={setUnitPhone}
        unitError={unitError}
        onClose={() => setUnitModalVisible(false)}
        onSave={handleSaveUnit}
      />

      <RawMaterialModal
        visible={materialModalVisible}
        editingMaterialId={editingMaterialId}
        rmName={rmName} setRmName={setRmName}
        rmSku={rmSku}
        rmUnit={rmUnit} setRmUnit={setRmUnit}
        rmCategory={rmCategory} setRmCategory={setRmCategory}
        rmMinReorder={rmMinReorder} setRmMinReorder={setRmMinReorder}
        rmError={rmError}
        onClose={handleCloseMaterialModal}
        onSave={handleSaveMaterial}
      />

      <BOMModal
        visible={bomModalVisible}
        editingBomId={editingBomId}
        selectedProdId={selectedProdId} setSelectedProdId={setSelectedProdId}
        bomYield={bomYield} setBomYield={setBomYield}
        bomIngredients={bomIngredients}
        bomError={bomError}
        bomIsActive={bomIsActive} setBomIsActive={setBomIsActive}
        bomNotes={bomNotes} setBomNotes={setBomNotes}
        bomOverhead={bomOverhead} setBomOverhead={setBomOverhead}
        bomDefaultProductionType={bomDefaultProductionType} setBomDefaultProductionType={setBomDefaultProductionType}
        bomDefaultJobWorkMode={bomDefaultJobWorkMode} setBomDefaultJobWorkMode={setBomDefaultJobWorkMode}
        bomDefaultPackagingMode={bomDefaultPackagingMode} setBomDefaultPackagingMode={setBomDefaultPackagingMode}
        bomDefaultJobWorkerId={bomDefaultJobWorkerId} setBomDefaultJobWorkerId={setBomDefaultJobWorkerId}
        bomStages={bomStages}
        products={products}
        materials={materials}
        vendors={vendors}
        onClose={() => setBomModalVisible(false)}
        onSave={handleSaveBOM}
        onAddIngredient={handleAddIngredientRow}
        onRemoveIngredient={handleRemoveIngredientRow}
        onIngredientChange={handleIngredientChange}
        onAddStage={handleAddStageRow}
        onRemoveStage={handleRemoveStageRow}
        onStageChange={handleStageChange}
      />

      <LaunchBatchModal
        visible={productionModalVisible}
        products={products}
        vendors={vendors}
        manufacturingUnits={manufacturingUnits}
        boms={boms}
        materials={materials}
        prodProductId={prodProductId} setProdProductId={setProdProductId}
        prodPlannedQty={prodPlannedQty} setProdPlannedQty={setProdPlannedQty}
        prodBatchNo={prodBatchNo} setProdBatchNo={setProdBatchNo}
        prodProductionType={prodProductionType} setProdProductionType={setProdProductionType}
        prodJobWorkMode={prodJobWorkMode} setProdJobWorkMode={setProdJobWorkMode}
        prodPackagingMode={prodPackagingMode} setProdPackagingMode={setProdPackagingMode}
        prodJobWorkerId={prodJobWorkerId} setProdJobWorkerId={setProdJobWorkerId}
        prodJobWorkerName={prodJobWorkerName} setProdJobWorkerName={setProdJobWorkerName}
        prodJobWorkerChallanRef={prodJobWorkerChallanRef} setProdJobWorkerChallanRef={setProdJobWorkerChallanRef}
        prodManufacturingUnitId={prodManufacturingUnitId} setProdManufacturingUnitId={setProdManufacturingUnitId}
        prodError={prodError}
        previewIngredients={previewIngredients}
        onClose={() => setProductionModalVisible(false)}
        onLaunch={handleStartProduction}
      />

      <QCSignoffModal
        visible={qcModalVisible}
        selectedBatchRun={selectedBatchRun}
        warehouses={warehouses}
        products={products}
        qcYieldQty={qcYieldQty} setQcYieldQty={setQcYieldQty}
        qcPacking={qcPacking} setQcPacking={setQcPacking}
        qcWasteQty={qcWasteQty} setQcWasteQty={setQcWasteQty}
        qcWasteReason={qcWasteReason} setQcWasteReason={setQcWasteReason}
        qcNotes={qcNotes} setQcNotes={setQcNotes}
        qcPassedBy={qcPassedBy} setQcPassedBy={setQcPassedBy}
        qcStatus={qcStatus} setQcStatus={setQcStatus}
        qcOrganoleptic={qcOrganoleptic} setQcOrganoleptic={setQcOrganoleptic}
        qcMoisture={qcMoisture} setQcMoisture={setQcMoisture}
        qcAsh={qcAsh} setQcAsh={setQcAsh}
        qcPh={qcPh} setQcPh={setQcPh}
        qcDisintegration={qcDisintegration} setQcDisintegration={setQcDisintegration}
        qcHeavyMetals={qcHeavyMetals} setQcHeavyMetals={setQcHeavyMetals}
        qcMicrobial={qcMicrobial} setQcMicrobial={setQcMicrobial}
        qcLabReportRef={qcLabReportRef} setQcLabReportRef={setQcLabReportRef}
        qcJobWorkerCertificateRef={qcJobWorkerCertificateRef} setQcJobWorkerCertificateRef={setQcJobWorkerCertificateRef}
        qcCoaDocumentRef={qcCoaDocumentRef} setQcCoaDocumentRef={setQcCoaDocumentRef}
        qcJobWorkCharges={qcJobWorkCharges} setQcJobWorkCharges={setQcJobWorkCharges}
        qcWarehouseId={qcWarehouseId} setQcWarehouseId={setQcWarehouseId}
        qcError={qcError}
        qcEnableSplit={qcEnableSplit} setQcEnableSplit={setQcEnableSplit}
        qcYields={qcYields}
        onClose={() => setQcModalVisible(false)}
        onComplete={handleCompleteProduction}
        onAddQcYieldRow={handleAddQcYieldRow}
        onRemoveQcYieldRow={handleRemoveQcYieldRow}
        onQcYieldChange={handleQcYieldChange}
      />

      <BMRReportModal
        visible={bmrModalVisible}
        loadingBmr={loadingBmr}
        bmrReport={bmrReport}
        onClose={() => setBmrModalVisible(false)}
        onPrint={handlePrintBMR}
      />

      {/* ── Genealogy / Trace / Stage Modals (unchanged inline) ────────────────── */}
      {/* MODAL 7: BATCH GENEALOGY */}
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
                                  <View style={{ width: 130, paddingLeft: 8 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.success }}>
                                      {(row.initialQty !== undefined ? row.initialQty : row.qty).toFixed(1)} {row.unit}
                                    </Text>
                                    {row.initialQty !== undefined && row.initialQty !== row.qty && (
                                      <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 1 }}>
                                        ({row.qty.toFixed(1)} remaining)
                                      </Text>
                                    )}
                                  </View>
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
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.bg.card }}>
                    <View style={{ backgroundColor: colors.success + '15', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.success }}>📊 Finished Goods Stock ({traceResult.finishedGoodsEntries.length})</Text>
                    </View>
                    <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                      <View style={{ minWidth: '100%', flex: 1 }}>
                        <View style={{ flexDirection: 'row', backgroundColor: colors.bg.secondary, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                          <Text style={{ flex: 1.5, minWidth: 150, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Product Name</Text>
                          <Text style={{ width: 100, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'left' }}>In-Stock Qty</Text>
                          <Text style={{ width: 140, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Warehouse</Text>
                          <Text style={{ width: 100, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Mfg Date</Text>
                          <Text style={{ width: 100, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Exp Date</Text>
                        </View>
                        {traceResult.finishedGoodsEntries.map((e: any, idx: number) => (
                          <View key={e._id} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: idx < traceResult.finishedGoodsEntries.length - 1 ? 0.5 : 0, borderBottomColor: colors.border, alignItems: 'center' }}>
                            <Text style={{ flex: 1.5, minWidth: 150, fontSize: 11, fontWeight: '600', color: colors.text.primary }}>{e.productName}</Text>
                            <Text style={{ width: 100, fontSize: 11, fontWeight: '700', color: colors.success }}>{e.qtyBoxes * (e.packing || 1)} Pcs</Text>
                            <Text style={{ width: 140, fontSize: 11, color: colors.primary, fontWeight: '600' }}>{e.warehouseName}</Text>
                            <Text style={{ width: 100, fontSize: 11, color: colors.text.secondary }}>{e.mfgDate ? new Date(e.mfgDate).toLocaleDateString('en-IN') : '—'}</Text>
                            <Text style={{ width: 100, fontSize: 11, color: colors.text.secondary }}>{e.expiryDate ? new Date(e.expiryDate).toLocaleDateString('en-IN') : '—'}</Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}

                {/* Challans */}
                {!!traceResult?.challans?.length && (
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.bg.card }}>
                    <View style={{ backgroundColor: colors.primary + '10', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary }}>📋 Challans / Delivery Challans ({traceResult.challans.length})</Text>
                    </View>
                    <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                      <View style={{ minWidth: '100%', flex: 1 }}>
                        <View style={{ flexDirection: 'row', backgroundColor: colors.bg.secondary, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                          <Text style={{ width: 120, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Doc No</Text>
                          <Text style={{ width: 90, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Date</Text>
                          <Text style={{ flex: 1, minWidth: 220, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Party</Text>
                          <Text style={{ width: 130, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Warehouse</Text>
                          <Text style={{ width: 100, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Type</Text>
                          <Text style={{ width: 100, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Status</Text>
                        </View>
                        {traceResult.challans.map((c: any, idx: number) => (
                          <View key={c._id} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: idx < traceResult.challans.length - 1 ? 0.5 : 0, borderBottomColor: colors.border, alignItems: 'center' }}>
                            <Text style={{ width: 120, fontSize: 11, fontWeight: '700', color: colors.primary }}>{c.challanNo}</Text>
                            <Text style={{ width: 90, fontSize: 11, color: colors.text.secondary }}>{new Date(c.date).toLocaleDateString('en-IN')}</Text>
                            <Text style={{ flex: 1, minWidth: 220, fontSize: 11, color: colors.text.primary }} numberOfLines={1}>{c.partyName}</Text>
                            <Text style={{ width: 130, fontSize: 11, color: colors.text.secondary }} numberOfLines={1}>{c.warehouseName || '—'}</Text>
                            <Text style={{ width: 100, fontSize: 11, color: colors.text.secondary }}>{c.type ? (c.type.charAt(0).toUpperCase() + c.type.slice(1)) : 'Sale'}</Text>
                            <View style={{ width: 100 }}>
                              <View style={[styles.statusBadge, { 
                                borderColor: c.status === 'dispatched' ? colors.success : (c.status === 'draft' ? colors.primary : colors.text.muted), 
                                backgroundColor: (c.status === 'dispatched' ? colors.success : (c.status === 'draft' ? colors.primary : colors.text.muted)) + '10',
                                alignSelf: 'flex-start',
                                paddingVertical: 2,
                                paddingHorizontal: 6
                              }]}>
                                <Text style={{ color: c.status === 'dispatched' ? colors.success : (c.status === 'draft' ? colors.primary : colors.text.muted), fontSize: 9, fontWeight: '800' }}>
                                  {c.status.toUpperCase()}
                                </Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}

                {/* Invoices */}
                {!!traceResult?.invoices?.length && (
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.bg.card }}>
                    <View style={{ backgroundColor: colors.success + '10', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.success }}>🧾 Invoices / Customer Bills ({traceResult.invoices.length})</Text>
                    </View>
                    <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                      <View style={{ minWidth: '100%', flex: 1 }}>
                        <View style={{ flexDirection: 'row', backgroundColor: colors.bg.secondary, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                          <Text style={{ width: 120, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Doc No</Text>
                          <Text style={{ width: 90, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Date</Text>
                          <Text style={{ flex: 1, minWidth: 220, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Party</Text>
                          <Text style={{ width: 130, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Warehouse</Text>
                          <Text style={{ width: 100, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Status</Text>
                          <Text style={{ width: 100, fontSize: 10, fontWeight: '700', color: colors.text.secondary, textAlign: 'right' }}>Amount</Text>
                        </View>
                        {traceResult.invoices.map((inv: any, idx: number) => (
                          <View key={inv._id} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: idx < traceResult.invoices.length - 1 ? 0.5 : 0, borderBottomColor: colors.border, alignItems: 'center' }}>
                            <Text style={{ width: 120, fontSize: 11, fontWeight: '700', color: colors.primary }}>{inv.invoiceNo}</Text>
                            <Text style={{ width: 90, fontSize: 11, color: colors.text.secondary }}>{new Date(inv.date).toLocaleDateString('en-IN')}</Text>
                            <Text style={{ flex: 1, minWidth: 220, fontSize: 11, color: colors.text.primary }} numberOfLines={1}>{inv.customerName}</Text>
                            <Text style={{ width: 130, fontSize: 11, color: colors.text.secondary }} numberOfLines={1}>{inv.warehouseName || '—'}</Text>
                            <View style={{ width: 100 }}>
                              <View style={[styles.statusBadge, { 
                                borderColor: inv.status === 'paid' ? colors.success : colors.warning, 
                                backgroundColor: (inv.status === 'paid' ? colors.success : colors.warning) + '10',
                                alignSelf: 'flex-start',
                                paddingVertical: 2,
                                paddingHorizontal: 6
                              }]}>
                                <Text style={{ color: inv.status === 'paid' ? colors.success : colors.warning, fontSize: 9, fontWeight: '800' }}>
                                  {inv.status.toUpperCase()}
                                </Text>
                              </View>
                            </View>
                            <Text style={{ width: 100, fontSize: 11, fontWeight: '700', color: colors.text.primary, textAlign: 'right' }}>₹{inv.amount.toLocaleString('en-IN')}</Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}

                {/* Dispatches */}
                {!!traceResult?.dispatches?.length && (
                  <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.bg.card }}>
                    <View style={{ backgroundColor: colors.warning + '10', padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.warning }}>🚚 Dispatch Logistics ({traceResult.dispatches.length})</Text>
                    </View>
                    <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                      <View style={{ minWidth: '100%', flex: 1 }}>
                        <View style={{ flexDirection: 'row', backgroundColor: colors.bg.secondary, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                          <Text style={{ width: 95, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Date</Text>
                          <Text style={{ width: 110, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Dispatch No</Text>
                          <Text style={{ flex: 1.2, minWidth: 140, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Consignee Name</Text>
                          <Text style={{ flex: 1, minWidth: 110, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Transporter / LR No</Text>
                          <Text style={{ width: 100, fontSize: 10, fontWeight: '700', color: colors.text.secondary }}>Tracking ID</Text>
                        </View>
                        {traceResult.dispatches.map((d: any, idx: number) => (
                          <View key={d._id} style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: idx < traceResult.dispatches.length - 1 ? 0.5 : 0, borderBottomColor: colors.border, alignItems: 'center' }}>
                            <Text style={{ width: 95, fontSize: 11, color: colors.text.secondary }}>{d.dispatchDate ? new Date(d.dispatchDate).toLocaleDateString('en-IN') : '—'}</Text>
                            <Text style={{ width: 110, fontSize: 11, fontWeight: '700', color: colors.text.primary }}>{d.dispatchNo}</Text>
                            <Text style={{ flex: 1.2, minWidth: 140, fontSize: 11, color: colors.text.primary }}>{d.customerName}</Text>
                            <Text style={{ flex: 1, minWidth: 110, fontSize: 11, color: colors.text.primary }} numberOfLines={1}>
                              {d.transporter || '—'} {d.lrNo ? `| LR: ${d.lrNo}` : ''}
                            </Text>
                            <Text style={{ width: 100, fontSize: 11, color: colors.primary, fontWeight: '600' }} numberOfLines={1}>{d.trackingId || '—'}</Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
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

