import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, StyleProp, StyleSheet } from 'react-native';
import { useTheme } from '../utils/themeContext';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 20, borderRadius = 4, style }: SkeletonProps) {
  const { colors } = useTheme();
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: false,
        })
      ])
    ).start();
  }, []);

  const backgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.bg.secondary]
  });

  return (
    <Animated.View 
      style={[
        { width, height, borderRadius, backgroundColor },
        style
      ]} 
    />
  );
}
