import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../utils/themeContext';
import { LightColors, Radius, Shadows } from '../constants/theme';

const AYURVEDIC_PHRASES = [
  { text: 'सर्वे भवन्तु सुखिनः सर्वे सन्तु निरामयाः', subtext: 'May all beings be healthy & free from illness...', icon: '🌿' },
  { text: 'Harmonizing Vata, Pitta & Kapha...', subtext: 'Balancing the vital energies of life', icon: '⚖️' },
  { text: 'Aligning Natural Herbs & Pure Aushadhi Extracts...', subtext: 'Formulating authentic Ayurvedic wellness', icon: '🧪' },
  { text: 'आयुः कामयमानेन धर्मार्थसुखसाधनम्', subtext: 'Nurturing longevity, health & vitality...', icon: '🍯' },
  { text: 'Processing Batches with Purity & Care...', subtext: 'Preparing traditional herbal formulations', icon: '🍃' }
];

export default function AyurvedicLoader({ message, inline = false }: { message?: string; inline?: boolean }) {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const [fadeAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (message) return; // Static custom message supplied

    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();

      setIndex((prev) => (prev + 1) % AYURVEDIC_PHRASES.length);
    }, 3500);

    return () => clearInterval(interval);
  }, [message]);

  const activePhrase = AYURVEDIC_PHRASES[index];

  if (inline) {
    return (
      <View style={styles.inlineContainer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={[styles.inlineText, { color: colors.text.secondary }]}>
          {message || `${activePhrase.icon} ${activePhrase.subtext}`}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.fullContainer, { backgroundColor: colors.bg.primary }]}>
      <View style={[styles.card, { backgroundColor: colors.bg.secondary, borderColor: colors.primary + '30' }]}>
        <Animated.View style={[{ alignItems: 'center' }, { opacity: fadeAnim }]}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>{message ? '🌿' : activePhrase.icon}</Text>
          <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
          <Text style={[styles.heading, { color: colors.primary }]}>
            {message || activePhrase.text}
          </Text>
          <Text style={[styles.subheading, { color: colors.text.secondary }]}>
            {message ? 'Shekhar Bandhu Aushadhalaya' : activePhrase.subtext}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 380,
    width: '100%',
    borderWidth: 1,
    ...Shadows.header,
  },
  heading: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 20,
  },
  subheading: {
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
  },
  inlineText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
