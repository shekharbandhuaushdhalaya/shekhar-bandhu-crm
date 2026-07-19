import { View, Text, ActivityIndicator, Modal } from 'react-native';
import { useTheme } from '../utils/themeContext';
import { Radius } from '../constants/theme';

type Props = {
  visible: boolean;
  message?: string;
};

export default function LoadingOverlay({ visible, message = 'Processing...' }: Props) {
  const { colors } = useTheme();
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none">
      <View style={{
        flex: 1, backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center', alignItems: 'center',
        zIndex: 99999
      }}>
        <View style={{
          padding: 24, backgroundColor: colors.bg.card, borderRadius: Radius.lg,
          alignItems: 'center', boxShadow: '0px 4px 10px rgba(0,0,0,0.3)', elevation: 10
        }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.text.primary, fontWeight: '700', fontSize: 15 }}>
            {message}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
