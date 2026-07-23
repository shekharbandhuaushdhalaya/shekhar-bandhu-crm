import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../utils/auth';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { useTheme, useStyles } from '../utils/themeContext';

// Premium Ayurvedic Color Theme constants
const BRAND_GREEN = '#1A3F24'; // Deep forest herbal green
const BRAND_GOLD = '#C29F68';  // Warm golden highlight
const CREAM_BG = '#FAF8F5';    // Herbal cream soft background

// Ayurvedic Heritage Themes for the Left Pane
interface HeritageTheme {
  title: string;
  subtitle: string;
  quote: string;
  description: string;
  icon: string;
}

const HERITAGE_THEMES: HeritageTheme[] = [
  {
    title: 'भगवान धन्वन्तरि',
    subtitle: 'आयुर्वेद के देव (LORD DHANVANTARI)',
    quote: '“देवताओं के चिकित्सक, अमृत कलश के धारक।”',
    description: 'समस्त पीढ़ियों में स्वास्थ्य, जीवन शक्ति और संतुलन बहाल करने के लिए दिव्य ज्ञान का उपयोग।',
    icon: 'sparkles-outline'
  },
  {
    title: 'महर्षि सुश्रुत',
    subtitle: 'शल्य चिकित्सा के जनक (ACHARYA SUSHRUTA)',
    quote: '“उपकरणों में सटीकता, व्यवहार में करुणा।”',
    description: '२५०० वर्ष पूर्व प्राचीन शल्य चिकित्सा, शरीर विज्ञान और समग्र उपचार पद्धतियों का सूत्रपात किया।',
    icon: 'bandage-outline'
  },
  {
    title: 'महर्षि चरक',
    subtitle: 'चिकित्सा विज्ञान के प्रणेता (ACHARYA CHARAKA)',
    quote: '“ज्ञान रूपी दीपक के बिना कोई भी चिकित्सक रोगी को ठीक नहीं कर सकता।”',
    description: 'रसायन (कायाकल्प), आहार विज्ञान और वात, पित्त तथा कफ के संवैधानिक संतुलन को व्यवस्थित किया।',
    icon: 'book-outline'
  },
  {
    title: 'रसायन और जड़ी-बूटियाँ',
    subtitle: 'प्रकृति की कीमिया (RASAYANA & HERBS)',
    quote: '“शरीर, मन और आत्मा को संतुलित करने के लिए पृथ्वी के शुद्ध तत्वों का उपयोग।”',
    description: 'दीर्घायु और आरोग्यता के लिए प्राकृतिक जड़ों, पत्तियों और खनिजों का चमत्कारी मिश्रण।',
    icon: 'leaf-outline'
  }
];

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles(createStyles);
  const { width } = useWindowDimensions();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [greeting, setGreeting] = useState('Welcome Back');
  const [theme, setTheme] = useState<HeritageTheme>(HERITAGE_THEMES[0]);

  // Dynamic greeting and random theme picker
  useEffect(() => {
    const hrs = new Date().getHours();
    if (hrs < 12) setGreeting('Good Morning');
    else if (hrs < 17) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');

    // Pick a random Ayurvedic heritage theme
    const randomIndex = Math.floor(Math.random() * HERITAGE_THEMES.length);
    setTheme(HERITAGE_THEMES[randomIndex]);
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your credentials');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const isDesktop = width >= 768;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={[styles.mainWrapper, isDesktop && styles.desktopWrapper]}>
        
        {/* Left Side: Brand Heritage Art Panel (Visible on Desktop) */}
        {isDesktop && (
          <View style={[styles.artPanel, { backgroundColor: colors.primary }]}>
            <View style={styles.artOverlay}>
              <View style={styles.decoCircle1} />
              <View style={styles.decoCircle2} />
              <View style={styles.artContent}>
                {/* Logo Image with Golden/White circular container */}
                <View style={{
                  width: 140,
                  height: 140,
                  borderRadius: 70,
                  backgroundColor: '#ffffff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 30,
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.15,
                  shadowRadius: 10,
                  elevation: 5,
                  borderWidth: 3,
                  borderColor: 'rgba(255, 255, 255, 0.4)'
                }}>
                  <Image 
                    source={require('../assets/logo.png')} 
                    style={{ width: 100, height: 75 }}
                    resizeMode="contain"
                  />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Ionicons name={theme.icon as any} size={24} color={BRAND_GOLD} />
                  <Text style={styles.artTitle}>{theme.title}</Text>
                </View>
                <Text style={styles.artSubtitle}>{theme.subtitle}</Text>
                <View style={styles.artDivider} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: BRAND_GOLD, fontStyle: 'italic', marginBottom: 12, lineHeight: 22 }}>
                  {theme.quote}
                </Text>
                <Text style={styles.artDescription}>
                  {theme.description}
                </Text>
              </View>
              <Text style={styles.artFooter}>© 2026 Shekhar Bandhu. All rights reserved.</Text>
            </View>
          </View>
        )}

        {/* Right Side: Login Form Panel */}
        <View style={styles.formPanel}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            
            {/* Header for Mobile (Hidden on Desktop) */}
            {!isDesktop && (
              <View style={styles.mobileHeader}>
                <Image 
                  source={require('../assets/logo.png')} 
                  style={styles.heroLogo}
                  resizeMode="contain"
                />
                <Text style={styles.mobileTitle}>SHEKHAR BANDHU</Text>
                <Text style={styles.mobileSubtitle}>AUSHADHALAYA • CRM PORTAL</Text>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.greetingText}>{greeting}</Text>
              <Text style={styles.welcomeSub}>Please sign in to access your workspace</Text>

              {error && (
                <View style={styles.errorAlert}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.danger} style={{ marginRight: 8 }} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Email Field */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Email Address</Text>
                <View style={[styles.inputContainer, error ? styles.inputError : null]}>
                  <Ionicons name="mail-outline" size={18} color={colors.primary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="name@shekharbandhu.com"
                    placeholderTextColor={colors.text.muted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => handleLogin()}
                  />
                </View>
              </View>

              {/* Password Field */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={[styles.inputContainer, error ? styles.inputError : null]}>
                  <Ionicons name="lock-closed-outline" size={18} color={colors.primary} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={colors.text.muted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={() => handleLogin()}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.passwordToggle}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.text.muted} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Submit Action */}
              <TouchableOpacity style={styles.loginBtn} onPress={() => handleLogin()} disabled={loading} activeOpacity={0.9}>
                {loading ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <>
                    <Text style={styles.loginBtnText}>Sign In</Text>
                    <Ionicons name="arrow-forward" size={16} color="#ffffff" style={{ marginLeft: 6 }} />
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.footerText}>
              🔒 Secure SSL Encrypted Gateway
            </Text>
          </ScrollView>
        </View>

      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  mainWrapper: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopWrapper: {
    height: '100%',
  },
  artPanel: {
    flex: 1.1,
    position: 'relative',
    overflow: 'hidden',
  },
  artOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    padding: 50,
    justifyContent: 'space-between',
  },
  decoCircle1: {
    position: 'absolute',
    top: '-15%',
    right: '-10%',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  decoCircle2: {
    position: 'absolute',
    bottom: '-10%',
    left: '-5%',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  artContent: {
    marginTop: 60,
    maxWidth: 440,
  },
  artTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 3,
  },
  artSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    opacity: 0.8,
    letterSpacing: 2,
    marginTop: 4,
  },
  artDivider: {
    width: 50,
    height: 3,
    backgroundColor: '#ffffff',
    marginVertical: 20,
    borderRadius: 2,
  },
  artDescription: {
    fontSize: 14,
    color: '#ffffff',
    lineHeight: 22,
    opacity: 0.9,
    fontWeight: '500',
  },
  artFooter: {
    color: '#ffffff',
    fontSize: 11,
    opacity: 0.7,
    fontWeight: '500',
  },
  formPanel: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  mobileHeader: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  heroLogo: {
    width: 110,
    height: 70,
    marginBottom: 6,
  },
  mobileTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: 1.5,
  },
  mobileSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.secondary,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.bg.card,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 32,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  welcomeSub: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 26,
  },
  formGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.primary,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: Spacing.md,
    height: 46,
  },
  inputError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerLight,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 13,
    height: '100%',
  },
  passwordToggle: {
    padding: Spacing.sm,
  },
  loginBtn: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: Radius.md,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerLight,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  footerText: {
    fontSize: 11,
    color: colors.text.muted,
    textAlign: 'center',
    marginTop: 26,
    fontWeight: '500',
  },
});
