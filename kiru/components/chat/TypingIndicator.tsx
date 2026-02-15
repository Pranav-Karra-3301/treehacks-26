import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { colors, shadows } from '../../lib/theme';

function BounceDot({ index }: { index: number }) {
  const scale = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withDelay(
      index * 160,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 350 }),
          withTiming(0.4, { duration: 350 }),
        ),
        -1,
        false,
      ),
    );
  }, [index, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.gray300,
        },
        animStyle,
      ]}
    />
  );
}

export default function TypingIndicator() {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={{ paddingRight: 48 }}
    >
      <View
        style={{
          backgroundColor: colors.white,
          borderRadius: 20,
          borderBottomLeftRadius: 6,
          borderWidth: 0.5,
          borderColor: 'rgba(0,0,0,0.04)',
          paddingHorizontal: 16,
          paddingVertical: 14,
          alignSelf: 'flex-start',
          ...shadows.soft,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <BounceDot key={i} index={i} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}
