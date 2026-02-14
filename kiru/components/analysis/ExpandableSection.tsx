import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeInDown,
} from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, fonts } from '../../lib/theme';

type Props = {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  delay?: number;
  defaultOpen?: boolean;
};

export default function ExpandableSection({
  icon: Icon,
  title,
  children,
  delay = 0,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const rotation = useSharedValue(defaultOpen ? 180 : 0);
  const height = useSharedValue(defaultOpen ? 1 : 0);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: height.value,
    maxHeight: height.value * 500,
    overflow: 'hidden' as const,
  }));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    rotation.value = withTiming(next ? 180 : 0, { duration: 200 });
    height.value = withTiming(next ? 1 : 0, { duration: 250 });
  };

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(300)}>
      <Pressable onPress={toggle} className="flex-row items-center gap-1.5">
        <Icon size={12} color={colors.gray400} />
        <Text
          style={{
            fontFamily: fonts.semibold,
            fontSize: 11,
            color: colors.gray400,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {title}
        </Text>
        <View className="flex-1" />
        <Animated.View style={chevronStyle}>
          <ChevronDown size={12} color={colors.gray300} />
        </Animated.View>
      </Pressable>
      <Animated.View style={contentStyle}>
        <View className="pt-2">{children}</View>
      </Animated.View>
    </Animated.View>
  );
}
