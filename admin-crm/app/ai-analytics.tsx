import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Platform, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, LightColors } from '../constants/theme';
import { api } from '../utils/api';
import { useTheme, useStyles } from '../utils/themeContext';

export default function AiAnalyticsPage() {
  const { colors } = useTheme();
  const styles = useStyles(createStyles);

  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; data?: any }>>([
    {
      sender: 'ai',
      text: 'Namaste! 🙏 I am your Shekhar Bandhu Business AI Assistant. Ask me anything about your sales, GST liabilities, stock levels, or customer balances!'
    }
  ]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const config = await api.getSystemSettings();
      if (config && config.geminiApiKey) {
        setApiKey(config.geminiApiKey);
      }
    } catch (err) {
      console.error('Failed to load system settings:', err);
    }
  };

  const handleSaveKey = async () => {
    try {
      setSavingKey(true);
      await api.updateSystemSettings({ geminiApiKey: apiKey.trim() });
      setShowKeyInput(false);
      Alert.alert('AI Settings Saved', 'Gemini API Key saved successfully!');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save API key.');
    } finally {
      setSavingKey(false);
    }
  };

  const handleAsk = async (customText?: string) => {
    const textToAsk = customText || prompt;
    if (!textToAsk.trim()) return;

    const userMsg = textToAsk.trim();
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    if (!customText) setPrompt('');

    try {
      setLoading(true);
      const res = await api.askAiAnalytics(userMsg);
      setMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: res.answer || res.message || 'No response generated.',
          data: res.data
        }
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          sender: 'ai',
          text: `⚠️ Error querying AI Analytics: ${err.message || 'Unable to connect.'}`
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const SUGGESTED_PROMPTS = [
    '💰 What is our total sales revenue this month?',
    '📈 Who are our top customers by outstanding balance?',
    '📦 Which products are low in warehouse stock?',
    '🧾 What is our GST tax liability estimation for this quarter?',
    '🏭 Show yield efficiency of recent production runs'
  ];

  return (
    <View style={styles.container}>
      {/* Suggested Quick Prompt Chips */}
      <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, marginBottom: Spacing.xs }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {SUGGESTED_PROMPTS.map((sp, idx) => (
            <TouchableOpacity key={idx} style={styles.promptChip} onPress={() => handleAsk(sp)}>
              <Text style={styles.promptChipText}>{sp}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Conversational Message Feed */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg, gap: 16 }}>
        {messages.map((msg, idx) => (
          <View
            key={idx}
            style={[
              styles.msgBubble,
              msg.sender === 'user' ? styles.userBubble : styles.aiBubble
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Ionicons
                name={msg.sender === 'user' ? 'person-circle-outline' : 'sparkles'}
                size={16}
                color={msg.sender === 'user' ? '#fff' : colors.primary}
              />
              <Text style={[styles.msgSender, { color: msg.sender === 'user' ? '#fff' : colors.primary }]}>
                {msg.sender === 'user' ? 'You' : 'Shekhar Bandhu Business AI'}
              </Text>
            </View>

            <Text style={[styles.msgText, { color: msg.sender === 'user' ? '#fff' : colors.text.primary }]}>
              {msg.text}
            </Text>

            {msg.data && Array.isArray(msg.data) && msg.data.length > 0 && (
              <View style={styles.dataContainer}>
                <Text style={styles.dataTitle}>📊 Live CRM Data Context:</Text>
                {msg.data.map((d, dIdx) => (
                  <View key={dIdx} style={styles.dataRow}>
                    <Text style={styles.dataRowText}>• {JSON.stringify(d).replace(/[{}"']/g, ' ')}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        {loading && (
          <View style={[styles.msgBubble, styles.aiBubble, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ fontSize: 13, color: colors.text.muted, fontStyle: 'italic' }}>
              बिक्री, जीएसटी एवं डेटाबेस का विश्लेषण किया जा रहा है...
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Fixed Questioning Bar */}
      <View style={styles.bottomBar}>
        <TextInput
          style={styles.bottomInput}
          placeholder="Ask a question about your business..."
          placeholderTextColor={colors.text.muted}
          value={prompt}
          onChangeText={setPrompt}
          onSubmitEditing={() => handleAsk()}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { opacity: (loading || !prompt.trim()) ? 0.6 : 1 }]}
          onPress={() => handleAsk()}
          disabled={loading || !prompt.trim()}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: typeof LightColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    backgroundColor: colors.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center'
  },
  aiIconBadge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text.primary },
  headerSubtitle: { fontSize: 11, color: colors.text.muted, marginTop: 1 },
  keyConfigBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '30' },
  keyConfigBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  keyCard: { margin: Spacing.lg, padding: Spacing.md, backgroundColor: colors.bg.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.primary },
  keyCardTitle: { fontSize: 14, fontWeight: '800', color: colors.text.primary },
  keyCardSubtitle: { fontSize: 12, color: colors.text.muted, marginTop: 2 },
  keyInput: { flex: 1, height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 12, backgroundColor: colors.bg.primary, color: colors.text.primary, fontSize: 13 },
  keySaveBtn: { paddingHorizontal: 16, height: 40, backgroundColor: colors.primary, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
  keySaveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  promptChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border },
  promptChipText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },

  msgBubble: { maxWidth: '85%', padding: Spacing.md, borderRadius: Radius.lg },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 2 },
  aiBubble: { alignSelf: 'flex-start', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 2 },
  msgSender: { fontSize: 11, fontWeight: '800' },
  msgText: { fontSize: 13, lineHeight: 20 },
  
  dataContainer: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border + '60' },
  dataTitle: { fontSize: 11, fontWeight: '800', color: colors.primary, marginBottom: 4 },
  dataRow: { paddingVertical: 2 },
  dataRowText: { fontSize: 11, color: colors.text.muted },

  bottomBar: { padding: Spacing.md, backgroundColor: colors.bg.card, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bottomInput: { flex: 1, height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, paddingHorizontal: 14, backgroundColor: colors.bg.primary, color: colors.text.primary, fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }
});
