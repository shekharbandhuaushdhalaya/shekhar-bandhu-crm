import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl, FlatList, KeyboardAvoidingView, Platform, Image, Pressable, DeviceEventEmitter } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api, Product, getImageUrl } from '../utils/api';
import { useAuth } from '../utils/auth';
import { usePermission } from '../utils/permissions';
import { useTheme, useStyles } from '../utils/themeContext';
import { useToast } from '../utils/ToastContext';
import { DataTable, Column } from '../components/DataTable';
import PricingScreen from './pricing';
import { createStyles } from './products/productsStyles';
import ProductDetailModal from './products/modals/ProductDetailModal';
import AddEditProductModal from './products/modals/AddEditProductModal';

const normalizeTitleCase = (str?: string) => {
  if (!str) return '';
  return str.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

const normalizeWhitespace = (str?: string) => {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ');
};

const toTitleCase = (str?: string | null): string => {
  if (!str) return '—';
  return str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export default function ProductsScreen() {
  const [topTab, setTopTab] = useState<'products' | 'pricing'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedProd, setSelectedProd] = useState<Product | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [parentProductId, setParentProductId] = useState<string | null>(null);

  const [selectedTypeFilter, setSelectedTypeFilter] = useState('');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [availableTypes, setAvailableTypes] = useState(['Asava & Arishta', 'Syrups', 'Medicated Oils', 'Vati & Guggulu', 'Avaleha', 'Churn']);

  const { colors } = useTheme();
  const { user } = useAuth();
  const perm = usePermission();
  const styles = useStyles(createStyles);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (resetPage = true) => {
    try {
      const targetPage = resetPage ? 1 : page;
      const res = await api.getProducts(search, targetPage, 50);
      const list = Array.isArray(res) ? res : (res?.data || []);
      const totalP = res && !Array.isArray(res) && res.totalPages ? res.totalPages : 1;

      if (resetPage) {
        setProducts(list);
        setPage(1);
      } else {
        setProducts(prev => {
          const existingIds = new Set(prev.map(p => String(p._id)));
          const nextItems = list.filter((p: any) => p && p._id && !existingIds.has(String(p._id)));
          return [...prev, ...nextItems];
        });
      }
      setTotalPages(totalP);
      setHasMore(targetPage < totalP || list.length === 50);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await api.getProducts(search, nextPage, 50);
      const list = Array.isArray(res) ? res : (res?.data || []);
      const totalP = res && !Array.isArray(res) && res.totalPages ? res.totalPages : 1;
      setProducts(prev => {
        const existingIds = new Set(prev.map(p => String(p._id)));
        const nextItems = list.filter((p: any) => p && p._id && !existingIds.has(String(p._id)));
        return [...prev, ...nextItems];
      });
      setPage(nextPage);
      setTotalPages(totalP);
      setHasMore(nextPage < totalP || list.length === 50);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const sub1 = DeviceEventEmitter.addListener('inventory_updated_event', () => load(true));
    const sub2 = DeviceEventEmitter.addListener('mfg_stage_updated_event', () => load(true));
    const sub3 = DeviceEventEmitter.addListener('mfg_batch_created_event', () => load(true));
    return () => {
      sub1.remove();
      sub2.remove();
      sub3.remove();
    };
  }, [load]);

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
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    const sizeA = parseFloat(a.size || '0') || 0;
    const sizeB = parseFloat(b.size || '0') || 0;
    return sizeA - sizeB;
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    api.clearCache();
    await load(true);
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
      render: (item) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          {item.parentId ? (
            <Ionicons name="git-branch-outline" size={14} color={colors.text.muted} style={{ marginRight: 6 }} />
          ) : null}
          <Text style={[styles.tableCell, { fontWeight: '700', flex: 1 }]} numberOfLines={1}>{item.name}</Text>
        </View>
      )
    },
    {
      key: 'size',
      title: 'Size Variants',
      flex: 2,
      render: (item) => {
        const children = products.filter(p => p.parentId === item._id);
        const allVariants = [item, ...children];
        return (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {allVariants.map((v, idx) => (
              <View key={idx} style={{ backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.primary }}>
                  {v.size || 'N/A'}{v.price !== undefined ? ` (₹${v.price})` : ''}
                </Text>
              </View>
            ))}
          </View>
        );
      }
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
      {/* Top Sub-tab pills */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, padding: 4, marginHorizontal: Spacing.lg, marginTop: Spacing.md }}>
        <TouchableOpacity
          style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: Radius.sm }, topTab === 'products' && { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border }]}
          onPress={() => setTopTab('products')}
        >
          <Ionicons name="cube-outline" size={16} color={topTab === 'products' ? colors.primary : colors.text.secondary} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: topTab === 'products' ? colors.primary : colors.text.secondary }}>
            Product Catalog
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: Radius.sm }, topTab === 'pricing' && { backgroundColor: colors.bg.primary, borderWidth: 1, borderColor: colors.border }]}
          onPress={() => setTopTab('pricing')}
        >
          <Ionicons name="pricetag-outline" size={16} color={topTab === 'pricing' ? colors.primary : colors.text.secondary} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: topTab === 'pricing' ? colors.primary : colors.text.secondary }}>
            Pricing &amp; Discounts
          </Text>
        </TouchableOpacity>
      </View>

      {topTab === 'pricing' ? (
        <PricingScreen />
      ) : (
        <>
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

                {perm.can('product:create') && (
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
                data={filteredProducts.filter(p => !p.parentId)}
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
              {hasMore && (
                <TouchableOpacity
                  style={{ padding: 12, borderRadius: Radius.md, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', marginTop: 10 }}
                  disabled={loadingMore}
                  onPress={handleLoadMore}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                    {loadingMore ? 'Loading More...' : `Load More Products (Page ${page + 1} of ${totalPages})`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ProductDetailModal
            product={selectedProd}
            visible={detailVisible}
            onClose={() => { setDetailVisible(false); load(); }}
            onDeleted={load}
            products={products}
            onEdit={() => {
              setDetailVisible(false);
              const target = selectedProd && selectedProd.parentId
                ? products.find(p => p._id === selectedProd.parentId) || selectedProd
                : selectedProd;
              setSelectedProd(target);
              setIsEditing(true);
              setAddVisible(true);
            }}
            onAddSizeVariant={(id) => {
              setDetailVisible(false);
              const target = selectedProd && selectedProd.parentId
                ? products.find(p => p._id === selectedProd.parentId) || selectedProd
                : selectedProd;
              setSelectedProd(target);
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
              setParentProductId(null);
            }}
            onSaved={load}
            product={isEditing ? selectedProd : null}
            products={products}
          />
        </>
      )}
    </View>
  );
}