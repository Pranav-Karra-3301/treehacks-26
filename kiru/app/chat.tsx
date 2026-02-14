import { useRef, useCallback } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Clock, Plus } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

import { useChatMachine } from '../hooks/useChatMachine';
import { useVoiceReadiness } from '../hooks/useVoiceReadiness';
import { colors, fonts, shadows } from '../lib/theme';

import MessageList from '../components/chat/MessageList';
import ChatInput from '../components/chat/ChatInput';
import PostCallActions from '../components/chat/PostCallActions';
import ReadinessBanner from '../components/chat/ReadinessBanner';
import HistoryBottomSheet from '../components/history/HistoryBottomSheet';

export default function ChatScreen() {
  const {
    messages,
    input,
    setInput,
    phase,
    typing,
    isOnCall,
    showPostCall,
    canCallAgain,
    inputDisabled,
    placeholderText,
    handleSend,
    handleEndCall,
    handleNewNegotiation,
    handleCallFromSearch,
    handleSkipDiscovery,
    handleCallAgain,
    loadPastChat,
  } = useChatMachine();

  const readinessWarning = useVoiceReadiness();
  const bottomSheetRef = useRef<BottomSheetModal>(null);

  const openHistory = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    bottomSheetRef.current?.present();
  }, []);

  const handleLoadChatFromHistory = useCallback(
    (taskId: string) => {
      loadPastChat(taskId);
    },
    [loadPastChat],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Header */}
      <BlurView
        intensity={80}
        tint="light"
        className="flex-row items-center justify-between border-b border-gray-200/60 px-5 py-3"
      >
        <View className="flex-row items-center gap-3">
          <Text style={{ fontFamily: fonts.serifItalic, fontSize: 17, color: colors.gray950, letterSpacing: -0.5 }}>
            kiru
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {isOnCall && (
            <Animated.View entering={FadeIn.duration(200)} className="flex-row items-center gap-2">
              <View className="relative">
                <View className="h-2 w-2 rounded-full bg-emerald-500" />
              </View>
              <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.emerald600 }}>
                On call
              </Text>
            </Animated.View>
          )}
          {isOnCall && (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handleEndCall();
              }}
              className="rounded-full bg-red-50 px-3.5 py-1.5"
            >
              <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.red600 }}>
                End call
              </Text>
            </Pressable>
          )}
          {!isOnCall && (
            <>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleNewNegotiation();
                }}
                className="h-8 w-8 items-center justify-center rounded-lg"
              >
                <Plus size={18} color={colors.gray400} />
              </Pressable>
              <Pressable onPress={openHistory} className="h-8 w-8 items-center justify-center rounded-lg">
                <Clock size={18} color={colors.gray400} />
              </Pressable>
            </>
          )}
        </View>
      </BlurView>

      {/* Readiness banner */}
      {readinessWarning && <ReadinessBanner warning={readinessWarning} />}

      {/* Messages */}
      <View className="flex-1">
        <MessageList
          messages={messages}
          typing={typing}
          onCall={handleCallFromSearch}
          onSkip={handleSkipDiscovery}
          ListFooterComponent={
            showPostCall ? (
              <PostCallActions
                canCallAgain={canCallAgain}
                onCallAgain={handleCallAgain}
                onNewNegotiation={handleNewNegotiation}
              />
            ) : undefined
          }
        />
      </View>

      {/* Input */}
      {phase !== 'ended' && (
        <ChatInput
          value={input}
          onChangeText={setInput}
          onSend={handleSend}
          placeholder={placeholderText}
          disabled={inputDisabled}
          sendDisabled={!input.trim() || inputDisabled || typing}
        />
      )}

      {/* History Bottom Sheet */}
      <HistoryBottomSheet ref={bottomSheetRef} onLoadChat={handleLoadChatFromHistory} />
    </SafeAreaView>
  );
}
