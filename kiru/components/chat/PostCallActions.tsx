import { View, Text, Pressable } from 'react-native';
import { Phone, RotateCcw } from 'lucide-react-native';
import { colors, fonts } from '../../lib/theme';
import * as Haptics from 'expo-haptics';

type Props = {
  canCallAgain: boolean;
  onCallAgain: () => void;
  onNewNegotiation: () => void;
};

export default function PostCallActions({ canCallAgain, onCallAgain, onNewNegotiation }: Props) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
        paddingTop: 12,
        paddingBottom: 32,
      }}
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
          }}
        >
          <Phone size={13} color={colors.gray700} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.gray700 }}>
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
        }}
      >
        <RotateCcw size={13} color="#fff" />
        <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: '#fff' }}>
          New negotiation
        </Text>
      </Pressable>
    </View>
  );
}
