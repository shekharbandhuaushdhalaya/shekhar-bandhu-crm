import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

/** Animate the existing subtree without remounting it or resetting form state. */
export function WorkspaceTransition({ value, children, style }: { value: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const progress = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) { progress.value = 1; return; }
    progress.value = 0;
    progress.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [value, reducedMotion, progress]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 5 }] }));
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
