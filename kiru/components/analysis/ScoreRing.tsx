import { View, Text } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  FadeIn,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { colors, fonts } from '../../lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getGradientColors(score: number): [string, string] {
  if (score >= 70) return [colors.emerald400, colors.emerald500];
  if (score >= 40) return [colors.amber400, colors.amber500];
  return [colors.red400, colors.red500];
}

export default function ScoreRing({ score }: { score: number }) {
  const progress = useSharedValue(0);
  const [c1, c2] = getGradientColors(score);

  useEffect(() => {
    progress.value = withTiming(Math.min(score, 100) / 100, { duration: 1200 });
  }, [score, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  return (
    <View style={{ width: 88, height: 88 }}>
      <Svg viewBox="0 0 88 88" width={88} height={88} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <LinearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={c1} />
            <Stop offset="100%" stopColor={c2} />
          </LinearGradient>
        </Defs>
        <Circle cx={44} cy={44} r={RADIUS} fill="none" stroke={colors.gray100} strokeWidth={5} />
        <AnimatedCircle
          cx={44}
          cy={44}
          r={RADIUS}
          fill="none"
          stroke="url(#scoreGrad)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE}`}
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.Text
          entering={FadeIn.delay(500).duration(400)}
          style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.gray900, lineHeight: 24 }}
        >
          {score}
        </Animated.Text>
        <Text
          style={{
            fontFamily: fonts.medium,
            fontSize: 9,
            color: colors.gray400,
            textTransform: 'uppercase',
            letterSpacing: 1,
            marginTop: 2,
          }}
        >
          score
        </Text>
      </View>
    </View>
  );
}
