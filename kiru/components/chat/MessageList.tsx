import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { FlatList, View } from 'react-native';
import type { Message } from '../../hooks/useChatMachine';
import type { BusinessResult } from '../../lib/types';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import { typewriterDuration } from './TypewriterText';

const GEN_UI_ROLES = new Set(['search-results', 'analysis', 'audio']);

type Props = {
  messages: Message[];
  typing: boolean;
  onCall?: (result: BusinessResult, phone: string) => void;
  onSkip?: () => void;
  ListFooterComponent?: React.ReactElement;
};

export default function MessageList({ messages, typing, onCall, onSkip, ListFooterComponent }: Props) {
  const listRef = useRef<FlatList<Message>>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const prevLengthRef = useRef(messages.length);

  // Delay gen UI items that follow an animated AI message
  useEffect(() => {
    const prevLen = prevLengthRef.current;
    prevLengthRef.current = messages.length;

    if (messages.length <= prevLen) {
      setHiddenIds(new Set());
      return;
    }

    const toHide = new Set<string>();
    let revealDelay = 0;

    for (let i = prevLen; i < messages.length; i++) {
      if (GEN_UI_ROLES.has(messages[i].role) && i > 0) {
        const prev = messages[i - 1];
        if (prev.role === 'ai' && prev.animate !== false) {
          toHide.add(messages[i].id);
          revealDelay = typewriterDuration(prev.text.length) + 150;
        }
      }
    }

    if (toHide.size > 0) {
      setHiddenIds(toHide);
      const timer = setTimeout(() => setHiddenIds(new Set()), revealDelay);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  const visibleMessages = useMemo(
    () => (hiddenIds.size > 0 ? messages.filter((m) => !hiddenIds.has(m.id)) : messages),
    [messages, hiddenIds],
  );

  const scrollToEnd = useCallback(() => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [visibleMessages.length, typing, scrollToEnd]);

  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <View style={{ marginBottom: 10 }}>
        <MessageBubble message={item} onCall={onCall} onSkip={onSkip} />
      </View>
    ),
    [onCall, onSkip],
  );

  const keyExtractor = useCallback((item: Message) => item.id, []);

  return (
    <FlatList
      ref={listRef}
      data={visibleMessages}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      onContentSizeChange={scrollToEnd}
      ListFooterComponent={
        <>
          {typing && (
            <View style={{ marginBottom: 10 }}>
              <TypingIndicator />
            </View>
          )}
          {ListFooterComponent}
        </>
      }
    />
  );
}
