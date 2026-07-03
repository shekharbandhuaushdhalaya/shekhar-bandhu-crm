import React from 'react';
import { View, Text, StyleSheet, FlatList, ScrollView, RefreshControl, ViewStyle, TextStyle } from 'react-native';
import { useTheme } from '../utils/themeContext';
import { Radius, Spacing, Shadows } from '../constants/theme';
import { TableSkeleton } from './TableSkeleton';

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
}

export function DataTable<T>({
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
}: DataTableProps<T>) {
  const { colors } = useTheme();

  if (isLoading && !isRefreshing) {
    return <TableSkeleton columns={columns.length} rows={8} />;
  }

  const renderHeader = () => (
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
  );

  const renderRow = ({ item, index }: { item: T; index: number }) => {
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
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.card, borderColor: colors.border }, containerStyle]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ flex: 1 }} contentContainerStyle={{ minWidth: '100%' }}>
        <View style={{ minWidth: 800, flex: 1 }}>
          <FlatList
            data={data}
            keyExtractor={keyExtractor}
            ListHeaderComponent={renderHeader()}
            stickyHeaderIndices={[0]}
            renderItem={renderRow}
            contentContainerStyle={data.length === 0 ? { flex: 1 } : undefined}
            ListEmptyComponent={ListEmptyComponent}
            refreshControl={
              onRefresh ? (
                <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primary} />
              ) : undefined
            }
          />
        </View>
      </ScrollView>
    </View>
  );
}

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
  }
});
