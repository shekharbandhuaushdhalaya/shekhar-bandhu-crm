import React, { useEffect, useState } from 'react';
import { View, ViewStyle, StyleProp, DimensionValue } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { useTheme } from '../utils/themeContext';
import { Radius } from '../constants/theme';

interface SkeletonProps { width?: DimensionValue; height?: DimensionValue; borderRadius?: number; style?: StyleProp<ViewStyle> }

export function Skeleton({ width = '100%', height = 20, borderRadius = Radius.sm, style }: SkeletonProps) {
  const { colors } = useTheme();
  const [measuredWidth, setMeasuredWidth] = useState(240);
  const progress = useSharedValue(-1);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!reducedMotion) progress.value = withRepeat(withTiming(1.8, { duration: 1400, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(progress);
  }, [reducedMotion, progress]);
  const shimmer = useAnimatedStyle(() => ({ transform: [{ translateX: progress.value * measuredWidth }] }));
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" onLayout={event => setMeasuredWidth(event.nativeEvent.layout.width)}
    style={[{ width, height, borderRadius, backgroundColor: colors.border, overflow: 'hidden' }, style]}>
    {!reducedMotion ? <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: '45%', opacity: 0.6, backgroundColor: colors.bg.card, borderRadius }, shimmer]} /> : null}
  </View>;
}
