import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl, Modal, FlatList, KeyboardAvoidingView, Platform, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api, Product, getImageUrl } from '../utils/api';
import { useAuth } from '../utils/auth';
import { useTheme, useStyles } from '../utils/themeContext';
import { useToast } from '../utils/ToastContext';
import { DataTable, Column } from '../components/DataTable';

const normalizeTitleCase = (str?: string) => {
  if (!str) return '';
  return str.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const normalizeWhitespace = (str?: string) => {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ');
};

function ProductDetailModal({ product, visible, onClose, onDeleted, onEdit }: { product: Product | null; visible: boolean; onClose: () => void; onDeleted: () => void; onEdit: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuth();
  const { showToast } = useToast();

  if (!product) return null;

  const handleDelete = async () => {
    try {
      const success = await api.deleteProduct(product._id);
      if (success) {
        onDeleted();
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete product', 'error');
    }
  };

  const isLowStock = product.stockLevel <= product.minReorder;

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={26} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Product Specifications</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
          
          {/* Image Picker */}
          <View style={{ alignItems: 'center', marginBottom: Spacing.lg }}>
            <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.bg.secondary, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
              {product.image ? (
                <Image source={{ uri: getImageUrl(product.image) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <Ionicons name="cube" size={36} color={colors.primary} />
              )}
            </View>
          </View>

          <View style={styles.profileHeader}>
            <Text style={styles.profileName}>{product.name}</Text>
          </View>

          <View style={styles.infoGrid}>


            {/* Indian GST Tax settings */}
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="finger-print" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>HSN Code</Text>
                <Text style={styles.infoValue}>
                  {product.hsnCode || 'N/A'}
                </Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.successLight }]}>
                <Ionicons name="cash" size={16} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>GST Rate (Tax Slab)</Text>
                <Text style={styles.infoValue}>
                  {product.gstRate !== undefined ? `${product.gstRate}%` : '18%'}
                </Text>
              </View>
            </View>

            {product.ingredients ? (
              <View style={styles.infoItem}>
                <View style={[styles.infoIcon, { backgroundColor: colors.infoLight }]}>
                  <Ionicons name="flask" size={16} color={colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Key Ingredients</Text>
                  <Text style={[styles.infoValue, { fontStyle: 'italic' }]}>
                    {product.ingredients}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Dynamic Attributes */}
            {product.productType ? (
              <View style={styles.infoItem}>
                <View style={[styles.infoIcon, { backgroundColor: colors.infoLight }]}>
                  <Ionicons name="options" size={16} color={colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Product Type & Size</Text>
                  <Text style={styles.infoValue}>
                    {product.productType} {product.size ? `(${product.size})` : ''}
                  </Text>
                </View>
              </View>
            ) : null}

            {product.colour ? (
              <View style={styles.infoItem}>
                <View style={[styles.infoIcon, { backgroundColor: colors.warningLight }]}>
                  <Ionicons name="color-palette" size={16} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Colour</Text>
                  <Text style={styles.infoValue}>{product.colour}</Text>
                </View>
              </View>
            ) : null}

            {product.shape ? (
              <View style={styles.infoItem}>
                <View style={[styles.infoIcon, { backgroundColor: colors.purple + '15' }]}>
                  <Ionicons name="shapes" size={16} color={colors.purple} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Shape</Text>
                  <Text style={styles.infoValue}>{product.shape.toUpperCase()}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.dangerLight }]}>
                <Ionicons name="speedometer" size={16} color={colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Weight</Text>
                <Text style={styles.infoValue}>{product.weight || 'N/A'}</Text>
              </View>
            </View>

            {product.description ? (
              <View style={[styles.infoItem, { width: '100%' }]}>
                <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="document-text" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Description</Text>
                  <Text style={styles.infoValue}>{product.description}</Text>
                </View>
              </View>
            ) : null}

            {product.disease ? (
              <View style={[styles.infoItem, { width: '100%' }]}>
                <View style={[styles.infoIcon, { backgroundColor: colors.warningLight }]}>
                  <Ionicons name="medical" size={16} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Used For (Disease)</Text>
                  <Text style={styles.infoValue}>{product.disease}</Text>
                </View>
              </View>
            ) : null}

            {product.vendorName ? (
              <View style={styles.infoItem}>
                <View style={[styles.infoIcon, { backgroundColor: colors.successLight }]}>
                  <Ionicons name="business" size={16} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Preferred Vendor</Text>
                  <Text style={styles.infoValue}>{product.vendorName}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 16 }}>
            {user?.role !== 'agent' && (
              <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={styles.editBtnText}>Edit Details</Text>
              </TouchableOpacity>
            )}
            {user?.role === 'admin' && (
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={16} color="#fff" />
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function AddEditProductModal({ visible, onClose, onSaved, product, products }: { visible: boolean; onClose: () => void; onSaved: () => void; product?: Product | null; products: Product[] }) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');

  const [minReorder, setMinReorder] = useState('5');
  const [hsnCode, setHsnCode] = useState('');
  const [gstRate, setGstRate] = useState('18');

  const fileInputRef = React.useRef<any>(null);

  const handleFileChange = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageUri(reader.result as string);
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

  const [size, setSize] = useState('');
  const [colour, setColour] = useState('');
  const [shape, setShape] = useState('');
  const [weight, setWeight] = useState('');
  const [description, setDescription] = useState('');
  const [disease, setDisease] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);

  const [shapes, setShapes] = useState(['liquid', 'tablet', 'capsule', 'powder', 'paste']);
  const [showShapeInput, setShowShapeInput] = useState(false);
  const [newShapeName, setNewShapeName] = useState('');

  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setSku(product.sku || '');
      setPrice(product.price !== undefined && product.price !== null ? product.price.toString() : '');
      setStock(product.stockLevel !== undefined && product.stockLevel !== null ? product.stockLevel.toString() : '');
      setMinReorder(product.minReorder !== undefined && product.minReorder !== null ? product.minReorder.toString() : '5');
      setHsnCode(product.hsnCode || '');
      setGstRate(product.gstRate !== undefined ? product.gstRate.toString() : '18');
      setProductType(product.productType || '');
      // Strip the unit suffix from size (e.g. '100 ml' → '100')
      const sizeVal = product.size || '';
      const sizeNumber = sizeVal.replace(/\s*(ml|mm|pcs)$/i, '').trim();
      setSize(sizeNumber);
      setColour(product.colour || '');
      setShape(product.shape || '');
      // Strip 'g' suffix from weight (e.g. '24g' → '24')
      const weightVal = product.weight || '';
      setWeight(weightVal.replace(/g$/i, '').trim());
      setDescription(product.description || '');
      setDisease(product.disease || '');
      setIngredients(product.ingredients || '');
      
      if (product.image) {
        setImageUri(getImageUrl(product.image));
      } else {
        setImageUri(null);
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
      setPrice('');
      setStock('');

      setHsnCode('');
      setGstRate('18');
      setProductType('');
      setSize('');
      setColour('');
      setShape('');
      setWeight('');
      setDescription('');
      setDisease('');
      setIngredients('');
      setImageUri(null);
    }
    setShowTypeInput(false);
    setNewTypeName('');
    setShowShapeInput(false);
    setNewShapeName('');
  }, [product, visible]);

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

  const getSizeUnit = () => {
    const t = (productType || '').toLowerCase();
    if (t.includes('asava') || t.includes('arishta') || t.includes('syrup') || t.includes('oil')) return 'ml';
    if (t.includes('vati') || t.includes('guggulu') || t.includes('tablet') || t.includes('capsule')) return 'Tablets';
    if (t.includes('avaleha') || t.includes('churn') || t.includes('powder')) return 'g';
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
      setImageUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    let finalName = name.trim();
    let finalSku = sku.trim();
    let finalCategory = productType || 'General';
    let finalPrice = price.trim() !== '' ? parseFloat(price) : 0;
    let finalStock = stock.trim() !== '' ? parseInt(stock) : 0;
    let finalMinReorder = minReorder.trim() !== '' ? parseInt(minReorder) : 5;

    if (!finalName) {
      showToast('Ayurvedic Formulation Name is required!', 'error');
      return;
    }
    if (!finalSku) {
      showToast('Product SKU / Code is required!', 'error');
      return;
    }

    const sizeUnit = getSizeUnit();
    let formattedSize = '';
    if (size.trim()) {
      const trimmedSize = size.trim();
      formattedSize = trimmedSize.toLowerCase().endsWith(sizeUnit.toLowerCase()) 
        ? trimmedSize 
        : `${trimmedSize} ${sizeUnit}`;
    }

    const isDuplicate = products.some(p => 
      p._id !== (product?._id || '') &&
      p.sku.toLowerCase() === finalSku.toLowerCase()
    );

    if (!hsnCode.trim()) {
      showToast('HSN Code is mandatory!', 'error');
      return;
    }

    if (isDuplicate) {
      showToast('A product with this SKU already exists!', 'error');
      return;
    }

    const payload = {
      name: finalName,
      sku: finalSku,
      price: finalPrice,
      stockLevel: product ? product.stockLevel : 0,
      category: finalCategory,
      minReorder: finalMinReorder,
      hsnCode: hsnCode.trim().toUpperCase(),
      gstRate: parseInt(gstRate) || 18,
      productType: productType,
      size: formattedSize,
      colour: colour.trim(),
      shape: shape.trim(),
      weight: weight.trim(),
      description: description.trim(),
      disease: disease.trim(),
      ingredients: ingredients.trim(),
      vendorId: product?.vendorId || '',
      vendorName: product?.vendorName || ''
    };

    try {
      let savedProduct;
      if (product) {
        savedProduct = await api.updateProduct(product._id, payload);
      } else {
        savedProduct = await api.createProduct(payload);
      }
      
      if (imageUri && (imageUri.startsWith('file:') || imageUri.startsWith('blob:') || imageUri.startsWith('data:'))) {
        await api.uploadProductImage(savedProduct._id, imageUri);
      }

      onSaved();
      onClose();
      showToast('Product saved successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save product specification', 'error');
    }
  };

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
          
          <View style={{ alignItems: 'center', marginBottom: Spacing.lg }}>
            {Platform.OS === 'web' && (
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handleFileChange}
              />
            )}
            <TouchableOpacity onPress={triggerFileSelect} style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.bg.secondary, justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <Ionicons name="camera-outline" size={32} color={colors.text.muted} />
              )}
            </TouchableOpacity>
            <Text style={{ marginTop: 8, fontSize: 12, color: colors.text.muted }}>Tap to {imageUri ? 'change' : 'add'} image</Text>
          </View>
          
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
            <Text style={styles.formLabel}>Product SKU / Code <Text style={{ color: 'red' }}>*</Text></Text>
            <View style={styles.formInput}>
              <Ionicons name="barcode-outline" size={16} color={colors.text.muted} />
              <TextInput 
                style={styles.formInputText} 
                placeholder="e.g. ASV-ABH-450" 
                placeholderTextColor={colors.text.muted} 
                value={sku} 
                onChangeText={setSku} 
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.formLabel}>B2B Price (₹) <Text style={{ color: 'red' }}>*</Text></Text>
              <View style={styles.formInput}>
                <Ionicons name="cash-outline" size={16} color={colors.text.muted} />
                <TextInput 
                  style={styles.formInputText} 
                  placeholder="e.g. 120" 
                  placeholderTextColor={colors.text.muted} 
                  value={price} 
                  onChangeText={setPrice} 
                  keyboardType="numeric" 
                />
              </View>
            </View>

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
              {Platform.OS === 'web' ? React.createElement('select', {
                value: gstRate,
                onChange: (e: any) => setGstRate(e.target.value),
                style: { flex: 1, padding: 8, fontSize: 14, border: 'none', outline: 'none', backgroundColor: 'transparent', color: colors.text.primary }
              }, [
                React.createElement('option', { value: '0', key: '0' }, '0% (Exempt)'),
                React.createElement('option', { value: '5', key: '5' }, '5% (Ayurvedic Classical / Herbs)'),
                React.createElement('option', { value: '12', key: '12' }, '12% (Patent Medicines)'),
                React.createElement('option', { value: '18', key: '18' }, '18% (Proprietary / Cosmetics)'),
                React.createElement('option', { value: '28', key: '28' }, '28% (Luxuries)')
              ]) : (
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
            <Text style={styles.formLabel}>Key Ingredients (Comma-separated)</Text>
            <View style={[styles.formInput, { height: 80, alignItems: 'flex-start', paddingTop: 8 }]}>
              <TextInput
                style={[styles.formInputText, { height: '100%', textAlignVertical: 'top' }]}
                placeholder="e.g. Ashwagandha, Shatavari, Safed Musli..."
                placeholderTextColor={colors.text.muted}
                value={ingredients}
                onChangeText={setIngredients}
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
                <Text style={styles.formLabel}>Size / Quantity (in {getSizeUnit()})</Text>
                <View style={styles.formInput}>
                  <Ionicons name="expand" size={16} color={colors.text.muted} />
                  <TextInput
                    style={styles.formInputText}
                    placeholder={`e.g. 250 (unit: ${getSizeUnit()})`}
                    placeholderTextColor={colors.text.muted}
                    value={size}
                    onChangeText={setSize}
                  />
                </View>
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
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const toTitleCase = (str?: string | null): string => {
  if (!str) return '—';
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export default function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProd, setSelectedProd] = useState<Product | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [selectedTypeFilter, setSelectedTypeFilter] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [availableTypes, setAvailableTypes] = useState(['Asava & Arishta', 'Syrups', 'Medicated Oils', 'Vati & Guggulu', 'Avaleha', 'Churn']);

  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useStyles(createStyles);

  const load = useCallback(async () => {
    try {
      const res = await api.getProducts(search);
      setProducts(res);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (products.length > 0) {
      const foundTypes = products.map(p => p.productType).filter(Boolean) as string[];
      setAvailableTypes(prev => {
        const next = [...prev];
        foundTypes.forEach(t => {
          const norm = normalizeTitleCase(t);
          if (norm && !next.map(x => normalizeTitleCase(x)).includes(norm)) {
            next.push(norm);
          }
        });
        return Array.from(new Set(next.map(t => normalizeTitleCase(t))));
      });
    }
  }, [products]);

  const filteredProducts = products.filter(item => {
    if (!selectedTypeFilter) return true;
    return normalizeTitleCase(item.productType) === normalizeTitleCase(selectedTypeFilter);
  }).sort((a, b) => {
    const sizeA = parseFloat(a.size || '0') || 0;
    const sizeB = parseFloat(b.size || '0') || 0;
    return sizeA - sizeB;
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const columns: Column<Product>[] = [
    {
      key: 'image',
      title: 'Image',
      width: 60,
      align: 'center',
      render: (item) => (
        item.image ? (
          <Image source={{ uri: getImageUrl(item.image) }} style={{ width: 36, height: 36, borderRadius: 18 }} />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="cube" size={18} color={colors.primary} />
          </View>
        )
      )
    },
    {
      key: 'name',
      title: 'Name',
      flex: 2.5,
      render: (item) => <Text style={[styles.tableCell, { fontWeight: '700' }]} numberOfLines={1}>{item.name}</Text>
    },
    {
      key: 'size',
      title: 'Size',
      flex: 1.5,
      render: (item) => <Text style={styles.tableCell} numberOfLines={1}>{toTitleCase(item.size)}</Text>
    },
    {
      key: 'type',
      title: 'Type',
      flex: 1.5,
      render: (item) => <Text style={[styles.tableCell, { color: colors.primary, fontWeight: '600' }]} numberOfLines={1}>{toTitleCase(item.productType)}</Text>
    },
    {
      key: 'action',
      title: 'Action',
      width: 100,
      align: 'center',
      render: (item) => (
        <TouchableOpacity style={styles.viewBtn} onPress={() => { setSelectedProd(item); setDetailVisible(true); }}>
          <Text style={styles.viewBtnText}>View</Text>
        </TouchableOpacity>
      )
    }
  ];

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
            <TextInput
              style={[styles.searchInput, { minWidth: 100 }]}
              placeholder="Search products..."
              placeholderTextColor={colors.text.muted}
              value={search}
              onChangeText={setSearch}
            />
            
            {/* Product Type Filter Dropdown */}
            <TouchableOpacity style={[styles.filterDropdownButton, { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 4 }]} onPress={() => setShowFilterDropdown(!showFilterDropdown)}>
              <Text style={styles.filterDropdownButtonText}>
                {selectedTypeFilter || 'All Types'}
              </Text>
              <Ionicons name={showFilterDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={colors.text.muted} />
            </TouchableOpacity>

            {user?.role !== 'agent' && (
              <TouchableOpacity style={styles.addBtn} onPress={() => { setSelectedProd(null); setIsEditing(false); setAddVisible(true); }}>
                <Ionicons name="add" size={22} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {showFilterDropdown && (
            <View style={styles.filterDropdownPanel}>
              <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
                <TouchableOpacity
                  style={styles.filterDropdownItem}
                  onPress={() => {
                    setSelectedTypeFilter('');
                    setShowFilterDropdown(false);
                  }}
                >
                  <Text style={styles.filterDropdownItemText}>All Types</Text>
                </TouchableOpacity>
                {availableTypes.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={styles.filterDropdownItem}
                    onPress={() => {
                      setSelectedTypeFilter(t);
                      setShowFilterDropdown(false);
                    }}
                  >
                    <Text style={styles.filterDropdownItemText}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={{ flex: 1, marginHorizontal: Spacing.lg, marginBottom: Spacing.md }}>
          <DataTable 
            data={filteredProducts}
            columns={columns}
            keyExtractor={item => item._id}
            isLoading={loading}
            isRefreshing={refreshing}
            onRefresh={onRefresh}
            ListEmptyComponent={
              <View style={styles.emptyTableContainer}>
                <Ionicons name="folder-open-outline" size={28} color={colors.text.muted} />
                <Text style={styles.emptyText}>No products found</Text>
              </View>
            }
          />
        </View>
      </View>

      <ProductDetailModal
        product={selectedProd}
        visible={detailVisible}
        onClose={() => { setDetailVisible(false); load(); }}
        onDeleted={load}
        onEdit={() => {
          setDetailVisible(false);
          setIsEditing(true);
          setAddVisible(true);
        }}
      />
      
      <AddEditProductModal
        visible={addVisible}
        onClose={() => {
          setAddVisible(false);
          setSelectedProd(null);
          setIsEditing(false);
        }}
        onSaved={load}
        product={isEditing ? selectedProd : null}
        products={products}
      />
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg.primary },
  innerContainer: { flex: 1, width: '100%', maxWidth: 1200, alignSelf: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.card, margin: Spacing.lg, paddingHorizontal: 14, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, gap: 10 },
  searchInput: { flex: 1, height: 46, color: colors.text.primary, fontSize: 14 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.text.muted, textAlign: 'center', marginTop: 40, fontSize: 13 },

  table: { width: '100%', backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, marginVertical: Spacing.md, overflow: 'hidden' },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary, alignItems: 'center' },
  tableHeaderCell: { fontSize: 11, fontWeight: '800', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableHeaderCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  tableBodyRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'center' },
  tableCell: { fontSize: 13, color: colors.text.primary },
  tableCellContainer: { borderRightWidth: 1, borderRightColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  primaryText: { fontSize: 13, fontWeight: '700', color: colors.text.primary },
  secondaryText: { fontSize: 10, color: colors.text.muted, marginTop: 1 },
  outstandingText: { fontSize: 13, fontWeight: '800' },
  actionIconButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  viewBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  viewBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  emptyTableContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontWeight: '800' },

  modalContainer: { flex: 1, backgroundColor: colors.bg.primary, width: '100%', maxWidth: 650, alignSelf: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bg.secondary },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text.primary },
  profileHeader: { alignItems: 'center', marginBottom: 20, marginTop: 10 },
  profileAvatar: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  profileName: { fontSize: 22, fontWeight: '800', color: colors.text.primary },
  profileSku: { fontSize: 14, color: colors.text.secondary },
  infoGrid: { backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border, padding: Spacing.lg, gap: 16 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 11, color: colors.text.muted, fontWeight: '600' },
  infoValue: { fontSize: 14, color: colors.text.primary, fontWeight: '500' },

  formSectionHeader: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6, marginTop: 20, marginBottom: 12 },
  formSectionTitle: { fontSize: 12, fontWeight: '800', color: colors.primary, textTransform: 'uppercase' },
  typeSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  typeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg.card },
  typeBtnText: { fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  addTypeSaveBtn: { paddingHorizontal: 14, height: 46, justifyContent: 'center', alignItems: 'center' },
  dropdownPanel: { backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, marginTop: 4, overflow: 'hidden' },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropdownItemText: { fontSize: 13, color: colors.text.primary },
  
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: Radius.md, paddingVertical: 12, flex: 1 },
  editBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.danger, borderRadius: Radius.md, paddingVertical: 12, width: 120 },
  deleteBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 12, fontWeight: '700', color: colors.text.secondary, marginBottom: 6 },
  formInput: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, height: 48 },
  formInputText: { flex: 1, height: 46, color: colors.text.primary, fontSize: 14 },

  filterDropdownButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, height: 36, gap: 6 },
  filterDropdownButtonText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  filterDropdownPanel: { position: 'absolute', top: 52, right: 50, backgroundColor: colors.bg.card, borderRadius: Radius.md, borderWidth: 1, borderColor: colors.border, width: 220, zIndex: 9999, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 12 },
  filterDropdownItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterDropdownItemText: { fontSize: 13, color: colors.text.primary },
});
