import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Skeleton } from './Skeleton';
import { useTheme } from '../utils/themeContext';
import { Spacing, Radius } from '../constants/theme';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 6, columns = 4 }: TableSkeletonProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
      {/* Table Header Skeleton */}
      <View style={[styles.headerRow, { borderBottomColor: colors.border, backgroundColor: colors.bg.secondary }]}>
        {Array.from({ length: columns }).map((_, colIdx) => (
          <View key={`header-${colIdx}`} style={styles.cell}>
            <Skeleton width={`${Math.max(40, 100 - colIdx * 15)}%`} height={16} borderRadius={4} />
          </View>
        ))}
      </View>

      {/* Table Body Skeleton */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <View 
            key={`row-${rowIdx}`} 
            style={[
              styles.row, 
              { borderBottomColor: colors.border + '50' }
            ]}
          >
            {Array.from({ length: columns }).map((_, colIdx) => (
              <View key={`cell-${rowIdx}-${colIdx}`} style={styles.cell}>
                <Skeleton 
                  width={colIdx === 0 ? 32 : `${Math.max(30, 90 - colIdx * 10)}%`} 
                  height={colIdx === 0 ? 32 : 14} 
                  borderRadius={colIdx === 0 ? 16 : 4} 
                />
                {colIdx > 0 && Math.random() > 0.5 && (
                  <Skeleton width="40%" height={10} borderRadius={2} style={{ marginTop: 6 }} />
                )}
              </View>
            ))}
          </View>
        ))}
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
    margin: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
  },
  cell: {
    flex: 1,
    paddingHorizontal: 8,
    justifyContent: 'center',
  }
});
