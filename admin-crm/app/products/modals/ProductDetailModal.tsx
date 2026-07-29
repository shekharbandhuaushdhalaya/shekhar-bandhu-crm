import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing } from '../../../constants/theme';
import { api, Product, getImageUrl } from '../../../utils/api';
import { useAuth } from '../../../utils/auth';
import { usePermission } from '../../../utils/permissions';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { useToast } from '../../../utils/ToastContext';
import { createStyles } from '../productsStyles';

interface Props {
  product: Product | null;
  visible: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onEdit: () => void;
  onAddSizeVariant: (id: string) => void;
  products: Product[];
}

export default function ProductDetailModal({ product, visible, onClose, onDeleted, onEdit, onAddSizeVariant, products }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuth();
  const perm = usePermission();
  const { showToast } = useToast();

  if (!product) return null;

  const handleDelete = async () => {
    try {
      const success = await api.deleteProduct(product._id);
      if (success) {
        showToast('Product deleted successfully. Inventory ledger preserved.', 'success');
        onDeleted();
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete product', 'error');
    }
  };

  const isLowStock = product.stockLevel <= product.minReorder;
  const children = products.filter(p => p.parentId === product._id);
  const allVariants = [product, ...children];

  const getSizeUnit = () => {
    const s = (product.shape || '').toLowerCase().trim();
    if (s === 'liquid') return 'ml';
    if (s === 'tablet') return 'Tablets';
    if (s === 'capsule') return 'Capsules';
    if (s === 'powder' || s === 'paste') return 'g';
    return 'ml';
  };

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
          {/* Image Gallery */}
          <View style={{ marginBottom: Spacing.lg }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 10, alignSelf: 'center', paddingVertical: 5 }}>
              {product.image ? (
                product.image.split(',').map((img, idx) => (
                  <View key={idx} style={{ width: 120, height: 120, borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', backgroundColor: colors.bg.secondary }}>
                    <Image source={{ uri: getImageUrl(img.trim()) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </View>
                ))
              ) : (
                <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: colors.bg.secondary, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                  <Ionicons name="cube" size={36} color={colors.primary} />
                </View>
              )}
            </ScrollView>
          </View>

          <View style={styles.profileHeader}>
            <Text style={styles.profileName}>{product.name}</Text>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="finger-print" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>HSN Code</Text>
                <Text style={styles.infoValue}>{product.hsnCode || 'N/A'}</Text>
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

            {product.productType ? (
              <View style={styles.infoItem}>
                <View style={[styles.infoIcon, { backgroundColor: colors.infoLight }]}>
                  <Ionicons name="options" size={16} color={colors.info} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Product Type</Text>
                  <Text style={styles.infoValue}>{product.productType}</Text>
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
                <View style={[styles.infoIcon, { backgroundColor: colors.purple ? colors.purple + '15' : '#8a2be215' }]}>
                  <Ionicons name="shapes" size={16} color={colors.purple || '#8a2be2'} />
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

          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>Available Sizes & Pricing:</Text>
            <View style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', backgroundColor: colors.bg.secondary, padding: 8 }}>
                <Text style={{ flex: 1.5, fontSize: 11, fontWeight: '700', color: colors.text.muted }}>Size</Text>
                <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: colors.text.muted }}>B2B Price</Text>
                <Text style={{ flex: 1.2, fontSize: 11, fontWeight: '700', color: colors.text.muted }}>MRP</Text>
                <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: colors.text.muted }}>Stock</Text>
              </View>
              {allVariants.map((v, idx) => (
                <View key={idx} style={{ flexDirection: 'row', padding: 8, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'center' }}>
                  <Text style={{ flex: 1.5, fontSize: 12, color: colors.text.primary, fontWeight: '600' }}>{v.size || 'N/A'}</Text>
                  <Text style={{ flex: 1.2, fontSize: 12, color: colors.text.primary }}>₹{v.price}</Text>
                  <Text style={{ flex: 1.2, fontSize: 12, color: colors.text.primary }}>{v.mrp ? `₹${v.mrp}` : '—'}</Text>
                  <Text style={{ flex: 1, fontSize: 12, color: v.stockLevel <= v.minReorder ? colors.danger : colors.text.primary, fontWeight: v.stockLevel <= v.minReorder ? '700' : 'normal' }}>
                    {v.stockLevel} units
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 16, flexWrap: 'wrap' }}>
            {!product.parentId && perm.can('product:editPricing') && (
              <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.info }]} onPress={() => onAddSizeVariant(product._id)}>
                <Ionicons name="git-branch-outline" size={16} color="#fff" />
                <Text style={styles.editBtnText}>Add Size</Text>
              </TouchableOpacity>
            )}
            {perm.can('product:editPricing') && (
              <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
                <Ionicons name="create-outline" size={16} color="#fff" />
                <Text style={styles.editBtnText}>Edit Details</Text>
              </TouchableOpacity>
            )}
            {perm.can('product:delete') && (
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
