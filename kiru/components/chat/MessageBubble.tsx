import { View, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Phone } from 'lucide-react-native';
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
      <Animated.View entering={entering} className="flex-row justify-center py-1.5">
        <View
          className="flex-row items-center gap-1.5 rounded-full bg-white/80 border border-gray-200/50 px-3 py-1"
          style={shadows.soft}
        >
          <Phone size={9} color={colors.gray400} />
          <Text
            className="text-gray-500"
            style={{ fontFamily: fonts.medium, fontSize: 11 }}
          >
            {message.text}
          </Text>
        </View>
      </Animated.View>
    );
  }

  if (message.role === 'user') {
    return (
      <Animated.View entering={entering} className="flex-row justify-end">
        <View
          className="max-w-[75%] rounded-2xl rounded-tr-md bg-gray-900 px-4 py-2.5"
          style={shadows.card}
        >
          <Text
            className="text-white leading-relaxed"
            style={{ fontFamily: fonts.regular, fontSize: 14 }}
          >
            {message.text}
          </Text>
        </View>
      </Animated.View>
    );
  }

  // AI message
  return (
    <Animated.View entering={entering} className="flex-row justify-start items-start gap-2.5">
      <View
        className="h-7 w-7 rounded-full bg-gray-900 items-center justify-center mt-0.5"
        style={shadows.soft}
      >
        <Text
          className="text-gray-300"
          style={{ fontFamily: fonts.serifItalic, fontSize: 10 }}
        >
          k
        </Text>
      </View>
      <View
        className="max-w-[75%] rounded-2xl rounded-tl-md bg-white border border-gray-100 px-4 py-2.5"
        style={shadows.soft}
      >
        <Text
          className="text-gray-900 leading-relaxed"
          style={{ fontFamily: fonts.regular, fontSize: 14 }}
        >
          {message.text}
        </Text>
      </View>
    </Animated.View>
  );
}
