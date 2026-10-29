import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProjectStore } from '../store/projectStore';
import { useRecorder } from '../hooks/useRecorder';
import { projectMessageService } from '../services/api';
import { ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { ThemedInput } from '../components/ThemedInput';
import { BackButton } from '../components/BackButton';
import { onPlaybackFinished } from '../utils/audioPlayerEvents';

interface ChatMessage {
  id: number;
  body: string | null;
  is_ai: boolean;
  voice_url: string | null;
  voice_duration_seconds: number | null;
  created_at: string;
  user: { id: number; name: string; avatar_path?: string | null };
}

// Real, persisted chat scoped to a single project. There's no
// project-sharing/invite system, so the only human here is the project's own
// owner — but the AI is a real second participant: every text message the
// user sends also gets a genuine AI reply (music ideas, songwriting/
// production help, or just conversation), not a fabricated collaborator.
export const ProjectChatScreen = ({ navigation, route }: any) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { projectId } = route.params;
  const { projects, currentProject } = useProjectStore();
  const project = (projects as any[]).find((p) => p.id === projectId) || currentProject;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const { isRecording, startRecording, stopRecording } = useRecorder();
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const listRef = useRef<FlatList>(null);

  const load = async () => {
    try {
      const data = await projectMessageService.list(projectId);
      setMessages(data);
    } catch (e) {
      console.error('Failed to load messages:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return stopPlayback;
  }, [projectId]);

  function stopPlayback() {
    try {
      playerRef.current?.pause();
      playerRef.current?.remove();
    } catch {
      // already removed
    }
    playerRef.current = null;
    setPlayingId(null);
  }

  const togglePlay = (message: ChatMessage) => {
    if (playingId === message.id) {
      stopPlayback();
      return;
    }
    stopPlayback();
    if (!message.voice_url) return;
    const player = createAudioPlayer(message.voice_url);
    const subscription = onPlaybackFinished(player, () => {
      if (playerRef.current === player) {
        subscription.remove();
        stopPlayback();
      }
    });
    playerRef.current = player;
    setPlayingId(message.id);
    player.play();
  };

  const sendText = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      const message = await projectMessageService.send(projectId, { body });
      setMessages((prev) => [...prev, message]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      setSending(false);

      setAiThinking(true);
      try {
        const aiMessage = await projectMessageService.askAI(projectId, body);
        setMessages((prev) => [...prev, aiMessage]);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      } catch (e) {
        console.error('AI reply failed:', e);
      } finally {
        setAiThinking(false);
      }
    } catch (e) {
      console.error('Failed to send message:', e);
      setSending(false);
    }
  };

  const handleVoiceToggle = async () => {
    try {
      if (isRecording) {
        const uri = await stopRecording();
        setSending(true);
        const file = {
          uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
          name: `voice-msg-${Date.now()}.m4a`,
          type: 'audio/m4a',
        };
        const message = await projectMessageService.send(projectId, { voiceFile: file });
        setMessages((prev) => [...prev, message]);
        setSending(false);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      } else {
        await startRecording();
      }
    } catch (e) {
      console.error('Voice message failed:', e);
      setSending(false);
    }
  };

  const deleteMessage = async (message: ChatMessage) => {
    if (playingId === message.id) stopPlayback();
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
    try {
      await projectMessageService.delete(projectId, message.id);
    } catch (e: any) {
      if (e.response?.status !== 404) {
        console.error('Failed to delete message:', e);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title} numberOfLines={1}>
          {project?.name || 'Project Chat'}
        </Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, paddingBottom: 12 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.bubble, item.is_ai && styles.bubbleAI]}
              onLongPress={() => !item.is_ai && deleteMessage(item)}
            >
              <Text style={[styles.bubbleAuthor, item.is_ai && styles.bubbleAuthorAI]}>
                {item.is_ai ? 'MproWave AI' : item.user?.name || 'You'}
              </Text>
              {item.body && (
                <Text style={[styles.bubbleText, item.is_ai && styles.bubbleTextAI]}>{item.body}</Text>
              )}
              {item.voice_url && (
                <TouchableOpacity style={styles.voiceRow} onPress={() => togglePlay(item)}>
                  <Ionicons
                    name={playingId === item.id ? 'stop' : 'play'}
                    size={16}
                    color={item.is_ai ? colors.textPrimary : colors.onAccent}
                  />
                  <Text style={[styles.voiceLabel, item.is_ai && styles.bubbleTextAI]}>
                    Voice message{item.voice_duration_seconds ? ` · ${Math.round(item.voice_duration_seconds)}s` : ''}
                  </Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
          ListFooterComponent={
            aiThinking ? (
              <View style={[styles.bubble, styles.bubbleAI, styles.thinkingBubble]}>
                <ActivityIndicator size="small" color={colors.textSecondary} />
                <Text style={[styles.bubbleTextAI, { marginLeft: 8 }]}>MproWave AI is thinking…</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-ellipses-outline" size={44} color={colors.textTertiary} />
              <Text style={styles.emptyText}>Chat with your AI music assistant</Text>
              <Text style={styles.emptySubtext}>
                Ask for song ideas, songwriting or production help, or just talk through the project
              </Text>
            </View>
          }
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 12 }]}>
        <ThemedInput
          style={styles.textInput}
          placeholder="Ask for music ideas..."
          value={text}
          onChangeText={setText}
          multiline
        />
        {text.trim() ? (
          <TouchableOpacity style={styles.sendButton} onPress={sendText} disabled={sending}>
            <Ionicons name="send" size={18} color={colors.onAccent} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendButton, isRecording && styles.sendButtonRecording]}
            onPress={handleVoiceToggle}
            disabled={sending}
          >
            <Ionicons name={isRecording ? 'stop' : 'mic'} size={18} color={colors.onAccent} />
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: {
      flex: 1,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
      marginHorizontal: 12,
    },
    bubble: {
      alignSelf: 'flex-end',
      backgroundColor: colors.primary,
      borderRadius: 16,
      borderBottomRightRadius: 4,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 10,
      maxWidth: '80%',
    },
    bubbleAI: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surface,
      borderBottomRightRadius: 16,
      borderBottomLeftRadius: 4,
    },
    thinkingBubble: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    bubbleAuthor: {
      fontSize: 11,
      color: 'rgba(255,255,255,0.7)',
      marginBottom: 3,
    },
    bubbleAuthorAI: {
      color: colors.primaryLight,
      fontWeight: '700',
    },
    bubbleText: {
      fontSize: 14,
      color: colors.onAccent,
    },
    bubbleTextAI: {
      fontSize: 14,
      color: colors.textPrimary,
    },
    voiceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
    },
    voiceLabel: {
      fontSize: 13,
      color: colors.onAccent,
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    textInput: {
      flex: 1,
      maxHeight: 100,
    },
    sendButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonRecording: {
      backgroundColor: colors.danger,
    },
    emptyState: {
      alignItems: 'center',
      marginTop: 60,
      gap: 10,
      paddingHorizontal: 40,
    },
    emptyText: {
      fontSize: 16,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    emptySubtext: {
      fontSize: 13,
      color: colors.textTertiary,
      textAlign: 'center',
    },
  });
