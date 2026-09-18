import { EmptyState } from './WorkspacePrimitives';
import { Skeleton } from './Skeleton';
import { PressableOpacity as TouchableOpacity } from './PressableOpacity';
import { AppText as Text } from './AppText';
import React, { useCallback, memo } from 'react';
import { View, StyleSheet, FlatList, ScrollView, RefreshControl, ViewStyle, TextStyle, DimensionValue, useWindowDimensions } from 'react-native';
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
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns?: Column<T>[];
  renderTableHeader?: () => React.ReactElement;
  renderTableRow?: (item: T, index: number) => React.ReactElement;
  renderMobileCard?: (item: T, index: number) => React.ReactElement;
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

  // Empty State Action
  emptyStateActionLabel?: string;
  onEmptyStateAction?: () => void;
}

function DataTableInner<T>({
  data,
  columns = [],
  renderTableHeader,
  renderTableRow,
  renderMobileCard,
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
  emptyStateActionLabel,
  onEmptyStateAction,
}: DataTableProps<T>) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  
  const visibleColumns = React.useMemo(() => {
    if (!isMobile) return columns;
    return columns.filter(col => !col.hideOnMobile);
  }, [columns, isMobile]);

  const useCardLayout = isMobile && (!!renderMobileCard || (visibleColumns && visibleColumns.length > 0));

  const renderHeader = useCallback(() => {
    if (useCardLayout) return null;
    return renderTableHeader ? (
    <View style={{ backgroundColor: colors.bg.cardHover, borderBottomWidth: 1, borderBottomColor: colors.border }}>{renderTableHeader()}</View>
  ) : (
    <View style={[styles.headerRow, { backgroundColor: colors.bg.secondary, borderBottomColor: colors.border }, headerStyle]}>
      {visibleColumns.map((col) => (
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
  );
  }, [visibleColumns, colors, headerStyle, headerTextStyle, renderTableHeader, useCardLayout]);

  const renderRow = useCallback(({ item, index }: { item: T; index: number }) => {
    if (renderTableRow && !useCardLayout) {
      const row = renderTableRow(item, index);
      return React.cloneElement(row as React.ReactElement<{ style?: any }>, { style: [(row.props as any).style, { backgroundColor: index % 2 ? colors.bg.cardHover : colors.bg.card, borderBottomColor: colors.border }] });
    }
    const customRowStyle = typeof rowStyle === 'function' ? rowStyle(item) : rowStyle;

    if (useCardLayout) {
      if (renderMobileCard) {
        const cardStyles = [
          { 
            backgroundColor: colors.bg.card, 
            borderRadius: Radius.md, 
            borderWidth: 1, 
            borderColor: colors.border, 
            marginHorizontal: Spacing.lg, 
            marginTop: index === 0 ? Spacing.md : Spacing.sm,
            marginBottom: Spacing.xs,
            ...Shadows.card
          },
          customRowStyle
        ];
        
        if (onRowPress) {
          return (
            <TouchableOpacity style={cardStyles} onPress={() => onRowPress(item)} activeOpacity={0.7}>
              {renderMobileCard(item, index)}
            </TouchableOpacity>
          );
        }
        return <View style={cardStyles}>{renderMobileCard(item, index)}</View>;
      }

      const cardContent = (
        <View style={{ padding: 12, gap: 10 }}>
          {visibleColumns.map((col) => {
            const val = col.render ? col.render(item) : (
              <Text style={{ ...Typography.bodySm, color: colors.text.primary, textAlign: 'right' }}>
                {String((item as any)[col.key] ?? '')}
              </Text>
            );
            return (
              <View key={`${keyExtractor(item, index)}-${col.key}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <Text style={{ ...Typography.caption, color: col.title ? colors.text.muted : 'transparent', fontWeight: '600', flexShrink: 1 }}>{col.title || ' '}</Text>
                <View style={{ flex: 2, alignItems: 'flex-end' }}>
                  {val}
                </View>
              </View>
            );
          })}
        </View>
      );

      const cardStyles = [
        { 
          backgroundColor: colors.bg.card, 
          borderRadius: Radius.md, 
          borderWidth: 1, 
          borderColor: colors.border, 
          marginHorizontal: Spacing.lg, 
          marginTop: index === 0 ? Spacing.md : Spacing.sm,
          marginBottom: Spacing.xs,
          ...Shadows.card
        },
        customRowStyle
      ];

      if (onRowPress) {
        return (
          <TouchableOpacity style={cardStyles} onPress={() => onRowPress(item)} activeOpacity={0.7}>
            {cardContent}
          </TouchableOpacity>
        );
      }
      return <View style={cardStyles}>{cardContent}</View>;
    }

    const rowContent = (
      <>
        {visibleColumns.map((col) => (
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
  }, [visibleColumns, colors, keyExtractor, rowStyle, renderTableRow, onRowPress, useCardLayout]);

  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={{ padding: 20, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ ...Typography.bodySm, color: colors.text.secondary }}>Loading more...</Text>
      </View>
    );
  }, [isLoadingMore, colors]);

  if (isLoading && !isRefreshing) {
    return <TableSkeleton columns={visibleColumns.length} rows={8} />;
  }

  const listProps = {
    data,
    keyExtractor,
    ListHeaderComponent: renderHeader,
    stickyHeaderIndices: useCardLayout ? undefined : [0],
    renderItem: renderRow,
    contentContainerStyle: data.length === 0 ? { flex: 1 } : (useCardLayout ? { paddingBottom: Spacing.xl } : undefined),
    ListEmptyComponent: ListEmptyComponent || <EmptyState title="No records to display" message="Try adjusting your filters or add your first record." actionLabel={emptyStateActionLabel} onAction={onEmptyStateAction} />,
    refreshControl: onRefresh ? <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined,
    onEndReached: onLoadMore,
    onEndReachedThreshold: 0.5,
    initialNumToRender: 12,
    maxToRenderPerBatch: 10,
    updateCellsBatchingPeriod: 50,
    windowSize: 7,
    keyboardShouldPersistTaps: "handled" as const,
    ListFooterComponent: renderFooter,
  };

  const listComponent = embedded ? <FlatList {...listProps} nestedScrollEnabled /> : <FlatList {...listProps} />;

  return (
    <View style={[
      styles.container, 
      { backgroundColor: useCardLayout ? 'transparent' : colors.bg.card, borderColor: useCardLayout ? 'transparent' : colors.border },
      useCardLayout && { shadowOpacity: 0, ...Shadows.card },
      embedded && { flex: 0, height: 420 }, 
      containerStyle
    ]}>
      {useCardLayout ? listComponent : (
        <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ flex: 1 }} contentContainerStyle={{ minWidth: '100%' }}>
          <View style={{ minWidth, flex: 1 }}>
            {listComponent}
          </View>
        </ScrollView>
      )}
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
