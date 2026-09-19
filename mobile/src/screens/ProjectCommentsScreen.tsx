import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { projectCommentService } from '../services/api';
import { useTheme } from '../theme/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { ThemedInput } from '../components/ThemedInput';

interface Comment {
  id: number;
  body: string;
  created_at: string;
  user: { id: number; name: string; avatar_path?: string | null };
}

// Comments from other producers on a project its owner has shared publicly —
// distinct from ProjectChatScreen, which is the project owner's own private
// AI chat. Any authenticated user can read/post here once a project is public.
export const ProjectCommentsScreen = ({ navigation, route }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { projectId, projectName } = route.params;

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    projectCommentService
      .list(projectId)
      .then((data) => setComments(data.data || data))
      .catch((e) => {
        setError(e.response?.status === 403 ? 'This project is private.' : 'Failed to load comments.');
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const sendComment = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      const comment = await projectCommentService.send(projectId, body);
      setComments((prev) => [...prev, comment]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      console.error('Failed to post comment:', e);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {projectName || 'Comments'}
        </Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : error ? (
        <View style={styles.emptyState}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.textTertiary} />
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={comments}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, paddingBottom: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <View style={styles.commentRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(item.user?.name || '?').charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.commentBody}>
                <Text style={styles.commentAuthor}>{item.user?.name || 'Unknown'}</Text>
                <Text style={styles.commentText}>{item.body}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-ellipses-outline" size={40} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No comments yet — be the first to say something</Text>
            </View>
          }
        />
      )}

      {!error && (
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 12 }]}>
          <ThemedInput
            style={styles.textInput}
            placeholder="Add a comment..."
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendComment} disabled={sending || !text.trim()}>
            <Ionicons name="send" size={18} color={colors.onAccent} />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    backButton: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginHorizontal: 12 },
    commentRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: colors.onAccent, fontWeight: '700', fontSize: 13 },
    commentBody: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 12 },
    commentAuthor: { fontSize: 12, fontWeight: '700', color: colors.primaryLight, marginBottom: 4 },
    commentText: { fontSize: 14, color: colors.textPrimary },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    textInput: { flex: 1, maxHeight: 100 },
    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: { alignItems: 'center', marginTop: 40, gap: 10, paddingHorizontal: 40 },
    emptyText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600', textAlign: 'center' },
  });
