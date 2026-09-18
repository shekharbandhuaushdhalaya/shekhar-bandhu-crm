import React, { useState, useEffect } from 'react';
import { View, Modal, StyleSheet, FlatList, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText as Text } from './AppText';
import { AppTextInput as TextInput } from './AppTextInput';
import { useTheme } from '../utils/themeContext';
import { LightColors, Typography, Spacing, Radius } from '../constants/theme';
import { api } from '../utils/api';
import { useDebounce } from '../utils/hooks'; // Assuming there is a hook, if not we will inline it

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
  }, [visible]);

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
        
        const combined = [
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
    if (item._type === 'customer') {
      // Navigate to customer
      // Since there's no dedicated customer details page, we navigate to parties/customers
      router.push('/parties/customers');
    } else if (item._type === 'product') {
      router.push('/products');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', alignItems: 'center', paddingTop: 60 }}>
        <View style={{ width: '90%', maxWidth: 600, backgroundColor: colors.bg.primary, borderRadius: Radius.lg, maxHeight: '80%', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 }}>
          
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
                    <Ionicons name={item._type === 'customer' ? 'business' : 'cube'} size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...Typography.bodySm, fontWeight: '600', color: colors.text.primary }}>{item.name || item.companyName}</Text>
                    <Text style={{ ...Typography.caption, color: colors.text.muted }}>{item._type === 'customer' ? 'Customer' : 'Product'}</Text>
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
