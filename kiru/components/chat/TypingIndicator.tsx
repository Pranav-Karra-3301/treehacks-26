import { View, Text } from 'react-native';
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
import { colors, fonts, shadows } from '../../lib/theme';

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
      className="flex-row justify-start items-start gap-2.5"
    >
      <View
        className="h-7 w-7 rounded-full bg-gray-900 items-center justify-center mt-0.5"
        style={shadows.soft}
      >
        <Text style={{ fontFamily: fonts.serifItalic, fontSize: 10, color: colors.gray300 }}>
          k
        </Text>
      </View>
      <View
        className="rounded-2xl rounded-tl-md bg-white border border-gray-100 px-4 py-3"
        style={shadows.soft}
      >
        <View className="flex-row items-center gap-1">
          {[0, 1, 2].map((i) => (
            <BounceDot key={i} index={i} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}
