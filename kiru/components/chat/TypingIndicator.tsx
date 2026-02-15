import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { colors, shadows } from '../../lib/theme';

function BounceDot({ index }: { index: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      index * 200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 }),
        ),
        -1,
        false,
      ),
    );
  }, [index, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.gray400,
        },
        animStyle,
      ]}
    />
  );
}

export default function TypingIndicator() {
  return (
    <View style={{ paddingRight: 56 }}>
      <View
        style={{
          backgroundColor: colors.white,
          borderRadius: 20,
          borderBottomLeftRadius: 6,
          borderWidth: 0.5,
          borderColor: 'rgba(0,0,0,0.06)',
          paddingHorizontal: 16,
          paddingVertical: 14,
          alignSelf: 'flex-start',
          ...shadows.soft,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {[0, 1, 2].map((i) => (
            <BounceDot key={i} index={i} />
          ))}
        </View>
      </View>
    </View>
  );
}
