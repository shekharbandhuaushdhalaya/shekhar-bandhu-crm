import React, { useCallback, memo } from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, RefreshControl, ViewStyle, TextStyle, TouchableOpacity } from 'react-native';
import { useTheme } from '../utils/themeContext';
import { Radius, Spacing, Shadows } from '../constants/theme';
import { TableSkeleton } from './TableSkeleton';
import { Ionicons } from '@expo/vector-icons';

export interface Column<T> {
  key: string;
  title: string;
  flex?: number;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T, index: number) => string;
  isLoading?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  ListEmptyComponent?: React.ComponentType<any> | React.ReactElement | null;
  onRowPress?: (item: T) => void;
  rowStyle?: ViewStyle | ((item: T) => ViewStyle);
  headerStyle?: ViewStyle;
  headerTextStyle?: TextStyle;
  containerStyle?: ViewStyle;
  
  // Lazy Loading Props
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

function DataTableInner<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  isRefreshing = false,
  onRefresh,
  ListEmptyComponent,
  onRowPress,
  rowStyle,
  headerStyle,
  headerTextStyle,
  containerStyle,
  onLoadMore,
  isLoadingMore = false,
}: DataTableProps<T>) {
  const { colors } = useTheme();

  const renderHeader = useCallback(() => (
    <View style={[styles.headerRow, { backgroundColor: colors.bg.secondary, borderBottomColor: colors.border }, headerStyle]}>
      {columns.map((col) => (
        <View
          key={col.key}
          style={[
            styles.cell,
            col.flex ? { flex: col.flex } : { width: col.width },
            col.align === 'center' ? { alignItems: 'center' } : col.align === 'right' ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' },
          ]}
        >
          <Text style={[styles.headerText, { color: colors.text.secondary }, headerTextStyle]}>
            {col.title}
          </Text>
        </View>
      ))}
    </View>
  ), [columns, colors, headerStyle, headerTextStyle]);

  const renderRow = useCallback(({ item, index }: { item: T; index: number }) => {
    const customRowStyle = typeof rowStyle === 'function' ? rowStyle(item) : rowStyle;
    
    return (
      <View style={[styles.row, { borderBottomColor: colors.border + '50' }, customRowStyle]}>
        {columns.map((col) => (
          <View
            key={`${keyExtractor(item, index)}-${col.key}`}
            style={[
              styles.cell,
              col.flex ? { flex: col.flex } : { width: col.width },
              col.align === 'center' ? { alignItems: 'center' } : col.align === 'right' ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' },
            ]}
          >
            {col.render ? (
              col.render(item)
            ) : (
              <Text style={{ fontSize: 13, color: colors.text.primary }} numberOfLines={1}>
                {String((item as any)[col.key] || '')}
              </Text>
            )}
          </View>
        ))}
      </View>
    );
  }, [columns, colors, keyExtractor, rowStyle]);

  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={{ padding: 20, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>Loading more...</Text>
      </View>
    );
  }, [isLoadingMore, colors]);

  if (isLoading && !isRefreshing) {
    return <TableSkeleton columns={columns.length} rows={8} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.card, borderColor: colors.border }, containerStyle]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ flex: 1 }} contentContainerStyle={{ minWidth: '100%' }}>
        <View style={{ minWidth: 800, flex: 1 }}>
          <FlatList
            data={data}
            keyExtractor={keyExtractor}
            ListHeaderComponent={renderHeader}
            stickyHeaderIndices={[0]}
            renderItem={renderRow}
            contentContainerStyle={data.length === 0 ? { flex: 1 } : undefined}
            ListEmptyComponent={ListEmptyComponent}
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
              ) : undefined
            }
            onEndReached={onLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
          />
        </View>
      </ScrollView>
    </View>
  );
}

// Wrap with React.memo to prevent unnecessary re-renders when parent state changes
export const DataTable = memo(DataTableInner) as typeof DataTableInner;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...Shadows.card,
  },
  headerRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
  },
  cell: {
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
  }
});
