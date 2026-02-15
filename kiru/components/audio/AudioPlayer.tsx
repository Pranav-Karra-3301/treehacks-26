import { View, Text, Pressable } from 'react-native';
import Slider from '@react-native-community/slider';
import { Play, Pause, Volume2 } from 'lucide-react-native';
import { getAudioUrl } from '../../lib/api';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { colors, fonts } from '../../lib/theme';
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
          borderRadius: 12,
          backgroundColor: colors.gray50,
          borderWidth: 0.5,
          borderColor: 'rgba(0,0,0,0.06)',
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.gray400 }}>
          Recording unavailable
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        borderRadius: 12,
        backgroundColor: colors.gray50,
        borderWidth: 0.5,
        borderColor: 'rgba(0,0,0,0.06)',
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          togglePlay();
        }}
        style={{
          height: 36,
          width: 36,
          borderRadius: 18,
          backgroundColor: colors.gray900,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {playing ? (
          <Pause size={14} color="#fff" />
        ) : (
          <Play size={14} color="#fff" style={{ marginLeft: 2 }} />
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
          style={{ height: 24 }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
          <Text style={{ fontFamily: fonts.regular, fontSize: 10, color: colors.gray400, fontVariant: ['tabular-nums'] }}>
            {formatTime(position)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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
    </View>
  );
}
