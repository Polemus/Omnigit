/**
 * The repository assistant: a conversation about one repository, dressed as iMessage.
 *
 * iMessage because it is the conversation everyone already reads without thinking: your
 * words in blue on the right, answers in grey on the left, a tail on the last of each run,
 * "Delivered" under what you just sent, three dots while an answer is on its way. The
 * header is the assistant's orb and name over the conversation, as a contact's photo is.
 *
 * Nothing here knows how answers are made - that is `askAssistant`, which for now answers
 * every question the same honest way. The glow and the chime that open it belong to the
 * button that does (`assistant-button.tsx`), so arriving here any other way is quiet.
 */

import { Host } from '@expo/ui';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { askAssistant } from '@/api/assistant';
import { Spacing } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { AssistantOrb } from '@/ui/assistant-orb';
import { ChatBubble, TypingBubble } from '@/ui/chat-bubble';
import { GlassSurface } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { Icons } from '@/ui/icons';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: number;
}

const SUGGESTIONS = [
  'Summarise this repository',
  'What changed recently?',
  'Where should I start reading?',
];

export default function AssistantScreen() {
  const { owner = '', name = '' } = useLocalSearchParams<{
    account: string;
    owner: string;
    name: string;
  }>();
  const router = useRouter();
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [keyboardShown, setKeyboardShown] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  // With the keyboard up, the composer sits on it rather than above the home indicator.
  useEffect(() => {
    const ios = process.env.EXPO_OS === 'ios';
    const shown = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setKeyboardShown(true)
    );
    const hidden = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboardShown(false)
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || thinking) return;
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const history = messages.map(({ role, text: said }) => ({ role, text: said }));
    setMessages((current) => [...current, message('user', question)]);
    setDraft('');
    setThinking(true);

    const answer = await askAssistant({ owner, name }, question, history);
    setMessages((current) => [...current, message('assistant', answer)]);
    setThinking(false);
    if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
  };

  // Newest first, for a list drawn from the bottom up the way a conversation grows.
  const newestFirst = [...messages].reverse();
  const canSend = draft.trim().length > 0 && !thinking;

  return (
    <View style={[styles.fill, { backgroundColor: palette.chatBackground }]}>
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        {messages.length === 0 ? (
          <Intro
            owner={owner}
            name={name}
            topInset={headerHeight}
            palette={palette}
            onAsk={(suggestion) => void send(suggestion)}
          />
        ) : (
          <FlatList
            inverted
            data={newestFirst}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => {
              const newer = newestFirst[index - 1];
              const older = newestFirst[index + 1];
              const endsRun = !newer || newer.role !== item.role;
              const startsRun = !older || older.role !== item.role;
              return (
                <View style={{ marginTop: startsRun ? Spacing.three : Spacing.half }}>
                  <ChatBubble
                    text={item.text}
                    outgoing={item.role === 'user'}
                    // The typing bubble only ever follows your own message, so the newest
                    // bubble in the list always ends its run.
                    tail={endsRun}
                    palette={palette}
                  />
                  {index === 0 && item.role === 'user' ? (
                    <Text style={[styles.receipt, { color: palette.textTertiary }]}>Delivered</Text>
                  ) : null}
                </View>
              );
            }}
            ListHeaderComponent={
              thinking ? (
                <View style={styles.typing}>
                  <TypingBubble palette={palette} />
                </View>
              ) : null
            }
            ListFooterComponent={<ConversationStart at={messages[0].at} palette={palette} />}
            contentContainerStyle={{
              // Inverted: this padding is the bottom of the conversation, and the one below
              // is its top, clear of the floating header.
              paddingTop: Spacing.three,
              paddingBottom: headerHeight + Spacing.three,
            }}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
          />
        )}

        <View
          style={[
            styles.composer,
            { paddingBottom: keyboardShown ? Spacing.two : Math.max(insets.bottom, Spacing.two) },
          ]}>
          <View
            style={[
              styles.field,
              { borderColor: palette.separator, backgroundColor: palette.chatBackground },
            ]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={name ? `Ask about ${name}` : 'Ask a question'}
              placeholderTextColor={palette.textTertiary}
              multiline
              maxLength={2000}
              style={[styles.input, { color: palette.text }]}
            />
            {canSend ? (
              <Pressable
                onPress={() => void send(draft)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Send"
                style={[styles.send, { backgroundColor: palette.chatOutgoing }]}>
                <View pointerEvents="none">
                  <Host matchContents>
                    <Icon name={Icons.send} size={15} color={palette.chatOutgoingText} />
                  </Host>
                </View>
              </Pressable>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Over the conversation, which scrolls up beneath it, faded into the background so
          what passes under it softens rather than colliding with the orb. */}
      <View
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing.one,
            experimental_backgroundImage: `linear-gradient(to bottom, ${palette.chatBackground} 72%, transparent)`,
          },
        ]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.headerSide}>
          <GlassSurface radius={20} style={styles.back}>
            <View pointerEvents="none">
              <Host matchContents>
                <Icon name={Icons.back} size={18} />
              </Host>
            </View>
          </GlassSurface>
        </Pressable>

        <View style={styles.identity}>
          <AssistantOrb size={44} />
          <GlassSurface radius={12} style={styles.namePill}>
            <Text style={[styles.name, { color: palette.text }]}>Omnigit AI</Text>
          </GlassSurface>
          <Text numberOfLines={1} style={[styles.about, { color: palette.textSecondary }]}>
            {owner}/{name}
          </Text>
        </View>

        <View style={styles.headerSide} />
      </View>
    </View>
  );
}

/** The empty conversation: who you are talking to, and something to ask first. */
function Intro({
  owner,
  name,
  topInset,
  palette,
  onAsk,
}: {
  owner: string;
  name: string;
  topInset: number;
  palette: ReturnType<typeof usePalette>;
  onAsk: (question: string) => void;
}) {
  return (
    <View style={[styles.intro, { paddingTop: topInset }]}>
      <AssistantOrb size={84} glow />
      <Text style={[styles.introTitle, { color: palette.text }]}>
        Ask about {name || 'this repository'}
      </Text>
      <Text style={[styles.introDetail, { color: palette.textSecondary }]}>
        Questions about the code, pull requests and issues in {owner}/{name}.
      </Text>
      <View style={styles.suggestions}>
        {SUGGESTIONS.map((suggestion) => (
          <Pressable
            key={suggestion}
            onPress={() => onAsk(suggestion)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.suggestion,
              {
                borderColor: palette.separator,
                backgroundColor: pressed ? palette.chatIncoming : palette.chatBackground,
              },
            ]}>
            <Text style={[styles.suggestionText, { color: palette.chatOutgoing }]}>
              {suggestion}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** "Today 14:40" over the first message, as iMessage dates a conversation. */
function ConversationStart({
  at,
  palette,
}: {
  at: number;
  palette: ReturnType<typeof usePalette>;
}) {
  const time = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <Text style={[styles.date, { color: palette.textTertiary }]}>
      <Text style={styles.dateDay}>Today</Text> {time}
    </Text>
  );
}

let sequence = 0;

function message(role: Message['role'], text: string): Message {
  sequence += 1;
  return { id: `${role}-${sequence}`, role, text, at: Date.now() };
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
  },
  headerSide: {
    width: 44,
  },
  back: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  namePill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
  },
  about: {
    fontSize: 11,
  },
  intro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  introTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: Spacing.three,
  },
  introDetail: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  suggestions: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  suggestion: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: Spacing.four,
    paddingVertical: 10,
    alignItems: 'center',
  },
  suggestionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  date: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  dateDay: {
    fontWeight: '600',
  },
  typing: {
    marginTop: Spacing.three,
  },
  receipt: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 3,
    marginRight: 20,
  },
  composer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 20,
    paddingLeft: Spacing.three + Spacing.one,
    paddingRight: Spacing.one,
    paddingVertical: Spacing.one,
    minHeight: 38,
  },
  input: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    maxHeight: 120,
    paddingTop: 6,
    paddingBottom: 6,
  },
  send: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.one,
    marginBottom: 1,
  },
});
