import React, { forwardRef } from 'react';
import { TouchableOpacity, TouchableOpacityProps, StyleSheet, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, useReducedMotion } from 'react-native-reanimated';
import { ControlHeight } from '../constants/theme';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

/** Drop-in touchable: callbacks, refs, disabled state and hit targets remain intact. */
export const PressableOpacity = forwardRef<React.ElementRef<typeof TouchableOpacity>, TouchableOpacityProps>(
  function PressableOpacity({ style, onPressIn, onPressOut, disabled, activeOpacity = 0.82, accessibilityRole = 'button', ...props }, ref) {
    const pressed = useSharedValue(0);
    const reducedMotion = useReducedMotion();
    const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
    const originalTransform = flat?.transform;
    const animatedStyle = useAnimatedStyle(() => ({
      transform: [...(Array.isArray(originalTransform) ? originalTransform : []), { scale: 1 - 0.03 * pressed.value }],
    }), [originalTransform]);
    return <AnimatedTouchable ref={ref} {...props} disabled={disabled} accessibilityRole={accessibilityRole}
      activeOpacity={activeOpacity} style={[{ minHeight: ControlHeight.buttonMd, justifyContent: 'center' }, style, { minHeight: Math.max(ControlHeight.buttonMd, Number(flat?.minHeight) || 0), minWidth: Math.max(ControlHeight.buttonMd, Number(flat?.minWidth) || 0) }, animatedStyle]}
      onPressIn={event => { if (!disabled && !reducedMotion) pressed.value = withTiming(1, { duration: 100 }); onPressIn?.(event); }}
      onPressOut={event => { pressed.value = withTiming(0, { duration: reducedMotion ? 0 : 150 }); onPressOut?.(event); }}
    />;
  }
);
