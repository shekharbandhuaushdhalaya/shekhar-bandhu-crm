import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles } from '../utils/themeContext';
import { Typography, LightColors, Radius, Shadows, Spacing } from '../constants/theme';

export interface HelpTooltipProps {
  title: string;
  description: string;
  /** Optional size override for the icon (default 16) */
  iconSize?: number;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ title, description, iconSize = 16 }) => {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const [visible, setVisible] = useState(false);

  return (
    <View>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        style={{ marginLeft: 4, padding: 2 }}
        accessibilityRole="button"
        accessibilityLabel={`Help: ${title}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="information-circle-outline" size={iconSize} color={colors.text.muted} />
      </TouchableOpacity>

      {visible && (
        <Modal
          transparent
          animationType="fade"
          visible={visible}
          onRequestClose={() => setVisible(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
            <View style={[styles.popover, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
              {/* Header */}
              <View style={styles.header}>
                <Ionicons name="information-circle" size={18} color={colors.primary} />
                <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
                <TouchableOpacity onPress={() => setVisible(false)} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close help">
                  <Ionicons name="close" size={18} color={colors.text.muted} />
                </TouchableOpacity>
              </View>
              {/* Body */}
              <Text style={[styles.description, { color: colors.text.secondary }]}>{description}</Text>
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
};

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  popover: {
    width: '100%',
    maxWidth: 380,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    ...Shadows.modal,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  title: {
    ...Typography.h3,
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    padding: 2,
  },
  description: {
    ...Typography.body,
    lineHeight: 22,
  },
});
