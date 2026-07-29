import React, { useEffect, useState, useCallback, useRef } from 'react';
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

import RawMaterialsTab from './manufacturing/components/RawMaterialsTab';
import BatchProductionsTab from './manufacturing/components/BatchProductionsTab';
import ProductionSchedulerTab from './manufacturing/components/ProductionSchedulerTab';
import ManufacturingUnitsTab from './manufacturing/components/ManufacturingUnitsTab';
import StockTraceModal from './manufacturing/modals/StockTraceModal';

const isIntegerQty = (unit?: string, category?: string) => {
  const u = (unit || '').toLowerCase().trim();
  const c = (category || '').toLowerCase().trim();
  return u === 'pcs' && (c === 'packing' || c === 'packaging');
};

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
  const [stageAction, setStageAction] = useState<'advance' | 'skip' | 'fail' | null>(null);
  const [stageBatchId, setStageBatchId] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState<number | null>(null);
  const [stageOperator, setStageOperator] = useState('Operator');
  const [mfgUnitFilter, setMfgUnitFilter] = useState('all');
  const [stageNotes, setStageNotes] = useState('');
  const [stageModalVisible, setStageModalVisible] = useState(false);
  const [stageError, setStageError] = useState('');
  const [stageIngredients, setStageIngredients] = useState<{ rawMaterialId: string; name: string; unit: string; qtyTheoretical: number; actualQty: string; wastage: string; itemType?: string; qtyRequiredPerUnit?: number }[]>([]);
  const [stageLossReason, setStageLossReason] = useState('');
  const [stageOutputYield, setStageOutputYield] = useState('');

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
  const [rmStockLevel, setRmStockLevel] = useState('');
  const [rmOriginalStockLevel, setRmOriginalStockLevel] = useState(0);
  const [rmAdjustmentReason, setRmAdjustmentReason] = useState('');



  // Form States — BOM Recipe
  const [selectedProdId, setSelectedProdId] = useState('');
  const [bomYield, setBomYield] = useState('100');
  const [bomIngredients, setBomIngredients] = useState<{ rawMaterialId: string; qtyRequired: string; stageName?: string }[]>([
    { rawMaterialId: '', qtyRequired: '' }
  ]);
  const [bomError, setBomError] = useState('');
  const [bomIsActive, setBomIsActive] = useState(true);
  const [bomIsDefault, setBomIsDefault] = useState(true);
  const [bomRecipeName, setBomRecipeName] = useState('Standard Recipe');
  const [bomNotes, setBomNotes] = useState('');
  const [bomOverhead, setBomOverhead] = useState('0');
  const [bomDefaultProductionType, setBomDefaultProductionType] = useState<'in_house' | 'job_work'>('in_house');
  const [bomDefaultJobWorkMode, setBomDefaultJobWorkMode] = useState<'raw_materials_supplied' | 'direct_purchase' | 'none'>('none');
  const [bomDefaultPackagingMode, setBomDefaultPackagingMode] = useState<'packed_by_vendor' | 'self_packed'>('self_packed');
  const [bomDefaultJobWorkerId, setBomDefaultJobWorkerId] = useState('');
  const [editingBomId, setEditingBomId] = useState<string | null>(null);
  const [bomStages, setBomStages] = useState<{ name: string; targetDurationDays: string }[]>([
    { name: 'Packaging & Labeling', targetDurationDays: '1' }
  ]);

  // Form States — Production Launch
  const [prodProductId, setProdProductId] = useState('');
  const [prodBomId, setProdBomId] = useState('');
  const [prodPlannedQty, setProdPlannedQty] = useState('');
  const [prodBatchNo, setProdBatchNo] = useState('');
  const [prodExpiryMonths, setProdExpiryMonths] = useState('');
  const [prodProductionType, setProdProductionType] = useState<'in_house' | 'job_work'>('in_house');
  const [prodJobWorkMode, setProdJobWorkMode] = useState<'raw_materials_supplied' | 'direct_purchase' | 'none'>('none');
  const [prodPackagingMode, setProdPackagingMode] = useState<'packed_by_vendor' | 'self_packed'>('packed_by_vendor');
  const [prodJobWorkerId, setProdJobWorkerId] = useState('');
  const [prodJobWorkerName, setProdJobWorkerName] = useState('');
  const [prodJobWorkerChallanRef, setProdJobWorkerChallanRef] = useState('');
  const [prodError, setProdError] = useState('');
  const [prodPlannedYields, setProdPlannedYields] = useState<{ productId: string; plannedQty: string; size: string; enabled: boolean }[]>([]);

  // When product changes, populate size variants for multi-size batch planning
  useEffect(() => {
    if (prodProductId) {
      const parent = products.find(p => p._id === prodProductId);
      const children = products.filter(p => p.parentId === prodProductId);
      // Include the parent product itself as the first size option,
      // since the parent also represents a producible size (e.g., "200 ml").
      // Deduplicate by _id to avoid any accidental duplicates in the list
      const allSizeMap = new Map<string, any>();
      if (parent) allSizeMap.set(parent._id, parent);
      children.forEach(c => { if (!allSizeMap.has(c._id)) allSizeMap.set(c._id, c); });
      const allSizes = [...allSizeMap.values()];
      if (allSizes.length > 0) {
        setProdPlannedYields(allSizes.map((s, i) => ({
          productId: s._id,
          plannedQty: i === 0 ? (prodPlannedQty || '100') : '',
          size: s.size || '',
          enabled: i === 0
        })));
      } else {
        setProdPlannedYields([]);
      }
    } else {
      setProdPlannedYields([]);
    }
  }, [prodProductId]);

  // Compute total planned qty from yields if multi-size, else use single input
  const computedTotalQty = prodPlannedYields.some(y => y.enabled)
    ? prodPlannedYields.filter(y => y.enabled).reduce((sum, y) => sum + (Number(y.plannedQty) || 0), 0)
    : (Number(prodPlannedQty) || 0);

  // Sync single planned qty input with total from yields
  useEffect(() => {
    if (prodPlannedYields.some(y => y.enabled)) {
      const total = prodPlannedYields.filter(y => y.enabled).reduce((sum, y) => sum + (Number(y.plannedQty) || 0), 0);
      if (total > 0) setProdPlannedQty(String(total));
    }
  }, [prodPlannedYields]);

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

  // When QC modal opens with a selected batch, pre-populate split yields from plannedYields or actual yields
  useEffect(() => {
    if (selectedBatchRun && qcModalVisible) {
      const planned = (selectedBatchRun as any).plannedYields;
      const actualYieldQty = selectedBatchRun.actualYieldQty || 0;
      const existingYields = selectedBatchRun.yields || [];
      
      if (planned && planned.length > 0) {
        const mapped = planned.map((y: any) => {
          const pId = typeof y.productId === 'object' ? (y.productId as any)._id || y.productId : y.productId;
          const matchingExist = existingYields.find((ey: any) => {
            const eyId = typeof ey.productId === 'object' ? (ey.productId as any)._id || ey.productId : ey.productId;
            return eyId === pId;
          });
          
          let val = '';
          if (matchingExist && matchingExist.actualYieldQty !== undefined && matchingExist.actualYieldQty > 0) {
            val = String(matchingExist.actualYieldQty);
          } else if (planned.length === 1 && actualYieldQty > 0) {
            val = String(actualYieldQty);
          } else {
            val = String(y.plannedQty || '');
          }
          
          return {
            productId: pId,
            actualYieldQty: val,
            packing: '1'
          };
        });
        setQcYields(mapped);
        setQcEnableSplit(true);
        // Auto-calculate total yield from sum of split quantities
        const sum = mapped.reduce((acc: number, y: any) => acc + (Number(y.actualYieldQty) || 0), 0);
        setQcYieldQty(String(sum || actualYieldQty || ''));
      } else {
        const val = actualYieldQty > 0 ? String(actualYieldQty) : '';
        setQcYields([{ productId: selectedBatchRun.productId || '', actualYieldQty: val, packing: '1' }]);
        setQcEnableSplit(false);
        setQcYieldQty(val);
      }
    }
  }, [selectedBatchRun, qcModalVisible]);

  const [expandedBatchIds, setExpandedBatchIds] = useState<Record<string, boolean>>({});
  const toggleBatchExpanded = (id: string) => setExpandedBatchIds(prev => ({ ...prev, [id]: !prev[id] }));

  // ── Per-tab data loading ─────────────────────────────────────────
  // Which datasets each tab needs
  const tabDataRequirements: Record<string, string[]> = {
    materials: ['materials', 'entries', 'mfgUnits', 'alerts', 'warehouses'],
    batches: ['batches', 'boms', 'products', 'mfgUnits', 'warehouses', 'vendors'],
    scheduler: ['batches', 'mfgUnits', 'analytics'],
    units: ['mfgUnits'],
  };

  // Track which datasets have been loaded (to avoid redundant fetches)
  const loadedRef = useRef<Set<string>>(new Set());

  const fetchDataset = useCallback(async (key: string) => {
    if (loadedRef.current.has(key)) return;
    loadedRef.current.add(key);
    try {
      switch (key) {
        case 'materials': {
          const data = await api.getRawMaterials(mfgUnitFilter === 'all' ? undefined : mfgUnitFilter);
          setMaterials(data);
          break;
        }
        case 'entries': {
          const data = await api.getRawMaterialEntries();
          setEntries(data);
          break;
        }
        case 'mfgUnits': {
          const data = await api.getManufacturingUnits();
          setManufacturingUnits(data);
          if (data.length > 0) setProdManufacturingUnitId(prev => prev || data[0]._id);
          break;
        }
        case 'batches': {
          const data = await api.getBatchProductions();
          setBatches(data);
          break;
        }
        case 'boms': {
          const data = await api.getBOMs();
          setBoms(data);
          break;
        }
        case 'products': {
          const data = await api.getProducts();
          setProducts(data);
          break;
        }
        case 'alerts': {
          const data = await api.getRawMaterialExpiryAlerts();
          setExpiryAlerts(data);
          break;
        }
        case 'warehouses': {
          const data = await api.getWarehouses();
          setWarehouses(data);
          break;
        }
        case 'vendors': {
          const data = await api.getVendors();
          setVendors(data);
          break;
        }
        case 'analytics': {
          const data = await api.getManufacturingAnalytics();
          setMfgAnalytics(data);
          break;
        }
      }
    } catch {
      loadedRef.current.delete(key); // allow retry on failure
    }
  }, [mfgUnitFilter]);

  const fetchTabData = useCallback(async (tab: string) => {
    const needs = tabDataRequirements[tab] || [];
    await Promise.all(needs.map(key => fetchDataset(key)));
    setLoading(false);
    setRefreshing(false);
  }, [fetchDataset]);

  const fetchTabDataBackground = useCallback((tab: string) => {
    const needs = tabDataRequirements[tab] || [];
    needs.forEach(key => {
      if (!loadedRef.current.has(key)) {
        fetchDataset(key);
      }
    });
  }, [fetchDataset]);

  // On mount: fetch active tab + prefetch adjacent tabs
  useEffect(() => {
    fetchTabData(activeTab);
    // Prefetch adjacent tabs in background
    const allTabs = ['materials', 'batches', 'scheduler', 'units'];
    const adjacent = allTabs.filter(t => t !== activeTab);
    adjacent.forEach(t => fetchTabDataBackground(t));
  }, []); // only on mount

  // On tab change: fetch data for the new tab if missing
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    if (prevTabRef.current !== activeTab) {
      fetchTabData(activeTab);
      prevTabRef.current = activeTab;
    }
  }, [activeTab, fetchTabData]);

  // On mfgUnitFilter change: re-fetch materials + entries
  useEffect(() => {
    loadedRef.current.delete('materials');
    loadedRef.current.delete('entries');
    fetchDataset('materials');
    fetchDataset('entries');
  }, [mfgUnitFilter, fetchDataset]);

  // Socket handlers — selective state updates
  const inventoryDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener('mfg_stage_updated_event', (data) => {
      if (data?._id) setBatches(prev => prev.map(b => b._id === data._id ? data : b));
    });
    const sub2 = DeviceEventEmitter.addListener('mfg_batch_created_event', (data) => {
      if (data?._id) setBatches(prev => [data, ...prev]);
    });
    const sub3 = DeviceEventEmitter.addListener('mfg_batch_completed_event', (data) => {
      if (data?._id) setBatches(prev => prev.map(b => b._id === data._id ? data : b));
    });
    const sub4 = DeviceEventEmitter.addListener('mfg_batch_cancelled_event', (data) => {
      if (data?._id) setBatches(prev => prev.map(b => b._id === data._id ? data : b));
    });
    const sub5 = DeviceEventEmitter.addListener('qc_hold_alert_event', () => {
      api.getRawMaterialExpiryAlerts().then(setExpiryAlerts).catch(() => {});
    });
    const sub6 = DeviceEventEmitter.addListener('inventory_updated_event', () => {
      if (inventoryDebounceRef.current) clearTimeout(inventoryDebounceRef.current);
      inventoryDebounceRef.current = setTimeout(() => {
        loadedRef.current.delete('materials');
        loadedRef.current.delete('entries');
        Promise.all([
          api.getRawMaterials(mfgUnitFilter === 'all' ? undefined : mfgUnitFilter),
          api.getRawMaterialEntries(),
        ]).then(([rms, ents]) => {
          setMaterials(rms);
          setEntries(ents);
        }).catch(() => {});
      }, 800);
    });

    return () => {
      sub1.remove(); sub2.remove(); sub3.remove();
      sub4.remove(); sub5.remove(); sub6.remove();
      if (inventoryDebounceRef.current) clearTimeout(inventoryDebounceRef.current);
    };
  }, [mfgUnitFilter]);

  const handleRefresh = () => {
    loadedRef.current.clear();
    api.clearCache();
    fetchTabData(activeTab);
    fetchTabDataBackground(activeTab === 'materials' ? 'batches' : 'materials');
  };

  // --- Handlers: Raw Material Definition ---
  const handleSaveMaterial = async () => {
    if (!rmName.trim()) {
      setRmError('Name is required.');
      return;
    }
    const targetStock = parseFloat(rmStockLevel);
    const isStockChanged = editingMaterialId && !isNaN(targetStock) && targetStock !== rmOriginalStockLevel;
    
    if (isStockChanged && !rmAdjustmentReason.trim()) {
      setRmError('Reason for stock adjustment is required.');
      return;
    }
    
    setRmError('');
    try {
      if (editingMaterialId) {
        if (isStockChanged) {
          await api.adjustRawMaterialStock(editingMaterialId, targetStock, rmAdjustmentReason.trim());
        }
        await api.updateRawMaterial(editingMaterialId, {
          name: rmName.trim(),
          unit: rmUnit,
          category: rmCategory,
          minReorder: Number(rmMinReorder) || 0,
        });
      } else {
        await api.createRawMaterial({
          name: rmName.trim(),
          sku: rmSku.trim() || undefined,
          unit: rmUnit,
          category: rmCategory,
          minReorder: Number(rmMinReorder) || 0,
        });
      }
      setRmName('');
      setRmSku('');
      setRmUnit('kg');
      setRmCategory('Herb');
      setRmMinReorder('10');
      setRmStockLevel('');
      setRmOriginalStockLevel(0);
      setRmAdjustmentReason('');
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
    const currentStock = (rm as any).stockLevel || 0;
    setRmStockLevel(currentStock.toString());
    setRmOriginalStockLevel(currentStock);
    setRmAdjustmentReason('');
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
    setRmStockLevel('');
    setRmOriginalStockLevel(0);
    setRmAdjustmentReason('');
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
    setBomIngredients([...bomIngredients, { rawMaterialId: '', qtyRequired: '', stageName: '' }]);
  };

  const handleRemoveIngredientRow = (index: number) => {
    setBomIngredients(bomIngredients.filter((_, idx) => idx !== index));
  };

  const handleIngredientChange = (index: number, key: 'rawMaterialId' | 'qtyRequired' | 'stageName', value: string) => {
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
          qtyRequired: Number(ing.qtyRequired),
          stageName: ing.stageName || ''
        })),
        isActive: bomIsActive,
        isDefault: bomIsDefault,
        recipeName: bomRecipeName.trim() || 'Standard Recipe',
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
      setBomIngredients([{ rawMaterialId: '', qtyRequired: '', stageName: '' }]);
      setBomIsActive(true);
      setBomIsDefault(true);
      setBomRecipeName('Standard Recipe');
      setBomNotes('');
      setBomOverhead('0');
      setBomDefaultProductionType('in_house');
      setBomDefaultJobWorkMode('none');
      setBomDefaultPackagingMode('self_packed');
      setBomDefaultJobWorkerId('');
      setBomStages([{ name: 'Packaging & Labeling', targetDurationDays: '1' }]);
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
      let enabledYields = prodPlannedYields.filter(y => y.enabled && Number(y.plannedQty) > 0);
      // Deduplicate by productId (take first occurrence)
      const seenIds = new Set<string>();
      enabledYields = enabledYields.filter(y => {
        if (seenIds.has(y.productId)) return false;
        seenIds.add(y.productId);
        return true;
      });
      const payload: any = {
        productId: prodProductId,
        bomId: prodBomId || undefined,
        plannedQty: Number(prodPlannedQty),
        batchNo: prodBatchNo.trim().toUpperCase(),
        manufacturingUnitId: prodManufacturingUnitId,
        productionType: prodProductionType,
        jobWorkMode: prodProductionType === 'job_work' ? prodJobWorkMode : 'none',
        packagingMode: prodProductionType === 'in_house' ? 'self_packed' : prodPackagingMode,
        jobWorkerId: prodProductionType === 'job_work' ? (prodJobWorkerId || null) : null,
        jobWorkerName: prodProductionType === 'job_work' ? prodJobWorkerName : '',
        jobWorkerChallanRef: prodProductionType === 'job_work' ? prodJobWorkerChallanRef : '',
        expiryDate: (() => {
          const months = parseInt(prodExpiryMonths, 10);
          if (!months || months <= 0) return undefined;
          const d = new Date();
          d.setMonth(d.getMonth() + months);
          return d.toISOString();
        })()
      };
      if (enabledYields.length > 0) {
        payload.plannedYields = enabledYields.map(y => ({
          productId: y.productId,
          plannedQty: Number(y.plannedQty),
          size: y.size
        }));
      }
      await api.startBatchProduction(payload);

      setProdProductId('');
      setProdBomId('');
      setProdPlannedQty('');
      setProdBatchNo('');
      setProdExpiryMonths('');
      setProdManufacturingUnitId('');
      setProdProductionType('in_house');
      setProdJobWorkMode('none');
      setProdPackagingMode('packed_by_vendor');
      setProdJobWorkerId('');
      setProdJobWorkerName('');
      setProdJobWorkerChallanRef('');
      setProdPlannedYields([]);
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
    // Auto-calculate total yield from sum of split quantities
    const sum = updated.reduce((acc, y) => acc + (Number(y.actualYieldQty) || 0), 0);
    setQcYieldQty(String(sum || ''));
  };
  const handleQcYieldQtyChange = (val: string) => {
    setQcYieldQty(val);
    if (qcYields.length === 1) {
      setQcYields(prev => prev.map((y, idx) => idx === 0 ? { ...y, actualYieldQty: val } : y));
    }
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

      const result = await api.completeBatchProduction(selectedBatchRun._id, payload);
      const grnDocNo = result?.grn?.docNo;

      setSelectedBatchRun(null);
      if (Platform.OS === 'web') {
        window.alert(`Batch completed! Production GRN (${grnDocNo || 'N/A'}) created in Delivery Challans. Go to Challans → Finalize to inward stock.`);
      } else {
        Alert.alert('Batch Completed', `Production GRN (${grnDocNo || 'N/A'}) created. Go to Delivery Challans → Finalize to inward stock.`);
      }
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
    setStageLossReason('');
    const batch = batches.find(b => b._id === batchId);
    if (batch) {
      const stage = batch.stages[idx];
      const stageName = stage.name;
      
      const isPacking = stageName.trim().toLowerCase() === 'packing';
      setStageOutputYield(isPacking ? (batch.plannedQty ? batch.plannedQty.toString() : '10') : '');
      
      const formulationBasis = batch.bomSnapshot?.formulationBasis || 100;
      const formulationBasisUnit = (batch.bomSnapshot?.formulationBasisUnit || 'ml').toLowerCase();
      
      let scale = 1;
      const yields = (batch as any).plannedYields || [];
      if (yields.length > 0) {
        let totalBatchVolume = 0;
        let allHaveSizes = true;
        for (const y of yields) {
          const sizeMl = parseSizeMl(y.size || '');
          if (sizeMl > 0) {
            totalBatchVolume += sizeMl * (Number(y.plannedQty) || 0);
          } else {
            allHaveSizes = false;
            break;
          }
        }
        if (allHaveSizes && totalBatchVolume > 0) {
          const totalInBasisUnit = formulationBasisUnit === 'l' ? totalBatchVolume / 1000 : totalBatchVolume;
          scale = totalInBasisUnit / formulationBasis;
        } else {
          scale = (batch.plannedQty || 0) / formulationBasis;
        }
      } else {
        scale = (batch.plannedQty || 0) / formulationBasis;
      }

      // Stage-tied formulation ingredients
      const ingredients = (batch.bomSnapshot?.ingredients || []).filter(
        i => i.stageName && i.stageName.trim().toLowerCase() === stageName.trim().toLowerCase()
      );
      let computed = ingredients.map(i => {
        const rmId = typeof i.rawMaterialId === 'string' ? i.rawMaterialId : (i.rawMaterialId as any)?._id || '';
        const rm = materials.find(r => r._id === rmId);
        const qtyTheoretical = parseFloat(((i.qtyRequired || 0) * scale).toFixed(3));
        return {
          rawMaterialId: rmId,
          name: rm?.name || 'Unknown',
          unit: rm?.unit || 'kg',
          qtyTheoretical,
          actualQty: qtyTheoretical.toString(),
          wastage: '0',
          itemType: i.itemType || 'formulation',
          qtyRequiredPerUnit: i.qtyRequired || 0,
        };
      });

      // Also include packaging materials (bottles, caps, labels) for packaging stages
      const isPackingStage = stageName.trim().toLowerCase().includes('packag') || stageName.trim().toLowerCase().includes('label');
      if (isPackingStage && batch.packagingMode === 'self_packed') {
        const packagingIngs = (batch.bomSnapshot?.ingredients || []).filter(
          i => i.itemType === 'packaging'
        );
        // Calculate packaging qty based on yields or plannedQty
        const yields = (batch as any).plannedYields || [];
        const packagingItems = packagingIngs.map(i => {
          const rmId = typeof i.rawMaterialId === 'string' ? i.rawMaterialId : (i.rawMaterialId as any)?._id || '';
          const rm = materials.find(r => r._id === rmId);
          let totalQty = 0;
          if (yields.length > 0) {
            totalQty = yields.reduce((sum: number, y: any) => sum + (i.qtyRequired || 0) * (Number(y.plannedQty) || 0), 0);
          } else {
            totalQty = (i.qtyRequired || 0) * (batch.plannedQty || 0);
          }
          totalQty = parseFloat(totalQty.toFixed(3));
          return {
            rawMaterialId: rmId,
            name: rm?.name || 'Unknown',
            unit: rm?.unit || 'pcs',
            qtyTheoretical: totalQty,
            actualQty: totalQty.toString(),
            wastage: '0',
            itemType: 'packaging',
            qtyRequiredPerUnit: i.qtyRequired || 0,
          };
        });
        computed = [...computed, ...packagingItems];
      }

      setStageIngredients(computed);
    } else {
      setStageIngredients([]);
    }
    setStageModalVisible(true);
  };

  const handleSkipStage = (batchId: string, idx: number) => {
    setStageAction('skip');
    setStageBatchId(batchId);
    setStageIndex(idx);
    setStageOperator('Operator');
    setStageNotes('');
    setStageError('');
    setStageIngredients([]);
    setStageModalVisible(true);
  };

  const handleFailStage = (batchId: string, idx: number) => {
    setStageAction('fail');
    setStageBatchId(batchId);
    setStageIndex(idx);
    setStageOperator('QC Inspector');
    setStageNotes('');
    setStageError('');
    setStageIngredients([]);
    setStageModalVisible(true);
  };

  const handleSaveStageAction = async () => {
    if (!stageBatchId || stageIndex === null || !stageAction) return;
    if (!stageOperator.trim()) {
      setStageError('Operator name is required.');
      return;
    }
    const batch = batches.find(b => b._id === stageBatchId);
    const stage = batch?.stages[stageIndex || 0];
    const isPacking = stage?.name.trim().toLowerCase() === 'packing';

    const hasWastage = stageIngredients.some(si => parseFloat(si.wastage) > 0);
    if (hasWastage && !stageLossReason.trim()) {
      setStageError(isPacking 
        ? 'Please provide a reason for the extra damage / mismatched quantity of packaging materials.'
        : 'Loss / Wastage reason is required when there is a process loss.'
      );
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

      const siPayload = stageIngredients.map(si => ({
        rawMaterialId: si.rawMaterialId,
        qtyNeeded: parseFloat(si.actualQty) || si.qtyTheoretical,
        wastage: parseFloat(si.wastage) || 0,
        itemType: si.itemType || 'formulation',
      }));
      await api.advanceStage(stageBatchId, stageIndex, {
        status: statusVal,
        completedBy: stageOperator.trim(),
        notes: stageNotes.trim(),
        lossReason: stageLossReason.trim(),
        ...(isPacking && stageOutputYield ? { actualYieldQty: parseFloat(stageOutputYield) || 0 } : {}),
        ...(stageAction === 'advance' && siPayload.length > 0 ? { stageIngredients: siPayload } : {}),
      });

      setStageAction(null);
      setStageBatchId(null);
      setStageIndex(null);
      setStageOperator('Operator');
      setStageNotes('');
      setStageIngredients([]);
      setCurrentInProgressStage(null);
      setStageModalVisible(false);
      loadData();
    } catch (err: any) {
      setCurrentInProgressStage(null);
      setStageError(err.message || 'Failed to update stage');
    }
  };

  const handleStageIngredientChange = (index: number, field: 'wastage' | 'actualQty', value: string) => {
    setStageIngredients(prev => {
      const updated = [...prev];
      const item = updated[index];
      if (field === 'actualQty') {
        // User is editing "Taken from Stock" — auto-compute wastage as (actual - theoretical)
        const actualVal = parseFloat(value) || 0;
        const wastageVal = Math.max(0, actualVal - item.qtyTheoretical);
        updated[index] = { 
          ...item, 
          actualQty: value,
          wastage: wastageVal > 0 ? wastageVal.toFixed(3) : '0'
        };
      } else if (field === 'wastage') {
        // User is editing "Process Loss" — do NOT change actualQty.
        // Wastage is tracked independently as loss that occurred during the process.
        // The "Taken from Stock" remains whatever the user already set.
        updated[index] = {
          ...item,
          wastage: value,
        };
      } else {
        updated[index] = { ...item, [field]: value };
      }
      return updated;
    });
  };

  const handleOutputYieldChange = (yieldVal: string) => {
    setStageOutputYield(yieldVal);
    const yieldNum = parseFloat(yieldVal) || 0;
    setStageIngredients(prev => {
      return prev.map(si => {
        if (si.itemType === 'packaging') {
          const qtyRequiredPerUnit = si.qtyRequiredPerUnit || 0;
          const qtyTheoretical = parseFloat((yieldNum * qtyRequiredPerUnit).toFixed(3));
          return {
            ...si,
            qtyTheoretical,
            actualQty: qtyTheoretical.toString(),
            wastage: '0'
          };
        }
        return si;
      });
    });
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
            onPress: async (url?: string) => {
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
  const matchingBom = prodBomId
    ? boms.find(b => b._id === prodBomId)
    : boms.find(b => {
      const bPid = b.productId && typeof b.productId === 'object' ? b.productId._id : b.productId;
      return bPid === prodProductId;
    });

  const plannedVal = computedTotalQty;
  let previewIngredients: { name: string; qtyNeeded: number; unit: string; available: number; ratioLabel: string; itemType: 'formulation' | 'packaging' }[] = [];
  const isDirectPurchaseJobWork = prodProductionType === 'job_work' && prodJobWorkMode === 'direct_purchase';
  const showFormulationPreview = !isDirectPurchaseJobWork;
  const showPackagingPreview = prodPackagingMode === 'self_packed';
  const enabledYields = prodPlannedYields.filter(y => y.enabled && Number(y.plannedQty) > 0);
  const isMultiSize = enabledYields.length > 0;

  const parseSizeMl = (sizeStr: string): number => {
    const s = (sizeStr || '').toLowerCase().trim();
    const numMatch = s.match(/([\d.]+)/);
    if (!numMatch) return 0;
    const numVal = parseFloat(numMatch[1]);
    if (isNaN(numVal) || numVal <= 0) return 0;
    if (s.includes('l') && !s.includes('ml')) return numVal * 1000;
    return numVal;
  };

  if (matchingBom && !isNaN(plannedVal) && plannedVal > 0 && (showFormulationPreview || showPackagingPreview)) {
    const FORMULATION_BASIS = (matchingBom as any).formulationBasis || 100;
    const FORMULATION_BASIS_UNIT = ((matchingBom as any).formulationBasisUnit || 'ml').toLowerCase();
    const scale = plannedVal / FORMULATION_BASIS;

    const getAvailable = (ingId: string) => {
      if (prodManufacturingUnitId) {
        return entries
          .filter(e => {
            const eRmId = typeof e.rawMaterialId === 'object' ? (e.rawMaterialId as any)._id || (e.rawMaterialId as any) : e.rawMaterialId;
            const eWhId = typeof (e as any).warehouseId === 'object' ? (e as any).warehouseId?._id : (e as any).warehouseId;
            return String(eRmId) === String(ingId) && String(eWhId) === String(prodManufacturingUnitId);
          })
          .reduce((sum, e) => sum + (e.qty || 0), 0);
      }
      const mat = materials.find(m => m._id === ingId);
      return mat ? (mat.stockLevel || 0) : 0;
    };

    if (isMultiSize) {
      // Calculate total batch volume or count for scaling, matching backend behavior
      let totalBatchVolume = 0;
      let allHaveSizes = true;
      for (const y of enabledYields) {
        const sizeMl = parseSizeMl(y.size || '');
        if (sizeMl > 0) {
          totalBatchVolume += sizeMl * Number(y.plannedQty);
        } else {
          allHaveSizes = false;
          break;
        }
      }

      let totalInBasisUnit = 0;
      if (allHaveSizes && totalBatchVolume > 0) {
        totalInBasisUnit = FORMULATION_BASIS_UNIT === 'l' ? totalBatchVolume / 1000 : totalBatchVolume;
      } else {
        totalInBasisUnit = enabledYields.reduce((s, y) => s + Number(y.plannedQty), 0);
      }
      const overallScale = totalInBasisUnit / FORMULATION_BASIS;

      // Formulation preview (when user provides raw materials)
      const formulationItems: typeof previewIngredients = [];
      if (showFormulationPreview) {
        const formulationMap = new Map<string, { name: string; qtyNeeded: number; unit: string; available: number; ratioLabel: string; itemType: 'formulation' }>();
        for (const ing of matchingBom.ingredients) {
          const ingId = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId._id : ing.rawMaterialId;
          const mat = materials.find(m => m._id === ingId);
          const isPkg = ing.itemType === 'packaging' || (mat && mat.category === 'Packaging');
          if (isPkg) continue;
          
          const qtyNeeded = ing.qtyRequired * overallScale;
          const key = ingId || ing.rawMaterialId.toString();
          const ingName = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.name : 'Unknown';
          const ingUnit = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.unit : 'kg';
          const ratioLabel = `${ing.qtyRequired} ${ingUnit} per ${FORMULATION_BASIS} ${FORMULATION_BASIS_UNIT.toUpperCase()}`;
          
          formulationMap.set(key, { name: ingName, qtyNeeded, unit: ingUnit, available: getAvailable(ingId), ratioLabel, itemType: 'formulation' });
        }
        formulationItems.push(...formulationMap.values());
      }

      // Packaging preview (when self-packed)
      const packagingItems: typeof previewIngredients = [];
      if (showPackagingPreview) {
        const packagingMap = new Map<string, { name: string; qtyNeeded: number; unit: string; available: number; ratioLabel: string; itemType: 'packaging' }>();
        for (const yieldItem of enabledYields) {
          const childBom = boms.find(b => {
            const bPid = b.productId && typeof b.productId === 'object' ? (b.productId as any)._id : b.productId;
            return bPid === yieldItem.productId;
          });
          if (!childBom) continue;
          for (const ing of childBom.ingredients) {
            const ingId = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId._id : ing.rawMaterialId;
            const mat = materials.find(m => m._id === ingId);
            const isPkg = ing.itemType === 'packaging' || (mat && mat.category === 'Packaging');
            if (!isPkg) continue;
            const qtyNeeded = ing.qtyRequired * Number(yieldItem.plannedQty);
            const key = ingId || ing.rawMaterialId.toString();
            if (packagingMap.has(key)) {
              packagingMap.get(key)!.qtyNeeded += qtyNeeded;
            } else {
              const ingName = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.name : 'Unknown';
              const ingUnit = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.unit : 'pcs';
              const ratioLabel = `${ing.qtyRequired} ${ingUnit}/unit`;
              packagingMap.set(key, { name: ingName, qtyNeeded, unit: ingUnit, available: getAvailable(ingId), ratioLabel, itemType: 'packaging' });
            }
          }
        }
        packagingItems.push(...packagingMap.values());
      }

      previewIngredients = [...formulationItems, ...packagingItems];
    } else {
      // Single-size: ingredients from the parent BOM, filtered by preview flags
      previewIngredients = matchingBom.ingredients
        .filter(ing => {
          const ingId = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId._id : ing.rawMaterialId;
          const mat = materials.find(m => m._id === ingId);
          const isPkg = ing.itemType === 'packaging' || (mat && mat.category === 'Packaging');
          if (isPkg) return showPackagingPreview;
          return showFormulationPreview;
        })
        .map(ing => {
          const ingId = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId._id : ing.rawMaterialId;
          const ingName = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.name : 'Unknown Raw Material';
          const ingUnit = ing.rawMaterialId && typeof ing.rawMaterialId === 'object' ? ing.rawMaterialId.unit : 'kg';
          const mat = materials.find(m => m._id === ingId);
          const isPkg = ing.itemType === 'packaging' || (mat && mat.category === 'Packaging');
          const qtyNeeded = isPkg ? ing.qtyRequired * plannedVal : ing.qtyRequired * scale;
          const ratioLabel = isPkg 
            ? `${ing.qtyRequired} ${ingUnit}/unit`
            : `${ing.qtyRequired} ${ingUnit} per ${FORMULATION_BASIS} ${FORMULATION_BASIS_UNIT.toUpperCase()}`;
          return {
            name: ingName,
            qtyNeeded,
            unit: ingUnit,
            available: getAvailable(ingId),
            ratioLabel,
            itemType: isPkg ? 'packaging' : 'formulation'
          };
        });
    }
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
        {activeTab === 'materials' && (
          <RawMaterialsTab
            expiryAlerts={expiryAlerts}
            manufacturingUnits={manufacturingUnits}
            mfgUnitFilter={mfgUnitFilter}
            setMfgUnitFilter={setMfgUnitFilter}
            materialSearch={materialSearch}
            setMaterialSearch={setMaterialSearch}
            stockFilter={stockFilter}
            setStockFilter={setStockFilter}
            filteredMaterials={filteredMaterials}
            isDesktop={isDesktop}
            isIntegerQty={isIntegerQty}
            onEditMaterial={handleEditMaterial}
            onTraceMaterial={async (rm) => {
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
                } catch (e) {
                  console.log('Trace fetch error', e);
                }
              } finally {
                setTraceLoading(false);
              }
            }}
          />
        )}

        {activeTab === 'batches' && (
          <BatchProductionsTab
            batches={batches}
            products={products}
            warehouses={warehouses}
            expandedBatchIds={expandedBatchIds}
            toggleBatchExpanded={toggleBatchExpanded}
            onStartProductionBatch={() => setProductionModalVisible(true)}
            onTraceBatch={async (batchNo) => {
              setTraceBatchNo(batchNo);
              setTraceLoading(true);
              setTraceModalVisible(true);
              try {
                const data = await api.traceBatch(batchNo.trim().toUpperCase());
                setTraceResult(data);
              } catch (err: any) {
                alert(err.message || 'Trace lookup failed');
                setTraceModalVisible(false);
              } finally {
                setTraceLoading(false);
              }
            }}
            onAdvanceStage={handleAdvanceStage}
            onSkipStage={handleSkipStage}
            onFailStage={handleFailStage}
            onDeleteBatchDoc={handleDeleteBatchDoc}
            onUploadBatchDoc={handleUploadBatchDoc}
            onOpenBMR={handleOpenBMR}
            onCancelProduction={handleCancelProduction}
            onQcSignOff={(batch) => {
              setSelectedBatchRun(batch);
              setQcYieldQty('');
              setQcWarehouseId(warehouses.length > 0 ? warehouses[0]._id : '');
              setQcWasteQty('');
              setQcWasteReason('');
              setQcPassedBy('');
              setQcNotes('');
              setQcError('');
              setQcModalVisible(true);
            }}
            isIntegerQty={isIntegerQty}
            getStatusColor={getStatusColor}
          />
        )}

        {activeTab === 'scheduler' && (
          <ProductionSchedulerTab
            mfgAnalytics={mfgAnalytics}
            onOpenBMR={handleOpenBMR}
            getStatusColor={getStatusColor}
          />
        )}

        {activeTab === 'units' && (
          <ManufacturingUnitsTab
            manufacturingUnits={manufacturingUnits}
            onAddUnit={() => setUnitModalVisible(true)}
          />
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
        rmStockLevel={rmStockLevel} setRmStockLevel={setRmStockLevel}
        rmOriginalStockLevel={rmOriginalStockLevel}
        rmAdjustmentReason={rmAdjustmentReason} setRmAdjustmentReason={setRmAdjustmentReason}
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
        bomIsDefault={bomIsDefault} setBomIsDefault={setBomIsDefault}
        bomRecipeName={bomRecipeName} setBomRecipeName={setBomRecipeName}
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
        prodBomId={prodBomId} setProdBomId={setProdBomId}
        prodPlannedQty={prodPlannedQty} setProdPlannedQty={setProdPlannedQty}
        prodBatchNo={prodBatchNo} setProdBatchNo={setProdBatchNo}
        prodExpiryMonths={prodExpiryMonths} setProdExpiryMonths={setProdExpiryMonths}
        prodProductionType={prodProductionType} setProdProductionType={setProdProductionType}
        prodJobWorkMode={prodJobWorkMode} setProdJobWorkMode={setProdJobWorkMode}
        prodPackagingMode={prodPackagingMode} setProdPackagingMode={setProdPackagingMode}
        prodJobWorkerId={prodJobWorkerId} setProdJobWorkerId={setProdJobWorkerId}
        prodJobWorkerName={prodJobWorkerName} setProdJobWorkerName={setProdJobWorkerName}
        prodJobWorkerChallanRef={prodJobWorkerChallanRef} setProdJobWorkerChallanRef={setProdJobWorkerChallanRef}
        prodManufacturingUnitId={prodManufacturingUnitId} setProdManufacturingUnitId={setProdManufacturingUnitId}
        prodError={prodError}
        computedTotalQty={computedTotalQty}
        prodPlannedYields={prodPlannedYields} setProdPlannedYields={setProdPlannedYields}
        previewIngredients={previewIngredients}
        onClose={() => setProductionModalVisible(false)}
        onLaunch={handleStartProduction}
      />

      <QCSignoffModal
        visible={qcModalVisible}
        selectedBatchRun={selectedBatchRun}
        warehouses={warehouses}
        products={products}
        qcYieldQty={qcYieldQty} setQcYieldQty={handleQcYieldQtyChange}
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

      {/* ── Genealogy / Trace / Stage Modals ────────────────── */}
      <StockTraceModal
        visible={traceModalVisible}
        traceLoading={traceLoading}
        traceResult={traceResult}
        traceBatchNo={traceBatchNo}
        traceSearch={traceSearch}
        setTraceSearch={setTraceSearch}
        traceSubTab={traceSubTab}
        setTraceSubTab={setTraceSubTab}
        isDesktop={isDesktop}
        onClose={() => setTraceModalVisible(false)}
        isIntegerQty={isIntegerQty}
      />

      {/* ======================================================== */}
      {/* MODAL 9: STAGE ADVANCE / SKIP CONFIRMATION */}
      {/* ======================================================== */}
      <Modal visible={stageModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={() => { setStageModalVisible(false); setStageIngredients([]); }} />
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {stageAction === 'advance' ? 'Complete Manufacturing Stage' : 'Skip Manufacturing Stage'}
              </Text>
              <TouchableOpacity onPress={() => { setStageModalVisible(false); setStageIngredients([]); }}>
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

              {stageAction === 'advance' && stageBatchId && (() => {
                const batch = batches.find(b => b._id === stageBatchId);
                if (!batch) return null;
                const stage = batch.stages[stageIndex || 0];
                if (!stage) return null;
                const isPacking = stage.name.trim().toLowerCase() === 'packing';
                if (!isPacking) return null;
                return (
                  <View style={{ marginTop: 12, marginBottom: 12 }}>
                    <Text style={[styles.inputLabel, { color: colors.primary }]}>Output Yield (Bottles) *</Text>
                    <TextInput
                      style={[styles.input, { height: 44, fontWeight: '700' }]}
                      keyboardType="numeric"
                      value={stageOutputYield}
                      onChangeText={handleOutputYieldChange}
                      placeholder="Enter actual bottles yielded..."
                      placeholderTextColor={colors.text.muted}
                    />
                    <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: -6, marginBottom: 12 }}>
                      Theoretical quantities of packaging materials will automatically recalculate based on this yield.
                    </Text>
                  </View>
                );
              })()}

              {stageAction === 'advance' && stageIngredients.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Ionicons name="flask-outline" size={16} color={colors.primary} />
                    <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text.primary }}>
                      Raw Materials Added at This Stage
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: colors.text.secondary, marginBottom: 12 }}>
                    Theoretical qty is auto-calculated from your formula. Enter the actual qty used — wastage is computed automatically.
                  </Text>
                  {stageIngredients.map((si, siIdx) => {
                    const actual = parseFloat(si.actualQty) || 0;
                    const theoretical = si.qtyTheoretical || 0;
                    const wastageNum = parseFloat(si.wastage) || 0;
                    const wastePct = theoretical > 0 ? ((wastageNum / theoretical) * 100).toFixed(1) : '0';
                    const isOverUsed = actual > theoretical * 1.01;
                    const isLoss = wastageNum > 0;
                    return (
                      <View
                        key={si.rawMaterialId + siIdx}
                        style={{
                          backgroundColor: colors.bg.card,
                          borderRadius: 10,
                          padding: 12,
                          marginBottom: 12,
                          borderWidth: 1,
                          borderColor: isLoss ? colors.warning + '60' : colors.border,
                          borderLeftWidth: 4,
                          borderLeftColor: isLoss ? colors.warning : colors.success,
                        }}
                      >
                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontWeight: '800', fontSize: 14, color: colors.text.primary }}>{si.name}</Text>
                            <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 1 }}>
                              Formula standard: <Text style={{ fontWeight: '700', color: colors.primary }}>{theoretical.toFixed(3)} {si.unit}</Text>
                            </Text>
                          </View>
                          {isLoss ? (
                            <View style={{ backgroundColor: colors.warning + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.warning }}>{wastePct}% process loss</Text>
                            </View>
                          ) : (
                            <View style={{ backgroundColor: colors.success + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.success }}>No loss</Text>
                            </View>
                          )}
                        </View>

                        {/* Two input fields side by side */}
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: colors.text.muted, marginBottom: 4, fontWeight: '700' }}>
                              📦 Taken from Stock ({si.unit})
                            </Text>
                            <TextInput
                              style={[styles.input, { height: 44, marginBottom: 0, borderColor: isOverUsed ? colors.danger : colors.border, fontWeight: '700' }]}
                              keyboardType="decimal-pad"
                              value={si.actualQty}
                              onChangeText={v => handleStageIngredientChange(siIdx, 'actualQty', v)}
                              placeholderTextColor={colors.text.muted}
                              placeholder={theoretical.toFixed(3)}
                            />
                            <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>Deducted from inventory</Text>
                            {isOverUsed && (
                              <Text style={{ fontSize: 10, color: colors.danger, marginTop: 2 }}>⚠ More than formula qty</Text>
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 11, color: colors.warning, marginBottom: 4, fontWeight: '700' }}>
                              🔥 Process Loss ({si.unit})
                            </Text>
                            <TextInput
                              style={[styles.input, { height: 44, marginBottom: 0, borderColor: isLoss ? colors.warning + '80' : colors.border }]}
                              keyboardType="decimal-pad"
                              value={si.wastage}
                              onChangeText={v => handleStageIngredientChange(siIdx, 'wastage', v)}
                              placeholderTextColor={colors.text.muted}
                              placeholder="0"
                            />
                            <Text style={{ fontSize: 10, color: colors.text.muted, marginTop: 2 }}>Evaporation / spill / cleaning</Text>
                          </View>
                        </View>

                        {/* Output preview bar */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bg.secondary, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: colors.border, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 11, color: colors.text.muted }}>Deducted:</Text>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary }}>{parseFloat(si.actualQty) || 0} {si.unit}</Text>
                          <Text style={{ fontSize: 11, color: colors.text.muted }}>  −  Lost:</Text>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.warning }}>{parseFloat(si.wastage) || 0} {si.unit}</Text>
                          <Text style={{ fontSize: 11, color: colors.text.muted }}>  =  Into product:</Text>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.success }}>
                            {Math.max(0, (parseFloat(si.actualQty) || 0) - (parseFloat(si.wastage) || 0)).toFixed(3)} {si.unit}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                  {stageIngredients.some(si => parseFloat(si.wastage) > 0) && (
                    <View style={{ marginBottom: 8 }}>
                      <Text style={[styles.inputLabel, { color: colors.warning }]}>Loss / Wastage Reason *</Text>
                      <TextInput
                        style={[styles.input, { height: 70, paddingVertical: 8 }]}
                        placeholder="e.g. Boiling evaporation, cleaning loss during Kwath preparation..."
                        placeholderTextColor={colors.text.muted}
                        value={stageLossReason}
                        onChangeText={setStageLossReason}
                        multiline
                        numberOfLines={2}
                      />
                    </View>
                  )}
                </View>
              )}
              {stageAction === 'advance' && stageIngredients.length === 0 && (
                <View style={{ marginTop: 12, padding: 10, backgroundColor: colors.bg.secondary, borderRadius: 8, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                  <Text style={{ fontSize: 12, color: colors.text.secondary, flex: 1 }}>
                    No specific ingredients assigned to this stage. Proceed to complete it.
                  </Text>
                </View>
              )}
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setStageModalVisible(false); setStageIngredients([]); }}>
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

