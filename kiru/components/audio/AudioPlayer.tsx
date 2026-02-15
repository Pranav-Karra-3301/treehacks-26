import { View, Text, Pressable } from 'react-native';
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
      <View
        style={{
          borderRadius: 16,
          backgroundColor: colors.white,
          borderWidth: 0.5,
          borderColor: 'rgba(0,0,0,0.06)',
          paddingHorizontal: 18,
          paddingVertical: 16,
          ...shadows.soft,
        }}
      >
        <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.gray400 }}>
          Recording unavailable
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        borderRadius: 16,
        backgroundColor: colors.white,
        borderWidth: 0.5,
        borderColor: 'rgba(0,0,0,0.06)',
        paddingHorizontal: 16,
        paddingVertical: 14,
        ...shadows.soft,
      }}
    >
      {/* Play button + slider row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            togglePlay();
          }}
          style={({ pressed }) => ({
            height: 42,
            width: 42,
            borderRadius: 21,
            backgroundColor: colors.gray950,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          {playing ? (
            <Pause size={15} color="#fff" />
          ) : (
            <Play size={15} color="#fff" style={{ marginLeft: 2 }} />
          )}
        </Pressable>

        <View style={{ flex: 1 }}>
          <Slider
            value={position}
            minimumValue={0}
            maximumValue={duration || 1}
            onSlidingComplete={seek}
            minimumTrackTintColor={colors.gray900}
            maximumTrackTintColor={colors.gray200}
            thumbTintColor={colors.gray900}
            style={{ height: 28 }}
          />
        </View>
      </View>

      {/* Time labels + recording label */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 8,
          paddingLeft: 56,
        }}
      >
        <Text
          style={{
            fontFamily: fonts.regular,
            fontSize: 11,
            color: colors.gray400,
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatTime(position)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Volume2 size={11} color={colors.gray400} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: colors.gray400 }}>
            Call Recording
          </Text>
        </View>
        <Text
          style={{
            fontFamily: fonts.regular,
            fontSize: 11,
            color: colors.gray400,
            fontVariant: ['tabular-nums'],
          }}
        >
          {duration > 0 ? formatTime(duration) : '--:--'}
        </Text>
      </View>
    </View>
  );
}
