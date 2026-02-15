import { useRef, useEffect, useCallback } from 'react';
import { FlatList, View } from 'react-native';
import type { Message } from '../../hooks/useChatMachine';
import type { BusinessResult } from '../../lib/types';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';

type Props = {
  messages: Message[];
  typing: boolean;
  onCall?: (result: BusinessResult, phone: string) => void;
  onSkip?: () => void;
  ListFooterComponent?: React.ReactElement;
};

export default function MessageList({ messages, typing, onCall, onSkip, ListFooterComponent }: Props) {
  const listRef = useRef<FlatList<Message>>(null);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages.length, typing, scrollToEnd]);

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
      data={messages}
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
