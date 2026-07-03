import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, TouchableOpacity, View, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/themeContext';
import { Radius, Spacing, Shadows } from '../constants/theme';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  visible: boolean;
  onDismiss: () => void;
}

export function Toast({ message, type = 'info', visible, onDismiss }: ToastProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-50)).current;
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          useNativeDriver: true,
        })
      ]).start();
      
      const timer = setTimeout(() => {
        handleDismiss();
      }, 4000); // Auto dismiss after 4 seconds
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -50,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start(() => {
      onDismiss();
    });
  };

  if (!visible) return null;

  const getColors = () => {
    switch (type) {
      case 'success':
        return { bg: colors.successLight, text: colors.success, icon: 'checkmark-circle' };
      case 'error':
        return { bg: colors.dangerLight, text: colors.danger, icon: 'alert-circle' };
      default:
        return { bg: colors.infoLight, text: colors.info, icon: 'information-circle' };
    }
  };

  const themeColors = getColors();

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          opacity, 
          transform: [{ translateY }],
          maxWidth: isDesktop ? 400 : '90%',
          right: isDesktop ? 40 : '5%',
        }
      ]}
    >
      <View style={[styles.content, { backgroundColor: themeColors.bg, borderColor: themeColors.text + '30' }]}>
        <Ionicons name={themeColors.icon as any} size={20} color={themeColors.text} style={styles.icon} />
        <Text style={[styles.message, { color: themeColors.text }]}>{message}</Text>
        <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn}>
          <Ionicons name="close" size={16} color={themeColors.text} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 40 : 60,
    zIndex: 9999,
    ...Shadows.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  icon: {
    marginRight: 10,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  closeBtn: {
    marginLeft: 12,
    padding: 4,
  }
});
