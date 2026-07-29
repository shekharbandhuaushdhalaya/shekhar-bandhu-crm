import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../../../utils/themeContext';
import { Radius } from '../../../constants/theme';
import { createStyles } from '../manufacturingStyles';

interface Props {
  manufacturingUnits: any[];
  onAddUnit: () => void;
}

const ManufacturingUnitsTab = React.memo(function ManufacturingUnitsTab({
  manufacturingUnits, onAddUnit
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  return (
    <View style={styles.tabContent}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <View>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text.primary }}>Manufacturing Facilities & Units</Text>
          <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
            Directory of manufacturing factories, units, and plant facilities ({manufacturingUnits.length} configured)
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onAddUnit}
        >
          <Ionicons name="add-circle-outline" size={16} color="#fff" />
          <Text style={styles.primaryBtnText}>+ Define New Unit</Text>
        </TouchableOpacity>
      </View>

      {manufacturingUnits.length > 0 ? (
        <View style={{ gap: 12 }}>
          {manufacturingUnits.map(unit => (
            <View key={unit._id} style={[styles.card, { padding: 16, borderLeftColor: colors.primary, borderLeftWidth: 4 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="business" size={18} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text.primary }}>{unit.name}</Text>
                    <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 2 }}>
                      Code: <Text style={{ fontWeight: '700', color: colors.primary }}>{unit.code || 'N/A'}</Text>
                    </Text>
                  </View>
                </View>

                <View style={{ backgroundColor: colors.success + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.sm }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: colors.success }}>OPERATIONAL</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, backgroundColor: colors.bg.secondary, padding: 12, borderRadius: Radius.md, marginTop: 8 }}>
                <View style={{ flex: 1, minWidth: 140 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>LOCATION / ADDRESS</Text>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.primary, marginTop: 2 }}>
                    {[unit.addressLine1, unit.city, unit.state, unit.pincode].filter(Boolean).join(', ') || 'No address specified'}
                  </Text>
                </View>

                {unit.contactPerson ? (
                  <View style={{ flex: 1, minWidth: 120 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted }}>FACILITY CONTACT</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.primary, marginTop: 2 }}>
                      👤 {unit.contactPerson} {unit.phone ? `(${unit.phone})` : ''}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="business-outline" size={48} color={colors.text.secondary} />
          <Text style={styles.emptyText}>No manufacturing units defined yet.</Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 12 }]}
            onPress={onAddUnit}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Define First Unit</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});
export default ManufacturingUnitsTab;
