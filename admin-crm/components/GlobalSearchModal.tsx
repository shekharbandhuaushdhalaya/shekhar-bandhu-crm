import React, { useState, useEffect, useRef } from 'react';
import { View, Modal, StyleSheet, SectionList, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText as Text } from './AppText';
import { AppTextInput as TextInput } from './AppTextInput';
import { useTheme } from '../utils/themeContext';
import { usePermission } from '../utils/permissions';
import { LightColors, Typography, Spacing, Radius, Shadows } from '../constants/theme';
import { APP_ROUTES } from '../constants/routes';
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



export function GlobalSearchModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const perm = usePermission();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounceValue(query, 500);
  const [sections, setSections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const requestSequence = useRef(0);
  const canViewPurchaseInvoices = perm.can('invoice:view');
  const canViewMedicalReps = perm.can('mr:view');

  useEffect(() => {
    if (visible) {
      setQuery('');
      setSections([]);
      setSearchError('');
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
    const requestId = ++requestSequence.current;
    let active = true;

    const searchAll = async () => {
      if (!visible || !debouncedQuery.trim()) {
        setSections([]);
        setSearchError('');
        setLoading(false);
        return;
      }

      setLoading(true);
      setSearchError('');
      let failedRequests = 0;
      const safe = (request: Promise<any>, fallback: any) => request.catch(() => {
        failedRequests += 1;
        return fallback;
      });

      try {
        const [customers, products, salesInvoices, purchaseInvoices, payments, vendors, mrs] = await Promise.all([
          safe(api.getCustomers(debouncedQuery), { data: [] }),
          safe(api.getProducts(debouncedQuery), { data: [] }),
          safe(api.getSaleInvoices(debouncedQuery), { data: [] }),
          canViewPurchaseInvoices ? safe(api.getPurchaseInvoices(debouncedQuery), { data: [] }) : Promise.resolve({ data: [] }),
          safe(api.getPayments(undefined, undefined, undefined, undefined, debouncedQuery), []),
          safe(api.getVendors(debouncedQuery), { data: [] }),
          canViewMedicalReps ? safe(api.getMRs(debouncedQuery), []) : Promise.resolve([])
        ]);

        if (!active || requestId !== requestSequence.current) return;

        const extract = (res: any) => (Array.isArray(res) ? res : res?.data || []);
        const routes = APP_ROUTES.filter(r =>
          r.title.toLowerCase().includes(debouncedQuery.toLowerCase()) &&
          (!r.permission || perm.can(r.permission))
        ).map(r => ({ ...r, _type: 'route', name: r.title }));

        const newSections = [];
        if (routes.length > 0) newSections.push({ title: 'NAVIGATION', data: routes });

        const cList = extract(customers).map((c: any) => ({ ...c, _type: 'customer' }));
        if (cList.length > 0) newSections.push({ title: 'CUSTOMERS', data: cList });

        const vList = extract(vendors).map((v: any) => ({ ...v, _type: 'vendor' }));
        if (vList.length > 0) newSections.push({ title: 'VENDORS', data: vList });

        const pList = extract(products).map((p: any) => ({ ...p, _type: 'product' }));
        if (pList.length > 0) newSections.push({ title: 'PRODUCTS', data: pList });

        const siList = extract(salesInvoices).map((si: any) => ({ ...si, _type: 'sale_invoice' }));
        if (siList.length > 0) newSections.push({ title: 'SALES INVOICES', data: siList });

        const piList = extract(purchaseInvoices).map((pi: any) => ({ ...pi, _type: 'purchase_invoice' }));
        if (piList.length > 0) newSections.push({ title: 'PURCHASE INVOICES', data: piList });

        const payList = extract(payments).map((pay: any) => ({ ...pay, _type: 'payment' }));
        if (payList.length > 0) newSections.push({ title: 'PAYMENTS', data: payList });

        const mrList = extract(mrs).map((mr: any) => ({ ...mr, _type: 'mr' }));
        if (mrList.length > 0) newSections.push({ title: 'MEDICAL REPRESENTATIVES', data: mrList });

        setSections(newSections);
        if (failedRequests > 0) {
          setSearchError('Some search categories could not be loaded. Showing the results that are available.');
        }
      } catch (err) {
        if (active && requestId === requestSequence.current) {
          console.error('Global search error:', err);
          setSearchError('Search could not be completed. Please try again.');
          setSections([]);
        }
      } finally {
        if (active && requestId === requestSequence.current) setLoading(false);
      }
    };

    searchAll();
    return () => {
      active = false;
      if (requestSequence.current === requestId) requestSequence.current += 1;
    };
  }, [debouncedQuery, visible, canViewPurchaseInvoices, canViewMedicalReps]);

  const handleSelect = (item: any) => {
    onClose();
    if (item._type === 'route') router.push(item.path as any);
    else if (item._type === 'customer') router.push({ pathname: '/parties/customers', params: { search: item.name || item.companyName } });
    else if (item._type === 'vendor') router.push({ pathname: '/parties/vendors', params: { search: item.name || item.companyName } });
    else if (item._type === 'product') router.push({ pathname: '/products', params: { search: item.name } });
    else if (item._type === 'sale_invoice') router.push({ pathname: '/invoices/sale', params: { search: item.invoiceNumber || item.invoiceNo } });
    else if (item._type === 'purchase_invoice') router.push({ pathname: '/invoices/purchase', params: { search: item.invoiceNumber || item.invoiceNo } });
    else if (item._type === 'payment') router.push({ pathname: '/payments', params: { search: item.receiptNo || item.receiptNumber } });
    else if (item._type === 'mr') router.push({ pathname: '/medicalreps', params: { search: item.name } });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-start', alignItems: 'center', paddingTop: 60 }}>
        <View 
          style={{ width: '90%', maxWidth: 600, backgroundColor: colors.bg.card, borderRadius: Radius.lg, maxHeight: '80%', ...Shadows.modal }}
          accessibilityViewIsModal={true}
        >
          
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

          {searchError ? (
            <View style={{ paddingHorizontal: Spacing.md, paddingTop: Spacing.sm }}>
              <Text accessibilityRole="alert" style={{ ...Typography.caption, color: colors.warning }}>{searchError}</Text>
            </View>
          ) : null}
          {loading ? (
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ ...Typography.caption, color: colors.text.muted, marginTop: Spacing.sm }}>Searching across your workspace…</Text>
            </View>
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(item, index) => item._id || String(index)}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: Spacing.md }}
              ListEmptyComponent={
                query.trim() ? (
                  <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
                    <Text style={{ ...Typography.body, color: colors.text.primary, fontWeight: '600' }}>No results found for "{query}"</Text>
                    <Text style={{ ...Typography.caption, color: colors.text.muted, marginTop: 4 }}>Try a customer name, product, invoice number, payment, or page name.</Text>
                  </View>
                ) : null
              }
              renderSectionHeader={({ section: { title } }) => (
                <View style={{ paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.xs, marginTop: Spacing.xs }}>
                  <Text style={{ ...Typography.caption, fontWeight: '600', color: colors.text.muted }}>{title.toLowerCase().replace(/(^|\s)\S/g, (c: string) => c.toUpperCase())}</Text>
                </View>
              )}
              renderItem={({ item }) => {
                let icon = 'cube';
                let label = 'Result';
                let title = item.name || item.companyName || item.invoiceNumber || item.invoiceNo || item.receiptNo;
                
                if (item._type === 'route') { icon = item.icon; label = 'Navigation'; title = item.name; }
                else if (item._type === 'customer') { icon = 'people'; label = 'Customer'; }
                else if (item._type === 'vendor') { icon = 'business'; label = 'Vendor'; }
                else if (item._type === 'product') { icon = 'cube'; label = 'Product'; }
                else if (item._type === 'sale_invoice') { icon = 'document-text'; label = 'Sales Invoice'; }
                else if (item._type === 'purchase_invoice') { icon = 'document-text'; label = 'Purchase Invoice'; }
                else if (item._type === 'payment') { icon = 'cash'; label = 'Payment'; }
                else if (item._type === 'mr') { icon = 'people-circle'; label = 'Medical Rep'; }
                
                return (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: colors.bg.secondary }}
                    onPress={() => handleSelect(item)}
                  >
                    <View style={{ width: 28, height: 28, borderRadius: Radius.sm, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm }}>
                      <Ionicons name={icon as any} size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...Typography.bodySm, fontWeight: '600', color: colors.text.primary }}>{title}</Text>
                      <Text style={{ ...Typography.caption, color: colors.text.muted }}>{label}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.border} />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
