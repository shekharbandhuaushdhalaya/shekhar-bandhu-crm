import React from 'react';
import { View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/themeContext';

export interface HelpTooltipProps {
  title: string;
  description: string;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ title, description }) => {
  const { colors } = useTheme();

  const handlePress = () => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${description}`);
    } else {
      Alert.alert(title, description);
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} style={{ marginLeft: 4 }} accessibilityRole="button" accessibilityLabel={`Help for ${title}`}>
      <Ionicons name="information-circle-outline" size={16} color={colors.text.muted} />
    </TouchableOpacity>
  );
};
