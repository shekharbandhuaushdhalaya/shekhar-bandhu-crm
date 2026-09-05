import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../utils/themeContext';

interface ConfirmDeleteModalProps {
  visible: boolean;
  rawMaterial: any | null;
  onClose: () => void;
  onConfirmDelete: (rawMaterial: any) => Promise<void>;
}

export default function ConfirmDeleteModal({
  visible,
  rawMaterial,
  onClose,
  onConfirmDelete
}: ConfirmDeleteModalProps) {
  const { colors } = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!visible || !rawMaterial) return null;

  const stock = rawMaterial.stockLevel || 0;
  const isBlocked = stock > 0;

  const handleDelete = async () => {
    if (isBlocked) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onConfirmDelete(rawMaterial);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete raw material');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.bg.card, borderColor: colors.border }]}>
          
          {/* Modal Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[styles.iconContainer, { backgroundColor: isBlocked ? colors.warning + '15' : colors.danger + '15' }]}>
                <Ionicons
                  name={isBlocked ? 'warning' : 'trash-bin'}
                  size={20}
                  color={isBlocked ? colors.warning : colors.danger}
                />
              </View>
              <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
                {isBlocked ? 'Cannot Delete Ingredient' : 'Double Check Deletion'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} disabled={submitting}>
              <Ionicons name="close" size={20} color={colors.text.muted} />
            </TouchableOpacity>
          </View>

          {/* Modal Content */}
          <View style={{ padding: 16 }}>
            {/* Raw Material Info Summary Card */}
            <View style={[styles.infoCard, { backgroundColor: colors.bg.secondary, borderColor: colors.border }]}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>
                🌿 {rawMaterial.name}
              </Text>
              {rawMaterial.botanicalName ? (
                <Text style={{ fontSize: 11, fontStyle: 'italic', color: colors.text.secondary, marginTop: 2 }}>
                  {rawMaterial.botanicalName}
                </Text>
              ) : null}
              
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.secondary }}>
                  Category: <Text style={{ color: colors.text.primary }}>{rawMaterial.category || 'Herb'}</Text>
                </Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.secondary }}>
                  Stock Qty: <Text style={{ fontWeight: '800', color: isBlocked ? colors.danger : colors.success }}>
                    {stock} {rawMaterial.unit || 'kg'}
                  </Text>
                </Text>
              </View>
            </View>

            {/* Error banner if delete API call fails */}
            {errorMessage ? (
              <View style={[styles.errorBanner, { backgroundColor: colors.danger + '15', borderColor: colors.danger }]}>
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.danger, flex: 1 }}>
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            {/* Safety Validation Rules */}
            {isBlocked ? (
              <View style={[styles.alertCard, { backgroundColor: colors.danger + '08', borderColor: colors.danger + '40' }]}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <Ionicons name="shield-alert-outline" size={20} color={colors.danger} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.danger }}>
                      Stock Quantity &gt; 0 Blocked
                    </Text>
                    <Text style={{ fontSize: 11.5, color: colors.text.primary, marginTop: 4, lineHeight: 16 }}>
                      This raw material currently has <Text style={{ fontWeight: '800', color: colors.danger }}>{stock} {rawMaterial.unit}</Text> in inventory.
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.text.secondary, marginTop: 6, fontStyle: 'italic' }}>
                      Safety Rule: Materials with stock quantity greater than 0 cannot be deleted from the system list. Please adjust or issue remaining stock to 0 first.
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={[styles.alertCard, { backgroundColor: colors.warning + '08', borderColor: colors.warning + '40' }]}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                  <Ionicons name="alert-circle-outline" size={20} color={colors.warning} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.warning }}>
                      Are you sure you want to delete this ingredient?
                    </Text>
                    <Text style={{ fontSize: 11.5, color: colors.text.primary, marginTop: 4, lineHeight: 16 }}>
                      Double Check: This will remove <Text style={{ fontWeight: '700' }}>{rawMaterial.name}</Text> from your raw material master catalog.
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Modal Footer Actions */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={onClose}
              disabled={submitting}
              style={[styles.btnCancel, { borderColor: colors.border, backgroundColor: colors.bg.secondary }]}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text.primary }}>
                {isBlocked ? 'Close' : 'Cancel'}
              </Text>
            </TouchableOpacity>

            {!isBlocked && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={submitting}
                style={[styles.btnDelete, { backgroundColor: colors.danger }]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="trash" size={14} color="#fff" style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>
                      Yes, Delete Material
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    overflow: 'hidden'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800'
  },
  iconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center'
  },
  infoCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 12
  },
  alertCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1
  },
  btnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1
  },
  btnDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6
  }
});
