import { View, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Message } from '../../hooks/useChatMachine';
import type { BusinessResult } from '../../lib/types';
import { colors, fonts, shadows } from '../../lib/theme';
import AnalysisCard from '../analysis/AnalysisCard';
import AudioPlayer from '../audio/AudioPlayer';
import SearchResultCards from '../search/SearchResultCards';

type Props = {
  message: Message;
  onCall?: (result: BusinessResult, phone: string) => void;
  onSkip?: () => void;
};

export default function MessageBubble({ message, onCall, onSkip }: Props) {
  const entering = FadeInDown.duration(300).springify().damping(20).stiffness(200);

  if (message.role === 'analysis' && message.analysisData) {
    return (
      <Animated.View entering={entering}>
        <AnalysisCard analysis={message.analysisData} />
      </Animated.View>
    );
  }

  if (message.role === 'audio' && message.audioTaskId) {
    return (
      <Animated.View entering={entering}>
        <AudioPlayer taskId={message.audioTaskId} />
      </Animated.View>
    );
  }

  if (message.role === 'search-results' && message.searchResults) {
    return (
      <Animated.View entering={entering} className="py-1">
        <SearchResultCards
          results={message.searchResults}
          onCall={onCall ?? (() => {})}
          onSkip={onSkip ?? (() => {})}
        />
      </Animated.View>
    );
  }

  if (message.role === 'status') {
    return (
      <Animated.View entering={entering} style={{ alignItems: 'center', paddingVertical: 4 }}>
        <Text
          style={{
            fontFamily: fonts.regular,
            fontSize: 12,
            color: colors.gray400,
            textAlign: 'center',
          }}
        >
          {message.text}
        </Text>
      </Animated.View>
    );
  }

  if (message.role === 'user') {
    return (
      <Animated.View entering={entering} style={{ paddingLeft: 48, alignItems: 'flex-end' }}>
        <View
          style={{
            backgroundColor: colors.gray900,
            borderRadius: 20,
            borderBottomRightRadius: 6,
            paddingHorizontal: 16,
            paddingVertical: 12,
            ...shadows.soft,
          }}
        >
          <Text
            style={{
              fontFamily: fonts.regular,
              fontSize: 15,
              lineHeight: 21,
              color: '#fff',
            }}
          >
            {message.text}
          </Text>
        </View>
      </Animated.View>
    );
  }

  // AI message
  return (
    <Animated.View entering={entering} style={{ paddingRight: 48 }}>
      <View
        style={{
          backgroundColor: colors.white,
          borderRadius: 20,
          borderBottomLeftRadius: 6,
          borderWidth: 0.5,
          borderColor: 'rgba(0,0,0,0.04)',
          paddingHorizontal: 16,
          paddingVertical: 12,
          ...shadows.soft,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.regular,
            fontSize: 15,
            lineHeight: 21,
            color: colors.gray900,
          }}
        >
          {message.text}
        </Text>
      </View>
    </Animated.View>
  );
}
