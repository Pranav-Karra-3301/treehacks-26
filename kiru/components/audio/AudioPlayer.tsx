import { View, Text, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Slider from '@react-native-community/slider';
import { Play, Pause, Volume2 } from 'lucide-react-native';
import { getAudioUrl } from '../../lib/api';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { colors, fonts, shadows } from '../../lib/theme';
import * as Haptics from 'expo-haptics';

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({ taskId }: { taskId: string }) {
  const src = getAudioUrl(taskId, 'mixed');
  const { playing, duration, position, error, togglePlay, seek } = useAudioPlayer(src);

  if (error) {
    return (
      <View className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-2.5">
        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.gray400 }}>
          Recording unavailable
        </Text>
      </View>
    );
  }

  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5 flex-row items-center gap-3"
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          togglePlay();
        }}
        className="h-8 w-8 rounded-full bg-gray-900 items-center justify-center"
        style={shadows.soft}
      >
        {playing ? (
          <Pause size={13} color="#fff" />
        ) : (
          <Play size={13} color="#fff" style={{ marginLeft: 2 }} />
        )}
      </Pressable>

      <View className="flex-1">
        <Slider
          value={position}
          minimumValue={0}
          maximumValue={duration || 1}
          onSlidingComplete={seek}
          minimumTrackTintColor={colors.gray900}
          maximumTrackTintColor={colors.gray200}
          thumbTintColor={colors.gray900}
          style={{ height: 20 }}
        />
        <View className="flex-row items-center justify-between mt-0.5">
          <Text style={{ fontFamily: fonts.regular, fontSize: 10, color: colors.gray400, fontVariant: ['tabular-nums'] }}>
            {formatTime(position)}
          </Text>
          <View className="flex-row items-center gap-1">
            <Volume2 size={10} color={colors.gray400} />
            <Text style={{ fontFamily: fonts.medium, fontSize: 10, color: colors.gray400 }}>
              Call Recording
            </Text>
          </View>
          <Text style={{ fontFamily: fonts.regular, fontSize: 10, color: colors.gray400, fontVariant: ['tabular-nums'] }}>
            {duration > 0 ? formatTime(duration) : '--:--'}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}
