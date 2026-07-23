import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../utils/auth';
import { Spacing, Radius } from '../constants/theme';
import { useTheme } from '../utils/themeContext';

// Premium Ayurvedic Color Theme constants
const BRAND_GREEN = '#1A3F24'; // Deep forest herbal green
const BRAND_GOLD = '#C29F68';  // Warm golden highlight
const CREAM_BG = '#FAF8F5';    // Herbal cream soft background

export default function LoginScreen() {
  const { login } = useAuth();
  const { colors } = useTheme();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header Branding */}
        <View style={styles.header}>
          <Image 
            source={require('../assets/logo.png')} 
            style={styles.heroLogo}
            resizeMode="contain"
          />
          <Text style={styles.title}>SHEKHAR BANDHU</Text>
          <Text style={styles.subtitle}>AUSHADHALAYA • CRM PORTAL</Text>
          <View style={styles.divider} />
        </View>

        {/* Login Card */}
        <View style={styles.card}>
          <Text style={styles.welcomeText}>Welcome Back</Text>
          <Text style={styles.welcomeSub}>Please sign in to access your dashboard</Text>

          {error && (
            <View style={styles.errorAlert}>
              <Ionicons name="alert-circle-outline" size={18} color="#D32F2F" style={{ marginRight: 8 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Email Input */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Email Address</Text>
            <View style={[styles.inputContainer, error ? styles.inputError : null]}>
              <Ionicons name="mail-outline" size={18} color={BRAND_GREEN} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@company.com"
                placeholderTextColor="#A0A0A0"
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

          {/* Password Input */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={[styles.inputContainer, error ? styles.inputError : null]}>
              <Ionicons name="lock-closed-outline" size={18} color={BRAND_GREEN} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#A0A0A0"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={() => handleLogin()}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.passwordToggle}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#707070" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Submit Button */}
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

        {/* Footer Brand Seal */}
        <Text style={styles.footerText}>
          🔒 Secure Enterprise Portal
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CREAM_BG,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  heroLogo: {
    width: 140,
    height: 90,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: BRAND_GREEN,
    letterSpacing: 2,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: BRAND_GOLD,
    marginTop: 4,
    letterSpacing: 1,
    textAlign: 'center',
  },
  divider: {
    width: 60,
    height: 2,
    backgroundColor: BRAND_GOLD,
    marginTop: 14,
    borderRadius: 1,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 30,
    shadowColor: BRAND_GREEN,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 4,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#EFECE6',
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '800',
    color: BRAND_GREEN,
    textAlign: 'center',
    marginBottom: 4,
  },
  welcomeSub: {
    fontSize: 12,
    color: '#808080',
    textAlign: 'center',
    marginBottom: 24,
  },
  formGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#606060',
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF9F6',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E3DFD5',
    paddingHorizontal: Spacing.md,
    height: 46,
  },
  inputError: {
    borderColor: '#D32F2F',
    backgroundColor: '#FFF8F8',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: BRAND_GREEN,
    fontSize: 13,
    height: '100%',
  },
  passwordToggle: {
    padding: Spacing.sm,
  },
  loginBtn: {
    flexDirection: 'row',
    backgroundColor: BRAND_GREEN,
    borderRadius: Radius.md,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    shadowColor: BRAND_GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  errorAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderColor: '#FFCDD2',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  footerText: {
    fontSize: 11,
    color: '#909090',
    textAlign: 'center',
    marginTop: 24,
    fontWeight: '500',
  },
});
