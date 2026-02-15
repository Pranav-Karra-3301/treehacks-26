import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { ChevronDown } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors, fonts } from '../../lib/theme';

type Props = {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

export default function ExpandableSection({
  icon: Icon,
  title,
  children,
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
    maxHeight: height.value * 800,
    marginTop: height.value * 10,
    overflow: 'hidden' as const,
  }));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    rotation.value = withTiming(next ? 180 : 0, { duration: 200 });
    height.value = withTiming(next ? 1 : 0, { duration: 200 });
  };

  return (
    <View>
      <Pressable
        onPress={toggle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 4,
        }}
      >
        <Icon size={12} color={colors.gray400} />
        <Text
          style={{
            fontFamily: fonts.semibold,
            fontSize: 11,
            color: colors.gray400,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            flex: 1,
          }}
        >
          {title}
        </Text>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={14} color={colors.gray300} />
        </Animated.View>
      </Pressable>
      <Animated.View style={contentStyle}>
        <View>{children}</View>
      </Animated.View>
    </View>
  );
}
