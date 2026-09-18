import React, { useState, useEffect } from 'react';
import { View, Modal, StyleSheet, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText as Text } from './AppText';
import { AppTextInput as TextInput } from './AppTextInput';
import { useTheme } from '../utils/themeContext';
import { LightColors, Typography, Spacing, Radius, Shadows } from '../constants/theme';
import { api } from '../utils/api';

function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const ROUTE_TITLE_MAP = [
  { path: '/parties/customers', title: 'Customers', icon: 'people' },
  { path: '/parties/vendors', title: 'Vendors', icon: 'business' },
  { path: '/products', title: 'Products', icon: 'cube' },
  { path: '/invoices/sale', title: 'Sales Invoices', icon: 'document-text' },
  { path: '/invoices/purchase', title: 'Purchase Invoices', icon: 'document-text' },
  { path: '/inventories', title: 'Inventories & Warehouses', icon: 'layers' },
  { path: '/leads', title: 'Leads', icon: 'git-branch' },
  { path: '/queries', title: 'Web Queries', icon: 'mail' },
  { path: '/orders', title: 'Orders', icon: 'cart' },
  { path: '/quotations', title: 'Quotations', icon: 'document' },
  { path: '/payments', title: 'Payments', icon: 'cash' },
  { path: '/reports', title: 'Reports', icon: 'bar-chart' },
  { path: '/manufacturing', title: 'Manufacturing & BMR', icon: 'analytics' },
  { path: '/medicalreps', title: 'Medical Representatives', icon: 'people-circle' },
  { path: '/sales-workspace', title: 'Sales Workspace', icon: 'options' },
];

export function GlobalSearchModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounceValue(query, 500);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
    }
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (Platform.OS === 'web' && visible) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [visible, onClose]);

  useEffect(() => {
    async function searchAll() {
      if (!debouncedQuery.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const [customers, products] = await Promise.all([
          api.getCustomers(debouncedQuery).catch(() => ({ data: [] })),
          api.getProducts(debouncedQuery).catch(() => ({ data: [] }))
        ]);
        
        const routes = ROUTE_TITLE_MAP.filter(r => r.title.toLowerCase().includes(debouncedQuery.toLowerCase()))
          .map(r => ({ ...r, _type: 'route', name: r.title }));
        const combined = [
          ...routes,
          ...(customers?.data || customers || []).map((c: any) => ({ ...c, _type: 'customer' })),
          ...(products?.data || products || []).map((p: any) => ({ ...p, _type: 'product' }))
        ];
        
        setResults(combined);
      } catch (err) {
        console.error('Global search error:', err);
      } finally {
        setLoading(false);
      }
    }
    
    searchAll();
  }, [debouncedQuery]);

  const handleSelect = (item: any) => {
    onClose();
    if (item._type === 'route') {
      router.push(item.path as any);
    } else if (item._type === 'customer') {
      router.push('/parties/customers');
    } else if (item._type === 'product') {
      router.push('/products');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', alignItems: 'center', paddingTop: 60 }}>
        <View style={{ width: '90%', maxWidth: 600, backgroundColor: colors.bg.primary, borderRadius: Radius.lg, maxHeight: '80%', ...Shadows.card, }}>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Ionicons name="search" size={20} color={colors.text.muted} />
            <TextInput
              style={{ flex: 1, marginLeft: 10, ...Typography.body, color: colors.text.primary, height: 40, borderWidth: 0, backgroundColor: 'transparent' }}
              placeholder="Search customers, products..."
              placeholderTextColor={colors.text.muted}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search query">
                <Ionicons name="close-circle" size={20} color={colors.text.muted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={{ marginLeft: Spacing.md, padding: 4 }} accessibilityRole="button" accessibilityLabel="Close search">
              <Text style={{ ...Typography.caption, fontWeight: '700', color: colors.text.secondary }}>ESC</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item, index) => item._id || String(index)}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: Spacing.md }}
              ListEmptyComponent={
                query.trim() ? (
                  <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
                    <Text style={{ color: colors.text.muted }}>No results found</Text>
                  </View>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.bg.secondary }}
                  onPress={() => handleSelect(item)}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md }}>
                    <Ionicons name={item._type === 'route' ? (item.icon as any) : item._type === 'customer' ? 'business' : 'cube'} size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...Typography.bodySm, fontWeight: '600', color: colors.text.primary }}>{item.name || item.companyName}</Text>
                    <Text style={{ ...Typography.caption, color: colors.text.muted }}>{item._type === 'route' ? 'Navigation' : item._type === 'customer' ? 'Customer' : 'Product'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.border} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
