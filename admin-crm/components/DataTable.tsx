import { EmptyState } from './WorkspacePrimitives';
import { Skeleton } from './Skeleton';
import { PressableOpacity as TouchableOpacity } from './PressableOpacity';
import { AppText as Text } from './AppText';
import React, { useCallback, memo } from 'react';
import { View, StyleSheet, FlatList, ScrollView, RefreshControl, ViewStyle, TextStyle, DimensionValue } from 'react-native';
import { useTheme } from '../utils/themeContext';
import { Radius, Spacing, Shadows, Typography } from '../constants/theme';
import { TableSkeleton } from './TableSkeleton';
import { Ionicons } from '@expo/vector-icons';

export interface Column<T> {
  key: string;
  title: string;
  flex?: number;
  width?: DimensionValue;
  align?: 'left' | 'center' | 'right';
  render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns?: Column<T>[];
  renderTableHeader?: () => React.ReactElement;
  renderTableRow?: (item: T, index: number) => React.ReactElement;
  minWidth?: number;
  embedded?: boolean;
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
  columns = [],
  renderTableHeader,
  renderTableRow,
  minWidth = 800,
  embedded = false,
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

  const renderHeader = useCallback(() => renderTableHeader ? (
    <View style={{ backgroundColor: colors.bg.cardHover, borderBottomWidth: 1, borderBottomColor: colors.border }}>{renderTableHeader()}</View>
  ) : (
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
  ), [columns, colors, headerStyle, headerTextStyle, renderTableHeader]);

  const renderRow = useCallback(({ item, index }: { item: T; index: number }) => {
    if (renderTableRow) {
      const row = renderTableRow(item, index);
      return React.cloneElement(row as React.ReactElement<{ style?: any }>, { style: [(row.props as any).style, { backgroundColor: index % 2 ? colors.bg.cardHover : colors.bg.card, borderBottomColor: colors.border }] });
    }
    const customRowStyle = typeof rowStyle === 'function' ? rowStyle(item) : rowStyle;
    const rowContent = (
      <>
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
              <Text style={{ ...Typography.bodySm, color: colors.text.primary }} numberOfLines={1}>
                {String((item as any)[col.key] ?? '')}
              </Text>
            )}
          </View>
        ))}
      </>
    );

    const rowStyles = [
      styles.row,
      { borderBottomColor: colors.border, backgroundColor: index % 2 ? colors.bg.cardHover : colors.bg.card },
      customRowStyle
    ];

    if (onRowPress) {
      return (
        <TouchableOpacity
          style={rowStyles}
          onPress={() => onRowPress(item)}
          activeOpacity={0.7}
        >
          {rowContent}
        </TouchableOpacity>
      );
    }

    return (
      <View style={rowStyles}>
        {rowContent}
      </View>
    );
  }, [columns, colors, keyExtractor, rowStyle, renderTableRow, onRowPress]);

  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={{ padding: 20, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>Loading more...</Text>
      </View>
    );
  }, [isLoadingMore, colors]);

  if (isLoading && !isRefreshing) {
    return <TableSkeleton columns={columns.length} rows={8} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.card, borderColor: colors.border }, embedded && { flex: 0, height: 420 }, containerStyle]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ flex: 1 }} contentContainerStyle={{ minWidth: '100%' }}>
        <View style={{ minWidth, flex: 1 }}>
          {embedded ? <FlatList
            data={data}
            keyExtractor={keyExtractor}
            ListHeaderComponent={renderHeader}
            stickyHeaderIndices={[0]}
            renderItem={renderRow}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={data.length === 0 ? { flex: 1 } : undefined}
            ListEmptyComponent={ListEmptyComponent || <EmptyState title="No records to display" message="Try adjusting your filters or add your first record." />}
            refreshControl={onRefresh ? <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
            onEndReached={onLoadMore}
            onEndReachedThreshold={0.5}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            windowSize={7}
            ListFooterComponent={renderFooter}
          /> : <FlatList
            data={data}
            keyExtractor={keyExtractor}
            ListHeaderComponent={renderHeader}
            stickyHeaderIndices={[0]}
            renderItem={renderRow}
            contentContainerStyle={data.length === 0 ? { flex: 1 } : undefined}
            ListEmptyComponent={ListEmptyComponent || <EmptyState title="No records to display" message="Try adjusting your filters or add your first record." />}
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
              ) : undefined
            }
            onEndReached={onLoadMore}
            onEndReachedThreshold={0.5}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            updateCellsBatchingPeriod={50}
            windowSize={7}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={renderFooter}
          />}
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
    paddingVertical: 11,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
  },
  headerText: { ...Typography.caption, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    paddingVertical: 13,
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
