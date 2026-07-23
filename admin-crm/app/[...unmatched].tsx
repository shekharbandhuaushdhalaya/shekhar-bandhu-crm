import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Animated } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, G, Rect } from 'react-native-svg';
import { useTheme } from '../utils/themeContext';
import { Radius, Spacing } from '../constants/theme';

export default function UnmatchedRouteScreen() {
  const { colors, themeMode } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;

  const [countdown, setCountdown] = useState(15);
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Pulse animation loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();

    // Auto redirect countdown
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          router.replace('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg.primary }]}>
      {/* Background Glowing Ambient Orbs */}
      <View style={styles.ambientGlowTop} />
      <View style={styles.ambientGlowBottom} />

      <View style={[styles.cardContainer, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
        
        {/* Sacred Creative SVG Illustration */}
        <Animated.View style={[{ transform: [{ scale: pulseAnim }] }]}>
          <Svg width={120} height={120} viewBox="0 0 120 120" fill="none">
            <Defs>
              <LinearGradient id="herbGrad" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
                <Stop offset="0%" stopColor="#10b981" />
                <Stop offset="100%" stopColor="#047857" />
              </LinearGradient>
              <LinearGradient id="goldGrad" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
                <Stop offset="0%" stopColor="#f59e0b" />
                <Stop offset="100%" stopColor="#b45309" />
              </LinearGradient>
            </Defs>

            {/* Glowing Flask Outer Ring */}
            <Circle cx="60" cy="60" r="54" stroke="url(#goldGrad)" strokeWidth="2" strokeDasharray="6 4" opacity={0.6} />
            <Circle cx="60" cy="60" r="44" fill={colors.primary + '15'} />

            {/* Ayurvedic Mortar & Leaf Illustration */}
            <Path d="M40 75C40 86 48.9543 95 60 95C71.0457 95 80 86 80 75H40Z" fill="url(#herbGrad)" />
            <Rect x="35" y="70" width="50" height="6" rx="3" fill="url(#goldGrad)" />
            <Path d="M60 40C60 40 45 48 45 60C45 66 50 70 60 70C70 70 75 66 75 60C75 48 60 40 60 40Z" fill="#10b981" opacity={0.8} />
            <Path d="M60 45V68" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
            
            {/* Sparkles */}
            <Circle cx="32" cy="35" r="3" fill="#f59e0b" />
            <Circle cx="88" cy="40" r="4" fill="#10b981" />
            <Circle cx="84" cy="85" r="2.5" fill="#f59e0b" />
          </Svg>
        </Animated.View>

        {/* Status Badge */}
        <View style={[styles.badge, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '40' }]}>
          <Ionicons name="compass-outline" size={14} color={colors.warning} />
          <Text style={[styles.badgeText, { color: colors.warning }]}>404 — CHAMBER DISSOLVED</Text>
        </View>

        {/* Creative Title & Subtitle */}
        <Text style={[styles.title, { color: colors.text.primary }]}>
          🌿 Sacred Path Not Found
        </Text>
        
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          The requested route <Text style={{ fontWeight: '700', color: colors.primary }}>"{pathname}"</Text> has been transmuted, relocated, or requires elevated Veda permissions.
        </Text>

        {/* Countdown Banner */}
        <View style={[styles.countdownBox, { backgroundColor: colors.bg.secondary, borderColor: colors.border }]}>
          <Ionicons name="time-outline" size={16} color={colors.primary} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary }}>
            Auto-returning to Dashboard in <Text style={{ fontWeight: '800', color: colors.primary }}>{countdown}s</Text>
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={[styles.btnRow, { flexDirection: isDesktop ? 'row' : 'column' }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.replace('/')}
            activeOpacity={0.8}
          >
            <Ionicons name="home" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Return to Main Sanctuary</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.primary }]}
            onPress={() => router.push('/ai-analytics')}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>Ask AI Assistant</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Sanctuary Navigation Pills */}
        <View style={styles.quickLinksContainer}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', tracking: 1, marginBottom: 8 }}>
            Popular Active Chambers
          </Text>
          <View style={styles.pillsRow}>
            {[
              { label: '📊 Dashboard', path: '/' },
              { label: '📦 Inventory', path: '/inventories' },
              { label: '🧾 Invoices', path: '/invoices' },
              { label: '👨‍⚕️ Medical Reps', path: '/medicalreps' },
              { label: '🚚 Dispatches', path: '/inventorydispatch' },
            ].map(pill => (
              <TouchableOpacity
                key={pill.path}
                style={[styles.pill, { backgroundColor: colors.bg.secondary, borderColor: colors.border }]}
                onPress={() => router.push(pill.path as any)}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.primary }}>{pill.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
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
    position: 'relative',
  },
  ambientGlowTop: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: '#10b981',
    opacity: 0.08,
  },
  ambientGlowBottom: {
    position: 'absolute',
    bottom: -100,
    left: -100,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: '#f59e0b',
    opacity: 0.08,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 580,
    borderRadius: Radius.xl || 24,
    borderWidth: 1,
    padding: Spacing.xl || 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 18,
    marginBottom: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 440,
    marginBottom: 16,
  },
  countdownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 20,
  },
  btnRow: {
    width: '100%',
    gap: 10,
    marginBottom: 24,
  },
  primaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md || 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: Radius.md || 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  quickLinksContainer: {
    width: '100%',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#00000010',
    paddingTop: 16,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
});
