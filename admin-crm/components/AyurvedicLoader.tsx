import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../utils/themeContext';
import { LightColors, Radius, Shadows } from '../constants/theme';

const AYURVEDIC_PHRASES = [
  { text: 'सर्वे भवन्तु सुखिनः सर्वे सन्तु निरामयाः', subtext: 'सभी जीव स्वस्थ एवं रोगमुक्त रहें...', icon: '🌿' },
  { text: 'वात, पित्त एवं कफ का प्राकृतिक संतुलन...', subtext: 'त्रिदोष एवं जीवन ऊर्जा का सुव्यवस्थित सामंजस्य', icon: '⚖️' },
  { text: 'प्राकृतिक जड़ी-बूटियों एवं शुद्ध औषधियों का संकलन...', subtext: 'पारंपरिक आयुर्वेदिक औषधियों का निर्माण', icon: '🧪' },
  { text: 'आयुः कामयमानेन धर्मार्थसुखसाधनम्', subtext: 'उत्कृष्ट स्वास्थ्य, दीर्घायु एवं आरोग्य संवर्धन...', icon: '🍯' },
  { text: 'पूर्ण शुद्धता एवं सात्विकता से निर्माण कार्य...', subtext: 'शेखर बंधु औषधालय की प्रामाणिक परंपरा', icon: '🍃' }
];

export default function AyurvedicLoader({ message, inline = false }: { message?: string; inline?: boolean }) {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const [fadeAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();

      setIndex((prev) => (prev + 1) % AYURVEDIC_PHRASES.length);
    }, 3200);

    return () => clearInterval(interval);
  }, []);

  const activePhrase = AYURVEDIC_PHRASES[index];

  if (inline) {
    return (
      <View style={styles.inlineContainer}>
        <Text style={[styles.inlineText, { color: colors.text.secondary }]}>
          {activePhrase.icon} {activePhrase.text}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.fullContainer, { backgroundColor: 'rgba(0, 0, 0, 0.45)' }]}>
      <View style={[styles.card, { backgroundColor: colors.bg.card, borderColor: colors.primary + '40' }]}>
        {message ? (
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            {message}
          </Text>
        ) : null}

        <Animated.View style={[{ alignItems: 'center' }, { opacity: fadeAnim }]}>
          <Text style={{ fontSize: 42, marginBottom: 12 }}>{activePhrase.icon}</Text>
          <Text style={[styles.heading, { color: colors.primary }]}>
            {activePhrase.text}
          </Text>
          <Text style={[styles.subheading, { color: colors.text.secondary }]}>
            {activePhrase.subtext}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
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
