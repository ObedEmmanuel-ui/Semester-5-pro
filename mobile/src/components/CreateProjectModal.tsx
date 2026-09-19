import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Keyboard } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { ThemedInput } from './ThemedInput';

interface Props {
  visible: boolean;
  defaultName: string;
  onCancel: () => void;
  onCreate: (name: string) => void | Promise<void>;
}

/**
 * Lets the user actually name a new project instead of it always being
 * auto-labeled "Project N" — a plain text prompt, not a fixed name with no
 * way to change it before creation.
 */
export function CreateProjectModal({ visible, defaultName, onCancel, onCreate }: Props) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [name, setName] = useState(defaultName);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(defaultName);
      setCreating(false);
    }
  }, [visible, defaultName]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    Keyboard.dismiss();
    try {
      await onCreate(trimmed);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Name Your Project</Text>
          <Text style={styles.subtitle}>Give it a name that suits what you're working on</Text>
          <ThemedInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Late Night Sessions"
            autoFocus
            maxLength={255}
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={creating}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createButton, !name.trim() && styles.createButtonDisabled]}
              onPress={handleCreate}
              disabled={!name.trim() || creating}
            >
              {creating ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Text style={styles.createButtonText}>Create</Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 30,
    },
    card: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 22,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 12.5,
      color: colors.textTertiary,
      marginBottom: 16,
    },
    input: {
      marginBottom: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    cancelButtonText: {
      color: colors.textSecondary,
      fontWeight: '700',
      fontSize: 14,
    },
    createButton: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    createButtonDisabled: {
      opacity: 0.5,
    },
    createButtonText: {
      color: colors.onAccent,
      fontWeight: '700',
      fontSize: 14,
    },
  });
