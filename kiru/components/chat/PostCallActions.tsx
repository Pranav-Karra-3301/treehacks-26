import { View, Text, Pressable } from 'react-native';
import { Phone, Plus } from 'lucide-react-native';
import { colors, fonts, shadows } from '../../lib/theme';
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
        gap: 12,
        paddingTop: 16,
        paddingBottom: 32,
      }}
    >
      {canCallAgain && (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onCallAgain();
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderRadius: 99,
            borderWidth: 1,
            borderColor: colors.gray200,
            backgroundColor: colors.white,
            paddingHorizontal: 20,
            paddingVertical: 11,
            opacity: pressed ? 0.7 : 1,
            ...shadows.soft,
          })}
        >
          <Phone size={13} color={colors.gray700} strokeWidth={2} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.gray700 }}>
            Call again
          </Text>
        </Pressable>
      )}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onNewNegotiation();
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          borderRadius: 99,
          backgroundColor: colors.gray950,
          paddingHorizontal: 20,
          paddingVertical: 11,
          opacity: pressed ? 0.8 : 1,
          ...shadows.card,
        })}
      >
        <Plus size={14} color="#fff" strokeWidth={2.5} />
        <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: '#fff' }}>
          New negotiation
        </Text>
      </Pressable>
    </View>
  );
}
