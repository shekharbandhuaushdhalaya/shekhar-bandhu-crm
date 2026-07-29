import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Modal, KeyboardAvoidingView, Platform, Image, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Spacing, Radius } from '../../../constants/theme';
import { api, Product, getImageUrl } from '../../../utils/api';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { useToast } from '../../../utils/ToastContext';
import { createStyles } from '../productsStyles';

const normalizeTitleCase = (str?: string) => {
  if (!str) return '';
  return str.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  product?: Product | null;
  products: Product[];
}

export default function AddEditProductModal({ visible, onClose, onSaved, product, products }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [stock, setStock] = useState('');

  const [variantsList, setVariantsList] = useState<{
    _id?: string;
    size: string;
    price: string;
    mrp: string;
    packaging: { rawMaterialId: string; qtyRequired: string; stageName?: string }[];
  }[]>([
    { size: '', price: '', mrp: '', packaging: [{ rawMaterialId: '', qtyRequired: '1', stageName: '' }] }
  ]);

  const [minReorder, setMinReorder] = useState('5');
  const [hsnCode, setHsnCode] = useState('');
  const [gstRate, setGstRate] = useState('18');

  const fileInputRef = React.useRef<any>(null);

  const handleFileChange = async (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async () => {
        const fileUri = reader.result as string;
        if (product) {
          try {
            const updated = await api.appendProductImage(product._id, fileUri);
            setImagesList(updated.image ? updated.image.split(',').map(s => s.trim()).filter(Boolean) : []);
            showToast('Image uploaded successfully!', 'success');
          } catch (err: any) {
            showToast(err.message || 'Failed to upload image', 'error');
          }
        } else {
          setLocalNewImages(prev => [...prev, fileUri]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileSelect = () => {
    if (Platform.OS === 'web' && fileInputRef.current) {
      fileInputRef.current.click();
    } else {
      pickImage();
    }
  };

  const [types, setTypes] = useState(['Asava & Arishta', 'Syrups', 'Medicated Oils', 'Vati & Guggulu', 'Avaleha', 'Churn']);
  const [productType, setProductType] = useState('');
  const [showTypeInput, setShowTypeInput] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  const [colour, setColour] = useState('');
  const [shape, setShape] = useState('');
  const [weight, setWeight] = useState('');
  const [description, setDescription] = useState('');
  const [disease, setDisease] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [imagesList, setImagesList] = useState<string[]>([]);
  const [localNewImages, setLocalNewImages] = useState<string[]>([]);

  const [shapes, setShapes] = useState(['liquid', 'tablet', 'capsule', 'powder', 'paste']);
  const [showShapeInput, setShowShapeInput] = useState(false);
  const [newShapeName, setNewShapeName] = useState('');

  const [activeFormTab, setActiveFormTab] = useState<'basic' | 'recipe'>('basic');
  const [materials, setMaterials] = useState<any[]>([]);
  const [bomYield, setBomYield] = useState('100');
  const [bomOverhead, setBomOverhead] = useState('0');
  const [bomNotes, setBomNotes] = useState('');
  const [bomIsActive, setBomIsActive] = useState(true);
  const [bomDefaultProductionType, setBomDefaultProductionType] = useState<'in_house' | 'job_work'>('in_house');
  const [bomDefaultJobWorkMode, setBomDefaultJobWorkMode] = useState<'raw_materials_supplied' | 'direct_purchase' | 'none'>('none');
  const [bomDefaultPackagingMode, setBomDefaultPackagingMode] = useState<'packed_by_vendor' | 'self_packed'>('self_packed');
  const [bomDefaultJobWorkerId, setBomDefaultJobWorkerId] = useState('');
  const [vendors, setVendors] = useState<any[]>([]);
  const [bomIngredients, setBomIngredients] = useState<{ rawMaterialId: string; qtyRequired: string; itemType: 'formulation' | 'packaging'; stageName?: string }[]>([{ rawMaterialId: '', qtyRequired: '', itemType: 'formulation' }]);
  const [bomStages, setBomStages] = useState<{ name: string; targetDurationDays: string }[]>([{ name: '', targetDurationDays: '1' }]);
  const [formulationBasis, setFormulationBasis] = useState('100');

  // Map product type → default formulation standard (qty & unit label)
  const getFormulaStandard = (type: string): { basis: number; unit: string; label: string } => {
    const t = (type || '').toLowerCase();
    if (t.includes('asava') || t.includes('arishta'))
      return { basis: 450, unit: 'ml', label: 'per 450 ml' };
    if (t.includes('syrup') || t.includes('kwath') || t.includes('oil') || t.includes('liquid') || t.includes('ark') || t.includes('tailam'))
      return { basis: 100, unit: 'ml', label: 'per 100 ml' };
    if (t.includes('tablet') || t.includes('vati') || t.includes('guggulu') || t.includes('bhasma'))
      return { basis: 10, unit: 'pcs', label: 'per 10 pcs' };
    if (t.includes('capsule'))
      return { basis: 10, unit: 'caps', label: 'per 10 capsules' };
    if (t.includes('powder') || t.includes('churn') || t.includes('churna') || t.includes('avaleha') || t.includes('lehyam') || t.includes('granule'))
      return { basis: 100, unit: 'g', label: 'per 100 g' };
    if (t.includes('ghee') || t.includes('ghrita') || t.includes('paste') || t.includes('cream') || t.includes('ointment') || t.includes('lepa'))
      return { basis: 100, unit: 'g', label: 'per 100 g' };
    return { basis: 100, unit: 'units', label: 'per 100 units' };
  };
  const formulaStd = getFormulaStandard(productType);

  // Compute live total formula quantity (for formulation items only)
  const totalFormulaQty = useMemo(() => {
    return bomIngredients
      .filter(ing => ing.itemType !== 'packaging')
      .reduce((acc, ing) => {
        const val = parseFloat(ing.qtyRequired);
        return acc + (isNaN(val) ? 0 : val);
      }, 0);
  }, [bomIngredients]);

  // Sync Key Ingredients summary text from BOM formulation ingredients ratio
  useEffect(() => {
    const activeIngs = bomIngredients.filter(ing => {
      const mat = materials.find(m => m._id === ing.rawMaterialId);
      const isPackaging = mat?.category === 'Packaging' || ing.itemType === 'packaging';
      return !isPackaging && ing.rawMaterialId && ing.qtyRequired;
    });
    const totalQty = activeIngs.reduce((sum, ing) => sum + (parseFloat(ing.qtyRequired) || 0), 0);
    const basisNum = Number(formulationBasis) || 100;
    const std = getFormulaStandard(productType);

    if (activeIngs.length > 0 && totalQty > 0) {
      const summary = activeIngs.map(ing => {
        const mat = materials.find(m => m._id === ing.rawMaterialId);
        const name = mat ? mat.name : 'Ingredient';
        const qty = parseFloat(ing.qtyRequired) || 0;
        const pct = ((qty / basisNum) * 100).toFixed(1);
        const unit = mat?.unit || std.unit;
        return `${name} ${qty}${unit} (${pct}% of ${basisNum}${std.unit})`;
      }).join(', ');
      setIngredients(summary);
    } else {
      setIngredients('');
    }
  }, [bomIngredients, materials, formulationBasis, productType]);

  // Load raw materials & existing BOM when product is set
  useEffect(() => {
    async function loadAllData() {
      try {
        api.clearCache();
        const [rms, vends] = await Promise.all([
          api.getRawMaterials(),
          api.getVendors()
        ]);
        setMaterials(rms);
        setVendors(vends);

        if (product) {
          setName(product.name || '');
          setSku(product.sku || '');
          setStock(product.stockLevel !== undefined && product.stockLevel !== null ? product.stockLevel.toString() : '');
          setMinReorder(product.minReorder !== undefined && product.minReorder !== null ? product.minReorder.toString() : '5');
          setHsnCode(product.hsnCode || '');
          setGstRate(product.gstRate !== undefined ? product.gstRate.toString() : '18');
          setProductType(product.productType || '');
          setColour(product.colour || '');
          setShape(product.shape || '');
          const weightVal = product.weight || '';
          setWeight(weightVal.replace(/g$/i, '').trim());
          setDescription(product.description || '');
          setDisease(product.disease || '');
          setIngredients(product.ingredients || '');
          setImagesList(product.image ? product.image.split(',').map(s => s.trim()).filter(Boolean) : []);
          setLocalNewImages([]);

          // Find all variant children
          const children = products.filter(p => p.parentId === product._id);

          // Fetch BOMs for parent and all child variants in parallel
          const [parentBom, ...childBoms] = await Promise.all([
            api.getBOMForProduct(product._id).catch(() => null),
            ...children.map(c => api.getBOMForProduct(c._id).catch(() => null))
          ]);

          // Helper to extract packaging ingredients from a BOM
          const extractPackaging = (bomObj: any) => {
            if (!bomObj || !bomObj.ingredients) return [{ rawMaterialId: '', qtyRequired: '1', stageName: '' }];
            const pkgIngs = bomObj.ingredients.filter((ing: any) => {
              const rId = ing.rawMaterialId?._id || ing.rawMaterialId;
              const matchedMat = rms.find((r: any) => r._id === rId);
              return ing.itemType === 'packaging' || (matchedMat && matchedMat.category === 'Packaging');
            });
            if (pkgIngs.length === 0) return [{ rawMaterialId: '', qtyRequired: '1', stageName: '' }];
            return pkgIngs.map((ing: any) => ({
              rawMaterialId: ing.rawMaterialId?._id || ing.rawMaterialId,
              qtyRequired: ing.qtyRequired.toString(),
              stageName: ing.stageName || ''
            }));
          };

          // Populate variantsList with their respective packaging items
          setVariantsList([
            {
              _id: product._id,
              size: product.size ? product.size.replace(/\s*(ml|mm|pcs|Tablets|Capsules|g)$/i, '').trim() : '',
              price: product.price !== undefined && product.price !== null ? product.price.toString() : '',
              mrp: product.mrp !== undefined && product.mrp !== null ? product.mrp.toString() : '',
              packaging: extractPackaging(parentBom)
            },
            ...children.map((c, idx) => ({
              _id: c._id,
              size: c.size ? c.size.replace(/\s*(ml|mm|pcs|Tablets|Capsules|g)$/i, '').trim() : '',
              price: c.price !== undefined && c.price !== null ? c.price.toString() : '',
              mrp: c.mrp !== undefined && c.mrp !== null ? c.mrp.toString() : '',
              packaging: extractPackaging(childBoms[idx])
            }))
          ]);

          // Populate the formulation ingredients (non-packaging) for parent BOM tab
          if (parentBom) {
            setBomYield(parentBom.batchYieldSize ? parentBom.batchYieldSize.toString() : '100');
            setBomOverhead(parentBom.overheadCost ? parentBom.overheadCost.toString() : '0');
            setBomNotes(parentBom.productionNotes || '');
            setBomIsActive(parentBom.isActive !== undefined ? parentBom.isActive : true);
            setBomDefaultProductionType((parentBom as any).defaultProductionType || 'in_house');
            setBomDefaultJobWorkMode((parentBom as any).defaultJobWorkMode || 'none');
            setBomDefaultPackagingMode((parentBom as any).defaultPackagingMode || 'self_packed');
            setBomDefaultJobWorkerId((parentBom as any).defaultJobWorkerId ? (((parentBom as any).defaultJobWorkerId as any)._id || (parentBom as any).defaultJobWorkerId) : '');

            const formulationIngs = parentBom.ingredients.filter((ing: any) => {
              const rId = ing.rawMaterialId?._id || ing.rawMaterialId;
              const matchedMat = rms.find((r: any) => r._id === rId);
              return ing.itemType !== 'packaging' && !(matchedMat && matchedMat.category === 'Packaging');
            });
            if (formulationIngs.length > 0) {
              setBomIngredients(formulationIngs.map((ing: any) => ({
                rawMaterialId: ing.rawMaterialId?._id || ing.rawMaterialId,
                qtyRequired: ing.qtyRequired.toString(),
                itemType: 'formulation',
                stageName: ing.stageName || ''
              })));
            } else {
              setBomIngredients([{ rawMaterialId: '', qtyRequired: '', itemType: 'formulation', stageName: '' }]);
            }

            if (parentBom.stages && parentBom.stages.length > 0) {
              setBomStages(parentBom.stages.map((st: any) => ({
                name: st.name,
                targetDurationDays: (st.targetDurationHours || st.targetDurationDays || 1).toString()
              })));
            } else {
              setBomStages([{ name: '', targetDurationDays: '1' }]);
            }

            // Restore formulationBasis
            if ((parentBom as any).formulationBasis) {
              setFormulationBasis((parentBom as any).formulationBasis.toString());
            } else {
              setFormulationBasis(getFormulaStandard(product.productType || '').basis.toString());
            }
          } else {
            setBomYield('100');
            setBomOverhead('0');
            setBomNotes('');
            setBomIsActive(true);
            setBomDefaultProductionType('in_house');
            setBomDefaultJobWorkMode('none');
            setBomDefaultPackagingMode('self_packed');
            setBomDefaultJobWorkerId('');
            setBomIngredients([{ rawMaterialId: '', qtyRequired: '', itemType: 'formulation', stageName: '' }]);
            setBomStages([{ name: '', targetDurationDays: '1' }]);
            setFormulationBasis(getFormulaStandard(product.productType || '').basis.toString());
          }

          if (product.productType) {
            const norm = normalizeTitleCase(product.productType);
            if (norm && !types.map(t => normalizeTitleCase(t)).includes(norm)) {
              setTypes(prev => [...prev, norm]);
            }
          }

          if (product.shape) {
            const s = product.shape.toLowerCase();
            if (s && !shapes.includes(s)) {
              setShapes(prev => [...prev, s]);
            }
          }
        } else {
          setName('');
          setSku('');
          setStock('');
          setVariantsList([{ size: '', price: '', mrp: '', packaging: [{ rawMaterialId: '', qtyRequired: '1', stageName: '' }] }]);
          setHsnCode('');
          setGstRate('18');
          setProductType('');
          setColour('');
          setShape('');
          setWeight('');
          setDescription('');
          setDisease('');
          setIngredients('');
          setImagesList([]);
          setLocalNewImages([]);
          setBomYield('100');
          setBomOverhead('0');
          setBomNotes('');
          setBomIsActive(true);
          setBomDefaultProductionType('in_house');
          setBomDefaultJobWorkMode('none');
          setBomDefaultPackagingMode('self_packed');
          setBomDefaultJobWorkerId('');
          setBomIngredients([{ rawMaterialId: '', qtyRequired: '', itemType: 'formulation' }]);
          setBomStages([{ name: '', targetDurationDays: '1' }]);
        }
        setShowTypeInput(false);
        setNewTypeName('');
        setShowShapeInput(false);
        setNewShapeName('');
        setActiveFormTab('basic');
      } catch (err) {
        console.error('Failed to load raw materials, BOM, or product data in AddEditProductModal:', err);
      }
    }

    if (visible) {
      loadAllData();
    }
  }, [visible, product]);

  const handleAddCustomType = () => {
    const val = normalizeTitleCase(newTypeName);
    if (val) {
      if (!types.map(t => normalizeTitleCase(t)).includes(val)) {
        setTypes([...types, val]);
      }
      setProductType(val);
      setNewTypeName('');
      setShowTypeInput(false);
    }
  };

  const handleAddCustomShape = () => {
    const val = newShapeName.trim().toLowerCase();
    if (val) {
      if (!shapes.includes(val)) {
        setShapes([...shapes, val]);
      }
      setShape(val);
      setNewShapeName('');
      setShowShapeInput(false);
    }
  };

  const handleIngredientChange = (index: number, field: string, value: string) => {
    const list = [...bomIngredients];
    (list[index] as any)[field] = value;
    setBomIngredients(list);
  };

  const handleAddIngredientRow = (type: 'formulation' | 'packaging' = 'formulation') => {
    setBomIngredients([...bomIngredients, { rawMaterialId: '', qtyRequired: '', itemType: type }]);
  };

  const handleRemoveIngredientRow = (index: number) => {
    const list = [...bomIngredients];
    list.splice(index, 1);
    setBomIngredients(list.length > 0 ? list : [{ rawMaterialId: '', qtyRequired: '', itemType: 'formulation' }]);
  };

  const handleStageChange = (index: number, field: string, value: string) => {
    const list = [...bomStages];
    (list[index] as any)[field] = value;
    setBomStages(list);
  };

  const handleAddStageRow = () => {
    setBomStages([...bomStages, { name: '', targetDurationDays: '1' }]);
  };

  const handleRemoveStageRow = (index: number) => {
    const list = [...bomStages];
    list.splice(index, 1);
    setBomStages(list.length > 0 ? list : [{ name: '', targetDurationDays: '1' }]);
  };

  const handleVariantPackagingChange = (variantIndex: number, pkgIndex: number, field: string, value: string) => {
    const list = [...variantsList];
    if (!list[variantIndex].packaging) {
      list[variantIndex].packaging = [];
    }
    (list[variantIndex].packaging[pkgIndex] as any)[field] = value;
    setVariantsList(list);
  };

  const handleAddVariantPackagingRow = (variantIndex: number) => {
    const list = [...variantsList];
    if (!list[variantIndex].packaging) {
      list[variantIndex].packaging = [];
    }
    list[variantIndex].packaging.push({ rawMaterialId: '', qtyRequired: '1', stageName: '' });
    setVariantsList(list);
  };

  const handleRemoveVariantPackagingRow = (variantIndex: number, pkgIndex: number) => {
    const list = [...variantsList];
    if (list[variantIndex].packaging) {
      list[variantIndex].packaging.splice(pkgIndex, 1);
      setVariantsList(list);
    }
  };

  const getSizeUnit = () => {
    const s = (shape || '').toLowerCase().trim();
    if (s === 'liquid') return 'ml';
    if (s === 'tablet') return 'Tablets';
    if (s === 'capsule') return 'Capsules';
    if (s === 'powder' || s === 'paste') return 'g';
    return 'ml';
  };

  const pickImage = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast('Sorry, we need camera roll permissions to upload product photos!', 'error');
        return;
      }
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const pickedUri = result.assets[0].uri;
      if (product) {
        try {
          const updated = await api.appendProductImage(product._id, pickedUri);
          setImagesList(updated.image ? updated.image.split(',').map(s => s.trim()).filter(Boolean) : []);
          showToast('Image uploaded successfully!', 'success');
        } catch (err: any) {
          showToast(err.message || 'Failed to upload image', 'error');
        }
      } else {
        setLocalNewImages(prev => [...prev, pickedUri]);
      }
    }
  };

  const handleDeleteImage = async (url: string, index: number) => {
    if (product) {
      try {
        const updated = await api.deleteProductImage(product._id, url);
        setImagesList(updated.image ? updated.image.split(',').map(s => s.trim()).filter(Boolean) : []);
        showToast('Image deleted successfully!', 'success');
      } catch (err: any) {
        showToast(err.message || 'Failed to delete image', 'error');
      }
    } else {
      setLocalNewImages(prev => prev.filter((_, idx) => idx !== index));
    }
  };

  const handleSave = async () => {
    let finalName = name.trim();
    let finalCategory = productType || 'General';
    let finalMinReorder = minReorder.trim() !== '' ? parseInt(minReorder) : 5;

    if (!finalName) {
      showToast('Ayurvedic Formulation Name is required!', 'error');
      return;
    }

    const activeVariants = variantsList.filter(v => v.size.trim() && v.price.trim());
    if (activeVariants.length === 0) {
      showToast('At least one size and B2B price must be specified!', 'error');
      return;
    }

    if (!hsnCode.trim()) {
      showToast('HSN Code is mandatory!', 'error');
      return;
    }

    const sizeUnit = getSizeUnit();

    try {
      // Save Parent (First Variant in list)
      const parentVar = activeVariants[0];
      const parentSize = parentVar.size.trim();
      const parentFormattedSize = parentSize.toLowerCase().endsWith(sizeUnit.toLowerCase())
        ? parentSize
        : `${parentSize} ${sizeUnit}`;

      const parentPayload = {
        name: finalName,
        sku: product ? product.sku : undefined,
        price: parseFloat(parentVar.price) || 0,
        mrp: parentVar.mrp ? parseFloat(parentVar.mrp) : undefined,
        stockLevel: product ? product.stockLevel : 0,
        category: finalCategory,
        minReorder: finalMinReorder,
        hsnCode: hsnCode.trim().toUpperCase(),
        gstRate: parseInt(gstRate) || 18,
        productType: productType,
        size: parentFormattedSize,
        colour: colour.trim(),
        shape: shape.trim(),
        weight: weight.trim(),
        description: description.trim(),
        disease: disease.trim(),
        ingredients: ingredients.trim(),
        vendorId: product?.vendorId || '',
        vendorName: product?.vendorName || '',
        parentId: null
      };

      let savedParent;
      if (product) {
        savedParent = await api.updateProduct(product._id, parentPayload);
      } else {
        savedParent = await api.createProduct(parentPayload);
        for (const localImg of localNewImages) {
          savedParent = await api.appendProductImage(savedParent._id, localImg);
        }
      }

      // Save Children
      const existingChildren = products.filter(p => p.parentId === savedParent._id);
      const activeChildIds = new Set<string>();
      const resolvedChildIds: string[] = [];

      for (let i = 1; i < activeVariants.length; i++) {
        const item = activeVariants[i];
        const childSize = item.size.trim();
        const childFormattedSize = childSize.toLowerCase().endsWith(sizeUnit.toLowerCase())
          ? childSize
          : `${childSize} ${sizeUnit}`;

        const childPayload = {
          name: finalName,
          price: parseFloat(item.price) || 0,
          mrp: item.mrp ? parseFloat(item.mrp) : undefined,
          stockLevel: item._id ? (products.find(p => p._id === item._id)?.stockLevel || 0) : 0,
          category: finalCategory,
          minReorder: finalMinReorder,
          hsnCode: hsnCode.trim().toUpperCase(),
          gstRate: parseInt(gstRate) || 18,
          productType: productType,
          size: childFormattedSize,
          colour: colour.trim(),
          shape: shape.trim(),
          weight: weight.trim(),
          description: description.trim(),
          disease: disease.trim(),
          ingredients: ingredients.trim(),
          vendorId: product?.vendorId || '',
          vendorName: product?.vendorName || '',
          parentId: savedParent._id
        };

        let childId = item._id;
        if (childId) {
          activeChildIds.add(childId);
          await api.updateProduct(childId, childPayload);
        } else {
          const newChild = await api.createProduct(childPayload);
          childId = newChild._id;
          activeChildIds.add(childId);
        }
        resolvedChildIds.push(childId);
      }

      for (const child of existingChildren) {
        if (!activeChildIds.has(child._id)) {
          await api.deleteProduct(child._id).catch(e => console.error("Failed to delete removed variant:", e));
        }
      }

      // Save Parent Product BOM
      const parentPackagingIngs = (parentVar.packaging || [])
        .filter(p => p.rawMaterialId && p.qtyRequired)
        .map(p => ({
          rawMaterialId: p.rawMaterialId,
          qtyRequired: parseFloat(p.qtyRequired) || 1,
          itemType: 'packaging' as const,
          stageName: p.stageName || ''
        }));

      const mergedParentIngredients = [
        ...bomIngredients
          .filter(ing => ing.rawMaterialId && ing.qtyRequired)
          .map(ing => ({
            rawMaterialId: ing.rawMaterialId,
            qtyRequired: parseFloat(ing.qtyRequired) || 0,
            itemType: ing.itemType || 'formulation',
            stageName: ing.stageName || ''
          })),
        ...parentPackagingIngs
      ];

      const filteredStages = bomStages
        .filter(st => st.name.trim().length > 0)
        .map(st => ({
          name: st.name.trim(),
          targetDurationDays: parseFloat(st.targetDurationDays) || 1
        }));

      if (mergedParentIngredients.length > 0 || filteredStages.length > 0 || bomNotes.trim() !== '') {
        await api.configureBOM({
          productId: savedParent._id,
          batchYieldSize: Number(bomYield) || 100,
          formulationBasis: Number(formulationBasis) || formulaStd.basis,
          formulationBasisUnit: formulaStd.unit,
          ingredients: mergedParentIngredients,
          isActive: bomIsActive,
          isDefault: true,
          recipeName: 'Standard Recipe',
          productionNotes: bomNotes.trim(),
          overheadCost: parseFloat(bomOverhead) || 0,
          stages: filteredStages,
          defaultProductionType: bomDefaultProductionType,
          defaultJobWorkMode: bomDefaultProductionType === 'job_work' ? bomDefaultJobWorkMode : 'none',
          defaultPackagingMode: bomDefaultProductionType === 'job_work' ? bomDefaultPackagingMode : 'self_packed',
          defaultJobWorkerId: bomDefaultProductionType === 'job_work' ? (bomDefaultJobWorkerId || null) : null
        } as any);
      }

      // Save Child Packaging BOMs
      for (let i = 1; i < activeVariants.length; i++) {
        const item = activeVariants[i];
        const childId = resolvedChildIds[i - 1];
        if (!childId) continue;

        const childPackagingIngs = (item.packaging || [])
          .filter(p => p.rawMaterialId && p.qtyRequired)
          .map(p => ({
            rawMaterialId: p.rawMaterialId,
            qtyRequired: parseFloat(p.qtyRequired) || 1,
            itemType: 'packaging' as const,
            stageName: p.stageName || ''
          }));

        if (childPackagingIngs.length > 0) {
          await api.configureBOM({
            productId: childId,
            batchYieldSize: 1,
            ingredients: childPackagingIngs,
            isActive: true,
            isDefault: true,
            recipeName: 'Packaging BOM',
            productionNotes: 'Auto-configured packaging recipe',
            overheadCost: 0,
            stages: [],
            defaultProductionType: 'in_house',
            defaultJobWorkMode: 'none',
            defaultPackagingMode: 'self_packed',
            defaultJobWorkerId: null
          });
        }
      }

      onSaved();
      onClose();
      showToast('Product and Formulation saved successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save product specification', 'error');
    }
  };

  const getYieldLabelAndPlaceholder = () => {
    const s = (shape || '').toLowerCase().trim();
    if (s === 'liquid') {
      return { label: 'Standard Batch Yield Size (Liters)', placeholder: 'e.g. 100 (in Liters)' };
    }
    if (s === 'tablet' || s === 'capsule') {
      return { label: 'Standard Batch Yield Size (Number of Pieces)', placeholder: 'e.g. 10000 (Number of tablets/capsules)' };
    }
    if (s === 'powder') {
      return { label: 'Standard Batch Yield Size (Kilograms)', placeholder: 'e.g. 50 (in Kilograms)' };
    }
    return { label: 'Standard Batch Yield Output Size (Bottles / Units)', placeholder: 'e.g. 100' };
  };

  const yieldMeta = getYieldLabelAndPlaceholder();

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{product ? 'Edit Product Specification' : 'New Product Specification'}</Text>
          <TouchableOpacity onPress={handleSave}>
            <Ionicons name="checkmark-circle" size={26} color={colors.success} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>

          <View style={{ marginBottom: Spacing.lg }}>
            <Text style={styles.formLabel}>Product Gallery</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ flexDirection: 'row', gap: 10, paddingVertical: 5 }}>
              {Platform.OS === 'web' && (
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={handleFileChange}
                />
              )}

              {imagesList.map((url, idx) => (
                <View key={`exist-${idx}`} style={{ width: 80, height: 80, borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', position: 'relative' }}>
                  <Image source={{ uri: getImageUrl(url) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  <TouchableOpacity
                    style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}
                    onPress={() => handleDeleteImage(url, idx)}
                  >
                    <Ionicons name="trash" size={14} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}

              {localNewImages.map((uri, idx) => (
                <View key={`new-${idx}`} style={{ width: 80, height: 80, borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', position: 'relative' }}>
                  <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  <TouchableOpacity
                    style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' }}
                    onPress={() => handleDeleteImage(uri, idx)}
                  >
                    <Ionicons name="trash" size={14} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                onPress={triggerFileSelect}
                style={{ width: 80, height: 80, borderRadius: 8, borderStyle: 'dashed', borderWidth: 1.5, borderColor: colors.primary, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg.secondary }}
              >
                <Ionicons name="add" size={24} color={colors.primary} />
                <Text style={{ fontSize: 9, color: colors.primary, fontWeight: '700', marginTop: 4 }}>Add Photo</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => setActiveFormTab('basic')}
              style={{
                flex: 1,
                paddingVertical: 12,
                alignItems: 'center',
                borderBottomWidth: 2,
                borderColor: activeFormTab === 'basic' ? colors.primary : 'transparent'
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: activeFormTab === 'basic' ? colors.primary : colors.text.secondary }}>
                1. Basic Details
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveFormTab('recipe')}
              style={{
                flex: 1,
                paddingVertical: 12,
                alignItems: 'center',
                borderBottomWidth: 2,
                borderColor: activeFormTab === 'recipe' ? colors.primary : 'transparent'
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: activeFormTab === 'recipe' ? colors.primary : colors.text.secondary }}>
                2. Formulation Recipe (BOM)
              </Text>
            </TouchableOpacity>
          </View>

          {activeFormTab === 'basic' && (
            <>
              <View style={styles.formSectionHeader}><Text style={styles.formSectionTitle}>Core Product Specifications</Text></View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Ayurvedic Formulation Name <Text style={{ color: 'red' }}>*</Text></Text>
                <View style={styles.formInput}>
                  <Ionicons name="leaf-outline" size={16} color={colors.text.muted} />
                  <TextInput
                    style={styles.formInputText}
                    placeholder="e.g. ABHAYARISHTA"
                    placeholderTextColor={colors.text.muted}
                    value={name}
                    onChangeText={setName}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Product SKU / Code (Auto-Generated)</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <View style={[styles.formInput, { flex: 1, backgroundColor: colors.bg.secondary }]}>
                    <Ionicons name="barcode-outline" size={16} color={colors.text.muted} />
                    <TextInput
                      style={[styles.formInputText, { color: colors.text.muted }]}
                      placeholder="Auto-generated on save"
                      placeholderTextColor={colors.text.muted}
                      value={sku}
                      editable={false}
                    />
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.formLabel}>Minimum Alert Level</Text>
                  <View style={styles.formInput}>
                    <Ionicons name="alert-circle-outline" size={16} color={colors.text.muted} />
                    <TextInput
                      style={styles.formInputText}
                      placeholder="e.g. 15"
                      placeholderTextColor={colors.text.muted}
                      value={minReorder}
                      onChangeText={setMinReorder}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>

              <View style={[styles.formSectionHeader, { marginTop: 12 }]}><Text style={styles.formSectionTitle}>Product Sizes & Pricing</Text></View>
              <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12, marginTop: -4 }}>
                Define the sizes/packaging units for this formulation. At least one size is required.
              </Text>

              {variantsList.map((variant, index) => (
                <View key={index} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: Platform.OS === 'web' ? 'nowrap' : 'wrap' }}>
                  <View style={[styles.formInput, { flex: 1, minWidth: 90 }]}>
                    <Text style={{ fontSize: 11, color: colors.text.muted, marginRight: 4 }}>Size:</Text>
                    <TextInput
                      style={styles.formInputText}
                      placeholder={`e.g. 250`}
                      placeholderTextColor={colors.text.muted}
                      value={variant.size}
                      onChangeText={(val) => {
                        const list = [...variantsList];
                        list[index].size = val;
                        setVariantsList(list);
                      }}
                      keyboardType="numeric"
                    />
                    <Text style={{ fontSize: 11, color: colors.text.muted, marginLeft: 2 }}>{getSizeUnit()}</Text>
                  </View>

                  <View style={[styles.formInput, { flex: 1.2, minWidth: 100 }]}>
                    <Text style={{ fontSize: 11, color: colors.text.muted, marginRight: 4 }}>B2B ₹:</Text>
                    <TextInput
                      style={styles.formInputText}
                      placeholder="Price"
                      placeholderTextColor={colors.text.muted}
                      value={variant.price}
                      onChangeText={(val) => {
                        const list = [...variantsList];
                        list[index].price = val;
                        setVariantsList(list);
                      }}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={[styles.formInput, { flex: 1.2, minWidth: 100 }]}>
                    <Text style={{ fontSize: 11, color: colors.text.muted, marginRight: 4 }}>MRP ₹:</Text>
                    <TextInput
                      style={styles.formInputText}
                      placeholder="MRP"
                      placeholderTextColor={colors.text.muted}
                      value={variant.mrp}
                      onChangeText={(val) => {
                        const list = [...variantsList];
                        list[index].mrp = val;
                        setVariantsList(list);
                      }}
                      keyboardType="numeric"
                    />
                  </View>

                  {variantsList.length > 1 && (
                    <TouchableOpacity
                      onPress={() => {
                        const list = [...variantsList];
                        list.splice(index, 1);
                        setVariantsList(list);
                      }}
                      style={{ width: 34, height: 34, borderRadius: 6, backgroundColor: colors.danger + '15', justifyContent: 'center', alignItems: 'center' }}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <TouchableOpacity
                onPress={() => setVariantsList([...variantsList, { size: '', price: '', mrp: '', packaging: [{ rawMaterialId: '', qtyRequired: '1', stageName: '' }] }])}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primary + '10', marginTop: 6, marginBottom: 16 }}
              >
                <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Add Size Variant</Text>
              </TouchableOpacity>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>HSN Code <Text style={{ color: 'red' }}>*</Text></Text>
                <View style={styles.formInput}>
                  <Ionicons name="finger-print" size={16} color={colors.text.muted} />
                  <TextInput style={styles.formInputText} placeholder="e.g. 30049011" placeholderTextColor={colors.text.muted} value={hsnCode} onChangeText={setHsnCode} />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Tax Slab (GST Rate) <Text style={{ color: 'red' }}>*</Text></Text>
                <View style={styles.formInput}>
                  <Ionicons name="cash-outline" size={16} color={colors.text.muted} />
                  {Platform.OS === 'web' ? (
                    <select
                      value={gstRate}
                      onChange={(e: any) => setGstRate(e.target.value)}
                      style={{ flex: 1, padding: 8, fontSize: 14, borderWidth: 0, outlineWidth: 0, backgroundColor: 'transparent', color: colors.text.primary }}
                    >
                      <option value="0">0% (Exempt)</option>
                      <option value="5">5% (Ayurvedic Classical / Herbs)</option>
                      <option value="12">12% (Patent Medicines)</option>
                      <option value="18">18% (Proprietary / Cosmetics)</option>
                      <option value="28">28% (Luxuries)</option>
                    </select>
                  ) : (
                    <TextInput
                      style={styles.formInputText}
                      placeholder="e.g. 12"
                      placeholderTextColor={colors.text.muted}
                      value={gstRate}
                      onChangeText={setGstRate}
                      keyboardType="numeric"
                    />
                  )}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Description (Website Detail Popup)</Text>
                <View style={[styles.formInput, { height: 80, alignItems: 'flex-start', paddingTop: 8 }]}>
                  <TextInput
                    style={[styles.formInputText, { height: '100%', textAlignVertical: 'top' }]}
                    placeholder="Enter therapeutic profile, benefits, dosage..."
                    placeholderTextColor={colors.text.muted}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Used For (Disease Indications)</Text>
                <View style={styles.formInput}>
                  <Ionicons name="medical-outline" size={16} color={colors.text.muted} />
                  <TextInput
                    style={styles.formInputText}
                    placeholder="e.g. Constipation, Piles, Indigestion"
                    placeholderTextColor={colors.text.muted}
                    value={disease}
                    onChangeText={setDisease}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Key Ingredients (Auto-Calculated from BOM)</Text>
                <View style={[styles.formInput, { height: 60, backgroundColor: colors.bg.secondary, alignItems: 'flex-start', paddingTop: 8 }]}>
                  <TextInput
                    style={[styles.formInputText, { height: '100%', color: colors.text.muted, textAlignVertical: 'top' }]}
                    placeholder="Will be auto-calculated from BOM recipe"
                    placeholderTextColor={colors.text.muted}
                    value={ingredients}
                    editable={false}
                    multiline
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Formulation Type</Text>
                <View style={styles.typeSelector}>
                  {types.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.typeBtn,
                        productType.toLowerCase() === t.toLowerCase() && { backgroundColor: colors.primary, borderColor: colors.primary }
                      ]}
                      onPress={() => {
                        setProductType(t);
                        setShowTypeInput(false);
                      }}
                    >
                      <Text style={[styles.typeBtnText, productType.toLowerCase() === t.toLowerCase() && { color: '#fff' }]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[styles.typeBtn, showTypeInput && { borderColor: colors.primary }]}
                    onPress={() => setShowTypeInput(!showTypeInput)}
                  >
                    <Text style={[styles.typeBtnText, { color: colors.primary }]}>+ Custom Type</Text>
                  </TouchableOpacity>
                </View>

                {showTypeInput && (
                  <View style={[styles.formInput, { marginTop: 10 }]}>
                    <TextInput
                      style={styles.formInputText}
                      placeholder="Enter custom type..."
                      placeholderTextColor={colors.text.muted}
                      value={newTypeName}
                      onChangeText={setNewTypeName}
                    />
                    <TouchableOpacity style={styles.addTypeSaveBtn} onPress={handleAddCustomType}>
                      <Text style={{ color: colors.primary, fontWeight: '700' }}>Save</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {productType ? (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Physical Form</Text>
                    <View style={styles.typeSelector}>
                      {shapes.map(s => (
                        <TouchableOpacity
                          key={s}
                          style={[
                            styles.typeBtn,
                            shape === s && { backgroundColor: colors.primary, borderColor: colors.primary }
                          ]}
                          onPress={() => { setShape(s); setShowShapeInput(false); }}
                        >
                          <Text style={[styles.typeBtnText, shape === s && { color: '#fff' }]}>{s.toUpperCase()}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.typeBtn, showShapeInput && { borderColor: colors.primary }]}
                        onPress={() => setShowShapeInput(!showShapeInput)}
                      >
                        <Text style={[styles.typeBtnText, { color: colors.primary }]}>+ Custom</Text>
                      </TouchableOpacity>
                    </View>
                    {showShapeInput && (
                      <View style={[styles.formInput, { marginTop: 10 }]}>
                        <TextInput
                          style={styles.formInputText}
                          placeholder="Enter custom form..."
                          placeholderTextColor={colors.text.muted}
                          value={newShapeName}
                          onChangeText={setNewShapeName}
                        />
                        <TouchableOpacity style={styles.addTypeSaveBtn} onPress={handleAddCustomShape}>
                          <Text style={{ color: colors.primary, fontWeight: '700' }}>Save</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Formulation Color</Text>
                    <View style={styles.formInput}>
                      <Ionicons name="color-palette" size={16} color={colors.text.muted} />
                      <TextInput
                        style={styles.formInputText}
                        placeholder="e.g. Amber, Reddish Brown, Blackish"
                        placeholderTextColor={colors.text.muted}
                        value={colour}
                        onChangeText={setColour}
                      />
                    </View>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Total Weight (in grams)</Text>
                    <View style={styles.formInput}>
                      <Ionicons name="speedometer" size={16} color={colors.text.muted} />
                      <TextInput
                        style={styles.formInputText}
                        placeholder="e.g. 500"
                        placeholderTextColor={colors.text.muted}
                        value={weight}
                        onChangeText={setWeight}
                      />
                    </View>
                  </View>
                </>
              ) : null}
            </>
          )}

          {activeFormTab === 'basic' && (
            <TouchableOpacity
              onPress={() => setActiveFormTab('recipe')}
              style={{
                backgroundColor: colors.primary + '15',
                borderColor: colors.primary,
                borderWidth: 1,
                borderRadius: 8,
                paddingVertical: 12,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
                marginTop: 20,
                marginBottom: 10
              }}
            >
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Next: Configure Recipe (BOM)</Text>
              <Ionicons name="arrow-forward-outline" size={16} color={colors.primary} />
            </TouchableOpacity>
          )}

          {activeFormTab === 'recipe' && (
            <>
              <View style={[styles.formSectionHeader, { marginTop: 24 }]}><Text style={styles.formSectionTitle}>Recipe Formulation & Process Stages</Text></View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Overhead Cost per Batch Run (₹)</Text>
                <View style={styles.formInput}>
                  <Ionicons name="calculator-outline" size={16} color={colors.text.muted} />
                  <TextInput
                    style={styles.formInputText}
                    placeholder="e.g. 1500"
                    placeholderTextColor={colors.text.muted}
                    value={bomOverhead}
                    onChangeText={setBomOverhead}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 12 }}>
                <Text style={styles.formLabel}>Formulation Status</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setBomIsActive(true)}
                    style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: bomIsActive ? colors.success : colors.bg.secondary, borderWidth: 1, borderColor: bomIsActive ? colors.success : colors.border }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: bomIsActive ? '#fff' : colors.text.secondary }}>Active</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setBomIsActive(false)}
                    style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, backgroundColor: !bomIsActive ? colors.danger : colors.bg.secondary, borderWidth: 1, borderColor: !bomIsActive ? colors.danger : colors.border }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: !bomIsActive ? '#fff' : colors.text.secondary }}>Inactive</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Default Production Execution Route *</Text>
                <View style={styles.formInput}>
                  {Platform.OS === 'web' ? (
                    <select
                      value={bomDefaultProductionType}
                      onChange={(e: any) => setBomDefaultProductionType(e.target.value)}
                      style={{ flex: 1, padding: 8, fontSize: 14, borderWidth: 0, outlineWidth: 0, backgroundColor: 'transparent', color: colors.text.primary }}
                    >
                      <option value="in_house">In-House Manufacturing</option>
                      <option value="job_work">Third-Party Job Work (Outsourced)</option>
                    </select>
                  ) : (
                    <TextInput style={styles.formInputText} value={bomDefaultProductionType} onChangeText={(val: any) => setBomDefaultProductionType(val)} />
                  )}
                </View>
              </View>

              {bomDefaultProductionType === 'job_work' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Default Job Worker Vendor *</Text>
                    <View style={styles.formInput}>
                      {Platform.OS === 'web' ? (
                        <select
                          value={bomDefaultJobWorkerId}
                          onChange={(e: any) => setBomDefaultJobWorkerId(e.target.value)}
                          style={{ flex: 1, padding: 8, fontSize: 14, borderWidth: 0, outlineWidth: 0, backgroundColor: 'transparent', color: colors.text.primary }}
                        >
                          <option value="">-- Choose Default Contract Manufacturer --</option>
                          {vendors.map(v => (
                            <option key={v._id} value={v._id}>{v.company || v.name} {v.manufacturingLicenseNo ? `(Lic: ${v.manufacturingLicenseNo})` : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <TextInput style={styles.formInputText} value={bomDefaultJobWorkerId} onChangeText={setBomDefaultJobWorkerId} />
                      )}
                    </View>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Default Job Work Mode *</Text>
                    <View style={styles.formInput}>
                      {Platform.OS === 'web' ? (
                        <select
                          value={bomDefaultJobWorkMode}
                          onChange={(e: any) => setBomDefaultJobWorkMode(e.target.value)}
                          style={{ flex: 1, padding: 8, fontSize: 14, borderWidth: 0, outlineWidth: 0, backgroundColor: 'transparent', color: colors.text.primary }}
                        >
                          <option value="raw_materials_supplied">Raw Materials Supplied (We Provide Ingredients)</option>
                          <option value="direct_purchase">Direct Purchase of Finished Bulk (Vendor Raw Materials)</option>
                        </select>
                      ) : (
                        <TextInput style={styles.formInputText} value={bomDefaultJobWorkMode} onChangeText={(val: any) => setBomDefaultJobWorkMode(val)} />
                      )}
                    </View>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Default Packaging & Labeling *</Text>
                    <View style={styles.formInput}>
                      {Platform.OS === 'web' ? (
                        <select
                          value={bomDefaultPackagingMode}
                          onChange={(e: any) => setBomDefaultPackagingMode(e.target.value)}
                          style={{ flex: 1, padding: 8, fontSize: 14, borderWidth: 0, outlineWidth: 0, backgroundColor: 'transparent', color: colors.text.primary }}
                        >
                          <option value="self_packed">Self-Packed (Deduct Bottles/Labels/Caps from our Stock)</option>
                          <option value="packed_by_vendor">Packed by Vendor (Finished Goods Received fully Boxed)</option>
                        </select>
                      ) : (
                        <TextInput style={styles.formInputText} value={bomDefaultPackagingMode} onChangeText={(val: any) => setBomDefaultPackagingMode(val)} />
                      )}
                    </View>
                  </View>
                </>
              )}

              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary, marginTop: 20, marginBottom: 4 }}>📋 Step 1: Manufacturing Process Stages:</Text>
              <Text style={{ fontSize: 10.5, color: colors.text.secondary, marginBottom: 10 }}>
                Define each stage first (e.g. Kwath, Fermentation, Filtration). Then you can assign each ingredient to the stage where it is added in Step 2.
              </Text>
              {bomStages.map((item, idx) => (
                <View key={`stage-${idx}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <View style={[styles.formInput, { flex: 2, height: 42 }]}>
                    <TextInput
                      style={styles.formInputText}
                      placeholder="e.g. Kwath (Boiling), Fermentation"
                      placeholderTextColor={colors.text.muted}
                      value={item.name}
                      onChangeText={(val) => handleStageChange(idx, 'name', val)}
                    />
                  </View>
                  <View style={[styles.formInput, { flex: 1, height: 42 }]}>
                    <TextInput
                      style={styles.formInputText}
                      placeholder="Days"
                      placeholderTextColor={colors.text.muted}
                      value={item.targetDurationDays}
                      onChangeText={(val) => handleStageChange(idx, 'targetDurationDays', val)}
                      keyboardType="numeric"
                    />
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveStageRow(idx)}>
                    <Ionicons name="remove-circle" size={22} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, alignSelf: 'flex-start', marginBottom: 20 }}
                onPress={handleAddStageRow}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Add Stage</Text>
              </TouchableOpacity>

              <View style={{ backgroundColor: colors.primary + '10', borderRadius: 8, borderWidth: 1, borderColor: colors.primary + '30', padding: 12, marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary, marginBottom: 4 }}>
                  📊 Formulation Standard
                </Text>
                <Text style={{ fontSize: 11, color: colors.text.secondary, marginBottom: 10 }}>
                  Enter ingredient quantities for this batch size. The system scales automatically to the actual production quantity.
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.secondary }}>1 Batch =</Text>
                  <View style={[styles.formInput, { flex: 1, height: 42, flexDirection: 'row', alignItems: 'center', maxWidth: 140 }]}>
                    <TextInput
                      style={[styles.formInputText, { flex: 1, fontSize: 16, fontWeight: '700' }]}
                      value={formulationBasis}
                      onChangeText={setFormulationBasis}
                      keyboardType="numeric"
                      placeholder="e.g. 10"
                      placeholderTextColor={colors.text.muted}
                    />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: colors.primary, marginRight: 8 }}>
                      {formulaStd.unit}
                    </Text>
                  </View>
                  {formulationBasis ? (
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary, flex: 1 }}>
                      → Formula per {formulationBasis} {formulaStd.unit}
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: colors.text.muted, flex: 1 }}>
                      ← Enter batch size
                    </Text>
                  )}
                </View>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary }}>🌿 Step 2: Formulation Ingredients:</Text>
                <View style={{
                  backgroundColor: colors.primary + '15',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: colors.primary + '40'
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>
                    Total: {totalFormulaQty.toFixed(3)} {formulaStd.unit}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 10.5, color: colors.text.secondary, marginTop: -4, marginBottom: 8 }}>
                Enter each ingredient quantity {formulaStd.label}. When a batch is launched, amounts are scaled automatically to the actual planned yield.
              </Text>
              {bomStages.filter(s => s.name.trim()).length === 0 && (
                <View style={{ backgroundColor: colors.warning + '18', borderWidth: 1, borderColor: colors.warning + '40', borderRadius: 6, padding: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
                  <Text style={{ fontSize: 11, color: colors.warning, flex: 1 }}>
                    Add your process stages above first — then you can assign each ingredient to its stage.
                  </Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2, marginBottom: 4 }}>
                <Text style={{ flex: 2, fontSize: 10, fontWeight: '700', color: colors.text.muted }}>INGREDIENT</Text>
                <Text style={{ flex: 1.2, fontSize: 10, fontWeight: '700', color: colors.text.muted }}>QTY ({formulaStd.unit}) / {formulationBasis}{formulaStd.unit}</Text>
                {bomStages.filter(s => s.name.trim()).length > 0 && (
                  <Text style={{ flex: 1.5, fontSize: 10, fontWeight: '700', color: colors.text.muted }}>ADDED IN STAGE</Text>
                )}
              </View>
              {bomIngredients.map((item, idx) => {
                if (item.itemType === 'packaging') return null;
                const formulationMaterials = materials.filter(rm => !rm.category || rm.category === 'Herb' || rm.category === 'Excipient' || rm.category === 'General');
                const selectedRM = materials.find(rm => rm._id === item.rawMaterialId);
                const rmUnit = selectedRM?.unit || '';
                return (
                  <View key={`ing-${idx}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <View style={[styles.formInput, { flex: 2, height: 42 }]}>
                      {Platform.OS === 'web' ? (
                        <select
                          value={item.rawMaterialId}
                          onChange={(e: any) => handleIngredientChange(idx, 'rawMaterialId', e.target.value)}
                          style={{ flex: 1, padding: 8, fontSize: 12, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                        >
                          <option value="">-- Select Formulation Material --</option>
                          {formulationMaterials.map(rm => {
                            const icon = rm.category === 'Excipient' ? '💧' : (rm.category === 'Packaging' ? '📦' : '🌿');
                            return (
                              <option key={rm._id} value={rm._id}>{icon} {rm.name} ({rm.sku})</option>
                            );
                          })}
                        </select>
                      ) : (
                        <TextInput
                          style={styles.formInputText}
                          placeholder="RM ID"
                          placeholderTextColor={colors.text.muted}
                          value={item.rawMaterialId}
                          onChangeText={(val) => handleIngredientChange(idx, 'rawMaterialId', val)}
                        />
                      )}
                    </View>
                    <View style={[styles.formInput, { flex: 1.2, height: 42, flexDirection: 'row', alignItems: 'center' }]}>
                      <TextInput
                        style={[styles.formInputText, { flex: 1 }]}
                        placeholder={rmUnit ? `Qty (${rmUnit})` : 'Qty'}
                        placeholderTextColor={colors.text.muted}
                        value={item.qtyRequired}
                        onChangeText={(val) => handleIngredientChange(idx, 'qtyRequired', val)}
                        keyboardType="numeric"
                      />
                      {rmUnit ? (
                        <Text style={{ fontSize: 11, color: colors.primary, marginRight: 6, fontWeight: '800', minWidth: 24, textAlign: 'right' }}>{rmUnit}</Text>
                      ) : (() => {
                        const val = parseFloat(item.qtyRequired) || 0;
                        const pct = (val * 100).toFixed(1);
                        return (
                          <Text style={{ fontSize: 10, color: colors.primary, marginRight: 8, fontWeight: '700' }}>
                            {pct}%
                          </Text>
                        );
                      })()}
                    </View>
                    {bomStages.filter(s => s.name.trim()).length > 0 && (
                      <View style={[styles.formInput, { flex: 1.5, height: 42 }]}>
                        {Platform.OS === 'web' ? (
                          <select
                            value={(item as any).stageName || ''}
                            onChange={(e: any) => handleIngredientChange(idx, 'stageName', e.target.value)}
                            style={{ flex: 1, padding: 8, fontSize: 12, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                          >
                            <option value="">-- At batch start --</option>
                            {bomStages.filter(s => s.name.trim()).map((s, si) => (
                              <option key={si} value={s.name}>{s.name}</option>
                            ))}
                          </select>
                        ) : (
                          <TextInput
                            style={styles.formInputText}
                            placeholder="Stage"
                            placeholderTextColor={colors.text.muted}
                            value={(item as any).stageName || ''}
                            onChangeText={(val) => handleIngredientChange(idx, 'stageName', val)}
                          />
                        )}
                      </View>
                    )}
                    <TouchableOpacity onPress={() => handleRemoveIngredientRow(idx)}>
                      <Ionicons name="remove-circle" size={22} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                );
              })}

              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, marginBottom: 16, alignSelf: 'flex-start' }}
                onPress={() => handleAddIngredientRow('formulation')}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Add Formulation Raw Material</Text>
              </TouchableOpacity>

              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary, marginTop: 16, marginBottom: 4 }}>📦 Packaging Materials per Size Variant (Per-Unit Pcs):</Text>
              <Text style={{ fontSize: 11, color: colors.text.secondary, marginBottom: 12 }}>
                Define container, cap, label, or boxes required for each specific size variant of this formulation.
              </Text>

              {variantsList.map((variant, vIdx) => {
                const sizeDisplay = variant.size ? `${variant.size} ${getSizeUnit()}` : 'Default Size';
                const pkgList = variant.packaging || [];
                const packagingMaterials = materials.filter(rm => rm.category === 'Packaging' || rm.category === 'General');

                return (
                  <View key={`var-pkg-${vIdx}`} style={{ marginBottom: 16, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.secondary + '40' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 8 }}>
                      Size Variant: {sizeDisplay}
                    </Text>

                    {pkgList.map((pkg, pIdx) => (
                      <View key={`pkg-${vIdx}-${pIdx}`} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <View style={[styles.formInput, { flex: 2, height: 42 }]}>
                          {Platform.OS === 'web' ? (
                            <select
                              value={pkg.rawMaterialId}
                              onChange={(e: any) => handleVariantPackagingChange(vIdx, pIdx, 'rawMaterialId', e.target.value)}
                              style={{ flex: 1, padding: 8, fontSize: 12, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                            >
                              <option value="">-- Select Packaging Material --</option>
                              {packagingMaterials.map(rm => (
                                <option key={rm._id} value={rm._id}>📦 {rm.name}</option>
                              ))}
                            </select>
                          ) : (
                            <TextInput
                              style={styles.formInputText}
                              placeholder="Material ID"
                              placeholderTextColor={colors.text.muted}
                              value={pkg.rawMaterialId}
                              onChangeText={(val) => handleVariantPackagingChange(vIdx, pIdx, 'rawMaterialId', val)}
                            />
                          )}
                        </View>
                        <View style={[styles.formInput, { flex: 1.2, height: 42, flexDirection: 'row', alignItems: 'center' }]}>
                          <TextInput
                            style={[styles.formInputText, { flex: 1 }]}
                            placeholder="Qty"
                            placeholderTextColor={colors.text.muted}
                            value={pkg.qtyRequired}
                            onChangeText={(val) => handleVariantPackagingChange(vIdx, pIdx, 'qtyRequired', val)}
                            keyboardType="numeric"
                          />
                          <Text style={{ fontSize: 10, color: colors.primary, marginRight: 6, fontWeight: '700' }}>Pcs/unit</Text>
                        </View>
                        {bomStages.filter(s => s.name.trim()).length > 0 && (
                          <View style={[styles.formInput, { flex: 1.2, height: 42 }]}>
                            {Platform.OS === 'web' ? (
                              <select
                                value={pkg.stageName || ''}
                                onChange={(e: any) => handleVariantPackagingChange(vIdx, pIdx, 'stageName', e.target.value)}
                                style={{ flex: 1, padding: 8, fontSize: 12, backgroundColor: 'transparent', border: 'none', color: colors.text.primary }}
                              >
                                <option value="">-- At batch start --</option>
                                {bomStages.filter(s => s.name.trim()).map((s, si) => (
                                  <option key={si} value={s.name}>{s.name}</option>
                                ))}
                              </select>
                            ) : (
                              <TextInput
                                style={styles.formInputText}
                                placeholder="Stage"
                                placeholderTextColor={colors.text.muted}
                                value={pkg.stageName || ''}
                                onChangeText={(val) => handleVariantPackagingChange(vIdx, pIdx, 'stageName', val)}
                              />
                            )}
                          </View>
                        )}
                        <TouchableOpacity onPress={() => handleRemoveVariantPackagingRow(vIdx, pIdx)}>
                          <Ionicons name="remove-circle" size={22} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    ))}

                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, alignSelf: 'flex-start' }}
                      onPress={() => handleAddVariantPackagingRow(vIdx)}
                    >
                      <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>Add Packaging Material</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              <View style={[styles.formGroup, { marginTop: 12 }]}>
                <Text style={styles.formLabel}>Manufacturing SOP & Operational Notes</Text>
                <View style={[styles.formInput, { height: 90, alignItems: 'flex-start', paddingTop: 8 }]}>
                  <TextInput
                    style={[styles.formInputText, { height: '100%', textAlignVertical: 'top' }]}
                    placeholder="Instructions for processing, boiling time, temperature settings, blending sequence..."
                    placeholderTextColor={colors.text.muted}
                    value={bomNotes}
                    onChangeText={setBomNotes}
                    multiline
                  />
                </View>
              </View>

              <TouchableOpacity
                style={{
                  backgroundColor: colors.bg.secondary,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingVertical: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 6,
                  marginTop: 10,
                  marginBottom: 20
                }}
                onPress={() => setActiveFormTab('basic')}
              >
                <Ionicons name="arrow-back-outline" size={16} color={colors.text.secondary} />
                <Text style={{ color: colors.text.secondary, fontWeight: '700', fontSize: 13 }}>Back to Product Details</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
