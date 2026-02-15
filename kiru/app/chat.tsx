import { useState, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Menu, SquarePen } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useChatMachine } from '../hooks/useChatMachine';
import { useVoiceReadiness } from '../hooks/useVoiceReadiness';
import { colors, fonts } from '../lib/theme';

import MessageList from '../components/chat/MessageList';
import ChatInput from '../components/chat/ChatInput';
import PostCallActions from '../components/chat/PostCallActions';
import ReadinessBanner from '../components/chat/ReadinessBanner';
import Sidebar from '../components/history/Sidebar';

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
    pastTasks,
    pastTasksLoading,
    refreshPastTasks,
    handleSend,
    handleEndCall,
    handleNewNegotiation,
    handleCallFromSearch,
    handleSkipDiscovery,
    handleCallAgain,
    loadPastChat,
  } = useChatMachine();

  const readinessWarning = useVoiceReadiness();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    refreshPastTasks();
    setSidebarOpen(true);
  }, [refreshPastTasks]);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  const handleLoadChatFromHistory = useCallback(
    (taskId: string) => {
      loadPastChat(taskId);
    },
    [loadPastChat],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 10,
          backgroundColor: colors.bg,
          borderBottomWidth: 0.5,
          borderBottomColor: 'rgba(0,0,0,0.06)',
        }}
      >
        {/* Left: sidebar toggle */}
        <Pressable
          onPress={openSidebar}
          style={{ height: 44, width: 44, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={4}
        >
          <Menu size={20} color={colors.gray500} />
        </Pressable>

        {/* Center: branding */}
        <Text style={{ fontFamily: fonts.serifItalic, fontSize: 20, color: colors.gray950, letterSpacing: -0.5 }}>
          kiru
        </Text>

        {/* Right: context action */}
        {isOnCall ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.emerald500 }} />
              <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: colors.emerald600 }}>
                Live
              </Text>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handleEndCall();
              }}
              style={{
                borderRadius: 99,
                backgroundColor: colors.red50,
                paddingHorizontal: 12,
                paddingVertical: 6,
              }}
            >
              <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.red600 }}>
                End call
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleNewNegotiation();
            }}
            style={{ height: 44, width: 44, alignItems: 'center', justifyContent: 'center' }}
            hitSlop={4}
          >
            <SquarePen size={18} color={colors.gray400} />
          </Pressable>
        )}
      </View>

      {/* Readiness banner */}
      {readinessWarning && <ReadinessBanner warning={readinessWarning} />}

      {/* Messages */}
      <View style={{ flex: 1 }}>
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

      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={closeSidebar}
        tasks={pastTasks}
        loading={pastTasksLoading}
        onSelectTask={handleLoadChatFromHistory}
      />
    </SafeAreaView>
  );
}
