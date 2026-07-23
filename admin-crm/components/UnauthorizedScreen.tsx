import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../utils/themeContext';
import { Radius, Spacing } from '../constants/theme';

interface Props {
  title?: string;
  description?: string;
  requiredPermission?: string;
}

export default function UnauthorizedScreen({
  title = "Sacred Chamber Restricted",
  description = "Your account role does not hold the required permissions to enter this section.",
  requiredPermission,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.primary }]}>
      <View style={[styles.cardContainer, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
        
        {/* Sacred Shield Lock SVG */}
        <Svg width={100} height={100} viewBox="0 0 100 100" fill="none">
          <Defs>
            <LinearGradient id="shieldGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#ef4444" />
              <Stop offset="100%" stopColor="#991b1b" />
            </LinearGradient>
            <LinearGradient id="goldLockGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor="#f59e0b" />
              <Stop offset="100%" stopColor="#b45309" />
            </LinearGradient>
          </Defs>

          <Circle cx="50" cy="50" r="46" fill={colors.danger + '12'} />
          <Path d="M50 20L75 30V50C75 66.5 64.3 81.3 50 86C35.7 81.3 25 66.5 25 50V30L50 20Z" fill="url(#shieldGrad)" />
          
          {/* Gold Lock Icon */}
          <Rect x="42" y="50" width="16" height="14" rx="2" fill="url(#goldLockGrad)" />
          <Path d="M45 50V43C45 40.2386 47.2386 38 50 38C52.7614 38 55 40.2386 55 43V50" stroke="url(#goldLockGrad)" strokeWidth="2.5" strokeLinecap="round" />
          <Circle cx="50" cy="56" r="1.5" fill="#ffffff" />
        </Svg>

        {/* Status Badge */}
        <View style={[styles.badge, { backgroundColor: colors.danger + '15', borderColor: colors.danger + '40' }]}>
          <Ionicons name="shield-outline" size={14} color={colors.danger} />
          <Text style={[styles.badgeText, { color: colors.danger }]}>401 — ELEVATED ACCESS REQUIRED</Text>
        </View>

        {/* Title & Description */}
        <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
        <Text style={[styles.description, { color: colors.text.secondary }]}>{description}</Text>

        {requiredPermission && (
          <View style={[styles.permPill, { backgroundColor: colors.bg.secondary, borderColor: colors.border }]}>
            <Text style={{ fontSize: 11, color: colors.text.muted }}>Required Permission Badge:</Text>
            <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary }}>{requiredPermission}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={[styles.btnRow, { flexDirection: isDesktop ? 'row' : 'column' }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace('/')}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Return to Safe Sanctuary</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
            onPress={() => router.push('/profile')}
            activeOpacity={0.8}
          >
            <Ionicons name="person-outline" size={18} color={colors.text.primary} />
            <Text style={[styles.secondaryBtnText, { color: colors.text.primary }]}>View My Profile</Text>
          </TouchableOpacity>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 520,
    borderRadius: Radius.xl || 24,
    borderWidth: 1,
    padding: Spacing.xl || 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 16,
    marginBottom: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 420,
    marginBottom: 16,
  },
  permPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
  },
  btnRow: {
    width: '100%',
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: Radius.md || 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: Radius.md || 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
