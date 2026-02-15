import { memo } from 'react';
import { View, Text } from 'react-native';
import type { Message } from '../../hooks/useChatMachine';
import type { BusinessResult } from '../../lib/types';
import { colors, fonts } from '../../lib/theme';
import AnalysisCard from '../analysis/AnalysisCard';
import AudioPlayer from '../audio/AudioPlayer';
import SearchResultCards from '../search/SearchResultCards';
import TypewriterText from './TypewriterText';

type Props = {
  message: Message;
  onCall?: (result: BusinessResult, phone: string) => void;
  onSkip?: () => void;
};

export default memo(function MessageBubble({ message, onCall, onSkip }: Props) {
  if (message.role === 'analysis' && message.analysisData) {
    return <AnalysisCard analysis={message.analysisData} />;
  }

  if (message.role === 'audio' && message.audioTaskId) {
    return <AudioPlayer taskId={message.audioTaskId} />;
  }

  if (message.role === 'search-results' && message.searchResults) {
    return (
      <View style={{ paddingVertical: 4 }}>
        <SearchResultCards
          results={message.searchResults}
          onCall={onCall ?? (() => {})}
          onSkip={onSkip ?? (() => {})}
        />
      </View>
    );
  }

  if (message.role === 'status') {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 4 }}>
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
      </View>
    );
  }

  if (message.role === 'user') {
    return (
      <View style={{ paddingLeft: 56, alignItems: 'flex-end' }}>
        <View
          style={{
            backgroundColor: colors.gray900,
            borderRadius: 18,
            borderBottomRightRadius: 4,
            paddingHorizontal: 14,
            paddingVertical: 10,
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
      </View>
    );
  }

  // AI message
  return (
    <View style={{ paddingRight: 56 }}>
      <View
        style={{
          backgroundColor: colors.white,
          borderRadius: 18,
          borderBottomLeftRadius: 4,
          borderWidth: 0.5,
          borderColor: 'rgba(0,0,0,0.06)',
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <TypewriterText
          text={message.text}
          animate={message.animate !== false}
          style={{
            fontFamily: fonts.regular,
            fontSize: 15,
            lineHeight: 21,
            color: colors.gray900,
          }}
        />
      </View>
    </View>
  );
});
