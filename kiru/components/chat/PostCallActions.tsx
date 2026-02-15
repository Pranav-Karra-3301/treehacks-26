import { View, Text, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Phone, RotateCcw } from 'lucide-react-native';
import { colors, fonts, shadows } from '../../lib/theme';
import * as Haptics from 'expo-haptics';

type Props = {
  canCallAgain: boolean;
  onCallAgain: () => void;
  onNewNegotiation: () => void;
};

export default function PostCallActions({ canCallAgain, onCallAgain, onNewNegotiation }: Props) {
  return (
    <Animated.View
      entering={FadeInDown.delay(200).duration(400)}
      className="flex-row justify-center gap-2.5 pt-3 pb-4"
    >
      {canCallAgain && (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onCallAgain();
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderRadius: 99,
            borderWidth: 1,
            borderColor: colors.gray200,
            backgroundColor: colors.white,
            paddingHorizontal: 20,
            paddingVertical: 10,
            ...shadows.soft,
          }}
        >
          <Phone size={13} color={colors.gray700} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 12.5, color: colors.gray700 }}>
            Call again
          </Text>
        </Pressable>
      )}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onNewNegotiation();
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderRadius: 99,
          backgroundColor: colors.gray900,
          paddingHorizontal: 20,
          paddingVertical: 10,
          ...shadows.soft,
        }}
      >
        <RotateCcw size={13} color="#fff" />
        <Text style={{ fontFamily: fonts.medium, fontSize: 12.5, color: '#fff' }}>
          New negotiation
        </Text>
      </Pressable>
    </Animated.View>
  );
}
